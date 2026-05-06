#!/usr/bin/env node
/**
 * Backfill inventory.ean for rows where ean IS NULL/empty.
 *
 * Pass 1: Konimbo /v1/items — `code` field is the barcode/EAN; matched to
 *         inventory.hacontainer_id (= Konimbo `id`).
 *
 * Pass 2 (fallback): Mirakl /api/offers — extract product_references[reference_type=ean].
 *         Matched to inventory by:
 *           a) numeric shop_sku == hacontainer_id, then
 *           b) normalised product_title == name_he (lowercased, whitespace squashed).
 *         Title fallback only fires when exactly one Mirakl row maps to that title
 *         (prevents wrong-EAN bleed across SKU clones with the same display name).
 *
 * Env required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *               KONIMBO_API_KEY, MIRAKL_API_KEY, MIRAKL_BASE_URL.
 *
 * Flags:
 *   --dry           : preview counts; no DB writes.
 *   --skip-konimbo  : skip pass 1.
 *   --skip-mirakl   : skip pass 2.
 *   --refresh-sp-raw: re-pull all SP offers into superpharm_offers_raw before pass 2.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// --- env loading: prefer .env, fall back to .env.local
const loadEnvFile = (rel) => {
  try {
    const p = path.join(ROOT, rel);
    const txt = readFileSync(p, "utf8");
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    /* missing file is fine */
  }
};
loadEnvFile(".env");
loadEnvFile(".env.local");

const argv = new Set(process.argv.slice(2));
const DRY = argv.has("--dry");
const SKIP_KONIMBO = argv.has("--skip-konimbo");
const SKIP_MIRAKL = argv.has("--skip-mirakl");
const REFRESH_SP = argv.has("--refresh-sp-raw");

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KONIMBO_KEY = process.env.KONIMBO_API_KEY;
const MIRAKL_KEY = process.env.MIRAKL_API_KEY;
const MIRAKL_BASE = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";

if (!SB_URL || !SB_SR) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!SKIP_KONIMBO && !KONIMBO_KEY) {
  console.error("missing KONIMBO_API_KEY (use --skip-konimbo to bypass)");
  process.exit(1);
}
if (!SKIP_MIRAKL && !MIRAKL_KEY) {
  console.error("missing MIRAKL_API_KEY (use --skip-mirakl to bypass)");
  process.exit(1);
}

const sb = createClient(SB_URL, SB_SR, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** EAN-8/12/13/14: digits only, no leading zero except as part of value. */
const EAN_RE = /^\d{8,14}$/;
const isEan = (v) => typeof v === "string" && EAN_RE.test(v.trim());

const normTitle = (s) =>
  (s ?? "")
    .toString()
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "") // strip nikud
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const fetchMissingInventory = async () => {
  // Pull every row missing an EAN. Page through to dodge default 1000-row caps.
  const PAGE = 1000;
  const out = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("inventory")
      .select("id, hacontainer_id, name_he")
      .or("ean.is.null,ean.eq.")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`inventory missing-ean fetch: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Pass 1: Konimbo
// ---------------------------------------------------------------------------
const konimboFetchAllItems = async () => {
  const PER_PAGE = 100;
  const out = []; // {id, code, second_code}
  let page = 1;
  for (;;) {
    const url = `https://api.konimbo.co.il/v1/items?token=${encodeURIComponent(
      KONIMBO_KEY
    )}&attributes=id,code,second_code&page=${page}&visible=`;
    let attempt = 0;
    let res;
    for (;;) {
      res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.status === 429 && attempt < 5) {
        const ra = Number(res.headers.get("retry-after") ?? 5);
        await sleep((Number.isFinite(ra) && ra > 0 ? ra : 5) * 1000);
        attempt++;
        continue;
      }
      break;
    }
    if (!res.ok) {
      throw new Error(`Konimbo ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) break;
    for (const it of items) {
      out.push({
        id: String(it.id ?? ""),
        code: typeof it.code === "string" ? it.code.trim() : "",
        second_code: typeof it.second_code === "string" ? it.second_code.trim() : "",
      });
    }
    const linkHdr = res.headers.get("x-pagination-links") ?? "";
    if (!linkHdr.includes('rel="next"')) break;
    page++;
    await sleep(150); // polite throttle (Konimbo rate-limit window)
  }
  return out;
};

