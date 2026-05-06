-- 0021_widen_catalog_matches_check.sql
-- BLOCKED on user approval for live DB write.
--
-- Widen catalog_matches.match_method CHECK to accept the full enum emitted by
-- packages/shared/src/matching.ts (ean_unverified, sku_or_product_id,
-- weighted_fuzzy). Until applied, match-catalog.ts coerces the extra labels to
-- 'brand_model_fuzzy' on insert and preserves the original method in `notes`.

ALTER TABLE public.catalog_matches
  DROP CONSTRAINT IF EXISTS catalog_matches_match_method_check;

ALTER TABLE public.catalog_matches
  ADD CONSTRAINT catalog_matches_match_method_check
    CHECK (match_method IN (
      'ean_exact',
      'ean_unverified',
      'sku_or_product_id',
      'brand_model_fuzzy',
      'weighted_fuzzy',
      'title_embedding',
      'manual',
      'none'
    ));
