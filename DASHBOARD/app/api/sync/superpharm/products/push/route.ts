/**
 * POST /api/sync/superpharm/products/push
 *
 * Modes:
 *   - mode: 'by_ids'        → push the explicit list of inventory.id values.
 *   - mode: 'missing'       → push every inventory row with verdict='missing'
 *                             that is not already in the SP product catalog.
 *   - dry: true             → return only counts; no Mirakl call, no DB writes.
 *
 * This is PM01 (product create) — required before OF01 (offer create) for any
 * EAN that doesn't yet exist in the SP catalog. SP rejects OF01 offers on
 * unknown products with "The state of the product is unknown".
 *
 * Pipeline:
 *   1. Pick inventory candidates.
 *   2. Pull current SP catalog EAN set; skip rows already cataloged.
 *   3. Resolve brand free-text → SP brand_code via /api/values_lists.
 *      Resolve category Hebrew label → SP hierarchy code via /api/hierarchies.
 *   4. Build PM01 CSV; multipart-POST to /api/products/imports?type=PRODUCT.
 *   5. Write sync_jobs row with type='superpharm_pm01', status='pending_mirakl'.
 *      Set inventory.pilot_status='pending_catalog' for these rows.
 *   6. The /check route polls Mirakl, marks 'completed' on success, and
 *      kicks off OF01 push for the same SKUs.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  buildPM01Csv,
  fetchBrandIndex,
  resolveBrandCode,
  resolveCategoryFromContainerLabel,
  type PM01Row,
} from "@/lib/shared";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PAGE = 500;
const MAX_RETRY_AFTER_MS = 60_000;

// No silent fallback. Rows whose category cannot be resolved via
// container_category_mappings are pushed to unresolvable_categories[] and
// excluded from the PM01 batch — never re-classified to a default bucket.

interface InvRow {
  id: number;
  name_he: string | null;
  description_he: string | null;
  ean: string | null;
  sku: string | null;
  brand: string | null;
  category: string | null;
  category_id: string | null;
  images: string[] | null;
  technical_specs: Record<string, unknown> | null;
}

const INV_COLS =
  "id, name_he, description_he, ean, sku, brand, category, category_id, images, technical_specs";

/** GS1 mod-10 check digit for an EAN-13 body (12 digits). */
const gs1Check = (body12: string): number => {
  let s = 0;
  for (let i = 0; i < body12.length; i++) {
    const d = body12.charCodeAt(i) - 48;
    s += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (s % 10)) % 10;
};

/** Internal-use EAN-13 derived from inventory.id. Prefix 299 lies in
 *  GS1's reserved 200-299 in-store/internal range. */
const generateInternalEan = (invId: number): string => {
  const body12 = `299${String(invId).padStart(9, "0")}`;
  return body12 + String(gs1Check(body12));
};

/** Mint EAN for any candidate that lacks one, persist to inventory. */
const ensureEans = async (
  sb: ReturnType<typeof getServiceClient>,
  rows: InvRow[]
): Promise<number[]> => {
  const minted: { id: number; ean: string }[] = [];
  for (const r of rows) {
    const cur = (r.ean ?? "").trim();
    if (!cur || cur.length < 8) {
      const ean = generateInternalEan(r.id);
      r.ean = ean;
      minted.push({ id: r.id, ean });
    }
  }
  for (const m of minted) {
    const { error } = await sb.from("inventory").update({ ean: m.ean }).eq("id", m.id);
    if (error) console.warn(`[products/push/ensureEans] inv:${m.id} ean update: ${error.message}`);
  }
  return minted.map((m) => m.id);
};

/** Extract numeric-keyed entries from technical_specs and stringify their
 *  values. These flow as PM01 extra-attribute columns keyed by Mirakl
 *  attribute code (e.g. "5589" → screen size). Non-numeric keys (brand,
 *  warranty_he, delivery_days, etc.) are ignored — they are not Mirakl
 *  attribute codes. */
