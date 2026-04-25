-- =============================================================================
-- 014_payment_infrastructure.sql
-- Complete payment infrastructure: orders, subscriptions, invoices,
-- refunds, saved payment methods, webhook event log.
--
-- Design principles:
--   • All monetary values stored in smallest unit (paise = 1/100 rupee).
--   • Tax stored per-invoice so historical records survive rate changes.
--   • Immutable audit columns (created_at never updated, paid_at set once).
--   • Service-role inserts; user-scoped SELECT via RLS.
--   • Gateway fields nullable — rows created before gateway is integrated.
-- =============================================================================

-- ─── Invoice number sequence ──────────────────────────────────────────────────
-- Produces monotonically increasing numbers; month prefix added in app layer.
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1 INCREMENT 1;

-- ─── 1. payments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Gateway identifiers (null until gateway integration is live)
  gateway               TEXT        NOT NULL DEFAULT 'manual'
                          CHECK (gateway IN ('razorpay', 'stripe', 'manual')),
  gateway_order_id      TEXT        UNIQUE,        -- gateway's order ID
  gateway_payment_id    TEXT        UNIQUE,        -- gateway's payment/charge ID
  gateway_signature     TEXT,                      -- HMAC signature for verification

  -- What was purchased
  payment_type          TEXT        NOT NULL
                          CHECK (payment_type IN ('subscription', 'addon', 'consultation', 'manual')),
  plan_id               TEXT,                      -- 'ankur'|'vriksh'|'vansh' for subscriptions
  description           TEXT        NOT NULL,

  -- Monetary values — all in PAISE (INR × 100)
  currency              TEXT        NOT NULL DEFAULT 'INR',
  base_amount_paise     INTEGER     NOT NULL CHECK (base_amount_paise >= 0),
  cgst_paise            INTEGER     NOT NULL DEFAULT 0 CHECK (cgst_paise >= 0),
  sgst_paise            INTEGER     NOT NULL DEFAULT 0 CHECK (sgst_paise >= 0),
  igst_paise            INTEGER     NOT NULL DEFAULT 0 CHECK (igst_paise >= 0),
  total_amount_paise    INTEGER     GENERATED ALWAYS AS (
                          base_amount_paise + cgst_paise + sgst_paise + igst_paise
                        ) STORED,

  -- Tax rates captured at time of payment (survive future rate changes)
  cgst_rate             NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  sgst_rate             NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  igst_rate             NUMERIC(5,2) NOT NULL DEFAULT 18.00,  -- default IGST

  -- Status lifecycle
  status                TEXT        NOT NULL DEFAULT 'created'
                          CHECK (status IN (
                            'created',           -- order placed, awaiting checkout
                            'pending',           -- checkout opened, not yet confirmed
                            'paid',              -- payment confirmed
                            'failed',            -- payment failed
                            'refunded',          -- fully refunded
                            'partially_refunded',-- partially refunded
                            'cancelled'          -- cancelled before payment
                          )),
  failure_reason        TEXT,

  -- Referral attribution
  referred_by_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Extra context (metadata, notes from admin, etc.)
  notes                 JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps (immutable once set)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at               TIMESTAMPTZ,
  failed_at             TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id    ON payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status     ON payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_gateway_oid ON payments (gateway_order_id) WHERE gateway_order_id IS NOT NULL;

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_own_select" ON payments FOR SELECT USING (user_id = auth.uid());

-- updated_at auto-stamp
CREATE OR REPLACE FUNCTION trg_fn_payments_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION trg_fn_payments_updated_at();

COMMENT ON TABLE  payments                    IS 'One row per payment attempt. Monetary values in paise (INR×100).';
COMMENT ON COLUMN payments.gateway_order_id   IS 'Razorpay/Stripe order ID. Null until gateway is wired.';
COMMENT ON COLUMN payments.igst_rate          IS 'IGST used when buyer and seller are in different states. Mutually exclusive with CGST+SGST.';
COMMENT ON COLUMN payments.total_amount_paise IS 'Generated: base + cgst + sgst + igst.';


