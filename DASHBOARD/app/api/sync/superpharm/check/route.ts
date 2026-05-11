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
import { classifyMiraklError } from "@/lib/server/remediation/error-classifier";
import { remediateMany } from "@/lib/server/remediation/orchestrator";
import { dispatchPm01 } from "@/lib/server/pm01-dispatch";

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
  has_new_product_report?: boolean;
  transform_lines_read?: number;
  transform_lines_in_success?: number;
  transform_lines_in_error?: number;
  integration_details?: {
    products_successfully_synchronized?: number;
    invalid_products?: number;
    rejected_products?: number;
    products_with_synchronization_issues?: number;
    products_with_wrong_identifiers?: number;
    products_not_accepted_in_time?: number;
    products_not_synchronized_in_time?: number;
  };
}

interface ErrorReportRow {
  sku: string;
  error_message?: string;
}

interface ErrorSample {
  message: string;
  count: number;
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

const fetchProductTransformationErrorReport = async (importId: number): Promise<ErrorReportRow[]> => {
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) return [];
  const res = await fetch(`${base}/api/products/imports/${importId}/transformation_error_report`, {
    headers: { Authorization: key, Accept: "text/csv" },
  });
  if (!res.ok) return [];
  return parseSemiCsv(await res.text(), { skuCol: "shop_sku", msgCol: "errors" });
};

const fetchProductErrorReport = async (importId: number): Promise<ErrorReportRow[]> => {
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) return [];
  const res = await fetch(`${base}/api/products/imports/${importId}/error_report`, {
    headers: { Authorization: key, Accept: "text/csv" },
  });
  if (!res.ok) return [];
  return parseSemiCsv(await res.text(), { skuCol: "shop_sku", msgCol: "errors" });
};

const fetchProductNewProductReport = async (importId: number): Promise<ErrorReportRow[]> => {
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) return [];
  const res = await fetch(`${base}/api/products/imports/${importId}/new_product_report`, {
    headers: { Authorization: key, Accept: "text/csv" },
  });
  if (!res.ok) return [];
  return parseSemiCsv(await res.text(), { skuCol: "shop_sku", msgCol: "errors" });
};

const parseSemiCsv = (
  csv: string,
  cols: { skuCol: string; msgCol: string }
): ErrorReportRow[] => {
  const parsed = parseDelimitedCsv(csv, ";");
  if (parsed.length < 2) return [];
  const header = parsed[0].map((h) => h.toLowerCase().trim());
  const skuIdx = header.indexOf(cols.skuCol);
  const altSkuIdx = skuIdx === -1 ? header.indexOf("sku") : skuIdx;
  const msgIdx = header.indexOf(cols.msgCol);
  const out: ErrorReportRow[] = [];
  if (altSkuIdx === -1) return out;
  for (let i = 1; i < parsed.length; i++) {
    const row = parsed[i];
    out.push({
      sku: row[altSkuIdx] ?? "",
      error_message: msgIdx === -1 ? "" : row[msgIdx] ?? "",
    });
  }
  return out;
};

const parseDelimitedCsv = (csv: string, sep: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (inQuotes) {
      if (c === '"' && csv[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === sep) {
        row.push(cur);
        cur = "";
      } else if (c === "\n") {
        row.push(cur.replace(/\r$/, ""));
        if (row.some((v) => v.trim().length > 0)) rows.push(row);
        row = [];
        cur = "";
      } else {
        cur += c;
      }
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur.replace(/\r$/, ""));
    if (row.some((v) => v.trim().length > 0)) rows.push(row);
  }
  return rows;
};

const topErrorSamples = (rows: ErrorReportRow[] | Array<{ error?: string | null }>): ErrorSample[] => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const message =
      "error_message" in row
        ? row.error_message?.trim()
        : "error" in row
          ? row.error?.trim()
          : "";
    if (!message) continue;
    counts.set(message, (counts.get(message) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([message, count]) => ({ message, count }));
};

