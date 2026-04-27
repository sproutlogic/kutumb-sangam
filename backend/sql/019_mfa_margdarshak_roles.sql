-- 019: rename pandit→margdarshak, add office/finance roles, MFA approval tables

-- ── 1. Role constraint ──────────────────────────────────────────────────────────
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
    ADD CONSTRAINT users_role_check
    CHECK (role IN (
        'user', 'margdarshak', 'admin', 'superadmin',
        'np', 'zp', 'rp', 'cp', 'se',
        'office', 'finance'
    ));

-- Migrate existing pandit rows
UPDATE public.users SET role = 'margdarshak' WHERE role = 'pandit';

-- ── 2. SE onboarding MFA approval (3 steps: office → finance → admin) ──────────
CREATE TABLE IF NOT EXISTS public.onboarding_approvals (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  UUID        NOT NULL REFERENCES public.se_applications(id) ON DELETE CASCADE,
    step            SMALLINT    NOT NULL CHECK (step IN (1, 2, 3)),
    step_role       TEXT        NOT NULL CHECK (step_role IN ('office', 'finance', 'admin')),
    status          TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by     UUID        REFERENCES public.users(id),
    reviewed_at     TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (application_id, step)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_approvals_application
    ON public.onboarding_approvals(application_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_approvals_status
    ON public.onboarding_approvals(status);

-- ── 3. Transactions table (payin / payout) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type        TEXT        NOT NULL CHECK (type IN ('payin', 'payout')),
    amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    description TEXT,
    reference   TEXT,
    status      TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN (
                                'pending', 'office_approved', 'finance_approved',
                                'admin_approved', 'released', 'rejected'
                            )),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON public.transactions;
CREATE TRIGGER trg_transactions_updated_at
    BEFORE UPDATE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status  ON public.transactions(status);

-- ── 4. Transaction MFA approval (4 steps: office → finance → admin → superadmin) ─
CREATE TABLE IF NOT EXISTS public.transaction_approvals (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id  UUID        NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    step            SMALLINT    NOT NULL CHECK (step IN (1, 2, 3, 4)),
    step_role       TEXT        NOT NULL CHECK (step_role IN ('office', 'finance', 'admin', 'superadmin')),
    status          TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by     UUID        REFERENCES public.users(id),
    reviewed_at     TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (transaction_id, step)
);

CREATE INDEX IF NOT EXISTS idx_txn_approvals_transaction
    ON public.transaction_approvals(transaction_id);
CREATE INDEX IF NOT EXISTS idx_txn_approvals_status
    ON public.transaction_approvals(status);