const technicalSpecsToExtraAttrs = (
  ts: Record<string, unknown> | null | undefined
): Record<string, string> => {
  if (!ts || typeof ts !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ts)) {
    if (!/^\d+$/.test(k)) continue;
    if (v === null || v === undefined || v === "") continue;
    out[k] = String(v);
  }
  return out;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const uploadProductsCsv = async (
  csv: string,
  idempotencyKey: string
): Promise<{ import_id: number }> => {
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) throw new Error("MIRAKL_API_KEY not set");

  const url = `${base}/api/products/imports?type=PRODUCT`;
  const form = new FormData();
  form.append(
    "file",
    new Blob([csv], { type: "text/csv; charset=utf-8" }),
    "products.csv"
  );

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: key,
        Accept: "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: form,
    });
    if (res.status === 429 && attempt < 3) {
      const ra = Number(res.headers.get("retry-after") ?? 5);
      const wait = Math.min(
        (Number.isFinite(ra) && ra > 0 ? ra : 5) * 1000,
        MAX_RETRY_AFTER_MS
      );
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Mirakl PM01 ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }
    return (await res.json()) as { import_id: number };
  }
  throw new Error("Mirakl PM01: exhausted 429 retries");
};

interface RequestBody {
  mode?: "by_ids" | "missing";
  dry?: boolean;
  ids?: number[];
}

const pickInventory = async (
  sb: ReturnType<typeof getServiceClient>,
  body: RequestBody
): Promise<InvRow[]> => {
  const mode = body.mode ?? (body.ids?.length ? "by_ids" : "missing");

  if (mode === "by_ids") {
    if (!body.ids?.length) return [];
    const { data, error } = await sb.from("inventory").select(INV_COLS).in("id", body.ids);
    if (error) throw new Error(`inventory: ${error.message}`);
    return (data ?? []) as InvRow[];
  }

  // mode === "missing": all inventory ids tagged verdict='missing' in catalog_matches.
  const ids = new Set<number>();
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("catalog_matches")
      .select("inventory_id")
      .eq("verdict", "missing")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`catalog_matches: ${error.message}`);
    const rows = (data ?? []) as { inventory_id: number }[];
    for (const r of rows) if (typeof r.inventory_id === "number") ids.add(r.inventory_id);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  if (ids.size === 0) return [];

  const idArr = Array.from(ids);
  const out: InvRow[] = [];
  const CHUNK = 500;
  for (let i = 0; i < idArr.length; i += CHUNK) {
    const slice = idArr.slice(i, i + CHUNK);
    const { data, error } = await sb.from("inventory").select(INV_COLS).in("id", slice);
    if (error) throw new Error(`inventory: ${error.message}`);
    out.push(...((data ?? []) as InvRow[]));
  }
  return out;
};

