/**
 * POST /api/sync/superpharm/remediate/ingest
 *
 * Multipart upload of the SP merchandiser XLSX (Error Details sheet) →
 * upserts into remediation_queue. Idempotent: re-uploading the same
 * sheet is safe (unique constraint on (inv_id, error_code)).
 *
 * Expected sheet columns (header row 1):
 *   line-number | provider-unique-identifier | attribute-label | attribute-codes | error-code | error-message
 *
 * provider-unique-identifier is the shop_sku, formatted "inv:<id>".
 */
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ERROR_SHEET_NAME = "Error Details";

const skuToInvId = (sku: unknown): number | null => {
  if (typeof sku !== "string") return null;
  const m = sku.match(/^inv:(\d+)$/);
  return m ? Number(m[1]) : null;
};

interface SheetRow {
  "line-number"?: unknown;
  "provider-unique-identifier"?: unknown;
  "attribute-label"?: unknown;
  "attribute-codes"?: unknown;
  "error-code"?: unknown;
  "error-message"?: unknown;
}

interface DataRow {
  shop_sku?: unknown;
  ean?: unknown;
  name?: unknown;
  description?: unknown;
  brand?: unknown;
  category?: unknown;
  basePrice?: unknown;
  media?: unknown;
  media1?: unknown;
  media2?: unknown;
  media3?: unknown;
  media4?: unknown;
  media5?: unknown;
  variantImage?: unknown;
  [key: string]: unknown;
}

interface CategoryRow {
  id: string;
  name_he: string | null;
  full_path: string | null;
  label_normalized: string | null;
  is_leaf: boolean | null;
  sp_category_code: string | null;
}

const text = (value: unknown): string => String(value ?? "").trim();

const normalise = (value: unknown): string =>
  text(value).toLowerCase().replace(/\s+/g, " ");

const dataRowsByInvId = (workbook: XLSX.WorkBook): Map<number, DataRow> => {
  const sheet = workbook.Sheets.Data;
  const out = new Map<number, DataRow>();
  if (!sheet) return out;
  // The Data sheet has Hebrew display headers on row 1 and machine-readable
  // headers on row 2. range: 1 makes sheet_to_json use row 2 as headers.
  const rows = XLSX.utils.sheet_to_json<DataRow>(sheet, { range: 1, defval: "" });
  for (const row of rows) {
    const invId = skuToInvId(text(row.shop_sku));
    if (invId !== null) out.set(invId, row);
  }
  return out;
};

const collectImages = (row: DataRow): string[] => {
  const urls = [
    row.media,
    row.media1,
    row.media2,
    row.media3,
    row.media4,
    row.media5,
    row.variantImage,
  ]
    .map(text)
    .filter((v) => /^https?:\/\//i.test(v));
  return Array.from(new Set(urls));
};

const numericSpecsFromDataRow = (row: DataRow): Record<string, string> => {
  const specs: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!/^\d+$/.test(key)) continue;
    const v = text(value);
    if (v) specs[key] = v;
  }
  return specs;
};

const loadCategories = async (
  sb: ReturnType<typeof getServiceClient>
): Promise<CategoryRow[]> => {
  const out: CategoryRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("categories")
      .select("id, name_he, full_path, label_normalized, is_leaf, sp_category_code")
      .range(from, from + 999);
    if (error) throw new Error(`categories: ${error.message}`);
    out.push(...((data ?? []) as CategoryRow[]));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return out;
};

const resolveCategoryIdFromData = (
  rawCategory: unknown,
  categories: CategoryRow[]
): string | null => {
  const raw = text(rawCategory);
  if (!raw) return null;
  const slashToPath = raw.replace(/\s*\/\s*/g, " > ");
  const lastSegment = raw.split("/").pop()?.trim() ?? raw;
  const candidates = [
    normalise(slashToPath),
    normalise(raw),
    normalise(lastSegment),
  ].filter(Boolean);
  const leaf = categories.find(
    (c) =>
      c.is_leaf &&
      c.sp_category_code &&
      (candidates.includes(normalise(c.full_path)) ||
        candidates.includes(normalise(c.name_he)) ||
        candidates.includes(normalise(c.label_normalized)))
  );
  return leaf?.id ?? null;
};

