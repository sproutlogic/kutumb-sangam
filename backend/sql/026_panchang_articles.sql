-- Prakriti Insights: eco-practice articles pinned to tithi/dates
-- Each article explains which ecological practice is good for a specific day
-- as per Vedic system, with the science behind it.

CREATE TABLE IF NOT EXISTS panchang_articles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  body         text NOT NULL,
  related_date date,                -- nullable: pins insight to a calendar day
  author_name  text,                -- filled by admin when publishing
  published    boolean NOT NULL DEFAULT false,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS panchang_articles_related_date_idx ON panchang_articles (related_date);
CREATE INDEX IF NOT EXISTS panchang_articles_published_idx ON panchang_articles (published);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_panchang_articles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_panchang_articles_updated_at ON panchang_articles;
CREATE TRIGGER trg_panchang_articles_updated_at
  BEFORE UPDATE ON panchang_articles
  FOR EACH ROW EXECUTE FUNCTION update_panchang_articles_updated_at();
