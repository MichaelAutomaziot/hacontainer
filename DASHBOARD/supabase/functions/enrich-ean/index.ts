/**
 * POST /functions/v1/enrich-ean (v2)
 *
 * Per-brand HTTP fetchers + EU price-comparison fallback.
 * Sources prioritized for low bot-blocking:
 *   1. Idealo.de search → product page (exposes EAN in HTML)
 *   2. Geizhals.eu search → product page
 *   3. Brand-specific manufacturer search URL (LG/Samsung/Miele/Bosch/...)
 *   4. Bing HTML search (less aggressive than DDG)
 *
 * Validates EAN-13 check digit + GS1 international prefix.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SB_URL, SB_KEY);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

interface Row {
  id: number;
  name_he: string | null;
  brand: string | null;
  category: string | null;
}

interface Hit {
  ean: string;
  source: string;
}

// ---- EAN validation ----

const isGs1International = (ean: string): boolean => {
  if (!/^[0-9]{12,13}$/.test(ean)) return false;
  const e = ean.padStart(13, "0");
  const sum = e
    .slice(0, 12)
    .split("")
    .reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  const cd = (10 - (sum % 10)) % 10;
  if (cd !== Number(e[12])) return false;
  const p3 = Number(e.slice(0, 3));
  if (p3 >= 20 && p3 <= 29) return false;
  if (p3 >= 40 && p3 <= 49) return false;
  if (p3 >= 200 && p3 <= 299) return false;
  if (p3 >= 980 && p3 <= 999) return false;
  return true;
};

// ---- HTML scrape ----

const RE_GTIN_JSONLD = /"gtin1?[348]?"\s*:\s*"?([0-9]{12,14})"?/gi;
const RE_GTIN_META =
  /<meta[^>]+itemprop=["']gtin1?[348]?["'][^>]+content=["']([0-9]{12,14})["']/gi;
const RE_EAN_TEXT =
  /(?:EAN(?:[\s-]?Code|[\s-]?Nummer)?|GTIN|Barcode|ברקוד)[^0-9<>]{0,30}([0-9]{13})/gi;

const extractGtinFromHtml = (html: string): string[] => {
  const out = new Set<string>();
  for (const re of [RE_GTIN_JSONLD, RE_GTIN_META, RE_EAN_TEXT]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      if (isGs1International(m[1])) out.add(m[1]);
    }
  }
  return [...out];
};

const fetchHtml = async (url: string, timeoutMs = 8000): Promise<string | null> => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,de;q=0.8,he;q=0.7",
      },
      redirect: "follow",
    });
    clearTimeout(t);
    if (!res.ok) {
      console.log(`fetch ${res.status} ${url.slice(0, 100)}`);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.log(`fetch err ${url.slice(0, 100)}: ${(e as Error).message}`);
    return null;
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Strip Hebrew, extract MPN ----

const stripHebrew = (s: string) =>
  s.replace(/[֐-׿‎‏]+/g, " ").replace(/\s+/g, " ").trim();

const extractMpn = (name: string): string[] => {
  const tokens = new Set<string>();
  const re = /([A-Za-z][A-Za-z0-9]{2,}-?[A-Za-z0-9]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(name))) {
    const t = m[1];
    if (
      t.length >= 5 &&
      /[0-9]/.test(t) &&
      /[A-Za-z]/.test(t) &&
      !/^(IP|USB|HDMI|WIFI|SMART|TURBO|BLACK|WHITE|SILVER)/i.test(t) &&
      !/^[0-9]+(W|K|L|ML|CM|MM|KG|BTU|HZ|V|A)$/i.test(t) &&
      !/^4K[A-Z]*$/i.test(t)
    ) {
      tokens.add(t.toUpperCase());
    }
  }
  // Heuristic: prefer longer tokens first (model codes are usually 6+ chars)
  return [...tokens].sort((a, b) => b.length - a.length);
};

// ---- Brand normalization ----

const BRAND_ALIASES: Record<string, string[]> = {
  samsung: ["samsung", "סמסונג"],
  lg: ["lg", "אל ג'י", "אלג'י"],
  bosch: ["bosch", "בוש"],
  siemens: ["siemens", "סימנס"],
  miele: ["miele", "מילה"],
  gorenje: ["gorenje", "גורנייה"],
  hyundai: ["hyundai", "יונדאי"],
  midea: ["midea", "מידאה", "מידיאה"],
  teka: ["teka"],
  sharp: ["sharp", "שארפ"],
  panasonic: ["panasonic", "פנסוניק"],
  philips: ["philips", "פיליפס"],
  sony: ["sony", "סוני"],
  whirlpool: ["whirlpool", "וירלפול"],
  beko: ["beko", "בקו"],
  zanussi: ["zanussi"],
  electrolux: ["electrolux", "אלקטרולוקס"],
  haier: ["haier", "האייר"],
  candy: ["candy", "קנדי"],
  hisense: ["hisense"],
  tcl: ["tcl"],
  xiaomi: ["xiaomi", "שיאומי"],
  delonghi: ["delonghi", "de'longhi", "דלונגי"],
  braun: ["braun", "בראון"],
  kenwood: ["kenwood", "קנווד"],
  moulinex: ["moulinex", "מולינקס"],
  morphy_richards: ["morphy richards", "morphy"],
  remington: ["remington", "רמינגטון"],
  rapoo: ["rapoo", "ראפו"],
  konka: ["konka", "קונקה"],
  hyundai_pro: ["hyundai"],
};

const normalizeBrand = (b: string | null): string | null => {
  if (!b) return null;
  const lc = b.toLowerCase().trim();
  for (const [k, aliases] of Object.entries(BRAND_ALIASES)) {
    if (aliases.some((a) => lc.includes(a.toLowerCase()))) return k;
  }
  return null;
};

// ---- Source providers ----

const tryIdealo = async (q: string): Promise<Hit | null> => {
  const u = `https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${encodeURIComponent(q)}`;
  const html = await fetchHtml(u);
  if (!html) return null;
  // First product link
  const m = html.match(/href="(\/preisvergleich\/OffersOfProduct\/\d+[^"#]*)"/);
  if (!m) return null;
  const productUrl = `https://www.idealo.de${m[1]}`;
  const ph = await fetchHtml(productUrl);
  if (!ph) return null;
  const eans = extractGtinFromHtml(ph);
  if (eans[0]) return { ean: eans[0], source: `idealo: ${productUrl}` };
  return null;
};

const tryGeizhals = async (q: string): Promise<Hit | null> => {
  const u = `https://geizhals.eu/?fs=${encodeURIComponent(q)}&hloc=de`;
  const html = await fetchHtml(u);
  if (!html) return null;
  // Direct EAN sometimes on search page
  let eans = extractGtinFromHtml(html);
  if (eans[0]) return { ean: eans[0], source: `geizhals_search` };
  // First product detail link
  const m = html.match(/href="(\/[^"#]*a\d+\.html[^"]*)"/);
  if (!m) return null;
  const productUrl = `https://geizhals.eu${m[1]}`;
  const ph = await fetchHtml(productUrl);
  if (!ph) return null;
  eans = extractGtinFromHtml(ph);
  if (eans[0]) return { ean: eans[0], source: `geizhals: ${productUrl}` };
  return null;
};

const tryBing = async (q: string): Promise<Hit | null> => {
  const u = `https://www.bing.com/search?q=${encodeURIComponent(q + " EAN GTIN")}`;
  const html = await fetchHtml(u);
  if (!html) return null;
  // Sometimes Bing surfaces EAN directly in answer cards
  const eans = extractGtinFromHtml(html);
  if (eans[0]) return { ean: eans[0], source: `bing_serp` };
  // First non-aggregator result link
  const linkRe = /<a[^>]+href="(https?:\/\/[^"]+)"/g;
  let m: RegExpExecArray | null;
  const blocked = [
    "bing.com",
    "microsoft.com",
    "ean-search.org",
    "barcodelookup",
    "upcitemdb",
    "scanbot.io",
    "zap.co.il",
    "go-upc.com",
  ];
  let tries = 0;
  while ((m = linkRe.exec(html)) && tries < 3) {
    const href = m[1];
    if (blocked.some((b) => href.includes(b))) continue;
    if (!/\.(com|de|co\.uk|co\.il|biz|eu|net)\b/.test(href)) continue;
    const ph = await fetchHtml(href);
    if (ph) {
      const got = extractGtinFromHtml(ph);
      if (got[0]) return { ean: got[0], source: `bing: ${href}` };
    }
    tries++;
    await sleep(300);
  }
  return null;
};

// Brand-specific direct search URLs
const tryBrandSite = async (brand: string, mpn: string): Promise<Hit | null> => {
  const tryUrl = async (u: string): Promise<Hit | null> => {
    const html = await fetchHtml(u);
    if (!html) return null;
    const eans = extractGtinFromHtml(html);
    if (eans[0]) return { ean: eans[0], source: `brand: ${u}` };
    return null;
  };
  switch (brand) {
    case "lg": {
      const r =
        (await tryUrl(`https://www.lg.com/de/suche/?searchKeyword=${mpn}`)) ||
        (await tryUrl(`https://www.lg.com/uk/search/?search=${mpn}`));
      return r;
    }
    case "samsung":
      return tryUrl(`https://www.samsung.com/de/search/?searchvalue=${mpn}`);
    case "bosch":
      return tryUrl(`https://www.bosch-home.com/de/store/free-search.html?q=${mpn}`);
    case "siemens":
      return tryUrl(
        `https://www.siemens-home.bsh-group.com/de/store/free-search.html?q=${mpn}`
      );
    case "miele":
      return tryUrl(`https://www.miele.de/c/produktsuche.htm?q=${mpn}`);
    case "gorenje":
      return tryUrl(`https://www.gorenje.com/search?q=${mpn}`);
    case "hyundai":
    case "hyundai_pro":
      return null; // Hyundai consumer electronics not unified globally
    case "midea":
      return tryUrl(`https://www.midea.com/global/search?q=${mpn}`);
    case "teka":
      return tryUrl(`https://www.teka.com/global/en/search?q=${mpn}`);
    case "sharp":
      return tryUrl(`https://www.sharpconsumer.eu/de_DE/search?q=${mpn}`);
    case "panasonic":
      return tryUrl(`https://www.panasonic.com/de/search.html?searchTerm=${mpn}`);
    case "philips":
      return tryUrl(`https://www.philips.de/c-s/search/${mpn}`);
    case "sony":
      return tryUrl(`https://www.sony.de/electronics/search?searchTerm=${mpn}`);
    case "whirlpool":
      return tryUrl(`https://www.whirlpool.de/search?q=${mpn}`);
    case "beko":
      return tryUrl(`https://www.beko.com/de-de/search?searchterm=${mpn}`);
    case "haier":
      return tryUrl(`https://www.haier-europe.com/de_DE/search?q=${mpn}`);
    case "candy":
      return tryUrl(`https://www.candy-home.com/de_DE/search?q=${mpn}`);
    default:
      return null;
  }
};

// ---- Per-row pipeline ----

const tryRow = async (r: Row): Promise<Hit | null> => {
  const fullName = (r.name_he ?? "").trim();
  const latinName = stripHebrew(fullName);
  const brand = normalizeBrand(r.brand);
  const mpns = extractMpn(latinName);

  console.log(`row ${r.id}: brand=${brand} mpns=${mpns.join("|")} name="${latinName.slice(0, 60)}"`);

  // 1. Brand-specific manufacturer search by MPN
  if (brand && mpns.length) {
    for (const mpn of mpns.slice(0, 2)) {
      const h = await tryBrandSite(brand, mpn);
      if (h) return h;
      await sleep(400);
    }
  }

  // 2. Idealo by MPN+brand
  for (const mpn of mpns.slice(0, 2)) {
    const q = brand ? `${brand} ${mpn}` : mpn;
    const h = await tryIdealo(q);
    if (h) return h;
    await sleep(400);
  }

  // 3. Geizhals by MPN
  for (const mpn of mpns.slice(0, 2)) {
    const h = await tryGeizhals(mpn);
    if (h) return h;
    await sleep(400);
  }

  // 4. Bing fallback
  if (mpns.length) {
    const q = brand ? `${brand} ${mpns[0]}` : mpns[0];
    const h = await tryBing(q);
    if (h) return h;
  } else if (latinName.length > 3) {
    const h = await tryBing(latinName);
    if (h) return h;
  }

  return null;
};

// ---- Entry ----

interface ReqBody {
  batch_size?: number;
  status?: string;
  ids?: number[];
}

Deno.serve(async (req) => {
  const body = (await req.json().catch(() => ({}))) as ReqBody;
  const batchSize = Math.min(Math.max(body.batch_size ?? 30, 1), 200);
  const status = body.status ?? "needs_web_global";

  let q = sb.from("inventory").select("id, name_he, brand, category");
  if (body.ids?.length) q = q.in("id", body.ids);
  else q = q.eq("ean_status", status).limit(batchSize);

  const { data, error } = await q;
  if (error)
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
    });
  const rows = (data ?? []) as Row[];

  const results: Array<{ id: number; ean: string | null; source: string | null }> = [];
  for (const r of rows) {
    const hit = await tryRow(r);
    if (hit) {
      await sb
        .from("inventory")
        .update({
          ean: hit.ean,
          ean_source: hit.source,
          ean_status: "verified_external",
          ean_verified_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      results.push({ id: r.id, ean: hit.ean, source: hit.source });
    } else {
      results.push({ id: r.id, ean: null, source: null });
    }
    await sleep(300);
  }

  const found = results.filter((r) => r.ean).length;
  return new Response(
    JSON.stringify({ ok: true, processed: rows.length, found, results }),
    { headers: { "Content-Type": "application/json" } }
  );
});
