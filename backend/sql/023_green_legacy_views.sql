-- Migration 023: Green Legacy Views
-- family_eco_summary (materialized) + green_legacy_timeline (view)
-- Run AFTER 021 and 022.

-- ── family_eco_summary: per-vansha aggregation ───────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS public.family_eco_summary AS
SELECT
    ps.vansha_id,

    -- Tier 2: Verified (prakriti_scores)
    ps.trees_planted                                                        AS verified_trees,
    ps.pledges_completed                                                    AS verified_pledges,
    ps.eco_hours                                                            AS samay_eco_hours,
    ps.score                                                                AS prakriti_score,

    -- Tier 1: Self-reported (eco_sewa_logs)
    COUNT(esl.id) FILTER (WHERE esl.status IN ('pending','vouched'))        AS sewa_actions_total,
    COUNT(esl.id) FILTER (WHERE esl.status = 'vouched')                     AS sewa_actions_vouched,
    COALESCE(SUM(esl.score_contribution), 0)                                AS sewa_score_contrib,

    -- Paid service orders
    COUNT(so.id) FILTER (WHERE so.status = 'completed')                     AS service_orders_completed,
    COALESCE(
        SUM(
            CASE sp.id
                WHEN 'taruvara'     THEN 1
                WHEN 'dashavruksha' THEN 10
                ELSE 0
            END
        ) FILTER (WHERE so.status = 'completed'), 0
    )                                                                       AS trees_via_service,

    -- Family size
    COUNT(DISTINCT p.node_id)                                               AS family_member_count,

    -- Combined Green Legacy Score (Tier 1 + Tier 2)
    (ps.score + COALESCE(SUM(esl.score_contribution), 0))                   AS green_legacy_score,

    GREATEST(MAX(ps.updated_at), MAX(esl.updated_at), MAX(so.updated_at))  AS last_activity_at

FROM public.prakriti_scores ps
LEFT JOIN public.eco_sewa_logs esl      ON esl.vansha_id = ps.vansha_id
LEFT JOIN public.service_orders so      ON so.vansha_id  = ps.vansha_id
LEFT JOIN public.service_packages sp    ON sp.id = so.package_id
LEFT JOIN public.persons p              ON p.vansha_id::text = ps.vansha_id
GROUP BY
    ps.vansha_id, ps.trees_planted, ps.pledges_completed,
    ps.eco_hours, ps.score, ps.updated_at
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_family_eco_vansha
    ON public.family_eco_summary (vansha_id);

COMMENT ON MATERIALIZED VIEW public.family_eco_summary IS
    'Aggregated Green Legacy score per vansha — Tier 1 (Eco-Sewa) + Tier 2 (Verified) + paid services. Refreshed by the eco_services router on order completion and by a nightly worker.';


-- ── green_legacy_timeline: chronological union across all eco sources ─────────

CREATE OR REPLACE VIEW public.green_legacy_timeline WITH (security_invoker = true) AS

    -- Tier 1: Self-reported Eco-Sewa logs
    SELECT
        esl.vansha_id,
        esl.id                  AS action_id,
        'eco_sewa'              AS source,
        esl.action_type,
        esl.action_date         AS event_date,
        esl.reported_by_uid     AS actor_uid,
        esl.notes,
        esl.photo_url,
        esl.score_contribution  AS points,
        esl.status,
        esl.tithi_id,
        esl.created_at
    FROM public.eco_sewa_logs esl
    WHERE esl.status IN ('pending','vouched')

UNION ALL

    -- Tier 2: Verified eco-actions from paid services
    SELECT
        vea.vansha_id,
        vea.id                                          AS action_id,
        'verified'                                      AS source,
        vea.action_type,
        COALESCE(vea.verified_at, vea.created_at)::date AS event_date,
        so.user_id                                      AS actor_uid,
        vea.vendor_notes                                AS notes,
        vea.photo_url,
        (vea.trees_delta * 10 + vea.pledges_delta * 5)::numeric AS points,
        vea.status,
        NULL::smallint                                  AS tithi_id,
        vea.created_at
    FROM public.verified_eco_actions vea
    JOIN public.service_orders so ON so.id = vea.service_order_id
    WHERE vea.status IN ('approved','auto_approved')

UNION ALL

    -- Eco-ceremonies by Paryavaran Mitra
    SELECT
        ec.vansha_id,
        ec.id                   AS action_id,
        'ceremony'              AS source,
        ec.ceremony_type        AS action_type,
        ec.created_at::date     AS event_date,
        ec.paryavaran_mitra_user_id AS actor_uid,
        NULL                    AS notes,
        NULL                    AS photo_url,
        5.0::numeric            AS points,  -- ceremony = 1 pledge = 5 pts
        ec.status,
        NULL::smallint          AS tithi_id,
        ec.created_at
    FROM public.eco_ceremonies ec
    WHERE ec.status = 'completed';

COMMENT ON VIEW public.green_legacy_timeline IS
    'Chronological union of all eco-actions for a vansha: Tier 1 Eco-Sewa + Tier 2 Verified + Eco-Ceremonies. Used by the public Green Legacy profile page.';
