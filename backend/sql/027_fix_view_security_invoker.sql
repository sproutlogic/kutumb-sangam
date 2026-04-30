-- Migration 027: Fix SECURITY DEFINER warning on green_legacy_timeline
-- Supabase linter flags views that run with view-owner permissions (bypassing RLS).
-- Setting security_invoker = true makes the view use the *querying user's* RLS policies.
-- Requires PostgreSQL 15+ (Supabase default since 2023).

ALTER VIEW public.green_legacy_timeline SET (security_invoker = true);
