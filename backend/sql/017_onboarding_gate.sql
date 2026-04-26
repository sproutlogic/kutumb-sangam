-- ── 017_onboarding_gate.sql ──────────────────────────────────────────────────
-- Closes the Gmail/magic-link backdoor.
-- onboarding_complete = false → user must finish onboarding form before entering app.
-- Existing users are back-filled to true so they are not locked out.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS onboarding_complete boolean NOT NULL DEFAULT false;

-- Existing rows with a vansha_id already completed onboarding — mark them done.
UPDATE public.users SET onboarding_complete = true WHERE vansha_id IS NOT NULL;
