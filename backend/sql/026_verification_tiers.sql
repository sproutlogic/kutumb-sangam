-- 026_verification_tiers.sql
-- Aligns verification_tier values with the 4-tier model:
--   self-declared → family-endorsed → expert-verified → community-endorsed
-- Also adds method column to verification_requests for audit trail.

-- 1. Fix existing "expert" values written by the old pandit.py bug
UPDATE public.persons
    SET verification_tier = 'expert-verified'
    WHERE verification_tier = 'expert';

-- 2. Drop old CHECK and add new one covering all 4 tiers
ALTER TABLE public.persons
    DROP CONSTRAINT IF EXISTS persons_verification_tier_check;

ALTER TABLE public.persons
    ADD CONSTRAINT persons_verification_tier_check
    CHECK (verification_tier IN ('self-declared', 'family-endorsed', 'expert-verified', 'community-endorsed'));

-- 3. Add method column to verification_requests for distinguishing flow type
ALTER TABLE public.verification_requests
    ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'pandit'
    CHECK (method IN ('pandit', 'trust', 'family-endorsed'));
