-- 0016_v_comparison_view.sql
-- Live version 20260504112635. Mirrored from production 2026-05-05.
-- NOTE: live shipped this view as SECURITY DEFINER (Supabase advisor flagged ERROR).
-- Migration 0018 recreates it as SECURITY INVOKER. Both are kept for history parity.

CREATE OR REPLACE VIEW public.v_comparison AS
SELECT
  cm.id AS match_id,
  cm.inventory_id,
  cm.superpharm_offer_id,
  cm.match_method,
  cm.confidence,
  cm.verdict,
  cm.notes,
  i.name_he,
  i.ean         AS inv_ean,
  i.brand       AS inv_brand,
  i.category    AS inv_category,
  (i.images)[1] AS inv_thumb,
  i.price       AS inv_price,
  i.pickup_cost AS inv_pickup_cost,
  i.pilot_status,
  i.hacontainer_url,
  sp.product_title,
  sp.ean        AS sp_ean,
  sp.shop_sku,
  sp.product_brand     AS sp_brand,
  sp.category_label    AS sp_category,
  sp.price             AS sp_price,
  sp.logistic_class_label
FROM public.catalog_matches cm
LEFT JOIN public.inventory i              ON i.id = cm.inventory_id
LEFT JOIN public.superpharm_offers_raw sp ON sp.offer_id = cm.superpharm_offer_id;

GRANT SELECT ON public.v_comparison TO authenticated, anon, service_role;
