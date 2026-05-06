-- ============================================================
-- Ran Dashboard — Initial Schema Migration
-- Run this in Supabase SQL Editor (Ran's project)
-- ============================================================

-- ============================================================
-- 1. USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT auth.uid(),
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all users" ON users
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert users" ON users
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    OR NOT EXISTS (SELECT 1 FROM users) -- allow first user
  );

CREATE POLICY "Admins can update users" ON users
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    OR id = auth.uid() -- users can update themselves
  );

-- ============================================================
-- 2. SHIPMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS shipments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uuid uuid NOT NULL DEFAULT gen_random_uuid(),
  order_number text,
  shipping_code text,
  customer_phone text,
  first_name text,
  last_name text,
  city text,
  address_street text,
  address_number text,
  address_extra text,
  status_code text,
  status_text text,
  is_cancelled boolean NOT NULL DEFAULT false,
  shipping_type text,
  is_pickup boolean NOT NULL DEFAULT false,
  pickup_ready boolean NOT NULL DEFAULT false,
  picked_up boolean NOT NULL DEFAULT false,
  delivered_to text,
  products_clean jsonb,
  shipping_log jsonb,
  order_data jsonb,
  invoice_link text,
  -- Chatwoot fields (kept for code compatibility, optional)
  chatwoot_contact_id text,
  chatwoot_conversation_id text,
  conversation_status text,
  assigned_agent_id text,
  is_bot_active boolean DEFAULT true,
  bot_state text,
  last_interaction_type text,
  -- Timestamps
  api_created_at timestamptz NOT NULL DEFAULT now(),
  api_updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_shipments_status_code ON shipments(status_code);
CREATE INDEX idx_shipments_city ON shipments(city);
CREATE INDEX idx_shipments_is_pickup ON shipments(is_pickup);
CREATE INDEX idx_shipments_api_created_at ON shipments(api_created_at DESC);
CREATE INDEX idx_shipments_order_number ON shipments(order_number);

-- Trigger
CREATE TRIGGER shipments_updated_at
  BEFORE UPDATE ON shipments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read shipments" ON shipments
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and editors can insert shipments" ON shipments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'editor'))
  );

CREATE POLICY "Admins and editors can update shipments" ON shipments
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'editor'))
  );

CREATE POLICY "Admins can delete shipments" ON shipments
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 3. INVENTORY TABLE (used by "products" resource in the app)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_name text,
  sku text UNIQUE,
  barcode text,
  woo_id text,
  price numeric,
  variant text,
  profit_quantity integer NOT NULL DEFAULT 0,
  in_stock boolean NOT NULL DEFAULT true,
  category text,
  delivery_type text,
  delivery_cost numeric,
  images text[],
  links text[],
  technical_specs jsonb,
  pieces_per_delivery integer,
  -- Retailer-specific SKU fields (kept for code compatibility)
  sku_machsanei_hashmal text,
  sku_ksp text,
  sku_alma text,
  sku_htz text,
  sku_ace text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_inventory_sku ON inventory(sku);
CREATE INDEX idx_inventory_barcode ON inventory(barcode);
CREATE INDEX idx_inventory_quantity ON inventory(profit_quantity);
CREATE INDEX idx_inventory_in_stock ON inventory(in_stock);

-- Trigger
CREATE TRIGGER inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read inventory" ON inventory
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and editors can insert inventory" ON inventory
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'editor'))
  );

CREATE POLICY "Admins and editors can update inventory" ON inventory
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'editor'))
  );

CREATE POLICY "Admins can delete inventory" ON inventory
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 4. SUPPLIERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text,
  business_name text,
  email text,
  phone text,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger
CREATE TRIGGER suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read suppliers" ON suppliers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and editors can insert suppliers" ON suppliers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'editor'))
  );

CREATE POLICY "Admins and editors can update suppliers" ON suppliers
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'editor'))
  );

CREATE POLICY "Admins can delete suppliers" ON suppliers
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 5. SEED: Insert first admin user (run AFTER creating the
--    user in Supabase Auth dashboard)
-- ============================================================
-- UNCOMMENT and replace with actual user ID + email after creating in Auth:
--
-- INSERT INTO users (id, email, role, full_name)
-- VALUES (
--   'AUTH_USER_UUID_HERE',
--   'admin@example.com',
--   'admin',
--   'Ran Admin'
-- );
