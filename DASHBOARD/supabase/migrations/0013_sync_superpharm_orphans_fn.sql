-- 0013_sync_superpharm_orphans_fn.sql
-- Live version 20260504104720. Mirrored from production 2026-05-05.

CREATE OR REPLACE FUNCTION public.sync_superpharm_orphans(keep_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  d_count integer;
BEGIN
  WITH d AS (
    DELETE FROM public.superpharm_offers_raw
    WHERE offer_id IS NOT NULL
      AND NOT (offer_id = ANY (keep_ids))
    RETURNING 1
  )
  SELECT count(*) INTO d_count FROM d;

  RETURN jsonb_build_object('deleted', d_count);
END $$;

REVOKE EXECUTE ON FUNCTION public.sync_superpharm_orphans(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_superpharm_orphans(text[]) TO service_role;
