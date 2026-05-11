/**
 * Deterministic, no-LLM category classifier for SP wrong_category errors.
 *
 * Strategy:
 *   1. Load every leaf from public.categories where sp_category_code IS NOT
 *      NULL and is_leaf = true. ~2,700 rows; pulled once and cached for 5 min.
 *   2. Tokenise the product name (Hebrew + English) — strip punctuation,
 *      lowercase, drop stop-words, drop tokens < 2 chars.
 *   3. Run a curated keyword → category-substring map first (e.g. "מקרר" →
 *      path contains "מקררים"). This catches the common cases with high
 *      precision.
 *   4. Fall through to a generic Jaccard overlap between product tokens
 *      and the leaf's `full_path` tokens. Pick the highest-scoring leaf
 *      with score ≥ MIN_SCORE.
 *   5. Reject (return null) when the best candidate is the same SP code
 *      that SP already rejected — that mapping is known wrong.
 *
 * Confidence is a function of token-overlap density and exclusivity of
 * the keyword hit. A direct keyword hit returns 0.85; a Jaccard-only hit
 * is bounded at 0.7. The orchestrator's `confidence ≥ 0.7` gate still
 * applies, so weak guesses fall through to manual_required.
 */
import { getServiceClient } from "@/utils/supabase/admin";

interface Leaf {
  category_id: string;
  sp_category_code: string;
  name_he: string;
  full_path: string;
  /** Lowercased path tokens, cached. */
  pathTokens: Set<string>;
}

const STOP_WORDS = new Set([
  "ה", "של", "עם", "על", "את", "או", "כדי", "מאת", "אל", "בין", "תחת", "מעל",
  "מתחת", "ללא", "בתוך", "מחוץ", "אחרי", "לפני", "כל", "כמה", "אין", "יש",
  "the", "and", "of", "in", "on", "for", "with", "by", "to", "a", "an",
]);

const HEBREW_PREFIX_RE = /^([למבהוכש])(.{3,})$/u;

