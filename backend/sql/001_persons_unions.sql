-- ── Migration 001: Core tree tables — persons & unions ───────────────────────
-- Safe to re-run (IF NOT EXISTS everywhere).

-- ── persons ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.persons (
    node_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    vansha_id            UUID        NOT NULL,
    first_name           TEXT        NOT NULL DEFAULT '',
    last_name            TEXT        NOT NULL DEFAULT '',
    date_of_birth        TEXT        NOT NULL DEFAULT '',
    ancestral_place      TEXT        NOT NULL DEFAULT '',
    current_residence    TEXT        NOT NULL DEFAULT '',
    gender               TEXT        NOT NULL DEFAULT 'other'
                             CHECK (gender IN ('male', 'female', 'other')),
    relation             TEXT        NOT NULL DEFAULT 'member',
    branch               TEXT        NOT NULL DEFAULT 'main',
    gotra                TEXT        NOT NULL DEFAULT '',
    mool_niwas           TEXT        NOT NULL DEFAULT '',
    title                TEXT        NOT NULL DEFAULT '',
    relative_gen_index   INTEGER     NOT NULL DEFAULT 0,
    generation           INTEGER     NOT NULL DEFAULT 0,
    -- lineage links (nullable — filled when parents are known)
    parent_union_id      UUID,
    father_node_id       UUID,
    mother_node_id       UUID,
    -- matrimony / cross-tree links
    maiden_vansha_id     UUID,       -- wife's birth vansha
    origin_vansha_id     UUID,       -- paternal tree pointer for matrimonial bridge
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_persons_vansha_id   ON public.persons (vansha_id);
CREATE INDEX IF NOT EXISTS idx_persons_parent_union ON public.persons (parent_union_id);
CREATE INDEX IF NOT EXISTS idx_persons_father       ON public.persons (father_node_id);
CREATE INDEX IF NOT EXISTS idx_persons_mother       ON public.persons (mother_node_id);

-- ── unions ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.unions (
    union_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    vansha_id            UUID        NOT NULL,
    male_node_id         UUID,
    female_node_id       UUID,
    relative_gen_index   INTEGER     NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unions_vansha_id ON public.unions (vansha_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unions  ENABLE ROW LEVEL SECURITY;

-- Service role (backend) has full access — anon/user reads scoped by vansha_id.
-- Authenticated users can read any person row (tree is semi-public within app).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'persons' AND policyname = 'persons_read'
  ) THEN
    CREATE POLICY persons_read ON public.persons
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'unions' AND policyname = 'unions_read'
  ) THEN
    CREATE POLICY unions_read ON public.unions
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Backend (service role) bypasses RLS for writes — no INSERT/UPDATE policies needed.
