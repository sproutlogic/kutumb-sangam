-- =============================================================================
-- 015_kutumb_pro.sql
-- Kutumb Pro: Community OS layer.
-- Organisations, tier memberships, invite system, access enquiries.
--
-- Design rules:
--   • Zero regression — base users/persons/unions tables untouched except
--     one additive boolean column (kutumb_pro) on users.
--   • Org data is strictly isolated via RLS: only org members see their org.
--   • L-Credits (local) are stored per membership row and never mixed with
--     Samay / Sewa Chakra global credits.
--   • Tiers 1 and 5 are always active. Tiers 2/3/4 are togglable.
--
-- NOTE: All RLS policies are defined AFTER all tables are created to avoid
--       forward-reference errors (e.g. organizations policy referencing org_members).
-- =============================================================================

-- ─── 0. Kutumb Pro flag on users (additive only) ─────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS kutumb_pro BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN users.kutumb_pro IS 'Set to true by admin when a Kutumb Pro enquiry is approved.';

-- ─── 1. organisations ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name             TEXT        NOT NULL,
  slug             TEXT        UNIQUE NOT NULL,            -- URL-safe, e.g. "sunrise-welfare-trust"
  description      TEXT,
  framework_type   TEXT        NOT NULL
                     CHECK (framework_type IN ('spiritual','political','ngo','university','rwa','custom')),

  -- Head (Tier 1)
  head_user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Five-tier alias system (all 100 % editable after creation)
  tier1_alias      TEXT        NOT NULL DEFAULT 'Custodian',
  tier2_alias      TEXT        NOT NULL DEFAULT 'Pillar',
  tier3_alias      TEXT        NOT NULL DEFAULT 'Steward',
  tier4_alias      TEXT        NOT NULL DEFAULT 'Partner',
  tier5_alias      TEXT        NOT NULL DEFAULT 'Member',

  -- Tier activation (1 & 5 are always on; 2/3/4 are optional)
  is_tier2_active  BOOLEAN     NOT NULL DEFAULT true,
  is_tier3_active  BOOLEAN     NOT NULL DEFAULT true,
  is_tier4_active  BOOLEAN     NOT NULL DEFAULT true,

  -- Local currency
  currency_name    TEXT        NOT NULL DEFAULT 'Credit',
  currency_emoji   TEXT        NOT NULL DEFAULT '💫',

  -- Branding (logo_url, primary_color, accent_color)
  branding_config  JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- Status
  status           TEXT        NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','suspended','archived')),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_head      ON organizations (head_user_id);
CREATE INDEX IF NOT EXISTS idx_organizations_framework ON organizations (framework_type);

CREATE OR REPLACE FUNCTION trg_fn_organizations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION trg_fn_organizations_updated_at();

COMMENT ON TABLE  organizations               IS 'Kutumb Pro: one row per community / organisation.';
COMMENT ON COLUMN organizations.slug          IS 'URL-safe unique identifier. Auto-generated; editable later.';
COMMENT ON COLUMN organizations.tier1_alias   IS 'Head title. Framework default: e.g. Acharya, Adhyaksh, Patron.';
COMMENT ON COLUMN organizations.currency_name IS 'Org-local credit currency, e.g. Punya, Sankalp, Seva.';


