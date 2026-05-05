-- 036_tree_v2_ids_and_edges.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Tree v2 — universal IDs and explicit relationship edges (GEDCOM-aligned)
--
-- Adds:
--   1. persons.kutumb_id        — KMxxxxxxxx human-readable code on EVERY tree
--                                  member (not just registered users).
--   2. vanshas table            — tree-level metadata + vansh_code (VSxxxxxxxx).
--   3. relationships edge table — first-class typed edges (parent_of, spouse_of)
--                                  with subtype (biological / adopted / step).
--   4. persons.canvas_offset_x/y — manual drag offset on top of auto-layout.
--   5. Backfill from existing father_node_id / mother_node_id / parent_union_id
--      and `unions` table into relationships, so v1 trees keep working.
--
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. persons.kutumb_id ────────────────────────────────────────────────────

ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS kutumb_id TEXT UNIQUE;

-- Reuse the user kutumb_id format (KM + 8 chars, unambiguous alphabet).
-- Keep a separate generator scoped to persons so collision check is local.
CREATE OR REPLACE FUNCTION generate_person_kutumb_id()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet  TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate TEXT;
  i         INT;
BEGIN
  LOOP
    candidate := 'KM';
    FOR i IN 1..8 LOOP
      candidate := candidate || substr(alphabet, (floor(random() * 32))::int + 1, 1);
    END LOOP;
    -- Must be unique across BOTH persons and users (shared namespace).
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.persons WHERE kutumb_id = candidate)
          AND NOT EXISTS (SELECT 1 FROM public.users   WHERE kutumb_id = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

-- Backfill kutumb_id for any person rows missing one.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT node_id FROM public.persons WHERE kutumb_id IS NULL LOOP
    UPDATE public.persons
       SET kutumb_id = generate_person_kutumb_id()
     WHERE node_id = rec.node_id;
  END LOOP;
END;
$$;

-- If the person row already corresponds to a registered user (same node_id =
-- users.id via vansha link), reuse that user's kutumb_id so the codes match.
-- This is best-effort — we only overwrite when the person row's existing
-- kutumb_id was just freshly generated AND the user has one.
UPDATE public.persons p
   SET kutumb_id = u.kutumb_id
  FROM public.users u
 WHERE u.id = p.node_id
   AND u.kutumb_id IS NOT NULL
   AND (p.kutumb_id IS NULL OR p.kutumb_id <> u.kutumb_id);

-- BEFORE INSERT trigger — every new person gets a kutumb_id automatically.
CREATE OR REPLACE FUNCTION trg_fn_set_person_kutumb_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.kutumb_id IS NULL THEN
    NEW.kutumb_id := generate_person_kutumb_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_person_kutumb_id ON public.persons;
CREATE TRIGGER trg_set_person_kutumb_id
  BEFORE INSERT ON public.persons
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_set_person_kutumb_id();


-- ─── 2. vanshas table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vanshas (
    vansha_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    vansh_code  TEXT        UNIQUE,
    vansh_name  TEXT,
    founder_node_id UUID,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION generate_vansh_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet  TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate TEXT;
  i         INT;
BEGIN
  LOOP
    candidate := 'VS';
    FOR i IN 1..8 LOOP
      candidate := candidate || substr(alphabet, (floor(random() * 32))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.vanshas WHERE vansh_code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

-- Backfill vanshas rows for every distinct vansha_id already used in persons.
INSERT INTO public.vanshas (vansha_id)
SELECT DISTINCT p.vansha_id
  FROM public.persons p
 WHERE p.vansha_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.vanshas v WHERE v.vansha_id = p.vansha_id)
ON CONFLICT DO NOTHING;

-- Assign vansh_code to any row missing one.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT vansha_id FROM public.vanshas WHERE vansh_code IS NULL LOOP
    UPDATE public.vanshas
       SET vansh_code = generate_vansh_code()
     WHERE vansha_id = rec.vansha_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION trg_fn_set_vansh_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.vansh_code IS NULL THEN
    NEW.vansh_code := generate_vansh_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_vansh_code ON public.vanshas;
CREATE TRIGGER trg_set_vansh_code
  BEFORE INSERT ON public.vanshas
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_set_vansh_code();

ALTER TABLE public.vanshas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vanshas' AND policyname = 'vanshas_read') THEN
    CREATE POLICY vanshas_read ON public.vanshas FOR SELECT TO authenticated USING (true);
  END IF;
END $$;


-- ─── 3. relationships edge table ─────────────────────────────────────────────
-- GEDCOM-style: only two edge types (parent_of, spouse_of). Subtype captures
-- biological vs adopted vs step. Direction matters for parent_of (from = parent,
-- to = child); spouse_of is symmetric (we store one row per couple).

CREATE TABLE IF NOT EXISTS public.relationships (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    vansha_id     UUID        NOT NULL,
    from_node_id  UUID        NOT NULL REFERENCES public.persons(node_id) ON DELETE CASCADE,
    to_node_id    UUID        NOT NULL REFERENCES public.persons(node_id) ON DELETE CASCADE,
    type          TEXT        NOT NULL CHECK (type IN ('parent_of', 'spouse_of')),
    subtype       TEXT        NOT NULL DEFAULT 'biological'
                              CHECK (subtype IN ('biological', 'adopted', 'step')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT relationships_no_self CHECK (from_node_id <> to_node_id)
);

-- Prevent duplicate edges of the same kind between the same pair.
CREATE UNIQUE INDEX IF NOT EXISTS uq_relationships_edge
  ON public.relationships (from_node_id, to_node_id, type);

CREATE INDEX IF NOT EXISTS idx_relationships_vansha ON public.relationships (vansha_id);
CREATE INDEX IF NOT EXISTS idx_relationships_from   ON public.relationships (from_node_id);
CREATE INDEX IF NOT EXISTS idx_relationships_to     ON public.relationships (to_node_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type   ON public.relationships (type);

ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'relationships' AND policyname = 'relationships_read') THEN
    CREATE POLICY relationships_read ON public.relationships FOR SELECT TO authenticated USING (true);
  END IF;
END $$;


-- ─── 4. canvas_offset columns on persons ─────────────────────────────────────
-- Drag-and-drop saves a manual offset on top of the auto-computed position.
-- NULL = no manual offset (use auto-layout); set = added to auto position.

ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS canvas_offset_x DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS canvas_offset_y DOUBLE PRECISION;


-- ─── 5. Backfill relationships from existing lineage ─────────────────────────

-- 5a. parent_of edges from father_node_id
INSERT INTO public.relationships (vansha_id, from_node_id, to_node_id, type, subtype)
SELECT p.vansha_id, p.father_node_id, p.node_id, 'parent_of', 'biological'
  FROM public.persons p
 WHERE p.father_node_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.persons f WHERE f.node_id = p.father_node_id)
ON CONFLICT (from_node_id, to_node_id, type) DO NOTHING;

-- 5b. parent_of edges from mother_node_id
INSERT INTO public.relationships (vansha_id, from_node_id, to_node_id, type, subtype)
SELECT p.vansha_id, p.mother_node_id, p.node_id, 'parent_of', 'biological'
  FROM public.persons p
 WHERE p.mother_node_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.persons m WHERE m.node_id = p.mother_node_id)
ON CONFLICT (from_node_id, to_node_id, type) DO NOTHING;

-- 5c. parent_of edges derived from parent_union_id (when father/mother fields blank)
-- Guard against stale union rows whose male/female_node_id no longer exists in persons.
INSERT INTO public.relationships (vansha_id, from_node_id, to_node_id, type, subtype)
SELECT p.vansha_id, u.male_node_id, p.node_id, 'parent_of', 'biological'
  FROM public.persons p
  JOIN public.unions  u ON u.union_id = p.parent_union_id
 WHERE u.male_node_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.persons f WHERE f.node_id = u.male_node_id)
