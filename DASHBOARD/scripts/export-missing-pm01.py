#!/usr/bin/env python3
"""
Export all SP-missing inventory rows to a PM01-format CSV with applied
pricing rules and per-row required attributes.

Output columns (matches the Mirakl PM01 transformed-file format SP returned):
  category;shop_sku;ean;name;description;brand;basePrice;media;2052;5589;6327;
  logistic_class;shipping_price;current_price;strike_price;
  discount_start_date;discount_end_date;import_type

Pricing per docs/PILOT.md (locked 2026-04-30, strike multiplier updated 2026-05-06):
  current_price = HaContainer sale + per-product pickup_cost
  shipping_price = 39 ILS (always; via min-shipping-price + logistic_class)
  strike_price   = round((current + 39) * 1.15)  [whole shekel]
  discount window = upload date → upload date + 30 days
  logistic_class  = "regular_2"  (פריטים רגילים - רמת מחיר 2)
  import_type     = "official"

Brand & hierarchy resolution uses cached Mirakl /api/values_lists +
/api/hierarchies (curl'd to /tmp before running this script).
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import os
import sys
import urllib.parse
import urllib.request

SUPABASE_URL = "https://zkwkuexvftxdwsdamewx.supabase.co"
SR_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inprd2t1ZXh2ZnR4ZHdzZGFtZXd4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQ1NjMxMSwiZXhwIjoyMDkzMDMyMzExfQ.grB0FVNj8Zl5FtYra6r7bQGzIBF7SPCtv74GlGu6iKM"

VLISTS_PATH = ".cache/sp_vlists.json"
HIER_PATH = ".cache/sp_hier.json"
DOWNLOADS = os.path.expanduser("~/Downloads")

PAGE = 1000
SHIPPING = 39.0
STRIKE_MULT = 1.15
SALE_DAYS = 30
LOGISTIC_CLASS = "regular_2"
FALLBACK_HIERARCHY = "10000000mp"


def http_get_json(url: str, headers: dict[str, str]) -> object:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_missing_inventory() -> list[dict]:
    """Pull all SP-missing inventory rows via Supabase RPC inline SQL."""
    headers = {
        "apikey": SR_KEY,
        "Authorization": f"Bearer {SR_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Prefer": "params=single-object",
    }
    sql = (
        "SELECT i.id, i.name_he, i.description_he, i.ean, i.sku, i.brand, "
        "       i.category, i.images, i.price, i.pickup_cost, i.technical_specs "
        "FROM catalog_matches cm "
        "JOIN inventory i ON i.id = cm.inventory_id "
        "WHERE cm.verdict='missing' "
        "  AND i.ean IS NOT NULL AND length(i.ean) >= 8 "
        "  AND NOT EXISTS (SELECT 1 FROM superpharm_offers_raw sp WHERE sp.ean = i.ean) "
        "  AND i.name_he IS NOT NULL AND i.name_he <> '' "
        "  AND i.brand IS NOT NULL AND i.brand <> '' "
        "  AND i.images IS NOT NULL AND array_length(i.images,1) >= 1 "
        "ORDER BY i.id"
    )
    # PostgREST doesn't take raw SQL; fall back to direct table query w/ paging.
    out: list[dict] = []
    # First pull all "missing" inventory_ids.
    miss_ids: set[int] = set()
    offset = 0
    while True:
        u = (
            f"{SUPABASE_URL}/rest/v1/catalog_matches"
            f"?select=inventory_id&verdict=eq.missing&limit={PAGE}&offset={offset}"
        )
        rows = http_get_json(u, headers)
        if not rows:
            break
        for r in rows:
            if isinstance(r.get("inventory_id"), int):
                miss_ids.add(r["inventory_id"])
        if len(rows) < PAGE:
            break
        offset += PAGE
    print(f"missing inventory_ids: {len(miss_ids)}")

    # Pull SP raw EANs for false-positive exclusion.
    sp_eans: set[str] = set()
    offset = 0
    while True:
        u = (
            f"{SUPABASE_URL}/rest/v1/superpharm_offers_raw"
            f"?select=ean&ean=not.is.null&limit={PAGE}&offset={offset}"
        )
        rows = http_get_json(u, headers)
        if not rows:
            break
        for r in rows:
            if r.get("ean"):
                sp_eans.add(str(r["ean"]).strip())
        if len(rows) < PAGE:
            break
        offset += PAGE
    print(f"sp_offers_raw eans: {len(sp_eans)}")

    # Pull inventory in chunks of ids.
    id_list = sorted(miss_ids)
    CHUNK = 200
    for i in range(0, len(id_list), CHUNK):
        slice_ = id_list[i : i + CHUNK]
        ids_csv = ",".join(str(x) for x in slice_)
        u = (
            f"{SUPABASE_URL}/rest/v1/inventory"
            f"?select=id,name_he,description_he,ean,sku,brand,category,images,price,pickup_cost,technical_specs"
            f"&id=in.({ids_csv})&limit={CHUNK}"
        )
        rows = http_get_json(u, headers)
        for r in rows:
            ean = (r.get("ean") or "").strip()
            if not ean or len(ean) < 8:
                continue
            if ean in sp_eans:
                continue  # false-positive
            if not r.get("name_he"):
                continue
            if not r.get("brand"):
                continue
            imgs = r.get("images")
            if not imgs or not isinstance(imgs, list) or not imgs[0]:
                continue
            out.append(r)
    print(f"qualifying rows: {len(out)}")
    return out


def build_brand_index(vlists: dict) -> dict[str, str]:
    idx: dict[str, str] = {}
    for vl in vlists.get("values_lists", []):
        if vl.get("code") != "brand-brand-values":
            continue
        for v in vl.get("values", []):
            label = (v.get("label") or "").strip()
            if label:
                idx[label.upper()] = v["code"]
    return idx


def resolve_brand(raw: str | None, idx: dict[str, str]) -> str | None:
    if not raw:
        return None
    s = raw.strip().upper()
    if s in idx:
        return idx[s]
    if len(s) >= 3:
        for label, code in idx.items():
            if s in label or label in s:
                return code
    return None


def resolve_hierarchy(raw: str | None, hierarchies: list[dict]) -> str:
    if not raw:
        return FALLBACK_HIERARCHY
    target = raw.strip()
    if not target:
        return FALLBACK_HIERARCHY
    # Exact label match.
    for h in hierarchies:
        if (h.get("label") or "").strip() == target:
            return h["code"]
    # Substring match at level >= 3.
    for h in hierarchies:
        if (h.get("level") or 0) < 3:
            continue
        lbl = h.get("label") or ""
        if target in lbl or lbl in target:
            return h["code"]
    return FALLBACK_HIERARCHY


def numeric_attrs(ts: object) -> dict[str, str]:
    if not isinstance(ts, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in ts.items():
        if not isinstance(k, str) or not k.isdigit():
            continue
        if v is None or v == "":
            continue
        out[k] = str(v)
    return out


def clean_html(s: str) -> str:
    """Strip HTML entities and tags that Mirakl can't render."""
    if not s:
        return ""
    repls = [
        ("&deg;", "°"),
        ("&ndash;", "-"),
        ("&mdash;", "-"),
        ("&le;", "<="),
        ("&ge;", ">="),
        ("&amp;", "&"),
        ("&lt;", "<"),
        ("&gt;", ">"),
        ("&quot;", '"'),
        ("&nbsp;", " "),
    ]
    for a, b in repls:
        s = s.replace(a, b)
    # Remove any remaining tags.
    import re
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def round_shekel(x: float) -> int:
    return int(round(x))