const tokenise = (raw: string): string[] => {
  if (!raw) return [];
  const out = new Set<string>();
  const baseTokens = raw
    .toLowerCase()
    .replace(/["׳״'`.,()/\\\-_]+/g, " ")
    .split(/\s+/u)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  for (const t of baseTokens) {
    out.add(t);
    // Hebrew prepositions (ל / ב / מ / ה / ו / כ / ש) attach as a single
    // letter to nouns: "לסלון" → also consider "סלון". Only strip when
    // the result is ≥ 3 chars to avoid false matches.
    const m = t.match(HEBREW_PREFIX_RE);
    if (m) out.add(m[2]);
  }
  return [...out];
};

/**
 * Curated Hebrew keyword → SP path-substring rules. The right-hand side
 * is matched as a case-insensitive substring of the leaf's full_path.
 *
 * Order matters: more-specific rules first.
 */
// Each entry is matched as: ANY of `anyTokens` must appear in product
// tokens (singular OR plural form). pathSubstring is matched as
// case-insensitive substring of leaf full_path. Order = priority.
//
// IMPORTANT: SP hierarchy paths use Hebrew SINGULAR construct-state forms
// (e.g. "מקרר", "מזגן", "כסא") rather than plural. Use singular substrings.
const KEYWORD_RULES: Array<{ anyTokens: string[]; pathSubstring: string }> = [
  // Major appliances.
  { anyTokens: ["מקרר", "מקררים"], pathSubstring: "מקרר" },
  { anyTokens: ["מקפיא", "מקפיאים"], pathSubstring: "מקפיא" },
  { anyTokens: ["כביסה"], pathSubstring: "מכונת כביסה" },
  { anyTokens: ["מייבש"], pathSubstring: "מייבש" },
  { anyTokens: ["מדיח", "מדיחי"], pathSubstring: "מדיח כלים" },
  { anyTokens: ["תנור", "תנורי"], pathSubstring: "תנור" },
  { anyTokens: ["כיריים", "כירה"], pathSubstring: "כיריים" },
  { anyTokens: ["מיקרוגל"], pathSubstring: "מיקרוגל" },
  { anyTokens: ["מזגן"], pathSubstring: "מזגן" },
  { anyTokens: ["מאוורר"], pathSubstring: "מאוורר" },
  { anyTokens: ["מצנן"], pathSubstring: "מצנן" },
  { anyTokens: ["מחמם", "מפזר"], pathSubstring: "מחמם" },
  { anyTokens: ["דוד", "בויילר"], pathSubstring: "דוד" },
  { anyTokens: ["אדים"], pathSubstring: "אדים" },
  { anyTokens: ["לחות", "מקצועי"], pathSubstring: "לחות" },
  // מגבר must come before טלוויזיה — "מגבר אישי לטלוויזיה" otherwise
  // gets classified as a TV. SP has no "מגבר שמיעה" leaf, so use the
  // mobility-accessories umbrella ("אביזרי ניידות") which is what SP
  // merchandiser surface routes hearing-aid devices to.
  { anyTokens: ["מגבר"], pathSubstring: "אביזרי ניידות" },
  // SP has no "מגירת חימום" leaf either; warming drawers are built-in
  // oven accessories — route them to "תנורי בילד-אין".
  { anyTokens: ["מגירת"], pathSubstring: "תנורי בילד-אין" },
  { anyTokens: ["טלוויזיה"], pathSubstring: "טלוויזיה" },
  // Small kitchen appliances.
  { anyTokens: ["kaave"], pathSubstring: "מכונות קפה" },
  { anyTokens: ["אספרסו"], pathSubstring: "מכונות קפה" },
  { anyTokens: ["מקציף"], pathSubstring: "מקציף חלב" },
  { anyTokens: ["שואב", "שואבי"], pathSubstring: "שואב אבק" },
  { anyTokens: ["טוסטר"], pathSubstring: "טוסטר" },
  { anyTokens: ["בלנדר"], pathSubstring: "בלנדר" },
  { anyTokens: ["מיקסר"], pathSubstring: "מיקסר" },
  { anyTokens: ["קומקום"], pathSubstring: "קומקום" },
  { anyTokens: ["מצנם"], pathSubstring: "מצנם" },
  { anyTokens: ["מטחנה"], pathSubstring: "מטחנה" },
  { anyTokens: ["מסחטה", "סוחט"], pathSubstring: "מסחטה" },
  // Personal care.
  { anyTokens: ["מייבשי", "מייבש"], pathSubstring: "מייבש שיער" },
  { anyTokens: ["מחליק", "מחליקי"], pathSubstring: "מחליק שיער" },
  { anyTokens: ["pixie"], pathSubstring: "אביזרים למעצבי שיער" },
  { anyTokens: ["airwrap", "מעצבי"], pathSubstring: "מעצב שיער" },
  { anyTokens: ["תספורת"], pathSubstring: "תספורת" },
  { anyTokens: ["משקל"], pathSubstring: "משקל אישי" },
  { anyTokens: ["מגבר"], pathSubstring: "מגבר שמיעה" },
  // Audio / TV peripherals.
  { anyTokens: ["אוזניות"], pathSubstring: "אוזניות" },
  { anyTokens: ["רמקול"], pathSubstring: "רמקול" },
  { anyTokens: ["מקרן"], pathSubstring: "מקרן" },
  // Lighting.
  { anyTokens: ["פנס"], pathSubstring: "פנס" },
  { anyTokens: ["מנורה"], pathSubstring: "מנורה" },
  // Sports / outdoor.
  { anyTokens: ["טרמפולינה"], pathSubstring: "טרמפולינה" },
  { anyTokens: ["אופניים", "אופני"], pathSubstring: "אופניים" },
  { anyTokens: ["טניס", "פינג", "מטקה", "מטקות"], pathSubstring: "טניס שולחן" },
  { anyTokens: ["כדורגל"], pathSubstring: "כדורגל" },
  { anyTokens: ["כדורסל"], pathSubstring: "כדורסל" },
  { anyTokens: ["כדורעף"], pathSubstring: "כדורעף" },
  // Furniture.
  { anyTokens: ["ספה", "ספות"], pathSubstring: "ספה" },
  { anyTokens: ["מיטה", "מיטות"], pathSubstring: "מיטה" },
  { anyTokens: ["שידה", "שידת"], pathSubstring: "שידה" },
  { anyTokens: ["ארון"], pathSubstring: "ארון" },
  { anyTokens: ["שולחן", "כתיבה"], pathSubstring: "שולחן" },
  { anyTokens: ["ספריה", "ספרייה"], pathSubstring: "ספריה" },
  // Toys.
  { anyTokens: ["צעצוע", "לגו", "משחק"], pathSubstring: "צעצוע" },
  // Tools / DIY.
  { anyTokens: ["מקדחה"], pathSubstring: "מקדחה" },
  // Bathroom.
  { anyTokens: ["אסלה", "סילוקית"], pathSubstring: "אסלה" },
  // Home accessories.
  { anyTokens: ["תריס"], pathSubstring: "תריס" },
  // Fitness / gym — SP-confirmed paths.
  { anyTokens: ["וול", "וולבול", "מדיסין", "סלאם", "סלאמבול", "wb"], pathSubstring: "כדורי התעמלות" },
  { anyTokens: ["משקולת", "משקולות", "דאמבל", "קטלבל"], pathSubstring: "משקולות" },
  { anyTokens: ["גומייה", "גומיות", "wbands", "powerband"], pathSubstring: "גומיות התנגדות" },
  { anyTokens: ["יוגה", "פילאטיס"], pathSubstring: "יוגה" },
  { anyTokens: ["פליאומטרית", "פליאומטריות", "פליאומטרי"], pathSubstring: "ספסלי כושר" },
  { anyTokens: ["bosu", "ג׳אמפר", "ג'אמפר", "יציבה", "שיווי"], pathSubstring: "כדור פיזיו" },
  { anyTokens: ["בולגרי", "kettlebell"], pathSubstring: "ספסלי כושר" },
  { anyTokens: ["איגרוף", "boxing", "punching"], pathSubstring: "איגרוף" },
  { anyTokens: ["ידית", "משיכה", "nt0445"], pathSubstring: "אביזרים למכשירי הרמת משקולות" },
  // Office chairs & gaming. Path uses "כסא" (no yud).
  { anyTokens: ["משרדי", "מחשב", "office"], pathSubstring: "כסאות משרד" },
  { anyTokens: ["גיימינג", "גיימרים", "gaming", "gamer"], pathSubstring: "כסאות לגיימרים" },
  { anyTokens: ["סלון"], pathSubstring: "כסאות מעוצבים" },
  { anyTokens: ["פינת-אוכל"], pathSubstring: "פינת אוכל" },
  { anyTokens: ["בר"], pathSubstring: "כסאות בר" },
  // Children's furniture / playground.
  { anyTokens: ["פוף", "פופים"], pathSubstring: "פופים" },
  { anyTokens: ["בריכת"], pathSubstring: "בריכת כדורים" },
  { anyTokens: ["מנהרה", "מנהרות"], pathSubstring: "מנהרות משחק" },
  { anyTokens: ["מדפי", "מדף"], pathSubstring: "מדפים" },
  // Outdoor cooking.
  { anyTokens: ["טאבון", "גריל"], pathSubstring: "גריל" },
  // Plumbing / DIY pipes.
  { anyTokens: ["שרשורי", "אלומיניום", "אוורור", "מיזוג"], pathSubstring: "גלגלות וצינורות גינה" },
  { anyTokens: ["צינור", "צנרת"], pathSubstring: "צנרת" },
  // Kitchen prep / slicers.
  { anyTokens: ["פורסת", "חיתוך"], pathSubstring: "פורסות" },
  // Built-in oven warmer drawer.
  { anyTokens: ["מגירת"], pathSubstring: "מגירת חימום" },
  // Misc fallbacks.
  { anyTokens: ["כיסא", "כסא", "מרופד"], pathSubstring: "כסא" },
  { anyTokens: ["שולחני", "שולחן"], pathSubstring: "שולחן" },
  { anyTokens: ["וופל"], pathSubstring: "וופל" },
  { anyTokens: ["מקלדת"], pathSubstring: "מקלדת" },
  { anyTokens: ["עכבר"], pathSubstring: "עכבר" },
  { anyTokens: ["שעון"], pathSubstring: "שעון" },
  { anyTokens: ["קרח"], pathSubstring: "מכשיר להכנת קוביות קרח" },
  { anyTokens: ["מתקן"], pathSubstring: "מתקן" },
  // Flour sifters have no exact SP leaf. Route them to strainers rather
  // than food/flour categories, otherwise SP asks for nutrition attributes.
  { anyTokens: ["נפה", "נפת", "מנפה"], pathSubstring: "מסננות" },
  { anyTokens: ["נפת", "נפה"], pathSubstring: "נפת קמח" },
  { anyTokens: ["מפוח"], pathSubstring: "מפוח" },
  { anyTokens: ["מוט", "אולימפי"], pathSubstring: "מוט" },
  { anyTokens: ["טבעות"], pathSubstring: "טבעות" },
  { anyTokens: ["אוהל"], pathSubstring: "אוהל" },
  { anyTokens: ["שק"], pathSubstring: "שק" },
];

let leafCache: { ts: number; rows: Leaf[] } | null = null;
const LEAF_CACHE_MS = 5 * 60_000;

const loadLeaves = async (): Promise<Leaf[]> => {
  if (leafCache && Date.now() - leafCache.ts < LEAF_CACHE_MS) return leafCache.rows;
  const sb = getServiceClient();
  const out: Leaf[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("categories")
      .select("id, sp_category_code, name_he, full_path")
      .eq("is_leaf", true)
      .not("sp_category_code", "is", null)
      .range(from, from + 999);
    if (error) throw new Error(`categories read: ${error.message}`);
    const rows = (data ?? []) as {
      id: string;
      sp_category_code: string;
      name_he: string;
      full_path: string | null;
    }[];
    for (const r of rows) {
      const path = r.full_path ?? r.name_he ?? "";
      out.push({
        category_id: r.id,
        sp_category_code: r.sp_category_code,
        name_he: r.name_he ?? "",
        full_path: path,
        pathTokens: new Set(tokenise(path)),
      });
    }
    if (rows.length < 1000) break;
    from += 1000;
  }
  leafCache = { ts: Date.now(), rows: out };
  return out;
};

export interface HeuristicClassifyInput {
  name_he: string;
  description_he: string | null;
  brand: string | null;
  /** SP code that was rejected. Used to filter that exact mapping out. */
  current_sp_code?: string | null;
  /** Local category_id that was rejected. Same purpose. */
  current_category_id?: string | null;
}

export interface HeuristicClassifyResult {
  category_id: string | null;
  sp_category_code: string | null;
  full_path: string | null;
  confidence: number;
  reasoning: string;
}

const KEYWORD_CONFIDENCE = 0.85;
const JACCARD_FLOOR = 0.7;

export const classifyByHeuristic = async (
  inv: HeuristicClassifyInput
): Promise<HeuristicClassifyResult> => {
  const leaves = await loadLeaves();
  const productTokens = tokenise(
    `${inv.name_he} ${inv.brand ?? ""} ${(inv.description_he ?? "").slice(0, 200)}`
  );
  const productSet = new Set(productTokens);

  const isRejected = (l: Leaf): boolean =>
    (inv.current_sp_code != null && l.sp_category_code === inv.current_sp_code) ||
    (inv.current_category_id != null && l.category_id === inv.current_category_id);

  // 1. Curated keyword rules — high precision. The rule fires when ANY
  //    of `anyTokens` is present (singular OR plural variant). To handle
  //    Hebrew construct-state forms (e.g. "שידת" for "שידה"), we also
  //    accept tokens that start with any rule keyword of length ≥ 4 plus
  //    a Hebrew letter (very tight prefix match).
  const productList = [...productSet];
  for (const rule of KEYWORD_RULES) {
    let matched: string | null = null;
    for (const t of rule.anyTokens) {
      const tk = t.toLowerCase();
      if (productSet.has(tk)) { matched = t; break; }
      if (tk.length >= 4) {
        const stem = tk.replace(/[ה-ת]$/u, "");
        if (stem.length >= 3 && productList.some((p) => p.startsWith(stem))) {
          matched = t;
          break;
        }
      }
    }
    if (!matched) continue;
    const candidates = leaves.filter(
      (l) =>
        !isRejected(l) &&
        l.full_path.toLowerCase().includes(rule.pathSubstring.toLowerCase())
    );
    if (candidates.length === 0) continue;
    // If multiple match, prefer one with highest path-token overlap with product.
    candidates.sort((a, b) => {
      const sa = [...productSet].filter((t) => a.pathTokens.has(t)).length;
      const sb = [...productSet].filter((t) => b.pathTokens.has(t)).length;
      return sb - sa;
    });
    const best = candidates[0];
    return {
      category_id: best.category_id,
      sp_category_code: best.sp_category_code,
      full_path: best.full_path,
      confidence: KEYWORD_CONFIDENCE,
      reasoning: `keyword rule: ${matched} → ${rule.pathSubstring}`,
    };
  }

  // 2. Generic Jaccard overlap fallback.
  if (productSet.size === 0) {
    return {
      category_id: null,
      sp_category_code: null,
      full_path: null,
      confidence: 0,
      reasoning: "no extractable tokens",
    };
  }
  let best: { leaf: Leaf; score: number; overlap: number } | null = null;
  for (const l of leaves) {
    if (isRejected(l)) continue;
    if (l.pathTokens.size === 0) continue;
    let overlap = 0;
    for (const t of productSet) if (l.pathTokens.has(t)) overlap++;
    if (overlap < 2) continue;
    const denom = productSet.size + l.pathTokens.size - overlap;
    const jaccard = denom > 0 ? overlap / denom : 0;
    if (!best || jaccard > best.score) {
      best = { leaf: l, score: jaccard, overlap };
    }
  }
  if (!best) {
    return {
      category_id: null,
      sp_category_code: null,
      full_path: null,
      confidence: 0,
      reasoning: "no leaf with overlap ≥ 2",
    };
  }
  // Map jaccard to confidence: 0.10 jaccard ≈ 0.7, 0.30 ≈ 0.9, capped 0.9.
  const confidence = Math.min(0.9, JACCARD_FLOOR + best.score * 1.5);
  return {
    category_id: best.leaf.category_id,
    sp_category_code: best.leaf.sp_category_code,
    full_path: best.leaf.full_path,
    confidence,
    reasoning: `jaccard=${best.score.toFixed(3)} overlap=${best.overlap} path="${best.leaf.full_path}"`,
  };
};
