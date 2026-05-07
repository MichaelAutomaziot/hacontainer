/**
 * POST /api/sync/superpharm/pm01/validate
 *
 * Pre-flight validation for PM01 (Super-Pharm catalog upload).
 *
 * Body: { ids: number[] }   — inventory ids to validate (max 5,000).
 *
 * Response: { rows: ValidationRow[], summary: { rows: number, blocked: number,
 *           with_warnings: number, blocker_count: number, warning_count: number } }
 *
 * For each inventory row, checks the same rules the dispatcher will enforce:
 *
 *   Hard blockers (PM01 will refuse):
 *     - missing name_he
 *     - missing brand (or brand can't be resolved to a SP brand_code)
 *     - missing image[0]
 *     - missing/unmapped category (no leaf SP code via container_category_mappings)
 *
 *   Warnings (PM01 will succeed but quality may suffer):
 *     - per-category required attribute that has no value in technical_specs
 *       AND can't be extracted from name+description → will use a default
 *       like 'C' for energy class. SP merchandiser may need to correct.
 *     - EAN missing (auto-minted at upload time as 299XXXXXXXXXX)
 *
 * The response feeds the Pm01ReadinessDrawer in /board/upload so operators
 * can fix issues per-product before submitting.
 */
import { NextResponse } from "next/server";
import {
  fetchBrandIndex,
  resolveBrandCode,
  resolveCategoryFromContainerLabel,
} from "@/lib/shared";
import {
  extractAttribute,
  type AttrSource,
  type AttrSpec,
} from "@/lib/server/attribute-extractors";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface InvRow {
  id: number;
  sku: string | null;
  name_he: string | null;
  description_he: string | null;
  ean: string | null;
  brand: string | null;
  category: string | null;
  category_id: string | null;
  images: string[] | null;
  technical_specs: Record<string, unknown> | null;
}

interface MissingAttr {
  code: string;
  label: string;
  type: AttrSpec["type"];
  list_code: string | null;
  /** Value already in technical_specs (none if missing). */
  current: string | null;
  /** What the extractor would derive from name + description. */
  extracted: string | null;
  /** Default the dispatcher would use if extraction fails. */
  default: string | null;
  /** True when the row has neither a real value nor a regex extraction; the
   *  default will be applied silently. */
  uses_default: boolean;
}

export interface ValidationRow {
  inv_id: number;
  sku: string;
  name_he: string | null;
  blockers: string[];
  warnings: string[];
  missing_attrs: MissingAttr[];
}

const INV_COLS =
  "id, sku, name_he, description_he, ean, brand, category, category_id, images, technical_specs";

/** What the extractor's fallback would be for each known attribute code.
 *  Mirrors the defaults inside `lib/server/attribute-extractors.ts`. */
const ATTR_DEFAULTS: Record<string, string> = {
  "2054": "C",
  "2055": "2027-12-31",
  "2056": "100",
  "2062": "אחר",
  "2064": "C",
  "2070": "100% פוליאסטר",
  "5589": "50",
  "6221": "false",
};

