/**
 * POST /api/sync/superpharm/check
 *
 * Polls every sync_jobs row in status='pending_mirakl' against Mirakl's
 * /api/offers/imports/{import_id} endpoint and reconciles local bookkeeping:
 *
 *   - Mirakl status PENDING/RUNNING/QUEUED → leave as 'pending_mirakl'
 *   - Mirakl status COMPLETE
 *       lines_in_success > 0  → mark accepted offers as 'pending' in
 *                                 channel_listings, promote pilot_status to
 *                                 'uploaded'.
 *       lines_in_error > 0    → fetch error_report, attach error_message to
 *                                 channel_listings.attributes, mark as
 *                                 'rejected', roll pilot_status back to NULL.
 *       sync_jobs.status      → 'done' (mixed counts still 'done' so the job
 *                                 doesn't retry; per-row state is the source
 *                                 of truth).
 *   - Mirakl status FAILED → sync_jobs.status='failed', all listings rejected.
 *
 * Idempotent: rerunning on a 'done' job is a no-op (filter excludes them).
 */
import { NextResponse } from "next/server";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface MiraklImportStatus {
  import_id: number;
  status: "PENDING" | "QUEUED" | "RUNNING" | "COMPLETE" | "FAILED" | string;
  lines_in_success: number;
  lines_in_error: number;
  lines_in_pending?: number;
  has_error_report?: boolean;
}

interface ErrorReportRow {
  sku: string;
  product_id?: string;
  error_line?: string;
  error_message?: string;
}

const fetchImportStatus = async (importId: number): Promise<MiraklImportStatus | null> => {
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) throw new Error("MIRAKL_API_KEY not set");
  const res = await fetch(`${base}/api/offers/imports/${importId}`, {
    headers: { Authorization: key, Accept: "application/json" },
  });
  if (!res.ok) return null;
  return (await res.json()) as MiraklImportStatus;
};

/** Parse Mirakl's semicolon-separated CSV error report into per-SKU rows. */
const fetchErrorReport = async (importId: number): Promise<ErrorReportRow[]> => {
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) return [];
  const res = await fetch(`${base}/api/offers/imports/${importId}/error_report`, {
    headers: { Authorization: key, Accept: "text/csv" },
  });
  if (!res.ok) return [];
  const csv = await res.text();
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = parseSemiCsvRow(lines[0]).map((h) => h.toLowerCase());
  const skuIdx = header.indexOf("sku");
  const pidIdx = header.indexOf("product-id");
  const lineIdx = header.indexOf("error-line");
  const msgIdx = header.indexOf("error-message");
  const out: ErrorReportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseSemiCsvRow(lines[i]);
    out.push({
      sku: cols[skuIdx] ?? "",
      product_id: cols[pidIdx] ?? "",
      error_line: cols[lineIdx] ?? "",
      error_message: cols[msgIdx] ?? "",
    });
  }
  return out;
};

/** Mirakl error CSV uses ; as field sep and " for quoting (with "" escapes). */
const parseSemiCsvRow = (line: string): string[] => {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ";") {
        out.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
};

/** Pull inv_id out of "inv:1234" (sku format used by push route). */
const skuToInvId = (sku: string): number | null => {
  const m = sku.match(/^inv:(\d+)$/);
  return m ? Number(m[1]) : null;
};

