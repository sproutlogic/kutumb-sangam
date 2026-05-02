-- ── 032_sewa_items_fund.sql ─────────────────────────────────────────────────
-- Sewa Bank extension: community item-lending/donation + Seva Fund.
-- Socio-environmental purpose: tools for eco-work, seed banks, micro-lending
-- to community causes. NOT a family-affairs ledger.

-- ── Item Bank: lend or donate tools / seeds / eco-equipment ─────────────────
CREATE TABLE IF NOT EXISTS public.sewa_items (
    id              uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id        text          NOT NULL REFERENCES public.users(id),
    title           text          NOT NULL,
    description     text,
    category        text          NOT NULL DEFAULT 'general'
                                  CHECK (category IN (
                                      'tools', 'eco_kit', 'seeds', 'books',
                                      'equipment', 'general'
                                  )),
    item_type       text          NOT NULL DEFAULT 'lend'
                                  CHECK (item_type IN ('lend', 'donate')),
    status          text          NOT NULL DEFAULT 'available'
                                  CHECK (status IN (
                                      'available', 'borrowed', 'donated', 'unavailable'
                                  )),
    borrower_id     text          REFERENCES public.users(id),
    due_back_at     timestamptz,
    created_at      timestamptz   DEFAULT now(),
    updated_at      timestamptz   DEFAULT now()
);

-- ── Seva Fund: community micro-lending + cause donations ──────────────────────
-- This is NOT a payments table — it tracks community pledges and soft-loans
-- for eco/social causes (tree drives, water projects, relief camps, etc.)
CREATE TABLE IF NOT EXISTS public.seva_fund_entries (
    id              uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
    from_user_id    text          NOT NULL REFERENCES public.users(id),
    to_user_id      text          REFERENCES public.users(id),  -- NULL for cause donations
    amount          numeric(10,2) NOT NULL CHECK (amount > 0),
    entry_type      text          NOT NULL DEFAULT 'donate'
                                  CHECK (entry_type IN ('lend', 'donate')),
    -- For donations: which cause bucket (tree_drive, water_project, etc.)
    cause           text          CHECK (cause IN (
                                      'tree_drive', 'water_project', 'clean_energy',
                                      'education', 'relief', 'waste_mgmt', 'general'
                                  )),
    description     text,
    status          text          NOT NULL DEFAULT 'active'
                                  CHECK (status IN (
                                      'active', 'returned', 'donated', 'cancelled'
                                  )),
    due_back_at     timestamptz,   -- for lends, expected return date
    returned_at     timestamptz,   -- set when lend is returned
    created_at      timestamptz   DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sewa_items_owner   ON public.sewa_items(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_sewa_items_cat     ON public.sewa_items(category, status);
CREATE INDEX IF NOT EXISTS idx_seva_fund_from     ON public.seva_fund_entries(from_user_id);
CREATE INDEX IF NOT EXISTS idx_seva_fund_to       ON public.seva_fund_entries(to_user_id);
CREATE INDEX IF NOT EXISTS idx_seva_fund_cause    ON public.seva_fund_entries(cause);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.sewa_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seva_fund_entries ENABLE ROW LEVEL SECURITY;

-- Items are publicly visible (anyone can browse available items)
DROP POLICY IF EXISTS "sewa_items_pub_read" ON public.sewa_items;
CREATE POLICY "sewa_items_pub_read"
    ON public.sewa_items FOR SELECT USING (true);

-- Fund entries visible only to participants
DROP POLICY IF EXISTS "seva_fund_self_read" ON public.seva_fund_entries;
CREATE POLICY "seva_fund_self_read"
    ON public.seva_fund_entries FOR SELECT
    USING (
        from_user_id = auth.uid()::text
        OR to_user_id  = auth.uid()::text
    );
