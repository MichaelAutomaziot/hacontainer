-- 0028_grant_is_editor_or_admin_to_authenticated.sql
-- Fix: RLS policies on catalog_matches (and 10 sibling tables in 0024) call
-- public.is_editor_or_admin() inside USING/WITH CHECK clauses. Without EXECUTE
-- on that function, every INSERT/UPDATE/DELETE by an authenticated user dies
-- with `permission denied for function is_editor_or_admin` (SQLSTATE 42501).
-- Function is SECURITY DEFINER + STABLE + checks public.users.role; safe to
-- expose to authenticated callers.

GRANT EXECUTE ON FUNCTION public.is_editor_or_admin() TO authenticated;
