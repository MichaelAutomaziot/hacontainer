-- 0006_add_discovery_and_matching.sql
-- Live version 20260504072623. Mirrored from production 2026-05-05.
-- Adds operator_custom_fields, operator_logistic_classes, catalog_matches,
-- and inventory.etag / inventory.source_fetched_at.

CREATE TABLE IF NOT EXISTS public.operator_custom_fields (
  code text PRIMARY KEY,
  label text,
  type text,
  required boolean DEFAULT false,
  values_list jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.operator_custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read operator_custom_fields" ON public.operator_custom_fields
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write operator_custom_fields" ON public.operator_custom_fields
  FOR ALL TO authenticated
  USING (public.is_editor_or_admin()) WITH CHECK (public.is_editor_or_admin());

CREATE TABLE IF NOT EXISTS public.operator_logistic_classes (
  code text PRIMARY KEY,
  label text,
  active boolean NOT NULL DEFAULT true,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.operator_logistic_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read operator_logistic_classes" ON public.operator_logistic_classes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write operator_logistic_classes" ON public.operator_logistic_classes
  FOR ALL TO authenticated
  USING (public.is_editor_or_admin()) WITH CHECK (public.is_editor_or_admin());

CREATE TABLE IF NOT EXISTS public.catalog_matches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inventory_id bigint REFERENCES public.inventory(id) ON DELETE CASCADE,
  superpharm_offer_id text REFERENCES public.superpharm_offers_raw(offer_id) ON DELETE SET NULL,
  match_method text CHECK (match_method IN ('ean_exact','brand_model_fuzzy','title_embedding','manual','none')),
  confidence numeric CHECK (confidence BETWEEN 0 AND 1),
  verdict text CHECK (verdict IN ('duplicate','candidate','missing','manual_review')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inventory_id, superpharm_offer_id)
);
ALTER TABLE public.catalog_matches ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS catalog_matches_verdict_idx ON public.catalog_matches (verdict);
CREATE INDEX IF NOT EXISTS catalog_matches_inventory_idx ON public.catalog_matches (inventory_id);

CREATE POLICY "auth read catalog_matches" ON public.catalog_matches
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write catalog_matches" ON public.catalog_matches
  FOR ALL TO authenticated
  USING (public.is_editor_or_admin()) WITH CHECK (public.is_editor_or_admin());

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS etag text,
  ADD COLUMN IF NOT EXISTS source_fetched_at timestamptz;
CREATE INDEX IF NOT EXISTS inventory_etag_idx ON public.inventory (etag) WHERE etag IS NOT NULL;
