-- ── Migration 004: ltree paths + recursive ancestor/descendant functions ──────
-- Safe to re-run (IF NOT EXISTS / OR REPLACE everywhere).

-- ── Extension ─────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS ltree;

-- ── Column: materialized ancestry path ───────────────────────────────────────
ALTER TABLE public.persons
    ADD COLUMN IF NOT EXISTS lineage_path ltree;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_persons_lineage_path
    ON public.persons USING GIST (lineage_path);

CREATE INDEX IF NOT EXISTS idx_persons_lineage_path_btree
    ON public.persons USING BTREE (lineage_path);

CREATE INDEX IF NOT EXISTS idx_persons_vansha_gen
    ON public.persons (vansha_id, generation);

-- ── Helper: UUID → ltree-safe label (replace hyphens with underscores) ────────
CREATE OR REPLACE FUNCTION public.uuid_to_ltree_label(p_uuid UUID)
RETURNS TEXT LANGUAGE SQL IMMUTABLE STRICT AS $$
    SELECT replace(p_uuid::text, '-', '_');
$$;

-- ── Function: ancestors_of(node_id) ──────────────────────────────────────────
-- Returns all ancestors of a person, walking up via father_node_id.
-- Columns: node_id, first_name, last_name, generation, depth (hops from start)
CREATE OR REPLACE FUNCTION public.ancestors_of(p_node UUID)
RETURNS TABLE(
    node_id    UUID,
    first_name TEXT,
    last_name  TEXT,
    generation INTEGER,
    depth      INTEGER
) LANGUAGE SQL STABLE AS $$
    WITH RECURSIVE walk(node_id, first_name, last_name, generation, father_node_id, depth) AS (
        -- base: the person themselves
        SELECT
            p.node_id,
            p.first_name,
            p.last_name,
            p.generation,
            p.father_node_id,
            0
        FROM public.persons p
        WHERE p.node_id = p_node

        UNION ALL

        -- recursive: step up to father
        SELECT
            parent.node_id,
            parent.first_name,
            parent.last_name,
            parent.generation,
            parent.father_node_id,
            walk.depth + 1
        FROM public.persons parent
        JOIN walk ON walk.father_node_id = parent.node_id
        WHERE walk.father_node_id IS NOT NULL
          AND walk.depth < 25   -- guard against cycles / runaway
    )
    SELECT node_id, first_name, last_name, generation, depth
    FROM walk
    WHERE depth > 0   -- exclude the starting node
    ORDER BY depth;
$$;

-- ── Function: descendants_of(node_id) ────────────────────────────────────────
-- Returns all descendants, walking down via parent_union_id → children.
-- Columns: node_id, first_name, last_name, generation, depth
CREATE OR REPLACE FUNCTION public.descendants_of(p_node UUID)
RETURNS TABLE(
    node_id    UUID,
    first_name TEXT,
    last_name  TEXT,
    generation INTEGER,
    depth      INTEGER
) LANGUAGE SQL STABLE AS $$
    WITH RECURSIVE walk(node_id, first_name, last_name, generation, depth) AS (
        -- base: direct children (persons whose father_node_id = p_node)
        SELECT
            p.node_id,
            p.first_name,
            p.last_name,
            p.generation,
            1
        FROM public.persons p
        WHERE p.father_node_id = p_node

        UNION ALL

        -- recursive: their children
        SELECT
            child.node_id,
            child.first_name,
            child.last_name,
            child.generation,
            walk.depth + 1
        FROM public.persons child
        JOIN walk ON child.father_node_id = walk.node_id
        WHERE walk.depth < 25   -- guard
    )
    SELECT node_id, first_name, last_name, generation, depth
    FROM walk
    ORDER BY depth, generation;
$$;

-- ── Function: backfill_lineage_paths() ───────────────────────────────────────
-- One-time backfill for existing rows. Call after running this migration.
-- Processes roots first, then propagates down generation by generation.
CREATE OR REPLACE FUNCTION public.backfill_lineage_paths()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    updated INTEGER := 0;
    pass_updated INTEGER;
BEGIN
    -- Roots: persons with no father
    UPDATE public.persons
    SET lineage_path = text2ltree(public.uuid_to_ltree_label(node_id))
    WHERE father_node_id IS NULL
      AND lineage_path IS NULL;

    GET DIAGNOSTICS updated = ROW_COUNT;

    -- Iteratively propagate downward (up to 25 generations)
    FOR i IN 1..25 LOOP
        UPDATE public.persons child
        SET lineage_path = text2ltree(
            father.lineage_path::text || '.' || public.uuid_to_ltree_label(child.node_id)
        )
        FROM public.persons father
        WHERE child.father_node_id = father.node_id
          AND father.lineage_path IS NOT NULL
          AND child.lineage_path IS NULL;

        GET DIAGNOSTICS pass_updated = ROW_COUNT;
        updated := updated + pass_updated;
        EXIT WHEN pass_updated = 0;
    END LOOP;

    RETURN updated;
END;
$$;
