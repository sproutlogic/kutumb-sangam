-- 038_kutumbid_profile_columns.sql
-- Adds all KutumbID Vyakti + Kul profile fields to the persons table.
-- Every column defaults to '' so existing rows are unaffected.
-- Idempotent — safe to re-run.

-- ─── Vyakti (Individual) fields ──────────────────────────────────────────────

ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS punyatithi        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS marital_status    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS education         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mool_niwas_city   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS nanighar          TEXT NOT NULL DEFAULT '';

-- ─── Kul (Lineage / Cultural) fields ────────────────────────────────────────

ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS vansh_label       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pravara           TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ved_shakha        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ritual_sutra      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS kul_devi          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS kul_devi_sthan    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ishta_devta       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tirth_purohit     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pravas_history    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS paitrik_niwas     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS gram_devta        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pidhi_label       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS vivah_sambandh    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS kul_achara        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS manat             TEXT NOT NULL DEFAULT '';
