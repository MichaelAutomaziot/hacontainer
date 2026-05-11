/**
 * POST /api/sync/superpharm/offers-update
 *
 * The "update products in Super-Pharm" flow — price, pricing model (strike /
 * discount window), shipping cost and stock for products that ALREADY exist in
 * the SP catalog (PM01 done). This is the missing piece: the codebase could
 * create products but had no purpose-built path to push offer changes.
 *
 * Modes:
 *   - mode: 'all_cataloged'  → every inventory row whose pilot_status indicates
 *                              the product is (or should be) in the SP catalog:
 *                              catalog_synced | pending_catalog | uploading |
 *                              uploaded | rejected. Each row's EAN is verified
 *                              against /api/products; rows not yet in the
 *                              catalog get a fresh PM01 dispatch first (the
 *                              existing PM01→OF01 chain in /check then takes
 *                              over). Rows in the catalog get an OF01 offer
 *                              push with import_mode=NORMAL (insert + update).
 *   - mode: 'by_ids'         → the explicit inventory.id list. Same per-row
 *                              catalog gate. Used by the per-product
 *                              "Update in Mirakl" dialog.
 *
 * Per-row overrides (optional, applied on top of the pricing engine output):
 *   overrides: {
 *     price?: number,            // selling price (the discounted price buyers pay)
 *     strike_price?: number,     // "before sale" price shown struck through
 *     shipping_cost?: number,    // min-shipping-price (the 39 ILS marketplace fee)
 *     quantity?: number,         // stock
 *     leadtime_to_ship?: number, // days
 *     discount_start?: string,   // YYYY-MM-DD
 *     discount_end?: string,     // YYYY-MM-DD
 *   }
 *
 *   dry: true → return counts only; no Mirakl call, no DB writes.
 *
 * Returns the same shape family as /push so the UI can reuse its renderers.
 *
 * SERVER-ONLY.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  buildOf01Csv,
  channelPayloadToOf01,
  priceFor,
  type OF01Row,
  type PricingRule,
  type SourceProduct,
} from "@/lib/shared";
import { dispatchPm01 } from "@/lib/server/pm01-dispatch";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_RETRY_AFTER_MS = 60_000;
const PAGE = 500;

/** pilot_status values that mean "this product is (meant to be) in the SP catalog". */
const CATALOGED_STATUSES = [
  "catalog_synced",
  "pending_catalog",
  "uploading",
  "uploaded",
  "rejected",
] as const;

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

interface Overrides {
  price?: number;
  strike_price?: number | null;
  shipping_cost?: number;
  quantity?: number;
  leadtime_to_ship?: number;
  discount_start?: string;
  discount_end?: string;
}

interface RequestBody {
  mode?: "all_cataloged" | "by_ids";
  ids?: number[];
  overrides?: Overrides;
  dry?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** GS1 mod-10 check digit for an EAN-13 body (12 digits). */
const gs1Check = (body12: string): number => {
  let s = 0;
  for (let i = 0; i < body12.length; i++) {
    const d = body12.charCodeAt(i) - 48;
    s += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (s % 10)) % 10;
};
const generateInternalEan = (invId: number): string => {
  const body12 = `299${String(invId).padStart(9, "0")}`;
  return body12 + String(gs1Check(body12));
};
const ensureEans = async (
  sb: ReturnType<typeof getServiceClient>,
  rows: InvRow[],
  persist: boolean
): Promise<void> => {
  for (const r of rows) {
    const cur = (r.ean ?? "").trim();
    if (!cur || cur.length < 8) {
      const ean = generateInternalEan(r.id);
      r.ean = ean;
      if (persist) {
        const { error } = await sb.from("inventory").update({ ean }).eq("id", r.id);
        if (error) console.warn(`[offers-update/ensureEans] inv:${r.id}: ${error.message}`);
      }
    }
  }
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

const pickInventory = async (
  sb: ReturnType<typeof getServiceClient>,
  body: RequestBody
): Promise<InvRow[]> => {
  const mode = body.mode ?? (body.ids?.length ? "by_ids" : "all_cataloged");

  if (mode === "by_ids") {
    if (!body.ids?.length) return [];
    const out: InvRow[] = [];
    const CHUNK = 500;
    for (let i = 0; i < body.ids.length; i += CHUNK) {
      const slice = body.ids.slice(i, i + CHUNK);
      const { data, error } = await sb.from("inventory").select(INV_COLS).in("id", slice);
      if (error) throw new Error(`inventory: ${error.message}`);
      out.push(...((data ?? []) as InvRow[]));
    }
    return out;
  }

  // all_cataloged
  const out: InvRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("inventory")
      .select(INV_COLS)
      .in("pilot_status", CATALOGED_STATUSES as unknown as string[])
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`inventory: ${error.message}`);
    const rows = (data ?? []) as InvRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
};

/** EANs that are present in the SP product catalog right now. */
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
      /* leave unverified */
    }
  }
  return out;
};

