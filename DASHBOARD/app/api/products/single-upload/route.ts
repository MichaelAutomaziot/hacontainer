/**
 * Single-product upload orchestrator.
 *
 * POST /api/products/single-upload
 *   body: ProductInput (see lib/shared/single-product-schema.ts)
 *
 * Order of execution:
 *   1. Validate Zod + cross-field business rules (defense in depth).
 *   2. Insert inventory row with pilot_status='draft'.
 *   3. Run connectors[] sequentially: konimbo → superpharm.
 *   4. After Konimbo success, persist hacontainer_id/url + flip
 *      pilot_status='catalog_pushed'.
 *   5. Super-Pharm step calls dispatchPm01 — that function itself
 *      writes the sync_jobs row and flips pilot_status='pending_catalog'.
 *   6. Persist orchestrator result to sync_jobs(type='single_upload').
 *
 * Returns 200 with per-connector status even on partial failure so the
 * client can render a precise progress dialog. The HTTP code is reserved
 * for transport-level / schema-level errors (400, 422).
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  productInputSchema,
  validateBusinessRules,
  type ProductInput,
} from "@/lib/shared/single-product-schema";
import { konimboConnector } from "@/lib/server/connectors/konimbo";
import { superpharmConnector } from "@/lib/server/connectors/superpharm";
import type {
  Connector,
  ConnectorContext,
  ConnectorResult,
} from "@/lib/server/connectors/types";
import { getServiceClient } from "@/utils/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const CONNECTORS: Connector[] = [konimboConnector, superpharmConnector];

interface OrchestratorPerConnector {
  id: Connector["id"];
  status: ConnectorResult["status"];
  externalId?: string;
  externalUrl?: string;
  error?: { code: string; message: string };
  warnings?: string[];
}

const insertInventoryRow = async (
  sb: SupabaseClient,
  input: ProductInput,
): Promise<{ id: number } | { error: string }> => {
  const row = {
    name_he: input.name_he.trim(),
    description_he: input.description_he.trim(),
    ean: input.ean ?? null,
    sku: input.sku.trim(),
    brand: input.brand.trim(),
    category: input.category_label?.trim() ?? null,
    category_id: input.category_id ?? null,
    images: input.images.map((i) => i.url),
    technical_specs: input.technical_specs ?? {},
    price: input.price,
    pickup_cost: input.pickup_cost ?? 0,
    pilot_status: "draft",
    in_stock: true,
  };
  const { data, error } = await sb
    .from("inventory")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "insert returned no row" };
  return { id: data.id as number };
};

const persistKonimboLink = async (
  sb: SupabaseClient,
  inventoryId: number,
  externalId: string,
  externalUrl: string | undefined,
) => {
  const update: Record<string, unknown> = {
    hacontainer_id: externalId,
    pilot_status: "catalog_pushed",
  };
  if (externalUrl) update.hacontainer_url = externalUrl;
  const { error } = await sb.from("inventory").update(update).eq("id", inventoryId);
  if (error) {
    console.warn(
      `[single-upload] inv:${inventoryId} hacontainer link update: ${error.message}`,
    );
  }
};

const writeSyncJob = async (
  sb: SupabaseClient,
  jobId: string,
  inventoryId: number | null,
  status: "running" | "completed" | "failed",
  payload: Record<string, unknown>,
): Promise<void> => {
  const row = {
    id: jobId,
    type: "single_upload",
    status,
    payload: { inventory_id: inventoryId, ...payload },
  };
  const { error } = await sb.from("sync_jobs").upsert(row, { onConflict: "id" });
  if (error) {
    console.warn(`[single-upload] sync_jobs ${status} write: ${error.message}`);
  }
};

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = productInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, validation: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const rules = validateBusinessRules(parsed.data);
  if (!rules.ok) {
    return NextResponse.json(
      {
        ok: false,
        rules: { ok: false, blockers: rules.blockers, warnings: rules.warnings },
      },
      { status: 422 },
    );
  }

  const importType = rules.derived.import_type ?? "official";
  const sb = getServiceClient();
  const jobId = randomUUID();

  // 1. Insert inventory row.
  const inserted = await insertInventoryRow(sb, parsed.data);
  if ("error" in inserted) {
    return NextResponse.json(
      {
        ok: false,
        error: `inventory insert: ${inserted.error}`,
      },
      { status: 500 },
    );
  }
  const inventoryId = inserted.id;

  await writeSyncJob(sb, jobId, inventoryId, "running", {
    importType,
    derived: rules.derived,
    warnings: rules.warnings,
  });

  // 2. Iterate connectors.
  const perConnector: OrchestratorPerConnector[] = [];
  for (const c of CONNECTORS) {
    if (!c.enabled) {
      perConnector.push({ id: c.id, status: "skipped" });
      continue;
    }

    const ctx: ConnectorContext = {
      inventoryId,
      productInput: parsed.data,
      serviceClient: sb,
      jobId,
      importType,
    };

    let result: ConnectorResult;
    try {
      result = await c.pushProduct(ctx);
    } catch (e) {
      result = {
        ok: false,
        status: "failed",
        error: { code: `${c.id}_throw`, message: (e as Error).message },
      };
    }

    perConnector.push({
      id: c.id,
      status: result.status,
      externalId: result.externalId,
      externalUrl: result.externalUrl,
      error: result.error,
      warnings: result.warnings,
    });

    if (c.id === "konimbo" && result.ok && result.externalId) {
      await persistKonimboLink(sb, inventoryId, result.externalId, result.externalUrl);
    }

    // If a critical upstream step (Konimbo) fails, skip downstream
    // connectors that depend on hacontainer_id existing.
    if (c.id === "konimbo" && !result.ok) {
      perConnector.push({
        id: "superpharm",
        status: "skipped",
        warnings: ["Skipped because Konimbo step failed — hacontainer_id is required"],
      });
      break;
    }
  }

  const allOk = perConnector.every((p) => p.status === "success" || p.status === "pm01_dispatched");
  await writeSyncJob(sb, jobId, inventoryId, allOk ? "completed" : "failed", {
    importType,
    derived: rules.derived,
    warnings: rules.warnings,
    perConnector,
  });

  return NextResponse.json({
    ok: allOk,
    inventoryId,
    jobId,
    perConnector,
    rules: { warnings: rules.warnings, derived: rules.derived },
  });
}