-- ─── 2. subscriptions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_id        UUID        REFERENCES payments(id) ON DELETE SET NULL,

  plan_id           TEXT        NOT NULL,   -- 'beej'|'ankur'|'vriksh'|'vansh'
  status            TEXT        NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'expired', 'cancelled', 'pending')),

  -- Billing period
  starts_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at           TIMESTAMPTZ,            -- NULL for lifetime / free plans

  -- Cancellation
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT,
  cancelled_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Renewal chain
  auto_renew        BOOLEAN     NOT NULL DEFAULT false,
  renewed_from_id   UUID        REFERENCES subscriptions(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_ends_at     ON subscriptions (ends_at) WHERE status = 'active';

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_own_select" ON subscriptions FOR SELECT USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION trg_fn_subscriptions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION trg_fn_subscriptions_updated_at();

COMMENT ON TABLE subscriptions IS 'One row per subscription period. Renewals create a new row linked via renewed_from_id.';


-- ─── 3. invoices ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id        UUID        NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Human-readable invoice number: KM-INV-YYYYMM-NNNNN
  invoice_number    TEXT        UNIQUE NOT NULL,

  -- Line-item amounts in paise
  base_amount_paise INTEGER     NOT NULL CHECK (base_amount_paise >= 0),
  cgst_paise        INTEGER     NOT NULL DEFAULT 0,
  sgst_paise        INTEGER     NOT NULL DEFAULT 0,
  igst_paise        INTEGER     NOT NULL DEFAULT 0,
  total_paise       INTEGER     NOT NULL,

  -- Rates applied (snapshot at time of invoice)
  cgst_rate         NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  sgst_rate         NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  igst_rate         NUMERIC(5,2) NOT NULL DEFAULT 18.00,

  -- Billing details (captured once; never updated)
  billed_name       TEXT,
  billed_email      TEXT,
  billed_phone      TEXT,
  gstin             TEXT,        -- customer's GST registration number (B2B)

  -- Description line items
  line_items        JSONB       NOT NULL DEFAULT '[]'::jsonb,

  issued_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  pdf_url           TEXT        -- future: pre-rendered PDF in Supabase Storage
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id    ON invoices (user_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_id ON invoices (payment_id);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_own_select" ON invoices FOR SELECT USING (user_id = auth.uid());

COMMENT ON TABLE  invoices              IS 'Tax invoice issued on every confirmed payment. Immutable after creation.';
COMMENT ON COLUMN invoices.line_items   IS '[{"description":"Ankur Plan - Annual","amount_paise":99900,"qty":1}]';
COMMENT ON COLUMN invoices.gstin        IS 'Populated only for B2B customers who supply their GSTIN at checkout.';


-- ─── 4. refunds ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refunds (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id        UUID        NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Gateway refund reference
  gateway_refund_id TEXT        UNIQUE,     -- null until gateway processes it

  amount_paise      INTEGER     NOT NULL CHECK (amount_paise > 0),
  reason            TEXT        NOT NULL,
  notes             TEXT,

  status            TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  failure_reason    TEXT,

  -- Who initiated
  initiated_by      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refunds_payment_id ON refunds (payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_user_id    ON refunds (user_id, created_at DESC);

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refunds_own_select" ON refunds FOR SELECT USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION trg_fn_refunds_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_refunds_updated_at ON refunds;
CREATE TRIGGER trg_refunds_updated_at
  BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION trg_fn_refunds_updated_at();


-- ─── 5. payment_methods ──────────────────────────────────────────────────────
-- Stores ONLY gateway tokens — no raw card numbers ever.
CREATE TABLE IF NOT EXISTS payment_methods (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  gateway       TEXT    NOT NULL DEFAULT 'razorpay'
                  CHECK (gateway IN ('razorpay', 'stripe')),
  token         TEXT    NOT NULL,          -- opaque gateway token / customer_id
  method_type   TEXT    NOT NULL
                  CHECK (method_type IN ('card', 'upi', 'netbanking', 'wallet')),

  -- Non-sensitive display info
  display_name  TEXT,                      -- "HDFC Visa ···· 4242"
  brand         TEXT,                      -- 'visa' | 'mastercard' | 'rupay' | 'upi'
  last4         TEXT,                      -- last 4 digits of card (null for UPI)
  expiry_month  SMALLINT CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year   SMALLINT,
  upi_id        TEXT,                      -- masked: abc@···

  is_default    BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one default per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_default
  ON payment_methods (user_id) WHERE is_default = true AND is_active = true;

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_methods_own_select" ON payment_methods FOR SELECT USING (user_id = auth.uid());

COMMENT ON TABLE  payment_methods       IS 'Saved payment methods — only gateway tokens, never raw card data.';
COMMENT ON COLUMN payment_methods.token IS 'Razorpay customer_id or Stripe payment_method_id.';


-- ─── 6. webhook_events ───────────────────────────────────────────────────────
-- Append-only log of raw gateway webhook payloads for idempotency & debugging.
CREATE TABLE IF NOT EXISTS webhook_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  gateway          TEXT        NOT NULL DEFAULT 'razorpay',
  event_id         TEXT        UNIQUE,              -- gateway's dedup ID (X-Razorpay-Event-Id)
  event_type       TEXT        NOT NULL,            -- 'payment.captured', 'refund.created', …
  payload          JSONB       NOT NULL,            -- full raw body

  processed        BOOLEAN     NOT NULL DEFAULT false,
  processing_error TEXT,                            -- non-null if processing failed

  received_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_type       ON webhook_events (event_type, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed ON webhook_events (processed, received_at) WHERE processed = false;

COMMENT ON TABLE webhook_events IS 'Append-only log of gateway webhooks. Use event_id for idempotency.';
-- No RLS — admin/service-role access only.
