-- Migration 025: Admin Config Extension
-- Extends the existing platform_config JSONB to include service_packages pricing.
-- No schema change needed — platform_config.config is already JSONB.
-- This migration documents the expected shape and sets a default if not present.

-- The full pricing config shape (GET/PUT /api/admin/pricing-config):
-- {
--   "plans": {
--     "beej":  { "price": 0, "preLaunchPrice": null, "isPreLaunch": false, "maxNodes": 15, "generationCap": 3, "entitlements": {...} },
--     "ankur": { "price": 2100, "preLaunchPrice": 999, "isPreLaunch": true, ... },
--     "vriksh": { ... },
--     "vansh":  { ... }
--   },
--   "service_packages": {
--     "taruvara":     { "price_paise": 149900, "is_active": true },
--     "dashavruksha": { "price_paise": 1199900, "is_active": true },
--     "jala_setu":    { "price_paise": 249900, "is_active": true }
--   },
--   "eco_ceremony_prices": {
--     "vriksha_pratishtha": 999,
--     "jal_puja": 499,
--     "eco_pledge": 199,
--     "dharti_sandesh": 199,
--     "harit_circle_monthly": 500
--   },
--   "pandit_defaults": {
--     "kundali_milan_review": 501,
--     "gotra_consultation": 251,
--     "full_family_onboarding": 2500
--   }
-- }

-- Seed the service_packages key if the pricing row exists but lacks it:
UPDATE public.platform_config
SET config = jsonb_set(
    config,
    '{service_packages}',
    '{"taruvara":{"price_paise":149900,"is_active":true},"dashavruksha":{"price_paise":1199900,"is_active":true},"jala_setu":{"price_paise":249900,"is_active":true}}'::jsonb,
    true  -- create key if missing
)
WHERE id = 'pricing'
  AND NOT (config ? 'service_packages');

-- If no pricing row exists at all, insert a minimal default:
INSERT INTO public.platform_config (id, config)
VALUES (
    'pricing',
    '{
        "plans": {},
        "service_packages": {
            "taruvara":     {"price_paise": 149900, "is_active": true},
            "dashavruksha": {"price_paise": 1199900, "is_active": true},
            "jala_setu":    {"price_paise": 249900,  "is_active": true}
        },
        "eco_ceremony_prices": {
            "vriksha_pratishtha":   999,
            "jal_puja":             499,
            "eco_pledge":           199,
            "dharti_sandesh":       199,
            "harit_circle_monthly": 500
        },
        "pandit_defaults": {
            "kundali_milan_review":   501,
            "gotra_consultation":     251,
            "full_family_onboarding": 2500
        }
    }'::jsonb
)
ON CONFLICT (id) DO NOTHING;
