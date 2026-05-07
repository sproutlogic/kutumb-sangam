-- 040_profile_extended_fields.sql
-- Adds extended Vyakti profile columns missing from 038.
-- All default to '' so existing rows are unaffected.
-- Idempotent — safe to re-run.

ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS common_name          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS marriage_anniversary TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS janmasthan_village   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS janmasthan_city      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mool_niwas_village   TEXT NOT NULL DEFAULT '';
