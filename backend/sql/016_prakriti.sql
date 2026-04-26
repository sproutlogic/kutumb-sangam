-- ── 016_prakriti.sql ─────────────────────────────────────────────────────────
-- Prakriti green-cover layer — aligns platform with MOA Objects 2,3,5,6,10,11
-- Harit Vanshavali · Eco-Sewa Credits · Prakriti Score · Harit Circles
-- Paryavaran Mitra eco-ceremony earnings

-- ── Paryavaran Mitra flag on users ───────────────────────────────────────────
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS is_paryavaran_mitra boolean NOT NULL DEFAULT false;

-- ── Prakriti Score — per-vansha environmental legacy index ───────────────────
-- Aggregates: trees planted × 10, eco-service hours × 2, pledges × 5
CREATE TABLE IF NOT EXISTS public.prakriti_scores (
    vansha_id           text          PRIMARY KEY,  -- no FK; vansha may be external
    trees_planted       integer       NOT NULL DEFAULT 0,
    eco_hours           numeric(10,2) NOT NULL DEFAULT 0,
    pledges_completed   integer       NOT NULL DEFAULT 0,
    score               numeric(10,2) NOT NULL DEFAULT 0,  -- recomputed by backend
    updated_at          timestamptz   DEFAULT now()
);

-- ── Harit Circles — SmartBin community groups anchored by Paryavaran Mitra ──
CREATE TABLE IF NOT EXISTS public.harit_circles (
    id                          uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
    name                        text  NOT NULL,
    paryavaran_mitra_user_id    uuid  REFERENCES public.users(id),
    location_lat                numeric(9,6),
    location_lon                numeric(9,6),
    location_name               text,
    vansha_ids                  text[] NOT NULL DEFAULT '{}',
    created_at                  timestamptz DEFAULT now()
);

-- ── Eco-Ceremonies — Paryavaran Mitra service earnings ───────────────────────
-- MOA Objects 6 + 10: community education, CSR
CREATE TABLE IF NOT EXISTS public.eco_ceremonies (
    id                          uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
    ceremony_type               text  NOT NULL CHECK (ceremony_type IN (
        'vriksha_pratishtha',   -- ₹999 gross
        'jal_puja',             -- ₹499 gross
        'eco_pledge',           -- ₹199 gross
        'dharti_sandesh',       -- ₹199 gross
        'harit_circle_monthly'  -- ₹500 gross
    )),
    paryavaran_mitra_user_id    uuid  NOT NULL REFERENCES public.users(id),
    vansha_id                   text,
    node_id                     text,
    gross_amount                numeric(8,2) NOT NULL,
    platform_fee_pct            numeric(4,2) NOT NULL DEFAULT 20.00,
    net_amount                  numeric(8,2) NOT NULL,  -- set by backend: gross × 0.80
    status                      text  NOT NULL DEFAULT 'pending'
                                      CHECK (status IN ('pending', 'completed', 'cancelled')),
    upi_ref                     text,
    created_at                  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eco_ceremonies_mitra
    ON public.eco_ceremonies(paryavaran_mitra_user_id, status);

-- ── Eco-activity categories reference (informational) ────────────────────────
-- samay_requests.category accepts these values for eco-framed offers/needs:
--   'tree_planting' | 'waste_segregation' | 'clean_up_drive' | 'water_conservation'
--   | 'eco_awareness' | 'solar_adoption' | 'composting'
-- These earn 1.5× eco-credit multiplier (applied at confirmation, stored in final_value)

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.prakriti_scores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.harit_circles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eco_ceremonies   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prakriti_scores_pub_read" ON public.prakriti_scores;
CREATE POLICY "prakriti_scores_pub_read"
    ON public.prakriti_scores FOR SELECT USING (true);

DROP POLICY IF EXISTS "harit_circles_pub_read" ON public.harit_circles;
CREATE POLICY "harit_circles_pub_read"
    ON public.harit_circles FOR SELECT USING (true);

-- eco_ceremonies: readable only by the Paryavaran Mitra who owns them
DROP POLICY IF EXISTS "eco_ceremonies_mitra_read" ON public.eco_ceremonies;
CREATE POLICY "eco_ceremonies_mitra_read"
    ON public.eco_ceremonies FOR SELECT
    USING (auth.uid() = paryavaran_mitra_user_id);
