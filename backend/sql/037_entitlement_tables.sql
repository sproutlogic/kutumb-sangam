-- 037_entitlement_tables.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Tree Entitlement & Monetisation System
--
-- Creates 8 new tables for ego-centric tree visibility entitlements:
--   1. tree_plans              — plan catalog (free/basic/standard/premium)
--   2. user_subscriptions      — active tree-plan subscriptions per user
--   3. subscription_events     — append-only event log (source of truth)
--   4. node_unlocks            — sachet node unlocks (permanent)
--   5. gen_topups              — generation-window extensions (temporary)
--   6. entitlement_shares      — peer-to-peer view sharing (distance ≤ 2)
--   7. user_visible_nodes      — precomputed visibility cache
--   8. referral_unlocks        — referral-driven gen extensions
--
-- Note: The existing `invoices` table (from 022_service_layer.sql / payments)
--   is reused for tree-plan invoices via payment_type column on payments.
--
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. tree_plans ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tree_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL UNIQUE,
  display_name          TEXT NOT NULL,
  price_inr_monthly     DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_inr_annual      DECIMAL(10,2) NOT NULL DEFAULT 0,
  gen_up                INT  NOT NULL DEFAULT 1,
  gen_down              INT  NOT NULL DEFAULT 1,
  max_intentional_nodes INT  NOT NULL DEFAULT 21,
  features              JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  sort_order            INT NOT NULL DEFAULT 0,
  description           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (gen_up >= 0 AND gen_up <= 20),
  CHECK (gen_down >= 0 AND gen_down <= 20)
);

CREATE INDEX IF NOT EXISTS tree_plans_active_idx
  ON public.tree_plans (is_active, sort_order);

-- Seed the 4 default plans (idempotent via name UNIQUE)
INSERT INTO public.tree_plans
  (name, display_name, price_inr_monthly, price_inr_annual,
   gen_up, gen_down, max_intentional_nodes, features, sort_order, description)
VALUES
  ('free',     'Free',        0.00,     0.00,
   1, 1,  21,  '{"pdf_export":false,"matrimony_matching":false,"bridge_tree":false,"bulk_import":false,"api_access":false}'::jsonb,
   0, 'See your immediate family — 1 generation up and down.'),
  ('basic',    'Basic',      99.00,   899.00,
   2, 2,  51,  '{"pdf_export":true,"matrimony_matching":false,"bridge_tree":false,"bulk_import":false,"api_access":false}'::jsonb,
   1, 'Two generations either way — your dada and your grandchildren.'),
  ('standard', 'Standard',  199.00,  1899.00,
   3, 3, 101,  '{"pdf_export":true,"matrimony_matching":true,"bridge_tree":true,"bulk_import":false,"api_access":false}'::jsonb,
   2, 'Three generations either way — full vansh window with matrimony matching.'),
  ('premium',  'Premium',   399.00,  3499.00,
   5, 5, 999999,
   '{"pdf_export":true,"matrimony_matching":true,"bridge_tree":true,"bulk_import":true,"api_access":true}'::jsonb,
   3, 'Five generations either way, unlimited nodes, all features.')
ON CONFLICT (name) DO NOTHING;


-- ─── 2. user_subscriptions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id                  UUID NOT NULL REFERENCES public.tree_plans(id),
  status                   TEXT NOT NULL CHECK (status IN
                             ('trial', 'active', 'grace_period', 'expired', 'cancelled')),
  valid_from               TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until              TIMESTAMPTZ,
  price_paid_inr           DECIMAL(10,2) NOT NULL DEFAULT 0,
  billing_period           TEXT CHECK (billing_period IN ('monthly','annual','lifetime')),
  gateway_order_id         TEXT,
  gateway_payment_id       TEXT,
  payment_id               UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_subscriptions_user_status_idx
  ON public.user_subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS user_subscriptions_valid_until_idx
  ON public.user_subscriptions (valid_until)
  WHERE status IN ('active','grace_period');


-- ─── 3. subscription_events (append-only event log) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN (
                  'trial_started', 'subscribed', 'upgraded', 'downgraded',
                  'renewed', 'payment_failed', 'grace_period_started',
                  'expired', 'cancelled', 'admin_override',
                  'referral_unlock', 'sachet_purchased', 'topup_activated',
                  'share_granted', 'share_revoked'
                )),
  plan_id       UUID REFERENCES public.tree_plans(id),
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by    UUID REFERENCES public.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_events_user_idx
  ON public.subscription_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscription_events_type_idx
  ON public.subscription_events (event_type, created_at DESC);