const skuToInvId = (sku: string): number | null => {
  const m = sku.match(/^inv:(\d+)$/);
  return m ? Number(m[1]) : null;
};

const sumNumbers = (...values: Array<number | undefined | null>): number =>
  values.reduce<number>(
    (sum, value) => sum + (typeof value === "number" && Number.isFinite(value) ? value : 0),
    0
  );

const pm01FinalErrorCount = (status: ProductImportStatus): number =>
  sumNumbers(
    status.integration_details?.invalid_products,
    status.integration_details?.rejected_products,
    status.integration_details?.products_with_synchronization_issues,
    status.integration_details?.products_with_wrong_identifiers,
    status.integration_details?.products_not_accepted_in_time,
    status.integration_details?.products_not_synchronized_in_time
  );

const pm01VisibleSuccess = (status: ProductImportStatus): number =>
  status.integration_details?.products_successfully_synchronized ??
  status.transform_lines_in_success ??
  0;

const pm01VisibleErrors = (status: ProductImportStatus): number => {
  const finalErrors = pm01FinalErrorCount(status);
  if (status.integration_details && finalErrors > 0) return finalErrors;
  return status.transform_lines_in_error ?? 0;
};

interface OF01Payload {
  import_id?: number;
  inv_ids?: number[];
  skus?: string[];
  sku_count?: number;
  submitted_count?: number;
  lines_in_success?: number;
  lines_in_error?: number;
  mirakl_status?: string;
  failed_inv_ids?: number[];
  offer_success_inv_ids?: number[];
  per_sku_errors?: Array<{ sku: string; error: string }>;
}
interface PM01Payload extends OF01Payload {
  /** Set once the chained OF01 push is queued, to avoid double-firing. */
  of01_chained?: boolean;
  ready_for_offer_count?: number;
  ready_for_offer_inv_ids?: number[];
  catalog_synced_inv_ids?: number[];
  pm01_visible_success?: number;
  pm01_visible_errors?: number;
  products_successfully_synchronized?: number;
  transform_lines_in_error?: number;
  /** Set once the auto-remediation pass + PM01 retry has been kicked off,
   *  so a subsequent /check on the same job doesn't loop on it. */
  auto_remediated?: boolean;
  auto_remediated_fixed_count?: number;
  auto_remediated_pm01_job_id?: string | null;
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
  submitted?: number;
  success: number;
  errors: number;
  promoted_inv: number;
  rolled_back_inv: number;
  chained_of01_job_id?: string;
  ready_for_offer_count?: number;
  ready_for_offer_inv_ids?: number[];
  error_samples?: ErrorSample[];
  recent?: boolean;
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
      submitted: ((job.payload ?? {}) as OF01Payload).skus?.length,
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
  const expectedSuccess = status.lines_in_success ?? 0;
  let successSkus = submittedSkus.filter((s) => !erroredSkuToMsg.has(s));
  if (expectedSuccess === 0) {
    successSkus = [];
  } else if (successSkus.length > expectedSuccess) {
    successSkus = successSkus.slice(0, expectedSuccess);
  }
  const successSkuSet = new Set(successSkus);
  if (status.lines_in_error > erroredSkuToMsg.size) {
    const missingErrorSlots = status.lines_in_error - erroredSkuToMsg.size;
    const inferred = submittedSkus
      .filter((sku) => !successSkuSet.has(sku) && !erroredSkuToMsg.has(sku))
      .slice(0, missingErrorSlots);
    for (const sku of inferred) {
      erroredSkuToMsg.set(sku, "Mirakl rejected the offer; no row-level reason was returned");
    }
  }
  const successInvIds = successSkus.map(skuToInvId).filter((n): n is number => n !== null);
  const erroredInvIds = Array.from(erroredSkuToMsg.keys())
    .map(skuToInvId)
    .filter((n): n is number => n !== null);
  const errorSamples = topErrorSamples(errorRows);

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
        submitted_count: submittedSkus.length,
        offer_success_inv_ids: successInvIds,
        failed_inv_ids: erroredInvIds,
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
    submitted: submittedSkus.length,
    success: status.lines_in_success ?? 0,
    errors: status.lines_in_error ?? 0,
    promoted_inv: successInvIds.length,
    rolled_back_inv: rolledBack,
    error_samples: errorSamples,
  };
};

