-- 0008_link_categories_parents_fn.sql
-- Live version 20260504074822. Mirrored from production 2026-05-05.

CREATE OR REPLACE FUNCTION public.link_categories_parents()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.categories c
  SET parent_id = p.id
  FROM public.categories p
  WHERE c.parent_code IS NOT NULL
    AND c.parent_code = p.sp_category_code
    AND c.parent_id IS DISTINCT FROM p.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.link_categories_parents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_categories_parents() TO service_role;
