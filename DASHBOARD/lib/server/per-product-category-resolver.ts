/**
 * Per-product Super-Pharm category sub-type resolver.
 *
 * Container's catalog labels rows with broad parent categories (e.g.
 * "מקררים" — refrigerators). Super-Pharm's tree splits each into specific
 * leaves (top-freezer, bottom-freezer, side-by-side, 4-door, mini, etc.).
 *
 * The default-mapping in `container_category_mappings` picks ONE leaf per
 * Container label as a baseline (e.g. "מקררים" → 55201500mp / מקרר מקפיא
 * תחתון). Without this resolver, every refrigerator — top-freezer or SBS
 * or 4-door — uploads as bottom-freezer, and the SP merchandiser flags
 * them as wrong-category.
 *
 * This module inspects the product's `name_he` (and falls back to
 * `description_he`) to pick a more accurate SP leaf. When no rule fires,
 * the caller's existing default code is returned unchanged — strict
 * non-degradation.
 *
 * SERVER-ONLY. Pure regex; no DB / API calls.
 */

interface ResolveSrc {
  name_he: string;
  description_he?: string | null;
}

/** A rule maps a regex (matched against name+description) to a SP leaf code. */
interface SubTypeRule {
  /** Either a single regex (test on the full text) or an array (any matches). */
  match: RegExp | RegExp[];
  /** SP hierarchy code to assign when the rule fires. */
  sp_code: string;
}

/** Map: parent (or default) SP code → ordered list of sub-type rules.
 *  Rules are evaluated top-to-bottom; first match wins. The first entry
 *  in each list should be the most specific pattern. */
