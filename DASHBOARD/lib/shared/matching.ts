/**
 * Catalog matching: HaContainer inventory ↔ Super-Pharm offers.
 *
 * The comparison is intentionally tiered:
 * 1. Exact valid GTIN/EAN is authoritative.
 * 2. Invalid-but-equal barcode is strong, but not authoritative.
 * 3. Model/SKU identifiers, brand, category, normalized title tokens, numbers
 *    and price are scored together.
 *
 * This avoids the old failure mode where two products with different titles
 * were marked "missing" unless a narrow English brand+model regex matched.
 */

export type MatchMethod =
  | "ean_exact"
  | "ean_unverified"
  | "sku_or_product_id"
  | "brand_model_fuzzy"
  | "weighted_fuzzy"
  | "title_embedding"
  | "manual"
  | "none";
export type Verdict = "duplicate" | "candidate" | "missing" | "manual_review";

export interface InventoryRef {
  id: number;
  name_he: string | null;
  ean: string | null;
  sku?: string | null;
  product_brand?: string | null;
  brand?: string | null;
  category?: string | null;
  price?: number | null;
  pickup_cost?: number | null;
  description_he?: string | null;
  technical_specs?: Record<string, unknown> | null;
  embedding?: number[] | null;
}

export interface SuperPharmOfferRef {
  offer_id: string;
  product_title: string | null;
  ean: string | null;
  shop_sku?: string | null;
  product_sku?: string | null;
  product_id?: string | null;
  product_brand?: string | null;
  category_label?: string | null;
  price?: number | null;
  msrp?: number | null;
  description?: string | null;
  product_description?: string | null;
  embedding?: number[] | null;
}

export interface MatchResult {
  inventory_id: number;
  superpharm_offer_id: string | null;
  match_method: MatchMethod;
  confidence: number;
  verdict: Verdict;
  notes?: string;
}

export interface OfferCandidateIndex {
  offers: SuperPharmOfferRef[];
  byEan: Map<string, SuperPharmOfferRef[]>;
  byRawEan: Map<string, SuperPharmOfferRef[]>;
  byIdentifier: Map<string, SuperPharmOfferRef[]>;
  byBrand: Map<string, SuperPharmOfferRef[]>;
  byCategory: Map<string, SuperPharmOfferRef[]>;
  byToken: Map<string, SuperPharmOfferRef[]>;
}

interface ProductProfile {
  title: string;
  text: string;
  normalizedTitle: string;
  brand: string | null;
  category: string | null;
  ean: string | null;
  rawEanDigits: string | null;
  sku: string | null;
  identifiers: Set<string>;
  titleIdentifiers: Set<string>;
  tokens: Set<string>;
  significantTokens: Set<string>;
  numbers: Set<string>;
  price: number | null;
}

const HEBREW_LETTERS = /[\u0590-\u05ff]/;
const stripNonDigits = (s: string): string => s.replace(/\D/g, "");

const HEBREW_STOPWORDS = new Set([
  "עם",
  "של",
  "את",
  "על",
  "אל",
  "או",
  "עד",
  "לא",
  "זה",
  "זו",
  "הוא",
  "היא",
  "כולל",
  "ללא",
  "עבור",
  "מתאים",
  "מתאימה",
  "חדש",
  "חדשה",
  "צבע",
  "דגם",
  "מוצר",
  "סט",
  "יח",
  "יחידות",
  "ליטר",
  "קג",
  "סמ",
]);

const EN_STOPWORDS = new Set([
  "and",
  "or",
  "for",
  "with",
  "without",
  "the",
  "new",
  "set",
  "unit",
  "model",
  "color",
  "black",
  "white",
  "silver",
  "grey",
  "gray",
]);

