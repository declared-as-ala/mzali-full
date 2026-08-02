# Current-State Audit — POS/Inventory/Suppliers/Invoicing/Loyalty Epic

Baseline for `PLAN.md` and every sprint in `tasks/pos-platform/`. This is
what actually exists in the repo today (`c:\Users\Ala\Desktop\mzali full`),
checked against what the master prompt assumes. The original migration's
audit (`docs/current-system-audit.md`) covered the WooCommerce→NestJS
cutover; this one covers readiness for the POS/inventory/loyalty epic
specifically, and it deliberately does **not** repeat facts already
established there.

## 1. Applications today

```
c:\Users\Ala\Desktop\mzali full\   — Next.js 14 App Router, ONE app
  app/                              — public storefront (produit, categorie, panier, checkout…)
  app/mzali/*                       — admin console (route group, same app)
  app/employee/*                    — employee console (route group, same app)
  app/api/*                         — BFF proxy routes to backend/
  backend/                          — NestJS API (apps/api) + worker (apps/worker) + CLI, MongoDB, Redis, MinIO
```

**Gap vs. master prompt:** the prompt assumes three separate Next.js apps
(`apps/storefront`, `apps/admin`, `apps/pos`). Reality is one Next.js app
serving storefront+admin+employee as route groups, one NestJS backend.
Resolved as **PLAN.md decision D1**: keep storefront+admin combined, add
POS as a genuinely new, separate app.

## 2. Catalog / variants