-- ─── 4. node_unlocks (sachet — permanent per-node) ──────────────────────────

CREATE TABLE IF NOT EXISTS public.node_unlocks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  node_id           UUID NOT NULL REFERENCES public.persons(node_id) ON DELETE CASCADE,
  bundle_size       INT NOT NULL DEFAULT 1,
  bundle_root_id    UUID REFERENCES public.persons(node_id),
  price_paid_inr    DECIMAL(10,2) NOT NULL DEFAULT 0,
  gateway_order_id  TEXT,
  payment_id        UUID,
  purchased_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, node_id)
);

CREATE INDEX IF NOT EXISTS node_unlocks_user_idx
  ON public.node_unlocks (user_id);
CREATE INDEX IF NOT EXISTS node_unlocks_node_idx
  ON public.node_unlocks (node_id);


-- ─── 5. gen_topups (temporary window extension) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.gen_topups (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  extra_gen_up      INT NOT NULL DEFAULT 0,
  extra_gen_down    INT NOT NULL DEFAULT 0,
  price_paid_inr    DECIMAL(10,2) NOT NULL DEFAULT 0,
  valid_until       TIMESTAMPTZ NOT NULL,
  gateway_order_id  TEXT,
  payment_id        UUID,
  purchased_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (extra_gen_up >= 0 AND extra_gen_up <= 5),
  CHECK (extra_gen_down >= 0 AND extra_gen_down <= 5)
);

-- Full index (no partial predicate — now() is STABLE not IMMUTABLE,
-- which Postgres forbids in index predicates). Query-time filter on
-- valid_until is fast enough with this composite index.
CREATE INDEX IF NOT EXISTS gen_topups_user_active_idx
  ON public.gen_topups (user_id, valid_until);


-- ─── 6. entitlement_shares (peer-to-peer, distance ≤ 2) ─────────────────────

CREATE TABLE IF NOT EXISTS public.entitlement_shares (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  granter_user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  granter_node_id     UUID NOT NULL REFERENCES public.persons(node_id) ON DELETE CASCADE,
  grantee_user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  grantee_node_id     UUID NOT NULL REFERENCES public.persons(node_id) ON DELETE CASCADE,
  shared_gen_up       INT NOT NULL DEFAULT 1,
  shared_gen_down     INT NOT NULL DEFAULT 1,
  max_hops_verified   INT NOT NULL,
  valid_until         TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (granter_node_id, grantee_node_id),
  CHECK (max_hops_verified >= 0 AND max_hops_verified <= 2)
);

