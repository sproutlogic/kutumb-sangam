-- ── 018_middle_name.sql ───────────────────────────────────────────────────────
-- Adds optional middle_name to persons.
-- Middle name is separate from given_name because it is often not a name
-- given by the father and carries different genealogical meaning.

ALTER TABLE public.persons
    ADD COLUMN IF NOT EXISTS middle_name text;
