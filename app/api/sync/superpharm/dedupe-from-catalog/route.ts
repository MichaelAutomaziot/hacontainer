/**
 * POST /api/sync/superpharm/dedupe-from-catalog
 *
 * Reconciles "missing" verdicts against `superpharm_offers_raw` directly.
 *
 * Background:
 *   - Mirakl `/api/products` (Catalog API) returns 0 rows for our key — that
 *     endpoint is restricted to products belonging to this seller's shop and
 *     does NOT expose the consumer-facing SP catalog. Verified empirically on
 *     2026-05-07 with both env-configured key and a backup key the user
 *     provided: probing by EAN, SHOP_SKU, SUPPLIER, MPN, INTERNAL all return
 *     `{products:[], total_count:0}`.
 *   - Therefore the only ground-truth set we have is `superpharm_offers_raw`
 *     (rows pulled via OF21). For real false-positive cleanup we match against
 *     that set on TWO axes:
 *         (a) EAN exact (with non-empty EAN on both sides), OR
 *         (b) 100% normalized title === inventory.name_he
 *
 * Body (optional): { dry?: boolean, limit?: number }
 *   - dry=true: return counts; do not write.
 *   - limit:    cap candidate set (debug / progressive run).
 *
 * Effects:
 *   - catalog_matches.verdict      → 'duplicate'
 *   - catalog_matches.match_method → 'ean_exact' (EAN hit) or 'manual'
 *                                    (title hit; 'title_exact' isn't in the
 *                                    DB CHECK constraint, so we record the
 *                                    fact in `notes` instead)
 *   - catalog_matches.confidence   → 0.99
 *   - catalog_matches.notes        += "[dedupe …]"
 *   - inventory.pilot_status       → 'exists_in_sp' (only when current value
 *                                    is null/imported/draft, to avoid disturbing
 *                                    in-flight uploads)
 *   - sync_jobs row inserted (type='superpharm_offers_dedupe')
 */
import { NextResponse } from "next/server";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface RequestBody {
  dry?: boolean;
  limit?: number;
}

const normalizeTitle = (s: string | null | undefined): string => {
  if (!s) return "";
  return s.trim().replace(/\s+/g, " ").toLowerCase();
};

interface MissingRow {
  match_id: number;
  inventory_id: number;
  ean: string | null;
  norm_name: string;
}

interface SpOffer {
  offer_id: string;
  ean: string | null;
  norm_title: string;
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
  const dry = body.dry === true;

