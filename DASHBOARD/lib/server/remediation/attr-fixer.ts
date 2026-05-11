/**
 * LLM fallback for required-attribute extraction (MCM-05000).
 *
 * The rule-based extractor in attribute-extractors.ts handles common SP
 * attributes via regex. When SP rejects with MCM-05000 ("התכונה X חובה")
 * we ask the LLM to find the value in the product's name + description,
 * keyed on the human label SP gave us.
 *
 * Returns code → value pairs. Values are normalised to plain strings.
 * Caller merges into inventory.technical_specs.
 */
import {
  extractAllForCategory,
  type AttrSource,
  type AttrSpec,
} from "@/lib/server/attribute-extractors";
import { callOpenRouterJson } from "./openrouter";

export interface MissingAttr {
  /** Mirakl attribute code, e.g. "2054". */
  code: string;
  /** Human label sent by SP, e.g. "דירוג אנרגטי". */
  label: string;
  /** Optional: known value list (e.g. ["A","B","C","D","E","F","G"]). */
  enum_values?: string[];
}

export interface AttrFixResult {
  values: Record<string, string>;
  source: Record<string, "rule" | "llm" | "default">;
  unresolved: string[];
}

const SYSTEM_PROMPT = [
  "אתה ממלא תכונות חובה של Super-Pharm על סמך טקסט מוצר בעברית.",
  "החזר JSON תקין בלבד עם המפתח 'values' שהוא מפה: code → value.",
  "אם תכונה לא ניתן להסיק → השמט אותה מה-values.",
  "אם תכונה מוגבלת ל-enum_values, ערך מוחזר חייב להיות מתוכם.",
  "ערכים תמיד מחרוזות.",
].join("\n");

export const extractMissingAttrs = async (
  src: AttrSource,
  missing: MissingAttr[]
): Promise<AttrFixResult> => {
  const result: AttrFixResult = { values: {}, source: {}, unresolved: [] };
  const normalisedMissing = missing.flatMap((m) => {
    const codes = m.code
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return codes.length > 1
      ? codes.map((code) => ({ ...m, code }))
      : [{ ...m, code: codes[0] ?? m.code.trim() }];
  });
  if (normalisedMissing.length === 0) return result;

  const ruleSpecs: AttrSpec[] = normalisedMissing.map((m) => ({
    code: m.code,
    type: m.enum_values && m.enum_values.length > 0 ? "list" : "text",
    list_code: null,
  }));
  const ruleHits = extractAllForCategory(src, ruleSpecs);
  for (const [code, value] of Object.entries(ruleHits)) {
    result.values[code] = value;
    result.source[code] = "rule";
  }

  const stillMissing = normalisedMissing.filter((m) => !(m.code in result.values));
  if (stillMissing.length === 0) return result;

  try {
    const userPayload = {
      product: {
        name_he: src.name_he,
        description_he: src.description_he,
        brand: src.brand,
      },
      missing: stillMissing.map((m) => ({
        code: m.code,
        label: m.label,
        ...(m.enum_values ? { enum_values: m.enum_values } : {}),
      })),
    };
    const llm = await callOpenRouterJson<{ values?: Record<string, string> }>(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(userPayload, null, 2) },
      ],
      { temperature: 0, max_tokens: 400 }
    );
    for (const [code, value] of Object.entries(llm.values ?? {})) {
      if (typeof value !== "string" || !value.trim()) continue;
      const spec = stillMissing.find((m) => m.code === code);
      if (spec?.enum_values && !spec.enum_values.includes(value)) continue;
      result.values[code] = value.trim();
      result.source[code] = "llm";
    }
  } catch (e) {
    // LLM failure is non-fatal; values just stay unresolved.
    console.warn(`[attr-fixer] LLM extraction failed: ${(e as Error).message}`);
  }

  for (const m of normalisedMissing) {
    if (!(m.code in result.values)) result.unresolved.push(m.code);
  }
  return result;
};
