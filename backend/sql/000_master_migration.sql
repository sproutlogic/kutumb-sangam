-- ═══════════════════════════════════════════════════════════════════════════
-- KUTUMB SANGAM — MASTER MIGRATION
-- Paste this entire file into Supabase SQL Editor and click Run.
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT DO NOTHING everywhere).
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 001: persons & unions (core tree tables) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.persons (
    node_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    vansha_id            UUID        NOT NULL,
    first_name           TEXT        NOT NULL DEFAULT '',
    last_name            TEXT        NOT NULL DEFAULT '',
    date_of_birth        TEXT        NOT NULL DEFAULT '',
    ancestral_place      TEXT        NOT NULL DEFAULT '',
    current_residence    TEXT        NOT NULL DEFAULT '',
    gender               TEXT        NOT NULL DEFAULT 'other'
                             CHECK (gender IN ('male', 'female', 'other')),
    relation             TEXT        NOT NULL DEFAULT 'member',
    branch               TEXT        NOT NULL DEFAULT 'main',
    gotra                TEXT        NOT NULL DEFAULT '',
    mool_niwas           TEXT        NOT NULL DEFAULT '',
    relative_gen_index   INTEGER     NOT NULL DEFAULT 0,
    generation           INTEGER     NOT NULL DEFAULT 0,
    parent_union_id      UUID,
    father_node_id       UUID,
    mother_node_id       UUID,
    maiden_vansha_id     UUID,
    origin_vansha_id     UUID,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_persons_vansha_id    ON public.persons (vansha_id);
CREATE INDEX IF NOT EXISTS idx_persons_parent_union ON public.persons (parent_union_id);
CREATE INDEX IF NOT EXISTS idx_persons_father       ON public.persons (father_node_id);
CREATE INDEX IF NOT EXISTS idx_persons_mother       ON public.persons (mother_node_id);

CREATE TABLE IF NOT EXISTS public.unions (
    union_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    vansha_id            UUID        NOT NULL,
    male_node_id         UUID,
    female_node_id       UUID,
    relative_gen_index   INTEGER     NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unions_vansha_id ON public.unions (vansha_id);

ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unions  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='persons' AND policyname='persons_read') THEN
    CREATE POLICY persons_read ON public.persons FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='unions' AND policyname='unions_read') THEN
    CREATE POLICY unions_read ON public.unions FOR SELECT TO authenticated USING (true);
  END IF;
END $$;


