-- Sales dashboard migration: centralized payout settings + per-user sales metrics.

-- 1) Extend roles for sales hierarchy and superadmin.
ALTER TABLE public.users
    DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('user', 'pandit', 'admin', 'superadmin', 'np', 'zp', 'rp', 'cp', 'se'));

-- 2) Global sales settings row (editable by superadmin/admin through API).
CREATE TABLE IF NOT EXISTS public.sales_settings (
    id                  TEXT PRIMARY KEY,
    product_price       NUMERIC(12,2) NOT NULL DEFAULT 999,
    se_direct_incentive NUMERIC(12,2) NOT NULL DEFAULT 200,
    cp_override         NUMERIC(12,2) NOT NULL DEFAULT 100,
    rp_trade_discount   NUMERIC(5,2)  NOT NULL DEFAULT 35,
    zp_trade_discount   NUMERIC(5,2)  NOT NULL DEFAULT 38,
    np_trade_discount   NUMERIC(5,2)  NOT NULL DEFAULT 40,
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

INSERT INTO public.sales_settings (
    id, product_price, se_direct_incentive, cp_override, rp_trade_discount, zp_trade_discount, np_trade_discount
)
VALUES ('global', 999, 200, 100, 35, 38, 40)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_sales_settings_updated_at ON public.sales_settings;
CREATE TRIGGER trg_sales_settings_updated_at
    BEFORE UPDATE ON public.sales_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Per-user sales performance data used by secure server-side dashboard filtering.
CREATE TABLE IF NOT EXISTS public.sales_performance (
    user_id                 UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    personal_sales          INTEGER NOT NULL DEFAULT 0 CHECK (personal_sales >= 0),
    team_sales              INTEGER NOT NULL DEFAULT 0 CHECK (team_sales >= 0),
    pending_support_cases   INTEGER NOT NULL DEFAULT 0 CHECK (pending_support_cases >= 0),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_sales_performance_updated_at ON public.sales_performance;
CREATE TRIGGER trg_sales_performance_updated_at
    BEFORE UPDATE ON public.sales_performance
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_sales_performance_updated_at
    ON public.sales_performance(updated_at DESC);
