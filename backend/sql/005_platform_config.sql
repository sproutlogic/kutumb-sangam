-- ── platform_config ────────────────────────────────────────────────────────────
-- Stores superadmin-managed JSONB blobs (pricing, packages, etc.)
-- Each logical config object is one row keyed by `id` (e.g. 'pricing').
-- Backend uses the service-role key, so no client-side INSERT/UPDATE policy needed.

CREATE TABLE IF NOT EXISTS public.platform_config (
    id          text        PRIMARY KEY,           -- 'pricing', 'features', etc.
    config      jsonb       NOT NULL,
    updated_at  timestamptz DEFAULT now(),
    updated_by  text        REFERENCES public.users(id) ON DELETE SET NULL
);

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION public.set_platform_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_config_updated_at ON public.platform_config;
CREATE TRIGGER trg_platform_config_updated_at
    BEFORE UPDATE ON public.platform_config
    FOR EACH ROW EXECUTE FUNCTION public.set_platform_config_updated_at();

-- RLS: authenticated users can read (pricing is shown in the app to all users)
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_config_public_read" ON public.platform_config;
CREATE POLICY "platform_config_public_read"
    ON public.platform_config FOR SELECT
    USING (true);

-- No client-side write policy — all mutations go through the backend
-- which connects with the service_role_key (bypasses RLS).

-- ── Seed default pricing row ────────────────────────────────────────────────────
-- Run once; if the row already exists the INSERT is a no-op.
INSERT INTO public.platform_config (id, config)
VALUES (
    'pricing',
    '{
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
    }'::jsonb
)
ON CONFLICT (id) DO NOTHING;
