-- ── 011_samay_bank.sql ────────────────────────────────────────────────────────
-- Samay Bank: Kutumb Map integrated time-banking.
-- Replaces v1 time_bank_offers + time_bank_transactions tables.
-- Run AFTER 010_time_bank.sql.

-- Drop old v1 tables
DROP TABLE IF EXISTS public.time_bank_transactions CASCADE;
DROP TABLE IF EXISTS public.time_bank_offers        CASCADE;


-- ── Branches: kutumb groups OR standalone social-worker teams ─────────────────
CREATE TABLE IF NOT EXISTS public.samay_branches (
    id                          uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
    name                        text          NOT NULL,
    manager_id                  text          NOT NULL REFERENCES public.users(id),
    vansha_id                   text          UNIQUE,    -- set for kutumb; NULL for teams
    description                 text,
    is_private_ledger           boolean       NOT NULL DEFAULT false,
    requires_manager_approval   boolean       NOT NULL DEFAULT false,
    allow_global                boolean       NOT NULL DEFAULT true,
    negative_limit_hours        numeric(6,2)  NOT NULL DEFAULT 5,
    config                      jsonb         NOT NULL DEFAULT '{}',
    created_at                  timestamptz   DEFAULT now()
);


-- ── Branch members ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.samay_branch_members (
    branch_id       uuid          NOT NULL REFERENCES public.samay_branches(id) ON DELETE CASCADE,
    user_id         text          NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    node_id         text,                          -- Kutumb Map node ID
    display_name    text,
    role            text          NOT NULL DEFAULT 'member'
                                  CHECK (role IN ('manager', 'member')),
    local_balance   numeric(10,2) NOT NULL DEFAULT 0,
    joined_at       timestamptz   DEFAULT now(),
    PRIMARY KEY (branch_id, user_id)
);


-- ── Marketplace posts: Offers ("I can give") and Needs ("I need help") ────────
CREATE TABLE IF NOT EXISTS public.samay_requests (
    id              uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
    requester_id    text          NOT NULL REFERENCES public.users(id),
    branch_id       uuid          REFERENCES public.samay_branches(id),
    request_type    text          NOT NULL CHECK (request_type IN ('offer', 'need')),
    scope           text          NOT NULL DEFAULT 'local'
                                  CHECK (scope IN ('local', 'global')),
    title           text          NOT NULL,
    description     text,
    category        text          NOT NULL DEFAULT 'general',
    hours_estimate  numeric(6,2),
    status          text          NOT NULL DEFAULT 'open'
                                  CHECK (status IN ('open', 'assigned', 'completed', 'closed')),
    helper_id       text          REFERENCES public.users(id),
    -- Global posts: not visible until visible_from (30-min anti-farming delay)
    visible_from    timestamptz   NOT NULL DEFAULT now(),
    -- Dashboard-only personal task; not shown in time-bank marketplace
    is_dashboard_task boolean     NOT NULL DEFAULT false,
    created_at      timestamptz   DEFAULT now()
);


-- ── Transactions: immutable double-entry ledger ────────────────────────────────
-- Two-step: helper marks done → both rate → credits transfer
CREATE TABLE IF NOT EXISTS public.samay_transactions (
    id                          uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id                  uuid          REFERENCES public.samay_requests(id),
    helper_id                   text          NOT NULL REFERENCES public.users(id),   -- gives time
    requester_id                text          NOT NULL REFERENCES public.users(id),   -- receives time
    branch_id                   uuid          REFERENCES public.samay_branches(id),
    hours                       numeric(6,2)  NOT NULL CHECK (hours > 0),
    credit_type                 text          NOT NULL DEFAULT 'local'
                                              CHECK (credit_type IN ('local', 'global')),
    -- For global: final_value = hours × (1 + D_score) minted at confirmation
    final_value                 numeric(10,4),
    status                      text          NOT NULL DEFAULT 'pending'
                                              CHECK (status IN (
                                                  'pending','assigned','helper_done',
                                                  'confirmed','disputed','cancelled'
                                              )),
    requires_manager_approval   boolean       NOT NULL DEFAULT false,
    manager_approved            boolean,
    manager_approved_at         timestamptz,
    helper_confirmed_at         timestamptz,
    requester_confirmed_at      timestamptz,
    description                 text,
    -- Anti-farming flag (set by backend on circular trade detection)
    is_flagged                  boolean       NOT NULL DEFAULT false,
    flag_reason                 text,
    created_at                  timestamptz   DEFAULT now()
);