/* ----- PM01 reconciliation ----- */
const reconcilePM01 = async (
  sb: ReturnType<typeof getServiceClient>,
  job: SyncJob,
  importId: number,
  baseUrl: string,
  chainCookie: string
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
  const visibleSuccess = pm01VisibleSuccess(status);
  const visibleErrors = pm01VisibleErrors(status);
  const transformErrors = status.transform_lines_in_error ?? 0;

  if (inFlight) {
    const payload = (job.payload ?? {}) as PM01Payload;
    return {
      job_id: job.id,
      job_type: job.type,
      import_id: importId,
      mirakl_status: status.import_status,
      sync_status: job.status,
      submitted: payload.skus?.length ?? payload.inv_ids?.length,
      success: visibleSuccess,
      errors: visibleErrors,
      promoted_inv: 0,
      rolled_back_inv: 0,
    };
  }

  // Errored rows → harvest from transformation_error_report.
  const errorRows = [
    ...(status.has_transformation_error_report
      ? await fetchProductTransformationErrorReport(importId)
      : []),
    ...(status.has_error_report ? await fetchProductErrorReport(importId) : []),
  ];
  const erroredSkuToMsg = new Map<string, string>();
  for (const row of errorRows) {
    if (row.sku) erroredSkuToMsg.set(row.sku, row.error_message ?? "unknown");
  }

  // Auto-feed every errored row into remediation_queue. The orchestrator
  // is invoked below to fix what it can, then PM01 is re-pushed for the
  // freshly fixed inv_ids — closes the loop without manual XLSX ingest.
  const queueRows: Array<{
    inv_id: number;
    shop_sku: string;
    error_code: string;
    error_message: string;
    attribute_codes: string | null;
    source: string;
    status: string;
  }> = [];
  for (const [sku, msg] of erroredSkuToMsg.entries()) {
    const inv_id = skuToInvId(sku);
    if (inv_id === null) continue;
    const cls = classifyMiraklError(msg);
    if (!cls) continue;
    // OF_* codes are catalog-state issues handled by the OF01 retry path,
    // not by the remediation orchestrator. Skip.
    if (cls.error_code.startsWith("OF_")) continue;
    queueRows.push({
      inv_id,
      shop_sku: sku,
      error_code: cls.error_code,
      error_message: cls.message,
      attribute_codes: cls.attribute_codes ?? null,
      source: "check_route",
      status: "pending",
    });
  }
  if (queueRows.length > 0) {
    // Dedupe (inv_id, error_code) within this batch — multiple attribute-
    // code messages collapse so the upsert constraint holds.
    const dedup = new Map<string, (typeof queueRows)[number]>();
    for (const r of queueRows) {
      const key = `${r.inv_id}::${r.error_code}`;
      const existing = dedup.get(key);
      if (existing) {
        const merged = Array.from(
          new Set(
            [
              ...(existing.attribute_codes ?? "").split(","),
              ...(r.attribute_codes ?? "").split(","),
            ]
              .map((s) => s.trim())
              .filter(Boolean)
          )
        ).join(",");
        existing.attribute_codes = merged || null;
      } else {
        dedup.set(key, r);
      }
    }
    const upserts = Array.from(dedup.values());
    await sb
      .from("remediation_queue")
      .upsert(upserts, { onConflict: "inv_id,error_code", ignoreDuplicates: false });
  }

  const payload = (job.payload ?? {}) as PM01Payload;
  const submittedSkus: string[] = payload.skus ?? [];
  const newProductRows = status.has_new_product_report ? await fetchProductNewProductReport(importId) : [];
  const newProductSkus = new Set(newProductRows.map((row) => row.sku).filter(Boolean));
  const successSkus =
    newProductSkus.size > 0
      ? submittedSkus.filter((s) => newProductSkus.has(s))
      : submittedSkus.filter((s) => !erroredSkuToMsg.has(s));
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
        headers: { "Content-Type": "application/json", cookie: chainCookie },
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

  // Auto-remediate errored rows + re-dispatch PM01 for the freshly fixed
  // ones. Bounded to one self-heal per import to avoid loops; if errors
  // re-appear after remediation they'll be visible in remediation_queue
  // for the dashboard.
  let autoFixedCount = 0;
  let autoRemediatedJobId: string | undefined;
  if (erroredInvIds.length > 0 && !payload.auto_remediated) {
    try {
      const remediated = await remediateMany(
        Array.from(new Set(erroredInvIds)),
        4
      );
      const fixedIds = remediated
        .filter((r) => r.status === "fixed")
        .map((r) => r.inv_id);
      autoFixedCount = fixedIds.length;
      if (fixedIds.length > 0) {
        const r = await dispatchPm01({ mode: "by_ids", ids: fixedIds });
        if (r.ok && r.sync_job_id) {
          autoRemediatedJobId = r.sync_job_id;
          await sb
            .from("remediation_queue")
            .update({
              pm01_sync_job_id: r.sync_job_id,
              re_pushed_at: new Date().toISOString(),
            })
            .in("inv_id", fixedIds);
        }
      }
    } catch (e) {
      console.warn(`[check PM01] auto-remediate failed: ${(e as Error).message}`);
    }
  }

  const finalStatus = visibleSuccess > 0 ? "completed" : "failed";
  await sb
    .from("sync_jobs")
    .update({
      status: finalStatus,
      payload: {
        ...payload,
        mirakl_status: status.import_status,
        products_successfully_synchronized: status.integration_details?.products_successfully_synchronized ?? null,
        transform_lines_in_success: status.transform_lines_in_success ?? null,
        transform_lines_in_error: transformErrors,
        pm01_visible_success: visibleSuccess,
        pm01_visible_errors: visibleErrors,
        integration_details: status.integration_details ?? null,
        catalog_synced_inv_ids: successInvIds,
        failed_inv_ids: erroredInvIds,
        checked_at: new Date().toISOString(),
        per_sku_errors: Array.from(erroredSkuToMsg.entries()).map(([sku, msg]) => ({
          sku,
          error: msg,
        })),
        of01_chained: !!chainedJobId,
        of01_chained_job_id: chainedJobId,
        auto_remediated: erroredInvIds.length > 0,
        auto_remediated_fixed_count: autoFixedCount,
        auto_remediated_pm01_job_id: autoRemediatedJobId ?? null,
      },
    })
    .eq("id", job.id);

  return {
    job_id: job.id,
    job_type: job.type,
    import_id: importId,
    mirakl_status: status.import_status,
    sync_status: finalStatus,
    submitted: submittedSkus.length,
    success: visibleSuccess,
    errors: visibleErrors,
    promoted_inv: successInvIds.length,
    rolled_back_inv: erroredInvIds.length,
    chained_of01_job_id: chainedJobId,
    ready_for_offer_count: successInvIds.length,
    ready_for_offer_inv_ids: successInvIds,
  };
};