const CATEGORY_HINTS = new Map<string, string[]>([
  ["מזוודות", ["מזוודה", "טרולי", "trolley", "suitcase", "luggage"]],
  ["תנורים", ["תנור", "oven"]],
  ["כיריים", ["כיריים", "hob", "cooktop"]],
  ["מקררים", ["מקרר", "fridge", "refrigerator"]],
  ["מזגנים", ["מזגן", "airconditioner", "air", "conditioner", "ac"]],
  ["מאווררים", ["מאוורר", "fan"]],
  ["מיקסרים", ["מיקסר", "mixer"]],
  ["שואבים", ["שואב", "vacuum"]],
  ["טלוויזיות", ["טלויזיה", "טלוויזיה", "tv", "television"]],
]);

const BRAND_ALIASES: Record<string, string> = {
  "סאוטר": "sauter",
  "זקש": "sachs",
  "בוש": "bosch",
  "סמסונג": "samsung",
  "אלקטרה": "electra",
  "תדיראן": "tadiran",
  "קריסטל": "crystal",
  "נינגה": "ninja",
  "סולתם": "soltam",
};

/** Validate GS1 mod-10 checksum across GTIN-8/12/13/14. Returns true if valid. */
export const isValidGtin = (raw: string | null | undefined): boolean => {
  if (!raw) return false;
  const digits = stripNonDigits(raw);
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  const checksum = digits.slice(-1);
  const body = digits.slice(0, -1).split("").reverse();
  let sum = 0;
  body.forEach((d, i) => {
    const w = i % 2 === 0 ? 3 : 1;
    sum += parseInt(d, 10) * w;
  });
  const expected = String((10 - (sum % 10)) % 10);
  return expected === checksum;
};

/** Normalize to a canonical 14-digit GTIN (left-pad zeros). */
export const normalizeGtin = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const d = stripNonDigits(raw);
  if (![8, 12, 13, 14].includes(d.length)) return null;
  return d.padStart(14, "0");
};

