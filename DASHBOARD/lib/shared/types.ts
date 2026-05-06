/**
 * Shared types for the Ran Faina × Super-Pharm hub.
 *
 * These mirror the Supabase schema in packages/db/migrations/0001_add_product_hub_schema.sql
 * but are deliberately decoupled from the generated DB types so the pricing engine and
 * validators stay pure (no DB dependency).
 */

export type Channel = "superpharm" | "zap" | "walla" | "ace" | "konimbo";

export type PricingRuleType =
  | "shipping_addon"
  | "strike_multiplier"
  | "sale_duration"
  | "skip_extras"
  | "price_match";

export interface PricingRule {
  id: string;
  channel: Channel;
  rule_type: PricingRuleType;
  config: Record<string, unknown>;
  active: boolean;
}

export interface ShippingAddonConfig {
  amount: number;
  currency: "ILS";
}

export interface StrikeMultiplierConfig {
  factor: number;
}

export interface SaleDurationConfig {
  days: number;
}

export interface SkipExtrasConfig {
  labels: string[];
}

export interface PriceMatchConfig {
  match_lowest_competitor: boolean;
  always_add_shipping: boolean;
}

/** Source-of-truth product as scraped/imported from HaContainer (Konimbo). */
export interface SourceProduct {
  hacontainer_id: string;
  hacontainer_url: string;
  sku: string | null;
  ean: string | null;
  name_he: string;
  description_he: string | null;
  base_price: number;          // sale price (red)
  strike_price: number | null; // before-sale price shown struck through
  pickup_cost: number;         // per-product delivery/pickup cost; 0 = free
  category_path: string[];
  images: string[];            // source URLs
  technical_specs: Record<string, unknown>;
  has_express_shipping: boolean;
  has_distant_area_shipping: boolean;
  has_kibbutz_shipping: boolean;
  has_above_floor_shipping: boolean;
  video_url: string | null;
}

/** Single competitor offer observed on a marketplace channel. */
export interface CompetitorOffer {
  channel: Channel;
  seller_name: string;
  price: number;
  shipping_cost: number;
}

/** Mirakl import-type semantics:
 *   official  → seller is the source of the product record (must have valid EAN)
 *   parallel  → seller publishes a parallel offer; shop_sku may stand in for EAN
 *   none      → no product entity (rare, marketplace-defined)
 */
export type ImportType = "official" | "parallel" | "none";

/** Output of the pricing engine — what gets pushed to a channel adapter. */
export interface ChannelPayload {
  channel: Channel;
  sku: string;
  ean: string | null;
  name_he: string;
  description_he: string | null;
  current_price: number;
  strike_price: number | null;
  shipping_cost: number;
  discount_start: string;        // ISO date YYYY-MM-DD
  discount_end: string;          // ISO date YYYY-MM-DD
  category_attributes: Record<string, string | number | boolean>;
  images: string[];              // signed URLs from Supabase Storage
  import_type: ImportType;       // chosen by caller; affects EAN-required gate
  warnings: string[];
  buildable: boolean;            // false → caller must NOT include in OF01 CSV
  errors: string[];              // hard reasons the payload cannot ship
}

export interface PricingContext {
  channel: Channel;
  rules: PricingRule[];
  competitors?: CompetitorOffer[];
  today?: Date; // injectable for tests
  import_type?: ImportType; // default 'official'
}
