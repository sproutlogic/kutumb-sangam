-- Run once in Supabase SQL editor before using PUT /api/matrimony/{vansha_id}.
-- Add a FK to your vanshas table later if you use one.

CREATE TABLE IF NOT EXISTS public.matrimony_profiles (
  vansha_id UUID PRIMARY KEY,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matrimony_profiles_updated ON public.matrimony_profiles (updated_at DESC);

COMMENT ON TABLE public.matrimony_profiles IS 'Matrimony preferences JSON per Vansha_ID (family cluster).';
