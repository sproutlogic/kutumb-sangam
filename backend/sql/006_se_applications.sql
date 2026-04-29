-- ── se_applications ─────────────────────────────────────────────────────────────
-- Stores Sales Executive enrollment applications.
-- KYC: only Aadhaar last-4 stored; full number never persisted (UIDAI regulation).
-- Bank: stored as plain text — MUST be encrypted at rest in production (AES-256).

CREATE TABLE IF NOT EXISTS public.se_applications (
    id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         text        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    referral_code   text        NOT NULL DEFAULT '', -- Referrer's Kutumb ID supplied by applicant (empty = no referral)
    referred_by_id  text        REFERENCES public.users(id) ON DELETE SET NULL,

    -- Aadhaar KYC (UIDAI-compliant: full number never stored)
    aadhaar_last4   text        NOT NULL CHECK (aadhaar_last4 ~ '^\d{4}$'),
    aadhaar_name    text        NOT NULL,
    aadhaar_dob     date,
    kyc_consent_at  timestamptz NOT NULL DEFAULT now(),
    kyc_status      text        NOT NULL DEFAULT 'pending'
                                CHECK (kyc_status IN ('pending', 'verified', 'rejected')),

    -- Bank account (for commission payouts)
    bank_account_no text        NOT NULL,
    bank_ifsc       text        NOT NULL CHECK (bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
    bank_holder_name text       NOT NULL,
    bank_status     text        NOT NULL DEFAULT 'pending'
                                CHECK (bank_status IN ('pending', 'verified', 'rejected')),

    -- Review lifecycle
    status          text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected')),
    rejected_reason text,
    reviewed_by     text        REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at     timestamptz,

    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now(),

    UNIQUE (user_id)   -- one active application per user
);

CREATE OR REPLACE FUNCTION public.set_se_app_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_se_app_updated_at ON public.se_applications;
CREATE TRIGGER trg_se_app_updated_at
    BEFORE UPDATE ON public.se_applications
    FOR EACH ROW EXECUTE FUNCTION public.set_se_app_updated_at();

-- RLS: users can read their own application; backend service-role key handles writes.
ALTER TABLE public.se_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "se_app_self_read" ON public.se_applications;
CREATE POLICY "se_app_self_read"
    ON public.se_applications FOR SELECT
    USING (auth.uid()::text = user_id);
