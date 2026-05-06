/**
 * POST /api/admin/cleanup-blog
 *
 * Removes inventory rows in category 'בלוג' (blog articles that were
 * accidentally scraped as products — no real price, no SKU). Cascades through
 * the FK-dependent tables before deleting the parent rows.
 *
 * Body: { dry?: boolean }
 *   - dry=true: return counts only, no writes.
 */
import { NextResponse } from "next/server";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORY = "בלוג";

interface RequestBody {
  dry?: boolean;
}

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

  // 1. Collect ids.
  const { data: idRows, error: idErr } = await sb
    .from("inventory")
    .select("id")
    .eq("category", CATEGORY);
  if (idErr) {
    return NextResponse.json({ ok: false, error: idErr.message }, { status: 500 });
  }
  const ids = (idRows ?? []).map((r: { id: number }) => r.id);

  if (ids.length === 0) {
    return NextResponse.json({
      ok: true,
      inventory: 0,
      catalog_matches: 0,
      channel_listings: 0,
      image_assets: 0,
      dry,
      elapsed_s: (Date.now() - t0) / 1000,
    });
  }

  // 2. Count dependents.
  const [{ count: cmCount }, { count: clCount }, { count: iaCount }] = await Promise.all([
    sb.from("catalog_matches").select("id", { count: "exact", head: true }).in("inventory_id", ids),
    sb.from("channel_listings").select("id", { count: "exact", head: true }).in("product_id", ids),
    sb.from("image_assets").select("id", { count: "exact", head: true }).in("product_id", ids),
  ]);

  if (dry) {
    return NextResponse.json({
      ok: true,
      inventory: ids.length,
      catalog_matches: cmCount ?? 0,
      channel_listings: clCount ?? 0,
      image_assets: iaCount ?? 0,
      dry,
      elapsed_s: (Date.now() - t0) / 1000,
    });
  }

  // 3. Cascade delete.
  const cm = await sb.from("catalog_matches").delete().in("inventory_id", ids);
  if (cm.error) {
    return NextResponse.json(
      { ok: false, error: `catalog_matches: ${cm.error.message}` },
      { status: 500 },
    );
  }
  const cl = await sb.from("channel_listings").delete().in("product_id", ids);
  if (cl.error) {
    return NextResponse.json(
      { ok: false, error: `channel_listings: ${cl.error.message}` },
      { status: 500 },
    );
  }
  const ia = await sb.from("image_assets").delete().in("product_id", ids);
  if (ia.error) {
    return NextResponse.json(
      { ok: false, error: `image_assets: ${ia.error.message}` },
      { status: 500 },
    );
  }
  const inv = await sb.from("inventory").delete().in("id", ids);
  if (inv.error) {
    return NextResponse.json(
      { ok: false, error: `inventory: ${inv.error.message}` },
      { status: 500 },
    );
  }

  await sb.from("sync_jobs").insert({
    type: "cleanup_blog_category",
    status: "completed",
    payload: {
      inventory_deleted: ids.length,
      catalog_matches_deleted: cmCount ?? 0,
      channel_listings_deleted: clCount ?? 0,
      image_assets_deleted: iaCount ?? 0,
      elapsed_s: (Date.now() - t0) / 1000,
    },
    completed_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    inventory: ids.length,
    catalog_matches: cmCount ?? 0,
    channel_listings: clCount ?? 0,
    image_assets: iaCount ?? 0,
    dry: false,
    elapsed_s: (Date.now() - t0) / 1000,
  });
}
