/**
 * PATCH /api/inventory/[id]/pm01-fields
 *
 * Updates the subset of inventory columns + technical_specs entries that
 * matter for PM01 validity. Used by Pm01ReadinessDrawer to let operators
 * fix per-row issues (missing brand, image, energy rating, etc.) directly
 * from /board/upload before re-attempting upload.
 *
 * Body: {
 *   name_he?: string,
 *   brand?: string,
 *   ean?: string,                                    -- replaces auto-minted
 *   images?: string[],                               -- full array; first is primary
 *   category_id?: string,                            -- uuid; must exist + be leaf
 *   technical_specs_patch?: Record<string, string>,  -- merged into existing
 * }
 *
 * The technical_specs patch is merged (not replaced) — caller can update
 * individual attribute keys without losing others. Empty string clears the
 * key. Numeric-only validation happens at PM01 build time, not here.
 */
import { NextResponse } from "next/server";
import { getServiceClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
  name_he?: string;
  brand?: string;
  ean?: string;
  images?: string[];
  category_id?: string;
  technical_specs_patch?: Record<string, string>;
}

const trim = (v: string | undefined): string | undefined =>
  v === undefined ? undefined : v.trim();

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const sb = getServiceClient();
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  // Build the update payload. Only set the fields the caller actually sent.
  const update: Record<string, unknown> = {};

  const name = trim(body.name_he);
  if (name !== undefined) {
    if (name.length === 0) return NextResponse.json({ ok: false, error: "name_he cannot be empty" }, { status: 400 });
    update.name_he = name;
  }

  const brand = trim(body.brand);
  if (brand !== undefined) update.brand = brand || null;

  const ean = trim(body.ean);
  if (ean !== undefined) update.ean = ean || null;

  if (body.images !== undefined) {
    if (!Array.isArray(body.images)) {
      return NextResponse.json({ ok: false, error: "images must be an array" }, { status: 400 });
    }
    const cleaned = body.images.map((s) => (typeof s === "string" ? s.trim() : "")).filter((s) => s.length > 0);
    update.images = cleaned;
  }

  if (body.category_id !== undefined) {
    // Validate the uuid exists and is a leaf.
    const { data: cat, error: catErr } = await sb
      .from("categories")
      .select("id, sp_category_code, is_leaf")
      .eq("id", body.category_id)
      .maybeSingle();
    if (catErr) return NextResponse.json({ ok: false, error: `categories: ${catErr.message}` }, { status: 500 });
    if (!cat) return NextResponse.json({ ok: false, error: "category_id not found" }, { status: 400 });
    if (!cat.is_leaf) return NextResponse.json({ ok: false, error: "category must be a leaf" }, { status: 400 });
    update.category_id = body.category_id;
  }

  // technical_specs is merged (not replaced) so the caller can update individual
  // attribute codes without losing unrelated keys (brand, warranty_he, etc.).
  let techSpecsMergedFrom: Record<string, unknown> | null = null;
  if (body.technical_specs_patch && typeof body.technical_specs_patch === "object") {
    const { data: existing, error: exErr } = await sb
      .from("inventory")
      .select("technical_specs")
      .eq("id", id)
      .single();
    if (exErr) return NextResponse.json({ ok: false, error: `inventory: ${exErr.message}` }, { status: 500 });
    techSpecsMergedFrom = (existing?.technical_specs as Record<string, unknown> | null) ?? {};
    const merged: Record<string, unknown> = { ...techSpecsMergedFrom };
    for (const [k, v] of Object.entries(body.technical_specs_patch)) {
      const sv = typeof v === "string" ? v.trim() : v;
      if (sv === "" || sv === null || sv === undefined) {
        delete merged[k];
      } else {
        merged[k] = sv;
      }
    }
    update.technical_specs = merged;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, updated: 0, note: "no changes requested" });
  }

  const { error: upErr } = await sb.from("inventory").update(update).eq("id", id);
  if (upErr) {
    return NextResponse.json({ ok: false, error: `update: ${upErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    updated: 1,
    fields: Object.keys(update),
    technical_specs_keys_merged: techSpecsMergedFrom !== null
      ? Object.keys(body.technical_specs_patch ?? {})
      : [],
  });
}