  // 1. Load all "missing" candidates with their inventory metadata.
  const candidates: MissingRow[] = [];
  {
    const PAGE = 1000;
    for (let offset = 0; offset < 50_000; offset += PAGE) {
      const { data, error } = await sb
        .from("catalog_matches")
        .select("id,inventory_id,inventory!inner(ean,name_he)")
        .eq("verdict", "missing")
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) {
        return NextResponse.json(
          { ok: false, error: `load missing: ${error.message}` },
          { status: 500 },
        );
      }
      const rows = (data ?? []) as Array<{
        id: number;
        inventory_id: number;
        inventory:
          | { ean: string | null; name_he: string | null }
          | { ean: string | null; name_he: string | null }[];
      }>;
      for (const r of rows) {
        const inv = Array.isArray(r.inventory) ? r.inventory[0] : r.inventory;
        if (!inv) continue;
        candidates.push({
          match_id: r.id,
          inventory_id: r.inventory_id,
          ean: inv.ean ? inv.ean.trim() : null,
          norm_name: normalizeTitle(inv.name_he),
        });
      }
      if (rows.length < PAGE) break;
    }
  }

  if (typeof body.limit === "number" && body.limit > 0) {
    candidates.length = Math.min(candidates.length, body.limit);
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      checked: 0,
      sp_offers_loaded: 0,
      flipped_by_ean: 0,
      flipped_by_title: 0,
      flipped_matches: 0,
      flipped_inventory: 0,
      dry,
      elapsed_s: (Date.now() - t0) / 1000,
    });
  }

  // 2. Load the entire active SP offer set into memory (only ~1700 rows).
  const offers: SpOffer[] = [];
  {
    const PAGE = 1000;
    for (let offset = 0; offset < 50_000; offset += PAGE) {
      const { data, error } = await sb
        .from("superpharm_offers_raw")
        .select("offer_id,ean,product_title,active")
        .eq("active", true)
        .order("offer_id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) {
        return NextResponse.json(
          { ok: false, error: `load SP offers: ${error.message}` },
          { status: 500 },
        );
      }
      const rows = (data ?? []) as Array<{
        offer_id: string;
        ean: string | null;
        product_title: string | null;
        active: boolean | null;
      }>;
      for (const r of rows) {
        offers.push({
          offer_id: r.offer_id,
          ean: r.ean ? r.ean.trim() : null,
          norm_title: normalizeTitle(r.product_title),
        });
      }
      if (rows.length < PAGE) break;
    }
  }

  // 3. Build lookup maps.
  const byEan = new Map<string, string>(); // ean → offer_id
  const byTitle = new Map<string, string>(); // norm_title → offer_id
  for (const o of offers) {
    if (o.ean && o.ean !== "") byEan.set(o.ean, o.offer_id);
    if (o.norm_title) byTitle.set(o.norm_title, o.offer_id);
  }

  // 4. Match each candidate. EAN takes priority over title.
  // catalog_matches.match_method has a CHECK constraint that allows:
  //   ean_exact, ean_unverified, sku_or_product_id, brand_model_fuzzy,
  //   weighted_fuzzy, title_embedding, manual, none.
  // 'title_exact' isn't in that set, so we map title hits → 'manual' and
  // preserve the actual axis in the `notes` column.
  type Hit = {
    match_id: number;
    inventory_id: number;
    sp_offer_id: string;
    method: "ean_exact" | "manual";
    axis: "ean_exact" | "title_exact";
  };
  const hits: Hit[] = [];
  let byEanCount = 0;
  let byTitleCount = 0;
  for (const c of candidates) {
    if (c.ean) {
      const off = byEan.get(c.ean);
      if (off) {
        hits.push({
          match_id: c.match_id,
          inventory_id: c.inventory_id,
          sp_offer_id: off,
          method: "ean_exact",
          axis: "ean_exact",
        });
        byEanCount++;
        continue;
      }
    }
    if (c.norm_name) {
      const off = byTitle.get(c.norm_name);
      if (off) {
        hits.push({
          match_id: c.match_id,
          inventory_id: c.inventory_id,
          sp_offer_id: off,
          method: "manual",
          axis: "title_exact",
        });
        byTitleCount++;
      }
    }
  }

  if (dry || hits.length === 0) {
    return NextResponse.json({
      ok: true,
      checked: candidates.length,
      sp_offers_loaded: offers.length,
      flipped_by_ean: byEanCount,
      flipped_by_title: byTitleCount,
      flipped_matches: hits.length,
      flipped_inventory: 0,
      dry,
      elapsed_s: (Date.now() - t0) / 1000,
    });
  }

  // 5. Update catalog_matches in chunks.
  const stamp = new Date().toISOString().slice(0, 10);
  let flippedMatches = 0;
  const W = 100;
  for (let i = 0; i < hits.length; i += W) {
    const slice = hits.slice(i, i + W);
    // Per-row update because we want to set superpharm_offer_id to each hit's
    // own value. Run in parallel to keep it fast at ~hundreds of rows.
    const results = await Promise.all(
      slice.map((h) =>
        sb
          .from("catalog_matches")
          .update({
            verdict: "duplicate",
            superpharm_offer_id: h.sp_offer_id,
            match_method: h.method,
            confidence: 0.99,
            notes: `[dedupe ${stamp}: matched by ${h.axis}]`,
          })
          .eq("id", h.match_id),
      ),
    );
    for (const r of results) {
      if (r.error) {
        return NextResponse.json(
          {
            ok: false,
            error: `update catalog_matches: ${r.error.message}`,
            partial: { flippedMatches },
          },
          { status: 500 },
        );
      }
    }
    flippedMatches += slice.length;
  }

  // 6. Bump inventory.pilot_status only for rows still pre-pipeline.
  let flippedInventory = 0;
  const invIds = Array.from(new Set(hits.map((h) => h.inventory_id)));
  for (let i = 0; i < invIds.length; i += 200) {
    const slice = invIds.slice(i, i + 200);
    const { count, error } = await sb
      .from("inventory")
      .update({ pilot_status: "exists_in_sp" }, { count: "exact" })
      .in("id", slice)
      .or("pilot_status.is.null,pilot_status.in.(imported,draft)");
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: `update inventory: ${error.message}`,
          partial: { flippedMatches, flippedInventory },
        },
        { status: 500 },
      );
    }
    flippedInventory += count ?? 0;
  }

  // 7. Audit row.
  await sb.from("sync_jobs").insert({
    type: "superpharm_offers_dedupe",
    status: "completed",
    payload: {
      checked: candidates.length,
      sp_offers_loaded: offers.length,
      flipped_by_ean: byEanCount,
      flipped_by_title: byTitleCount,
      flipped_matches: flippedMatches,
      flipped_inventory: flippedInventory,
      elapsed_s: (Date.now() - t0) / 1000,
    },
    completed_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    checked: candidates.length,
    sp_offers_loaded: offers.length,
    flipped_by_ean: byEanCount,
    flipped_by_title: byTitleCount,
    flipped_matches: flippedMatches,
    flipped_inventory: flippedInventory,
    dry: false,
    elapsed_s: (Date.now() - t0) / 1000,
  });
}