ON CONFLICT (from_node_id, to_node_id, type) DO NOTHING;

INSERT INTO public.relationships (vansha_id, from_node_id, to_node_id, type, subtype)
SELECT p.vansha_id, u.female_node_id, p.node_id, 'parent_of', 'biological'
  FROM public.persons p
  JOIN public.unions  u ON u.union_id = p.parent_union_id
 WHERE u.female_node_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.persons m WHERE m.node_id = u.female_node_id)
ON CONFLICT (from_node_id, to_node_id, type) DO NOTHING;

-- 5d. spouse_of edges from unions table (one row per couple, male → female).
-- Skip unions where either side references a deleted person.
INSERT INTO public.relationships (vansha_id, from_node_id, to_node_id, type, subtype)
SELECT u.vansha_id, u.male_node_id, u.female_node_id, 'spouse_of', 'biological'
  FROM public.unions u
 WHERE u.male_node_id IS NOT NULL AND u.female_node_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.persons p WHERE p.node_id = u.male_node_id)
   AND EXISTS (SELECT 1 FROM public.persons p WHERE p.node_id = u.female_node_id)
ON CONFLICT (from_node_id, to_node_id, type) DO NOTHING;


-- ─── 6. updated_at trigger for vanshas ───────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_fn_vanshas_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vanshas_updated_at ON public.vanshas;
CREATE TRIGGER trg_vanshas_updated_at
  BEFORE UPDATE ON public.vanshas
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_vanshas_touch_updated_at();