const uploadOffersCsv = async (
  csv: string,
  idempotencyKey: string
): Promise<{ import_id: number }> => {
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) throw new Error("MIRAKL_API_KEY not set");
  // NORMAL = insert + update existing offers. This is what makes price /
  // shipping / stock changes on an existing offer actually take effect.
  const importMode = process.env.MIRAKL_IMPORT_MODE ?? "NORMAL";
  const target = `${base}/api/offers/imports?import_mode=${encodeURIComponent(importMode)}`;
  const form = new FormData();
  form.append("import_mode", importMode);
  form.append("file", new Blob([csv], { type: "text/csv; charset=utf-8" }), "offers.csv");

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(target, {
      method: "POST",
      headers: { Authorization: key, Accept: "application/json", "Idempotency-Key": idempotencyKey },
      body: form,
    });
    if (res.status === 429 && attempt < 3) {
      const ra = Number(res.headers.get("retry-after") ?? 5);
      await sleep(Math.min((Number.isFinite(ra) && ra > 0 ? ra : 5) * 1000, MAX_RETRY_AFTER_MS));
      continue;
    }
    if (!res.ok) throw new Error(`Mirakl OF01 ${res.status}: ${(await res.text()).slice(0, 500)}`);
    return (await res.json()) as { import_id: number };
  }
  throw new Error("Mirakl OF01: exhausted 429 retries");
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
  const mode = body.mode ?? (body.ids?.length ? "by_ids" : "all_cataloged");
  const dry = body.dry === true;
  const ov: Overrides = body.overrides ?? {};
  const ovQuantity = num(ov.quantity);
  const ovPrice = num(ov.price);
  const ovStrike = ov.strike_price === null ? null : num(ov.strike_price);
  const ovShipping = num(ov.shipping_cost);
  const ovLeadtime = num(ov.leadtime_to_ship);

  // 1. Candidates.
  let invRows: InvRow[];
  try {
    invRows = await pickInventory(sb, body);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
  if (invRows.length === 0) {
    return NextResponse.json(
      { ok: dry, mode, eligible: 0, ...(dry ? {} : { error: "no matching inventory rows" }) },
      { status: dry ? 200 : 400 }
    );
  }

  // 1b. Mint internal EANs where missing (persisted on real runs).
  await ensureEans(sb, invRows, !dry);

  // 2. Pricing rules.
  const { data: rulesRaw, error: rulesErr } = await sb
    .from("pricing_rules")
    .select("id, channel, rule_type, config, active")
    .eq("active", true)
    .eq("channel", "superpharm");
  if (rulesErr) {
    return NextResponse.json({ ok: false, error: `pricing_rules: ${rulesErr.message}` }, { status: 500 });
  }
  const rules = (rulesRaw ?? []) as unknown as PricingRule[];

  // 3. Catalog gate — split rows into "in SP catalog now" vs "needs PM01 first".
  const allEans = invRows.map((r) => r.ean?.trim()).filter((e): e is string => !!e);
  const catalogedEans = dry ? new Set<string>() : await fetchSpCatalogedEans(allEans);
  // Also trust DB state — catalog_synced / uploaded / uploading rows are known-cataloged.
  const dbCataloged = (s: string | null) =>
    s === "catalog_synced" || s === "uploaded" || s === "uploading";

  const inCatalog: InvRow[] = [];
  const needsPm01: InvRow[] = [];
  for (const r of invRows) {
    const ean = r.ean?.trim();
    if ((ean && catalogedEans.has(ean)) || dbCataloged(r.pilot_status)) inCatalog.push(r);
    else needsPm01.push(r);
  }

  // 4. priceFor → buildable OF01 rows for the in-catalog set, applying overrides.
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

  for (const inv of inCatalog) {
    const skuKey = inv.sku ?? `inv:${inv.id}`;
    try {
      const source = toSourceProduct(inv);
      const { payload } = priceFor(source, { channel: "superpharm", rules, import_type: "official" });
      payload.images = source.images;
      if (!payload.buildable) {
        rejected.push({ sku: skuKey, inv_id: inv.id, errors: payload.errors });
        continue;
      }
      // Apply per-row overrides on the pricing-engine output.
      if (ovPrice != null && ovPrice > 0) payload.current_price = ovPrice;
      if (ovStrike !== undefined) payload.strike_price = ovStrike;
      if (ovShipping != null && ovShipping >= 0) payload.shipping_cost = ovShipping;
      if (ov.discount_start) payload.discount_start = ov.discount_start;
      if (ov.discount_end) payload.discount_end = ov.discount_end;
      // Guard: a strike must be strictly above the selling price or it's dropped.
      if (payload.strike_price != null && payload.strike_price <= payload.current_price) {
        payload.strike_price = null;
      }

      const row = channelPayloadToOf01(payload, {
        pickup_cost: source.pickup_cost,
        category_label: source.category_path[0] ?? null,
        import_type: "official",
        quantity: ovQuantity != null && ovQuantity >= 0 ? ovQuantity : 1,
      });
      row.sku = `inv:${inv.id}`;
      if (ovLeadtime != null && ovLeadtime > 0) row.leadtime_to_ship = ovLeadtime;
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

  // 5. Dry run — counts only.
  if (dry) {
    return NextResponse.json({
      ok: true,
      mode,
      eligible: accepted.length,
      needs_pm01_count: needsPm01.length,
      blocked_by_priceFor: rejected.length,
      rejected,
      total_candidates: invRows.length,
      elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(2)),
    });
  }

  // 6. Dispatch PM01 for the not-yet-cataloged rows (chain to OF01 via /check).
  let pm01DispatchedCount = 0;
  let pm01SyncJobId: string | null = null;
  let pm01Error: string | null = null;
  if (needsPm01.length > 0) {
    try {
      const r = await dispatchPm01({ mode: "by_ids", ids: needsPm01.map((x) => x.id) });
      if (r.ok) {
        pm01DispatchedCount = r.sku_count ?? 0;
        pm01SyncJobId = r.sync_job_id ?? null;
      } else {
        pm01Error = r.error ?? `PM01 dispatch status ${r.status ?? "?"}`;
      }
    } catch (e) {
      pm01Error = `dispatchPm01 threw: ${(e as Error).message}`;
    }
  }

  // 7. Push OF01 for the cataloged set.
  let importId: number | null = null;
  let syncJobId: string | null = null;
  if (accepted.length > 0) {
    const csv = buildOf01Csv(accepted.map((a) => a.row));
    const idempotencyKey = randomUUID();
    try {
      const r = await uploadOffersCsv(csv, idempotencyKey);
      importId = r.import_id;
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          error: `Mirakl OF01 upload: ${(e as Error).message}`,
          pm01_dispatched_count: pm01DispatchedCount,
          pm01_sync_job_id: pm01SyncJobId,
        },
        { status: 502 }
      );
    }

    const { data: jobRow } = await sb
      .from("sync_jobs")
      .insert({
        type: "superpharm_of01",
        status: "running",
        payload: {
          import_id: importId,
          idempotency_key: idempotencyKey,
          mode: `offers_update:${mode}`,
          sku_count: accepted.length,
          rejected_count: rejected.length,
          rejected,
          skus: accepted.map((a) => a.sku),
          inv_ids: accepted.map((a) => a.invId),
          import_type: "official",
          overrides: ov,
        },
      })
      .select("id")
      .single();
    syncJobId = jobRow?.id ?? null;

    const listings = accepted.map((a) => ({
      product_id: a.invId,
      channel: "superpharm" as const,
      state: "submitted",
      current_price: a.current_price,
      strike_price: a.strike_price,
      shipping_cost: a.shipping_cost,
      discount_start: a.discount_start,
      discount_end: a.discount_end,
      attributes: { import_id: importId, idempotency_key: idempotencyKey, kind: "offers_update" },
    }));
    const { error: clErr } = await sb
      .from("channel_listings")
      .upsert(listings, { onConflict: "product_id,channel" });
    if (clErr) console.warn(`[offers-update] channel_listings upsert: ${clErr.message}`);

    const ids = accepted.map((a) => a.invId);
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { error: psErr } = await sb.from("inventory").update({ pilot_status: "uploading" }).in("id", slice);
      if (psErr) console.warn(`[offers-update] pilot_status update: ${psErr.message}`);
    }
  }

  const elapsed = Number(((Date.now() - t0) / 1000).toFixed(1));
  const parts: string[] = [];
  if (accepted.length > 0) parts.push(`${accepted.length} הצעות נשלחו לעדכון בסופר-פארם`);
  if (pm01DispatchedCount > 0) parts.push(`${pm01DispatchedCount} מוצרים ייווצרו תחילה בקטלוג`);
  if (parts.length === 0) parts.push("אין מוצרים זמינים לעדכון");

  return NextResponse.json({
    ok: accepted.length > 0 || pm01DispatchedCount > 0,
    mode,
    import_id: importId,
    sync_job_id: syncJobId,
    sku_count: accepted.length,
    rejected_count: rejected.length,
    rejected,
    needs_pm01_count: needsPm01.length,
    pm01_dispatched_count: pm01DispatchedCount,
    pm01_sync_job_id: pm01SyncJobId,
    pm01_dispatch_error: pm01Error,
    note:
      parts.join(" · ") +
      ". מעקב הסטטוס דרך POST /api/sync/superpharm/check.",
    elapsed_s: elapsed,
    ...(accepted.length === 0 && pm01DispatchedCount === 0
      ? { error: rejected.length > 0 ? `כל ${rejected.length} השורות נדחו לפני שליחה` : "אין שורות זמינות" }
      : {}),
  });
}
