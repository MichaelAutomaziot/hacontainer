---
register: product
---

# PRODUCT.md — הקונטיינר Catalog Sync Dashboard

## Product purpose

Internal operations console for הקונטיינר (The Container, Israeli home-goods retailer). One job: push products from the source storefront (Konimbo) to the Super-Pharm marketplace via Mirakl, find missing SKUs, validate against marketplace rules (pricing, shipping, promo dates, Hebrew copy, barcodes, images), and triage rejections.

Not a metrics product. Not a customer-facing surface. The user is mid-task: comparing catalogs, fixing offers, hitting "upload" and watching jobs run. Throughput and trust are the goals.

## Users

**Primary: ops/merchandiser at הקונטיינר.** Fluent Hebrew, comfortable with Excel-class density, not a developer. Spends day inside this dashboard plus Konimbo admin and Super-Pharm seller portal in adjacent tabs. Recognizes when a row "looks wrong" but won't read API docs to figure out why.

**Secondary: Automaziot integrator (PM/dev).** Hebrew + English. Watches sync jobs, reads Supabase rows, fixes pipeline issues. Needs visibility into rules engine, validation errors, deployed workflow URLs.

**Almost never:** end customers, executives wanting KPIs.

## Surfaces (what's actually built)

- **Upload board** (`/board/upload`): primary surface. Pick missing/queued products, upload to Super-Pharm. Per-row PM01 readiness drawer, validation checklist, single-product upload dialog.
- **Catalog board** (`/board/catalog`): tabs for inventory, comparison vs Super-Pharm, SP offers, categories.
- **Settings board** (`/board/settings`): tabs for pricing rules, operator custom fields, sync job history.
- **Legacy routes** (shipments, suppliers, analytics, users): bookmark-only, hidden from primary nav.

## Brand

הקונטיינר is a no-frills Israeli home-goods brand. Practical, value-driven, not aspirational. The dashboard isn't customer-facing so brand voice is muted, but the product should feel built for an Israeli operations team, not a generic English SaaS template translated to Hebrew.

- **Language**: Hebrew RTL primary. Mixed Hebrew + Latin SKUs/EANs/URLs allowed.
- **Tone**: direct, operational, no marketing fluff. Labels say what fields are, not what they could do.
- **Color baseline**: light canvas (`#f6f5f2`/`#fbfcf8`), ink (`#1b2422`), single accent, currently blue (`#2563eb`, MUI primary). Status colors: green/gold/red semantic.
- **Typography**: Assistant (body) + Rubik (display), both Google Fonts, RTL-tuned.
- **Density**: dashboard data, not dashboard art. Tables and DataGrid carry most of the work.

## Anti-references (what to NOT look like)

- **Generic SaaS-cream landing-style admin** (Stripe-clone, Linear-clone with hero gradients). This is an internal tool, not a pitch.
- **English-first templates with retrofitted RTL**. RTL must feel native: form labels right-aligned, icons mirrored, scrollbar on the correct edge, drawer enters from the correct side.
- **Metric-first dashboards** (big number + tiny label + sparkline grid). User isn't browsing KPIs, they're processing rows.
- **Decorative motion**, glassmorphism, gradient text, side-stripe accents on cards, modal-as-first-thought.
- **Hebrew-as-an-afterthought**: punctuation drifting LTR, mixed icon sides, text overflowing the wrong edge in tables.

## Strategic principles

1. **Throughput beats prettiness.** Every screen optimizes for the next 50 rows the operator processes, not the first one a stakeholder sees.
2. **Density is a feature.** Standard MUI DataGrid density is fine. Tables can run wide.
3. **Fail loud, recover gracefully.** Validation errors and Mirakl rejections must land where the user is, not in a separate "alerts" tab.
4. **One accent, one canvas.** Restrained color strategy. Blue ≤10% of pixels. Status colors only on status.
5. **No invented affordances.** Standard sidebar + topbar + tabbed boards. Familiar patterns are features here.
6. **Hebrew/RTL is structural, not skinned.** Direction lives in layout, not in CSS overrides.

## Register

**product** (admin/operational tool; design serves the task; design IS NOT the product).
