-- 0012_sync_konimbo_orphans_fn.sql
-- Live version 20260504095052. Mirrored from production 2026-05-05.

CREATE OR REPLACE FUNCTION public.sync_konimbo_orphans(keep_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  d_raw integer;
  d_inv integer;
BEGIN
  WITH d AS (
    DELETE FROM public.inventory
    WHERE hacontainer_id IS NOT NULL
      AND NOT (hacontainer_id = ANY (keep_ids))
    RETURNING 1
  )
  SELECT count(*) INTO d_inv FROM d;

  WITH d AS (
    DELETE FROM public.konimbo_products_raw
    WHERE hacontainer_id IS NOT NULL
      AND NOT (hacontainer_id = ANY (keep_ids))
    RETURNING 1
  )
  SELECT count(*) INTO d_raw FROM d;

  RETURN jsonb_build_object('deleted_raw', d_raw, 'deleted_inv', d_inv);
END $$;

REVOKE EXECUTE ON FUNCTION public.sync_konimbo_orphans(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_konimbo_orphans(text[]) TO service_role;
