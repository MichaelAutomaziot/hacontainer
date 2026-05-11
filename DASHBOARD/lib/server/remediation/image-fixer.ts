/**
 * Auto-remediation for SP image rejections (MCM-05104, MCM-05106,
 * invalid_main_image, low_quality_image).
 *
 * Pipeline per source URL:
 *   1. HEAD-probe content-type + size; bail if not image/*.
 *   2. GET the bytes.
 *   3. Optional cloud bg-removal (REPLICATE_API_TOKEN gated). Fallback to
 *      sharp-only when not configured.
 *   4. sharp:
 *        flatten over white → resize 1000×1000 fit:contain → JPEG q=90.
 *      The flatten step ensures any transparent area becomes pure white
 *      regardless of whether bg-removal ran, so downstream Mirakl sees a
 *      clean white-background JPEG.
 *   5. Upload to Supabase Storage `processed-images/{ean}.jpg` (upsert).
 *   6. Return the public URL; caller patches inventory.images[0].
 *
 * The optional Replicate path uses `cjwbw/rembg` (~$0.005/image). When no
 * token is present the function falls back gracefully — the sharp-only
 * pipeline still fixes resolution issues and forces white background for
 * any source with transparency or near-white pixels.
 */
import sharp from "sharp";
import { getServiceClient } from "@/utils/supabase/admin";

const STORAGE_BUCKET = "processed-images";
const TARGET_DIM = 1000;
const JPEG_QUALITY = 90;
const REPLICATE_MODEL = "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003";

const USER_AGENT =
  "Mozilla/5.0 (compatible; HaContainer/1.0; +https://hacontainer.co.il/)";

/** Extract a usable image URL from an HTML page body. Looks for og:image,
 *  twitter:image, link[rel=image_src], schema.org product image, then any
 *  meaningful <img>. Skips data: URIs, tracking pixels (1×1), tiny icons. */
const extractImageFromHtml = (html: string, baseUrl: string): string | null => {
  const tryAbs = (raw: string): string | null => {
    try {
      const u = new URL(raw, baseUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u.toString();
    } catch {
      return null;
    }
  };
  const patterns: RegExp[] = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    /"image"\s*:\s*"([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i, // schema.org JSON-LD
    /<img[^>]+(?:data-src|data-original|src)=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      const abs = tryAbs(m[1]);
      if (abs) return abs;
    }
  }
  return null;
};

/** GET a page with browser-like headers and return its body. */
const fetchHtml = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
};

/** Synthetic 1000×1000 white-bg JPEG with the product name centred. Last
 *  resort when no real image can be found. SP merchandiser will reject it
 *  for "not representative" — but we get past PM01 transformation, which
 *  is enough to keep the pipeline flowing for the rest of the catalog. */
