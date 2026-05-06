-- =============================================================================
-- One-shot cleanup: delete blog rows, re-flag false-missing duplicates.
-- =============================================================================
-- Run inside a single transaction. Sandbox blocked the agent from running this
-- automatically; copy/paste into the Supabase SQL editor (HaContainer project)
-- when ready, or run via `psql`.
--
-- Pre-flight checks (run separately to verify counts before COMMIT):
--
--   SELECT count(*) FROM inventory WHERE category = 'בלוג';                 -- expect 23
--   SELECT count(*) FROM catalog_matches cm
--     JOIN inventory i ON i.id = cm.inventory_id
--     JOIN superpharm_offers_raw sp ON sp.ean = i.ean AND sp.active = true
--     WHERE cm.verdict = 'missing' AND i.ean IS NOT NULL;                    -- expect ~120
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Remove the 23 'בלוג' (blog-article) rows that were imported as products.
-- ---------------------------------------------------------------------------
WITH blog_ids AS (SELECT id FROM inventory WHERE category = 'בלוג')
DELETE FROM catalog_matches WHERE inventory_id IN (SELECT id FROM blog_ids);

WITH blog_ids AS (SELECT id FROM inventory WHERE category = 'בלוג')
DELETE FROM channel_listings WHERE product_id IN (SELECT id FROM blog_ids);

WITH blog_ids AS (SELECT id FROM inventory WHERE category = 'בלוג')
DELETE FROM image_assets WHERE product_id IN (SELECT id FROM blog_ids);

DELETE FROM inventory WHERE category = 'בלוג';

-- ---------------------------------------------------------------------------
-- 2) Re-flag false-missing rows.
--
-- Any catalog_matches row currently 'missing' whose inventory.ean equals an
-- active superpharm_offers_raw.ean is wrong: the EAN match is GS1-strong, so
-- the product *does* already exist in Super-Pharm. Move it to 'duplicate'
-- and bump inventory.pilot_status='exists_in_sp' so it disappears from the
-- upload list.
--
-- This was triggered after the user reported product
-- "תיק גב מעוצב נגד גניבות דגם NY-40260" appearing under "missing" while
-- similar Navy-Gift bags are already on SP. The example product itself is
-- genuinely missing (EAN 1232442314301 not on SP), but the audit found 120
-- other rows that ARE present on SP under the same EAN.
-- ---------------------------------------------------------------------------
WITH dup_pairs AS (
  SELECT
    cm.id AS match_id,
    cm.inventory_id,
    sp.offer_id AS sp_offer_id
  FROM catalog_matches cm
  JOIN inventory i ON i.id = cm.inventory_id
  JOIN superpharm_offers_raw sp ON sp.ean = i.ean AND sp.active = true
  WHERE cm.verdict = 'missing'
    AND i.ean IS NOT NULL AND i.ean <> ''
)
UPDATE catalog_matches cm
SET
  verdict = 'duplicate',
  superpharm_offer_id = dp.sp_offer_id,
  match_method = 'ean_exact',
  confidence = 0.99,
  notes = COALESCE(cm.notes, '') || ' [auto-fixed: EAN equals active SP offer]'
FROM dup_pairs dp
WHERE cm.id = dp.match_id;

-- Mark the inventory side too. Only flip rows that haven't already been moved
-- into the active pipeline (approved_for_pilot/transformed/etc.) so we don't
-- accidentally derail in-flight uploads.
WITH dup_inv AS (
  SELECT DISTINCT i.id
  FROM inventory i
  JOIN superpharm_offers_raw sp ON sp.ean = i.ean AND sp.active = true
  JOIN catalog_matches cm ON cm.inventory_id = i.id
  WHERE cm.verdict = 'duplicate'
    AND cm.match_method = 'ean_exact'
    AND cm.notes LIKE '%[auto-fixed: EAN equals active SP offer]%'
)
UPDATE inventory
SET pilot_status = 'exists_in_sp'
WHERE id IN (SELECT id FROM dup_inv)
  AND (pilot_status IS NULL OR pilot_status IN ('imported', 'draft'));

-- ---------------------------------------------------------------------------
-- 3) (Optional, run separately if desired) Future improvement — name-token
-- similarity. The current matcher already runs brand+title fuzzy; the EAN
-- pass above is the safer surgical fix. If you want broader cleanup, kick off
-- the existing matching worker (sync_jobs.type='match-catalog') after this
-- migration. It will re-score everything and may move more rows to
-- 'duplicate' or 'manual_review' based on the standard scorer in
-- lib/shared/matching.ts.
-- ---------------------------------------------------------------------------

-- Verify before commit:
--   SELECT count(*) FROM inventory WHERE category = 'בלוג';                 -- expect 0
--   SELECT count(*) FROM catalog_matches WHERE notes LIKE '%[auto-fixed: EAN equals active SP offer]%';
--                                                                            -- expect ~120

COMMIT;
