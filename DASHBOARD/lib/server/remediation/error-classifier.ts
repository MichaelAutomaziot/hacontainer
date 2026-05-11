/**
 * Map a Mirakl PM01/OF01 error message to the SP error_code that the
 * remediation pipeline already knows how to handle. Used by the /check
 * route to auto-feed transformation_error_report rows into
 * remediation_queue without requiring the user to ingest XLSX manually.
 *
 * Pattern dictionary mirrors what we observed in the May 2026 batch:
 *   - "media" / resolution → MCM-05104
 *   - description required → temp_block (synthesised fallback handles it)
 *   - description too long → temp_block (clamp handles it)
 *   - attribute X is required / not in value list → MCM-05000
 *   - hierarchy / category errors → wrong_category
 *   - product state / does not exist → catalog state issue (handled by
 *     the OF01 retry-with-backoff path elsewhere)
 *
 * When the message doesn't match a known pattern, returns null and the
 * caller surfaces the raw message in the queue with a generic code so a
 * human can review.
 */

export interface ClassifiedError {
  /** Stable code that the orchestrator recognises and routes to a fixer. */
  error_code: string;
  /** Original Mirakl message preserved for the UI. */
  message: string;
  /** Mirakl attribute code(s) extracted from "התכונה 'XXXX' היא בגדר חובה". */
  attribute_codes?: string;
}

const ATTR_CODE_FROM_MSG = /['"]([0-9A-Za-z_-]{3,})['"]/;

export const classifyMiraklError = (
  rawMessage: string | null | undefined
): ClassifiedError | null => {
  const message = (rawMessage ?? "").trim();
  if (!message) return null;
  const lower = message.toLowerCase();

  // Image resolution / media format.
  if (
    /resolution|רזולוציה|media.*invalid|תכונה.*media/i.test(message) &&
    !/חייבת להיות תמונה/.test(message)
  ) {
    return { error_code: "MCM-05104", message };
  }
  if (/חייבת להיות תמונה|must be (?:an? )?image/i.test(message)) {
    return { error_code: "MCM-05106", message };
  }
  if (/באיכות נמוכה|low.{0,5}quality/i.test(message)) {
    return { error_code: "low_quality_image", message };
  }
  if (/רקע לבן|white\s*background|טקסטים או מידות/i.test(message)) {
    return { error_code: "invalid_main_image", message };
  }
  if (/לא מייצגת|not represent/i.test(message)) {
    return { error_code: "pic_invalid", message };
  }

  // Description content.
  if (
    /להסיר התייחסות|אחריות.*יבואן|מחירים מתיאור|forbidden|prohibited (?:words|content)/i.test(
      message
    )
  ) {
    return { error_code: "temp_block", message };
  }
  if (
    /(?:description|תאור|תיאור).*(?:required|נדרש|חובה)/i.test(message) ||
    /attribute 'description'.*required/i.test(message) ||
    /attribute "description".*required/i.test(message)
  ) {
    return { error_code: "temp_block", message };
  }
  if (
    /description.*(?:cannot exceed|exceed|too long|>=?\s*\d{3,})|תאור.*(?:אורך|מקסי)|2[ ,.]?000\s*characters/i.test(
      message
    )
  ) {
    return { error_code: "temp_block", message };
  }

  // Name.
  if (/שם מוצר לא תקין|name.*invalid/i.test(message)) {
    return { error_code: "Site_Ex1", message };
  }

  // Category.
  if (
    /הקטגוריה.*נכונה|wrong[\s-]?category|category.*invalid|hierarchy/i.test(
      message
    )
  ) {
    return { error_code: "wrong_category", message };
  }

  // Required / value-list attribute. Pull the code from the message when
  // present so the attr-fixer knows which extractor to invoke.
  if (
    /(?:בגדר חובה|is required|not in the possible values)/i.test(lower) ||
    /התכונה ['"][^'"]+['"]/.test(message)
  ) {
    const m = message.match(ATTR_CODE_FROM_MSG);
    return {
      error_code: "MCM-05000",
      message,
      attribute_codes: m?.[1] ?? undefined,
    };
  }

  // OF01 product state (catalog not yet published).
  if (/state of the product is unknown/i.test(message)) {
    return { error_code: "OF_STATE_UNKNOWN", message };
  }
  if (/product does not exist/i.test(message)) {
    return { error_code: "OF_PRODUCT_MISSING", message };
  }
  if (/product linked to the new offer/i.test(message)) {
    return { error_code: "OF_LINK_CONFLICT", message };
  }

  return null;
};

/** Bulk-classify; null entries are dropped. */
export const classifyMany = (
  rows: Array<{ sku?: string | null; error_message?: string | null }>
): Array<ClassifiedError & { sku: string }> => {
  const out: Array<ClassifiedError & { sku: string }> = [];
  for (const r of rows) {
    if (!r.sku) continue;
    const c = classifyMiraklError(r.error_message);
    if (c) out.push({ ...c, sku: r.sku });
  }
  return out;
};