- `backend/src/catalog/product.schema.ts` — products carry `options[]`
  (label/type/values, e.g. size/color) and `bundles[]` **embedded on the
  product document**. There is no `variants` collection and no per-variant
  stock, SKU or barcode today (original migration decision D4: "No
  variants collection — options embedded on product").
- No barcode field anywhere in the catalog schema.
- Categories, media (MinIO), pricing (`regularPriceMinor`/`salePriceMinor`)
  are product-level, already solid and reusable as-is.

**Gap vs. master prompt:** §6/§7/§36 assume `variantId` is a real,
independently identifiable, stockable, scannable unit. It isn't yet — this
is the single largest schema gap. Resolved as **PLAN.md decision D2**:
introduce a real `variants` collection in Sprint 1, generated from the
existing `options` as a migration step, `productId` + `sku` + `barcode` +
`attributes` per row.

## 3. Inventory / stock

- `backend/src/inventory/inventory-item.schema.ts` — one document per
  `{productId, warehouseId}`, `warehouseId` is a free string defaulting to
  `'main'`. **Single location today**, not a real `locations` collection.
- `backend/src/inventory/stock-movement.schema.ts` — append-only ledger
  already exists and already follows "never mutate stock without a
  movement row." Types today: `migration_init, manual_adjust,
  order_reserve, order_release, order_commit, correction`.
- `backend/src/orders/order-status.ts` — `stockEffectForStatus` +
  `planStockTransition` state machine already implements reserve → commit
  → release semantics for online orders (`en-attente` reserves,
  `confirme`/`completed` commits, `annule`/`cancelled` releases/restocks).
  **This is most of master-prompt §10 already built** — Sprint 4 extends
  it to multi-location rather than building it from scratch.
- `backend/src/inventory/inventory.service.ts` +
  `inventory-admin.controller.ts` — adjust/list/movements API exists,
  single-location only.

**Gap vs. master prompt:** §5 (locations), most of §6 (per-variant, not
per-product, stock items), §17 (transfers — nothing exists),
§18 (stocktakes — nothing exists), §19 (reorder points exist as
`lowStockThreshold` only, no target/min/max, no suggested-PO quantity).
Resolved as **PLAN.md decision D3** (real `locations` collection) +
Sprint 1 (variant-level stock items) + Sprint 5 (transfers, stocktakes).

## 4. Orders / checkout

- `backend/src/orders/orders.service.ts` — checkout, status transitions,
  server-recomputed totals, idempotency, multi-status filtering (`$in`)
  are already production-solid (per the migration's own testing this
  session). Reused as-is; Sprint 4 only adds the multi-location dimension
  to the existing reserve/commit/release calls.
- Order numbering already uses an atomic `counters` collection
  (`$inc`), not `collection.count()` — matches master-prompt §39's
  requirement already, for orders. New document types (POS ticket, quote,
  invoice, PO, transfer, stocktake) need their own counters, same pattern.

## 5. Employees / auth / permissions

- `backend/src/auth/*` — JWT access (15m) + rotating refresh (30d) with
  reuse-detection, Argon2id + legacy-scrypt verify-then-rehash, roles
  (`super_admin, admin, order_manager, catalog_manager, viewer, employee`),
  `backend/src/auth/permissions.ts` permission list + guards. **No TXT/JSON
  employee storage remains** — already fully migrated (confirms
  master-prompt §50's "employee TXT storage is no longer used" acceptance
  criterion, pre-satisfied).
- No `pos.*` permissions exist yet — additive work, same pattern as
  existing `stats.read`/`customers.read` etc.
- No terminal/device-binding concept exists — net-new for POS (§42).

## 6. Customers / loyalty

- `backend/src/customers/customer.schema.ts` — guest customer records
  deduped by normalized phone, `ordersCount`/`totalSpentMinor`/
  `firstOrderAt`/`lastOrderAt`, already used by the online-order flow and
  surfaced in the new admin Clients page (`app/mzali/clients`). No
  registered-account concept, no loyalty fields — reused as the base
  identity, loyalty is layered on top via a new `loyaltyId` reference
  rather than fields bolted onto this schema (keeps the loyalty ledger
  independently auditable per master-prompt §28).
- No loyalty module exists at all — fully net-new (Sprint 8).

## 7. Media / printing / documents

- `backend/src/media/*` — MinIO client, upload, sharp variants (thumb/md
  webp), checksum dedupe. Reused directly for supplier documents, PDFs,
  ticket logos, labels (§44) — no changes needed, just new callers.
- No PDF generation exists anywhere in the backend today. Net-new
  dependency for Sprint 6 (PO PDFs) and Sprint 7 (quote/invoice PDFs).
- No printing/ticket code exists at all — fully net-new (§15, Sprint 2/9).
- No barcode generation/scanning code exists at all — net-new (Sprint 1
  for generation, Sprint 2 for POS scanning UX).

## 8. Suppliers / purchasing / quotes / invoices

None of this exists in any form today (no WooCommerce equivalent was ever
migrated, since WooCommerce doesn't have first-class supplier/PO/quote/
invoice concepts either). Fully net-new: Sprint 6 (suppliers, POs, goods
receipts) and Sprint 7 (quotes, invoices, credit notes).

## 9. Reporting / dashboard

- `backend/src/stats/*` + `components/admin/dashboard/DashboardCommandCenter.tsx`
  — dashboard KPIs, revenue series, status funnel, carrier performance,
  geography, coupon performance already exist and already use real backend
  aggregation (no mock data) — matches master-prompt §33's "no mock chart
  data" requirement as a pattern to extend, not introduce.
- No POS-specific metrics exist yet (revenue by cashier/register/payment
  method, X/Z reports) — net-new (Sprint 3), built as additions to the
  existing `StatsService` rather than a parallel reporting system.

## 10. Real-time sync

- No WebSocket/SSE infrastructure exists today. Cache invalidation today
  is Next.js `router.refresh()` / `revalidatePath` triggered by the
  client after a mutation succeeds — works for admin-console single-user
  flows, insufficient for "POS sale should instantly gray out the item on
  a different cashier's screen and on the storefront" (§16).
  Net-new: Sprint 4 (storefront sold-out sync via revalidation +
  Redis-backed webhook/SSE is enough for depot stock, which changes far
  less often than boutique stock) and Sprint 2/3 for POS-to-POS live
  updates (same-register or multi-register within one boutique).

## 11. Infrastructure

- `deploy/docker-compose.yml` + `.dev.yml` + `.prod.yml` — mongo (single-
  node replica set, required for transactions — already satisfies
  master-prompt's transaction requirement), redis, minio, api, worker,
  storefront. No `pos` service, no reverse-proxy domain routing for `pos.`
  or `admin.` subdomains (admin is BFF-served under `/mzali` on the apex
  domain per the original migration's D1).
- GitHub Actions CI already builds/tests/typechecks frontend + backend +
  contract-drift check. No POS app to add to it yet (Sprint 2 adds it).

## 12. Summary: reuse vs. build

| Area | Status | Sprint |
|---|---|---|
| Auth, permissions, sessions, audit logs | Reuse, extend with `pos.*` perms + terminal binding | 1, 2 |
| Products, categories, media, pricing | Reuse as-is | — |
| Variants, barcodes | **Net-new**, replaces embedded `options` as the stockable unit | 1 |
| Locations (DEPOT/BOUTIQUE) | **Net-new**, replaces free-string `warehouseId` | 1 |
| Stock items, movement ledger | Reuse pattern, extend to per-variant + per-location + more movement types | 1 |
| Online order reserve/commit/release | Reuse the existing state machine, extend to multi-location | 4 |
| Order numbering (atomic counters) | Reuse pattern for every new document type | 2, 6, 7 |
| Customers | Reuse as the loyalty identity anchor | 8 |
| Dashboard/reporting infra | Reuse `StatsService` pattern, extend with POS metrics | 3, 9 |
| Real-time sync | **Net-new** | 2, 4 |
| POS domain (terminals, sessions, sales, payments) | **Net-new** | 2, 3 |
| Transfers, stocktakes | **Net-new** | 5 |
| Suppliers, purchase orders, goods receipts | **Net-new** | 6 |
| Quotes, invoices, credit notes, PDF generation | **Net-new** | 7 |
| Loyalty (accounts, ledger, tiers) | **Net-new** | 8 |
| Thermal printing / local bridge | **Net-new** | 2 (HTML fallback), 9 (bridge, optional) |
| POS Next.js app + `pos.` domain | **Net-new** | 2 |

No blockers found that would force re-litigating the original migration's
architecture (BFF pattern, money-in-millimes, contract mirroring,
core-module split) — this epic builds on top of it directly.