def main() -> int:
    if not os.path.exists(VLISTS_PATH) or not os.path.exists(HIER_PATH):
        print(
            "Missing /tmp/sp_vlists.json or /tmp/sp_hier.json — run the curl prefetch first.",
            file=sys.stderr,
        )
        return 1
    with open(VLISTS_PATH, "r", encoding="utf-8") as f:
        vlists = json.load(f)
    with open(HIER_PATH, "r", encoding="utf-8") as f:
        hier = json.load(f).get("hierarchies", [])
    brand_idx = build_brand_index(vlists)
    print(f"brand index: {len(brand_idx)}, hierarchies: {len(hier)}")

    rows = fetch_missing_inventory()

    today = dt.date.today()
    end = today + dt.timedelta(days=SALE_DAYS)
    start_str = today.isoformat()
    end_str = end.isoformat()

    # Output columns — PM01 attached format + offer/pricing tail.
    cols = [
        "category",
        "shop_sku",
        "ean",
        "name",
        "description",
        "brand",
        "basePrice",
        "media",
        "2052",
        "5589",
        "6327",
        "logistic_class",
        "shipping_price",
        "current_price",
        "strike_price",
        "discount_start_date",
        "discount_end_date",
        "import_type",
    ]

    out_rows: list[list[str]] = []
    skipped_brand = 0
    skipped_no_price = 0

    for r in rows:
        try:
            price = float(r.get("price") or 0)
        except Exception:
            price = 0.0
        try:
            pickup = float(r.get("pickup_cost") or 0)
        except Exception:
            pickup = 0.0
        if price <= 0:
            skipped_no_price += 1
            continue

        current = round(price + pickup, 2)
        strike = round_shekel((current + SHIPPING) * STRIKE_MULT)
        if strike <= current:
            strike = round_shekel(current + 1)

        brand_code = resolve_brand(r.get("brand"), brand_idx)
        if not brand_code:
            skipped_brand += 1
            continue

        cat_code = resolve_hierarchy(r.get("category"), hier)
        extra = numeric_attrs(r.get("technical_specs"))
        media = (r.get("images") or [""])[0] or ""
        sku = f"inv:{r['id']}"

        name = clean_html(r.get("name_he") or "").replace('"', '""')
        desc = clean_html(r.get("description_he") or "").replace('"', '""')

        out_rows.append(
            [
                cat_code,
                sku,
                r["ean"].strip(),
                name,
                desc,
                brand_code,
                f"{current:.2f}",
                media,
                "",  # 2052 - SP fills "מצורפות לאריזת המוצר" auto
                extra.get("5589", ""),
                extra.get("6327", ""),
                LOGISTIC_CLASS,
                f"{SHIPPING:.2f}",
                f"{current:.2f}",
                f"{strike:.2f}",
                start_str,
                end_str,
                "official",
            ]
        )

    print(
        f"emitted: {len(out_rows)} | skipped_no_price: {skipped_no_price} | skipped_brand_unresolved: {skipped_brand}"
    )

    out_path = os.path.join(DOWNLOADS, "missing_products_pm01.csv")
    with open(out_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f, delimiter=";", quoting=csv.QUOTE_ALL)
        writer.writerow(cols)
        writer.writerows(out_rows)
    print(f"wrote: {out_path}")
    print(f"size: {os.path.getsize(out_path)} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
