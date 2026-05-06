-- 0015_inventory_add_brand_column.sql
-- Live version 20260504112611. Mirrored from production 2026-05-05.

ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS brand text;
UPDATE public.inventory
SET brand = technical_specs->>'brand'
WHERE brand IS NULL AND technical_specs ? 'brand';
CREATE INDEX IF NOT EXISTS inventory_brand_idx ON public.inventory(brand);
CREATE INDEX IF NOT EXISTS inventory_category_idx ON public.inventory(category);
