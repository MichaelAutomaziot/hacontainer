/**
 * Resolves a free-text brand string against the Mirakl
 * `brand-brand-values` value-list. Used by the single-product upload form
 * for real-time brand validation.
 *
 * GET /api/superpharm/brand-resolve?brand=Bosch → { ok, code, label }
 *
 * Cached at the value-list layer (`fetchBrandIndex`); the route itself is
 * cheap.
 */
import { NextResponse } from "next/server";
import { fetchBrandIndex, resolveBrandCode } from "@/lib/shared";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const brand = (url.searchParams.get("brand") ?? "").trim();
  if (!brand) {
    return NextResponse.json({ ok: false, error: "missing brand param" }, { status: 400 });
  }

  const base = (process.env.MIRAKL_BASE_URL ?? "").trim() || "https://superpharm-prod.mirakl.net";
  const key = (process.env.MIRAKL_API_KEY ?? "").trim();
  if (!key) {
    return NextResponse.json({ ok: false, error: "MIRAKL_API_KEY not set" }, { status: 500 });
  }

  try {
    const idx = await fetchBrandIndex(base, key);
    const code = resolveBrandCode(brand, idx);
    if (!code) {
      return NextResponse.json({
        ok: false,
        error: "brand not found",
        message: `המותג "${brand}" לא נמצא במאגר סופר-פארם`,
      });
    }
    return NextResponse.json({ ok: true, code, label: brand });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 502 },
    );
  }
}
