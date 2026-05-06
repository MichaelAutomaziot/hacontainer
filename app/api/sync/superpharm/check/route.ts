/**
 * POST /api/sync/superpharm/check
 *
 * Polls Mirakl for any sync_jobs row in 'pending_mirakl' (or legacy 'running')
 * status and reconciles local bookkeeping. Handles both job types:
 *
 *   superpharm_pm01 (product create / update)
 *     /api/products/imports/{id} returns import_status (PENDING|SENT|COMPLETE|
 *       WAITING_HOST|FAILED) and integration_details.{products_successfully_
 *       synchronized, invalid_products, rejected_products}.
 *     transformation_error_report carries per-row rejection reasons.
 *     On success → mark inventory.pilot_status='catalog_synced' and trigger an
 *       OF01 push for the same inv ids by inserting a new sync_jobs row that
 *       /push will pick up next time, OR by directly invoking the OF01 push
 *       handler. We use the direct-invoke path so the user only needs to call
 *       /check once.
 *
 *   superpharm_of01 (offer create)
 *     /api/offers/imports/{id} returns status (PENDING|RUNNING|QUEUED|COMPLETE
 *       |FAILED) and lines_in_success / lines_in_error.
 *     error_report carries per-SKU rejection reasons.
 *     On success → state='pending', pilot_status='uploaded'. On failure →
 *       state='rejected', pilot_status=NULL, error attached to attributes.
 *
 * Idempotent: rerunning on a 'completed'/'failed' job is a no-op.
 */
import { NextResponse } from "next/server";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface OfferImportStatus {
  import_id: number;
  status: "PENDING" | "QUEUED" | "RUNNING" | "COMPLETE" | "FAILED" | string;
  lines_in_success: number;
  lines_in_error: number;
  has_error_report?: boolean;
}

interface ProductImportStatus {
  import_id: number;
  import_status: "PENDING" | "SENT" | "COMPLETE" | "WAITING_HOST" | "FAILED" | string;
  has_transformation_error_report?: boolean;
  has_error_report?: boolean;
  transform_lines_in_success?: number;
  transform_lines_in_error?: number;
  integration_details?: {
    products_successfully_synchronized?: number;
    invalid_products?: number;
    rejected_products?: number;
    products_with_synchronization_issues?: number;
    products_with_wrong_identifiers?: number;
  };
}

interface ErrorReportRow {
  sku: string;
  error_message?: string;
}

const fetchOfferStatus = async (importId: number): Promise<OfferImportStatus | null> => {
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) throw new Error("MIRAKL_API_KEY not set");
  const res = await fetch(`${base}/api/offers/imports/${importId}`, {
    headers: { Authorization: key, Accept: "application/json" },
  });
  if (!res.ok) return null;
  return (await res.json()) as OfferImportStatus;
};

const fetchProductStatus = async (importId: number): Promise<ProductImportStatus | null> => {
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) throw new Error("MIRAKL_API_KEY not set");
  const res = await fetch(`${base}/api/products/imports/${importId}`, {
    headers: { Authorization: key, Accept: "application/json" },
  });
  if (!res.ok) return null;
  return (await res.json()) as ProductImportStatus;
};

const fetchOfferErrorReport = async (importId: number): Promise<ErrorReportRow[]> => {
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) return [];
  const res = await fetch(`${base}/api/offers/imports/${importId}/error_report`, {
    headers: { Authorization: key, Accept: "text/csv" },
  });
  if (!res.ok) return [];
  return parseSemiCsv(await res.text(), { skuCol: "sku", msgCol: "error-message" });
};

const fetchProductErrorReport = async (importId: number): Promise<ErrorReportRow[]> => {
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) return [];
  const res = await fetch(`${base}/api/products/imports/${importId}/transformation_error_report`, {
    headers: { Authorization: key, Accept: "text/csv" },
  });
  if (!res.ok) return [];
  return parseSemiCsv(await res.text(), { skuCol: "shop_sku", msgCol: "errors" });
};

const parseSemiCsv = (
  csv: string,
  cols: { skuCol: string; msgCol: string }
): ErrorReportRow[] => {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = parseSemiRow(lines[0]).map((h) => h.toLowerCase());
  const skuIdx = header.indexOf(cols.skuCol);
  const altSkuIdx = skuIdx === -1 ? header.indexOf("sku") : skuIdx;
  const msgIdx = header.indexOf(cols.msgCol);
  const out: ErrorReportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseSemiRow(lines[i]);
    out.push({
      sku: row[altSkuIdx] ?? "",
      error_message: row[msgIdx] ?? "",
    });
  }
  return out;
};

