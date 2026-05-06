#!/usr/bin/env python3
"""
Backfill internal EAN-13 codes for inventory rows that lack a valid EAN.

Scheme:
  EAN-13 = "299" + zero-padded(id, 9) + GS1-checksum
  Prefix "299" lies in the GS1-reserved internal/in-store range (200-299),
  so it cannot collide with any real manufacturer-issued EAN. Deriving the
  body from inventory.id makes generation deterministic and collision-free
  by construction. We still verify against the existing EAN universe before
  writing, in case someone already hand-typed a 299-prefixed EAN.

Update is applied via a single PostgREST PATCH per row (rate-limited but
simple); 3-4k rows ~ 2-3 minutes.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request

SUPABASE_URL = "https://zkwkuexvftxdwsdamewx.supabase.co"
SR_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inprd2t1ZXh2ZnR4ZHdzZGFtZXd4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQ1NjMxMSwiZXhwIjoyMDkzMDMyMzExfQ.grB0FVNj8Zl5FtYra6r7bQGzIBF7SPCtv74GlGu6iKM"
PAGE = 1000

PREFIX = "299"


def http_json(method: str, url: str, headers: dict, body: bytes | None = None) -> tuple[int, object]:
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8")
            try:
                return resp.status, json.loads(text) if text else None
            except json.JSONDecodeError:
                return resp.status, text
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return e.code, body


def fetch_existing_eans() -> set[str]:
    headers = {"apikey": SR_KEY, "Authorization": f"Bearer {SR_KEY}", "Accept": "application/json"}
    out: set[str] = set()
    for table in ("inventory", "superpharm_offers_raw"):
        offset = 0
        while True:
            u = f"{SUPABASE_URL}/rest/v1/{table}?select=ean&ean=not.is.null&limit={PAGE}&offset={offset}"
            code, rows = http_json("GET", u, headers)
            if code != 200 or not isinstance(rows, list):
                print(f"fetch {table}: {code}", file=sys.stderr)
                break
            for r in rows:
                v = (r.get("ean") or "").strip()
                if v:
                    out.add(v)
            if len(rows) < PAGE:
                break
            offset += PAGE
    return out


def fetch_rows_needing_ean() -> list[int]:
    headers = {"apikey": SR_KEY, "Authorization": f"Bearer {SR_KEY}", "Accept": "application/json"}
    ids: list[int] = []
    offset = 0
    while True:
        # Need: ean IS NULL OR length < 8. PostgREST supports `or=(ean.is.null,ean.like....)`.
        u = (
            f"{SUPABASE_URL}/rest/v1/inventory?select=id,ean"
            f"&order=id&limit={PAGE}&offset={offset}"
        )
        code, rows = http_json("GET", u, headers)
        if code != 200 or not isinstance(rows, list):
            print(f"inventory fetch: {code}", file=sys.stderr)
            break
        for r in rows:
            ean = (r.get("ean") or "").strip()
            if not ean or len(ean) < 8:
                ids.append(r["id"])
        if len(rows) < PAGE:
            break
        offset += PAGE
    return ids


def gs1_check_digit(body12: str) -> int:
    assert len(body12) == 12 and body12.isdigit()
    s = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(body12))
    return (10 - s % 10) % 10


def make_ean(inv_id: int) -> str:
    # 3-digit prefix + 9-digit zero-padded id + 1-digit checksum = 13.
    body12 = f"{PREFIX}{inv_id:09d}"
    assert len(body12) == 12
    return body12 + str(gs1_check_digit(body12))


def patch_ean(inv_id: int, ean: str) -> int:
    headers = {
        "apikey": SR_KEY,
        "Authorization": f"Bearer {SR_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    u = f"{SUPABASE_URL}/rest/v1/inventory?id=eq.{inv_id}"
    body = json.dumps({"ean": ean}).encode("utf-8")
    code, _ = http_json("PATCH", u, headers, body)
    return code


def main() -> int:
    print("fetching existing EAN universe...", flush=True)
    existing = fetch_existing_eans()
    print(f"existing EANs: {len(existing)}")

    print("scanning inventory for rows missing EAN...", flush=True)
    needing = fetch_rows_needing_ean()
    print(f"rows needing EAN: {len(needing)}")

    if not needing:
        return 0

    # Verify ID-derived EANs don't collide with existing universe.
    plan: list[tuple[int, str]] = []
    collisions = 0
    for inv_id in needing:
        ean = make_ean(inv_id)
        if ean in existing:
            collisions += 1
            # Salt with id*7 + offset; very unlikely path.
            for k in range(1, 100):
                alt = make_ean(inv_id * 7 + k)
                if alt not in existing:
                    ean = alt
                    break
        plan.append((inv_id, ean))
        existing.add(ean)
    print(f"plan: {len(plan)} inserts, {collisions} prefix collisions handled")

    # Apply.
    ok = 0
    fail = 0
    t0 = time.time()
    for i, (inv_id, ean) in enumerate(plan, 1):
        code = patch_ean(inv_id, ean)
        if code in (200, 204):
            ok += 1
        else:
            fail += 1
            print(f"  fail id={inv_id}: HTTP {code}", file=sys.stderr)
        if i % 250 == 0:
            elapsed = time.time() - t0
            print(f"  progress {i}/{len(plan)} (ok={ok}, fail={fail}) elapsed={elapsed:.1f}s", flush=True)
    print(f"DONE — ok={ok}, fail={fail}, total={len(plan)}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
