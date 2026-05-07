import { NextResponse } from "next/server";
import { getServiceClient } from "@/utils/supabase/admin";
import { createSupabaseServerClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SimpleStatus = "uploaded" | "missing";
type PlatformStatus = "uploaded" | "missing" | "failed" | "needs_fix" | "in_progress";
type UploadBucket = "ready" | "needs_fix" | "failed" | "in_progress" | "uploaded";

interface InventoryRow {
  id: number;
  hacontainer_id: string | null;
  hacontainer_url: string | null;
  name_he: string | null;
  ean: string | null;
  brand: string | null;
  category: string | null;
  category_id: string | null;
  images: string[] | null;
  price: number | null;
  pickup_cost: number | null;
  pilot_status: string | null;
  in_stock: boolean | null;
}

interface MatchRow {
  id: number;
  inventory_id: number;
  verdict: string | null;
  superpharm_offer_id: string | null;
}

interface ListingRow {
  product_id: number;
  channel: string;
  state: string;
  last_error: string | null;
}

interface BoardProductRow {
  id: number;
  name: string | null;
  brand: string | null;
  category: string | null;
  ean: string | null;
  image: string | null;
  price: number | null;
  pickup_cost: number | null;
  hacontainer_url: string | null;
  pilot_status: string | null;
  match_verdict: string | null;
  source_status: SimpleStatus;
  superpharm_status: PlatformStatus;
  upload_bucket: UploadBucket;
  issues: string[];
  other_platforms: Array<{ channel: string; status: PlatformStatus }>;
}

const PAGE = 1000;
const UPLOADED_STATES = new Set(["active", "pending", "price_matched"]);
const FAILED_STATES = new Set(["rejected", "validation_failed"]);
const IN_PROGRESS_STATES = new Set(["submitted"]);
const IN_PROGRESS_PILOT = new Set(["pending_catalog", "catalog_synced", "uploading"]);
const READY_PILOT = new Set(["approved_for_pilot", "transformed"]);

const clamp = (n: number, min: number, max: number): number =>
  Math.min(Math.max(n, min), max);

const text = (v: string | null | undefined): string => (v ?? "").trim();

const statusFromListing = (state: string | null | undefined): PlatformStatus | null => {
  const s = text(state);
  if (!s) return null;
  if (FAILED_STATES.has(s)) return "failed";
  if (IN_PROGRESS_STATES.has(s)) return "in_progress";
  if (UPLOADED_STATES.has(s)) return "uploaded";
  return null;
};

const hasSourceProduct = (row: InventoryRow): boolean =>
  Boolean(text(row.hacontainer_id) || text(row.hacontainer_url));

const validationIssuesFor = (row: InventoryRow): string[] => {
  const issues: string[] = [];
  if (!hasSourceProduct(row)) issues.push("המוצר לא נמצא ב-HaContainer");
  if (!text(row.name_he)) issues.push("חסר שם מוצר");
  if (!text(row.brand)) issues.push("חסר מותג");
  if (!text(row.category) && !text(row.category_id)) issues.push("חסרה קטגוריה");
  if (!row.images || row.images.length === 0 || !text(row.images[0])) issues.push("חסרה תמונה");
  if (row.price == null || row.price <= 0) issues.push("חסר מחיר תקין");
  if (row.pickup_cost != null && row.pickup_cost < 0) issues.push("עלות איסוף לא תקינה");
  return issues;
};

const deriveSuperpharmStatus = (
  row: InventoryRow,
  match: MatchRow | undefined,
  listing: ListingRow | undefined,
  issues: string[],
): PlatformStatus => {
  const pilot = text(row.pilot_status);
  const listingStatus = statusFromListing(listing?.state);
  const verdict = text(match?.verdict);

  if (pilot === "rejected" || listingStatus === "failed") return "failed";
  if (pilot === "uploaded" || pilot === "exists_in_sp" || listingStatus === "uploaded" || verdict === "duplicate") {
    return "uploaded";
  }
  if (IN_PROGRESS_PILOT.has(pilot) || listingStatus === "in_progress") return "in_progress";
  if (issues.length > 0 || verdict === "candidate" || verdict === "manual_review" || pilot === "ignored") {
    return "needs_fix";
  }
  return "missing";
};

const uploadBucketFor = (status: PlatformStatus, row: InventoryRow, match: MatchRow | undefined): UploadBucket => {
  if (status === "uploaded") return "uploaded";
  if (status === "failed") return "failed";
  if (status === "in_progress") return "in_progress";
  if (status === "needs_fix") return "needs_fix";

  const verdict = text(match?.verdict);
  const pilot = text(row.pilot_status);
  if (verdict === "missing" || READY_PILOT.has(pilot) || pilot === "imported" || pilot === "draft" || !pilot) {
    return "ready";
  }
  return "needs_fix";
};

const loadAll = async <T,>(
  selectPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> => {
  const out: T[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await selectPage(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
};

const matchesSearch = (row: BoardProductRow, q: string): boolean => {
  if (!q) return true;
  const hay = `${row.name ?? ""} ${row.brand ?? ""} ${row.category ?? ""} ${row.ean ?? ""}`.toLowerCase();
  return hay.includes(q);
};

const sortForUpload = (a: BoardProductRow, b: BoardProductRow): number => {
  const order: Record<UploadBucket, number> = {
    ready: 0,
    needs_fix: 1,
    failed: 2,
    in_progress: 3,
    uploaded: 4,
  };
  return order[a.upload_bucket] - order[b.upload_bucket] || b.id - a.id;
};

export async function GET(req: Request) {
  const authClient = await createSupabaseServerClient();
  const { data: auth } = await authClient.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sb = getServiceClient();
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "upload" ? "upload" : "catalog";
  const q = text(url.searchParams.get("q")).toLowerCase();
  const page = clamp(Number(url.searchParams.get("page") ?? 1) || 1, 1, 10_000);
  const pageSize = clamp(Number(url.searchParams.get("pageSize") ?? 24) || 24, 1, 100);

  try {
    const [inventory, matches, listings] = await Promise.all([
      loadAll<InventoryRow>((from, to) =>
        sb
          .from("inventory")
          .select(
            "id,hacontainer_id,hacontainer_url,name_he,ean,brand,category,category_id,images,price,pickup_cost,pilot_status,in_stock",
          )
          .order("id", { ascending: false })
          .range(from, to),
      ),
      loadAll<MatchRow>((from, to) =>
        sb
          .from("catalog_matches")
          .select("id,inventory_id,verdict,superpharm_offer_id")
          .order("id", { ascending: false })
          .range(from, to),
      ),
      loadAll<ListingRow>((from, to) =>
        sb
          .from("channel_listings")
          .select("product_id,channel,state,last_error")
          .order("product_id", { ascending: true })
          .range(from, to),
      ),
    ]);

    const matchByInventory = new Map<number, MatchRow>();
    for (const match of matches) {
      if (!matchByInventory.has(match.inventory_id)) matchByInventory.set(match.inventory_id, match);
    }

    const listingsByProduct = new Map<number, ListingRow[]>();
    for (const listing of listings) {
      const arr = listingsByProduct.get(listing.product_id) ?? [];
      arr.push(listing);
      listingsByProduct.set(listing.product_id, arr);
    }

    const rows: BoardProductRow[] = inventory.map((row) => {
      const match = matchByInventory.get(row.id);
      const productListings = listingsByProduct.get(row.id) ?? [];
      const superpharmListing = productListings.find((l) => l.channel === "superpharm");
      const issues = validationIssuesFor(row);
      const sourceStatus: SimpleStatus = hasSourceProduct(row) ? "uploaded" : "missing";
      const superpharmStatus = deriveSuperpharmStatus(row, match, superpharmListing, issues);
      const uploadBucket = uploadBucketFor(superpharmStatus, row, match);
      return {
        id: row.id,
        name: row.name_he,
        brand: row.brand,
        category: row.category,
        ean: row.ean,
        image: row.images?.[0] ?? null,
        price: row.price,
        pickup_cost: row.pickup_cost,
        hacontainer_url: row.hacontainer_url,
        pilot_status: row.pilot_status,
        match_verdict: match?.verdict ?? null,
        source_status: sourceStatus,
        superpharm_status: superpharmStatus,
        upload_bucket: uploadBucket,
        issues,
        other_platforms: productListings
          .filter((l) => l.channel !== "superpharm" && l.channel !== "konimbo")
          .map((l) => ({
            channel: l.channel,
            status: statusFromListing(l.state) ?? "missing",
          })),
      };
    });

    const counts = {
      total_products: rows.length,
      source_uploaded: rows.filter((r) => r.source_status === "uploaded").length,
      source_missing: rows.filter((r) => r.source_status === "missing").length,
      superpharm_uploaded: rows.filter((r) => r.superpharm_status === "uploaded").length,
      superpharm_missing: rows.filter((r) => r.superpharm_status === "missing").length,
      ready: rows.filter((r) => r.upload_bucket === "ready").length,
      needs_fix: rows.filter((r) => r.upload_bucket === "needs_fix").length,
      failed: rows.filter((r) => r.upload_bucket === "failed").length,
      in_progress: rows.filter((r) => r.upload_bucket === "in_progress").length,
      upload_total: rows.filter((r) => r.upload_bucket !== "uploaded").length,
    };

    const scoped = scope === "upload" ? rows.filter((r) => r.upload_bucket !== "uploaded") : rows;
    const filtered = scoped.filter((r) => matchesSearch(r, q));
    const sorted = filtered.sort(scope === "upload" ? sortForUpload : (a, b) => b.id - a.id);
    const from = (page - 1) * pageSize;

    return NextResponse.json({
      ok: true,
      counts,
      rows: sorted.slice(from, from + pageSize),
      total: filtered.length,
      page,
      pageSize,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