const parseSemiRow = (line: string): string[] => {
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

const skuToInvId = (sku: string): number | null => {
  const m = sku.match(/^inv:(\d+)$/);
  return m ? Number(m[1]) : null;
};

interface OF01Payload {
  import_id?: number;
  inv_ids?: number[];
  skus?: string[];
}
interface PM01Payload extends OF01Payload {
  /** Set once the chained OF01 push is queued, to avoid double-firing. */
  of01_chained?: boolean;
}

type SyncJob = {
  id: string;
  type: "superpharm_of01" | "superpharm_pm01" | string;
  status: string;
  payload: PM01Payload | OF01Payload | null;
  created_at: string;
};

interface CheckSummary {
  job_id: string;
  job_type: string;
  import_id: number | null;
  mirakl_status: string;
  sync_status: string;
  success: number;
  errors: number;
  promoted_inv: number;
  rolled_back_inv: number;
  chained_of01_job_id?: string;
}

/* ----- OF01 reconciliation ----- */
const reconcileOF01 = async (
  sb: ReturnType<typeof getServiceClient>,
  job: SyncJob,
  importId: number
): Promise<CheckSummary> => {
  const status = await fetchOfferStatus(importId);
  if (!status) {
    return {
      job_id: job.id,
      job_type: job.type,
      import_id: importId,
      mirakl_status: "404",
      sync_status: job.status,
      success: 0,
      errors: 0,
      promoted_inv: 0,
      rolled_back_inv: 0,
    };
  }
  if (status.status !== "COMPLETE" && status.status !== "FAILED") {
    return {
      job_id: job.id,
      job_type: job.type,
      import_id: importId,
      mirakl_status: status.status,
      sync_status: job.status,
      success: status.lines_in_success ?? 0,
      errors: status.lines_in_error ?? 0,
      promoted_inv: 0,
      rolled_back_inv: 0,
    };
  }

  const errorRows = status.has_error_report ? await fetchOfferErrorReport(importId) : [];
  const erroredSkuToMsg = new Map<string, string>();
  for (const row of errorRows) {
    if (row.sku) erroredSkuToMsg.set(row.sku, row.error_message ?? "unknown");
  }

  const payload = (job.payload ?? {}) as OF01Payload;
  const submittedSkus: string[] = payload.skus ?? [];
  const successSkus = submittedSkus.filter((s) => !erroredSkuToMsg.has(s));
  const successInvIds = successSkus.map(skuToInvId).filter((n): n is number => n !== null);
  const erroredInvIds = Array.from(erroredSkuToMsg.keys())
    .map(skuToInvId)
    .filter((n): n is number => n !== null);

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

  let rolledBack = 0;
  for (const [sku, msg] of erroredSkuToMsg.entries()) {
    const invId = skuToInvId(sku);
    if (invId === null) continue;
    const { error: clErr } = await sb
      .from("channel_listings")
      .update({
        state: "rejected",
        attributes: { import_id: importId, mirakl_error: msg },
      })
      .eq("channel", "superpharm")
      .eq("product_id", invId);
    if (clErr) console.warn(`[check OF01] channel_listings update failed: ${clErr.message}`);
    rolledBack++;
  }
  if (erroredInvIds.length > 0) {
    await sb.from("inventory").update({ pilot_status: null }).in("id", erroredInvIds);
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

  return {
    job_id: job.id,
    job_type: job.type,
    import_id: importId,
    mirakl_status: status.status,
    sync_status: finalStatus,
    success: status.lines_in_success ?? 0,
    errors: status.lines_in_error ?? 0,
    promoted_inv: successInvIds.length,
    rolled_back_inv: rolledBack,
  };
};

/* ----- PM01 reconciliation ----- */
const reconcilePM01 = async (
  sb: ReturnType<typeof getServiceClient>,
  job: SyncJob,
  importId: number,
  baseUrl: string
): Promise<CheckSummary> => {
  const status = await fetchProductStatus(importId);
  if (!status) {
    return {
      job_id: job.id,
      job_type: job.type,
      import_id: importId,
      mirakl_status: "404",
      sync_status: job.status,
      success: 0,
      errors: 0,
      promoted_inv: 0,
      rolled_back_inv: 0,
    };
  }

  // SP product imports go PENDING → SENT → WAITING_HOST → COMPLETE.
  // We treat anything other than COMPLETE/FAILED as still in flight.
  const inFlight = !["COMPLETE", "FAILED"].includes(status.import_status);
  const success = status.integration_details?.products_successfully_synchronized ?? 0;
  const transformErrors = status.transform_lines_in_error ?? 0;

  if (inFlight) {
    return {
      job_id: job.id,
      job_type: job.type,
      import_id: importId,
      mirakl_status: status.import_status,
      sync_status: job.status,
      success,
      errors: transformErrors,
      promoted_inv: 0,
      rolled_back_inv: 0,
    };
  }

  // Errored rows → harvest from transformation_error_report.
  const errorRows = status.has_transformation_error_report
    ? await fetchProductErrorReport(importId)
    : [];
  const erroredSkuToMsg = new Map<string, string>();
  for (const row of errorRows) {
    if (row.sku) erroredSkuToMsg.set(row.sku, row.error_message ?? "unknown");
  }

  const payload = (job.payload ?? {}) as PM01Payload;
  const submittedSkus: string[] = payload.skus ?? [];
  const successSkus = submittedSkus.filter((s) => !erroredSkuToMsg.has(s));
  const successInvIds = successSkus.map(skuToInvId).filter((n): n is number => n !== null);
  const erroredInvIds = Array.from(erroredSkuToMsg.keys())
    .map(skuToInvId)
    .filter((n): n is number => n !== null);

  // Promote successful PM01 lines: catalog_synced lets OF01 push pick them up.
  if (successInvIds.length > 0) {
    await sb
      .from("inventory")
      .update({ pilot_status: "catalog_synced" })
      .in("id", successInvIds);
  }
  // Errored: roll back to NULL with the reason exposed via audit log.
  if (erroredInvIds.length > 0) {
    await sb.from("inventory").update({ pilot_status: null }).in("id", erroredInvIds);
  }

  // Chain → OF01 push for the freshly cataloged ids.
  let chainedJobId: string | undefined;
  if (successInvIds.length > 0 && !payload.of01_chained) {
    try {
      const res = await fetch(`${baseUrl}/api/sync/superpharm/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "by_ids",
          ids: successInvIds,
          importType: "official",
          chained: true,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { sync_job_id?: string };
        chainedJobId = json.sync_job_id ?? undefined;
      } else {
        console.warn(`[check PM01] OF01 chain push HTTP ${res.status}`);
      }
    } catch (e) {
      console.warn(`[check PM01] OF01 chain push failed: ${(e as Error).message}`);
    }
  }

  const finalStatus = success > 0 ? "completed" : "failed";
  await sb
    .from("sync_jobs")
    .update({
      status: finalStatus,
      payload: {
        ...payload,
        mirakl_status: status.import_status,
        products_successfully_synchronized: success,
        transform_lines_in_error: transformErrors,
        checked_at: new Date().toISOString(),
        per_sku_errors: Array.from(erroredSkuToMsg.entries()).map(([sku, msg]) => ({
          sku,
          error: msg,
        })),
        of01_chained: !!chainedJobId,
        of01_chained_job_id: chainedJobId,
      },
    })
    .eq("id", job.id);

  return {
    job_id: job.id,
    job_type: job.type,
    import_id: importId,
    mirakl_status: status.import_status,
    sync_status: finalStatus,
    success,
    errors: transformErrors,
    promoted_inv: successInvIds.length,
    rolled_back_inv: erroredInvIds.length,
    chained_of01_job_id: chainedJobId,
  };
};

export async function POST(req: Request) {
  const sb = getServiceClient();
  const t0 = Date.now();

  // Resolve own origin so PM01 → OF01 chain hits the same deployment.
  let baseUrl: string;
  try {
    const u = new URL(req.url);
    baseUrl = u.host
      ? `${u.protocol}//${u.host}`
      : process.env.APP_BASE_URL?.replace(/\/$/, "") ??
        `${req.headers.get("x-forwarded-proto") ?? "http"}://${req.headers.get("host") ?? "localhost:3000"}`;
  } catch {
    baseUrl =
      process.env.APP_BASE_URL?.replace(/\/$/, "") ??
      `${req.headers.get("x-forwarded-proto") ?? "http"}://${req.headers.get("host") ?? "localhost:3000"}`;
  }

  const { data: jobs, error: jobsErr } = await sb
    .from("sync_jobs")
    .select("id, type, status, payload, created_at")
    .in("type", ["superpharm_of01", "superpharm_pm01"])
    .in("status", ["pending_mirakl", "running"]);
  if (jobsErr) {
    return NextResponse.json({ ok: false, error: jobsErr.message }, { status: 500 });
  }

  const summary: CheckSummary[] = [];

  for (const job of (jobs ?? []) as SyncJob[]) {
    const payload = (job.payload ?? {}) as OF01Payload;
    const importId = typeof payload.import_id === "number" ? payload.import_id : null;
    if (!importId) {
      await sb.from("sync_jobs").update({ status: "failed" }).eq("id", job.id);
      summary.push({
        job_id: job.id,
        job_type: job.type,
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
    try {
      if (job.type === "superpharm_pm01") {
        summary.push(await reconcilePM01(sb, job, importId, baseUrl));
      } else {
        summary.push(await reconcileOF01(sb, job, importId));
      }
    } catch (e) {
      summary.push({
        job_id: job.id,
        job_type: job.type,
        import_id: importId,
        mirakl_status: `error: ${(e as Error).message}`,
        sync_status: job.status,
        success: 0,
        errors: 0,
        promoted_inv: 0,
        rolled_back_inv: 0,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: summary.length,
    summary,
    elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(2)),
  });
}
