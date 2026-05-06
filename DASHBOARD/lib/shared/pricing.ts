/**
 * Pricing engine — pure function. No I/O. No DB. No clock except via context.today.
 *
 * Rules locked 2026-04-30 with the 2026-05-06 strike-multiplier adjustment from
 * Ran (clarified 2026-05-06b: shipping is NOT rolled into current_price):
 *   - current_price = HaContainer sale + per-product pickup_cost. Shipping is
 *     NOT rolled in here — Mirakl charges shipping_cost separately so it must
 *     not be double-counted in the displayed sale price.
 *   - shipping_cost = 39 ILS always (configurable via shipping_addon rule).
 *   - strike_price = (current_price + shipping_cost) × 1.15, rounded to whole
 *     shekel. Multiplier deliberately applies to the POST-shipping figure so
 *     the discount % shown on the SP listing reflects what the buyer actually
 *     pays (sale + shipping vs. strike).
 *   - Discount window = [today, today + sale_duration.days].
 *   - skip_extras: labelled HaContainer shipping options never copied to SP.
 *   - price_match: if competitor offer < ours, match the lowest then strike
 *     recomputes off the new current + shipping.
 */
import type {
  Channel,
  ChannelPayload,
  CompetitorOffer,
  ImportType,
  PricingContext,
  PricingRule,
  PriceMatchConfig,
  SaleDurationConfig,
  ShippingAddonConfig,
  SkipExtrasConfig,
  SourceProduct,
  StrikeMultiplierConfig,
} from "./types";
import { isValidGtin } from "./matching";

const ISO_DATE = (d: Date): string => d.toISOString().slice(0, 10);

const ruleConfig = <T>(rules: PricingRule[], type: string, channel: Channel): T | null => {
  const r = rules.find((x) => x.active && x.channel === channel && x.rule_type === type);
  return (r?.config as T) ?? null;
};

export interface PriceForResult {
  payload: ChannelPayload;
  applied_rules: string[];
}

export const priceFor = (
  product: SourceProduct,
  ctx: PricingContext
): PriceForResult => {
  const applied: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const importType: ImportType = ctx.import_type ?? "official";

  if (product.base_price <= 0) {
    warnings.push("base_price <= 0 — product likely missing real price");
  }
  if ((product.pickup_cost ?? 0) < 0) {
    errors.push(`pickup_cost is negative (${product.pickup_cost}) — refusing to compute price`);
  }

  // 1) current_price = HaContainer sale + per-product pickup. No shipping here
  //    — shipping_cost carries the 39 ILS separately so Mirakl bills it once.
  let current = round2(product.base_price + (product.pickup_cost ?? 0));

  // 2) Price-match against competitors (if rule active).
  // Drop offers with non-finite or non-positive prices — a bad scrape with
  // price=0 or price=-1 would otherwise win the reduce and produce a bogus
  // current_price pushed to Super-Pharm.
  const matchCfg = ruleConfig<PriceMatchConfig>(ctx.rules, "price_match", ctx.channel);
  if (matchCfg?.match_lowest_competitor && ctx.competitors?.length) {
    const valid = ctx.competitors.filter(
      (c) => Number.isFinite(c.price) && c.price > 0
    );
    const lowest = valid.reduce<CompetitorOffer | null>(
      (acc, c) => (acc === null || c.price < acc.price ? c : acc),
      null
    );
    if (lowest && lowest.price < current) {
      current = round2(lowest.price);
      applied.push(`price_match:matched_to_${lowest.seller_name}@${lowest.price}`);
    }
  }

  // 3) Shipping addon — carried as its own field (39 ILS), NOT rolled into
  //    current_price. Mirakl charges it on top at checkout.
  const shipCfg = ruleConfig<ShippingAddonConfig>(ctx.rules, "shipping_addon", ctx.channel);
  const shipping = shipCfg?.amount ?? 0;
  if (shipCfg) applied.push(`shipping_addon:${shipping}`);

  // 4) Strike-through "before sale" price = (current + shipping) × multiplier.
  //    Multiplier applies to the POST-shipping figure (Ran 2026-05-06): so
  //    sale 100 + shipping 39 → strike 160 (139 × 1.15 → 159.85 → 160). The
  //    saving the buyer sees on the SP listing reflects total-paid difference.
  const strikeCfg = ruleConfig<StrikeMultiplierConfig>(ctx.rules, "strike_multiplier", ctx.channel);
  let strike: number | null = null;
  if (strikeCfg) {
    strike = roundEven((current + shipping) * strikeCfg.factor);
    applied.push(`strike_multiplier:${strikeCfg.factor}`);
  }

  // 5) Sale window.
  const today = ctx.today ?? new Date();
  const durCfg = ruleConfig<SaleDurationConfig>(ctx.rules, "sale_duration", ctx.channel);
  const days = durCfg?.days ?? 30;
  const start = new Date(today);
  const end = new Date(today);
  end.setDate(end.getDate() + days);
  applied.push(`sale_duration:${days}`);

  // 6) skip_extras — bookkeeping only; the source already split shipping classes.
  const skipCfg = ruleConfig<SkipExtrasConfig>(ctx.rules, "skip_extras", ctx.channel);
  if (skipCfg) applied.push(`skip_extras:${skipCfg.labels.join(",")}`);

  // EAN gate — Super-Pharm 'official' imports require a checksum-valid EAN.
  // 'parallel' imports tolerate shop_sku-only and skip the gate.
  // Other channels (zap, walla, ...) only warn until we lock per-channel rules.
  if (!product.ean) {
    if (ctx.channel === "superpharm" && importType === "official") {
      errors.push("missing EAN — required for superpharm official import");
    } else {
      warnings.push("missing EAN — channel matching may fail");
    }
  } else if (!isValidGtin(product.ean)) {
    if (ctx.channel === "superpharm" && importType === "official") {
      errors.push(`EAN ${product.ean} fails GS1 checksum — refusing official import`);
    } else {
      warnings.push(`EAN ${product.ean} fails GS1 checksum`);
    }
  }

  if (!product.name_he || !product.name_he.trim()) {
    errors.push("name_he is empty — Mirakl will reject the product");
  }

  const buildable = errors.length === 0;
  const payload: ChannelPayload = {
    channel: ctx.channel,
    sku: product.sku ?? product.hacontainer_id,
    ean: product.ean,
    name_he: product.name_he,
    description_he: product.description_he,
    current_price: current,
    strike_price: strike,
    shipping_cost: shipping,
    discount_start: ISO_DATE(start),
    discount_end: ISO_DATE(end),
    category_attributes: {},
    images: [],
    import_type: importType,
    warnings,
    buildable,
    errors,
  };

  return { payload, applied_rules: applied };
};

/** Round to 2 decimals — ILS prices on Super-Pharm. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Strike-price rounding: round to whole shekel (no agorot).
 *   1000 × 1.15 = 1150 → 1150 (Math.round)
 *   639  × 1.15 = 734.85 → 735.
 * NOTE: a comment in an earlier draft cited "1000 → 1149" from Ran's example;
 * the test fixtures + locked rule (PILOT.md) say plain `Math.round`. Defer the
 * substantive rounding question — keep behaviour identical to the test suite.
 */
const roundEven = (n: number): number => Math.round(n);
