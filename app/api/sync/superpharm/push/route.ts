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
  const target = `${base}/api/offers/imports`;

  const boundary = `----RanFainaHubPush${Date.now().toString(36)}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="offers.csv"\r\n` +
    `Content-Type: text/csv; charset=utf-8\r\n\r\n` +
    csv +
    `\r\n--${boundary}--\r\n`;

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(target, {
      method: "POST",
      headers: {
        Authorization: key,
        Accept: "application/json",
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Idempotency-Key": idempotencyKey,
      },
      body,
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

  if (invRows.length === 0) {
    return NextResponse.json(
      {
        ok: dry, // dry-run with zero candidates is a fine "nothing to do"
        eligible: 0,
        blocked_by_duplicate: blockedByDuplicate,
        blocked_by_priceFor: 0,
        rejected: [],
        ...(dry ? {} : { error: "no inventory rows match selection" }),
      },
      { status: dry ? 200 : 400 }
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
      blocked_by_priceFor: rejected.length,
      total_candidates: invRows.length + blockedByDuplicate,
      elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(2)),
    });
  }

  if (accepted.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `all ${invRows.length} payloads rejected pre-flight`,
        blocked_by_duplicate: blockedByDuplicate,
        blocked_by_priceFor: rejected.length,
        rejected,
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

  // 7. sync_jobs row.
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
        rejected,
        skus: accepted.map((a) => a.sku),
        import_type: importType,
      },
    })
    .select("id")
    .single();
  if (jobErr) {
    console.warn(`[sync/superpharm/push] sync_jobs insert failed: ${jobErr.message}`);
  }

  // 8. channel_listings staging.
  const listings = accepted.map((a) => ({
    product_id: a.invId,
    channel: "superpharm" as const,
    state: "pending",
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

  // 9. Promote pilot_status so the queue advances.
  const ids = accepted.map((a) => a.invId);
  if (ids.length > 0) {
    const { error: psErr } = await sb
      .from("inventory")
      .update({ pilot_status: "uploaded" })
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
    rejected,
    elapsed_s: elapsed,
  });
}