-- ── 002: matrimony_profiles ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.matrimony_profiles (
  vansha_id UUID PRIMARY KEY,
  profile   JSONB        NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matrimony_profiles_updated
    ON public.matrimony_profiles (updated_at DESC);


-- ── 003: verification_requests ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.verification_requests (
  id          UUID        PRIMARY KEY,
  vansha_id   UUID        NOT NULL,
  node_id     UUID        NOT NULL,
  requested_by UUID,
  status      TEXT        NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_requests_vansha_status
    ON public.verification_requests (vansha_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_requests_node_status
    ON public.verification_requests (node_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_verification_requests_pending_per_node
    ON public.verification_requests (vansha_id, node_id)
    WHERE status = 'pending';


-- ── 004: users, verification_audit, notifications ─────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TABLE IF NOT EXISTS public.users (
    id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role       TEXT        NOT NULL DEFAULT 'user'
                           CHECK (role IN ('user','pandit','admin','superadmin','np','zp','rp','cp','se')),
    vansha_id  UUID,
    phone      TEXT,
    full_name  TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_vansha_id ON public.users(vansha_id);
CREATE INDEX IF NOT EXISTS idx_users_role      ON public.users(role);

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.verification_audit (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_request_id UUID        NOT NULL
                                REFERENCES public.verification_requests(id) ON DELETE CASCADE,
    pandit_user_id          UUID        NOT NULL REFERENCES public.users(id),
    action                  TEXT        NOT NULL CHECK (action IN ('approved','rejected')),
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_audit_request ON public.verification_audit(verification_request_id);
CREATE INDEX IF NOT EXISTS idx_verification_audit_pandit  ON public.verification_audit(pandit_user_id);

CREATE TABLE IF NOT EXISTS public.notifications (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type       TEXT        NOT NULL,
    title      TEXT        NOT NULL,
    body       TEXT        NOT NULL,
    read       BOOLEAN     NOT NULL DEFAULT FALSE,
    metadata   JSONB       NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON public.notifications(user_id, read, created_at DESC);


-- ── 005: sales_settings + sales_performance ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_settings (
    id                  TEXT        PRIMARY KEY,
    product_price       NUMERIC(12,2) NOT NULL DEFAULT 999,
    se_direct_incentive NUMERIC(12,2) NOT NULL DEFAULT 200,
    cp_override         NUMERIC(12,2) NOT NULL DEFAULT 100,
    rp_trade_discount   NUMERIC(5,2)  NOT NULL DEFAULT 35,
    zp_trade_discount   NUMERIC(5,2)  NOT NULL DEFAULT 38,
    np_trade_discount   NUMERIC(5,2)  NOT NULL DEFAULT 40,
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

INSERT INTO public.sales_settings (id, product_price, se_direct_incentive, cp_override, rp_trade_discount, zp_trade_discount, np_trade_discount)
VALUES ('global', 999, 200, 100, 35, 38, 40)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_sales_settings_updated_at ON public.sales_settings;
CREATE TRIGGER trg_sales_settings_updated_at
    BEFORE UPDATE ON public.sales_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.sales_performance (
    user_id               UUID    PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    personal_sales        INTEGER NOT NULL DEFAULT 0 CHECK (personal_sales >= 0),
    team_sales            INTEGER NOT NULL DEFAULT 0 CHECK (team_sales >= 0),
    pending_support_cases INTEGER NOT NULL DEFAULT 0 CHECK (pending_support_cases >= 0),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_sales_performance_updated_at ON public.sales_performance;
CREATE TRIGGER trg_sales_performance_updated_at
    BEFORE UPDATE ON public.sales_performance
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_sales_performance_updated_at ON public.sales_performance(updated_at DESC);


-- ── 006: platform_config (pricing, features) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_config (
    id         TEXT        PRIMARY KEY,
    config     JSONB       NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by TEXT        REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION public.set_platform_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_platform_config_updated_at ON public.platform_config;
CREATE TRIGGER trg_platform_config_updated_at
    BEFORE UPDATE ON public.platform_config
    FOR EACH ROW EXECUTE FUNCTION public.set_platform_config_updated_at();

ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_config_public_read" ON public.platform_config;
CREATE POLICY "platform_config_public_read"
    ON public.platform_config FOR SELECT USING (true);

INSERT INTO public.platform_config (id, config)
VALUES ('pricing', '{
    "plans": {
        "beej":  {"price": 0,   "maxNodes": 15,   "generationCap": 3,
                  "entitlements": {"culturalFields": false, "discovery": false,
                                   "connectionChains": false, "panditVerification": false,
                                   "matrimony": false, "sosAlerts": false, "treeAnnounce": false}},
        "ankur": {"price": 99,  "maxNodes": 50,   "generationCap": 5,
                  "entitlements": {"culturalFields": true,  "discovery": false,
                                   "connectionChains": false, "panditVerification": false,
                                   "matrimony": false, "sosAlerts": false, "treeAnnounce": false}},
        "vriksh":{"price": 299, "maxNodes": 200,  "generationCap": 10,
                  "entitlements": {"culturalFields": true,  "discovery": true,
                                   "connectionChains": false, "panditVerification": true,
                                   "matrimony": false, "sosAlerts": true,  "treeAnnounce": false}},
        "vansh": {"price": 799, "maxNodes": 1000, "generationCap": 25,
                  "entitlements": {"culturalFields": true,  "discovery": true,
                                   "connectionChains": true,  "panditVerification": true,
                                   "matrimony": true,  "sosAlerts": true,  "treeAnnounce": true}}
    },
    "matrimony": {
        "compatibilityUnlock":  101,
        "photoUnlock":          151,
        "kundaliReview":        501,
        "gotraConsultation":    251,
        "fullFamilyOnboarding": 2500,
        "secondPanditOpinion":  251
    },
    "panditDefaults": {
        "kundaliMilanReview":   501,
        "gotraConsultation":    251,
        "fullFamilyOnboarding": 2500
    }
}'::jsonb)
ON CONFLICT (id) DO NOTHING;


-- ── 007: se_applications ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.se_applications (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          TEXT        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    referral_code    TEXT        NOT NULL,
    referred_by_id   TEXT        REFERENCES public.users(id) ON DELETE SET NULL,
    aadhaar_last4    TEXT        NOT NULL CHECK (aadhaar_last4 ~ '^\d{4}$'),
    aadhaar_name     TEXT        NOT NULL,
    aadhaar_dob      DATE,
    kyc_consent_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    kyc_status       TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (kyc_status IN ('pending','verified','rejected')),
    bank_account_no  TEXT        NOT NULL,
    bank_ifsc        TEXT        NOT NULL CHECK (bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
    bank_holder_name TEXT        NOT NULL,
    bank_status      TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (bank_status IN ('pending','verified','rejected')),
    status           TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','approved','rejected')),
    rejected_reason  TEXT,
    reviewed_by      TEXT        REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id)
);

CREATE OR REPLACE FUNCTION public.set_se_app_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_se_app_updated_at ON public.se_applications;
CREATE TRIGGER trg_se_app_updated_at
    BEFORE UPDATE ON public.se_applications
    FOR EACH ROW EXECUTE FUNCTION public.set_se_app_updated_at();

ALTER TABLE public.se_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "se_app_self_read" ON public.se_applications;
CREATE POLICY "se_app_self_read"
    ON public.se_applications FOR SELECT
    USING (auth.uid()::text = user_id);


-- ── 008: calendar_events ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.calendar_events (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    vansha_id       TEXT        NOT NULL,
    created_by      TEXT        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title           TEXT        NOT NULL,
    event_date      DATE        NOT NULL,
    event_type      TEXT        NOT NULL DEFAULT 'event'
                                CHECK (event_type IN ('birthday','anniversary','event','announcement')),
    description     TEXT,
    recurs_yearly   BOOLEAN     NOT NULL DEFAULT false,
    is_announcement BOOLEAN     NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_vansha ON public.calendar_events (vansha_id, event_date);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calendar_self_read" ON public.calendar_events;
CREATE POLICY "calendar_self_read"
    ON public.calendar_events FOR SELECT USING (true);


-- ── 009: legacy_messages ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.legacy_messages (
    id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id          TEXT        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    vansha_id          TEXT        NOT NULL,
    recipient_node_id  TEXT        NOT NULL,
    recipient_name     TEXT        NOT NULL,
    message_type       TEXT        NOT NULL CHECK (message_type IN ('text','voice')),
    text_content       TEXT,
    voice_url          TEXT,
    voice_duration_sec INTEGER,
    trigger_type       TEXT        NOT NULL CHECK (trigger_type IN ('time','location')),
    trigger_time       TIMESTAMPTZ,
    trigger_lat        DOUBLE PRECISION,
    trigger_lon        DOUBLE PRECISION,
    trigger_radius_m   INTEGER     DEFAULT 100,
    trigger_place_name TEXT,
    status             TEXT        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending','delivered','expired')),
    delivered_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_sender  ON public.legacy_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_legacy_vansha  ON public.legacy_messages (vansha_id);
CREATE INDEX IF NOT EXISTS idx_legacy_trigger ON public.legacy_messages (trigger_time) WHERE status = 'pending';

ALTER TABLE public.legacy_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "legacy_self_read" ON public.legacy_messages;
CREATE POLICY "legacy_self_read"
    ON public.legacy_messages FOR SELECT
    USING (auth.uid()::text = sender_id);


-- ── 010: member_locations (Kutumb Radar) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.member_locations (
    user_id         TEXT             NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    vansha_id       TEXT             NOT NULL,
    latitude        DOUBLE PRECISION NOT NULL,
    longitude       DOUBLE PRECISION NOT NULL,
    accuracy_m      INTEGER,
    sharing_consent BOOLEAN          NOT NULL DEFAULT false,
    updated_at      TIMESTAMPTZ      DEFAULT now(),
    PRIMARY KEY (user_id, vansha_id)
);

CREATE INDEX IF NOT EXISTS idx_member_loc_vansha
    ON public.member_locations (vansha_id) WHERE sharing_consent = true;

ALTER TABLE public.member_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "radar_self_read" ON public.member_locations;
CREATE POLICY "radar_self_read"
    ON public.member_locations FOR SELECT
    USING (auth.uid()::text = user_id);


-- ── 011: Samay Bank v2 (drops old time_bank tables, creates samay_*) ──────────

DROP TABLE IF EXISTS public.time_bank_transactions CASCADE;
DROP TABLE IF EXISTS public.time_bank_offers        CASCADE;

CREATE TABLE IF NOT EXISTS public.samay_branches (
    id                        UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    name                      TEXT          NOT NULL,
    manager_id                TEXT          NOT NULL REFERENCES public.users(id),
    vansha_id                 TEXT          UNIQUE,
    description               TEXT,
    is_private_ledger         BOOLEAN       NOT NULL DEFAULT false,
    requires_manager_approval BOOLEAN       NOT NULL DEFAULT false,
    allow_global              BOOLEAN       NOT NULL DEFAULT true,
    negative_limit_hours      NUMERIC(6,2)  NOT NULL DEFAULT 5,
    config                    JSONB         NOT NULL DEFAULT '{}',
    created_at                TIMESTAMPTZ   DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.samay_branch_members (
    branch_id     UUID          NOT NULL REFERENCES public.samay_branches(id) ON DELETE CASCADE,
    user_id       TEXT          NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    node_id       TEXT,
    display_name  TEXT,
    role          TEXT          NOT NULL DEFAULT 'member' CHECK (role IN ('manager','member')),
    local_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
    joined_at     TIMESTAMPTZ   DEFAULT now(),
    PRIMARY KEY (branch_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.samay_requests (
    id             UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    requester_id   TEXT          NOT NULL REFERENCES public.users(id),
    branch_id      UUID          REFERENCES public.samay_branches(id),
    request_type   TEXT          NOT NULL CHECK (request_type IN ('offer','need')),
    scope          TEXT          NOT NULL DEFAULT 'local' CHECK (scope IN ('local','global')),
    title          TEXT          NOT NULL,
    description    TEXT,
    category       TEXT          NOT NULL DEFAULT 'general',
    hours_estimate NUMERIC(6,2),
    status         TEXT          NOT NULL DEFAULT 'open'
                                 CHECK (status IN ('open','assigned','completed','closed')),
    helper_id      TEXT          REFERENCES public.users(id),
    visible_from   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_at     TIMESTAMPTZ   DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.samay_transactions (
    id                        UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id                UUID          REFERENCES public.samay_requests(id),
    helper_id                 TEXT          NOT NULL REFERENCES public.users(id),
    requester_id              TEXT          NOT NULL REFERENCES public.users(id),
    branch_id                 UUID          REFERENCES public.samay_branches(id),
    hours                     NUMERIC(6,2)  NOT NULL CHECK (hours > 0),
    credit_type               TEXT          NOT NULL DEFAULT 'local' CHECK (credit_type IN ('local','global')),
    final_value               NUMERIC(10,4),
    status                    TEXT          NOT NULL DEFAULT 'pending'
                                            CHECK (status IN ('pending','assigned','helper_done','confirmed','disputed','cancelled')),
    requires_manager_approval BOOLEAN       NOT NULL DEFAULT false,
    manager_approved          BOOLEAN,
    manager_approved_at       TIMESTAMPTZ,
    helper_confirmed_at       TIMESTAMPTZ,
    requester_confirmed_at    TIMESTAMPTZ,
    description               TEXT,
    is_flagged                BOOLEAN       NOT NULL DEFAULT false,
    flag_reason               TEXT,
    created_at                TIMESTAMPTZ   DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.samay_ratings (
    id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_id  UUID    NOT NULL REFERENCES public.samay_transactions(id),
    from_user_id    TEXT    NOT NULL REFERENCES public.users(id),
    to_user_id      TEXT    NOT NULL REFERENCES public.users(id),
    quality_rating  INTEGER NOT NULL CHECK (quality_rating  BETWEEN 1 AND 5),
    behavior_rating INTEGER NOT NULL CHECK (behavior_rating BETWEEN 1 AND 5),
    comment         TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (transaction_id, from_user_id)
);

CREATE TABLE IF NOT EXISTS public.samay_profiles (
    user_id              TEXT          NOT NULL REFERENCES public.users(id) PRIMARY KEY,
    node_id              TEXT,
    display_name         TEXT,
    total_global_credits NUMERIC(10,4) NOT NULL DEFAULT 0,
    total_verified_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
    avg_quality_rating   NUMERIC(3,2)  NOT NULL DEFAULT 0,
    avg_behavior_rating  NUMERIC(3,2)  NOT NULL DEFAULT 0,
    d_score              NUMERIC(5,4)  NOT NULL DEFAULT 0,
    is_community_pillar  BOOLEAN       NOT NULL DEFAULT false,
    rating_count         INTEGER       NOT NULL DEFAULT 0,
    updated_at           TIMESTAMPTZ   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sbm_user       ON public.samay_branch_members(user_id);
CREATE INDEX IF NOT EXISTS idx_sbm_branch     ON public.samay_branch_members(branch_id);
CREATE INDEX IF NOT EXISTS idx_sreq_branch    ON public.samay_requests(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_sreq_global    ON public.samay_requests(scope, status, visible_from);
CREATE INDEX IF NOT EXISTS idx_sreq_poster    ON public.samay_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_stxn_helper    ON public.samay_transactions(helper_id);
CREATE INDEX IF NOT EXISTS idx_stxn_requester ON public.samay_transactions(requester_id);
CREATE INDEX IF NOT EXISTS idx_stxn_branch    ON public.samay_transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_stxn_status    ON public.samay_transactions(status);
CREATE INDEX IF NOT EXISTS idx_stxn_flagged   ON public.samay_transactions(is_flagged) WHERE is_flagged = true;

ALTER TABLE public.samay_branches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samay_branch_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samay_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samay_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samay_ratings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samay_profiles       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "samay_profiles_pub_read" ON public.samay_profiles;
CREATE POLICY "samay_profiles_pub_read"
    ON public.samay_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "samay_requests_pub_read" ON public.samay_requests;
CREATE POLICY "samay_requests_pub_read"
    ON public.samay_requests FOR SELECT USING (true);


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY: run this after the migration to confirm all tables exist.
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
--
-- Expected: calendar_events, legacy_messages, matrimony_profiles,
--   member_locations, notifications, persons, platform_config,
--   sales_performance, sales_settings, samay_branch_members, samay_branches,
--   samay_profiles, samay_ratings, samay_requests, samay_transactions,
--   se_applications, unions, users, verification_audit, verification_requests
-- ═══════════════════════════════════════════════════════════════════════════
