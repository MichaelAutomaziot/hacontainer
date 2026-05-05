-- 0014_dashboard_summary_rpc.sql
-- Live version 20260504112537. Mirrored from production 2026-05-05.

CREATE OR REPLACE FUNCTION public.dashboard_summary()
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'inventory_total', (SELECT count(*) FROM public.inventory),
    'sp_active',       (SELECT count(*) FROM public.superpharm_offers_raw WHERE quantity > 0),
    'verdicts',        (SELECT jsonb_object_agg(verdict, n) FROM (
                          SELECT verdict, count(*) AS n FROM public.catalog_matches GROUP BY verdict
                        ) t),
    'pilot_status',    (SELECT jsonb_object_agg(coalesce(pilot_status,'unset'), n) FROM (
                          SELECT pilot_status, count(*) AS n FROM public.inventory GROUP BY pilot_status
                        ) t),
    'top_missing_categories', (SELECT jsonb_agg(jsonb_build_object('category', category, 'n', n) ORDER BY n DESC)
                                FROM (
                                  SELECT i.category, count(*) AS n
                                  FROM public.catalog_matches cm
                                  JOIN public.inventory i ON i.id = cm.inventory_id
                                  WHERE cm.verdict = 'missing' AND i.category IS NOT NULL
                                  GROUP BY i.category
                                  ORDER BY n DESC LIMIT 10
                                ) t),
    'sp_logistic_class', (SELECT jsonb_object_agg(coalesce(logistic_class_label,'unset'), n) FROM (
                          SELECT logistic_class_label, count(*) AS n FROM public.superpharm_offers_raw GROUP BY logistic_class_label
                         ) t),
    'last_syncs', (SELECT jsonb_object_agg(t.type, t.completed_at) FROM (
                    SELECT DISTINCT ON (type) type, completed_at
                    FROM public.sync_jobs
                    WHERE completed_at IS NOT NULL
                    ORDER BY type, completed_at DESC
                   ) t)
  );
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_summary() TO authenticated, anon, service_role;
