-- 0031: RPC that backfills inventory.category_id from approved
-- container_category_mappings. Called once per mapping change; the
-- /api/sync/superpharm/products/push route reads category_id and avoids
-- the per-row mapping lookup. p_force=true overwrites stale category_ids
-- when a mapping was edited.

CREATE OR REPLACE FUNCTION public.backfill_inventory_category_id(p_force boolean DEFAULT false)
RETURNS TABLE (updated_count bigint, unmapped_count bigint, distinct_labels bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_updated bigint; v_unmapped bigint; v_distinct bigint;
BEGIN
  WITH src AS (
    SELECT i.id, m.category_id AS new_cat_id
      FROM public.inventory i
      LEFT JOIN public.container_category_mappings m
        ON m.container_label_normalized = lower(btrim(coalesce(i.category, '')))
       AND m.status = 'approved'
     WHERE coalesce(i.category, '') <> ''
       AND (p_force OR i.category_id IS NULL OR i.category_id IS DISTINCT FROM m.category_id)
  ), upd AS (
    UPDATE public.inventory i SET category_id = src.new_cat_id
      FROM src WHERE i.id = src.id AND src.new_cat_id IS NOT NULL
    RETURNING i.id
  )
  SELECT count(*) INTO v_updated FROM upd;

  SELECT count(*) INTO v_unmapped FROM public.inventory
   WHERE coalesce(category, '') <> '' AND category_id IS NULL;

  SELECT count(DISTINCT lower(btrim(category))) INTO v_distinct FROM public.inventory
   WHERE coalesce(category, '') <> '';

  RETURN QUERY SELECT v_updated, v_unmapped, v_distinct;
END $$;

GRANT EXECUTE ON FUNCTION public.backfill_inventory_category_id(boolean) TO authenticated;