const summarizeStoredJob = (job: SyncJob): CheckSummary | null => {
  const payload = (job.payload ?? {}) as OF01Payload & PM01Payload;
  const importId = typeof payload.import_id === "number" ? payload.import_id : null;
  if (!importId) return null;
  const isPm01 = job.type === "superpharm_pm01";
  const success =
    payload.lines_in_success ??
    (typeof payload.pm01_visible_success === "number" ? payload.pm01_visible_success : undefined) ??
    (typeof payload.products_successfully_synchronized === "number"
      ? payload.products_successfully_synchronized
      : undefined) ??
    0;
  const errors =
    payload.lines_in_error ??
    (typeof payload.pm01_visible_errors === "number" ? payload.pm01_visible_errors : undefined) ??
    (typeof payload.transform_lines_in_error === "number" ? payload.transform_lines_in_error : undefined) ??
    0;
  const promoted =
    isPm01
      ? payload.catalog_synced_inv_ids?.length ?? payload.ready_for_offer_inv_ids?.length ?? 0
      : payload.offer_success_inv_ids?.length ?? success;
  const rolledBack =
    isPm01
      ? payload.failed_inv_ids?.length ?? 0
      : payload.failed_inv_ids?.length ?? errors;

  return {
    job_id: job.id,
    job_type: job.type,
    import_id: importId,
    mirakl_status:
      payload.mirakl_status ??
      (job.status === "completed" ? "COMPLETE" : job.status === "failed" ? "FAILED" : "RUNNING"),
    sync_status: job.status,
    submitted: payload.submitted_count ?? payload.sku_count ?? payload.skus?.length ?? payload.inv_ids?.length,
    success,
    errors,
    promoted_inv: promoted,
    rolled_back_inv: rolledBack,
    ready_for_offer_count:
      typeof payload.ready_for_offer_count === "number" ? payload.ready_for_offer_count : undefined,
    ready_for_offer_inv_ids: payload.ready_for_offer_inv_ids,
    error_samples: topErrorSamples(payload.per_sku_errors ?? []),
    recent: true,
  };
};

