/**
 * Dry-run preview for the single-product upload form.
 *
 * Same body shape as `/api/products/single-upload`. Runs Zod schema +
 * `validateBusinessRules` + each connector's `preflight` against a
 * synthetic ConnectorContext (negative inventoryId placeholder so
 * connectors know to skip live API calls where appropriate).
 *
 * No DB writes, no external POSTs. The form's "בדוק לפני שליחה" button
 * calls this; the result is timestamped client-side and the final
 * submit gate requires it to be <60 s old AND all enabled connectors
 * `willPush=true`.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  productInputSchema,
  validateBusinessRules,
} from "@/lib/shared/single-product-schema";
import { konimboConnector } from "@/lib/server/connectors/konimbo";
import { superpharmConnector } from "@/lib/server/connectors/superpharm";
import type { Connector, ConnectorContext } from "@/lib/server/connectors/types";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

const CONNECTORS: Connector[] = [konimboConnector, superpharmConnector];

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
      {
        ok: false,
        validation: parsed.error.flatten(),
      },
      { status: 422 },
    );
  }

  const rules = validateBusinessRules(parsed.data);
  const importType = rules.derived.import_type ?? "official";

  const ctx: ConnectorContext = {
    inventoryId: -1, // synthetic — connectors must skip live calls.
    productInput: parsed.data,
    serviceClient: getServiceClient(),
    jobId: randomUUID(),
    importType,
  };

  const perConnector: {
    id: Connector["id"];
    willPush: boolean;
    blockers: string[];
    warnings: string[];
  }[] = [];

  for (const c of CONNECTORS) {
    if (!c.enabled) {
      perConnector.push({ id: c.id, willPush: false, blockers: [`${c.id}: disabled`], warnings: [] });
      continue;
    }
    try {
      const r = await c.preflight(ctx);
      perConnector.push({ id: c.id, ...r });
    } catch (e) {
      perConnector.push({
        id: c.id,
        willPush: false,
        blockers: [`${c.id}: preflight threw — ${(e as Error).message}`],
        warnings: [],
      });
    }
  }

  const allWillPush = perConnector.every((c) => c.willPush);
  const ok = rules.ok && allWillPush;

  return NextResponse.json({
    ok,
    rules: {
      ok: rules.ok,
      blockers: rules.blockers,
      warnings: rules.warnings,
      derived: rules.derived,
    },
    perConnector,
  });
}