const RULES: Record<string, SubTypeRule[]> = {
  // === Refrigerators (Container "מקררים" defaults to 55201500mp) ===
  "55201500mp": [
    // Side-by-side (must check before plain "מקפיא" patterns)
    { match: [/\bSBS\b/i, /side[\s-]*by[\s-]*side/i, /\bSXS\b/i], sp_code: "55201300mp" },
    // 4 / 4+5-door
    { match: [/\b4\s*\+?\s*5?\s*דלתות\b/, /\b4[\s-]*דלתות\b/, /\b5[\s-]*דלתות\b/, /4[\s-]*door/i], sp_code: "55201200mp" },
    // 3-door
    { match: [/\b3[\s-]*דלתות\b/, /\bבן\s*שלוש\s*דלתות/, /3[\s-]*door/i], sp_code: "55201100mp" },
    // Top-freezer
    { match: [/מקפיא\s*עליון/, /פריזר\s*עליון/, /top[\s-]*freezer/i, /TM\b/i], sp_code: "55201400mp" },
    // Bottom-freezer (default — explicit also catches "מקפיא תחתון")
    { match: [/מקפיא\s*תחתון/, /פריזר\s*תחתון/, /bottom[\s-]*freezer/i, /BM\b/i], sp_code: "55201500mp" },
    // Office / mini / 90L-and-under
    { match: [/משרדי/, /מיני\s*בר/, /\bMINI\b/i, /\b(?:60|70|80|90|100|110)\s*ליטר\b/], sp_code: "55201800mp" },
    // Wine fridge — explicit subcategory
    { match: [/יין/, /\bwine\b/i], sp_code: "10161811mp" },
    // Industrial / commercial — keep default (no separate SP leaf for industrial fridges)
  ],

  // === Standing fans (Container "מאווררים" defaults to 55161200mp) ===
  "55161200mp": [
    { match: [/מאוורר\s*מגדל/, /\btower\s*fan\b/i, /TF\d+/i], sp_code: "55161100mp" },
    { match: [/מאוורר\s*עומד/, /\bstand(ing)?\s*fan\b/i], sp_code: "55161200mp" },
    { match: [/מאוורר\s*שולחני/, /\btable\s*fan\b/i, /\bdesk\s*fan\b/i], sp_code: "55161300mp" },
    { match: [/מאוורר\s*תקרה/, /מאווררי?\s*תקרה/, /תלייה/, /\bceiling\s*fan\b/i], sp_code: "55161400mp" },
    { match: [/מסחרר\s*אוויר/, /חקלאי/], sp_code: "55161200mp" }, // industrial — no specific leaf
  ],

  // === ACs (Container "מזגנים" defaults to 55161700mp / מזגן עילי) ===
  "55161700mp": [
    { match: [/מזגן\s*נייד/, /portable\s*air\s*condition/i], sp_code: "55161600mp" },
    { match: [/מזגן\s*נסתר/, /concealed/i], sp_code: "55162500mp" },
    { match: [/מזגן\s*עילי/, /split\s*air\s*condition/i], sp_code: "55161700mp" },
    { match: [/מיני\s*מרכזי/, /multi[\s-]*split/i], sp_code: "55161500mp" },
  ],

  // === Cooktops (Container "כיריים" defaults to 55101100mp / גז) ===
  "55101100mp": [
    { match: [/אינדוקצי/, /\binduction\b/i, /קרמי/, /\bceramic\b/i], sp_code: "55101000mp" },
    { match: [/כירת\s*בישול\s*חשמלית/, /electric\s*cookt/i], sp_code: "55101000mp" },
    { match: [/השיש/, /domino/i, /חשמלית\s*כפולה/], sp_code: "55101200mp" },
    { match: [/גז/, /\bgas\b/i], sp_code: "55101100mp" },
  ],

  // === Washing machines (Container "מכונות כביסה" defaults to 55131600mp / front-load) ===
  "55131600mp": [
    { match: [/פתח\s*עליון/, /top[\s-]*load/i], sp_code: "55131500mp" },
    { match: [/משולבת/, /combo/i, /washer[\s-]*dryer/i], sp_code: "55132300mp" },
    { match: [/פתח\s*קדמי/, /front[\s-]*load/i], sp_code: "55131600mp" },
  ],

  // === Vacuum cleaners (Container "שואבי אבק" defaults to 55132000mp / canister) ===
  "55132000mp": [
    { match: [/רובוט/, /\brobot/i, /Roomba/i, /robotic/i], sp_code: "55132100mp" },
    { match: [/ידני/, /\bhandheld\b/i, /stick\s*vac/i, /\bcordless\b/i, /אלחוטי/], sp_code: "55131900mp" },
    { match: [/שטיפה/, /wet\s*\/?\s*dry/i, /vacuum\s*\&?\s*wash/i, /שואב\s*ושוטף/], sp_code: "55131800mp" },
    { match: [/מקצועי/, /תעשייתי/, /industrial/i, /shop[\s-]*vac/i], sp_code: "10131900mp" },
    { match: [/נגרר/, /canister/i, /צירי/], sp_code: "55132000mp" },
  ],

  // === Speakers (Container "רמקולים" defaults to 55181410mp / bookshelf) ===
  "55181410mp": [
    { match: [/נייד/, /portable/i, /\bbluetooth\b/i, /\bBT\b/i, /\bwireless\b/i], sp_code: "55181416mp" },
    { match: [/רצפתי/, /floor[\s-]*stand/i, /\btower\b/i], sp_code: "55181411mp" },
    { match: [/שקוע/, /in[\s-]*wall/i, /in[\s-]*ceiling/i], sp_code: "55181413mp" },
  ],

  // === Headphones (Container "אוזניות" defaults to 55181511mp / earbuds) ===
  "55181511mp": [
    { match: [/קשת/, /over[\s-]*ear/i, /headphones?\b/i, /\bDJ\b/i], sp_code: "55181514mp" },
    { match: [/עורף/, /neckband/i, /around[\s-]*the[\s-]*neck/i], sp_code: "55181510mp" },
    { match: [/earbuds?/i, /\bTWS\b/i, /true\s*wireless/i], sp_code: "55181511mp" },
  ],

  // === Toasters (Container "טוסטרים" defaults to 55141300mp / oven toaster) ===
  "55141300mp": [
    { match: [/לחיצה/, /\bpress\b/i, /panini/i, /sandwich\s*press/i, /טוסטר?\s*לחיצה/], sp_code: "55141400mp" },
    { match: [/אובן/, /oven\s*toast/i, /toaster\s*oven/i], sp_code: "55141300mp" },
  ],

  // === Ovens (Container "תנורי אפיה" defaults to 55101500mp / combo) ===
  "55101500mp": [
    { match: [/בילד[\s-]*אין/, /built[\s-]*in/i, /בנוי/, /אינטגרל/], sp_code: "55101400mp" },
    { match: [/משולב/, /\bcombi(nation)?\b/i, /freestanding/i, /עומד/], sp_code: "55101500mp" },
  ],

  // === Freezers (Container "מקפיאים" defaults to 55201000mp — only one leaf) ===
  // No sub-types; rules entry kept empty intentionally for clarity.
  "55201000mp": [],
};

/**
 * Resolve the most-accurate SP leaf code for a single product.
 *
 * @param defaultSpCode — what the container_category_mappings table says
 *   for this product's category. Used as the lookup key in RULES and as
 *   the fallback if no rule matches.
 * @returns — the resolved SP code (more specific than the default when
 *   a rule fires; same as the default otherwise).
 */
export const resolveSubTypeForProduct = (
  defaultSpCode: string,
  src: ResolveSrc
): string => {
  const rules = RULES[defaultSpCode];
  if (!rules || rules.length === 0) return defaultSpCode;
  const text = `${src.name_he ?? ""}\n${src.description_he ?? ""}`;
  for (const rule of rules) {
    const patterns = Array.isArray(rule.match) ? rule.match : [rule.match];
    if (patterns.some((re) => re.test(text))) return rule.sp_code;
  }
  return defaultSpCode;
};
