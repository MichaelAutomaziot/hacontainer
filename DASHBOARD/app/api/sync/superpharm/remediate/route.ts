/**
 * Auto-remediation orchestrator.
 *
 *   GET  /api/sync/superpharm/remediate
 *        Returns counts: pending / fixing / fixed / manual_required / failed.
 *
 *   POST /api/sync/superpharm/remediate
 *        body: { ids?: number[]; limit?: number; trigger_pm01?: boolean (default true) }
 *        - When ids omitted: pick distinct inv_ids from queue.status='pending'
 *          (newest first), capped at body.limit ?? 200.
 *        - For each inv_id, runs the per-error fixers (image/text/name/category/attrs).
 *        - When trigger_pm01: fires dispatchPm01 for all inv_ids that came out
 *          status='fixed'. Returns the resulting PM01 sync_job_id so /check
 *          can pick it up and chain OF01.
 */
import { NextResponse } from "next/server";
import { dispatchPm01 } from "@/lib/server/pm01-dispatch";
import { remediateMany } from "@/lib/server/remediation/orchestrator";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

interface RequestBody {
  ids?: number[];
  limit?: number;
  trigger_pm01?: boolean;
  concurrency?: number;
  /**
   * Dispatch PM01 directly for selected, already-remediated ids. This is used
   * after a restore/backfill or a manual data patch where queue rows are
   * already fixed and the normal fixer pass would be a no-op.
   */
  pm01_ids?: number[];
  /**
   * When true, skip the per-fixer phase entirely and just dispatch PM01
   * for every inv_id whose remediation_queue rows are ALL status='fixed'.
   * Used by the dashboard's "Re-push fixed products" button after a
   * remediation pass has drained the pending queue.
   */
  pm01_all_fixed?: boolean;
  /**
   * Reset rows from manual_required → pending so the orchestrator re-tries
   * them with newer fixer logic. Filters by error_code prefix when given.
   */
  reset_manual?: { error_code_prefix?: string };
  /**
   * Reset rows for specific inv_ids back to pending regardless of current
   * status. Used when an upstream fix (new heuristic, new extractor) needs
   * to overwrite a previous "fixed" classification.
   */
  reset_inv_ids?: { ids: number[]; error_code_prefix?: string };
}

