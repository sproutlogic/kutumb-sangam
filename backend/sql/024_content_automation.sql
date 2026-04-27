-- Migration 024: Content Automation
-- generated_content table for weekly Eco-Panchang blog posts, Instagram captions, YouTube shorts.

CREATE TABLE IF NOT EXISTS public.generated_content (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    panchang_date   date        NOT NULL REFERENCES public.panchang_calendar(gregorian_date),
    tithi_id        smallint    NOT NULL REFERENCES public.tithis(id),

    content_type    text        NOT NULL
        CHECK (content_type IN ('blog_post','ig_caption','yt_short')),

    -- NULL = platform-level generic; set = personalised for a specific vansha
    vansha_id       text,
    family_name     text,
    location        text,

    -- Rendered output
    title           text        NOT NULL,
    subtitle        text,
    body            text        NOT NULL,
    hashtags        text[],

    -- Lifecycle
    status          text        NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','approved','published','rejected')),
    reviewed_by     uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at     timestamptz,
    published_at    timestamptz,
    reject_reason   text,

    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gen_content_date    ON public.generated_content (panchang_date, content_type);
CREATE INDEX IF NOT EXISTS idx_gen_content_status  ON public.generated_content (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gen_content_vansha  ON public.generated_content (vansha_id, panchang_date)
    WHERE vansha_id IS NOT NULL;

ALTER TABLE public.generated_content ENABLE ROW LEVEL SECURITY;

-- Anonymous / public can read published generic content
CREATE POLICY "gen_content_pub_read" ON public.generated_content
    FOR SELECT USING (status = 'published' AND vansha_id IS NULL);

-- Admins and superadmins see all (via service role in backend — no RLS policy needed for service role)
