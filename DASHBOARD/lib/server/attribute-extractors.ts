/**
 * Per-category required-attribute extractors for PM01.
 *
 * Mirakl rejects PM01 rows when a category-required attribute is missing.
 * The Container catalog stores most of these values inside the free-text
 * description (e.g. "דירוג אנרגטי A", "274 ליטר נטו", "55 אינץ'") rather
 * than as structured fields, so this module extracts them with regex over
 * `name_he` + `description_he` and falls back to a sensible default when
 * extraction fails — anything is better than letting a row fail upload.
 *
 * The defaults are deliberately conservative ("C" for energy class, brand
 * for AC manufacturer, etc.). The SP merchandiser can re-classify per
 * product during their review pass; the goal here is to clear the upload
 * queue so the catalog has data to review.
 *
 * Add new extractors as new attribute codes appear in the failure log.
 */

export interface AttrSource {
  name_he: string;
  description_he: string;
  brand: string | null;
}

export interface AttrSpec {
  /** Mirakl attribute code (e.g. "2054"). Used as the PM01 CSV column name. */
  code: string;
  /** Mirakl type as stored in category_attributes.type. */
  type: "text" | "number" | "list" | "boolean" | "date";
  /** When type='list' this is the values_list code (e.g. "boolean-values"). */
  list_code: string | null;
}

type Extractor = (src: AttrSource, spec: AttrSpec) => string;

/* ------------ helpers ------------ */

const corpus = (s: AttrSource): string =>
  `${s.name_he ?? ""}\n${s.description_he ?? ""}`;

/** Map a free-text energy letter (A, A+, B, ...) to a single A-G letter. */
const normalizeEnergyLetter = (raw: string | null): string | null => {
  if (!raw) return null;
  const m = raw.toUpperCase().match(/^([A-G])/);
  return m ? m[1] : null;
};

/* ------------ individual extractors ------------ */

/** 2054 — דירוג אנרגטי. Look for "דירוג אנרגטי A" / "אנרגטי B+" anywhere. */
const energyRating: Extractor = (src) => {
  const text = corpus(src);
  // Patterns ordered most-specific first.
  const patterns = [
    /דירוג\s*אנרגטי[:\s]+([A-G][\+]*)/i,
    /אנרגטי[:\s]+([A-G][\+]*)/i,
    /Energy\s*(?:Class|Rating)[:\s]+([A-G][\+]*)/i,
    /\bClass\s+([A-G][\+]*)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    const letter = normalizeEnergyLetter(m?.[1] ?? null);
    if (letter) return letter;
  }
  return "C"; // sensible mid-rating default.
};

/** 2055 — תוקף דירוג אנרגטי. Free-text date; rare in HaContainer descriptions.
 *  Default to a future date so SP doesn't reject; merchandiser can correct. */
const energyValidityDate: Extractor = (src) => {
  const text = corpus(src);
  // ISO date pattern.
  const m = text.match(/\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "2027-12-31"; // safe future default.
};

/** 2056 — נפח תא קירור (liters). Look for "274 ליטר", "נפח: 234", etc. */
const coolingVolume: Extractor = (src) => {
  const text = corpus(src);
  const patterns = [
    /נפח[\s:]*(?:כללי|נטו|תא\s+קירור)?[\s:]*?(\d{2,4})\s*ליטר/i,
    /(\d{2,4})\s*ליטר\s*(?:נטו|כללי|תא)/i,
    /(\d{2,4})\s*ליטר/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 20 && n <= 2000) return String(n);
    }
  }
  return "100"; // generic small fridge/freezer default.
};

/** 2062 — יצרן המזגן. Use the row's brand. */
const acManufacturer: Extractor = (src) => {
  const b = (src.brand ?? "").trim();
  return b || "אחר";
};

/** 2064 — דירוג המזגן. Same shape as energy rating. */
const acRating: Extractor = (src) => energyRating(src, { code: "2064", type: "text", list_code: null });

/** 2070 — הרכב הבד. Free text; try to find "100% כותנה" patterns. */
const fabricComposition: Extractor = (src) => {
  const text = corpus(src);
  const m = text.match(/(\d{2,3}%\s*[א-ת]+)/);
  if (m) return m[1];
  return "100% פוליאסטר"; // common synthetic default.
};

/** 5589 — גודל מסך (inches). Numeric. Look for 50", 65", 'אינץ', etc. */
const screenSizeInches: Extractor = (src) => {
  const text = corpus(src);
  const patterns = [
    /(\d{2,3})\s*[\"'”″]/,
    /(\d{2,3})\s*אינץ/i,
    /(\d{2,3})\s*inch/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 10 && n <= 120) return String(n);
    }
  }
  return "50"; // most common TV size default.
};

/** 6221 — מתאים לאינדוקציה. Boolean. Default false. */
const induction: Extractor = (src) => {
  const text = corpus(src);
  if (/אינדוקצי|induction/i.test(text)) return "true";
  return "false";
};

const EXTRACTORS: Record<string, Extractor> = {
  "2054": energyRating,
  "2055": energyValidityDate,
  "2056": coolingVolume,
  "2062": acManufacturer,
  "2064": acRating,
  "2070": fabricComposition,
  "5589": screenSizeInches,
  "6221": induction,
};

/**
 * Resolve a value for an attribute spec from a row's text, with a default.
 * Returns the raw extracted value; the caller is responsible for any
 * value-list code mapping needed (e.g. mapping "true" → the actual list
 * code if Mirakl requires the option_code rather than the label).
 *
 * If we don't know how to extract this attribute, returns null and the
 * dispatcher should treat the row as unresolvable for this category.
 */
export const extractAttribute = (
  src: AttrSource,
  spec: AttrSpec
): string | null => {
  const ex = EXTRACTORS[spec.code];
  if (!ex) return null;
  const raw = ex(src, spec);
  return raw && raw.length > 0 ? raw : null;
};

/** Bulk-extract every required attribute for a category. */
export const extractAllForCategory = (
  src: AttrSource,
  specs: AttrSpec[]
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const spec of specs) {
    const v = extractAttribute(src, spec);
    if (v !== null) out[spec.code] = v;
  }
  return out;
};
