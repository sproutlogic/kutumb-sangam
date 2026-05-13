-- Migration 043: invite_codes — generated, trackable, one-time invite codes
-- Created by privileged users (margdarshak / admin / superadmin) to invite
-- anyone to the platform. Separate from the permanent kutumb_id referral code.

CREATE TABLE IF NOT EXISTS invite_codes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT        UNIQUE NOT NULL,                              -- KMI-XXXXXXXX
  created_by    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_for   TEXT,                                                     -- optional label/name
  used_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at       TIMESTAMPTZ,
  status        TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'used', 'revoked')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_created_by ON invite_codes (created_by);
CREATE INDEX IF NOT EXISTS idx_invite_codes_used_by    ON invite_codes (used_by);
CREATE INDEX IF NOT EXISTS idx_invite_codes_status     ON invite_codes (status);

-- RLS: owners see only their own rows; admin queries use service role key (bypasses RLS)
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invite_codes_own_select"
  ON invite_codes FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "invite_codes_own_insert"
  ON invite_codes FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "invite_codes_own_update"
  ON invite_codes FOR UPDATE
  USING (created_by = auth.uid());
