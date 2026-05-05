/**
 * POST /api/sync/superpharm
 *
 * Manual SP sync. The Supabase Edge Function failed on free-tier memory + 150s
 * cap, so this Route Handler runs the full Mirakl OF21 pull server-side using
 * Node's fetch (no time limit on local dev). Per locked decision (4 May 2026):
 * SP sync is manual-only via a button on the dashboard.
 *
 * Pulls every offer page-by-page, filters to active+qty>0+state=11, and calls
 * the `sync_superpharm_orphans` rpc to delete rows no longer in the keep set.
 *
 * Inserts a `sync_jobs` row on completion or failure with payload for trace.
 */
import { NextResponse } from "next/server";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PAGE_SIZE = 100;
const PAGE_DELAY_MS = 200;

interface OF21Offer {
  offer_id: number | string;
  active?: boolean;
  quantity?: number;
  state_code?: string | number;
  [k: string]: unknown;
}
interface OF21Page {
  total_count: number;
  offers: OF21Offer[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const miraklGet = async (offset: number, attempt = 0): Promise<OF21Page> => {
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) throw new Error("MIRAKL_API_KEY not set");
  const url = `${base}/api/offers?max=${PAGE_SIZE}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { Authorization: key, Accept: "application/json" },
  });
  if (res.status === 429 && attempt < 5) {
    const ra = Number(res.headers.get("retry-after") ?? 5);
    await sleep((Number.isFinite(ra) && ra > 0 ? ra : 5) * 1000);
    return miraklGet(offset, attempt + 1);
  }
  if ((res.status === 502 || res.status === 503) && attempt < 3) {
    await sleep(1500 * (attempt + 1));
    return miraklGet(offset, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`Mirakl ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as OF21Page;
};

export async function POST() {
  const sb = getServiceClient();
  const t0 = Date.now();

  // Insert a "running" sync_jobs row up front so the dashboard can subscribe.
  const { data: job, error: insertErr } = await sb
    .from("sync_jobs")
    .insert({
      type: "sync-superpharm-full",
      status: "running",
      payload: { started_at: new Date().toISOString() },
    })
    .select("id")
    .single();
  if (insertErr || !job) {
    return NextResponse.json(
      { ok: false, error: `sync_jobs insert: ${insertErr?.message ?? "unknown"}` },
      { status: 500 }
    );
  }
  const jobId = job.id as string;

  try {
    const keepIds: string[] = [];
    let offset = 0;
    let totalSeen = 0;
    let pages = 0;
    let total = 0;

    for (;;) {
      const r = await miraklGet(offset);
      total = r.total_count;
      for (const o of r.offers) {
        totalSeen++;
        if (o.active === true && (o.quantity ?? 0) > 0 && String(o.state_code ?? "") === "11") {
          keepIds.push(String(o.offer_id));
        }
      }
      pages++;
      if (r.offers.length === 0 || totalSeen >= total) break;
      offset += PAGE_SIZE;
      if (PAGE_DELAY_MS) await sleep(PAGE_DELAY_MS);
    }

    const { data: rpcRes, error: rpcErr } = await sb.rpc("sync_superpharm_orphans", {
      keep_ids: keepIds,
    });
    if (rpcErr) throw new Error(`rpc: ${rpcErr.message}`);
    const result = (rpcRes as { deleted: number } | null) ?? { deleted: 0 };

    const elapsed = Number(((Date.now() - t0) / 1000).toFixed(1));
    await sb
      .from("sync_jobs")
      .update({
        status: "completed",
        payload: {
          total_seen: totalSeen,
          pages,
          keep_count: keepIds.length,
          deleted: result.deleted,
          elapsed_s: elapsed,
        },
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return NextResponse.json({
      ok: true,
      job_id: jobId,
      total_seen: totalSeen,
      pages,
      keep_count: keepIds.length,
      deleted: result.deleted,
      elapsed_s: elapsed,
    });
  } catch (e) {
    const msg = (e as Error).message;
    const elapsed = Number(((Date.now() - t0) / 1000).toFixed(1));
    await sb
      .from("sync_jobs")
      .update({
        status: "failed",
        last_error: msg,
        payload: { elapsed_s: elapsed },
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    return NextResponse.json({ ok: false, error: msg, elapsed_s: elapsed, job_id: jobId }, { status: 500 });
  }
}
