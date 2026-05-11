import { NextResponse } from "next/server";
import { getServiceClient } from "@/utils/supabase/admin";
import { createSupabaseServerClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-side board product list.
//
// All derivation (validation issues, source/superpharm status, upload bucket),
// scope filtering, free-text search, sort, pagination and the headline counts
// happen inside the `board_products(scope, q, page, page_size)` Postgres
// function in a single round trip. The previous implementation paginated the
// whole `inventory` + `catalog_matches` + `channel_listings` tables (≈11 REST
// round trips of ~5k rows) on *every* request and then filtered/sorted/sliced
// in JS — which is what made the catalog and upload boards crawl. See
// supabase/migrations/0036_board_products_rpc.sql.

const clamp = (n: number, min: number, max: number): number =>
  Math.min(Math.max(n, min), max);

export async function GET(req: Request) {
  const authClient = await createSupabaseServerClient();
  const { data: auth } = await authClient.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "upload" ? "upload" : "catalog";
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = clamp(Number(url.searchParams.get("page") ?? 1) || 1, 1, 10_000);
  const pageSize = clamp(Number(url.searchParams.get("pageSize") ?? 24) || 24, 1, 100);

  try {
    const sb = getServiceClient();
    const { data, error } = await sb.rpc("board_products", {
      p_scope: scope,
      p_q: q,
      p_page: page,
      p_page_size: pageSize,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? { ok: true, counts: {}, rows: [], total: 0, page, pageSize });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
