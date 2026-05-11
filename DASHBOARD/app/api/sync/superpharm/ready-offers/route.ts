import { NextResponse } from "next/server";
import { priceFor, type PricingRule, type SourceProduct } from "@/lib/shared";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SyncJob = {
  id: string;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type InvRow = {
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
};

const INV_COLS =
  "id,name_he,description_he,ean,sku,hacontainer_id,hacontainer_url,price,pickup_cost,category,images,technical_specs";

const parseSemiCsv = (csv: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (inQuotes) {
      if (c === '"' && csv[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ";") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur.replace(/\r$/, ""));
      if (row.some((v) => v.trim().length > 0)) rows.push(row);
      row = [];
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur.replace(/\r$/, ""));
    if (row.some((v) => v.trim().length > 0)) rows.push(row);
  }
  return rows;
};

const skuToInvId = (sku: unknown): number | null => {
  if (typeof sku !== "string") return null;
  const m = sku.match(/^inv:(\d+)$/);
  return m ? Number(m[1]) : null;
};

const numberArray = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((n): n is number => typeof n === "number" && Number.isFinite(n)) : [];

const firstNonEmpty = (...lists: number[][]): number[] => lists.find((list) => list.length > 0) ?? [];

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

const fetchNewProductInvIds = async (importId: number): Promise<number[]> => {
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) return [];
  const res = await fetch(`${base}/api/products/imports/${importId}/new_product_report`, {
    headers: { Authorization: key, Accept: "text/csv" },
  });
  if (!res.ok) return [];
  const parsed = parseSemiCsv(await res.text());
  if (parsed.length < 2) return [];
  const header = parsed[0].map((h) => h.toLowerCase());
  const skuIdx = header.indexOf("shop_sku");
  if (skuIdx === -1) return [];

  const ids = new Set<number>();
  for (const row of parsed.slice(1)) {
    const invId = skuToInvId(row[skuIdx]);
    if (invId !== null) ids.add(invId);
  }
  return Array.from(ids);
};

export async function GET() {
  const sb = getServiceClient();
  const ids = new Set<number>();
  const sources: Array<{ source: string; count: number; job_id?: string; import_id?: number }> = [];

  const { data: catalogRows, error: catalogErr } = await sb
    .from("inventory")
    .select("id")
    .eq("pilot_status", "catalog_synced");
  if (catalogErr) {
    return NextResponse.json({ ok: false, error: catalogErr.message }, { status: 500 });
  }
  for (const row of (catalogRows ?? []) as { id: number }[]) ids.add(row.id);
  if ((catalogRows ?? []).length > 0) {
    sources.push({ source: "inventory.catalog_synced", count: (catalogRows ?? []).length });
  }

  const { data: jobs, error: jobsErr } = await sb
    .from("sync_jobs")
    .select("id,status,payload,created_at")
    .eq("type", "superpharm_pm01")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(25);
  if (jobsErr) {
    return NextResponse.json({ ok: false, error: jobsErr.message }, { status: 500 });
  }

  for (const job of (jobs ?? []) as SyncJob[]) {
    const payload = job.payload ?? {};
    const importId = typeof payload.import_id === "number" ? payload.import_id : null;
    let jobIds = firstNonEmpty(
      numberArray(payload.catalog_synced_inv_ids),
      numberArray(payload.ready_for_offer_inv_ids),
      numberArray(payload.pm01_success_inv_ids)
    );

    if (jobIds.length === 0 && importId !== null) {
      jobIds = await fetchNewProductInvIds(importId);
      const submittedIds = numberArray(payload.inv_ids);
      const successCount =
        typeof payload.products_successfully_synchronized === "number"
          ? payload.products_successfully_synchronized
          : null;
      if (jobIds.length === 0 && successCount !== null && successCount === submittedIds.length) {
        jobIds = submittedIds;
      }
      if (jobIds.length > 0) {
        await sb
          .from("sync_jobs")
          .update({
            payload: {
              ...payload,
              catalog_synced_inv_ids: jobIds,
              ready_for_offer_inv_ids: jobIds,
              ready_for_offer_count: jobIds.length,
            },
          })
          .eq("id", job.id);
      }
    }

    if (jobIds.length > 0) {
      for (const id of jobIds) ids.add(id);
      sources.push({
        source: "sync_jobs.superpharm_pm01",
        count: jobIds.length,
        job_id: job.id,
        import_id: importId ?? undefined,
      });
    }
  }

  if (ids.size === 0) {
    return NextResponse.json({ ok: true, count: 0, ids: [], sources });
  }

  const idList = Array.from(ids);
  const uploaded = new Set<number>();
  for (let i = 0; i < idList.length; i += 500) {
    const slice = idList.slice(i, i + 500);
    const { data, error } = await sb
      .from("inventory")
      .select("id,pilot_status")
      .in("id", slice);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    for (const row of (data ?? []) as { id: number; pilot_status: string | null }[]) {
      if (row.pilot_status === "uploaded" || row.pilot_status === "uploading") uploaded.add(row.id);
    }
  }

  const catalogReadyIds = idList.filter((id) => !uploaded.has(id)).sort((a, b) => a - b);
  const { data: rulesRaw, error: rulesErr } = await sb
    .from("pricing_rules")
    .select("id, channel, rule_type, config, active")
    .eq("active", true)
    .eq("channel", "superpharm");
  if (rulesErr) return NextResponse.json({ ok: false, error: rulesErr.message }, { status: 500 });
  const rules = (rulesRaw ?? []) as unknown as PricingRule[];

  const sendableIds = new Set<number>();
  const blockedByPrice: Array<{ id: number; errors: string[] }> = [];
  for (let i = 0; i < catalogReadyIds.length; i += 500) {
    const slice = catalogReadyIds.slice(i, i + 500);
    const { data, error } = await sb.from("inventory").select(INV_COLS).in("id", slice);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    for (const row of (data ?? []) as InvRow[]) {
      const { payload } = priceFor(toSourceProduct(row), {
        channel: "superpharm",
        rules,
        import_type: "official",
      });
      if (payload.buildable) {
        sendableIds.add(row.id);
      } else {
        blockedByPrice.push({ id: row.id, errors: payload.errors });
      }
    }
  }

  const readyIds = catalogReadyIds.filter((id) => sendableIds.has(id));
  return NextResponse.json({
    ok: true,
    count: readyIds.length,
    ids: readyIds,
    sources,
    excluded_uploaded: uploaded.size,
    excluded_unavailable: uploaded.size,
    catalog_ready_count: catalogReadyIds.length,
    blocked_by_price: blockedByPrice.length,
    blocked_by_price_examples: blockedByPrice.slice(0, 10),
  });
}
