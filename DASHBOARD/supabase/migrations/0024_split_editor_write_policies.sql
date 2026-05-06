-- 0024_split_editor_write_policies.sql
-- Resolves Supabase performance advisor `multiple_permissive_policies` (11 entries).
-- Each affected table has both:
--   "auth read X"     FOR SELECT TO authenticated USING (true)
--   "editor write X"  FOR ALL    TO authenticated USING/CHECK (is_editor_or_admin())
-- The FOR ALL variant fires redundantly on SELECT. Split it into separate
-- INSERT/UPDATE/DELETE policies so SELECT runs only one permissive policy.

DO $$
DECLARE
  t   text;
  pol text;
  fn  text;
  tbls text[] := ARRAY[
    'catalog_matches',
    'categories',
    'category_attributes',
    'channel_listings',
    'image_assets',
    'konimbo_products_raw',
    'operator_custom_fields',
    'operator_logistic_classes',
    'pricing_rules',
    'superpharm_offers_raw',
    'sync_jobs'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    pol := CASE WHEN t = 'pricing_rules' THEN 'admin write ' ELSE 'editor write ' END || t;
    fn  := 'public.is_editor_or_admin()';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
      pol || ' (insert)', t, fn
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      pol || ' (update)', t, fn, fn
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
      pol || ' (delete)', t, fn
    );
  END LOOP;
END $$;
