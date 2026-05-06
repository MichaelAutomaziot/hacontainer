/**
 * Pure CSV builder for Mirakl OF01 (offer import).
 *
 * Column set is operator-defined; the set below is calibrated to Super-Pharm:
 *   - Standard columns: sku, product-id, product-id-type, price, quantity, state-code,
 *     description, discount-price, discount-start-date, discount-end-date,
 *     leadtime-to-ship, logistic-class, min-shipping-price, min-shipping-zone, min-shipping-type
 *   - SP custom OFFER fields (per AF01): import-type (REQUIRED), warranty-by (optional)
 *
 * Output is a single string CSV ready to multipart-POST to /api/offers/imports.
 *
 * Kept in this app so dashboard server route handlers can produce OF01 CSVs
 * without a separate workspace package.
 */
import type { ChannelPayload, ImportType } from "./types";
import { isValidGtin } from "./matching";

export type LogisticClass = "MPDefault" | "regular_2" | "MPLarge" | "MPTempMonitor" | "MPFreeShipping";

export interface OF01Row {
  sku: string;
  product_id: string;
  product_id_type?: "EAN" | "UPC" | "ISBN" | "GTIN" | "SHOP_SKU";
  price: number;
  quantity: number;
  state_code?: string | number; // 11 = active by default
  description?: string;
  discount_price?: number;
  discount_start_date?: string; // YYYY-MM-DD
  discount_end_date?: string;   // YYYY-MM-DD
  leadtime_to_ship?: number;
  logistic_class: LogisticClass;
  min_shipping_price: number;
  min_shipping_zone?: string;   // "IL"
  min_shipping_type?: string;   // "standard"
  import_type: ImportType;
  warranty_by?: string;
}

const COLS = [
  "sku",
  "product-id",
  "product-id-type",
  "price",
  "quantity",
  "state-code",
  "description",
  "discount-price",
  "discount-start-date",
  "discount-end-date",
  "leadtime-to-ship",
  "logistic-class",
  "min-shipping-price",
  "min-shipping-zone",
  "min-shipping-type",
  "import-type",
  "warranty-by",
] as const;

const escape = (val: unknown): string => {
  if (val === undefined || val === null || val === "") return "";
  const s = String(val);
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const toRow = (r: OF01Row): string =>
  [
    r.sku,
    r.product_id,
    r.product_id_type ?? "EAN",
    r.price.toFixed(2),
    r.quantity,
    r.state_code ?? 11,
    r.description ?? "",
    r.discount_price?.toFixed(2) ?? "",
    r.discount_start_date ?? "",
    r.discount_end_date ?? "",
    r.leadtime_to_ship ?? 1,
    r.logistic_class,
    r.min_shipping_price.toFixed(2),
    r.min_shipping_zone ?? "IL",
    r.min_shipping_type ?? "standard",
    r.import_type,
    r.warranty_by ?? "",
  ]
    .map(escape)
    .join(",");

export const buildOf01Csv = (rows: OF01Row[]): string => {
  return [COLS.join(","), ...rows.map(toRow)].join("\n") + "\n";
};

/** Choose SP logistic class given the source product's pickup-cost + size hint.
 *  Pilot rule (PILOT.md, locked 2026-04-30): shipping is ALWAYS 39 ILS, billed
 *  by SP via min-shipping-price. We must NOT return MPFreeShipping — that
 *  logistic class instructs SP to charge 0 regardless of min-shipping-price,
 *  which would suppress the 39 we set. pickup_cost=0 just means we don't pay
 *  HaContainer pickup; the buyer still pays SP shipping. */
export const pickLogisticClass = (opts: {
  pickup_cost: number;
  category_label?: string | null;
  base_price: number;
}): LogisticClass => {
  const cat = opts.category_label?.toLowerCase() ?? "";
  const largeKeywords = ["מקרר", "מקפיא", "כביסה", "מייבש", "מדיח", "תנור", "דוד", "ספה", "ארון", "מיטה"];
  if (opts.pickup_cost >= 100 || largeKeywords.some((k) => cat.includes(k))) return "MPLarge";
  return "MPDefault";
};

/** Map a generic ChannelPayload (from packages/shared pricing engine) into an OF01Row. */
export const channelPayloadToOf01 = (
  p: ChannelPayload,
  extras: { pickup_cost: number; category_label?: string | null; warranty_by?: string | null; import_type?: ImportType; quantity?: number }
): OF01Row => {
  const importType: ImportType = extras.import_type ?? p.import_type ?? "official";
  if (importType === "official") {
    if (!p.ean) throw new Error(`channelPayloadToOf01: missing EAN for sku=${p.sku} (official import)`);
    if (!isValidGtin(p.ean)) throw new Error(`channelPayloadToOf01: EAN ${p.ean} fails GS1 checksum for sku=${p.sku}`);
  }
  if (p.errors.length > 0) {
    throw new Error(`channelPayloadToOf01: payload sku=${p.sku} not buildable: ${p.errors.join("; ")}`);
  }
  if (!p.buildable) {
    throw new Error(`channelPayloadToOf01: payload sku=${p.sku} marked unbuildable`);
  }

  const useEan = !!p.ean && isValidGtin(p.ean);
  const productId = useEan ? p.ean! : p.sku;
  const productIdType: OF01Row["product_id_type"] = useEan ? "EAN" : "SHOP_SKU";

  const hasDiscount = p.strike_price != null && p.strike_price > p.current_price;
  if (hasDiscount && p.discount_end < p.discount_start) {
    throw new Error(`channelPayloadToOf01: discount_end ${p.discount_end} < discount_start ${p.discount_start}`);
  }
  return {
    sku: p.sku,
    product_id: productId,
    product_id_type: productIdType,
    price: hasDiscount ? p.strike_price! : p.current_price,
    quantity: extras.quantity ?? 1,
    state_code: 11,
    description: p.description_he ?? "",
    discount_price: hasDiscount ? p.current_price : undefined,
    discount_start_date: hasDiscount ? p.discount_start : undefined,
    discount_end_date: hasDiscount ? p.discount_end : undefined,
    leadtime_to_ship: 1,
    logistic_class: pickLogisticClass({
      pickup_cost: extras.pickup_cost,
      category_label: extras.category_label ?? null,
      base_price: p.current_price,
    }),
    min_shipping_price: p.shipping_cost,
    min_shipping_zone: "IL",
    min_shipping_type: "standard",
    import_type: importType,
    warranty_by: extras.warranty_by ?? undefined,
  };
};
