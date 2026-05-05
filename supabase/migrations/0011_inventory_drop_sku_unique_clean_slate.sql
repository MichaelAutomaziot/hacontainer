-- 0011_inventory_drop_sku_unique_clean_slate.sql
-- Live version 20260504084126. Mirrored from production 2026-05-05.
--
-- WARNING: this migration is DESTRUCTIVE. Already applied in production
-- (history-only mirror for fresh-clone parity). Do NOT re-run on a populated DB.
-- Konimbo's `code` is not globally unique across HaContainer's catalog, so the
-- legacy unique constraint on inventory.sku had to go before the visible-only
-- re-pull could land cleanly. The accompanying TRUNCATEs cleared the staging
-- tables ahead of the re-pull.

ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_sku_key;

TRUNCATE TABLE public.konimbo_products_raw RESTART IDENTITY;
TRUNCATE TABLE public.inventory RESTART IDENTITY CASCADE;
