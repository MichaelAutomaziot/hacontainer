/**
 * POST /api/sync/superpharm/products/push
 *
 * Modes:
 *   - mode: 'by_ids'        → push the explicit list of inventory.id values.
 *   - mode: 'missing'       → push every inventory row with verdict='missing'
 *                             that is not already in the SP product catalog.
 *   - dry: true             → return only counts; no Mirakl call, no DB writes.
 *
 * This is PM01 (product create) — required before OF01 (offer create) for any
 * EAN that doesn't yet exist in the SP catalog. SP rejects OF01 offers on
 * unknown products with "The state of the product is unknown".
 *
 * The actual dispatch logic lives in `@/lib/server/pm01-dispatch` so other
 * server-side callers (notably the OF01 push route) can invoke it directly
 * without an internal HTTP self-fetch — Railway's public-domain loopback
 * is unreliable from inside the container.
 */
import { NextResponse } from "next/server";
import { dispatchPm01, type DispatchPm01Opts } from "@/lib/server/pm01-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  let body: DispatchPm01Opts = {};
  try {
    body = (await req.json()) as DispatchPm01Opts;
  } catch {
    body = {};
  }
  const result = await dispatchPm01(body);
  const status = result.status ?? (result.ok ? 200 : 500);
  // Strip status from the body — it was a hint for the wrapper.
  const { status: _drop, ...payload } = result;
  void _drop;
  return NextResponse.json(payload, { status });
}
