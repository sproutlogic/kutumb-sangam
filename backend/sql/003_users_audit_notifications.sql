-- GTM migration: user accounts, Pandit audit trail, in-app notifications.
-- Run against your Supabase project via the SQL editor or psql.

-- ── 1. Users ─────────────────────────────────────────────────────────────────
-- Links Supabase Auth identities (auth.users) to application-level profile data.
CREATE TABLE IF NOT EXISTS public.users (
    id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role           TEXT NOT NULL DEFAULT 'user'
                       CHECK (role IN ('user', 'pandit', 'admin')),
    vansha_id      UUID,            -- null until the user completes onboarding
    phone          TEXT,
    full_name      TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_vansha_id ON public.users(vansha_id);
CREATE INDEX IF NOT EXISTS idx_users_role       ON public.users(role);

-- Auto-bump updated_at on every write.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. Verification Audit ─────────────────────────────────────────────────────
-- Immutable log of every Pandit approve / reject decision.
CREATE TABLE IF NOT EXISTS public.verification_audit (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_request_id UUID NOT NULL
                                REFERENCES public.verification_requests(id) ON DELETE CASCADE,
    pandit_user_id          UUID NOT NULL REFERENCES public.users(id),
    action                  TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_audit_request
    ON public.verification_audit(verification_request_id);
CREATE INDEX IF NOT EXISTS idx_verification_audit_pandit
    ON public.verification_audit(pandit_user_id);

-- ── 3. Notifications ─────────────────────────────────────────────────────────
-- In-app notification rows delivered to a specific user.
CREATE TABLE IF NOT EXISTS public.notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,          -- e.g. 'verification_approved', 'verification_rejected'
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    read       BOOLEAN NOT NULL DEFAULT FALSE,
    metadata   JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON public.notifications(user_id, read, created_at DESC);
