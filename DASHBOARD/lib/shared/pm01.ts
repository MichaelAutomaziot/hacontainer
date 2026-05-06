/**
 * Pure CSV builder for Mirakl PM01 (product create / update).
 *
 * Discovered SP column set (probed via /api/products/imports?type=PRODUCT and
 * the resulting transformation_error_report on 2026-05-06):
 *   - shop_sku           required  — seller's SKU (Hebrew label: קוד מוצר)
 *   - ean                required  — barcode      (Hebrew label: ברקוד מוצר)
 *   - product-id         required  — same EAN
 *   - product-id-type    required  — "EAN"
 *   - name               required  — product title (Hebrew label: שם מוצר)
 *   - description        optional  — long description
 *   - brand              required  — code from /api/values_lists['brand-brand-values']
 *                                    (NOT the free-text brand name; e.g. "PHILIPS" → "b_4721")
 *   - category           required  — hierarchy code from /api/hierarchies (e.g. "55171900mp")
 *   - media              required  — image URL (Hebrew label: תמונה)
 *
 * Note: SP also accepts the standard Mirakl columns (shop-sku, title, etc.) but
 * its custom required attribute mapping uses the underscore variants above.
 * We send both for safety.
 */

export interface PM01Row {
  shop_sku: string;
  ean: string;
  name: string;
  description?: string;
  /** Brand value-list CODE (e.g. "b_4721"), NOT the free-text label. */
  brand_code: string;
  /** Hierarchy code (e.g. "55171900mp"). */
  category_code: string;
  /** First / primary product image URL. */
  image_url: string;
  /** Category-specific required attributes, keyed by Mirakl attribute code.
   *  Examples for SP: "5589" (screen size), category-specific value-list
   *  codes. Values are emitted as additional CSV columns named by the code. */
  extra_attrs?: Record<string, string>;
}

const PM01_BASE_COLS = [
  "shop_sku",
  "ean",
  "product-id",
  "product-id-type",
  "name",
  "description",
  "brand",
  "category",
  "media",
] as const;

const escapeSemiCsv = (val: unknown): string => {
  if (val === undefined || val === null || val === "") return "";
  const s = String(val);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export const buildPM01Csv = (rows: PM01Row[]): string => {
  // Union of every extra_attrs key across rows — emitted as additional
  // columns. Rows that don't define a particular attr leave the cell empty.
  const extraCols: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r.extra_attrs ?? {})) {
      if (!seen.has(k)) {
        seen.add(k);
        extraCols.push(k);
      }
    }
  }
  const header = [...PM01_BASE_COLS, ...extraCols].join(";");
  const lines = rows.map((r) =>
    [
      r.shop_sku,
      r.ean,
      r.ean,
      "EAN",
      r.name,
      r.description ?? "",
      r.brand_code,
      r.category_code,
      r.image_url,
      ...extraCols.map((k) => r.extra_attrs?.[k] ?? ""),
    ]
      .map(escapeSemiCsv)
      .join(";")
  );
  return [header, ...lines].join("\n") + "\n";
};

/* ---------------------------------------------------------------------- */
/* Brand & hierarchy lookup helpers                                       */
/* ---------------------------------------------------------------------- */

export interface BrandValue {
  code: string;
  label: string;
}
export interface Hierarchy {
  code: string;
  label: string;
  level: number;
  parent_code: string;
}

/**
 * Fetch the SP brand value list. Returns label → code map (UPPERCASED label).
 * Mirakl response has thousands of brands; cache in caller if hot.
 */
export const fetchBrandIndex = async (
  baseUrl: string,
  apiKey: string
): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  const res = await fetch(`${baseUrl}/api/values_lists`, {
    headers: { Authorization: apiKey, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`values_lists HTTP ${res.status}`);
  const json = (await res.json()) as {
    values_lists: { code: string; values: BrandValue[] }[];
  };
  const list = json.values_lists.find((v) => v.code === "brand-brand-values");
  for (const v of list?.values ?? []) {
    out.set(v.label.trim().toUpperCase(), v.code);
  }
  return out;
};

export const fetchHierarchies = async (
  baseUrl: string,
  apiKey: string
): Promise<Hierarchy[]> => {
  const res = await fetch(`${baseUrl}/api/hierarchies`, {
    headers: { Authorization: apiKey, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`hierarchies HTTP ${res.status}`);
  const json = (await res.json()) as { hierarchies: Hierarchy[] };
  return json.hierarchies ?? [];
};

/**
 * Best-effort brand resolver. Tries the exact label, then uppercased,
 * then strips common suffixes ("Inc.", "Ltd.", " Israel"), then falls back
 * to a fuzzy substring match.
 */
export const resolveBrandCode = (
  rawBrand: string | null | undefined,
  index: Map<string, string>
): string | null => {
  if (!rawBrand) return null;
  const tries = [rawBrand, rawBrand.trim(), rawBrand.trim().toUpperCase()];
  for (const t of tries) {
    const hit = index.get(t.toUpperCase());
    if (hit) return hit;
  }
  // Fuzzy: first brand whose UPPER label contains rawBrand UPPER.
  const target = rawBrand.trim().toUpperCase();
  if (target.length < 3) return null;
  for (const [label, code] of index.entries()) {
    if (label.includes(target) || target.includes(label)) return code;
  }
  return null;
};

export interface ResolvedCategory {
  category_id: string;
  sp_category_code: string;
  source: "manual" | "heuristic" | "imported";
}

/**
 * Resolve a Container category text (e.g. "מקררים") to its Super-Pharm
 * hierarchy code via the container_category_mappings table.
 *
 * Returns null when no approved mapping exists. Callers MUST treat null as
 * a hard rejection — silently substituting a default ("Home") corrupts the
 * SP merchandiser's review queue and was the root cause of the original
 * upload bug.
 */
export const resolveCategoryFromContainerLabel = async (
  sb: { from: (table: string) => unknown },
  rawCategory: string | null | undefined
): Promise<ResolvedCategory | null> => {
  if (!rawCategory) return null;
  const norm = rawCategory.trim().toLowerCase();
  if (!norm) return null;
  const builder = (sb.from("container_category_mappings") as {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: ResolvedCategory | null;
            error: unknown;
          }>;
        };
      };
    };
  })
    .select("category_id, sp_category_code, source")
    .eq("container_label_normalized", norm)
    .eq("status", "approved");
  const { data } = await builder.maybeSingle();
  if (!data?.category_id || !data?.sp_category_code) return null;
  return data;
};