const backfillInventoryFromDataRows = async (
  sb: ReturnType<typeof getServiceClient>,
  ids: number[],
  dataByInvId: Map<number, DataRow>
): Promise<Map<number, number>> => {
  const sourceToInventoryId = new Map<number, number>();
  if (ids.length === 0 || dataByInvId.size === 0) return sourceToInventoryId;
  const sourceEans = ids
    .map((id) => text(dataByInvId.get(id)?.ean))
    .filter(Boolean);

  // Do not use hacontainer_id="xlsx:<id>" for restored rows. The production
  // sync_konimbo_orphans() cleanup deletes any inventory.hacontainer_id that
  // is not present in the latest Konimbo keep-list. Restored XLSX rows are
  // keyed by their EAN instead and keep hacontainer_id NULL so they survive
  // future Konimbo sync cleanup.
  let existing: Array<{ id: number; ean: string | null }> = [];
  for (let i = 0; i < sourceEans.length; i += 500) {
    const { data, error } = await sb
      .from("inventory")
      .select("id, ean")
      .in("ean", sourceEans.slice(i, i + 500));
    if (error) throw new Error(`inventory backfill lookup: ${error.message}`);
    existing = existing.concat((data ?? []) as Array<{ id: number; ean: string | null }>);
  }
  for (const row of existing) {
    const oldId = ids.find((id) => text(dataByInvId.get(id)?.ean) === text(row.ean));
    if (oldId !== undefined) sourceToInventoryId.set(oldId, row.id);
  }

  const categories = await loadCategories(sb);
  const now = new Date().toISOString();
  const rows: Array<Record<string, unknown>> = [];
  for (const id of ids) {
    if (sourceToInventoryId.has(id)) continue;
    const row = dataByInvId.get(id);
    if (!row) continue;
    const name = text(row.name);
    const brand = text(row.brand);
    const ean = text(row.ean);
    if (!name || !brand || !ean) continue;
    const category = text(row.category);
    const price = Number(text(row.basePrice));
    const images = collectImages(row);
    const technical_specs = {
      ...numericSpecsFromDataRow(row),
      brand,
      source: "sp_error_xlsx",
    };
    rows.push({
      product_name: name,
      name_he: name,
      description_he: text(row.description),
      brand,
      category,
      category_id: resolveCategoryIdFromData(category, categories),
      ean,
      ean_original: ean,
      ean_source: "sp_error_xlsx",
      ean_status: ean.startsWith("299") ? "internal_generated" : "xlsx_supplied",
      barcode: ean,
      sku: `xlsx:${id}`,
      hacontainer_id: null,
      hacontainer_url: `xlsx:${id}`,
      images,
      price: Number.isFinite(price) && price > 0 ? price : 0,
      delivery_cost: 0,
      pickup_cost: 0,
      profit_quantity: 0,
      in_stock: true,
      technical_specs,
      pilot_status: "imported",
      source_fetched_at: now,
    });
  }

  if (rows.length === 0) return sourceToInventoryId;
  const { data, error } = await sb
    .from("inventory")
    .insert(rows)
    .select("id, hacontainer_url");
  if (error) throw new Error(`inventory backfill: ${error.message}`);
  const saved = (data ?? []) as Array<{ id: number; hacontainer_url: string | null }>;
  for (const row of saved) {
    const oldId = Number(row.hacontainer_url?.replace(/^xlsx:/, ""));
    if (Number.isFinite(oldId)) sourceToInventoryId.set(oldId, row.id);
  }
  for (const row of saved) {
    await sb.from("inventory").update({ sku: `inv:${row.id}` }).eq("id", row.id);
  }
  return sourceToInventoryId;
};

