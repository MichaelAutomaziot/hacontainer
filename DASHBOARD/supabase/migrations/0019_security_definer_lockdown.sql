-- 0019_security_definer_lockdown.sql
-- Resolves Supabase security advisors:
--   - anon_security_definer_function_executable on rls_auto_enable()
--   - authenticated_security_definer_function_executable on rls_auto_enable()
--   - function_search_path_mutable on update_updated_at_column()

-- 1) rls_auto_enable: revoke from PUBLIC + anon + authenticated.
--    Function still callable by service_role and via SECURITY DEFINER context.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated';
  END IF;
END $$;

-- 2) update_updated_at_column: pin search_path for SECURITY DEFINER hygiene.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp';
  END IF;
END $$;
