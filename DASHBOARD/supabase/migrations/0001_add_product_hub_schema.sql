-- 0001_add_product_hub_schema.sql
-- Mirror of the migration applied to project zkwkuexvftxdwsdamewx via Supabase MCP on 2026-04-30.
-- Existing tables (users, shipments, inventory, suppliers) are extended; not dropped.

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS ean text,
  ADD COLUMN IF NOT EXISTS name_he text,
  ADD COLUMN IF NOT EXISTS description_he text,
  ADD COLUMN IF NOT EXISTS hacontainer_url text,
  ADD COLUMN IF NOT EXISTS hacontainer_id text,
  ADD COLUMN IF NOT EXISTS pickup_cost numeric,
  ADD COLUMN IF NOT EXISTS sku_superpharm text,
  ADD COLUMN IF NOT EXISTS sku_zap text,
  ADD COLUMN IF NOT EXISTS sku_walla text,
  ADD COLUMN IF NOT EXISTS pilot_status text DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS category_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS inventory_ean_idx ON public.inventory (ean);
CREATE INDEX IF NOT EXISTS inventory_pilot_status_idx ON public.inventory (pilot_status);
CREATE INDEX IF NOT EXISTS inventory_hacontainer_id_idx ON public.inventory (hacontainer_id);

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sp_category_code text UNIQUE,
  parent_id uuid REFERENCES public.categories(id),
  name_he text NOT NULL,
  full_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.categories(id);

CREATE TABLE IF NOT EXISTS public.category_attributes (
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  attribute_code text NOT NULL,
  label_he text,
  required boolean NOT NULL DEFAULT false,
  type text NOT NULL CHECK (type IN ('text','number','list','boolean','date')),
  value_list jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category_id, attribute_code)
);
ALTER TABLE public.category_attributes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.channel_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id bigint NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('superpharm','zap','walla','ace','konimbo')),
  channel_offer_id text,
  channel_product_id text,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','active','rejected','price_matched','disabled','validation_failed')),
  current_price numeric,
  strike_price numeric,
  shipping_cost numeric,
  discount_start date,
  discount_end date,
  attributes jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, channel)
);
ALTER TABLE public.channel_listings ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS channel_listings_state_idx   ON public.channel_listings (state);
CREATE INDEX IF NOT EXISTS channel_listings_channel_idx ON public.channel_listings (channel);

CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  rule_type text NOT NULL,
  config jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS pricing_rules_channel_active_idx ON public.pricing_rules (channel, active);

CREATE TABLE IF NOT EXISTS public.image_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id bigint NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('main','gallery')),
  source_url text,
  storage_path text,
  width int,
  height int,
  bytes int,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.image_assets ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS image_assets_product_idx ON public.image_assets (product_id);

CREATE TABLE IF NOT EXISTS public.sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  payload jsonb,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed','validation_failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS sync_jobs_status_idx ON public.sync_jobs (status);
CREATE INDEX IF NOT EXISTS sync_jobs_type_idx   ON public.sync_jobs (type);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before jsonb,
  after jsonb,
  ts timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON public.audit_log (entity_type, entity_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_categories_updated ON public.categories;
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_channel_listings_updated ON public.channel_listings;
CREATE TRIGGER trg_channel_listings_updated BEFORE UPDATE ON public.channel_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_editor_or_admin()
RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('admin','editor')
  );
$$;

CREATE POLICY "auth read categories" ON public.categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write categories" ON public.categories
  FOR ALL TO authenticated
  USING (public.is_editor_or_admin()) WITH CHECK (public.is_editor_or_admin());

CREATE POLICY "auth read category_attributes" ON public.category_attributes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write category_attributes" ON public.category_attributes
  FOR ALL TO authenticated
  USING (public.is_editor_or_admin()) WITH CHECK (public.is_editor_or_admin());

CREATE POLICY "auth read channel_listings" ON public.channel_listings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write channel_listings" ON public.channel_listings
  FOR ALL TO authenticated
  USING (public.is_editor_or_admin()) WITH CHECK (public.is_editor_or_admin());

CREATE POLICY "auth read pricing_rules" ON public.pricing_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write pricing_rules" ON public.pricing_rules
  FOR ALL TO authenticated
  USING (public.is_editor_or_admin()) WITH CHECK (public.is_editor_or_admin());

CREATE POLICY "auth read image_assets" ON public.image_assets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write image_assets" ON public.image_assets
  FOR ALL TO authenticated
  USING (public.is_editor_or_admin()) WITH CHECK (public.is_editor_or_admin());

CREATE POLICY "auth read sync_jobs" ON public.sync_jobs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write sync_jobs" ON public.sync_jobs
  FOR ALL TO authenticated
  USING (public.is_editor_or_admin()) WITH CHECK (public.is_editor_or_admin());

CREATE POLICY "auth read audit_log" ON public.audit_log
  FOR SELECT TO authenticated USING (true);