const fetchRecentSummaries = async (
  sb: ReturnType<typeof getServiceClient>,
  limit = 7
): Promise<CheckSummary[]> => {
  const { data: recentJobs } = await sb
    .from("sync_jobs")
    .select("id, type, status, payload, created_at")
    .in("type", ["superpharm_of01", "superpharm_pm01"])
    .in("status", ["running", "completed", "failed"])
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((recentJobs ?? []) as SyncJob[])
    .map((job) => summarizeStoredJob(job))
    .filter((item): item is CheckSummary => item !== null);
};

export async function GET() {
  const sb = getServiceClient();
  const summary = await fetchRecentSummaries(sb);
  return NextResponse.json({
    ok: true,
    checked: 0,
    summary,
  });
}

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
  // Forward the caller's auth cookie when chaining PM01 → OF01 via internal
  // self-fetch; middleware otherwise 307s the request to /login.
  const chainCookie = req.headers.get("cookie") ?? "";

  const { data: jobs, error: jobsErr } = await sb
    .from("sync_jobs")
    .select("id, type, status, payload, created_at")
    .in("type", ["superpharm_of01", "superpharm_pm01"])
    .eq("status", "running");
  if (jobsErr) {
    return NextResponse.json({ ok: false, error: jobsErr.message }, { status: 500 });
  }

  const summary: CheckSummary[] = [];
  const summarizedJobIds = new Set<string>();

  for (const job of (jobs ?? []) as SyncJob[]) {
    const payload = (job.payload ?? {}) as OF01Payload;
    const importId = typeof payload.import_id === "number" ? payload.import_id : null;
    if (!importId) {
      await sb.from("sync_jobs").update({ status: "failed" }).eq("id", job.id);
      summarizedJobIds.add(job.id);
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
        const item = await reconcilePM01(sb, job, importId, baseUrl, chainCookie);
        summarizedJobIds.add(job.id);
        summary.push(item);
      } else {
        const item = await reconcileOF01(sb, job, importId);
        summarizedJobIds.add(job.id);
        summary.push(item);
      }
    } catch (e) {
      summarizedJobIds.add(job.id);
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

  const recentSummaries = await fetchRecentSummaries(sb, 5);
  for (const item of recentSummaries) {
    if (summarizedJobIds.has(item.job_id)) continue;
    summary.push(item);
  }

  return NextResponse.json({
    ok: true,
    checked: (jobs ?? []).length,
    summary,
    elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(2)),
  });
}
