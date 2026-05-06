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
  fetchHierarchies,
  resolveBrandCode,
  resolveHierarchyCode,
  type PM01Row,
} from "@/lib/shared";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PAGE = 500;
const MAX_RETRY_AFTER_MS = 60_000;

// Top-level "Home" hierarchy — used when category mapping fails completely.
// Better to over-classify with a wide bucket than to fail the import line;
// SP merchandiser can reclassify before approval.
const FALLBACK_HIERARCHY = "10000000mp";

interface InvRow {
  id: number;
  name_he: string | null;
  description_he: string | null;
  ean: string | null;
  sku: string | null;
  brand: string | null;
  category: string | null;
  images: string[] | null;
}

const INV_COLS =
  "id, name_he, description_he, ean, sku, brand, category, images";

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

  // 3. Resolve brand and category against SP value lists.
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) {
    return NextResponse.json({ ok: false, error: "MIRAKL_API_KEY not set" }, { status: 500 });
  }
  let brandIdx: Map<string, string>;
  let hierarchies: Awaited<ReturnType<typeof fetchHierarchies>>;
  try {
    [brandIdx, hierarchies] = await Promise.all([
      fetchBrandIndex(base, key),
      fetchHierarchies(base, key),
    ]);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Mirakl metadata fetch: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  const accepted: { invId: number; sku: string; row: PM01Row }[] = [];
  const unresolvableBrand: { sku: string; inv_id: number; brand: string }[] = [];
  for (const inv of candidates) {
    const brandCode = resolveBrandCode(inv.brand, brandIdx);
    if (!brandCode) {
      unresolvableBrand.push({ sku: inv.sku ?? `inv:${inv.id}`, inv_id: inv.id, brand: inv.brand ?? "" });
      continue;
    }
    const categoryCode = resolveHierarchyCode(inv.category, hierarchies, FALLBACK_HIERARCHY);
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
      rejected,
      unresolvable_brands: unresolvableBrand,
      elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(2)),
    });
  }

  if (accepted.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "all rows rejected pre-flight (data quality / brand)",
        already_cataloged: alreadyCataloged,
        blocked_by_data: rejected.length,
        blocked_by_brand: unresolvableBrand.length,
        rejected,
        unresolvable_brands: unresolvableBrand,
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
      status: "pending_mirakl",
      payload: {
        import_id: importId,
        idempotency_key: idempotencyKey,
        sku_count: accepted.length,
        rejected_count: rejected.length,
        already_cataloged: alreadyCataloged,
        blocked_by_brand: unresolvableBrand.length,
        rejected,
        unresolvable_brands: unresolvableBrand,
        skus: accepted.map((a) => a.sku),
        inv_ids: accepted.map((a) => a.invId),
      },
    })
    .select("id")
    .single();
  if (jobErr) {
    console.error(`[products/push] sync_jobs insert failed: ${jobErr.message}`);
    return NextResponse.json(
      {
        ok: false,
        error: `Mirakl PM01 import_id=${importId} succeeded but sync_jobs insert failed: ${jobErr.message}`,
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
    rejected,
    unresolvable_brands: unresolvableBrand,
    note: "PM01 submitted; status will resolve via POST /api/sync/superpharm/check, which auto-triggers OF01 on success",
    elapsed_s: elapsed,
  });
}
