-- 025_node_claims.sql
-- Node ownership claim pipeline.
-- A user can request to claim a person node as their own identity.
-- The vansha creator reviews and approves/rejects.
-- On approval, persons.owner_id is set to the claimant's user id.

-- 1. Add owner_id to persons (nullable — NULL means "created by tree but not yet claimed by a real user")
ALTER TABLE public.persons
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_persons_owner_id ON public.persons(owner_id);

-- 2. node_claims — one pending claim per (node, claimant) pair
CREATE TABLE IF NOT EXISTS public.node_claims (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id         TEXT        NOT NULL,                          -- persons.node_id
    vansha_id       UUID        NOT NULL,                          -- scoped to vansha
    claimant_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status          TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at     TIMESTAMPTZ,
    reject_reason   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One active claim per (node, claimant) — prevents spam
    UNIQUE (node_id, claimant_id)
);

CREATE INDEX IF NOT EXISTS idx_node_claims_node_id     ON public.node_claims(node_id);
CREATE INDEX IF NOT EXISTS idx_node_claims_claimant    ON public.node_claims(claimant_id);
CREATE INDEX IF NOT EXISTS idx_node_claims_vansha      ON public.node_claims(vansha_id);
CREATE INDEX IF NOT EXISTS idx_node_claims_status      ON public.node_claims(status);

CREATE OR REPLACE FUNCTION public.set_node_claim_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_node_claim_updated_at ON public.node_claims;
CREATE TRIGGER trg_node_claim_updated_at
    BEFORE UPDATE ON public.node_claims
    FOR EACH ROW EXECUTE FUNCTION public.set_node_claim_updated_at();

-- RLS: claimant sees their own claims; backend service role handles writes.
ALTER TABLE public.node_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "node_claims_self_read" ON public.node_claims;
CREATE POLICY "node_claims_self_read"
    ON public.node_claims FOR SELECT
    USING (auth.uid() = claimant_id);