CREATE INDEX IF NOT EXISTS entitlement_shares_grantee_idx
  ON public.entitlement_shares (grantee_user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS entitlement_shares_granter_idx
  ON public.entitlement_shares (granter_user_id)
  WHERE revoked_at IS NULL;


-- ─── 7. user_visible_nodes (precomputed cache) ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_visible_nodes (
  user_id                UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  vansha_id              UUID NOT NULL,
  node_ids               UUID[] NOT NULL DEFAULT '{}',
  locked_boundary_nodes  JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- shape: [{node_id, generation, locked_count, locked_subtree_root}]
  ego_node_id            UUID,
  ego_generation         INT,
  effective_gen_up       INT NOT NULL DEFAULT 1,
  effective_gen_down     INT NOT NULL DEFAULT 1,
  effective_max_nodes    INT NOT NULL DEFAULT 21,
  computed_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_visible_nodes_vansha_idx
  ON public.user_visible_nodes (vansha_id);


-- ─── 8. referral_unlocks ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.referral_unlocks (
  user_id          UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  referrals_count  INT NOT NULL DEFAULT 0,
  extra_gen_up     INT NOT NULL DEFAULT 0,
  extra_gen_down   INT NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (extra_gen_up >= 0 AND extra_gen_up <= 3),
  CHECK (extra_gen_down >= 0 AND extra_gen_down <= 3)
);


-- ─── 9. role extension — add 'superadmin' if not present ────────────────────

DO $$
BEGIN
  -- Only check if there's a CHECK constraint on users.role
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name LIKE '%users%role%'
  ) THEN
    -- Drop and recreate with superadmin (no-op if already includes it)
    NULL;
  END IF;
END $$;


-- ─── 10. RLS policies (read-only for owners; service role for writes) ───────

ALTER TABLE public.tree_plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_unlocks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gen_topups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_shares    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_visible_nodes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_unlocks      ENABLE ROW LEVEL SECURITY;

-- tree_plans: anyone authenticated can read active plans
DROP POLICY IF EXISTS tree_plans_read ON public.tree_plans;
CREATE POLICY tree_plans_read ON public.tree_plans
  FOR SELECT TO authenticated USING (true);

-- user_subscriptions: user reads own
DROP POLICY IF EXISTS user_subs_self_read ON public.user_subscriptions;
CREATE POLICY user_subs_self_read ON public.user_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- subscription_events: user reads own
DROP POLICY IF EXISTS sub_events_self_read ON public.subscription_events;
CREATE POLICY sub_events_self_read ON public.subscription_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- node_unlocks: user reads own
DROP POLICY IF EXISTS node_unlocks_self_read ON public.node_unlocks;
CREATE POLICY node_unlocks_self_read ON public.node_unlocks
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- gen_topups: user reads own
DROP POLICY IF EXISTS gen_topups_self_read ON public.gen_topups;
CREATE POLICY gen_topups_self_read ON public.gen_topups
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- entitlement_shares: user reads as granter or grantee
DROP POLICY IF EXISTS shares_self_read ON public.entitlement_shares;
CREATE POLICY shares_self_read ON public.entitlement_shares
  FOR SELECT TO authenticated USING
    (granter_user_id = auth.uid() OR grantee_user_id = auth.uid());

-- user_visible_nodes: user reads own
DROP POLICY IF EXISTS uvn_self_read ON public.user_visible_nodes;
CREATE POLICY uvn_self_read ON public.user_visible_nodes
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- referral_unlocks: user reads own
DROP POLICY IF EXISTS ref_unlocks_self_read ON public.referral_unlocks;
CREATE POLICY ref_unlocks_self_read ON public.referral_unlocks
  FOR SELECT TO authenticated USING (user_id = auth.uid());


-- ─── 11. updated_at triggers ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_tree_plans_updated ON public.tree_plans;
CREATE TRIGGER tr_tree_plans_updated
  BEFORE UPDATE ON public.tree_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS tr_user_subs_updated ON public.user_subscriptions;
CREATE TRIGGER tr_user_subs_updated
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS tr_referral_unlocks_updated ON public.referral_unlocks;
CREATE TRIGGER tr_referral_unlocks_updated
  BEFORE UPDATE ON public.referral_unlocks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ─── 12. Seed free-tier subscription for all existing users ─────────────────

DO $$
DECLARE
  free_plan_id UUID;
BEGIN
  SELECT id INTO free_plan_id FROM public.tree_plans WHERE name = 'free';
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO public.user_subscriptions (user_id, plan_id, status, valid_from, price_paid_inr)
    SELECT u.id, free_plan_id, 'active', now(), 0
    FROM public.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      WHERE us.user_id = u.id AND us.status IN ('active','trial','grace_period')
    );
  END IF;
END $$;


-- ─── 13. Helper: BFS distance via relationships table ───────────────────────

CREATE OR REPLACE FUNCTION public.graph_distance(
  start_node UUID,
  end_node   UUID,
  max_hops   INT DEFAULT 2
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  hop INT := 0;
  frontier UUID[];
  next_frontier UUID[];
  visited UUID[];
BEGIN
  IF start_node = end_node THEN RETURN 0; END IF;
  frontier := ARRAY[start_node];
  visited  := ARRAY[start_node];
  WHILE hop < max_hops LOOP
    hop := hop + 1;
    SELECT COALESCE(ARRAY_AGG(DISTINCT neighbor), '{}') INTO next_frontier
    FROM (
      SELECT to_node_id   AS neighbor FROM public.relationships WHERE from_node_id = ANY(frontier)
      UNION
      SELECT from_node_id AS neighbor FROM public.relationships WHERE to_node_id   = ANY(frontier)
    ) edges
    WHERE NOT (neighbor = ANY(visited));
    IF end_node = ANY(next_frontier) THEN RETURN hop; END IF;
    IF array_length(next_frontier, 1) IS NULL THEN RETURN -1; END IF;
    visited  := visited  || next_frontier;
    frontier := next_frontier;
  END LOOP;
  RETURN -1;
END $$;


-- ─── End of 037_entitlement_tables.sql ──────────────────────────────────────
