-- ── Migration 033: Add title column to persons ───────────────────────────────
-- Honorific/occupational title (Shri, Smt., Dr., Prof., Adv., etc.)
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).

ALTER TABLE public.persons
    ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