const runKonimboPass = async (missing) => {
  console.log(`[konimbo] fetching all items…`);
  const all = await konimboFetchAllItems();
  console.log(`[konimbo] fetched ${all.length} items`);

  // Map konimbo_id -> first matching EAN (prefer code, fallback second_code).
  const byId = new Map();
  for (const it of all) {
    if (!it.id) continue;
    const c = isEan(it.code) ? it.code : isEan(it.second_code) ? it.second_code : "";
    if (c) byId.set(it.id, c);
  }
  console.log(`[konimbo] ${byId.size} items expose a usable EAN`);

  // Build update list against the missing set.
  const missingByHcid = new Map();
  for (const r of missing) {
    if (r.hacontainer_id) missingByHcid.set(String(r.hacontainer_id), r);
  }
  const updates = [];
  for (const [hcid, ean] of byId) {
    const inv = missingByHcid.get(hcid);
    if (inv) updates.push({ id: inv.id, ean });
  }
  console.log(`[konimbo] ${updates.length} inventory rows updatable from Konimbo`);

  if (DRY || updates.length === 0) return updates.length;

  let written = 0;
  for (let i = 0; i < updates.length; i += 200) {
    const batch = updates.slice(i, i + 200);
    // Batch update via individual calls — Supabase upsert needs the full row;
    // safer to issue per-id PATCHes inside a Promise.all chunk.
    const results = await Promise.allSettled(
      batch.map((u) =>
        sb
          .from("inventory")
          .update({ ean: u.ean })
          .eq("id", u.id)
          .or("ean.is.null,ean.eq.")
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled" && !r.value.error) written++;
      else if (r.status === "fulfilled" && r.value.error)
        console.warn(`  patch err: ${r.value.error.message}`);
      else if (r.status === "rejected") console.warn(`  reject: ${r.reason}`);
    }
    process.stdout.write(`\r[konimbo] wrote ${written}/${updates.length}`);
  }
  process.stdout.write("\n");
  return written;
};

// ---------------------------------------------------------------------------
// Pass 2: Mirakl (SP catalogue)
// ---------------------------------------------------------------------------
const miraklFetchAllOffers = async () => {
  const PAGE = 100;
  const out = []; // {shop_sku, product_title, ean}
  let offset = 0;
  let total = -1;
  for (;;) {
    const url = `${MIRAKL_BASE}/api/offers?max=${PAGE}&offset=${offset}`;
    let attempt = 0;
    let res;
    for (;;) {
      res = await fetch(url, {
        headers: { Authorization: MIRAKL_KEY, Accept: "application/json" },
      });
      if (res.status === 429 && attempt < 5) {
        const ra = Number(res.headers.get("retry-after") ?? 5);
        await sleep((Number.isFinite(ra) && ra > 0 ? ra : 5) * 1000);
        attempt++;
        continue;
      }
      if ((res.status === 502 || res.status === 503) && attempt < 3) {
        await sleep(1500 * (attempt + 1));
        attempt++;
        continue;
      }
      break;
    }
    if (!res.ok) {
      throw new Error(`Mirakl ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const j = await res.json();
    const offers = Array.isArray(j.offers) ? j.offers : [];
    total = typeof j.total_count === "number" ? j.total_count : total;
    for (const o of offers) {
      const refs = Array.isArray(o.product_references) ? o.product_references : [];
      const eanRef = refs.find(
        (r) => r && (r.reference_type === "ean" || r.reference_type === "EAN")
      );
      const ean = eanRef && typeof eanRef.reference === "string" ? eanRef.reference.trim() : "";
      out.push({
        shop_sku: typeof o.shop_sku === "string" ? o.shop_sku.trim() : "",
        product_title:
          typeof o.product_title === "string" ? o.product_title : (o.product_title ?? ""),
        ean: isEan(ean) ? ean : "",
      });
    }
    if (offers.length === 0) break;
    offset += PAGE;
    if (total > -1 && offset >= total) break;
    await sleep(200);
  }
  return out;
};

const runMiraklPass = async (missing) => {
  console.log(`[mirakl] fetching all offers…`);
  const offers = await miraklFetchAllOffers();
  console.log(`[mirakl] fetched ${offers.length} offers`);

  // Direct map: numeric shop_sku -> ean (prefers first non-empty).
  const byShopSku = new Map();
  // Title map: normTitle -> {ean, count}; only used when count==1.
  const byTitle = new Map();

  for (const o of offers) {
    if (!o.ean) continue;
    if (o.shop_sku) {
      if (!byShopSku.has(o.shop_sku)) byShopSku.set(o.shop_sku, o.ean);
    }
    const nt = normTitle(o.product_title);
    if (nt) {
      const cur = byTitle.get(nt);
      if (!cur) byTitle.set(nt, { ean: o.ean, count: 1 });
      else {
        cur.count += 1;
        // Keep first; ambiguity suppresses the match downstream.
        if (cur.ean !== o.ean) cur.ambiguous = true;
      }
    }
  }
  console.log(
    `[mirakl] indexed ${byShopSku.size} shop_skus + ${byTitle.size} unique titles`
  );

  let viaShopSku = 0;
  let viaTitle = 0;
  let stillMissing = 0;
  const updates = []; // {id, ean, src}

  for (const r of missing) {
    let ean = "";
    let src = "";
    if (r.hacontainer_id) {
      const v = byShopSku.get(String(r.hacontainer_id));
      if (v) {
        ean = v;
        src = "shop_sku";
      }
    }
    if (!ean) {
      const nt = normTitle(r.name_he);
      const t = nt ? byTitle.get(nt) : null;
      if (t && !t.ambiguous) {
        ean = t.ean;
        src = "title";
      }
    }
    if (!ean) {
      stillMissing++;
      continue;
    }
    if (src === "shop_sku") viaShopSku++;
    else if (src === "title") viaTitle++;
    updates.push({ id: r.id, ean, src });
  }

  console.log(
    `[mirakl] resolvable: shop_sku=${viaShopSku} title=${viaTitle} still_missing=${stillMissing}`
  );
  if (DRY || updates.length === 0) return updates.length;

  let written = 0;
  for (let i = 0; i < updates.length; i += 200) {
    const batch = updates.slice(i, i + 200);
    const results = await Promise.allSettled(
      batch.map((u) =>
        sb
          .from("inventory")
          .update({ ean: u.ean })
          .eq("id", u.id)
          .or("ean.is.null,ean.eq.")
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled" && !r.value.error) written++;
      else if (r.status === "fulfilled" && r.value.error)
        console.warn(`  patch err: ${r.value.error.message}`);
      else if (r.status === "rejected") console.warn(`  reject: ${r.reason}`);
    }
    process.stdout.write(`\r[mirakl] wrote ${written}/${updates.length}`);
  }
  process.stdout.write("\n");
  return written;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  const t0 = Date.now();
  console.log(`-- backfill-eans  dry=${DRY}  skipKon=${SKIP_KONIMBO}  skipMir=${SKIP_MIRAKL}`);

  // Snapshot before
  const { count: beforeMissing } = await sb
    .from("inventory")
    .select("id", { count: "exact", head: true })
    .or("ean.is.null,ean.eq.");
  const { count: total } = await sb
    .from("inventory")
    .select("id", { count: "exact", head: true });
  console.log(`[before] missing=${beforeMissing}/${total}`);

  let missing = await fetchMissingInventory();
  console.log(`[before] loaded ${missing.length} missing-EAN rows`);

  let writtenK = 0;
  if (!SKIP_KONIMBO) {
    writtenK = await runKonimboPass(missing);
    if (!DRY && writtenK > 0) {
      // Re-pull fresh missing list before Mirakl pass.
      missing = await fetchMissingInventory();
      console.log(`[refresh] missing now ${missing.length}`);
    }
  } else {
    console.log("[konimbo] skipped");
  }

  let writtenM = 0;
  if (!SKIP_MIRAKL) {
    writtenM = await runMiraklPass(missing);
  } else {
    console.log("[mirakl] skipped");
  }

  const { count: afterMissing } = await sb
    .from("inventory")
    .select("id", { count: "exact", head: true })
    .or("ean.is.null,ean.eq.");
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[after] missing=${afterMissing}/${total}  konimbo_wrote=${writtenK}  mirakl_wrote=${writtenM}  elapsed=${elapsed}s  dry=${DRY}`
  );
})().catch((e) => {
  console.error(`backfill-eans failed: ${e.stack ?? e.message}`);
  process.exit(1);
});
