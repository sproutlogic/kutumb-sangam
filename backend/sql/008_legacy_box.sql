-- ── legacy_messages ──────────────────────────────────────────────────────────
-- Voice or text messages with time-based or location-based delivery triggers.
-- Full Aadhaar / personal data is never stored here.
-- voice_url: path in Supabase Storage bucket 'legacy-voices' (never a raw blob).

CREATE TABLE IF NOT EXISTS public.legacy_messages (
    id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id           text        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    vansha_id           text        NOT NULL,
    recipient_node_id   text        NOT NULL,   -- persons.id in the tree
    recipient_name      text        NOT NULL,   -- denormalised for display

    message_type        text        NOT NULL CHECK (message_type IN ('text','voice')),
    text_content        text,                   -- max 500 chars enforced in app
    voice_url           text,                   -- Supabase Storage path
    voice_duration_sec  integer,

    trigger_type        text        NOT NULL CHECK (trigger_type IN ('time','location')),
    trigger_time        timestamptz,            -- for time trigger
    trigger_lat         double precision,       -- for location trigger
    trigger_lon         double precision,
    trigger_radius_m    integer     DEFAULT 100,
    trigger_place_name  text,

    status              text        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','delivered','expired')),
    delivered_at        timestamptz,

    created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_sender     ON public.legacy_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_legacy_vansha     ON public.legacy_messages (vansha_id);
CREATE INDEX IF NOT EXISTS idx_legacy_trigger    ON public.legacy_messages (trigger_time) WHERE status = 'pending';

ALTER TABLE public.legacy_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "legacy_self_read" ON public.legacy_messages;
CREATE POLICY "legacy_self_read"
    ON public.legacy_messages FOR SELECT
    USING (auth.uid()::text = sender_id);