const canonicalText = (value: string | null | undefined): string => {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[\u0591-\u05c7]/g, "")
    .replace(/["״׳'`´]/g, "")
    .replace(/&quot;|&nbsp;/g, " ")
    .replace(/&amp;/g, " and ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[×xX]/g, " x ")
    .replace(/[־–—_/:()[\]{}.,;!?#@+*=|\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
};

const normalizeBrand = (value: string | null | undefined): string | null => {
  const s = canonicalText(value);
  if (!s) return null;
  const alias = BRAND_ALIASES[s] ?? s;
  return alias.replace(/\s+/g, "");
};

const tokenize = (text: string): string[] =>
  canonicalText(text)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

const isStopword = (token: string): boolean =>
  HEBREW_STOPWORDS.has(token) || EN_STOPWORDS.has(token) || token.length < 2;

const normalizeIdentifier = (token: string): string => token.toUpperCase().replace(/[^A-Z0-9]/g, "");

const hasLetterAndDigit = (token: string): boolean => /[A-Z]/i.test(token) && /\d/.test(token);

const extractIdentifiers = (...sources: Array<string | null | undefined>): Set<string> => {
  const ids = new Set<string>();
  for (const source of sources) {
    if (!source) continue;
    const text = source.normalize("NFKD");
    const matches = text.match(/[A-Za-z0-9][A-Za-z0-9._/-]{2,}[A-Za-z0-9]/g) ?? [];
    for (const raw of matches) {
      const id = normalizeIdentifier(raw);
      if (id.length >= 3 && hasLetterAndDigit(id)) ids.add(id);
    }
  }
  return ids;
};

const extractNumbers = (...sources: Array<string | null | undefined>): Set<string> => {
  const nums = new Set<string>();
  for (const source of sources) {
    if (!source) continue;
    const text = canonicalText(source);
    for (const m of text.matchAll(/\b\d+(?:[.,]\d+)?\b/g)) {
      const raw = m[0].replace(",", ".");
      const n = Number(raw);
      if (Number.isFinite(n)) nums.add(String(n));
    }
  }
  return nums;
};

const technicalText = (specs: Record<string, unknown> | null | undefined): string => {
  if (!specs) return "";
  const values: string[] = [];
  for (const value of Object.values(specs)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      values.push(String(value));
    } else if (Array.isArray(value)) {
      values.push(value.filter((v) => typeof v === "string" || typeof v === "number").join(" "));
    }
  }
  return values.join(" ");
};

const inferCategory = (category: string | null | undefined, text: string): string | null => {
  const explicit = canonicalText(category);
  if (explicit) return explicit;
  const normalized = canonicalText(text);
  for (const [canonical, hints] of CATEGORY_HINTS) {
    if (hints.some((hint) => normalized.includes(canonicalText(hint)))) return canonicalText(canonical);
  }
  return null;
};

const profileCache = new WeakMap<object, ProductProfile>();

const buildInventoryProfile = (inv: InventoryRef): ProductProfile => {
  const cached = profileCache.get(inv as object);
  if (cached) return cached;
  const title = inv.name_he ?? "";
  const tech = technicalText(inv.technical_specs);
  const text = [title, inv.description_he, tech, inv.brand, inv.product_brand, inv.category, inv.sku].filter(Boolean).join(" ");
  const tokens = new Set(tokenize(text));
  const significantTokens = new Set(Array.from(tokens).filter((t) => !isStopword(t)));
  const identifiers = extractIdentifiers(title, inv.sku, inv.description_he, tech);
  const titleIdentifiers = extractIdentifiers(title);
  const rawEanDigits = inv.ean ? stripNonDigits(inv.ean) || null : null;
  if (rawEanDigits && !normalizeGtin(inv.ean)) identifiers.add(rawEanDigits);
  const profile: ProductProfile = {
    title,
    text,
    normalizedTitle: canonicalText(title),
    brand: normalizeBrand(inv.brand ?? inv.product_brand ?? extractBrandModel(title).brand),
    category: inferCategory(inv.category, text),
    ean: normalizeGtin(inv.ean),
    rawEanDigits,
    sku: inv.sku ? normalizeIdentifier(inv.sku) : null,
    identifiers,
    titleIdentifiers,
    tokens,
    significantTokens,
    numbers: extractNumbers(title, inv.description_he, tech, inv.sku),
    price: inv.price ?? null,
  };
  profileCache.set(inv as object, profile);
  return profile;
};

const buildOfferProfile = (offer: SuperPharmOfferRef): ProductProfile => {
  const cached = profileCache.get(offer as object);
  if (cached) return cached;
  const title = offer.product_title ?? "";
  const text = [
    title,
    offer.description,
    offer.product_description,
    offer.product_brand,
    offer.category_label,
    offer.shop_sku,
    offer.product_sku,
    offer.product_id,
  ]
    .filter(Boolean)
    .join(" ");
  const tokens = new Set(tokenize(text));
  const significantTokens = new Set(Array.from(tokens).filter((t) => !isStopword(t)));
  const identifiers = extractIdentifiers(title, offer.shop_sku, offer.product_sku, offer.product_id, offer.description);
  const titleIdentifiers = extractIdentifiers(title);
  const rawEanDigits = offer.ean ? stripNonDigits(offer.ean) || null : null;
  if (rawEanDigits && !normalizeGtin(offer.ean)) identifiers.add(rawEanDigits);
  const profile: ProductProfile = {
    title,
    text,
    normalizedTitle: canonicalText(title),
    brand: normalizeBrand(offer.product_brand ?? extractBrandModel(title).brand),
    category: inferCategory(offer.category_label, text),
    ean: normalizeGtin(offer.ean),
    rawEanDigits,
    sku: offer.shop_sku ? normalizeIdentifier(offer.shop_sku) : null,
    identifiers,
    titleIdentifiers,
    tokens,
    significantTokens,
    numbers: extractNumbers(title, offer.description, offer.product_description, offer.shop_sku, offer.product_sku, offer.product_id),
    price: offer.price ?? null,
  };
  profileCache.set(offer as object, profile);
  return profile;
};

const intersectionSize = <T,>(a: Set<T>, b: Set<T>): number => {
  let count = 0;
  for (const x of a) if (b.has(x)) count++;
  return count;
};

const dice = <T,>(a: Set<T>, b: Set<T>): number => {
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 0;
  return (2 * intersectionSize(a, b)) / (a.size + b.size);
};

/** Levenshtein distance — small inputs only. */
const lev = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[a.length]![b.length]!;
};

const similarity = (a: string, b: string): number => {
  if (!a.length && !b.length) return 1;
  return 1 - lev(a, b) / Math.max(a.length, b.length);
};

const bestIdentifierSimilarity = (a: Set<string>, b: Set<string>): number => {
  let best = 0;
  for (const x of a) {
    for (const y of b) {
      if (x === y) return 1;
      if (Math.abs(x.length - y.length) > 3) continue;
      best = Math.max(best, similarity(x, y));
    }
  }
  return best;
};

const priceScore = (a: number | null, b: number | null): number => {
  if (a == null || b == null || a <= 0 || b <= 0) return 0;
  const ratio = Math.min(a, b) / Math.max(a, b);
  if (ratio >= 0.9) return 1;
  if (ratio >= 0.75) return 0.75;
  if (ratio >= 0.55) return 0.45;
  if (ratio >= 0.35) return 0.2;
  return 0;
};

const categoryScore = (a: string | null, b: string | null, invText: string, offerText: string): number => {
  if (a && b) {
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.78;
    const aTokens = new Set(tokenize(a));
    const bTokens = new Set(tokenize(b));
    const exact = dice(aTokens, bTokens);
    let fuzzyHits = 0;
    for (const x of aTokens) {
      for (const y of bTokens) {
        if (x !== y && similarity(x, y) >= 0.78) fuzzyHits++;
      }
    }
    return Math.max(exact, fuzzyHits > 0 ? 0.62 : 0);
  }
  const invCategory = inferCategory(null, invText);
  const offerCategory = inferCategory(null, offerText);
  if (invCategory && offerCategory) return invCategory === offerCategory ? 0.7 : 0;
  return 0;
};

const methodFor = (idScore: number, brandScore: number, titleScore: number): MatchMethod => {
  if (idScore >= 0.98) return "sku_or_product_id";
  if (idScore >= 0.86 && brandScore > 0) return "brand_model_fuzzy";
  if (titleScore >= 0.62) return "weighted_fuzzy";
  return "weighted_fuzzy";
};

const verdictFor = (confidence: number): Verdict => {
  if (confidence >= 0.86) return "duplicate";
  if (confidence >= 0.72) return "candidate";
  if (confidence >= 0.58) return "manual_review";
  return "missing";
};

export const matchByEan = (inv: InventoryRef, offers: SuperPharmOfferRef[]): MatchResult | null => {
  const invProfile = buildInventoryProfile(inv);
  if (!invProfile.ean || !isValidGtin(inv.ean)) return null;

  for (const o of offers) {
    const offerProfile = buildOfferProfile(o);
    if (offerProfile.ean && offerProfile.ean === invProfile.ean && isValidGtin(o.ean)) {
      return {
        inventory_id: inv.id,
        superpharm_offer_id: o.offer_id,
        match_method: "ean_exact",
        confidence: 0.99,
        verdict: "duplicate",
        notes: `valid GTIN ${invProfile.ean} matched`,
      };
    }
  }
  return null;
};

export const extractBrandModel = (name: string | null | undefined): { brand: string | null; model: string | null } => {
  if (!name) return { brand: null, model: null };
  const ids = Array.from(extractIdentifiers(name)).sort((a, b) => b.length - a.length);
  const tokens = tokenize(name);
  const model = ids[0] ?? null;
  let brand: string | null = null;
  if (model) {
    const modelIndex = tokens.findIndex((t) => normalizeIdentifier(t) === model);
    const before = modelIndex > 0 ? tokens[modelIndex - 1] : null;
    brand = normalizeBrand(before) ?? null;
  }
  if (!brand) {
    const leading = tokens.find((t) => HEBREW_LETTERS.test(t) && !isStopword(t)) ?? null;
    brand = leading ? normalizeBrand(leading) : null;
  }
  return { brand: brand ? brand.toUpperCase() : null, model };
};

export const matchByBrandModel = (
  inv: InventoryRef,
  offers: SuperPharmOfferRef[],
  threshold = 0.85
): MatchResult | null => {
  const invProfile = buildInventoryProfile(inv);
  if (invProfile.identifiers.size === 0) return null;
  let best: { score: number; offer: SuperPharmOfferRef; brandScore: number } | null = null;
  for (const o of offers) {
    const offerProfile = buildOfferProfile(o);
    if (offerProfile.identifiers.size === 0) continue;
    const idScore = bestIdentifierSimilarity(invProfile.identifiers, offerProfile.identifiers);
    const brandScore =
      invProfile.brand && offerProfile.brand
        ? invProfile.brand === offerProfile.brand
          ? 1
          : similarity(invProfile.brand, offerProfile.brand)
        : 0;
    if (idScore >= threshold && (brandScore >= 0.7 || !invProfile.brand || !offerProfile.brand)) {
      const score = 0.78 * idScore + 0.22 * brandScore;
      if (!best || score > best.score) best = { score, offer: o, brandScore };
    }
  }
  if (!best) return null;
  const confidence = Math.round(Math.min(0.95, best.score) * 100) / 100;
  return {
    inventory_id: inv.id,
    superpharm_offer_id: best.offer.offer_id,
    match_method: "brand_model_fuzzy",
    confidence,
    verdict: verdictFor(confidence),
    notes: `identifier=${best.score.toFixed(2)} brand=${best.brandScore.toFixed(2)}`,
  };
};

const scorePair = (inv: ProductProfile, offer: ProductProfile): { score: number; notes: string; method: MatchMethod } => {
  if (inv.rawEanDigits && offer.rawEanDigits && inv.rawEanDigits === offer.rawEanDigits) {
    return { score: 0.93, method: "ean_unverified", notes: `same barcode digits ${inv.rawEanDigits}` };
  }

  const idScore = bestIdentifierSimilarity(inv.identifiers, offer.identifiers);
  const titleIdScore = bestIdentifierSimilarity(inv.titleIdentifiers, offer.titleIdentifiers);
  const brandScore =
    inv.brand && offer.brand
      ? inv.brand === offer.brand
        ? 1
        : similarity(inv.brand, offer.brand)
      : 0;
  const titleScore = Math.max(dice(inv.significantTokens, offer.significantTokens), similarity(inv.normalizedTitle, offer.normalizedTitle) * 0.72);
  const category = categoryScore(inv.category, offer.category, inv.text, offer.text);
  const numbers = dice(inv.numbers, offer.numbers);
  const price = priceScore(inv.price, offer.price);
  const titleIdsCompatible =
    inv.titleIdentifiers.size === 0 || offer.titleIdentifiers.size === 0 || titleIdScore >= 0.78;

  let score =
    0.36 * idScore +
    0.24 * titleScore +
    0.16 * brandScore +
    0.12 * category +
    0.07 * numbers +
    0.05 * price;

  const penalties: string[] = [];
  if (inv.brand && offer.brand && brandScore < 0.55 && idScore < 0.98) {
    score -= 0.14;
    penalties.push("brand-conflict");
  }
  if (inv.titleIdentifiers.size > 0 && offer.titleIdentifiers.size > 0 && titleIdScore < 0.78) {
    score -= 0.24;
    penalties.push("model-conflict");
  }
  if (inv.category && offer.category && category < 0.18 && idScore < 0.98) {
    score -= 0.1;
    penalties.push("category-conflict");
  }
  if (inv.numbers.size > 0 && offer.numbers.size > 0 && numbers === 0 && idScore < 0.86) {
    score -= 0.07;
    penalties.push("number-conflict");
  }
  if (idScore >= 0.98 && titleIdsCompatible) score = Math.max(score, 0.9);
  if (idScore >= 0.86 && titleIdsCompatible && brandScore >= 0.7) score = Math.max(score, 0.82);
  if (titleScore >= 0.72 && brandScore >= 0.7) score = Math.max(score, 0.74);
  if (brandScore >= 0.9 && category >= 0.7 && price >= 0.7 && titleScore >= 0.18) {
    score = Math.max(score, numbers > 0 ? 0.66 : 0.6);
  }
  if (penalties.includes("model-conflict")) {
    score = Math.min(score, 0.54);
  }

  const rounded = Math.round(Math.max(0, Math.min(0.98, score)) * 100) / 100;
  const method = methodFor(idScore, brandScore, titleScore);
  const notes = [
    `id=${idScore.toFixed(2)}`,
    `titleId=${titleIdScore.toFixed(2)}`,
    `title=${titleScore.toFixed(2)}`,
    `brand=${brandScore.toFixed(2)}`,
    `category=${category.toFixed(2)}`,
    `numbers=${numbers.toFixed(2)}`,
    `price=${price.toFixed(2)}`,
    penalties.length ? `penalties=${penalties.join(",")}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return { score: rounded, method, notes };
};

const pushMap = (map: Map<string, SuperPharmOfferRef[]>, key: string | null | undefined, offer: SuperPharmOfferRef) => {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(offer);
  else map.set(key, [offer]);
};

export const createOfferCandidateIndex = (offers: SuperPharmOfferRef[]): OfferCandidateIndex => {
  const index: OfferCandidateIndex = {
    offers,
    byEan: new Map(),
    byRawEan: new Map(),
    byIdentifier: new Map(),
    byBrand: new Map(),
    byCategory: new Map(),
    byToken: new Map(),
  };

  for (const offer of offers) {
    const p = buildOfferProfile(offer);
    pushMap(index.byEan, p.ean, offer);
    pushMap(index.byRawEan, p.rawEanDigits, offer);
    pushMap(index.byBrand, p.brand, offer);
    pushMap(index.byCategory, p.category, offer);
    for (const id of p.identifiers) pushMap(index.byIdentifier, id, offer);
    for (const token of p.significantTokens) {
      if (token.length >= 3) pushMap(index.byToken, token, offer);
    }
  }

  return index;
};

const rankedCandidateOffers = (
  invProfile: ProductProfile,
  index: OfferCandidateIndex,
  maxCandidates = 300
): SuperPharmOfferRef[] => {
  const weights = new Map<SuperPharmOfferRef, number>();
  const add = (offers: SuperPharmOfferRef[] | undefined, weight: number) => {
    if (!offers) return;
    for (const offer of offers) weights.set(offer, (weights.get(offer) ?? 0) + weight);
  };

  add(invProfile.ean ? index.byEan.get(invProfile.ean) : undefined, 100);
  add(invProfile.rawEanDigits ? index.byRawEan.get(invProfile.rawEanDigits) : undefined, 80);
  for (const id of invProfile.identifiers) {
    add(index.byIdentifier.get(id), 52);
    // Fuzzy model candidates: compare only identifiers with similar prefix/length.
    for (const [other, offers] of index.byIdentifier) {
      if (Math.abs(other.length - id.length) <= 2 && other.slice(0, 2) === id.slice(0, 2)) {
        add(offers, 24);
      }
    }
  }
  add(invProfile.brand ? index.byBrand.get(invProfile.brand) : undefined, 18);
  add(invProfile.category ? index.byCategory.get(invProfile.category) : undefined, 14);
  for (const token of invProfile.significantTokens) {
    if (token.length >= 3) add(index.byToken.get(token), 4);
  }

  const ranked = Array.from(weights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCandidates)
    .map(([offer]) => offer);

  // If there is almost no lexical overlap, scan all offers. This is slower, but
  // prevents "missing" just because the index had no shared token.
  return ranked.length >= 12 ? ranked : index.offers;
};

const cosine = (a: number[], b: number[]): number => {
  if (a.length !== b.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
};

export const matchByEmbedding = (
  inv: InventoryRef,
  offers: SuperPharmOfferRef[],
  threshold = 0.7
): MatchResult | null => {
  if (!inv.embedding || inv.embedding.length === 0) return null;
  let best: { score: number; offer: SuperPharmOfferRef } | null = null;
  for (const o of offers) {
    if (!o.embedding || o.embedding.length === 0) continue;
    const sc = cosine(inv.embedding, o.embedding);
    if (sc >= threshold && (!best || sc > best.score)) best = { score: sc, offer: o };
  }
  if (!best) return null;
  const conf = 0.5 + 0.4 * best.score;
  const confidence = Math.round(conf * 100) / 100;
  return {
    inventory_id: inv.id,
    superpharm_offer_id: best.offer.offer_id,
    match_method: "title_embedding",
    confidence,
    verdict: verdictFor(confidence),
    notes: `cosine=${best.score.toFixed(3)}`,
  };
};

export const matchInventory = (inv: InventoryRef, offers: SuperPharmOfferRef[]): MatchResult => {
  return matchInventoryWithIndex(inv, createOfferCandidateIndex(offers));
};

export const matchInventoryWithIndex = (inv: InventoryRef, index: OfferCandidateIndex): MatchResult => {
  const invProfile = buildInventoryProfile(inv);
  const allCandidates = rankedCandidateOffers(invProfile, index);

  // EAN-conflict guard: when inventory has a valid GTIN, a candidate that has
  // its own valid GTIN that disagrees can never be the same product. Drop them
  // before fuzzy scoring so a strong title/brand match cannot fabricate a
  // duplicate verdict across two distinct EANs.
  const invHasValidEan = invProfile.ean !== null && isValidGtin(inv.ean);
  const candidates = invHasValidEan
    ? allCandidates.filter((o) => {
        const op = buildOfferProfile(o);
        if (!op.ean || !isValidGtin(o.ean)) return true;
        return op.ean === invProfile.ean;
      })
    : allCandidates;

  const t1 = matchByEan(inv, candidates);
  if (t1) return t1;

  let best: { score: number; offer: SuperPharmOfferRef; method: MatchMethod; notes: string } | null = null;
  for (const offer of candidates) {
    const offerProfile = buildOfferProfile(offer);
    const scored = scorePair(invProfile, offerProfile);
    if (!best || scored.score > best.score) {
      best = { score: scored.score, offer, method: scored.method, notes: scored.notes };
    }
  }

  const t3 = matchByEmbedding(inv, candidates);
  if (t3 && (!best || t3.confidence > best.score)) return t3;

  if (best && best.score >= 0.58) {
    return {
      inventory_id: inv.id,
      superpharm_offer_id: best.offer.offer_id,
      match_method: best.method,
      confidence: best.score,
      verdict: verdictFor(best.score),
      notes: best.notes,
    };
  }

  // If we filtered out an EAN-conflicting offer, surface it in notes for triage.
  const eanConflictNote =
    invHasValidEan && allCandidates.length > candidates.length
      ? "ean_conflict_filtered"
      : null;
  const baseNotes = best ? `best below threshold: ${best.notes}` : "no comparable offer";
  return {
    inventory_id: inv.id,
    superpharm_offer_id: null,
    match_method: "none",
    confidence: best?.score ?? 0,
    verdict: "missing",
    notes: eanConflictNote ? `${baseNotes} (${eanConflictNote})` : baseNotes,
  };
};
