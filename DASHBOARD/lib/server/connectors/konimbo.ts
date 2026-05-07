/**
 * Konimbo (HaContainer storefront) connector.
 *
 * TODO: confirm the four open questions against Konimbo developer docs
 * before going live —
 *   1. Exact product-create path (assumed `/v1/stores/{storeId}/products`).
 *   2. JSON shape for category mapping (free-text path? id?).
 *   3. Response field that returns the product id (assumed `id`).
 *   4. Whether stock count is set on create or via a follow-up endpoint.
 *
 * Reference: https://www.konimbo.co.il/developers (or whichever URL the
 * Konimbo docs land on).
 *
 * SERVER-ONLY. Reads env at call time so a fresh process picks up the
 * latest values.
 */
import type {
  Connector,
  ConnectorContext,
  ConnectorPreflight,
  ConnectorResult,
} from "./types";

const MAX_RETRY_AFTER_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const trim = (v: string | undefined | null) => (v ?? "").trim();

interface KonimboEnv {
  apiKey: string;
  baseUrl: string;
  storeId: string;
  missing: string[];
}

const readEnv = (): KonimboEnv => {
  const apiKey = trim(process.env.KONIMBO_API_KEY);
  const baseUrl = trim(process.env.KONIMBO_BASE_URL) || "https://api.konimbo.co.il";
  const storeId = trim(process.env.KONIMBO_STORE_ID);
  const missing: string[] = [];
  if (!apiKey) missing.push("KONIMBO_API_KEY");
  if (!storeId) missing.push("KONIMBO_STORE_ID");
  return { apiKey, baseUrl, storeId, missing };
};

const buildBody = (ctx: ConnectorContext) => {
  const p = ctx.productInput;
  return {
    title: p.name_he,
    description: p.description_he,
    sku: p.sku,
    ean: p.ean ?? undefined,
    price: p.price,
    images: p.images.map((img) => img.url),
    category: p.category_label || p.sp_category_code,
    stock: 1000,
    brand: p.brand,
    technical_specs: p.technical_specs ?? {},
  };
};

export const konimboConnector: Connector = {
  id: "konimbo",
  enabled: true,

  async preflight(ctx: ConnectorContext): Promise<ConnectorPreflight> {
    const env = readEnv();
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (env.missing.length > 0) {
      blockers.push(`Konimbo: ${env.missing.join(", ")} לא מוגדרים`);
    }
    const p = ctx.productInput;
    if (!p.name_he?.trim()) blockers.push("Konimbo: שם מוצר חסר");
    if (!p.sku?.trim()) blockers.push("Konimbo: SKU חסר");
    if (!p.images?.length) blockers.push("Konimbo: נדרשת לפחות תמונה אחת");
    if (!(p.price > 0)) blockers.push("Konimbo: מחיר חייב להיות חיובי");
    if (!p.sp_category_code) blockers.push("Konimbo: קטגוריה חסרה");

    return { willPush: blockers.length === 0, blockers, warnings };
  },

  async pushProduct(ctx: ConnectorContext): Promise<ConnectorResult> {
    const env = readEnv();
    if (env.missing.length > 0) {
      return {
        ok: false,
        status: "failed",
        error: {
          code: "konimbo_env_missing",
          message: `Konimbo env missing: ${env.missing.join(", ")}`,
        },
      };
    }

    const url = `${env.baseUrl}/v1/stores/${env.storeId}/products`;
    const idempotencyKey = `${ctx.jobId}-konimbo`;
    const body = buildBody(ctx);

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.apiKey}`,
            Accept: "application/json",
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(body),
        });

        if ((res.status === 429 || res.status === 503) && attempt < 3) {
          const ra = Number(res.headers.get("retry-after") ?? 5);
          const wait = Math.min(
            (Number.isFinite(ra) && ra > 0 ? ra : 5) * 1000,
            MAX_RETRY_AFTER_MS,
          );
          await sleep(wait);
          continue;
        }

        if (!res.ok) {
          const text = (await res.text()).slice(0, 500);
          return {
            ok: false,
            status: "failed",
            error: {
              code: `konimbo_http_${res.status}`,
              message: `Konimbo ${res.status}: ${text}`,
            },
          };
        }

        const json = (await res.json()) as {
          id?: string | number;
          product?: { id?: string | number; url?: string };
          url?: string;
        };
        const externalId = String(
          json.id ?? json.product?.id ?? "",
        ).trim();
        const externalUrl = (json.url ?? json.product?.url ?? undefined) || undefined;

        if (!externalId) {
          return {
            ok: false,
            status: "failed",
            error: {
              code: "konimbo_no_id_in_response",
              message: "Konimbo החזיר תשובה ללא product id — בדוק את שדה ה-response",
            },
          };
        }

        return {
          ok: true,
          status: "success",
          externalId,
          externalUrl,
        };
      } catch (e) {
        if (attempt === 3) {
          return {
            ok: false,
            status: "failed",
            error: {
              code: "konimbo_network",
              message: `Konimbo network: ${(e as Error).message}`,
            },
          };
        }
        await sleep(1000 * (attempt + 1));
      }
    }

    return {
      ok: false,
      status: "failed",
      error: { code: "konimbo_exhausted", message: "Konimbo: exhausted retries" },
    };
  },
};
