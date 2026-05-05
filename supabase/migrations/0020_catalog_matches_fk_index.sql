-- 0020_catalog_matches_fk_index.sql
-- Resolves Supabase performance advisor `unindexed_foreign_keys`
-- on catalog_matches.superpharm_offer_id.

CREATE INDEX IF NOT EXISTS catalog_matches_sp_offer_idx
  ON public.catalog_matches (superpharm_offer_id);
