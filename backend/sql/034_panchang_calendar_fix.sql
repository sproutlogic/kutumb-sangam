-- Migration 034: Fix panchang_calendar schema + make tithi_id nullable
-- Run in Supabase SQL editor.
--
-- Fixes:
-- 1. Add missing columns (masa_name, samvat_year, is_kshaya, is_adhika) if absent
-- 2. Make tithi_id nullable — panchang data should cache even when tithis
--    table is empty; eco_recommendation gracefully returns empty strings.
-- 3. Relax source CHECK to include 'prokerala' for future use.

-- ── Add missing columns ───────────────────────────────────────────────────────
ALTER TABLE public.panchang_calendar
  ADD COLUMN IF NOT EXISTS masa_name    text,
  ADD COLUMN IF NOT EXISTS samvat_year  smallint,
  ADD COLUMN IF NOT EXISTS is_kshaya    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_adhika    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tithi_start_ts timestamptz,
  ADD COLUMN IF NOT EXISTS tithi_end_ts   timestamptz,
  ADD COLUMN IF NOT EXISTS nakshatra    text,
  ADD COLUMN IF NOT EXISTS yoga         text;

-- ── Make tithi_id nullable (FK still present; just not required) ──────────────
ALTER TABLE public.panchang_calendar
  ALTER COLUMN tithi_id DROP NOT NULL;

-- ── Extend source CHECK to include prokerala ──────────────────────────────────
ALTER TABLE public.panchang_calendar
  DROP CONSTRAINT IF EXISTS panchang_calendar_source_check;
ALTER TABLE public.panchang_calendar
  ADD CONSTRAINT panchang_calendar_source_check
  CHECK (source IN ('drik_panchanga','prokerala','manual'));
