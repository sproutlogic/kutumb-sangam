-- 020: Test seed accounts — 2 per role, activatable via Supabase SQL editor
-- Password for all accounts: Test@1234
-- Run this in the Supabase SQL editor (uses auth schema directly)

-- ── Step 1: Create auth.users entries ──────────────────────────────────────────
-- Uses predetermined UUIDs so public.users FK inserts are stable

DO $$
DECLARE
    accounts JSONB := '[
        {"id":"00000001-0000-0000-0000-000000000001","email":"user1@test.kutumb.in"},
        {"id":"00000001-0000-0000-0000-000000000002","email":"user2@test.kutumb.in"},
        {"id":"00000002-0000-0000-0000-000000000001","email":"margdarshak1@test.kutumb.in"},
        {"id":"00000002-0000-0000-0000-000000000002","email":"margdarshak2@test.kutumb.in"},
        {"id":"00000003-0000-0000-0000-000000000001","email":"admin1@test.kutumb.in"},
        {"id":"00000003-0000-0000-0000-000000000002","email":"admin2@test.kutumb.in"},
        {"id":"00000004-0000-0000-0000-000000000001","email":"superadmin1@test.kutumb.in"},
        {"id":"00000004-0000-0000-0000-000000000002","email":"superadmin2@test.kutumb.in"},
        {"id":"00000005-0000-0000-0000-000000000001","email":"se1@test.kutumb.in"},
        {"id":"00000005-0000-0000-0000-000000000002","email":"se2@test.kutumb.in"},
        {"id":"00000006-0000-0000-0000-000000000001","email":"cp1@test.kutumb.in"},
        {"id":"00000006-0000-0000-0000-000000000002","email":"cp2@test.kutumb.in"},
        {"id":"00000007-0000-0000-0000-000000000001","email":"rp1@test.kutumb.in"},
        {"id":"00000007-0000-0000-0000-000000000002","email":"rp2@test.kutumb.in"},
        {"id":"00000008-0000-0000-0000-000000000001","email":"zp1@test.kutumb.in"},
        {"id":"00000008-0000-0000-0000-000000000002","email":"zp2@test.kutumb.in"},
        {"id":"00000009-0000-0000-0000-000000000001","email":"np1@test.kutumb.in"},
        {"id":"00000009-0000-0000-0000-000000000002","email":"np2@test.kutumb.in"},
        {"id":"00000010-0000-0000-0000-000000000001","email":"office1@test.kutumb.in"},
        {"id":"00000010-0000-0000-0000-000000000002","email":"office2@test.kutumb.in"},
        {"id":"00000011-0000-0000-0000-000000000001","email":"finance1@test.kutumb.in"},
        {"id":"00000011-0000-0000-0000-000000000002","email":"finance2@test.kutumb.in"}
    ]';
    acc JSONB;
BEGIN
    FOR acc IN SELECT * FROM jsonb_array_elements(accounts)
    LOOP
        INSERT INTO auth.users (
            id,
            instance_id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            is_super_admin,
            created_at,
            updated_at
        ) VALUES (
            (acc->>'id')::UUID,
            '00000000-0000-0000-0000-000000000000',
            'authenticated',
            'authenticated',
            acc->>'email',
            crypt('Test@1234', gen_salt('bf')),
            NOW(),
            '{"provider":"email","providers":["email"]}',
            '{}',
            false,
            NOW(),
            NOW()
        ) ON CONFLICT (id) DO NOTHING;
    END LOOP;
END $$;

-- ── Step 2: Create public.users entries with correct roles ─────────────────────

INSERT INTO public.users (id, role, full_name, onboarding_complete) VALUES
    -- Regular users (must complete onboarding)
    ('00000001-0000-0000-0000-000000000001', 'user',         'Test User One',         false),
    ('00000001-0000-0000-0000-000000000002', 'user',         'Test User Two',         false),
    -- Margdarshaks (onboarding exempt)
    ('00000002-0000-0000-0000-000000000001', 'margdarshak',  'Test Margdarshak One',  true),
    ('00000002-0000-0000-0000-000000000002', 'margdarshak',  'Test Margdarshak Two',  true),
    -- Admins
    ('00000003-0000-0000-0000-000000000001', 'admin',        'Test Admin One',        true),
    ('00000003-0000-0000-0000-000000000002', 'admin',        'Test Admin Two',        true),
    -- Superadmins
    ('00000004-0000-0000-0000-000000000001', 'superadmin',   'Test Superadmin One',   true),
    ('00000004-0000-0000-0000-000000000002', 'superadmin',   'Test Superadmin Two',   true),
    -- Sales Executives
    ('00000005-0000-0000-0000-000000000001', 'se',           'Test SE One',           true),
    ('00000005-0000-0000-0000-000000000002', 'se',           'Test SE Two',           true),
    -- City Partners
    ('00000006-0000-0000-0000-000000000001', 'cp',           'Test CP One',           true),
    ('00000006-0000-0000-0000-000000000002', 'cp',           'Test CP Two',           true),
    -- Regional Partners
    ('00000007-0000-0000-0000-000000000001', 'rp',           'Test RP One',           true),
    ('00000007-0000-0000-0000-000000000002', 'rp',           'Test RP Two',           true),
    -- Zone Partners
    ('00000008-0000-0000-0000-000000000001', 'zp',           'Test ZP One',           true),
    ('00000008-0000-0000-0000-000000000002', 'zp',           'Test ZP Two',           true),
    -- National Partners
    ('00000009-0000-0000-0000-000000000001', 'np',           'Test NP One',           true),
    ('00000009-0000-0000-0000-000000000002', 'np',           'Test NP Two',           true),
    -- Office staff (onboarding exempt)
    ('00000010-0000-0000-0000-000000000001', 'office',       'Test Office One',       true),
    ('00000010-0000-0000-0000-000000000002', 'office',       'Test Office Two',       true),
    -- Finance staff (onboarding exempt)
    ('00000011-0000-0000-0000-000000000001', 'finance',      'Test Finance One',      true),
    ('00000011-0000-0000-0000-000000000002', 'finance',      'Test Finance Two',      true)
ON CONFLICT (id) DO UPDATE SET
    role             = EXCLUDED.role,
    full_name        = EXCLUDED.full_name,
    onboarding_complete = EXCLUDED.onboarding_complete;

-- ── Step 3: Sales performance rows for sales-role accounts ────────────────────

INSERT INTO public.sales_performance (user_id, personal_sales, team_sales, pending_support_cases)
SELECT id, 5, 12, 1
FROM public.users
WHERE role IN ('se', 'cp', 'rp', 'zp', 'np')
  AND id::TEXT LIKE '0000000%'
ON CONFLICT (user_id) DO NOTHING;

-- ── Verification: list all test accounts ──────────────────────────────────────
-- Run this separately to confirm:
-- SELECT u.full_name, u.role, a.email
-- FROM public.users u
-- JOIN auth.users a ON a.id = u.id
-- WHERE u.id::TEXT LIKE '0000000%'
-- ORDER BY u.role, u.full_name;