-- ─── 2. org_members ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_members (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id               UUID        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,

  -- Position in the 5-tier hierarchy
  tier_level            SMALLINT    NOT NULL DEFAULT 5
                          CHECK (tier_level BETWEEN 1 AND 5),

  -- Optional custom label that overrides the tier alias for this person
  role_label            TEXT,

  -- Org-local credits (L-Credits) — never mixed with Sewa Chakra global credits
  l_credits             NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Influence metrics (updated by background job)
  influence_score       NUMERIC(10,4) NOT NULL DEFAULT 0,
  diversification_index NUMERIC(5,4)  NOT NULL DEFAULT 0,

  -- Service quality rating (same scale as Sewa Chakra: 1-5 stars)
  avg_quality_rating    NUMERIC(3,2),
  total_ratings         INTEGER       NOT NULL DEFAULT 0,

  -- Membership status
  status                TEXT          NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','suspended','left')),

  invited_by            UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  left_at               TIMESTAMPTZ,

  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org_user ON org_members (org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_tier     ON org_members (org_id, tier_level);

COMMENT ON TABLE  org_members                       IS 'Junction: user ↔ organisation with tier, credits, ratings.';
COMMENT ON COLUMN org_members.l_credits             IS 'Local credits earned/spent within this org only.';
COMMENT ON COLUMN org_members.influence_score       IS 'Composite: handshakes × tier weight. Updated by cron.';
COMMENT ON COLUMN org_members.diversification_index IS 'Spread of connections across all 5 tiers. 0–1 range.';


-- ─── 3. org_invites ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_invites (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invite_code      TEXT        UNIQUE NOT NULL,     -- 8-char alphanumeric

  -- Targeted invite (by Kutumb ID) OR open link (both fields null = open)
  target_kutumb_id TEXT,        -- the Kutumb ID that was searched
  target_user_id   UUID        REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Which tier will the invitee join as
  target_tier      SMALLINT    NOT NULL DEFAULT 5
                     CHECK (target_tier BETWEEN 1 AND 5),

  created_by       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at       TIMESTAMPTZ,                     -- null = no expiry
  max_uses         INTEGER     DEFAULT 1,           -- null = unlimited (open links)
  use_count        INTEGER     NOT NULL DEFAULT 0,

  status           TEXT        NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','expired','revoked')),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_invites_org  ON org_invites (org_id);
CREATE INDEX IF NOT EXISTS idx_org_invites_code ON org_invites (invite_code);

-- Invite codes are public (needed for unauthenticated join preview)
-- No RLS needed; validation happens in app layer.

COMMENT ON TABLE  org_invites          IS 'Invite codes for joining an org. Targeted or open-link.';
COMMENT ON COLUMN org_invites.max_uses IS 'null = unlimited uses (open link). 1 = single-use (targeted).';


-- ─── 4. org_enquiries (Kutumb Pro access requests) ───────────────────────────
CREATE TABLE IF NOT EXISTS org_enquiries (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  contact_name      TEXT        NOT NULL,
  contact_email     TEXT        NOT NULL,
  contact_phone     TEXT,

  org_name          TEXT        NOT NULL,
  framework_type    TEXT        NOT NULL,
  org_description   TEXT,
  expected_members  INTEGER,

  status            TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','contacted','approved','rejected')),
  admin_notes       TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE org_enquiries IS 'Kutumb Pro access requests. Admin sets status=approved then flips users.kutumb_pro=true.';


-- ─── 5. Invite code generator ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result   TEXT := '';
  i        INT;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(alphabet, (floor(random() * 32))::int + 1, 1);
  END LOOP;
  RETURN result;
END; $$;


-- ─── 6. Row Level Security — defined AFTER all tables exist ──────────────────

-- 6a. organizations: members of the org can read it
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_select_members" ON organizations;
CREATE POLICY "org_select_members"
  ON organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id  = organizations.id
        AND org_members.user_id = auth.uid()
        AND org_members.status  = 'active'
    )
  );

-- 6b. org_members: members can see fellow members in the same org
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_select" ON org_members;
CREATE POLICY "org_members_select"
  ON org_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members om2
      WHERE om2.org_id  = org_members.org_id
        AND om2.user_id = auth.uid()
        AND om2.status  = 'active'
    )
  );

-- 6c. org_enquiries: users can see their own enquiries
ALTER TABLE org_enquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enquiries_own_select" ON org_enquiries;
CREATE POLICY "enquiries_own_select"
  ON org_enquiries FOR SELECT
  USING (user_id = auth.uid());
