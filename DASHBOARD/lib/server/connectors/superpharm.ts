/**
 * Super-Pharm (Mirakl) connector.
 *
 * Wraps the existing `dispatchPm01` function so the orchestrator stays
 * Mirakl-agnostic. PM01 is the catalog/product create step; OF01 (offer
 * push) fires later via the existing `/api/sync/superpharm/check` poller.
 *
 * SERVER-ONLY.
 */
import { dispatchPm01 } from "@/lib/server/pm01-dispatch";
import { fetchBrandIndex, resolveBrandCode } from "@/lib/shared";
import type {
  Connector,
  ConnectorContext,
  ConnectorPreflight,
  ConnectorResult,
} from "./types";

const trim = (v: string | undefined | null) => (v ?? "").trim();

export const superpharmConnector: Connector = {
  id: "superpharm",
  enabled: true,

  async preflight(ctx: ConnectorContext): Promise<ConnectorPreflight> {
    const blockers: string[] = [];
    const warnings: string[] = [];

    const baseUrl = trim(process.env.MIRAKL_BASE_URL) || "https://superpharm-prod.mirakl.net";
    const apiKey = trim(process.env.MIRAKL_API_KEY);
    if (!apiKey) {
      blockers.push("Super-Pharm: MIRAKL_API_KEY לא מוגדר");
    }

    const p = ctx.productInput;
    if (!p.name_he?.trim()) blockers.push("Super-Pharm: שם מוצר חסר");
    if (!p.brand?.trim()) blockers.push("Super-Pharm: מותג חסר");
    if (!p.images?.length) blockers.push("Super-Pharm: נדרשת לפחות תמונה אחת");
    if (!p.sp_category_code) blockers.push("Super-Pharm: קטגוריה חסרה");

    // EAN: PM01 will auto-mint a 299-prefix internal EAN if missing — but
    // electronics MUST have a real EAN per Peri's rules. The schema layer
    // already enforces this; we surface a soft warning here for clarity.
    if (!p.ean) {
      warnings.push("Super-Pharm: ברקוד יוקצה אוטומטית (299-...) — לא מומלץ למוצרי חשמל");
    }

    // Brand resolution against Mirakl value-list. If we can't resolve,
    // PM01 will reject. Try only on real preflight (not a synthetic
    // negative inventoryId) to avoid hammering Mirakl during preview.
    if (apiKey && p.brand && ctx.inventoryId > 0) {
      try {
        const idx = await fetchBrandIndex(baseUrl, apiKey);
        const code = resolveBrandCode(p.brand, idx);
        if (!code) {
          blockers.push(
            `Super-Pharm: המותג "${p.brand}" לא נמצא במאגר המותגים של סופר-פארם`,
          );
        }
      } catch (e) {
        warnings.push(`Super-Pharm: בדיקת מותג נכשלה — ${(e as Error).message}`);
      }
    }

    // Category leaf check: Mirakl PM01 rejects non-leaf codes.
    if (p.sp_category_code) {
      const { data, error } = await ctx.serviceClient
        .from("categories")
        .select("sp_category_code, is_leaf")
        .eq("sp_category_code", p.sp_category_code)
        .maybeSingle();
      if (error) {
        warnings.push(`Super-Pharm: בדיקת קטגוריה נכשלה — ${error.message}`);
      } else if (!data) {
        blockers.push(`Super-Pharm: קוד קטגוריה ${p.sp_category_code} לא נמצא בטבלה`);
      } else if (!data.is_leaf) {
        blockers.push(
          `Super-Pharm: קוד הקטגוריה ${p.sp_category_code} אינו leaf — בחר קטגוריה תחתית`,
        );
      }
    }

    return { willPush: blockers.length === 0, blockers, warnings };
  },

  async pushProduct(ctx: ConnectorContext): Promise<ConnectorResult> {
    try {
      const r = await dispatchPm01({ mode: "by_ids", ids: [ctx.inventoryId], dry: false });
      if (!r.ok) {
        return {
          ok: false,
          status: "failed",
          error: {
            code: `pm01_${r.status ?? "fail"}`,
            message: r.error ?? "PM01 dispatch failed",
          },
        };
      }
      return {
        ok: true,
        status: "pm01_dispatched",
        externalId: String(r.import_id ?? ""),
        warnings: r.note ? [r.note] : undefined,
      };
    } catch (e) {
      return {
        ok: false,
        status: "failed",
        error: {
          code: "superpharm_throw",
          message: (e as Error).message,
        },
      };
    }
  },
};
