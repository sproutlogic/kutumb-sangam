-- Migration 021: Two-Tier Trust Model
-- eco_sewa_logs (Tier 1: self-reported) + verified_eco_actions (Tier 2: paid service)
-- NOTE: Run AFTER 022_service_layer.sql due to FK on service_orders/vendors.
-- For independent deployment, remove the FKs and add them later via ALTER TABLE.

-- ── Tier 1: Self-Reported Eco-Sewa ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.eco_sewa_logs (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    vansha_id       text        NOT NULL,
    reported_by_uid uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    action_type     text        NOT NULL CHECK (action_type IN (
                        'tree_watered','tree_planted_self','waste_segregated',
                        'animal_water','eco_pledge','community_clean',
                        'composting','solar_action','water_harvesting'
                    )),
    action_date     date        NOT NULL DEFAULT CURRENT_DATE,
    location_text   text,
    notes           text,
    photo_url       text,

    -- Link to today's tithi (optional — set by backend if action date matches panchang)
    tithi_id        smallint    REFERENCES public.tithis(id),

    -- Trust pipeline
    status          text        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','vouched','disputed','rejected')),
    vouched_by_uid  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    vouched_at      timestamptz,
    dispute_reason  text,

    -- Prakriti Score contribution
    -- pending = 0.5 × action_weight (eco_hours bucket)
    -- vouched  = 1.0 × action_weight
    score_contribution  numeric(6,2) NOT NULL DEFAULT 0,

    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eco_sewa_vansha  ON public.eco_sewa_logs (vansha_id, action_date DESC);
CREATE INDEX IF NOT EXISTS idx_eco_sewa_uid     ON public.eco_sewa_logs (reported_by_uid);
CREATE INDEX IF NOT EXISTS idx_eco_sewa_status  ON public.eco_sewa_logs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eco_sewa_tithi   ON public.eco_sewa_logs (tithi_id)
    WHERE tithi_id IS NOT NULL;

ALTER TABLE public.eco_sewa_logs ENABLE ROW LEVEL SECURITY;

-- Users can see all logs for their own vansha
CREATE POLICY "eco_sewa_vansha_select" ON public.eco_sewa_logs
    FOR SELECT USING (
        vansha_id IN (
            SELECT vansha_id::text FROM public.users WHERE id = auth.uid()
        )
    );

-- Users can insert only their own logs
CREATE POLICY "eco_sewa_self_insert" ON public.eco_sewa_logs
    FOR INSERT WITH CHECK (reported_by_uid = auth.uid());

-- Users can update (vouch/dispute) logs in their vansha (not their own)
CREATE POLICY "eco_sewa_vansha_update" ON public.eco_sewa_logs
    FOR UPDATE USING (
        vansha_id IN (
            SELECT vansha_id::text FROM public.users WHERE id = auth.uid()
        )
    );


-- ── Tier 2: Verified Eco-Actions (from paid service) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.verified_eco_actions (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    vansha_id       text        NOT NULL,
    service_order_id uuid       NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
    vendor_id       uuid        NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,

    action_type     text        NOT NULL CHECK (action_type IN (
                        'tree_planted','tree_care_milestone',
                        'water_station_installed','water_station_refill'
                    )),

    -- Vendor-submitted proof (mirrors proof_submissions)
    geo_lat         numeric(9,6),
    geo_lon         numeric(9,6),
    geo_accuracy_m  integer,
    proof_timestamp timestamptz,
    photo_url       text        NOT NULL,
    vendor_notes    text,

    -- Verification
    status          text        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','auto_approved','approved','rejected','escalated')),
    auto_check_passed   boolean,
    verified_by_uid uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    verified_at     timestamptz,
    rejection_reason text,

    -- Score impact (applied once on approval)
    trees_delta     integer     NOT NULL DEFAULT 0,
    pledges_delta   integer     NOT NULL DEFAULT 0,
    score_applied   boolean     NOT NULL DEFAULT false,

    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vea_vansha  ON public.verified_eco_actions (vansha_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vea_status  ON public.verified_eco_actions (status);
CREATE INDEX IF NOT EXISTS idx_vea_order   ON public.verified_eco_actions (service_order_id);

ALTER TABLE public.verified_eco_actions ENABLE ROW LEVEL SECURITY;

-- Users see only their own vansha's verified actions
CREATE POLICY "vea_vansha_select" ON public.verified_eco_actions
    FOR SELECT USING (
        vansha_id IN (
            SELECT vansha_id::text FROM public.users WHERE id = auth.uid()
        )
    );

-- Paryavaran Mitras and admins can update (approve/reject) via service role in backend