export async function GET() {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("remediation_queue")
    .select("status");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { status: string }[]) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return NextResponse.json({ ok: true, counts });
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
  const triggerPm01 = body.trigger_pm01 !== false;
  const concurrency = Math.max(1, Math.min(8, body.concurrency ?? 4));
  const limit = Math.max(1, Math.min(2000, body.limit ?? 200));

  if (body.pm01_ids && body.pm01_ids.length > 0) {
    const ids = Array.from(new Set(body.pm01_ids)).filter((n) => Number.isFinite(n));
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, note: "no ids" });
    }
    try {
      const r = await dispatchPm01({ mode: "by_ids", ids });
      if (!r.ok) {
        return NextResponse.json(
          { ok: false, error: r.error ?? "pm01 dispatch failed", pm01: r },
          { status: 500 }
        );
      }
      if (r.sync_job_id) {
        await sb
          .from("remediation_queue")
          .update({ pm01_sync_job_id: r.sync_job_id, re_pushed_at: new Date().toISOString() })
          .in("inv_id", ids);
      }
      return NextResponse.json({
        ok: true,
        mode: "pm01_ids",
        requested: ids.length,
        pm01: {
          sku_count: r.sku_count,
          sync_job_id: r.sync_job_id ?? null,
          rejected: r.rejected?.slice(0, 30) ?? [],
          unresolvable_brands: r.unresolvable_brands?.slice(0, 30) ?? [],
          unresolvable_categories: r.unresolvable_categories?.slice(0, 30) ?? [],
        },
        elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(1)),
      });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: `dispatchPm01 threw: ${(e as Error).message}` },
        { status: 500 }
      );
    }
  }

  // Shortcut: bulk-reset manual_required rows back to pending. Used after
  // a fixer-logic upgrade so a re-run can pick them up.
  if (body.reset_manual) {
    const prefix = body.reset_manual.error_code_prefix?.trim() ?? "";
    let q = sb
      .from("remediation_queue")
      .update({ status: "pending", fix_log: [] })
      .eq("status", "manual_required");
    if (prefix) q = q.like("error_code", `${prefix}%`);
    const { data, error } = await q.select("id");
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      reset_count: (data ?? []).length,
      elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(2)),
    });
  }

  if (body.reset_inv_ids) {
    const ids = Array.from(new Set(body.reset_inv_ids.ids ?? [])).filter(
      (n) => Number.isFinite(n)
    );
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, reset_count: 0, note: "no ids" });
    }
    const prefix = body.reset_inv_ids.error_code_prefix?.trim() ?? "";
    let q = sb
      .from("remediation_queue")
      .update({ status: "pending", fix_log: [] })
      .in("inv_id", ids);
    if (prefix) q = q.like("error_code", `${prefix}%`);
    const { data, error } = await q.select("id");
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      reset_count: (data ?? []).length,
      elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(2)),
    });
  }

  // Shortcut: dispatch PM01 for every inv_id whose queue rows are all fixed,
  // bypassing the per-fixer phase entirely. Used after remediation drains.
  if (body.pm01_all_fixed) {
    const allFixedIds = new Set<number>();
    let cursor = 0;
    for (;;) {
      const { data, error } = await sb
        .from("remediation_queue")
        .select("inv_id, status")
        .order("inv_id", { ascending: true })
        .range(cursor, cursor + 999);
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      const rows = (data ?? []) as { inv_id: number; status: string }[];
      if (rows.length === 0) break;
      // group by inv_id; only include ids where every status === 'fixed'
      const byInv = new Map<number, boolean>();
      for (const r of rows) {
        const cur = byInv.get(r.inv_id);
        const fixed = r.status === "fixed";
        byInv.set(r.inv_id, cur === undefined ? fixed : cur && fixed);
      }
      for (const [id, allFixed] of byInv.entries()) {
        if (allFixed) allFixedIds.add(id);
      }
      if (rows.length < 1000) break;
      cursor += 1000;
    }
    // Re-validate against the full table because pagination may split a
    // single inv_id's rows: any false-fix in any chunk should remove it.
    const { data: notFixed } = await sb
      .from("remediation_queue")
      .select("inv_id")
      .neq("status", "fixed");
    for (const r of (notFixed ?? []) as { inv_id: number }[]) {
      allFixedIds.delete(r.inv_id);
    }
    const ids = Array.from(allFixedIds).sort((a, b) => a - b);
    if (ids.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        note: "no fully-fixed inv_ids",
        elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(2)),
      });
    }
    try {
      const r = await dispatchPm01({ mode: "by_ids", ids });
      if (!r.ok) {
        return NextResponse.json(
          { ok: false, error: r.error ?? "pm01 dispatch failed", pm01: r },
          { status: 500 }
        );
      }
      if (r.sync_job_id) {
        await sb
          .from("remediation_queue")
          .update({ pm01_sync_job_id: r.sync_job_id, re_pushed_at: new Date().toISOString() })
          .in("inv_id", ids);
      }
      return NextResponse.json({
        ok: true,
        mode: "pm01_all_fixed",
        inv_ids: ids.length,
        pm01: {
          sku_count: r.sku_count,
          sync_job_id: r.sync_job_id ?? null,
          rejected: r.rejected?.slice(0, 30) ?? [],
          unresolvable_brands: r.unresolvable_brands?.slice(0, 30) ?? [],
          unresolvable_categories: r.unresolvable_categories?.slice(0, 30) ?? [],
        },
        elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(1)),
      });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: `dispatchPm01 threw: ${(e as Error).message}` },
        { status: 500 }
      );
    }
  }

  let invIds: number[];
  if (body.ids && body.ids.length > 0) {
    invIds = Array.from(new Set(body.ids));
  } else {
    const seen = new Set<number>();
    let from = 0;
    for (;;) {
      const { data, error } = await sb
        .from("remediation_queue")
        .select("inv_id, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .range(from, from + 999);
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      const rows = (data ?? []) as { inv_id: number }[];
      for (const r of rows) {
        if (typeof r.inv_id === "number") seen.add(r.inv_id);
        if (seen.size >= limit) break;
      }
      if (rows.length < 1000 || seen.size >= limit) break;
      from += 1000;
    }
    invIds = Array.from(seen);
  }

  if (invIds.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      note: "no pending inv_ids",
      elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(2)),
    });
  }

  const results = await remediateMany(invIds, concurrency);
  const fixedIds = results.filter((r) => r.status === "fixed").map((r) => r.inv_id);
  const manualIds = results.filter((r) => r.status === "manual_required").map((r) => r.inv_id);
  const failedIds = results.filter((r) => r.status === "failed").map((r) => r.inv_id);

  let pm01: { sku_count?: number; sync_job_id?: string | null; error?: string } | null = null;
  if (triggerPm01 && fixedIds.length > 0) {
    try {
      const r = await dispatchPm01({ mode: "by_ids", ids: fixedIds });
      if (r.ok) {
        pm01 = { sku_count: r.sku_count, sync_job_id: r.sync_job_id ?? null };
        if (r.sync_job_id) {
          await sb
            .from("remediation_queue")
            .update({ pm01_sync_job_id: r.sync_job_id, re_pushed_at: new Date().toISOString() })
            .in("inv_id", fixedIds);
        }
      } else {
        pm01 = { error: r.error ?? "unknown" };
      }
    } catch (e) {
      pm01 = { error: (e as Error).message };
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    fixed: fixedIds.length,
    manual_required: manualIds.length,
    failed: failedIds.length,
    fixed_ids: fixedIds.slice(0, 50),
    manual_ids: manualIds.slice(0, 50),
    failed_ids: failedIds.slice(0, 50),
    pm01,
    elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(1)),
  });
}