export const synthesisePlaceholder = async (label: string): Promise<Buffer> => {
  const trimmed = label.trim().slice(0, 60);
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${TARGET_DIM}" height="${TARGET_DIM}">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
            fill="#bbbbbb" font-family="Arial, sans-serif" font-size="48"
            direction="rtl">${escape(trimmed)}</text>
    </svg>`;
  return sharp(Buffer.from(svg))
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
};

export interface ImageFixResult {
  ok: boolean;
  newUrl?: string;
  width?: number;
  height?: number;
  bytes?: number;
  log: string[];
  error?: string;
}

/** Try to remove the background via Replicate. Returns the bg-removed PNG
 *  buffer, or null if no token / API error. */
const removeBackgroundViaReplicate = async (
  imageBuf: Buffer
): Promise<Buffer | null> => {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return null;
  try {
    // Replicate expects a base64 data URL or HTTP URL. base64 inline keeps
    // us from needing a temp upload.
    const dataUrl = `data:image/jpeg;base64,${imageBuf.toString("base64")}`;
    const create = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: REPLICATE_MODEL.split(":")[1],
        input: { image: dataUrl },
      }),
    });
    if (!create.ok) return null;
    const job = (await create.json()) as { id: string; urls: { get: string } };

    for (let i = 0; i < 60; i++) {
      const poll = await fetch(job.urls.get, {
        headers: { Authorization: `Token ${token}` },
      });
      if (!poll.ok) return null;
      const status = (await poll.json()) as {
        status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
        output?: string;
      };
      if (status.status === "succeeded" && status.output) {
        const out = await fetch(status.output);
        if (!out.ok) return null;
        return Buffer.from(await out.arrayBuffer());
      }
      if (status.status === "failed" || status.status === "canceled") return null;
      await new Promise((r) => setTimeout(r, 2000));
    }
    return null;
  } catch {
    return null;
  }
};

const isImageContentType = (ct: string): boolean =>
  ct.startsWith("image/") || ct === "application/octet-stream";

/** Magic bytes for the common image formats sharp accepts. Lets us recover
 *  when the server lies about content-type (text/html for an actual JPEG). */
const sniffImageMagic = (buf: Buffer): boolean => {
  if (buf.length < 4) return false;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // WEBP: RIFF....WEBP
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return true;
  // GIF: GIF8
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  return false;
};

export interface FixImageOpts {
  /** Force the cloud bg-removal even if the source is already mostly white. */
  forceBgRemove?: boolean;
  /** Recursion depth guard for the HTML→image fallback path. */
  _depth?: number;
  /** Optional landing page URL to scrape if the source URL returns HTML. */
  htmlFallbackUrl?: string;
}

export const fixImage = async (
  sourceUrl: string,
  ean: string,
  opts: FixImageOpts = {}
): Promise<ImageFixResult> => {
  const log: string[] = [];
  const depth = opts._depth ?? 0;

  // 1. Probe.
  let head: Response;
  try {
    head = await fetch(sourceUrl, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT },
    });
  } catch (e) {
    return { ok: false, log: [`HEAD threw: ${(e as Error).message}`], error: "head_failed" };
  }
  const ct = (head.headers.get("content-type") ?? "").toLowerCase();
  if (!head.ok) {
    return { ok: false, log: [`HEAD ${head.status}`], error: `http_${head.status}` };
  }
  if (!isImageContentType(ct)) {
    // Server claims this is HTML. Two recovery paths, in order:
    //  (a) it's actually a JPEG with a wrong Content-Type — sniff after GET.
    //  (b) it really is an HTML page — scrape og:image / first <img>.
    if (depth >= 2) {
      return { ok: false, log: [`content-type=${ct} (depth ${depth})`], error: "not_image" };
    }
    log.push(`content-type=${ct} → attempt HTML recovery`);
    let body: Buffer | string | null = null;
    try {
      const res = await fetch(sourceUrl, {
        redirect: "follow",
        headers: { "User-Agent": USER_AGENT },
      });
      if (res.ok) body = Buffer.from(await res.arrayBuffer());
    } catch {
      /* fall through to error */
    }
    if (body && Buffer.isBuffer(body) && sniffImageMagic(body)) {
      // Server lied — it's actually an image. Skip to processing.
      log.push("magic sniff: actual image despite text/html ct");
      return await processBuffer(body, ean, opts, log);
    }
    if (body) {
      const html = body.toString("utf-8");
      const imgUrl = extractImageFromHtml(html, sourceUrl);
      if (imgUrl && imgUrl !== sourceUrl) {
        log.push(`scraped og:image=${imgUrl.slice(0, 100)}`);
        const recursed = await fixImage(imgUrl, ean, {
          ...opts,
          _depth: depth + 1,
        });
        return { ...recursed, log: [...log, ...(recursed.log ?? [])] };
      }
    }
    // Fall through to optional html fallback URL on next pass via
    // fixFirstWorkingImage; here we've exhausted this URL.
    return { ok: false, log, error: "not_image" };
  }
  log.push(`source ct=${ct} clen=${head.headers.get("content-length") ?? "?"}`);

  // 2. Download.
  let inputBuf: Buffer;
  try {
    const res = await fetch(sourceUrl, {
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return { ok: false, log: [...log, `GET ${res.status}`], error: `http_${res.status}` };
    inputBuf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    return { ok: false, log: [...log, `GET threw: ${(e as Error).message}`], error: "download_failed" };
  }
  return processBuffer(inputBuf, ean, opts, log);
};

/** Decode → bg-remove (optional) → flatten white → resize → JPEG → upload. */
const processBuffer = async (
  inputBuf: Buffer,
  ean: string,
  opts: FixImageOpts,
  log: string[]
): Promise<ImageFixResult> => {

  // 3. Probe dimensions.
  let meta: sharp.Metadata;
  try {
    meta = await sharp(inputBuf).metadata();
  } catch (e) {
    return { ok: false, log: [...log, `sharp.metadata: ${(e as Error).message}`], error: "decode_failed" };
  }
  log.push(`in ${meta.width ?? "?"}x${meta.height ?? "?"} ${meta.format ?? "?"}`);
  if (!meta.width || !meta.height) {
    return { ok: false, log, error: "no_dims" };
  }

  // 4. Optional cloud bg-removal.
  let workBuf = inputBuf;
  if (opts.forceBgRemove) {
    const bgRemoved = await removeBackgroundViaReplicate(inputBuf);
    if (bgRemoved) {
      workBuf = bgRemoved;
      log.push("bg-removed (replicate)");
    } else {
      log.push("bg-remove unavailable; using sharp-only");
    }
  }

  // 5. Compose to clean 1000x1000 JPEG on white.
  let outBuf: Buffer;
  try {
    outBuf = await sharp(workBuf)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize(TARGET_DIM, TARGET_DIM, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255 },
        kernel: "lanczos3",
        withoutEnlargement: false,
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch (e) {
    return { ok: false, log: [...log, `sharp.compose: ${(e as Error).message}`], error: "compose_failed" };
  }
  log.push(`out ${TARGET_DIM}x${TARGET_DIM} jpeg ${outBuf.length}b`);

  // 6. Upload.
  const sb = getServiceClient();
  const path = `${ean.trim()}.jpg`;
  const { error: upErr } = await sb.storage.from(STORAGE_BUCKET).upload(path, outBuf, {
    contentType: "image/jpeg",
    upsert: true,
    cacheControl: "31536000",
  });
  if (upErr) {
    return { ok: false, log: [...log, `upload: ${upErr.message}`], error: "upload_failed" };
  }
  const { data: pub } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  log.push(`uploaded ${pub.publicUrl}`);

  return {
    ok: true,
    newUrl: pub.publicUrl,
    width: TARGET_DIM,
    height: TARGET_DIM,
    bytes: outBuf.length,
    log,
  };
};

/** Compose a synthetic placeholder + upload. Used when no real image can
 *  be recovered. SP merchandiser typically rejects placeholders for
 *  "not representative", but the row passes PM01 transformation, which
 *  unblocks the rest of the catalog. Caller should flag the inv_id for
 *  human review. */
export const uploadPlaceholderImage = async (
  ean: string,
  label: string
): Promise<ImageFixResult> => {
  const log: string[] = [`placeholder for ${label.slice(0, 40)}`];
  let outBuf: Buffer;
  try {
    outBuf = await synthesisePlaceholder(label);
  } catch (e) {
    return {
      ok: false,
      log: [...log, `synthesise: ${(e as Error).message}`],
      error: "synthesise_failed",
    };
  }
  const sb = getServiceClient();
  const path = `${ean.trim()}.jpg`;
  const { error: upErr } = await sb.storage.from(STORAGE_BUCKET).upload(path, outBuf, {
    contentType: "image/jpeg",
    upsert: true,
    cacheControl: "31536000",
  });
  if (upErr) {
    return { ok: false, log: [...log, `upload: ${upErr.message}`], error: "upload_failed" };
  }
  const { data: pub } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return {
    ok: true,
    newUrl: pub.publicUrl,
    width: TARGET_DIM,
    height: TARGET_DIM,
    bytes: outBuf.length,
    log: [...log, `uploaded ${pub.publicUrl}`],
  };
};

export interface RecoverImageInput {
  ean: string;
  images: string[] | null | undefined;
  hacontainer_url?: string | null;
  name_he?: string | null;
}

/** Full image-recovery chain for one inventory row. Tries:
 *   1. inventory.images[0..n] — direct fixImage
 *   2. inventory.images[*] with HTML→og:image fallback (already inside fixImage)
 *   3. hacontainer_url — scrape the source-system product page for og:image
 *   4. synthetic placeholder — last resort to keep PM01 unblocked
 *
 *  Returns the result of whichever step succeeded, or the placeholder
 *  outcome when all real-image paths fail.
 */
export const recoverImage = async (
  inv: RecoverImageInput,
  opts: FixImageOpts = {}
): Promise<ImageFixResult & { used_placeholder?: boolean }> => {
  const log: string[] = [];
  // Step 1: try each candidate URL through the standard pipeline.
  for (const url of inv.images ?? []) {
    if (!url) continue;
    const r = await fixImage(url, inv.ean, opts);
    log.push(`try ${url.slice(0, 80)} → ${r.ok ? "ok" : r.error}`);
    if (r.ok) return { ...r, log: [...log, ...(r.log ?? [])] };
  }
  // Step 2: scrape the landing page for og:image.
  if (inv.hacontainer_url) {
    log.push(`scrape ${inv.hacontainer_url.slice(0, 80)}`);
    const html = await fetchHtml(inv.hacontainer_url);
    if (html) {
      const imgUrl = extractImageFromHtml(html, inv.hacontainer_url);
      if (imgUrl) {
        log.push(`og:image=${imgUrl.slice(0, 80)}`);
        const r = await fixImage(imgUrl, inv.ean, opts);
        if (r.ok) return { ...r, log: [...log, ...(r.log ?? [])] };
        log.push(`scraped url failed: ${r.error}`);
      } else {
        log.push("no og:image in html");
      }
    } else {
      log.push("hacontainer_url fetch failed");
    }
  }
  // Step 3: placeholder. Pipeline keeps moving; row gets flagged manual.
  log.push("placeholder fallback");
  const placeholder = await uploadPlaceholderImage(
    inv.ean,
    inv.name_he ?? `inv ${inv.ean}`
  );
  return {
    ...placeholder,
    log: [...log, ...(placeholder.log ?? [])],
    used_placeholder: true,
  };
};

/** Tries images[0..n] until one fixes successfully. Returns first OK
 *  result or the last failure. */
export const fixFirstWorkingImage = async (
  urls: string[] | null | undefined,
  ean: string,
  opts: FixImageOpts = {}
): Promise<ImageFixResult> => {
  if (!urls || urls.length === 0) {
    return { ok: false, log: ["no source urls"], error: "no_source" };
  }
  let lastFail: ImageFixResult | null = null;
  for (const url of urls) {
    const r = await fixImage(url, ean, opts);
    if (r.ok) return r;
    lastFail = r;
  }
  return lastFail ?? { ok: false, log: ["unreachable"], error: "no_source" };
};
