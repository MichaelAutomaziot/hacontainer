-- 0023_rls_initplan_optimisation.sql
-- Resolves Supabase performance advisor `auth_rls_initplan` (15 entries).
-- Wraps every direct `auth.uid()` call in `(SELECT auth.uid())` so Postgres
-- evaluates it once per query, not once per row. No semantic change.
-- Affected tables: users, shipments, inventory, suppliers.

-- inventory ----------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read inventory" ON public.inventory;
CREATE POLICY "Authenticated users can read inventory"
  ON public.inventory FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Admins and editors can insert inventory" ON public.inventory;
CREATE POLICY "Admins and editors can insert inventory"
  ON public.inventory FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid())
      AND users.role = ANY (ARRAY['admin','editor'])
  ));

DROP POLICY IF EXISTS "Admins and editors can update inventory" ON public.inventory;
CREATE POLICY "Admins and editors can update inventory"
  ON public.inventory FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid())
      AND users.role = ANY (ARRAY['admin','editor'])
  ));

DROP POLICY IF EXISTS "Admins can delete inventory" ON public.inventory;
CREATE POLICY "Admins can delete inventory"
  ON public.inventory FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
  ));

-- shipments ----------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read shipments" ON public.shipments;
CREATE POLICY "Authenticated users can read shipments"
  ON public.shipments FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Admins and editors can insert shipments" ON public.shipments;
CREATE POLICY "Admins and editors can insert shipments"
  ON public.shipments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid())
      AND users.role = ANY (ARRAY['admin','editor'])
  ));

DROP POLICY IF EXISTS "Admins and editors can update shipments" ON public.shipments;
CREATE POLICY "Admins and editors can update shipments"
  ON public.shipments FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid())
      AND users.role = ANY (ARRAY['admin','editor'])
  ));

DROP POLICY IF EXISTS "Admins can delete shipments" ON public.shipments;
CREATE POLICY "Admins can delete shipments"
  ON public.shipments FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
  ));

-- suppliers ----------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read suppliers" ON public.suppliers;
CREATE POLICY "Authenticated users can read suppliers"
  ON public.suppliers FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Admins and editors can insert suppliers" ON public.suppliers;
CREATE POLICY "Admins and editors can insert suppliers"
  ON public.suppliers FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid())
      AND users.role = ANY (ARRAY['admin','editor'])
  ));

DROP POLICY IF EXISTS "Admins and editors can update suppliers" ON public.suppliers;
CREATE POLICY "Admins and editors can update suppliers"
  ON public.suppliers FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid())
      AND users.role = ANY (ARRAY['admin','editor'])
  ));

DROP POLICY IF EXISTS "Admins can delete suppliers" ON public.suppliers;
CREATE POLICY "Admins can delete suppliers"
  ON public.suppliers FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
  ));

-- users --------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read all users" ON public.users;
CREATE POLICY "Users can read all users"
  ON public.users FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Admins can insert users" ON public.users;
CREATE POLICY "Admins can insert users"
  ON public.users FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users users_1
      WHERE users_1.id = (SELECT auth.uid())
        AND users_1.role = 'admin'
    )
    OR NOT EXISTS (SELECT 1 FROM public.users users_1)
  );

DROP POLICY IF EXISTS "Admins can update users" ON public.users;
CREATE POLICY "Admins can update users"
  ON public.users FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users users_1
      WHERE users_1.id = (SELECT auth.uid())
        AND users_1.role = 'admin'
    )
    OR id = (SELECT auth.uid())
  );
