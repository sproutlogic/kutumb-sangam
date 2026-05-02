-- ── 031: Add is_dashboard_task flag to samay_requests ────────────────────────
-- Dashboard-only personal tasks entered by the user on the Dashboard page.
-- These are NOT shown in the time-bank marketplace (filter: is_dashboard_task = false).
-- Run once on existing deployments; safe to re-run (IF NOT EXISTS guard via DO block).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'samay_requests'
          AND column_name  = 'is_dashboard_task'
    ) THEN
        ALTER TABLE public.samay_requests
            ADD COLUMN is_dashboard_task BOOLEAN NOT NULL DEFAULT false;
    END IF;
END$$;

-- Index for fast dashboard task lookup per user
CREATE INDEX IF NOT EXISTS idx_sreq_dashboard
    ON public.samay_requests (requester_id, is_dashboard_task)
    WHERE is_dashboard_task = true;
