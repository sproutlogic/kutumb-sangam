-- ── calendar_events ─────────────────────────────────────────────────────────
-- Stores kutumb-wide events: birthdays, anniversaries, custom events, announcements.
-- birthdays/anniversaries are auto-seeded from tree data; custom events are user-created.

CREATE TABLE IF NOT EXISTS public.calendar_events (
    id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    vansha_id       text        NOT NULL,
    created_by      text        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title           text        NOT NULL,
    event_date      date        NOT NULL,
    event_type      text        NOT NULL DEFAULT 'event'
                                CHECK (event_type IN ('birthday','anniversary','event','announcement')),
    description     text,
    recurs_yearly   boolean     NOT NULL DEFAULT false,
    is_announcement boolean     NOT NULL DEFAULT false,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_vansha
    ON public.calendar_events (vansha_id, event_date);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_self_read" ON public.calendar_events;
CREATE POLICY "calendar_self_read"
    ON public.calendar_events FOR SELECT
    USING (true);   -- all authenticated reads go through backend with service role
