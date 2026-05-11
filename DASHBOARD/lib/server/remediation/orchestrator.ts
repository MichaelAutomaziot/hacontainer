/**
 * Per-inv_id remediation orchestrator. Reads all pending error rows for
 * the inv_id, dispatches the right fixer per error code, writes the
 * patched values back to inventory, and updates remediation_queue.
 *
 * The orchestrator is idempotent — re-running for an already-fixed
 * inv_id is a no-op (status='fixed' rows are skipped).
 */
import {
  cleanDescriptionForSp,
  ensureDescriptionForSp,
  sanitizeDescription,
  sanitizeName,
} from "@/lib/shared";
import { recoverImage } from "./image-fixer";
import { classifyByHeuristic } from "./category-heuristic";
import { extractMissingAttrs, type MissingAttr } from "./attr-fixer";
import { getServiceClient } from "@/utils/supabase/admin";

const IMAGE_ERROR_CODES = new Set([
  "MCM-05104",
  "MCM-05106",
  "invalid_main_image",
  "low_quality_image",
  "pic_ivnalid",
  "pic_invalid",
]);
const TEXT_ERROR_CODES = new Set(["temp_block"]);
const NAME_ERROR_CODES = new Set(["Site_Ex1"]);
const CATEGORY_ERROR_CODES = new Set(["wrong_category"]);
const ATTR_ERROR_CODES = new Set(["MCM-05000"]);

const norm = (code: string | null | undefined): string => {
  if (!code) return "";
  // Some error_code rows have ":" prefix junk like "wrong_category : ..."
  return code.split(":")[0].trim();
};

interface QueueRow {
  id: string;
  inv_id: number;
  shop_sku: string;
  error_code: string;
  error_message: string | null;
  attribute_codes: string | null;
  status: string;
}

interface InvRow {
  id: number;
  name_he: string | null;
  description_he: string | null;
  brand: string | null;
  category: string | null;
  category_id: string | null;
  ean: string | null;
  images: string[] | null;
  hacontainer_url: string | null;
  technical_specs: Record<string, unknown> | null;
  original_image_url: string | null;
  processed_image_url: string | null;
}

export interface RemediateOneResult {
  inv_id: number;
  status: "fixed" | "manual_required" | "failed" | "skipped";
  fixers_run: string[];
  errors_addressed: string[];
  errors_unresolved: string[];
  log: Record<string, unknown>;
}

const SELECT_INV =
  "id, name_he, description_he, brand, category, category_id, ean, images, hacontainer_url, technical_specs, original_image_url, processed_image_url";

const fetchPending = async (
  inv_id: number
): Promise<QueueRow[]> => {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("remediation_queue")
    .select("id, inv_id, shop_sku, error_code, error_message, attribute_codes, status")
    .eq("inv_id", inv_id)
    .eq("status", "pending");
  if (error) throw new Error(`remediation_queue read: ${error.message}`);
  return (data ?? []) as QueueRow[];
};

const markQueue = async (
  ids: string[],
  status: "fixing" | "fixed" | "manual_required" | "failed",
  fixLog: unknown
): Promise<void> => {
  if (ids.length === 0) return;
  const sb = getServiceClient();
  const patch: Record<string, unknown> = { status, fix_log: fixLog };
  if (status === "fixed") patch.fixed_at = new Date().toISOString();
  await sb.from("remediation_queue").update(patch).in("id", ids);
};

