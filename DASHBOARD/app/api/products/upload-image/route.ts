/**
 * Server-proxy upload endpoint for product images.
 *
 * Accepts multipart form-data with a single `file` field, writes through
 * the service-role client to the public `product-images` bucket, returns
 * the resulting public URL plus client-reported dimensions.
 *
 * Server-side dimension re-check is a TODO follow-up (would require
 * `sharp`, which is not in deps yet). For now we trust the client's
 * `width` / `height` fields — the orchestrator's Zod schema enforces
 * the 300×300 minimum on the assembled `images[]` array.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
const BUCKET = "product-images";
const MAX_BYTES = 8 * 1024 * 1024;

const extFor = (mime: string): string => {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
};

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid multipart body" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "missing file" }, { status: 400 });
  }
  if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
    return NextResponse.json(
      { ok: false, error: "unsupported MIME — JPG / PNG / WEBP only" },
      { status: 415 },
    );
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `invalid size (max ${MAX_BYTES} bytes)` },
      { status: 413 },
    );
  }

  const widthRaw = Number(form.get("width") ?? 0);
  const heightRaw = Number(form.get("height") ?? 0);
  const width = Number.isFinite(widthRaw) ? Math.floor(widthRaw) : 0;
  const height = Number.isFinite(heightRaw) ? Math.floor(heightRaw) : 0;
  if (width < 300 || height < 300) {
    return NextResponse.json(
      { ok: false, error: `image too small (${width}×${height}); min 300×300` },
      { status: 400 },
    );
  }

  const sb = getServiceClient();
  const ext = extFor(file.type);
  const key = `single-upload/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(key, buf, { contentType: file.type, upsert: false });
  if (upErr) {
    return NextResponse.json(
      { ok: false, error: `storage upload: ${upErr.message}` },
      { status: 500 },
    );
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(key);
  if (!pub?.publicUrl) {
    return NextResponse.json({ ok: false, error: "could not resolve public URL" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    url: pub.publicUrl,
    width,
    height,
    mime: file.type,
  });
}
