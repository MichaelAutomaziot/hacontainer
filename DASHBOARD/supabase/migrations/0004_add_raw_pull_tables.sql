-- 0004_add_raw_pull_tables.sql
-- Two raw landing tables: full API/HTML payload + commonly-queried broken-out fields.
-- Used for "pull 1 of each" smoke test on 2026-04-30 plus future bulk ingest staging.

CREATE TABLE IF NOT EXISTS public.superpharm_offers_raw (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offer_id text UNIQUE NOT NULL,
  product_sku text,
  product_id text,
  product_id_type text,
  state_code text,
  price numeric,
  quantity integer,
  discount_price numeric,
  discount_start_date timestamptz,
  discount_end_date timestamptz,
  category_code text,
  category_label text,
  description text,
  logistic_class text,
  raw jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.superpharm_offers_raw ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS superpharm_offers_raw_sku_idx ON public.superpharm_offers_raw (product_sku);
CREATE INDEX IF NOT EXISTS superpharm_offers_raw_product_id_idx ON public.superpharm_offers_raw (product_id);

CREATE POLICY "auth read superpharm_offers_raw" ON public.superpharm_offers_raw
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write superpharm_offers_raw" ON public.superpharm_offers_raw
  FOR ALL TO authenticated
  USING (public.is_editor_or_admin()) WITH CHECK (public.is_editor_or_admin());

CREATE TABLE IF NOT EXISTS public.konimbo_products_raw (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hacontainer_id text UNIQUE NOT NULL,
  source_url text NOT NULL,
  name_he text,
  description_he text,
  ean text,
  sku text,
  base_price numeric,
  strike_price numeric,
  pickup_cost numeric,
  brand text,
  warranty_he text,
  delivery_days text,
  category_path text[],
  images text[],
  technical_specs jsonb,
  has_express_shipping boolean,
  has_distant_area_shipping boolean,
  has_kibbutz_shipping boolean,
  has_above_floor_shipping boolean,
  video_url text,
  json_ld jsonb,
  raw_html_size integer,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.konimbo_products_raw ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS konimbo_products_raw_ean_idx ON public.konimbo_products_raw (ean);

CREATE POLICY "auth read konimbo_products_raw" ON public.konimbo_products_raw
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write konimbo_products_raw" ON public.konimbo_products_raw
  FOR ALL TO authenticated
  USING (public.is_editor_or_admin()) WITH CHECK (public.is_editor_or_admin());