export const remediateOne = async (
  inv_id: number
): Promise<RemediateOneResult> => {
  const sb = getServiceClient();
  const log: Record<string, unknown> = {};
  const fixers_run: string[] = [];
  const errors_addressed: string[] = [];
  const errors_unresolved: string[] = [];

  const queue = await fetchPending(inv_id);
  if (queue.length === 0) {
    return {
      inv_id,
      status: "skipped",
      fixers_run,
      errors_addressed,
      errors_unresolved,
      log: { reason: "no pending queue rows" },
    };
  }
  await markQueue(
    queue.map((q) => q.id),
    "fixing",
    {}
  );

  const { data: invData, error: invErr } = await sb
    .from("inventory")
    .select(SELECT_INV)
    .eq("id", inv_id)
    .maybeSingle();
  if (invErr || !invData) {
    await markQueue(queue.map((q) => q.id), "failed", { reason: invErr?.message ?? "inv not found" });
    return {
      inv_id,
      status: "failed",
      fixers_run,
      errors_addressed,
      errors_unresolved: queue.map((q) => q.error_code),
      log: { inv_lookup_error: invErr?.message ?? "not found" },
    };
  }
  const inv = invData as unknown as InvRow;

  const codes = new Set(queue.map((q) => norm(q.error_code)));
  const patch: Record<string, unknown> = {};
  let needsManual = false;

  // 1. Image fixer.
  if (Array.from(IMAGE_ERROR_CODES).some((c) => codes.has(c))) {
    fixers_run.push("image");
    // Storage filename uses EAN when present, else falls back to inv-<id>.
    const fileKey = (inv.ean ?? "").trim() || `inv-${inv.id}`;
    const r = await recoverImage(
      {
        ean: fileKey,
        images: inv.images,
        hacontainer_url: inv.hacontainer_url,
        name_he: inv.name_he,
      },
      { forceBgRemove: codes.has("invalid_main_image") }
    );
    log.image = {
      ok: r.ok,
      error: r.error,
      log: r.log,
      newUrl: r.newUrl,
      used_placeholder: r.used_placeholder ?? false,
    };
    if (r.ok && r.newUrl) {
      const nextImages = [r.newUrl, ...((inv.images ?? []).filter((u) => u !== r.newUrl))];
      patch.images = nextImages;
      patch.original_image_url = inv.original_image_url ?? inv.images?.[0] ?? null;
      patch.processed_image_url = r.newUrl;
      // Address the queue rows. Placeholder-only fixes still address
      // the CSV-level error (so PM01 passes), but the inv_id stays
      // flagged via inventory.remediation_status='partial' for human review.
      for (const c of IMAGE_ERROR_CODES) if (codes.has(c)) errors_addressed.push(c);
      if (r.used_placeholder) needsManual = true;
    } else {
      needsManual = true;
      for (const c of IMAGE_ERROR_CODES) if (codes.has(c)) errors_unresolved.push(c);
    }
  }

  // 2. Description sanitiser. Falls back to a synthetic name+brand
  //     description when sanitisation strips everything (otherwise PM01
  //     rejects with "description is required").
  if (Array.from(TEXT_ERROR_CODES).some((c) => codes.has(c))) {
    fixers_run.push("description");
    const sanitised = sanitizeDescription(inv.description_he ?? "");
    const final = ensureDescriptionForSp(
      sanitised.text,
      inv.name_he,
      inv.brand
    );
    log.description = {
      stripped: sanitised.stripped,
      length_before: (inv.description_he ?? "").length,
      length_after: final.length,
      used_synthetic: final.length > 0 && sanitised.text.trim().length < 10,
    };
    patch.description_he = final;
    for (const c of TEXT_ERROR_CODES) if (codes.has(c)) errors_addressed.push(c);
  }

  // 3. Name fixer.
  if (Array.from(NAME_ERROR_CODES).some((c) => codes.has(c))) {
    fixers_run.push("name");
    const cleaned = sanitizeName(inv.name_he ?? "");
    log.name = { before: inv.name_he, after: cleaned };
    if (cleaned) {
      patch.name_he = cleaned;
      for (const c of NAME_ERROR_CODES) if (codes.has(c)) errors_addressed.push(c);
    } else {
      needsManual = true;
      for (const c of NAME_ERROR_CODES) if (codes.has(c)) errors_unresolved.push(c);
    }
  }

  // 4. Category re-classifier — local heuristic, no external LLM.
  if (Array.from(CATEGORY_ERROR_CODES).some((c) => codes.has(c))) {
    fixers_run.push("category");
    try {
      const cls = await classifyByHeuristic({
        name_he: inv.name_he ?? "",
        description_he: inv.description_he,
        brand: inv.brand,
        current_category_id: inv.category_id,
      });
      log.category = cls;
      if (cls.category_id && cls.confidence >= 0.7) {
        patch.category_id = cls.category_id;
        for (const c of CATEGORY_ERROR_CODES) if (codes.has(c)) errors_addressed.push(c);
      } else {
        needsManual = true;
        for (const c of CATEGORY_ERROR_CODES) if (codes.has(c)) errors_unresolved.push(c);
      }
    } catch (e) {
      log.category = { error: (e as Error).message };
      needsManual = true;
      for (const c of CATEGORY_ERROR_CODES) if (codes.has(c)) errors_unresolved.push(c);
    }
  }

  // 5. Attribute extractor.
  if (Array.from(ATTR_ERROR_CODES).some((c) => codes.has(c))) {
    fixers_run.push("attrs");
    // attribute_codes is comma-joined ("2054,2055,2056") when one PM01 row
    // failed multiple required-attribute checks. Split into individual specs.
    const missing: MissingAttr[] = [];
    for (const q of queue) {
      if (norm(q.error_code) !== "MCM-05000") continue;
      const codes = (q.attribute_codes ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const labelHint = q.error_message?.match(/'([^']+)'/)?.[1];
      for (const code of codes) {
        missing.push({ code, label: labelHint ?? code });
      }
    }
    if (missing.length > 0) {
      try {
        const r = await extractMissingAttrs(
          {
            name_he: inv.name_he ?? "",
            description_he: inv.description_he ?? "",
            brand: inv.brand,
          },
          missing
        );
        log.attrs = r;
        const merged = { ...(inv.technical_specs ?? {}), ...r.values };
        patch.technical_specs = merged;
        if (r.unresolved.length === 0) {
          for (const c of ATTR_ERROR_CODES) if (codes.has(c)) errors_addressed.push(c);
        } else {
          needsManual = true;
          for (const c of ATTR_ERROR_CODES) if (codes.has(c)) errors_unresolved.push(c);
        }
      } catch (e) {
        log.attrs = { error: (e as Error).message };
        needsManual = true;
      }
    }
  }

  if (Object.keys(patch).length > 0) {
    patch.remediation_status = needsManual ? "partial" : "fixed";
    const { error: upErr } = await sb.from("inventory").update(patch).eq("id", inv_id);
    if (upErr) {
      await markQueue(queue.map((q) => q.id), "failed", { ...log, inv_update_error: upErr.message });
      return {
        inv_id,
        status: "failed",
        fixers_run,
        errors_addressed,
        errors_unresolved: queue.map((q) => q.error_code),
        log,
      };
    }
  }

  const finalStatus: "fixed" | "manual_required" = needsManual ? "manual_required" : "fixed";
  await markQueue(queue.map((q) => q.id), finalStatus, log);
  return { inv_id, status: finalStatus, fixers_run, errors_addressed, errors_unresolved, log };
};

/** Drives remediateOne over many inv_ids with bounded concurrency. */
export const remediateMany = async (
  invIds: number[],
  concurrency = 4
): Promise<RemediateOneResult[]> => {
  const results: RemediateOneResult[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, invIds.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= invIds.length) return;
      try {
        const r = await remediateOne(invIds[idx]);
        results.push(r);
      } catch (e) {
        results.push({
          inv_id: invIds[idx],
          status: "failed",
          fixers_run: [],
          errors_addressed: [],
          errors_unresolved: [],
          log: { uncaught: (e as Error).message },
        });
      }
    }
  });
  await Promise.all(workers);
  return results;
};
