-- 0017_create_zap_test_table.sql
-- Live version 20260504180508. Mirrored from production 2026-05-05.
-- Scratch table for Zap channel evaluation. Has RLS enabled but no policies
-- (Supabase advisor INFO). Pending decision on whether to retain or drop.

CREATE TABLE IF NOT EXISTS "Zap-test" (
  zap_product_id  TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  price           NUMERIC,
  category        TEXT,
  subcategory     TEXT,
  image_url       TEXT,
  description     TEXT,
  sku             TEXT,
  product_url     TEXT NOT NULL,
  seller_name     TEXT,
  seller_id       TEXT,
  brand           TEXT,
  in_stock        BOOLEAN DEFAULT TRUE,
  scraped_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
