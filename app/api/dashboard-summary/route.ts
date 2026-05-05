/**
 * GET /api/dashboard-summary
 *
 * Calls the `dashboard_summary()` Postgres RPC. Returns one jsonb with:
 *   inventory_total, sp_active, verdicts, pilot_status, top_missing_categories,
 *   sp_logistic_class, last_syncs, plus unique Super-Pharm match counters.
 *
 * Cached:
 *   - in-process memo (60 s) so concurrent / repeat requests don't re-paginate
 *     `catalog_matches` (the slow part)
 *   - HTTP `Cache-Control` for browser/CDN dedupe
 */
import { NextResponse } from "next/server";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

const PAGE = 1000;
const MATCHED_VERDICTS = new Set(["duplicate", "candidate", "manual_review"]);
const CACHE_TTL_MS = 60_000;

type Payload = Record<string, unknown> & { ok: true };

let cache: { value: Payload; expiresAt: number } | null = null;
let inflight: Promise<Payload> | null = null;

async function getUniqueSuperPharmMatchCounts(sb: ReturnType<typeof getServiceClient>) {
  const matched = new Set<string>();
  const duplicates = new Set<string>();
  let from = 0;

  for (;;) {
    const { data, error } = await sb
      .from("catalog_matches")
      .select("superpharm_offer_id, verdict")
      .not("superpharm_offer_id", "is", null)
      .range(from, from + PAGE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      const offerId = row.superpharm_offer_id as string | null;
      const verdict = row.verdict as string | null;
      if (!offerId || !verdict) continue;
      if (MATCHED_VERDICTS.has(verdict)) matched.add(offerId);
      if (verdict === "duplicate") duplicates.add(offerId);
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return {
    sp_matched_unique: matched.size,
    sp_duplicate_unique: duplicates.size,
  };
}

async function loadFresh(): Promise<Payload> {
  const sb = getServiceClient();
  const [rpcRes, uniqueMatchCounts] = await Promise.all([
    sb.rpc("dashboard_summary"),
    getUniqueSuperPharmMatchCounts(sb),
  ]);

  if (rpcRes.error) {
    throw new Error(rpcRes.error.message);
  }

  return {
    ok: true,
    ...((rpcRes.data as object) ?? {}),
    ...uniqueMatchCounts,
  };
}

export async function GET() {
  const now = Date.now();

  if (cache && cache.expiresAt > now) {
    return NextResponse.json(cache.value, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
    });
  }

  // Coalesce concurrent requests onto a single in-flight load.
  if (!inflight) {
    inflight = loadFresh()
      .then((value) => {
        cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }

  try {
    const value = await inflight;
    return NextResponse.json(value, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
