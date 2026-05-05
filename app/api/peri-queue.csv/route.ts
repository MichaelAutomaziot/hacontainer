/**
 * GET /api/peri-queue.csv
 *
 * Streams a UTF-8 BOM CSV of all `verdict='missing'` rows joined with
 * inventory. Same shape as the worker's `export-peri-queue.ts` so Peri's
 * existing process is unchanged.
 *
 * Optional query params (all narrow the result):
 *   ?category=...  — exact match on inventory.category
 *   ?brand=...     — exact match on inventory.brand
 *   ?has_ean=true|false
 *   ?min_price=N&max_price=N
 *   ?limit=N
 */
import { NextResponse, type NextRequest } from "next/server";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLS = [
  "ean",
  "title_he",
  "brand",
  "category_label_source",
  "description_he",
  "image_url_1",
  "image_url_2",
  "image_url_3",
  "warranty_text",
  "source_url",
] as const;

const escape = (val: unknown): string => {
  if (val === undefined || val === null || val === "") return "";
  const s = String(val);
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export async function GET(req: NextRequest) {
  const sb = getServiceClient();
  const u = new URL(req.url);
  const category = u.searchParams.get("category");
  const brand = u.searchParams.get("brand");
  const hasEanStr = u.searchParams.get("has_ean");
  const minPrice = u.searchParams.get("min_price");
  const maxPrice = u.searchParams.get("max_price");
  const limit = Number(u.searchParams.get("limit") ?? 0) || undefined;

  const PAGE = 1000;
  const rows: Array<Record<string, unknown>> = [];
  let from = 0;
  for (;;) {
    let q = sb
      .from("v_comparison")
      .select(
        "inv_ean,name_he,inv_brand,inv_category,hacontainer_url,inventory_id,inv_price,inv_thumb"
      )
      .eq("verdict", "missing")
      .range(from, from + PAGE - 1);
    if (category) q = q.eq("inv_category", category);
    if (brand) q = q.eq("inv_brand", brand);
    if (hasEanStr === "true") q = q.not("inv_ean", "is", null);
    if (hasEanStr === "false") q = q.is("inv_ean", null);
    if (minPrice) q = q.gte("inv_price", Number(minPrice));
    if (maxPrice) q = q.lte("inv_price", Number(maxPrice));
    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    if (limit && rows.length >= limit) {
      rows.splice(limit);
      break;
    }
    from += PAGE;
  }

  // Pull description + images + warranty from inventory in a second batch
  // (v_comparison doesn't include the full description / image array).
  const ids = rows.map((r) => r.inventory_id as number);
  const enrichMap = new Map<number, { description_he: string | null; images: string[] | null; technical_specs: Record<string, unknown> | null }>();
  for (let i = 0; i < ids.length; i += PAGE) {
    const slice = ids.slice(i, i + PAGE);
    const { data: invRows, error } = await sb
      .from("inventory")
      .select("id,description_he,images,technical_specs")
      .in("id", slice);
    if (error) continue;
    for (const r of invRows ?? []) {
      enrichMap.set(r.id as number, {
        description_he: r.description_he as string | null,
        images: r.images as string[] | null,
        technical_specs: r.technical_specs as Record<string, unknown> | null,
      });
    }
  }

  const lines = [COLS.join(",")];
  for (const r of rows) {
    const enrich = enrichMap.get(r.inventory_id as number);
    const tech = (enrich?.technical_specs ?? {}) as Record<string, unknown>;
    const imgs = enrich?.images ?? [];
    const row = {
      ean: r.inv_ean ?? "",
      title_he: r.name_he ?? "",
      brand: r.inv_brand ?? tech["brand"] ?? "",
      category_label_source: r.inv_category ?? "",
      description_he: enrich?.description_he ?? "",
      image_url_1: imgs[0] ?? "",
      image_url_2: imgs[1] ?? "",
      image_url_3: imgs[2] ?? "",
      warranty_text: tech["warranty_he"] ?? "",
      source_url: r.hacontainer_url ?? "",
    };
    lines.push(COLS.map((c) => escape(row[c as keyof typeof row])).join(","));
  }

  // UTF-8 BOM so Excel opens Hebrew correctly.
  const csv = "﻿" + lines.join("\n") + "\n";

  const filename = `peri-queue-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
