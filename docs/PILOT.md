# Pilot Acceptance Protocol — Ran Faina × HaContainer → Super-Pharm

## Commercials

- Total: **7,500 ILS + VAT**
- Schedule: **20% on signature / 80% on sample acceptance**
- Hard deadline: **12 May 2026**

## Acceptance criteria (to confirm with Ran in writing before day 1)

1. Source: HaContainer (`https://www.hacontainer.co.il`) ~4,700 products.
2. Destination: Super-Pharm Marketplace via Mirakl (`https://superpharm-prod.mirakl.net`).
3. Pilot scope (revised 2026-05-05): **all `catalog_matches.verdict='missing'` rows** uploaded in one OF01 import. Scope went from a 50-product gate to a full-batch upload after the EAN dedupe pass found ~2,668 missing products. The original 50 number stays as the *minimum* gate; everything beyond is incremental upside.
4. Sample qualifies as "approved" when **all** of:
   - At least 50 of the uploaded offers show state `active` in Super-Pharm (the contractual minimum).
   - Each meets Peri's product spec (white-bg images ≥ 300×300, no commercial language in name/description, required category attributes filled, EAN populated where Mirakl requires it).
   - Pricing matches the locked rules (see below).
   - Ran signs `/pilot/report` PDF acknowledging the sample.

## Pricing rules (Super-Pharm)

| Rule | Value | Source |
|---|---|---|
| `current_price` | HaContainer sale price + per-product `pickup_cost` | call 28 Apr |
| `shipping_cost` | **39 ILS** always | call 28 Apr |
| `strike_price` | `current_price × 1.15`, rounded to whole shekel | call 28 Apr |
| Discount window | upload date → upload date + 30 days | call 28 Apr |
| Skip extras | express, distant_area, kibbutz, above_2nd_floor | call 28 Apr |
| Price match | If competitor offer < ours, match lowest (still + 39 ILS shipping) | call 28 Apr (Yossi suggestion confirmed by Ran) |

## What ships in D2 hub MVP (in scope by 12 May)

- One product entry form (`/products/new`) driving the dispatcher → Super-Pharm only.
- Pricing rules CRUD UI (`/settings/rules`).
- Channel adapter interface live; stub adapters in place for Zap / Walla / Ace.
- Inventory sync: HaContainer → Super-Pharm, hourly.
- Price-match cron (every 6h) against current SP competitor offers.

## Out of scope for the pilot (post-payment)

- Zap / Walla / Ace channel adapters.
- AI scan of KSP / Mahsanei Hashmal for missing-product detection.
- Auto-fix image pipeline (background removal). Pilot uses **resize-only** per locked decision.

## 12-day execution map

See plan file at `~/.claude/plans/c-users-downloads-ran-supabase-client-s-inherited-meteor.md` § Timeline.

## Decision log

| Date | Decision | Source |
|---|---|---|
| 2026-04-30 | Both D1 + D2 by 12 May | user (auto-mode pre-plan) |
| 2026-04-30 | Sitemap scraper now, Konimbo API later | user (auto-mode pre-plan) |
| 2026-04-30 | Image pipeline = resize only; expect SP rejection ping-pong | user (auto-mode pre-plan) |
| 2026-04-30 | Reuse existing `inventory` table as master product table; sidecar new tables | scaffold note |
| 2026-04-30 | DB schema migration `add_product_hub_schema` applied | Supabase MCP |
| 2026-04-30 | Pricing-rule seed `seed_superpharm_pricing_rules` blocked pending user OK | sandbox denial |
