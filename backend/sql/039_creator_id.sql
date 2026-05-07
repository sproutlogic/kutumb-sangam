-- 039_creator_id.sql
-- Adds creator_id to persons to track who added the node vs who owns (claimed) it.
--
-- Permission model:
--   creator_id  — the auth user who added this node to the tree
--   owner_id    — set when the actual person logs in and claims the node
--                 via their KutumbID code; empty/null = unclaimed
--
-- Edit rights:
--   BEFORE claim → creator can edit
--   AFTER  claim → only owner can edit

ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS creator_id TEXT NOT NULL DEFAULT '';

-- Backfill: for existing nodes owner_id was used as creator; copy it.
UPDATE public.persons
SET creator_id = owner_id
WHERE creator_id = '' AND owner_id IS NOT NULL AND owner_id != '';

-- New nodes created after this migration will have owner_id = '' (unclaimed)
-- and creator_id = the auth user who called POST /api/tree-v2/persons.
