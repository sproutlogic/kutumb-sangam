-- Migration 044: performance_events — event-sourced ledger for onboarding performance
-- Every meaningful action by a privileged user (or regular user completing onboarding)
-- writes one immutable row here. A summary view aggregates scores and tiers.

-- ── Weights config (admin-editable) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS performance_weights (
  event_type  TEXT        PRIMARY KEY,
  weight      INT         NOT NULL DEFAULT 1,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO performance_weights (event_type, weight, description) VALUES
  ('referral_accepted',    10, 'Someone registered using your KM code or KMI invite code'),
  ('referral_completed',   20, 'A user you referred completed full onboarding'),
  ('invite_used',          10, 'Your generated KMI- invite code was redeemed'),
  ('verification_approved', 5, 'Margdarshak approved a family verification request'),
  ('onboarding_completed',  5, 'User completed their own onboarding profile')
ON CONFLICT (event_type) DO NOTHING;

-- ── Ledger ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS performance_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL,
  weight        INT         NOT NULL DEFAULT 0,   -- snapshot of weight at time of event
  ref_id        TEXT,                              -- ID of the source record
  ref_table     TEXT,                              -- table the ref_id belongs to
  attributed_to UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_perf_events_user     ON performance_events (user_id);
CREATE INDEX IF NOT EXISTS idx_perf_events_type     ON performance_events (event_type);
CREATE INDEX IF NOT EXISTS idx_perf_events_time     ON performance_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_events_ref      ON performance_events (ref_id) WHERE ref_id IS NOT NULL;

-- RLS: users see only their own events; admin queries use service role key
ALTER TABLE performance_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_weights  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perf_events_own_select"
  ON performance_events FOR SELECT
  USING (user_id = auth.uid());

-- Weights are read-only for all authenticated users (admins update via service role)
CREATE POLICY "perf_weights_read"
  ON performance_weights FOR SELECT
  TO authenticated
  USING (true);

-- ── Summary view ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW performance_summary AS
SELECT
  user_id,
  SUM(weight)                                                          AS total_score,
  COUNT(*)                                                             AS total_events,
  SUM(CASE WHEN event_type IN ('referral_accepted','invite_used')
           THEN weight ELSE 0 END)                                     AS referral_score,
  SUM(CASE WHEN event_type = 'referral_completed'
           THEN weight ELSE 0 END)                                     AS completion_score,
  SUM(CASE WHEN event_type = 'verification_approved'
           THEN weight ELSE 0 END)                                     AS verification_score,
  SUM(CASE WHEN event_type = 'onboarding_completed'
           THEN weight ELSE 0 END)                                     AS onboarding_score,
  MAX(created_at)                                                      AS last_activity,
  CASE
    WHEN SUM(weight) >= 300 THEN 'platinum'
    WHEN SUM(weight) >= 150 THEN 'gold'
    WHEN SUM(weight) >=  50 THEN 'silver'
    ELSE                          'bronze'
  END                                                                  AS tier
FROM performance_events
GROUP BY user_id;
