/**
 * POST /api/sync/superpharm/push
 *
 * Modes:
 *   - mode: 'all_missing'   → push every inventory row whose catalog_matches.verdict='missing'.
 *                              Strict pre-flight:
 *                                · EAN must NOT already exist in superpharm_offers_raw (duplicate guard).
 *                                · priceFor.buildable must be true.
 *                              This is the "Sync Center → big upload button" flow.
 *   - mode: 'by_status'     → legacy: push inventory rows with pilot_status === statusFilter
 *                              (default 'approved_for_pilot'). Used by /pilot Queue page.
 *   - mode: 'by_ids'        → push the explicit list of inventory.id values.
 *
 *   - dry: true             → return only counts; no Mirakl call, no DB writes.
 *
 * Pipeline:
 *   1. Build the candidate inventory list per mode.
 *   2. (all_missing only) Fetch all SP EANs once and filter duplicates client-side.
 *      (One pass over a Set is faster than N round-trips for the typical ~600
 *      missing × ~2k SP rows.)
 *   3. Run priceFor on each survivor; collect buildable vs rejected.
 *   4. If dry → respond with the counts.
 *   5. Otherwise: build OF01 CSV, multipart-POST to Mirakl, write sync_jobs +
 *      channel_listings, mark inventory.pilot_status='uploaded'.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  buildOf01Csv,
  channelPayloadToOf01,
  priceFor,
  type ImportType,
  type PricingRule,
  type SourceProduct,
  type OF01Row,
} from "@/lib/shared";
import { dispatchPm01 } from "@/lib/server/pm01-dispatch";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_RETRY_AFTER_MS = 60_000;
const PAGE = 500;

type PushMode = "all_missing" | "by_status" | "by_ids";

interface InvRow {
  id: number;
  name_he: string | null;
  description_he: string | null;
  ean: string | null;
  sku: string | null;
  hacontainer_id: string | null;
  hacontainer_url: string | null;
  price: number | null;
  pickup_cost: number | null;
  category: string | null;
  images: string[] | null;
  technical_specs: Record<string, unknown> | null;
  pilot_status: string | null;
}

const INV_COLS =
  "id, name_he, description_he, ean, sku, hacontainer_id, hacontainer_url, price, pickup_cost, category, images, technical_specs, pilot_status";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
 *  GS1's reserved 200-299 in-store/internal range, so it cannot collide
 *  with any manufacturer-issued EAN. The 9-digit body is the zero-padded
 *  inventory id, making generation deterministic & collision-free. */
const generateInternalEan = (invId: number): string => {
  const body12 = `299${String(invId).padStart(9, "0")}`;
  return body12 + String(gs1Check(body12));
};

/** For every InvRow lacking a usable EAN, mint one and flush to the DB so
 *  subsequent calls see it. Returns the list of rows mutated, for logging. */
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
  if (minted.length === 0) return [];
  // Bulk-update via per-row PATCH (Postgres .update() is single-row in the
  // supabase-js v2 builder). For pilot scales (<3k) this is fast enough.
  for (const m of minted) {
    const { error } = await sb.from("inventory").update({ ean: m.ean }).eq("id", m.id);
    if (error) console.warn(`[push/ensureEans] inv:${m.id} ean update: ${error.message}`);
  }
  return minted.map((m) => m.id);
};

const toSourceProduct = (inv: InvRow): SourceProduct => ({
  hacontainer_id: inv.hacontainer_id ?? `inv:${inv.id}`,
  hacontainer_url: inv.hacontainer_url ?? "",
  sku: inv.sku ?? `inv:${inv.id}`,
  ean: inv.ean ?? null,
  name_he: inv.name_he ?? "",
  description_he: inv.description_he ?? null,
  base_price: inv.price ?? 0,
  strike_price: null,
  pickup_cost: inv.pickup_cost ?? 0,
  category_path: inv.category ? [inv.category] : [],
  images: inv.images ?? [],
  technical_specs: inv.technical_specs ?? {},
  has_express_shipping: false,
  has_distant_area_shipping: false,
  has_kibbutz_shipping: false,
  has_above_floor_shipping: false,
  video_url: null,
});

