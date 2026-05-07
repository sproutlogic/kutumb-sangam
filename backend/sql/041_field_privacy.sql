-- 041_field_privacy.sql
-- Per-field privacy settings for each person node.
-- field_privacy is a JSONB map: { "field_name": "public" | "private" }
-- Missing key = private (default). Only fields set to "public" are
-- returned to non-owner/creator callers of GET /persons/{id}/profile.
-- Idempotent — safe to re-run.

ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS field_privacy JSONB NOT NULL DEFAULT '{}';