/** EANs already cataloged at SP — skip these (they don't need PM01). */
const fetchSpCatalogedEans = async (eans: string[]): Promise<Set<string>> => {
  const out = new Set<string>();
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key || eans.length === 0) return out;
  const CHUNK = 50;
  for (let i = 0; i < eans.length; i += CHUNK) {
    const slice = eans.slice(i, i + CHUNK);
    const refs = slice.map((e) => `${e}|EAN`).join(",");
    const url = `${base}/api/products?product_references=${encodeURIComponent(refs)}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: key, Accept: "application/json" },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        products?: { product_references?: { reference?: string; type?: string }[] }[];
      };
      for (const p of json.products ?? []) {
        for (const r of p.product_references ?? []) {
          if (r.type === "EAN" && r.reference) out.add(r.reference.trim());
        }
      }
    } catch {
      /* leave the EAN unverified — PM01 will be a no-op upsert if it's already there */
    }
  }
  return out;
};

export async function POST(req: Request) {
  const sb = getServiceClient();
  const t0 = Date.now();

  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    body = {};
  }
  const dry = body.dry === true;

  // 1. Candidates.
  let invRows: InvRow[];
  try {
    invRows = await pickInventory(sb, body);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }

  // 1b. Auto-mint EAN-13 for rows that lack one (persisted unless dry).
  if (!dry) {
    await ensureEans(sb, invRows);
  } else {
    for (const r of invRows) {
      const cur = (r.ean ?? "").trim();
      if (!cur || cur.length < 8) r.ean = generateInternalEan(r.id);
    }
  }

  // Drop rows missing the bare-minimum data PM01 requires.
  const rejected: { sku: string; inv_id: number; errors: string[] }[] = [];
  const candidates: InvRow[] = [];
  for (const r of invRows) {
    const errs: string[] = [];
    if (!r.ean) errs.push("missing EAN");
    if (!r.name_he) errs.push("missing name_he");
    if (!r.brand) errs.push("missing brand");
    if (!r.images || r.images.length === 0) errs.push("missing image");
    if (errs.length > 0) {
      rejected.push({ sku: r.sku ?? `inv:${r.id}`, inv_id: r.id, errors: errs });
    } else {
      candidates.push(r);
    }
  }

  // 2. Skip rows whose EAN is already in SP catalog.
  let alreadyCataloged = 0;
  if (candidates.length > 0) {
    const eans = candidates.map((r) => r.ean!.trim());
    const cataloged = await fetchSpCatalogedEans(eans);
    const survivors: InvRow[] = [];
    for (const r of candidates) {
      if (r.ean && cataloged.has(r.ean.trim())) {
        alreadyCataloged++;
      } else {
        survivors.push(r);
      }
    }
    candidates.length = 0;
    candidates.push(...survivors);
  }

  if (candidates.length === 0) {
    return NextResponse.json(
      {
        ok: dry,
        eligible: 0,
        already_cataloged: alreadyCataloged,
        blocked_by_data: rejected.length,
        rejected,
        ...(dry ? {} : { error: "no PM01-eligible rows" }),
      },
      { status: dry ? 200 : 400 }
    );
  }

  // 3. Resolve brand against SP value lists. Categories come from the local
  //    container_category_mappings table (populated by hand + backfilled into
  //    inventory.category_id) — no per-request Mirakl /api/hierarchies call.
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) {
    return NextResponse.json({ ok: false, error: "MIRAKL_API_KEY not set" }, { status: 500 });
  }
  let brandIdx: Map<string, string>;
  try {
    brandIdx = await fetchBrandIndex(base, key);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Mirakl metadata fetch: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  // Batch-resolve sp_category_code for every inv.category_id we already have.
  const catIds = Array.from(
    new Set(candidates.map((r) => r.category_id).filter((v): v is string => !!v))
  );
  const catIdToSpCode = new Map<string, string>();
  if (catIds.length > 0) {
    const { data: catRows, error: catErr } = await sb
      .from("categories")
      .select("id, sp_category_code, is_leaf")
      .in("id", catIds);
    if (catErr) {
      return NextResponse.json(
        { ok: false, error: `categories lookup: ${catErr.message}` },
        { status: 500 }
      );
    }
    for (const c of (catRows ?? []) as { id: string; sp_category_code: string | null; is_leaf: boolean | null }[]) {
      // Only accept leaves — non-leaf codes are rejected by Mirakl's catalog
      // validator and would silently land in the merchandiser queue forever.
      if (c.sp_category_code && c.is_leaf) catIdToSpCode.set(c.id, c.sp_category_code);
    }
  }

  const accepted: { invId: number; sku: string; row: PM01Row }[] = [];
  const unresolvableBrand: { sku: string; inv_id: number; brand: string }[] = [];
  const unresolvableCategory: {
    sku: string;
    inv_id: number;
    category: string | null;
    category_id: string | null;
  }[] = [];
  for (const inv of candidates) {
    const brandCode = resolveBrandCode(inv.brand, brandIdx);
    if (!brandCode) {
      unresolvableBrand.push({ sku: inv.sku ?? `inv:${inv.id}`, inv_id: inv.id, brand: inv.brand ?? "" });
      continue;
    }
    // Prefer the resolved category_id from inventory (populated by the
    // backfill RPC). Fall back to a live lookup against container_category_
    // mappings for rows that haven't been backfilled yet (e.g. freshly
    // ingested rows).
    let categoryCode: string | null =
      inv.category_id ? catIdToSpCode.get(inv.category_id) ?? null : null;
    if (!categoryCode) {
      const resolved = await resolveCategoryFromContainerLabel(sb, inv.category);
      categoryCode = resolved?.sp_category_code ?? null;
    }
    if (!categoryCode) {
      unresolvableCategory.push({
        sku: inv.sku ?? `inv:${inv.id}`,
        inv_id: inv.id,
        category: inv.category,
        category_id: inv.category_id,
      });
      continue;
    }
    const sku = `inv:${inv.id}`;
    accepted.push({
      invId: inv.id,
      sku,
      row: {
        shop_sku: sku,
        ean: inv.ean!.trim(),
        name: inv.name_he!.trim(),
        description: inv.description_he ?? "",
        brand_code: brandCode,
        category_code: categoryCode,
        image_url: inv.images![0]!,
        extra_attrs: technicalSpecsToExtraAttrs(inv.technical_specs),
      },
    });
  }

  if (dry) {
    return NextResponse.json({
      ok: true,
      eligible: accepted.length,
      already_cataloged: alreadyCataloged,
      blocked_by_data: rejected.length,
      blocked_by_brand: unresolvableBrand.length,
      blocked_by_category: unresolvableCategory.length,
      rejected,
      unresolvable_brands: unresolvableBrand,
      unresolvable_categories: unresolvableCategory,
      elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(2)),
    });
  }

  if (accepted.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "all rows rejected pre-flight (data quality / brand / category)",
        already_cataloged: alreadyCataloged,
        blocked_by_data: rejected.length,
        blocked_by_brand: unresolvableBrand.length,
        blocked_by_category: unresolvableCategory.length,
        rejected,
        unresolvable_brands: unresolvableBrand,
        unresolvable_categories: unresolvableCategory,
      },
      { status: 422 }
    );
  }

  const csv = buildPM01Csv(accepted.map((a) => a.row));
  const idempotencyKey = randomUUID();
  let importId: number;
  try {
    const r = await uploadProductsCsv(csv, idempotencyKey);
    importId = r.import_id;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Mirakl PM01 upload: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  // sync_jobs row — type='superpharm_pm01'. /check route handles polling.
  // The Mirakl upload already happened above; if the local DB insert fails we
  // still need to surface the import_id so the user can recover, but we
  // signal a non-ok response so callers don't claim success silently.
  const { data: jobRow, error: jobErr } = await sb
    .from("sync_jobs")
    .insert({
      type: "superpharm_pm01",
      status: "running",
      payload: {
        import_id: importId,
        idempotency_key: idempotencyKey,
        sku_count: accepted.length,
        rejected_count: rejected.length,
        already_cataloged: alreadyCataloged,
        blocked_by_brand: unresolvableBrand.length,
        blocked_by_category: unresolvableCategory.length,
        rejected,
        unresolvable_brands: unresolvableBrand,
        unresolvable_categories: unresolvableCategory,
        skus: accepted.map((a) => a.sku),
        inv_ids: accepted.map((a) => a.invId),
      },
    })
    .select("id")
    .single();
  if (jobErr || !jobRow?.id) {
    const reason = jobErr?.message ?? "insert returned no row (RLS or schema mismatch)";
    console.error(`[products/push] sync_jobs insert failed: ${reason}`);
    return NextResponse.json(
      {
        ok: false,
        error: `Mirakl PM01 import_id=${importId} succeeded but sync_jobs insert failed: ${reason}`,
        import_id: importId,
        idempotency_key: idempotencyKey,
        sku_count: accepted.length,
        skus: accepted.map((a) => a.sku),
      },
      { status: 500 }
    );
  }

  // Mark inventory so UI can show "in catalog sync" state.
  const ids = accepted.map((a) => a.invId);
  if (ids.length > 0) {
    const { error: psErr } = await sb
      .from("inventory")
      .update({ pilot_status: "pending_catalog" })
      .in("id", ids);
    if (psErr) {
      console.warn(`[products/push] pilot_status update failed: ${psErr.message}`);
    }
  }

  const elapsed = Number(((Date.now() - t0) / 1000).toFixed(1));
  return NextResponse.json({
    ok: true,
    import_id: importId,
    idempotency_key: idempotencyKey,
    sync_job_id: jobRow?.id ?? null,
    sku_count: accepted.length,
    already_cataloged: alreadyCataloged,
    blocked_by_data: rejected.length,
    blocked_by_brand: unresolvableBrand.length,
    blocked_by_category: unresolvableCategory.length,
    rejected,
    unresolvable_brands: unresolvableBrand,
    unresolvable_categories: unresolvableCategory,
    note: "PM01 submitted; status will resolve via POST /api/sync/superpharm/check, which auto-triggers OF01 on success",
    elapsed_s: elapsed,
  });
}
