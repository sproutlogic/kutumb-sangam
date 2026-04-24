-- ── member_locations ─────────────────────────────────────────────────────────
-- Stores the last known GPS location of members who have opted in to Kutumb Radar.
-- Location is only stored / used when sharing_consent = true.
-- PK is (user_id, vansha_id) — one location row per user per kutumb.

CREATE TABLE IF NOT EXISTS public.member_locations (
    user_id         text            NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    vansha_id       text            NOT NULL,
    latitude        double precision NOT NULL,
    longitude       double precision NOT NULL,
    accuracy_m      integer,
    sharing_consent boolean         NOT NULL DEFAULT false,
    updated_at      timestamptz     DEFAULT now(),
    PRIMARY KEY (user_id, vansha_id)
);

CREATE INDEX IF NOT EXISTS idx_member_loc_vansha
    ON public.member_locations (vansha_id) WHERE sharing_consent = true;

ALTER TABLE public.member_locations ENABLE ROW LEVEL SECURITY;

-- Users can read their own row; nearby lookups go through service-role backend.
DROP POLICY IF EXISTS "radar_self_read" ON public.member_locations;
CREATE POLICY "radar_self_read"
    ON public.member_locations FOR SELECT
    USING (auth.uid()::text = user_id);
