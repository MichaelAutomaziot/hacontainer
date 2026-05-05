-- 0005_fix_superpharm_offers_raw.sql
-- Live version 20260504072610. Mirrored from production 2026-05-05.
-- Adds the full Mirakl OF21 column set onto superpharm_offers_raw and back-fills
-- broken-out fields from the raw jsonb that landed via 0004.

ALTER TABLE public.superpharm_offers_raw
  ADD COLUMN IF NOT EXISTS shop_sku text,
  ADD COLUMN IF NOT EXISTS active boolean,
  ADD COLUMN IF NOT EXISTS msrp numeric,
  ADD COLUMN IF NOT EXISTS total_price numeric,
  ADD COLUMN IF NOT EXISTS leadtime_to_ship integer,
  ADD COLUMN IF NOT EXISTS currency_iso_code text,
  ADD COLUMN IF NOT EXISTS min_shipping_type text,
  ADD COLUMN IF NOT EXISTS min_shipping_zone text,
  ADD COLUMN IF NOT EXISTS min_shipping_price numeric,
  ADD COLUMN IF NOT EXISTS min_shipping_price_additional numeric,
  ADD COLUMN IF NOT EXISTS shipping_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS allow_quote_requests boolean,
  ADD COLUMN IF NOT EXISTS fulfillment_center text,
  ADD COLUMN IF NOT EXISTS warehouses jsonb,
  ADD COLUMN IF NOT EXISTS channels text[],
  ADD COLUMN IF NOT EXISTS product_brand text,
  ADD COLUMN IF NOT EXISTS product_title text,
  ADD COLUMN IF NOT EXISTS product_description text,
  ADD COLUMN IF NOT EXISTS logistic_class_code text,
  ADD COLUMN IF NOT EXISTS logistic_class_label text,
  ADD COLUMN IF NOT EXISTS inactivity_reasons jsonb,
  ADD COLUMN IF NOT EXISTS product_references jsonb,
  ADD COLUMN IF NOT EXISTS price_additional_info text,
  ADD COLUMN IF NOT EXISTS ean text,
  ADD COLUMN IF NOT EXISTS import_type text,
  ADD COLUMN IF NOT EXISTS all_prices jsonb,
  ADD COLUMN IF NOT EXISTS applicable_pricing jsonb,
  ADD COLUMN IF NOT EXISTS offer_additional_fields jsonb,
  ADD COLUMN IF NOT EXISTS discount jsonb;

CREATE INDEX IF NOT EXISTS superpharm_offers_raw_ean_idx ON public.superpharm_offers_raw (ean);
CREATE INDEX IF NOT EXISTS superpharm_offers_raw_state_code_idx ON public.superpharm_offers_raw (state_code);
CREATE INDEX IF NOT EXISTS superpharm_offers_raw_brand_idx ON public.superpharm_offers_raw (product_brand);

UPDATE public.superpharm_offers_raw SET
  shop_sku = raw->>'shop_sku',
  active = (raw->>'active')::boolean,
  msrp = NULLIF(raw->>'msrp','')::numeric,
  total_price = NULLIF(raw->>'total_price','')::numeric,
  leadtime_to_ship = NULLIF(raw->>'leadtime_to_ship','')::integer,
  currency_iso_code = raw->>'currency_iso_code',
  min_shipping_type = raw->>'min_shipping_type',
  min_shipping_zone = raw->>'min_shipping_zone',
  min_shipping_price = NULLIF(raw->>'min_shipping_price','')::numeric,
  min_shipping_price_additional = NULLIF(raw->>'min_shipping_price_additional','')::numeric,
  shipping_deadline = NULLIF(raw->>'shipping_deadline','')::timestamptz,
  allow_quote_requests = (raw->>'allow_quote_requests')::boolean,
  fulfillment_center = raw#>>'{fulfillment,center,code}',
  warehouses = raw->'warehouses',
  channels = ARRAY(SELECT jsonb_array_elements_text(raw->'channels')),
  product_brand = raw->>'product_brand',
  product_title = raw->>'product_title',
  product_description = raw->>'product_description',
  logistic_class_code = raw#>>'{logistic_class,code}',
  logistic_class_label = raw#>>'{logistic_class,label}',
  inactivity_reasons = raw->'inactivity_reasons',
  product_references = raw->'product_references',
  price_additional_info = raw->>'price_additional_info',
  all_prices = raw->'all_prices',
  applicable_pricing = raw->'applicable_pricing',
  offer_additional_fields = raw->'offer_additional_fields',
  discount = raw->'discount',
  ean = (
    SELECT pr->>'reference'
    FROM jsonb_array_elements(raw->'product_references') pr
    WHERE pr->>'reference_type' = 'ean'
    LIMIT 1
  ),
  import_type = (
    SELECT af->>'value'
    FROM jsonb_array_elements(raw->'offer_additional_fields') af
    WHERE af->>'code' = 'import-type'
    LIMIT 1
  ),
  category_code = COALESCE(category_code, raw->>'category_code'),
  category_label = COALESCE(category_label, raw->>'category_label'),
  description = COALESCE(description, raw->>'product_description'),
  logistic_class = COALESCE(logistic_class, raw#>>'{logistic_class,label}'),
  product_id = COALESCE(product_id, (
    SELECT pr->>'reference'
    FROM jsonb_array_elements(raw->'product_references') pr
    WHERE pr->>'reference_type' = 'ean'
    LIMIT 1
  )),
  product_id_type = COALESCE(product_id_type, 'EAN');