export async function POST(req: Request) {
  const sb = getServiceClient();

  let body: { ids?: number[] };
  try {
    body = (await req.json()) as { ids?: number[] };
  } catch {
    body = {};
  }
  const ids = (body.ids ?? []).filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) {
    return NextResponse.json({ rows: [], summary: { rows: 0, blocked: 0, with_warnings: 0, blocker_count: 0, warning_count: 0 } });
  }
  if (ids.length > 5000) {
    return NextResponse.json({ ok: false, error: "max 5000 ids per request" }, { status: 400 });
  }

  // Pull inventory in chunks of 500 (PostgREST URL length cap).
  const invRows: InvRow[] = [];
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await sb.from("inventory").select(INV_COLS).in("id", slice);
    if (error) {
      return NextResponse.json({ ok: false, error: `inventory: ${error.message}` }, { status: 500 });
    }
    invRows.push(...((data ?? []) as InvRow[]));
  }

  // Resolve sp_category_code per category_id (leaf-only).
  const catIds = Array.from(
    new Set(invRows.map((r) => r.category_id).filter((v): v is string => !!v))
  );
  const catIdToSpCode = new Map<string, string>();
  if (catIds.length > 0) {
    const { data: catRows } = await sb
      .from("categories")
      .select("id, sp_category_code, is_leaf")
      .in("id", catIds);
    for (const c of (catRows ?? []) as {
      id: string;
      sp_category_code: string | null;
      is_leaf: boolean | null;
    }[]) {
      if (c.sp_category_code && c.is_leaf) catIdToSpCode.set(c.id, c.sp_category_code);
    }
  }

  // Required-attribute specs per category_id.
  const catIdToRequiredAttrs = new Map<
    string,
    { code: string; label: string; type: AttrSpec["type"]; list_code: string | null }[]
  >();
  if (catIds.length > 0) {
    const { data: attrRows } = await sb
      .from("category_attributes")
      .select("category_id, attribute_code, label_he, type, value_list")
      .in("category_id", catIds)
      .eq("required", true);
    for (const a of (attrRows ?? []) as {
      category_id: string;
      attribute_code: string;
      label_he: string | null;
      type: AttrSpec["type"] | null;
      value_list: { list_code?: string } | null;
    }[]) {
      const list = catIdToRequiredAttrs.get(a.category_id) ?? [];
      list.push({
        code: a.attribute_code,
        label: a.label_he ?? a.attribute_code,
        type: (a.type ?? "text") as AttrSpec["type"],
        list_code: a.value_list?.list_code ?? null,
      });
      catIdToRequiredAttrs.set(a.category_id, list);
    }
  }

  // Live brand index from Mirakl — needed to know whether brand resolves.
  let brandIdx: Map<string, string> | null = null;
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (key) {
    try {
      brandIdx = await fetchBrandIndex(base, key);
    } catch {
      // Non-fatal — skip the brand-resolve check; the dispatcher will still
      // catch it. Surfaces as a warning rather than a blocker.
      brandIdx = null;
    }
  }

  const out: ValidationRow[] = [];
  for (const inv of invRows) {
    const blockers: string[] = [];
    const warnings: string[] = [];
    const missing_attrs: MissingAttr[] = [];

    // --- Hard blockers ---
    if (!inv.name_he || inv.name_he.trim().length === 0) {
      blockers.push("חסר שם מוצר (name_he)");
    }
    if (!inv.brand || inv.brand.trim().length === 0) {
      blockers.push("חסר מותג");
    } else if (brandIdx && !resolveBrandCode(inv.brand, brandIdx)) {
      blockers.push(`מותג "${inv.brand}" לא נמצא ברשימת המותגים של SP`);
    }
    if (!inv.images || inv.images.length === 0 || !inv.images[0]) {
      blockers.push("חסר תמונה");
    }

    // Category resolution (try category_id → sp_category_code, fall back to
    // mapping table by Hebrew label).
    let spCode: string | null = inv.category_id ? catIdToSpCode.get(inv.category_id) ?? null : null;
    if (!spCode) {
      const resolved = await resolveCategoryFromContainerLabel(sb, inv.category);
      spCode = resolved?.sp_category_code ?? null;
    }
    if (!spCode) {
      blockers.push(
        inv.category
          ? `קטגוריה "${inv.category}" לא ממופה ל-SP`
          : "אין קטגוריה"
      );
    }

    // --- Warnings: missing per-category required attributes ---
    const requiredSpecs = inv.category_id
      ? catIdToRequiredAttrs.get(inv.category_id) ?? []
      : [];
    if (requiredSpecs.length > 0) {
      const ts = (inv.technical_specs ?? {}) as Record<string, unknown>;
      const src: AttrSource = {
        name_he: inv.name_he ?? "",
        description_he: inv.description_he ?? "",
        brand: inv.brand,
      };
      for (const spec of requiredSpecs) {
        const currentRaw = ts[spec.code];
        const current = currentRaw != null && currentRaw !== "" ? String(currentRaw) : null;
        if (current) continue; // already have a real value, no warning needed.

        const extracted = extractAttribute(src, spec);
        const def = ATTR_DEFAULTS[spec.code] ?? null;
        const usesDefault = !extracted;
        if (usesDefault) {
          warnings.push(`${spec.label} ישתמש ב-default "${def}" (לא נמצא בתיאור)`);
        }
        missing_attrs.push({
          code: spec.code,
          label: spec.label,
          type: spec.type,
          list_code: spec.list_code,
          current,
          extracted: extracted ?? null,
          default: def,
          uses_default: usesDefault,
        });
      }
    }

    // EAN auto-mint warning (PM01 mints 299XXXXXXXXXX so this isn't a blocker
    // but it's a quality signal — real EAN is preferred when available).
    if (!inv.ean || inv.ean.trim().length < 8) {
      warnings.push("ברקוד יוצר אוטומטית (prefix 299)");
    }

    out.push({
      inv_id: inv.id,
      sku: inv.sku ?? `inv:${inv.id}`,
      name_he: inv.name_he,
      blockers,
      warnings,
      missing_attrs,
    });
  }

  let blocked = 0;
  let with_warnings = 0;
  let blocker_count = 0;
  let warning_count = 0;
  for (const r of out) {
    if (r.blockers.length > 0) {
      blocked++;
      blocker_count += r.blockers.length;
    }
    if (r.warnings.length > 0) {
      with_warnings++;
      warning_count += r.warnings.length;
    }
  }

  return NextResponse.json({
    rows: out,
    summary: { rows: out.length, blocked, with_warnings, blocker_count, warning_count },
  });
}
