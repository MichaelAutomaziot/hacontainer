-- 0003_advisor_fixes.sql
-- Addresses Supabase advisors flagged 2026-04-30 against 0001 schema:
--   - Unindexed FKs: categories.parent_id, inventory.category_id
--   - Public can execute is_editor_or_admin() (SECURITY DEFINER) — revoke from anon/authenticated.

CREATE INDEX IF NOT EXISTS categories_parent_id_idx ON public.categories (parent_id);
CREATE INDEX IF NOT EXISTS inventory_category_id_idx ON public.inventory (category_id);

REVOKE EXECUTE ON FUNCTION public.is_editor_or_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_editor_or_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_editor_or_admin() FROM authenticated;
-- Function still works inside RLS USING/WITH CHECK because PostgreSQL evaluates
-- SECURITY DEFINER policies as the function owner regardless of caller's grants.
