-- 013_kutumb_id_referral.sql
-- Adds a permanent, unique Kutumb ID to every user and creates an immutable
-- referral-event audit log. The Kutumb ID doubles as the referral code —
-- one code per person, used for both identity display and referral attribution.
--
-- Kutumb ID format: KM + 8 chars from unambiguous alphabet (32 chars)
--   Alphabet: ABCDEFGHJKMNPQRSTUVWXYZ23456789  (no 0/O/1/I/L)
--   Examples: KMAB3CD7EF, KMZP29QR4N
--   Collision space: 32^8 ≈ 10^12 — negligible collision probability

-- ─── 1. Code generation helper ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_kutumb_id()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result   TEXT := 'KM';
  i        INT;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(alphabet, (floor(random() * 32))::int + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- ─── 2. Add kutumb_id column ──────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS kutumb_id TEXT UNIQUE;

-- ─── 3. Backfill existing users ──────────────────────────────────────────────
-- Loop with uniqueness check so every existing user gets a collision-free ID.

DO $$
DECLARE
  rec       RECORD;
  candidate TEXT;
BEGIN
  FOR rec IN SELECT id FROM users WHERE kutumb_id IS NULL LOOP
    LOOP
      candidate := generate_kutumb_id();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE kutumb_id = candidate);
    END LOOP;
    UPDATE users SET kutumb_id = candidate WHERE id = rec.id;
  END LOOP;
END;
$$;

-- ─── 4. BEFORE INSERT trigger: auto-assign kutumb_id to new users ─────────────

CREATE OR REPLACE FUNCTION trg_fn_set_kutumb_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet  TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate TEXT;
  i         INT;
BEGIN
  IF NEW.kutumb_id IS NOT NULL THEN
    RETURN NEW;  -- Caller explicitly set it; honour that.
  END IF;
  LOOP
    candidate := 'KM';
    FOR i IN 1..8 LOOP
      candidate := candidate || substr(alphabet, (floor(random() * 32))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE kutumb_id = candidate);
  END LOOP;
  NEW.kutumb_id := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_kutumb_id ON users;
CREATE TRIGGER trg_set_kutumb_id
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_set_kutumb_id();

-- ─── 5. referral_events audit table ──────────────────────────────────────────
-- Immutable, append-only. Never update or delete rows — only insert.

CREATE TABLE IF NOT EXISTS referral_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which code was used and who owns it
  kutumb_id_used TEXT        NOT NULL,                            -- exact code entered
  referrer_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,  -- owner of that code

  -- Who used the code and for what
  referred_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type     TEXT        NOT NULL
                   CHECK (event_type IN ('registration', 'se_application', 'invite_accepted')),

  -- Extra context: plan_id, invite_type, channel, etc.
  metadata       JSONB       NOT NULL DEFAULT '{}'::jsonb,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookups by referrer, referred, and the code itself
CREATE INDEX IF NOT EXISTS idx_referral_events_referrer  ON referral_events (referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_events_referred  ON referral_events (referred_id);
CREATE INDEX IF NOT EXISTS idx_referral_events_code      ON referral_events (kutumb_id_used);
CREATE INDEX IF NOT EXISTS idx_referral_events_type_time ON referral_events (event_type, created_at DESC);

ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;

-- A user can see events where they are the referrer OR the one who was referred.
CREATE POLICY "referral_events_own_select"
  ON referral_events FOR SELECT
  USING (referrer_id = auth.uid() OR referred_id = auth.uid());

-- Inserts are backend-only (service role). No client-side writes.
-- (No INSERT policy needed when using service role key.)

COMMENT ON TABLE  referral_events               IS 'Immutable audit log of every referral code use, timestamped.';
COMMENT ON COLUMN referral_events.kutumb_id_used IS 'The Kutumb ID that was actually entered by the referred user.';
COMMENT ON COLUMN referral_events.referrer_id    IS 'User who owns that Kutumb ID (NULL if code did not match anyone).';
COMMENT ON COLUMN referral_events.referred_id    IS 'User who entered/used the code.';
COMMENT ON COLUMN referral_events.event_type     IS 'registration=on sign-up, se_application=sales enrollment, invite_accepted=family invite.';
COMMENT ON COLUMN referral_events.metadata       IS 'Arbitrary context: {"plan_id":"ankur"}, {"invite_type":"tree"}, etc.';
