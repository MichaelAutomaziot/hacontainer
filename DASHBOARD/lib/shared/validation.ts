/**
 * Validators for Mirakl PM11/VL11 schemas + Hebrew sanitization helpers.
 * Pure — no I/O.
 */
import type { ChannelPayload } from "./types";

export interface CategoryAttributeSpec {
  attribute_code: string;
  required: boolean;
  type: "text" | "number" | "list" | "boolean" | "date";
  value_list: string[] | null;
}

export interface ValidationFinding {
  code: string;
  field: string;
  message: string;
  severity: "error" | "warning";
}

/** Validate a channel payload against the cached PM11 schema for its category. */
export const validateAgainstSchema = (
  payload: ChannelPayload,
  attrs: CategoryAttributeSpec[]
): ValidationFinding[] => {
  const findings: ValidationFinding[] = [];

  for (const a of attrs) {
    const val = payload.category_attributes[a.attribute_code];
    if (a.required && (val === undefined || val === null || val === "")) {
      findings.push({
        code: "missing_required",
        field: a.attribute_code,
        message: `Required attribute ${a.attribute_code} is missing`,
        severity: "error",
      });
      continue;
    }
    if (val === undefined || val === null || val === "") continue;

    if (a.type === "list" && a.value_list && !a.value_list.includes(String(val))) {
      findings.push({
        code: "invalid_list_value",
        field: a.attribute_code,
        message: `Value "${val}" not in allowed list (${a.value_list.length} options)`,
        severity: "error",
      });
    }
    if (a.type === "number" && typeof val !== "number") {
      findings.push({
        code: "invalid_number",
        field: a.attribute_code,
        message: `Expected number, got ${typeof val}`,
        severity: "error",
      });
    }
  }

  if (!payload.ean) {
    findings.push({
      code: "missing_ean",
      field: "ean",
      message: "EAN missing — product matching against Mirakl catalog will fail",
      severity: payload.import_type === "official" ? "error" : "warning",
    });
  }
  if (!payload.images.length) {
    findings.push({
      code: "no_images",
      field: "images",
      message: "No images uploaded; Super-Pharm requires at least one",
      severity: "error",
    });
  }
  for (const err of payload.errors) {
    findings.push({
      code: "payload_error",
      field: "payload",
      message: err,
      severity: "error",
    });
  }
  return findings;
};

/**
 * Strip commercial language from product name/description per Peri's spec
 * (no shipping, warranty, importer, parallel/official import language).
 *
 * This is a fallback regex pass; the real rewrite uses Claude via OpenRouter.
 */
export const stripCommercialLanguage = (text: string): string => {
  if (!text) return text;
  const banned: RegExp[] = [
    /יבוא\s*(מקביל|רשמי|אישי)/g,
    /משלוח\s*חינם/g,
    /אחריות\s*\d+\s*(חודשים|חוד'?|שנה|שנים|שנת)/g,
    /יבואן\s*(רשמי|מורשה|בלעדי)?/g,
    /רק\s*(במחסני\s*חשמל|ב-?KSP|בקונטיינר|באלמא|ב-?ACE)/g,
    /הובלה\s*(חינם|חינמית|חינם\s*עד\s*הבית)/g,
  ];
  let out = text;
  for (const r of banned) out = out.replace(r, "");
  return out.replace(/\s{2,}/g, " ").trim();
};
