/**
 * PM01 (Super-Pharm product create) dispatch — pure function.
 *
 * Extracted from app/api/sync/superpharm/products/push/route.ts so that
 * other server-side callers (notably the OF01 push route, which needs to
 * fire PM01 for missing-from-catalog EANs) can invoke it directly without
 * going through an internal HTTP self-fetch. Self-fetches across the
 * Railway public domain are unreliable from inside the container, and
 * coupling the two routes via fetch() leaves us at the mercy of network
 * blips for what is logically a same-process function call.
 *
 * The original POST handler is now a thin wrapper around `dispatchPm01`.
 *
 * SERVER-ONLY. Imports getServiceClient (service-role).
 */

import { randomUUID } from "node:crypto";
import {
  buildPM01Csv,
  fetchBrandIndex,
  resolveBrandCode,
  resolveCategoryFromContainerLabel,
  type PM01Row,
} from "@/lib/shared";
import { getServiceClient } from "@/utils/supabase/admin";

const PAGE = 500;
const MAX_RETRY_AFTER_MS = 60_000;

export interface InvRow {
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
    if (error) console.warn(`[pm01-dispatch/ensureEans] inv:${m.id} ean update: ${error.message}`);
  }
  return minted.map((m) => m.id);
};

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

const pickInventory = async (
  sb: ReturnType<typeof getServiceClient>,
  opts: DispatchPm01Opts
): Promise<InvRow[]> => {
  const mode = opts.mode ?? (opts.ids?.length ? "by_ids" : "missing");

  if (mode === "by_ids") {
    if (!opts.ids?.length) return [];
    // Chunk to keep the PostgREST URL under the proxy limit. With 4,000+
    // ids the single .in() call produces a ~28KB URL and the request fails
    // outright with "TypeError: fetch failed".
    const out: InvRow[] = [];
    const CHUNK = 500;
    for (let i = 0; i < opts.ids.length; i += CHUNK) {
      const slice = opts.ids.slice(i, i + CHUNK);
      const { data, error } = await sb.from("inventory").select(INV_COLS).in("id", slice);
      if (error) throw new Error(`inventory: ${error.message}`);
      out.push(...((data ?? []) as InvRow[]));
    }
    return out;
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

export interface DispatchPm01Opts {
  mode?: "by_ids" | "missing";
  dry?: boolean;
  ids?: number[];
}

export interface DispatchPm01Result {
  ok: boolean;
  /** HTTP status hint for the route wrapper (omit when default 200). */
  status?: number;
  error?: string;

  eligible?: number;
  import_id?: number;
  idempotency_key?: string;
  sync_job_id?: string | null;
  sku_count?: number;
  already_cataloged?: number;
  blocked_by_data?: number;
  blocked_by_brand?: number;
  blocked_by_category?: number;

  rejected?: { sku: string; inv_id: number; errors: string[] }[];
  unresolvable_brands?: { sku: string; inv_id: number; brand: string }[];
  unresolvable_categories?: {
    sku: string;
    inv_id: number;
    category: string | null;
    category_id: string | null;
  }[];
  skus?: string[];
  inv_ids?: number[];
  note?: string;
  elapsed_s?: number;
}

/**
 * Run the PM01 (product create) dispatch end-to-end. Pure function — no
 * Request, no Response, no NextResponse — so any server-side caller can
 * invoke it without going through HTTP. The route handler at
 * app/api/sync/superpharm/products/push/route.ts is now a thin wrapper.
 */
export const dispatchPm01 = async (
  opts: DispatchPm01Opts
): Promise<DispatchPm01Result> => {
  const sb = getServiceClient();
  const t0 = Date.now();
  const dry = opts.dry === true;

  // 1. Candidates.
  let invRows: InvRow[];
  try {
    invRows = await pickInventory(sb, opts);
  } catch (e) {
    return { ok: false, status: 500, error: (e as Error).message };
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
    return {
      ok: dry,
      status: dry ? 200 : 400,
      eligible: 0,
      already_cataloged: alreadyCataloged,
      blocked_by_data: rejected.length,
      rejected,
      ...(dry ? {} : { error: "no PM01-eligible rows" }),
    };
  }

  // 3. Resolve brand against SP value lists.
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) {
    return { ok: false, status: 500, error: "MIRAKL_API_KEY not set" };
  }
  let brandIdx: Map<string, string>;
  try {
    brandIdx = await fetchBrandIndex(base, key);
  } catch (e) {
    return {
      ok: false,
      status: 502,
      error: `Mirakl metadata fetch: ${(e as Error).message}`,
    };
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
      return {
        ok: false,
        status: 500,
        error: `categories lookup: ${catErr.message}`,
      };
    }
    for (const c of (catRows ?? []) as {
      id: string;
      sp_category_code: string | null;
      is_leaf: boolean | null;
    }[]) {
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
      unresolvableBrand.push({
        sku: inv.sku ?? `inv:${inv.id}`,
        inv_id: inv.id,
        brand: inv.brand ?? "",
      });
      continue;
    }
    let categoryCode: string | null = inv.category_id
      ? catIdToSpCode.get(inv.category_id) ?? null
      : null;
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
    return {
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
    };
  }

  if (accepted.length === 0) {
    return {
      ok: false,
      status: 422,
      error: "all rows rejected pre-flight (data quality / brand / category)",
      already_cataloged: alreadyCataloged,
      blocked_by_data: rejected.length,
      blocked_by_brand: unresolvableBrand.length,
      blocked_by_category: unresolvableCategory.length,
      rejected,
      unresolvable_brands: unresolvableBrand,
      unresolvable_categories: unresolvableCategory,
    };
  }

  const csv = buildPM01Csv(accepted.map((a) => a.row));
  const idempotencyKey = randomUUID();
  let importId: number;
  try {
    const r = await uploadProductsCsv(csv, idempotencyKey);
    importId = r.import_id;
  } catch (e) {
    return {
      ok: false,
      status: 502,
      error: `Mirakl PM01 upload: ${(e as Error).message}`,
    };
  }

  // sync_jobs row — type='superpharm_pm01'. /check route handles polling.
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
    console.error(`[pm01-dispatch] sync_jobs insert failed: ${reason}`);
    return {
      ok: false,
      status: 500,
      error: `Mirakl PM01 import_id=${importId} succeeded but sync_jobs insert failed: ${reason}`,
      import_id: importId,
      idempotency_key: idempotencyKey,
      sku_count: accepted.length,
      skus: accepted.map((a) => a.sku),
    };
  }

  // Mark inventory so UI can show "in catalog sync" state. Chunk to keep
  // the PostgREST URL under the proxy limit (same reason as the by_ids
  // SELECT above).
  const ids = accepted.map((a) => a.invId);
  if (ids.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { error: psErr } = await sb
        .from("inventory")
        .update({ pilot_status: "pending_catalog" })
        .in("id", slice);
      if (psErr) {
        console.warn(`[pm01-dispatch] pilot_status update failed: ${psErr.message}`);
      }
    }
  }

  const elapsed = Number(((Date.now() - t0) / 1000).toFixed(1));
  return {
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
  };
};
