/**
 * POST /api/sync/konimbo
 *
 * Invokes the Supabase Edge Function `sync-konimbo` (lightweight orphan sync).
 * Server-only (uses service-role JWT). Returns the Edge Fn JSON response.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const url =
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim() ||
    (process.env.SUPABASE_URL ?? "").trim();
  const serviceKey =
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim() ||
    (process.env.SUPABASE_SERVICE_KEY ?? "").trim();

  if (!url || !serviceKey) {
    const missing: string[] = [];
    if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
    if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)");
    return NextResponse.json(
      { ok: false, error: `missing env var(s): ${missing.join(", ")}` },
      { status: 500 }
    );
  }

  const fnUrl = `${url}/functions/v1/sync-konimbo`;
  try {
    const res = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: "{}",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status, error: body }, { status: 502 });
    }
    return NextResponse.json({ ok: true, ...body });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
