-- Run once in Supabase SQL editor before using POST /api/verification/request.

CREATE TABLE IF NOT EXISTS public.verification_requests (
  id UUID PRIMARY KEY,
  vansha_id UUID NOT NULL,
  node_id UUID NOT NULL,
  requested_by UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_requests_vansha_status
  ON public.verification_requests (vansha_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_verification_requests_node_status
  ON public.verification_requests (node_id, status, created_at DESC);

-- Prevent duplicate active requests for same member.
CREATE UNIQUE INDEX IF NOT EXISTS ux_verification_requests_pending_per_node
  ON public.verification_requests (vansha_id, node_id)
  WHERE status = 'pending';
