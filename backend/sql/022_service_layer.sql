-- Migration 022: Eco Service Layer
-- service_packages (seed) + vendors + service_orders + vendor_assignments + proof_submissions
-- Run BEFORE 021 (021 has FKs to service_orders and vendors).

-- ── Service Packages: 3 products (admin-price-overridable) ───────────────────

CREATE TABLE IF NOT EXISTS public.service_packages (
    id              text        PRIMARY KEY,  -- 'taruvara' | 'dashavruksha' | 'jala_setu'
    name_sanskrit   text        NOT NULL,
    name_english    text        NOT NULL,
    description     text        NOT NULL,
    price_paise     integer     NOT NULL,     -- default; runtime override from platform_config
    tree_count      integer     NOT NULL DEFAULT 0,
    care_months     integer     NOT NULL DEFAULT 12,
    includes_water_station boolean NOT NULL DEFAULT false,
    is_active       boolean     NOT NULL DEFAULT true,
    created_at      timestamptz DEFAULT now()
);

INSERT INTO public.service_packages
    (id, name_sanskrit, name_english, description, price_paise, tree_count, care_months, includes_water_station, is_active)
VALUES
    ('taruvara',     'तरुवर',    'One Tree',
     'Plant 1 native tree + 12-month professional care by a verified nursery partner. Includes Proof of Green Legacy (geo-tagged photo + Prakriti Score update).',
     149900, 1, 12, false, true),

    ('dashavruksha', 'दशवृक्ष', 'Ten Trees',
     'Plant 10 native trees + 12-month professional care — build your family grove. Includes quarterly care updates and Proof of Green Legacy for each tree.',
     1199900, 10, 12, false, true),

    ('jala_setu',    'जल सेतु', 'Water Station',
     'Install a dedicated animal water station (birds, cattle, wildlife) + 12-month maintenance by a verified partner. Includes seasonal refill reminders.',
     249900, 0, 12, true, true)

ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_packages_public_read" ON public.service_packages
    FOR SELECT USING (true);


-- ── Vendors: nurseries and NGOs ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vendors (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        REFERENCES public.users(id) ON DELETE SET NULL,  -- vendor login

    name            text        NOT NULL,
    org_name        text,
    contact_phone   text        NOT NULL,
    contact_email   text        NOT NULL,
    gstin           text,

    -- Geographic service area
    service_area_lat    numeric(9,6),
    service_area_lon    numeric(9,6),
    service_radius_km   integer  NOT NULL DEFAULT 30,
    location_name       text     NOT NULL,
    state               text     NOT NULL,

    -- Capabilities
    can_plant_trees     boolean  NOT NULL DEFAULT true,
    can_water_station   boolean  NOT NULL DEFAULT false,

    -- Trust / KYC
    kyc_status      text        NOT NULL DEFAULT 'pending'
        CHECK (kyc_status IN ('pending','approved','suspended')),
    kyc_verified_by uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    kyc_verified_at timestamptz,
    rating          numeric(3,2) DEFAULT 5.0,

    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_kyc      ON public.vendors (kyc_status);
CREATE INDEX IF NOT EXISTS idx_vendors_coords   ON public.vendors (service_area_lat, service_area_lon)
    WHERE service_area_lat IS NOT NULL;

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
-- Vendors see their own row; service role (backend) sees all
CREATE POLICY "vendors_own_select" ON public.vendors
    FOR SELECT USING (user_id = auth.uid());


-- ── Service Orders ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.service_orders (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    vansha_id       text        NOT NULL,
    user_id         uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    package_id      text        NOT NULL REFERENCES public.service_packages(id),

    -- Payment link (reuses existing payments infrastructure)
    payment_id      uuid        REFERENCES public.payments(id) ON DELETE SET NULL,
    payment_status  text        NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending','paid','refunded','failed')),

    -- Delivery
    delivery_location_text  text    NOT NULL,
    delivery_lat    numeric(9,6),
    delivery_lon    numeric(9,6),
    preferred_date  date,

    -- Assigned vendor
    vendor_id       uuid        REFERENCES public.vendors(id) ON DELETE SET NULL,
    assigned_at     timestamptz,

    -- Order lifecycle
    status          text        NOT NULL DEFAULT 'created'
        CHECK (status IN (
            'created','paid','assigned','in_progress',
            'proof_submitted','completed','cancelled','disputed'
        )),

    -- 12-month care schedule stored as JSONB array
    -- e.g. [{"month":3,"due_date":"2025-07-01","status":"pending","proof_id":null}, ...]
    care_schedule   jsonb       NOT NULL DEFAULT '[]'::jsonb,

    notes           text,
    completed_at    timestamptz,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_svc_orders_vansha  ON public.service_orders (vansha_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_svc_orders_user    ON public.service_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_svc_orders_vendor  ON public.service_orders (vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_svc_orders_status  ON public.service_orders (status);

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "svc_orders_user_select" ON public.service_orders
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "svc_orders_user_insert" ON public.service_orders
    FOR INSERT WITH CHECK (user_id = auth.uid());


-- ── Vendor Assignments ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vendor_assignments (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    service_order_id uuid       NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
    vendor_id       uuid        NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,

    assignment_type text        NOT NULL DEFAULT 'primary'
        CHECK (assignment_type IN ('primary','backup','care_followup')),

    notified_at     timestamptz,
    accepted_at     timestamptz,
    rejected_at     timestamptz,
    rejection_reason text,

    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_order  ON public.vendor_assignments (service_order_id);
CREATE INDEX IF NOT EXISTS idx_va_vendor ON public.vendor_assignments (vendor_id, created_at DESC);


-- ── Proof Submissions ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.proof_submissions (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    service_order_id uuid       NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
    vendor_id       uuid        NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,

    submission_type text        NOT NULL DEFAULT 'initial'
        CHECK (submission_type IN (
            'initial','care_month_3','care_month_6','care_month_9','care_month_12','adhoc'
        )),

    -- Proof media (up to 5 photos in Supabase Storage)
    photo_urls      text[]      NOT NULL DEFAULT '{}',
    geo_lat         numeric(9,6) NOT NULL,
    geo_lon         numeric(9,6) NOT NULL,
    geo_accuracy_m  integer,
    captured_at     timestamptz NOT NULL,   -- device timestamp from vendor

    vendor_notes    text,

    -- Auto-verification results
    status          text        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','auto_approved','approved','rejected','escalated')),
    auto_geo_ok     boolean,   -- geo_lat/lon within 500m of delivery address
    auto_time_ok    boolean,   -- captured_at within expected service window

    -- Manual review (Paryavaran Mitra)
    reviewed_by     uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at     timestamptz,
    review_notes    text,

    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proof_order  ON public.proof_submissions (service_order_id, submission_type);
CREATE INDEX IF NOT EXISTS idx_proof_status ON public.proof_submissions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proof_vendor ON public.proof_submissions (vendor_id);