export async function POST(_req: Request) {
  const sb = getServiceClient();
  const t0 = Date.now();

  // 1. Pending jobs.
  const { data: jobs, error: jobsErr } = await sb
    .from("sync_jobs")
    .select("id, status, payload, created_at")
    .eq("type", "superpharm_of01")
    .in("status", ["pending_mirakl", "running"]); // include legacy 'running' rows
  if (jobsErr) {
    return NextResponse.json({ ok: false, error: jobsErr.message }, { status: 500 });
  }

  const summary: {
    job_id: string;
    import_id: number | null;
    mirakl_status: string;
    sync_status: string;
    success: number;
    errors: number;
    promoted_inv: number;
    rolled_back_inv: number;
  }[] = [];

  for (const job of jobs ?? []) {
    const payload = (job.payload ?? {}) as {
      import_id?: number;
      inv_ids?: number[];
      skus?: string[];
    };
    const importId = typeof payload.import_id === "number" ? payload.import_id : null;
    if (!importId) {
      await sb.from("sync_jobs").update({ status: "failed" }).eq("id", job.id);
      summary.push({
        job_id: job.id,
        import_id: null,
        mirakl_status: "n/a",
        sync_status: "failed",
        success: 0,
        errors: 0,
        promoted_inv: 0,
        rolled_back_inv: 0,
      });
      continue;
    }

    let status: MiraklImportStatus | null;
    try {
      status = await fetchImportStatus(importId);
    } catch (e) {
      summary.push({
        job_id: job.id,
        import_id: importId,
        mirakl_status: `fetch-error: ${(e as Error).message}`,
        sync_status: job.status,
        success: 0,
        errors: 0,
        promoted_inv: 0,
        rolled_back_inv: 0,
      });
      continue;
    }
    if (!status) {
      summary.push({
        job_id: job.id,
        import_id: importId,
        mirakl_status: "404",
        sync_status: job.status,
        success: 0,
        errors: 0,
        promoted_inv: 0,
        rolled_back_inv: 0,
      });
      continue;
    }

    if (status.status !== "COMPLETE" && status.status !== "FAILED") {
      summary.push({
        job_id: job.id,
        import_id: importId,
        mirakl_status: status.status,
        sync_status: job.status,
        success: status.lines_in_success,
        errors: status.lines_in_error,
        promoted_inv: 0,
        rolled_back_inv: 0,
      });
      continue;
    }

    // Resolve per-SKU outcomes via error report.
    const errorRows = status.has_error_report ? await fetchErrorReport(importId) : [];
    const erroredSkuToMsg = new Map<string, string>();
    for (const row of errorRows) {
      if (row.sku) erroredSkuToMsg.set(row.sku, row.error_message ?? "unknown");
    }

    const submittedSkus: string[] = payload.skus ?? [];
    const successSkus = submittedSkus.filter((s) => !erroredSkuToMsg.has(s));
    const successInvIds = successSkus
      .map(skuToInvId)
      .filter((n): n is number => n !== null);
    const erroredInvIds = Array.from(erroredSkuToMsg.keys())
      .map(skuToInvId)
      .filter((n): n is number => n !== null);

    // Promote successful listings.
    if (successInvIds.length > 0) {
      await sb
        .from("channel_listings")
        .update({ state: "pending" })
        .eq("channel", "superpharm")
        .in("product_id", successInvIds);
      await sb
        .from("inventory")
        .update({ pilot_status: "uploaded" })
        .in("id", successInvIds);
    }

    // Roll back rejected listings, attach the error message.
    let rolledBack = 0;
    for (const [sku, msg] of erroredSkuToMsg.entries()) {
      const invId = skuToInvId(sku);
      if (invId === null) continue;
      const { error: clErr } = await sb
        .from("channel_listings")
        .update({
          state: "rejected",
          attributes: {
            import_id: importId,
            mirakl_error: msg,
          },
        })
        .eq("channel", "superpharm")
        .eq("product_id", invId);
      if (clErr) {
        console.warn(`[check] channel_listings update failed: ${clErr.message}`);
      }
      rolledBack++;
    }
    if (erroredInvIds.length > 0) {
      // Roll inventory.pilot_status from 'uploading' back to NULL so user can
      // requeue after fixing the underlying issue (e.g. PM01 first).
      await sb
        .from("inventory")
        .update({ pilot_status: null })
        .in("id", erroredInvIds);
    }

    const finalStatus =
      status.status === "FAILED"
        ? "failed"
        : status.lines_in_success > 0
        ? "completed"
        : "failed";
    await sb
      .from("sync_jobs")
      .update({
        status: finalStatus,
        payload: {
          ...payload,
          mirakl_status: status.status,
          lines_in_success: status.lines_in_success,
          lines_in_error: status.lines_in_error,
          checked_at: new Date().toISOString(),
          per_sku_errors: Array.from(erroredSkuToMsg.entries()).map(([sku, msg]) => ({
            sku,
            error: msg,
          })),
        },
      })
      .eq("id", job.id);

    summary.push({
      job_id: job.id,
      import_id: importId,
      mirakl_status: status.status,
      sync_status: finalStatus,
      success: status.lines_in_success,
      errors: status.lines_in_error,
      promoted_inv: successInvIds.length,
      rolled_back_inv: rolledBack,
    });
  }

  return NextResponse.json({
    ok: true,
    checked: summary.length,
    summary,
    elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(2)),
  });
}