export async function POST(req: Request) {
  const sb = getServiceClient();
  const t0 = Date.now();
  let buffer: Buffer;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "missing 'file' part" }, { status: 400 });
    }
    buffer = Buffer.from(await file.arrayBuffer());
  } catch (e) {
    return NextResponse.json({ ok: false, error: `multipart parse: ${(e as Error).message}` }, { status: 400 });
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `xlsx read: ${(e as Error).message}` }, { status: 400 });
  }

  const sheet = workbook.Sheets[ERROR_SHEET_NAME];
  if (!sheet) {
    return NextResponse.json(
      { ok: false, error: `expected sheet '${ERROR_SHEET_NAME}' not found` },
      { status: 400 }
    );
  }
  const dataByInvId = dataRowsByInvId(workbook);
  // Some SP exports declare the used range as A2:Fn (excluding the header
  // row), which makes sheet_to_json use A2 as the header row and skip the
  // real headers in row 1. Override by widening the range to A1:F<lastRow>.
  const ref = sheet["!ref"];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    if (range.s.r > 0) {
      range.s.r = 0;
      sheet["!ref"] = XLSX.utils.encode_range(range);
    }
  }
  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: "" });

  let valid = 0;
  let skippedNoSku = 0;
  let skippedNoInv = 0;
  let backfilledInventory = 0;
  const redirectedInvIds = new Map<number, number>();
  const upsertRows: Array<Record<string, unknown>> = [];
  // Sample of seen inv_ids so we can validate they exist in the inventory table.
  const seenInvIds = new Set<number>();

  for (const r of rows) {
    const sku = String(r["provider-unique-identifier"] ?? "").trim();
    const errCode = String(r["error-code"] ?? "").trim();
    if (!sku || !errCode) {
      skippedNoSku++;
      continue;
    }
    const invId = skuToInvId(sku);
    if (invId === null) {
      skippedNoSku++;
      continue;
    }
    seenInvIds.add(invId);
    upsertRows.push({
      inv_id: invId,
      shop_sku: sku,
      error_code: errCode,
      error_message: String(r["error-message"] ?? "").trim() || null,
      attribute_codes: String(r["attribute-codes"] ?? "").trim() || null,
      source: "xlsx",
      status: "pending",
    });
  }

  // Filter out inv_ids that don't exist in inventory (foreign-key would fail).
  if (seenInvIds.size > 0) {
    const idArr = Array.from(seenInvIds);
    const known = new Set<number>();
    const CHUNK = 500;
    for (let i = 0; i < idArr.length; i += CHUNK) {
      const slice = idArr.slice(i, i + CHUNK);
      const { data } = await sb.from("inventory").select("id").in("id", slice);
      for (const row of (data ?? []) as { id: number }[]) known.add(row.id);
    }
    const unknown = idArr.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      try {
        const backfilled = await backfillInventoryFromDataRows(sb, unknown, dataByInvId);
        backfilledInventory = backfilled.size;
        for (const [sourceId, actualId] of backfilled.entries()) {
          redirectedInvIds.set(sourceId, actualId);
          known.add(actualId);
        }
      } catch (e) {
        return NextResponse.json(
          { ok: false, error: (e as Error).message, valid, upserted: 0 },
          { status: 500 }
        );
      }
    }
    const filtered: Array<Record<string, unknown>> = [];
    for (const r of upsertRows) {
      const sourceInvId = r.inv_id as number;
      const actualInvId = known.has(sourceInvId)
        ? sourceInvId
        : redirectedInvIds.get(sourceInvId) ?? null;
      if (actualInvId !== null) {
        r.inv_id = actualInvId;
        r.shop_sku = `inv:${actualInvId}`;
        filtered.push(r);
        valid++;
      } else {
        skippedNoInv++;
      }
    }
    upsertRows.length = 0;
    upsertRows.push(...filtered);
  }

  // De-dupe (inv_id, error_code) within the batch — XLSX rows with the
  // same error code but different attribute_codes (e.g. MCM-05000 with
  // 2054 / 2055 / 2056) need to fold into a single queue row, otherwise
  // the upsert fails with "cannot affect row a second time".
  const dedup = new Map<string, Record<string, unknown>>();
  for (const r of upsertRows) {
    const key = `${r.inv_id}::${r.error_code}`;
    const existing = dedup.get(key);
    if (existing) {
      // Merge attribute_codes (comma-joined unique).
      const a = String(existing.attribute_codes ?? "");
      const b = String(r.attribute_codes ?? "");
      const merged = Array.from(
        new Set(
          [...a.split(","), ...b.split(",")].map((s) => s.trim()).filter(Boolean)
        )
      ).join(",");
      existing.attribute_codes = merged || null;
    } else {
      dedup.set(key, r);
    }
  }
  upsertRows.length = 0;
  upsertRows.push(...dedup.values());

  // Upsert in chunks. ON CONFLICT (inv_id, error_code) DO UPDATE.
  let upserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < upsertRows.length; i += CHUNK) {
    const slice = upsertRows.slice(i, i + CHUNK);
    const { error } = await sb
      .from("remediation_queue")
      .upsert(slice, { onConflict: "inv_id,error_code", ignoreDuplicates: false });
    if (error) {
      return NextResponse.json(
        { ok: false, error: `upsert: ${error.message}`, valid, upserted },
        { status: 500 }
      );
    }
    upserted += slice.length;
  }

  return NextResponse.json({
    ok: true,
    rows_in_sheet: rows.length,
    valid,
    upserted,
    backfilled_inventory: backfilledInventory,
    skipped_no_sku: skippedNoSku,
    skipped_unknown_inv_id: skippedNoInv,
    distinct_inv_ids: seenInvIds.size,
    elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(2)),
  });
}
