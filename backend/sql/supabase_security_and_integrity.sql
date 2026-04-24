-- Kutumb / Vanshavali — Supabase hardening reference (run fragments in SQL editor after review).
-- -----------------------------------------------------------------------------
-- 1) ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
-- Important: The FastAPI backend uses SUPABASE_SERVICE_ROLE_KEY, which BYPASSES RLS.
-- RLS still matters for: browser/anon PostgREST, Edge Functions with user JWT, Realtime.
-- For API-only access, enforce vansha scoping IN APPLICATION CODE or use per-request JWT + RLS.
--
-- Recommended model:
--   - Table: vansha_members (id uuid PK, user_id uuid REFERENCES auth.users, vansha_id uuid NOT NULL, role text)
--   - JWT custom claim OR session variable: optional; simplest is membership join in policies.
--
-- Example (adjust table/column names to match your migration):

-- ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.unions ENABLE ROW LEVEL SECURITY;

-- SELECT: user may read rows only for vanshas they belong to.
-- CREATE POLICY persons_select_own_vansha ON public.persons
--   FOR SELECT USING (
--     vansha_id IN (
--       SELECT vansha_id FROM public.vansha_members WHERE user_id = auth.uid()
--     )
--   );

-- CREATE POLICY unions_select_own_vansha ON public.unions
--   FOR SELECT USING (
--     vansha_id IN (
--       SELECT vansha_id FROM public.vansha_members WHERE user_id = auth.uid()
--     )
--   );

-- INSERT/UPDATE/DELETE: same predicate; tighten UPDATE to row owner or role = 'admin' as needed.
-- CREATE POLICY persons_write_own_vansha ON public.persons
--   FOR ALL USING (
--     vansha_id IN (
--       SELECT vansha_id FROM public.vansha_members WHERE user_id = auth.uid()
--     )
--   ) WITH CHECK (
--     vansha_id IN (
--       SELECT vansha_id FROM public.vansha_members WHERE user_id = auth.uid()
--     )
--   );

-- Service role (backend): keep using service role only on server; never expose in client.
-- If you move to user JWT for PostgREST, revoke anon broad grants and rely on policies above.

-- -----------------------------------------------------------------------------
-- 2) BACKUP STRATEGY (historical data)
-- -----------------------------------------------------------------------------
-- Supabase:
--   - Pro plan: enable Point-in-Time Recovery (PITR) in Dashboard → Database → Backups.
--   - Dashboard: scheduled logical backups (frequency per plan); verify retention meets compliance.
--   - Export: periodic pg_dump via CI (e.g. nightly GitHub Action with `supabase db dump` or direct
--     connection string to a read replica) to encrypted object storage (S3/GCS) with versioning.
-- Off-site: copy monthly archive to org-owned storage; test restore quarterly.

-- -----------------------------------------------------------------------------
-- 3) UUID / DELETE INTEGRITY (persons ↔ unions)
-- -----------------------------------------------------------------------------
-- Unions reference male_node_id / female_node_id; persons may reference parent_union_id.
-- Raw ON DELETE CASCADE on unions→persons can orphan children or delete too much; prefer controlled order.
--
-- Option A — Application (recommended with service role): single transaction in API
--   1) Find unions where person is male or female.
--   2) UPDATE persons SET parent_union_id = NULL WHERE parent_union_id IN (those union ids).
--   3) DELETE FROM unions WHERE union_id IN (...).
--   4) DELETE person (or soft-delete: SET deleted_at, filter in API).
--
-- Option B — DEFERRABLE FKs + trigger: before delete on persons, run the same cleanup.
--
-- Example trigger sketch (adjust PK/FK names):

-- CREATE OR REPLACE FUNCTION public.before_person_delete_cleanup() RETURNS trigger AS $$
-- BEGIN
--   -- Clear children's pointer to unions that will disappear
--   UPDATE public.persons p
--   SET parent_union_id = NULL
--   WHERE p.parent_union_id IN (
--     SELECT u.union_id FROM public.unions u
--     WHERE u.male_node_id = OLD.node_id OR u.female_node_id = OLD.node_id
--   );
--   DELETE FROM public.unions u
--   WHERE u.male_node_id = OLD.node_id OR u.female_node_id = OLD.node_id;
--   RETURN OLD;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;

-- CREATE TRIGGER tr_person_delete_cleanup
--   BEFORE DELETE ON public.persons
--   FOR EACH ROW EXECUTE FUNCTION public.before_person_delete_cleanup();

-- Frontend: mapVanshaPayload / tree layout should skip unions whose male/female id is missing (defensive).