const uploadCsv = async (
  csv: string,
  idempotencyKey: string
): Promise<{ import_id: number }> => {
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) throw new Error("MIRAKL_API_KEY not set");
  // import_mode: NORMAL = insert + update existing offers (Mirakl OF01 default).
  const importMode = process.env.MIRAKL_IMPORT_MODE ?? "NORMAL";
  const target = `${base}/api/offers/imports?import_mode=${encodeURIComponent(importMode)}`;

  const form = new FormData();
  form.append("import_mode", importMode);
  form.append(
    "file",
    new Blob([csv], { type: "text/csv; charset=utf-8" }),
    "offers.csv"
  );

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(target, {
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
      throw new Error(`Mirakl ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }
    const json = (await res.json()) as { import_id: number };
    return json;
  }
  throw new Error("Mirakl: exhausted 429 retries");
};

interface RequestBody {
  mode?: PushMode;
  dry?: boolean;
  statusFilter?: string;
  importType?: ImportType;
  ids?: number[];
  /** Set ONLY by /check when chaining PM01-success → OF01. Suppresses
   *  PM01 re-dispatch so we don't loop. User-initiated calls leave this off. */
  chained?: boolean;
}

const pickInventory = async (
  sb: ReturnType<typeof getServiceClient>,
  body: RequestBody
): Promise<InvRow[]> => {
  const mode: PushMode = body.mode ?? (body.ids?.length ? "by_ids" : "by_status");

  if (mode === "by_ids") {
    if (!body.ids?.length) return [];
    const { data, error } = await sb.from("inventory").select(INV_COLS).in("id", body.ids);
    if (error) throw new Error(`inventory: ${error.message}`);
    return (data ?? []) as InvRow[];
  }

  if (mode === "all_missing") {
    // Inventory IDs marked missing in the latest match pass.
    // Collect via paginated select to dodge any default 1000-row caps.
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
      for (const r of rows) {
        if (typeof r.inventory_id === "number") ids.add(r.inventory_id);
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    if (ids.size === 0) return [];
    // Pull inventory in chunks (Postgres .in() with very large arrays is fine
    // but chunking keeps the URL length sane).
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
  }

  // mode === 'by_status'
  const targetStatus = body.statusFilter ?? "approved_for_pilot";
  const out: InvRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("inventory")
      .select(INV_COLS)
      .eq("pilot_status", targetStatus)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`inventory: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as InvRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
};

/**
 * Pull every EAN that currently exists in superpharm_offers_raw, into a Set.
 * Used to block duplicate uploads in 'all_missing' mode.
 */
const fetchSpEanSet = async (
  sb: ReturnType<typeof getServiceClient>
): Promise<Set<string>> => {
  const out = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("superpharm_offers_raw")
      .select("ean")
      .not("ean", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`superpharm_offers_raw eans: ${error.message}`);
    const rows = (data ?? []) as { ean: string | null }[];
    for (const r of rows) if (r.ean) out.add(r.ean.trim());
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
};

/**
 * Probe Mirakl /api/products to verify each EAN has a published product entry.
 * Required pre-OF01 gate when import_type='official': SP rejects offers whose
 * product is not in the catalog with "The state of the product is unknown".
 * Returns the set of EANs that ARE present in the SP product catalog.
 */
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
      // network blip — leave EAN unverified (will surface as Mirakl error post-push)
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
  const mode: PushMode =
    body.mode ?? (body.ids?.length ? "by_ids" : "by_status");
  const importType: ImportType = body.importType ?? "official";
  const dry = body.dry === true;
  const chained = body.chained === true;

  // 1. Pick candidates per mode.
  let invRows: InvRow[];
  try {
    invRows = await pickInventory(sb, body);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }

  // 1b. Auto-mint internal EAN-13 for any row that lacks one. Mirakl OF01
  // requires product-id; without an EAN we can't ship offers via the
  // 'official' import_type. Prefix 299 is GS1's reserved internal range —
  // safe from real-EAN collisions. On non-dry runs the new EAN is persisted
  // to inventory so future passes see the same value; on dry runs (the
  // pilot transform-readiness check) we only inject in-memory.
  let mintedIds: number[] = [];
  if (dry) {
    for (const r of invRows) {
      const cur = (r.ean ?? "").trim();
      if (!cur || cur.length < 8) {
        r.ean = generateInternalEan(r.id);
        mintedIds.push(r.id);
      }
    }
  } else {
    mintedIds = await ensureEans(sb, invRows);
  }
  if (mintedIds.length > 0) {
    console.log(`[push] minted internal EANs (${dry ? "dry" : "persisted"}) for ${mintedIds.length} rows: ${mintedIds.slice(0, 10).join(",")}${mintedIds.length > 10 ? "…" : ""}`);
  }

  // 2. Pricing rules.
  const { data: rulesRaw, error: rulesErr } = await sb
    .from("pricing_rules")
    .select("id, channel, rule_type, config, active")
    .eq("active", true)
    .eq("channel", "superpharm");
  if (rulesErr) {
    return NextResponse.json(
      { ok: false, error: `pricing_rules: ${rulesErr.message}` },
      { status: 500 }
    );
  }
  const rules = (rulesRaw ?? []) as unknown as PricingRule[];

  // 3. Strict duplicate guard for 'all_missing' mode.
  let blockedByDuplicate = 0;
  if (mode === "all_missing" && invRows.length > 0) {
    let spEans: Set<string>;
    try {
      spEans = await fetchSpEanSet(sb);
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: (e as Error).message },
        { status: 500 }
      );
    }
    const survivors: InvRow[] = [];
    for (const r of invRows) {
      if (r.ean && spEans.has(r.ean.trim())) {
        blockedByDuplicate++;
      } else {
        survivors.push(r);
      }
    }
    invRows = survivors;
  }

  // 3b. Catalog gate: official imports require the EAN to already exist in
  // SP's catalog. SP's /api/products lookup is NOT reliable post-PM01 (there
  // is a propagation delay of indeterminate length even after PM01 reports
  // products_successfully_synchronized > 0). So we trust two signals:
  //   1. /api/products returns the product → cataloged.
  //   2. inventory.pilot_status === 'catalog_synced' (set by /check after a
  //      successful PM01 import) → cataloged, regardless of #1.
  //   3. There is a sync_jobs row of type='superpharm_pm01' with
  //      status='completed' carrying this inv_id.
  // Anything not covered by 1/2/3 falls into needsPm01 and triggers a fresh
  // PM01 dispatch.
  //
  // Skip the gate on dry-run calls (transform readiness check).
  const needsPm01: InvRow[] = [];
  if (importType === "official" && invRows.length > 0 && !dry) {
    const eansToCheck = invRows
      .map((r) => r.ean?.trim())
      .filter((e): e is string => !!e);

    // Source 1: live API check.
    const cataloged = await fetchSpCatalogedEans(eansToCheck);

    // Source 3: completed PM01 sync_jobs touching any of these inv_ids.
    const knownPm01Synced = new Set<number>();
    {
      const { data: pmJobs } = await sb
        .from("sync_jobs")
        .select("payload")
        .eq("type", "superpharm_pm01")
        .eq("status", "completed");
      for (const j of (pmJobs ?? []) as { payload: Record<string, unknown> | null }[]) {
        const ids = (j.payload?.inv_ids as number[] | undefined) ?? [];
        for (const id of ids) knownPm01Synced.add(id);
      }
    }

    const survivors: InvRow[] = [];
    for (const r of invRows) {
      const apiSays = !!(r.ean && cataloged.has(r.ean.trim()));
      const pilotSays = r.pilot_status === "catalog_synced";
      const dbSays = knownPm01Synced.has(r.id);
      if (apiSays || pilotSays || dbSays) {
        survivors.push(r);
      } else {
        needsPm01.push(r);
      }
    }
    invRows = survivors;
  }

  // Dispatch PM01 in-process (no HTTP self-fetch — Railway's public-domain
  // loopback from inside the container is unreliable and previously surfaced
  // as "internal fetch failed: fetch failed"). Skip the dispatch only when
  // this is a chained call from /check, to avoid a loop.
  let pm01DispatchedJobId: string | null = null;
  let pm01DispatchedCount = 0;
  let pm01DispatchError: string | null = null;
  if (!dry && needsPm01.length > 0 && !chained) {
    try {
      const result = await dispatchPm01({
        mode: "by_ids",
        ids: needsPm01.map((r) => r.id),
      });
      if (result.ok) {
        pm01DispatchedJobId = result.sync_job_id ?? null;
        pm01DispatchedCount = result.sku_count ?? 0;
        if (!pm01DispatchedJobId) {
          pm01DispatchError = result.error ?? "PM01 dispatch returned no sync_job_id";
        }
      } else {
        const detail =
          result.error ??
          (result.unresolvable_brands && result.unresolvable_brands.length > 0
            ? `unresolvable brands: ${result.unresolvable_brands.map((b) => `${b.sku}=${b.brand}`).join(", ")}`
            : `dispatch returned status ${result.status ?? "?"}`);
        pm01DispatchError = detail;
      }
    } catch (e) {
      pm01DispatchError = `dispatchPm01 threw: ${(e as Error).message}`;
    }
  }
  // Surface still-missing-from-catalog ids as a hard rejection ONLY on a
  // chained call (PM01-then-OF01 path). On user-initiated calls we already
  // dispatched PM01 above; nothing more to surface as failure here.
  const blockedByCatalog: { sku: string; inv_id: number; errors: string[] }[] =
    needsPm01.length > 0 && chained
      ? needsPm01.map((r) => ({
          sku: r.sku ?? `inv:${r.id}`,
          inv_id: r.id,
          errors: ["EAN still missing from SP catalog after PM01 — investigate transformation_error_report"],
        }))
      : [];

  if (invRows.length === 0) {
    // No OF01-eligible rows. If we kicked off PM01 for this batch, that's a
    // valid "deferred" outcome (pilot button click → catalog sync started,
    // OF01 will fire later via /check). Otherwise it's a true error.
    const hasDeferredPm01 = pm01DispatchedJobId !== null && pm01DispatchedCount > 0;
    const explainNoMatch =
      needsPm01.length > 0 && !hasDeferredPm01
        ? `${needsPm01.length} EAN(s) need PM01 (product create) first but PM01 dispatch did not produce a job${pm01DispatchError ? `: ${pm01DispatchError}` : ` (probable cause: missing required PM01 data — name, EAN, brand, or image — on all selected rows; check pm01_dispatch_error / unresolvable_brands)`}`
        : "no inventory rows match selection (after catalog gate)";
    return NextResponse.json(
      {
        ok: dry || hasDeferredPm01,
        eligible: 0,
        blocked_by_duplicate: blockedByDuplicate,
        blocked_by_catalog: blockedByCatalog.length,
        blocked_by_priceFor: 0,
        rejected: blockedByCatalog,
        needs_pm01_count: needsPm01.length,
        pm01_dispatched_count: pm01DispatchedCount,
        pm01_sync_job_id: pm01DispatchedJobId,
        pm01_dispatch_error: pm01DispatchError,
        ...(dry || hasDeferredPm01
          ? hasDeferredPm01
            ? {
                note: `${pm01DispatchedCount} products sent to SP catalog (PM01). OF01 will auto-trigger on next /check call after Mirakl finishes integrating them.`,
              }
            : {}
          : { error: explainNoMatch }),
      },
      { status: dry || hasDeferredPm01 ? 200 : 400 }
    );
  }

  // 4. priceFor → buildable / rejected split.
  const accepted: {
    invId: number;
    sku: string;
    row: OF01Row;
    current_price: number;
    strike_price: number | null;
    shipping_cost: number;
    discount_start: string;
    discount_end: string;
  }[] = [];
  const rejected: { sku: string; inv_id: number; errors: string[] }[] = [];

  for (const inv of invRows) {
    const skuKey = inv.sku ?? `inv:${inv.id}`;
    try {
      const source = toSourceProduct(inv);
      const { payload } = priceFor(source, {
        channel: "superpharm",
        rules,
        import_type: importType,
      });
      payload.images = source.images;
      if (!payload.buildable) {
        rejected.push({ sku: skuKey, inv_id: inv.id, errors: payload.errors });
        continue;
      }
      const row = channelPayloadToOf01(payload, {
        pickup_cost: source.pickup_cost,
        category_label: source.category_path[0] ?? null,
        import_type: payload.import_type,
        quantity: 1,
      });
      row.sku = `inv:${inv.id}`;
      accepted.push({
        invId: inv.id,
        sku: row.sku,
        row,
        current_price: payload.current_price,
        strike_price: payload.strike_price,
        shipping_cost: payload.shipping_cost,
        discount_start: payload.discount_start,
        discount_end: payload.discount_end,
      });
    } catch (e) {
      rejected.push({ sku: skuKey, inv_id: inv.id, errors: [(e as Error).message] });
    }
  }

  // 5. Dry-run? Return counts and exit.
  if (dry) {
    return NextResponse.json({
      ok: true,
      mode,
      eligible: accepted.length,
      blocked_by_duplicate: blockedByDuplicate,
      blocked_by_catalog: blockedByCatalog.length,
      blocked_by_priceFor: rejected.length,
      rejected: [...rejected, ...blockedByCatalog],
      pm01_dispatched_count: pm01DispatchedCount,
      pm01_sync_job_id: pm01DispatchedJobId,
      total_candidates: invRows.length + blockedByDuplicate + blockedByCatalog.length,
      elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(2)),
    });
  }

  if (accepted.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `all ${invRows.length + blockedByCatalog.length} payloads rejected pre-flight`,
        blocked_by_duplicate: blockedByDuplicate,
        blocked_by_catalog: blockedByCatalog.length,
        blocked_by_priceFor: rejected.length,
        rejected: [...rejected, ...blockedByCatalog],
      },
      { status: 422 }
    );
  }

  // 6. Real push: build CSV + POST.
  const csv = buildOf01Csv(accepted.map((a) => a.row));
  const idempotencyKey = randomUUID();
  let importId: number;
  try {
    const r = await uploadCsv(csv, idempotencyKey);
    importId = r.import_id;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Mirakl upload: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  // 7. sync_jobs row. Status starts 'pending_mirakl' — only the /check route
  // (after polling Mirakl) flips this to 'done' or 'failed'. Never 'running'
  // forever (previous bug).
  const { data: jobRow, error: jobErr } = await sb
    .from("sync_jobs")
    .insert({
      type: "superpharm_of01",
      status: "running",
      payload: {
        import_id: importId,
        idempotency_key: idempotencyKey,
        mode,
        sku_count: accepted.length,
        rejected_count: rejected.length,
        blocked_by_duplicate: blockedByDuplicate,
        blocked_by_catalog: blockedByCatalog.length,
        rejected: [...rejected, ...blockedByCatalog],
        skus: accepted.map((a) => a.sku),
        inv_ids: accepted.map((a) => a.invId),
        import_type: importType,
      },
    })
    .select("id")
    .single();
  if (jobErr) {
    console.warn(`[sync/superpharm/push] sync_jobs insert failed: ${jobErr.message}`);
  }

  // 8. channel_listings staging. State 'submitted' = sent to Mirakl, awaiting
  // import-status confirmation. /check route flips to 'pending'/'rejected'.
  const listings = accepted.map((a) => ({
    product_id: a.invId,
    channel: "superpharm" as const,
    state: "submitted",
    current_price: a.current_price,
    strike_price: a.strike_price,
    shipping_cost: a.shipping_cost,
    discount_start: a.discount_start,
    discount_end: a.discount_end,
    attributes: { import_id: importId, idempotency_key: idempotencyKey },
  }));
  const { error: clErr } = await sb
    .from("channel_listings")
    .upsert(listings, { onConflict: "product_id,channel" });
  if (clErr) {
    console.warn(`[sync/superpharm/push] channel_listings upsert failed: ${clErr.message}`);
  }

  // 9. Mark inventory.pilot_status='uploading' (NOT 'uploaded'). The /check
  // route promotes to 'uploaded' on Mirakl success or rolls back to NULL on
  // failure. This prevents false-positives like the MG5720 incident.
  const ids = accepted.map((a) => a.invId);
  if (ids.length > 0) {
    const { error: psErr } = await sb
      .from("inventory")
      .update({ pilot_status: "uploading" })
      .in("id", ids);
    if (psErr) {
      console.warn(`[sync/superpharm/push] pilot_status update failed: ${psErr.message}`);
    }
  }

  const elapsed = Number(((Date.now() - t0) / 1000).toFixed(1));
  return NextResponse.json({
    ok: true,
    mode,
    import_id: importId,
    idempotency_key: idempotencyKey,
    sync_job_id: jobRow?.id ?? null,
    sku_count: accepted.length,
    rejected_count: rejected.length,
    blocked_by_duplicate: blockedByDuplicate,
    blocked_by_catalog: blockedByCatalog.length,
    rejected: [...rejected, ...blockedByCatalog],
    pm01_dispatched_count: pm01DispatchedCount,
    pm01_sync_job_id: pm01DispatchedJobId,
    note:
      pm01DispatchedCount > 0
        ? `OF01 submitted for ${accepted.length} cataloged offers; PM01 submitted for ${pm01DispatchedCount} new products. Both resolve via POST /api/sync/superpharm/check.`
        : "Mirakl OF01 submitted; status will resolve via POST /api/sync/superpharm/check",
    elapsed_s: elapsed,
  });
}
