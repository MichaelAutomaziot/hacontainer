/**
 * Zod schema + cross-field business rules for the single-product upload flow.
 *
 * Pure — usable on both client (react-hook-form resolver) and server (route
 * handlers re-validate as defense in depth).
 */
import { z } from "zod";
import { isValidGtin } from "./matching";
import { stripCommercialLanguage } from "./validation";
import { isElectronicsCategory, deriveImportType } from "./electronics-categories";

const COMMERCIAL_RX =
  /(יבוא\s*(מקביל|רשמי|אישי)|משלוח\s*חינם|אחריות\s*\d+|יבואן\s*(רשמי|מורשה|בלעדי)?|הובלה\s*חינם)/;

const HE_NAME_MIN = 3;
const HE_NAME_MAX = 200;
const HE_DESC_MIN = 20;
const HE_DESC_MAX = 4000;

export const productImageSchema = z.object({
  url: z.string().url("כתובת תמונה לא תקינה"),
  width: z.number().int().min(300, "תמונה קטנה מדי (מינימום 300×300)"),
  height: z.number().int().min(300, "תמונה קטנה מדי (מינימום 300×300)"),
  mime: z.enum(["image/jpeg", "image/png", "image/webp"], {
    errorMap: () => ({ message: "פורמט לא נתמך — JPG / PNG / WEBP בלבד" }),
  }),
});

export const productInputSchema = z.object({
  name_he: z
    .string({ required_error: "שדה חובה" })
    .trim()
    .min(HE_NAME_MIN, `שם המוצר חייב לפחות ${HE_NAME_MIN} תווים`)
    .max(HE_NAME_MAX, `שם המוצר ארוך מדי (מקסימום ${HE_NAME_MAX} תווים)`)
    .refine(
      (v) => !COMMERCIAL_RX.test(v),
      "שם המוצר לא יכול לכלול שפה מסחרית (יבוא / משלוח / אחריות / יבואן)",
    ),
  description_he: z
    .string({ required_error: "שדה חובה" })
    .trim()
    .min(HE_DESC_MIN, `תיאור קצר מדי — לפחות ${HE_DESC_MIN} תווים`)
    .max(HE_DESC_MAX, `תיאור ארוך מדי (מקסימום ${HE_DESC_MAX} תווים)`)
    .refine(
      (v) => !COMMERCIAL_RX.test(v),
      "התיאור לא יכול לכלול שפה מסחרית (יבוא / משלוח / אחריות / יבואן)",
    ),
  ean: z
    .string()
    .trim()
    .regex(/^\d{8,14}$/u, "ברקוד חייב 8-14 ספרות")
    .refine(isValidGtin, "ברקוד לא תקין — בדוק ספרת ביקורת GS1")
    .optional()
    .nullable(),
  sku: z
    .string({ required_error: "שדה חובה" })
    .trim()
    .min(1, "שדה חובה")
    .max(80, "SKU ארוך מדי"),
  brand: z
    .string({ required_error: "שדה חובה" })
    .trim()
    .min(1, "שדה חובה"),
  sp_category_code: z
    .string({ required_error: "בחר קטגוריה" })
    .trim()
    .min(1, "בחר קטגוריה מהרשימה"),
  category_id: z.string().uuid().nullable().optional(),
  category_label: z.string().trim().optional(),
  price: z
    .number({ required_error: "שדה חובה", invalid_type_error: "מחיר חייב להיות מספר" })
    .positive("מחיר חייב להיות חיובי")
    .max(99999, "מחיר חורג מהמותר"),
  pickup_cost: z
    .number({ invalid_type_error: "עלות איסוף חייבת להיות מספר" })
    .nonnegative("עלות איסוף לא יכולה להיות שלילית")
    .nullable()
    .optional(),
  warranty: z.string().trim().max(200, "אחריות ארוכה מדי").nullable().optional(),
  images: z
    .array(productImageSchema)
    .min(1, "נדרשת לפחות תמונה אחת")
    .max(10, "מקסימום 10 תמונות"),
  importer_text: z.string().trim().max(200).nullable().optional(),
  import_type: z.enum(["official", "parallel"]).optional(),
  hacontainer_url: z.string().url("כתובת קונטיינר לא תקינה").nullable().optional(),
  technical_specs: z.record(z.unknown()).optional(),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductImage = z.infer<typeof productImageSchema>;

export interface BusinessRulesResult {
  ok: boolean;
  blockers: { code: string; field: string; message: string }[];
  warnings: { code: string; field: string; message: string }[];
  derived: {
    import_type: "official" | "parallel" | null;
    cleaned_name: string;
    cleaned_description: string;
  };
}

/**
 * Cross-field business rules:
 * - Electronics → require valid EAN + warranty.
 * - Brand ∈ {Dyson, Sharp, Ninja}: derive import_type from importer_text;
 *   block if cannot derive and user did not provide import_type.
 * - Other brands: default import_type='official'.
 * - Re-runs `stripCommercialLanguage` on name + description; emits warning if
 *   the cleaned version differs (the Zod refine is the hard error path).
 */
export const validateBusinessRules = (input: ProductInput): BusinessRulesResult => {
  const blockers: BusinessRulesResult["blockers"] = [];
  const warnings: BusinessRulesResult["warnings"] = [];

  const electronics = isElectronicsCategory(input.sp_category_code);
  if (electronics) {
    if (!input.ean) {
      blockers.push({
        code: "electronics_ean_required",
        field: "ean",
        message: "מוצרי חשמל חייבים ברקוד בינלאומי תקני",
      });
    }
    if (!input.warranty || input.warranty.trim().length === 0) {
      blockers.push({
        code: "electronics_warranty_required",
        field: "warranty",
        message: "מוצרי חשמל חייבים פרטי אחריות (לדוגמה: '12 חודשים על ידי X')",
      });
    }
  }

  const derivation = deriveImportType(input.brand, input.importer_text);
  let importType: "official" | "parallel" | null = derivation.importType;
  if (importType === null) {
    if (input.import_type === "official" || input.import_type === "parallel") {
      importType = input.import_type;
    } else {
      blockers.push({
        code: "import_type_pick_required",
        field: "import_type",
        message: "בחר ידנית: יבוא רשמי או יבוא מקביל",
      });
    }
  }

  const cleanedName = stripCommercialLanguage(input.name_he);
  const cleanedDescription = stripCommercialLanguage(input.description_he);
  if (cleanedName !== input.name_he.trim()) {
    warnings.push({
      code: "name_commercial_lang",
      field: "name_he",
      message: "השם נוקה משפה מסחרית — בדוק את הגרסה הנקייה לפני שליחה",
    });
  }
  if (cleanedDescription !== input.description_he.trim()) {
    warnings.push({
      code: "description_commercial_lang",
      field: "description_he",
      message: "התיאור נוקה משפה מסחרית — בדוק את הגרסה הנקייה לפני שליחה",
    });
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    derived: {
      import_type: importType,
      cleaned_name: cleanedName,
      cleaned_description: cleanedDescription,
    },
  };
};