-- ── Ratings: mandatory for credit transfer ────────────────────────────────────
-- Both parties rate each other: quality + behaviour. Credits only transfer
-- when BOTH ratings are submitted (mutual handshake).
CREATE TABLE IF NOT EXISTS public.samay_ratings (
    id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_id  uuid        NOT NULL REFERENCES public.samay_transactions(id),
    from_user_id    text        NOT NULL REFERENCES public.users(id),
    to_user_id      text        NOT NULL REFERENCES public.users(id),
    quality_rating  integer     NOT NULL CHECK (quality_rating  BETWEEN 1 AND 5),
    behavior_rating integer     NOT NULL CHECK (behavior_rating BETWEEN 1 AND 5),
    comment         text,
    created_at      timestamptz DEFAULT now(),
    UNIQUE (transaction_id, from_user_id)   -- one rating per rater per transaction
);


-- ── Samay Profiles: Kutumb ID public trust card ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.samay_profiles (
    user_id              text          NOT NULL REFERENCES public.users(id) PRIMARY KEY,
    node_id              text,
    display_name         text,
    total_global_credits numeric(10,4) NOT NULL DEFAULT 0,
    total_verified_hours numeric(10,2) NOT NULL DEFAULT 0,
    avg_quality_rating   numeric(3,2)  NOT NULL DEFAULT 0,
    avg_behavior_rating  numeric(3,2)  NOT NULL DEFAULT 0,
    -- D-score = unique_people_helped / total_transactions (90-day window)
    d_score              numeric(5,4)  NOT NULL DEFAULT 0,
    is_community_pillar  boolean       NOT NULL DEFAULT false,  -- D >= 0.7
    rating_count         integer       NOT NULL DEFAULT 0,
    updated_at           timestamptz   DEFAULT now()
);


-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sbm_user        ON public.samay_branch_members(user_id);
CREATE INDEX IF NOT EXISTS idx_sbm_branch      ON public.samay_branch_members(branch_id);
CREATE INDEX IF NOT EXISTS idx_sreq_branch     ON public.samay_requests(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_sreq_global     ON public.samay_requests(scope, status, visible_from);
CREATE INDEX IF NOT EXISTS idx_sreq_poster     ON public.samay_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_stxn_helper     ON public.samay_transactions(helper_id);
CREATE INDEX IF NOT EXISTS idx_stxn_requester  ON public.samay_transactions(requester_id);
CREATE INDEX IF NOT EXISTS idx_stxn_branch     ON public.samay_transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_stxn_status     ON public.samay_transactions(status);
CREATE INDEX IF NOT EXISTS idx_stxn_flagged    ON public.samay_transactions(is_flagged) WHERE is_flagged = true;


-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.samay_branches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samay_branch_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samay_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samay_transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samay_ratings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samay_profiles         ENABLE ROW LEVEL SECURITY;

-- Profiles and marketplace posts are publicly readable
DROP POLICY IF EXISTS "samay_profiles_pub_read" ON public.samay_profiles;
CREATE POLICY "samay_profiles_pub_read"
    ON public.samay_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "samay_requests_pub_read" ON public.samay_requests;
CREATE POLICY "samay_requests_pub_read"
    ON public.samay_requests FOR SELECT USING (true);

-- Backend uses service-role key which bypasses RLS for writes.
