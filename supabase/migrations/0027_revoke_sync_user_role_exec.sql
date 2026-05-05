-- 0027_revoke_sync_user_role_exec.sql
-- Lock down `public.sync_user_role_to_auth_metadata` so anon and authenticated
-- can't invoke it as `SECURITY DEFINER` via PostgREST. Function is meant to be
-- called from triggers/internal flows only — Supabase advisor flagged it.
-- Service role keeps EXECUTE because it bypasses RLS and runs internal jobs.

REVOKE EXECUTE ON FUNCTION public.sync_user_role_to_auth_metadata() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_user_role_to_auth_metadata() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_user_role_to_auth_metadata() FROM authenticated;

-- Pin search_path to prevent malicious schema shadowing for the SECURITY
-- DEFINER body. (Defense-in-depth; matches 0019 pattern.)
ALTER FUNCTION public.sync_user_role_to_auth_metadata() SET search_path = public, pg_temp;
