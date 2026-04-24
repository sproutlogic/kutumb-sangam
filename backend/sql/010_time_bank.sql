-- ── time_bank_offers + time_bank_transactions ───────────────────────────────
-- Time Bank: members offer services measured in hours; others request them.
-- Credits are earned by providing services; spent by receiving them.

CREATE TABLE IF NOT EXISTS public.time_bank_offers (
    id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         text        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    vansha_id       text        NOT NULL,
    title           text        NOT NULL,
    description     text,
    hours_available float       NOT NULL DEFAULT 1.0 CHECK (hours_available > 0),
    category        text        NOT NULL DEFAULT 'general',
    is_active       boolean     NOT NULL DEFAULT true,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tbo_vansha ON public.time_bank_offers (vansha_id, is_active);

CREATE TABLE IF NOT EXISTS public.time_bank_transactions (
    id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    offer_id        uuid        REFERENCES public.time_bank_offers(id) ON DELETE SET NULL,
    provider_id     text        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    requester_id    text        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    vansha_id       text        NOT NULL,
    hours           float       NOT NULL CHECK (hours > 0),
    status          text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','accepted','completed','cancelled')),
    notes           text,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tbt_provider   ON public.time_bank_transactions (provider_id);
CREATE INDEX IF NOT EXISTS idx_tbt_requester  ON public.time_bank_transactions (requester_id);
CREATE INDEX IF NOT EXISTS idx_tbt_vansha     ON public.time_bank_transactions (vansha_id);

ALTER TABLE public.time_bank_offers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tbo_read" ON public.time_bank_offers;
CREATE POLICY "tbo_read" ON public.time_bank_offers FOR SELECT USING (true);

DROP POLICY IF EXISTS "tbt_self_read" ON public.time_bank_transactions;
CREATE POLICY "tbt_self_read"
    ON public.time_bank_transactions FOR SELECT
    USING (auth.uid()::text IN (provider_id, requester_id));
