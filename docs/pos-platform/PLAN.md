# Mzali Unified Commerce Platform — Master Plan

**Epic:** extend Mzali Boutique from an e-commerce-only backend into a unified
commerce system covering online sales, an in-store POS, multi-location
inventory, suppliers/purchasing, quotes/invoicing and a loyalty program —
all backed by the single existing NestJS API + MongoDB database.

This plan organizes the source master prompt (`docs/pos-platform/_master-prompt.md`)
into 9 sprints, each a self-contained task file a fresh session can execute.
It also records the architectural decisions and gaps found while auditing
the *current* codebase against what the master prompt assumes — several of
its assumptions don't match reality yet, and those are called out explicitly
rather than silently overridden.

## How to use this plan

1. Read `docs/pos-platform/current-state-audit.md` first — it's the "what
   actually exists today" baseline every sprint below builds on.
2. Read the "Decisions locked" section below — these resolve the conflicts
   between the master prompt and the current codebase.
3. Work sprints in order from `tasks/pos-platform/`. Each sprint's
   Verification gate must pass before starting the next — same discipline
   as the original `tasks/TASK-01..08` migration (see `tasks/README.md`).
4. Update `progress.md` at repo root after each sprint, same convention as
   the original migration.

## Documents in this epic

```
docs/pos-platform/
  PLAN.md                        — this file
  current-state-audit.md         — what exists today vs. what the epic needs
  pos-architecture.md            — POS app, screens, terminal/register/session model
  inventory-architecture.md      — locations, stock items, movement ledger, transfers, stocktakes
  stock-business-rules.md        — reservation flow, deduction timing, stock policy
  supplier-management.md         — suppliers, purchase orders, goods receipts, cost/margin
  invoicing-and-quotes.md        — quotes, invoices, credit notes, numbering, PDFs
  loyalty-system.md              — loyalty accounts, ledger, earning/redemption, tiers
  printing-architecture.md       — thermal ticket printing, local bridge, fallback
  security-model.md              — auth, terminal binding, permissions, audit logs
  deployment-plan.md             — Docker Compose extension, domains, CI/CD

tasks/pos-platform/
  README.md                      — sprint index, same format as tasks/README.md
  SPRINT-01-foundation-inventory.md
  SPRINT-02-pos-core-sales.md
  SPRINT-03-cash-sessions-reports.md
  SPRINT-04-online-reservations-sync.md
  SPRINT-05-transfers-stocktakes.md
  SPRINT-06-suppliers-purchasing.md
  SPRINT-07-quotes-invoices.md
  SPRINT-08-loyalty.md
  SPRINT-09-reports-hardening.md
```

## 1. Business objective

Connect into one system: the online storefront, the physical boutique POS,
the depot/warehouse, administration, suppliers, purchasing, inventory,
customers, loyalty, quotes, invoices, payments and reporting.

Non-negotiable behaviors (from the master prompt, unchanged):

- A POS sale immediately affects **boutique** stock only.
- A confirmed online order immediately affects **depot** stock only.
- When depot availability for a variant reaches zero, that variant goes
  sold-out on the storefront immediately (not on the next cache refresh).
- Every application reads stock from the same NestJS API / MongoDB — no
  frontend maintains its own copy of product, stock, customer or order data.

## 2. Decisions locked (resolves master-prompt-vs-reality conflicts)

These were **not** in the master prompt as explicit choices — they're
judgment calls made while reconciling it with the actual codebase. Revisit
with the user if a sprint's implementation surfaces a reason to.

| # | Question | Decision | Why |
|---|----------|----------|-----|
| D1 | Master prompt assumes `apps/storefront`, `apps/admin`, `apps/pos` as three separate Next.js apps. Today, storefront (`app/*`) and admin (`app/mzali/*`, `app/employee/*`) are **one** Next.js app. | Keep storefront+admin combined as-is. Add POS as a **new, separate** Next.js app (`pos/` at repo root, sibling to the existing frontend and `backend/`). Do not split admin out — no requirement forces it and it would be a large, unrelated risk. | Matches "don't rewrite everything" instruction; POS has a genuinely different UX/runtime profile (kiosk-like, barcode input, printer bridge) that justifies its own app, admin does not. |
| D2 | Master prompt assumes a `variantId` on every inventory/stock/movement record. Today's catalog has **no variants collection** — `_mzem_options`/`_mzem_bundles` are embedded on the product document (decision D4 in the original migration plan), and `inventory_items`/`stock_movements` key on `productId`, not a variant. | Introduce a **real `variants` collection**, one document per sellable size/color combination, `productId` + `sku` + `barcode` + `attributes`. Existing embedded `options` become the *template* a variant is generated from; `inventory_items`/`stock_movements` gain a `variantId` (nullable during migration, backfilled, then required). | POS/barcode/label workflows are meaningless without a scannable unit smaller than "product." This is the single biggest schema change in the epic — isolated to Sprint 1 so everything after it can assume variants exist. |
| D3 | Master prompt assumes multi-location stock (`locationId`) from day one. Today `inventory_items.warehouseId` is a free string defaulting to `'main'`, single-location. | Introduce a real `locations` collection (`DEPOT`, `BOUTIQUE` seeded), replace the free-string `warehouseId` with `locationId: ObjectId`. Migrate existing `'main'` rows to `DEPOT`. | Matches master prompt section 5 exactly; today's single-warehouse model is the direct blocker for the depot/boutique split that's the whole point of this epic. |
| D4 | Master prompt's stock-movement type list (18 types) is much larger than today's (`migration_init, manual_adjust, order_reserve, order_release, order_commit, correction`). | Extend the existing enum additively — keep the current types (they're still semantically correct for online-order flows) and add the POS/transfer/purchase/loyalty-adjacent types from the master prompt. Do not rename or remove existing types (`legacy_mappings`/reports may reference them). | Additive change, zero regression risk to the already-shipped online-order stock flow. |
| D5 | Master prompt wants three public domains (`admin.`, `pos.`, plus the apex). Today only the apex domain is live in Caddy; `admin.` is commented out per the original migration's D1 (BFF pattern, admin served from the same app). | Add `pos.ahmedmzaliboutique.com` pointing at the new POS app. Leave `admin.` commented out (still BFF-served under `/mzali`) unless the user asks to split it. | Only POS strictly needs its own origin (separate app); don't open new public surface area that wasn't asked for. |
| D6 | Master prompt wants a local printing bridge for thermal receipts. | Build it as documented in `printing-architecture.md`, but treat it as an **optional Sprint 2 stretch** behind an HTML-print fallback that ships first. The POS must be usable (and print via the browser dialog) before the bridge exists. | "Do not depend exclusively on browser printing if automatic printing is required" (master prompt §15) is a production nicety, not a blocker for Sprint 2's core sale flow. |
| D7 | Master prompt assumes `variants` are generated as the cartesian product of a product's `options[]` (size × color × …). Live catalog data (checked during Sprint 1) shows this would generate up to **400 variants for a single product** (`zipper + geans`: 5 option groups) and 1,200+ across all 21 products — the options are customer-facing preference fields (with typos/encoding issues), not a real per-combination stock matrix; nothing has ever been stocked separately by size/color here. | Sprint 1 generates **exactly one variant per product** (1:1, same SKU/barcode as the product), ignoring `options[]` for stock-tracking purposes entirely. Options remain pure display/customer-choice metadata, unchanged from today. Per-size/color stock differentiation is deferred to an explicit, opt-in, product-by-product enhancement once the business identifies which products actually need it (not scheduled in any sprint below — raise it when it's needed). | Confirmed with the user directly (2026-07-18) — see chat: "One variant per product" was chosen over "first option group only" or "curate per product" specifically because the option data itself isn't reliable enough to mechanically infer a stock dimension from. |
| D8 | Master prompt's POS UX spec (§12) leads with barcode/SKU search and treats browsing as secondary. | **Touch-first browse/select is the primary POS workflow, barcode scanning is optional/future.** Cashiers browse categories → tap a product → select size/color if applicable → add to cart → pay. Sprint 2's frontend priority is an excellent image-first product grid, instant category filtering, quick search, a favorites bar, and a recently-sold rail — not a barcode-terminator listener. Every variant still carries an optional `barcode` field (Sprint 1) so scanning can be layered on later without a schema change, but it is explicitly out of Sprint 2's verification gate. | This is a clothing boutique — the user confirmed (2026-07-20) staff select products directly from the interface, they don't scan. Building barcode-first would have optimized for a workflow that doesn't match how the boutique actually sells. |

## 3. What's reused vs. new

Reused as-is (per `current-state-audit.md`):

- NestJS modular-monolith structure, the established **core-module /
  API-module split** pattern (`*-core.module.ts` for worker/CLI-safe schema
  registration, thin API wrapper module for controllers) — every new module
  in this epic follows it.
- Money convention: integer millimes everywhere in the backend, dinars only
  at the API/contract edge (`backend/src/common/money.ts`).
- Contract mirroring: `types/*.ts` (frontend, canonical) ↔
  `backend/src/contracts/*.ts`, enforced by `backend/scripts/check-contracts.mjs`.
  New contracts (`variant.ts`, `location.ts`, `pos.ts`, `supplier.ts`,
  `purchase-order.ts`, `quote.ts`, `invoice.ts`, `loyalty.ts`) are additive.
- BFF pattern: NestJS never exposed directly to a browser; each frontend
  (storefront+admin today, POS from Sprint 2) calls it via its own
  Next.js server routes with `X-Service-Token` / `Authorization: Bearer`.
- Auth: JWT access + rotating refresh tokens, Argon2id, roles/permissions
  guards (`backend/src/auth/permissions.ts`) — extended with new `pos.*`
  permissions, not replaced.
- BullMQ queues, Redis locks, MinIO media, audit-log pattern — all reused.

Net-new:

- `variants`, `locations` collections (D2, D3 above).
- POS domain: terminals, registers, cashier sessions, POS sales, POS
  payments, cash movements.
- Suppliers, purchase orders, goods receipts.
- Quotes, invoices, credit notes.
- Loyalty accounts, loyalty transaction ledger, tiers.
- Stock transfers, stocktakes.
- A new `pos/` Next.js app.
- A local printing bridge (optional, Sprint 2 stretch — see D6).

## 4. Acceptance criteria (epic-level)

Copied from the master prompt §51, unchanged — this is the epic's Definition
of Done, checked sprint by sprint via each sprint's own verification gate:

- All three domains use the same NestJS backend; no app keeps its own copy
  of product, stock, customer or order data.
- Boutique and depot stock are tracked separately; POS sales only ever move
  boutique stock; confirmed online orders only ever move depot stock.
- Pending online orders reserve depot stock; sold-out state updates on the
  storefront the moment depot availability hits zero.
- Stock transfers, adjustments and stocktakes are all traceable through the
  movement ledger — nothing mutates `quantityOnHand`/`quantityReserved`
  without a corresponding movement row.
- Suppliers, purchase orders and goods receipts work end-to-end; stock only
  increases on receipt, never on PO creation.
- Quotes convert to orders/invoices; finalized invoices are immutable
  (corrections go through credit notes).
- Cashier sessions open/close with X/Z reports; daily POS revenue is
  visible and filterable by cashier/register/payment method.
- Loyalty points move only through the ledger; refunds reverse points
  earned on the refunded value.
- Product variants carry SKU + barcode; barcodes work in POS, stocktake,
  goods receipt and transfer scanning.
- No production logic depends on WooCommerce or TXT/JSON employee files
  (already true post-migration — this epic must not reintroduce either).
- No mock revenue, stock or catalog data remains anywhere in the new UIs.

## 5. Sprint index

| Sprint | File | Delivers |
|---|---|---|
| 1 | `SPRINT-01-foundation-inventory.md` | Variants + locations collections, migration/backfill, extended movement ledger, shared contracts |
| 2 | `SPRINT-02-pos-core-sales.md` | POS app skeleton, terminal auth, product/barcode search, cart, sale creation, boutique stock deduction, HTML ticket printing |
| 3 | `SPRINT-03-cash-sessions-reports.md` | Cashier sessions, cash movements, payments, X/Z reports, daily revenue dashboard widgets |
| 4 | `SPRINT-04-online-reservations-sync.md` | Reservation-on-create / commit-on-confirm flow for online orders, storefront sold-out sync, real-time events, cache invalidation |
| 5 | `SPRINT-05-transfers-stocktakes.md` | Depot↔boutique transfer workflow, stocktake/inventory-count workflow, low-stock alerts |
| 6 | `SPRINT-06-suppliers-purchasing.md` | Suppliers, supplier-product offers, purchase orders, goods receipts, cost/margin tracking |
| 7 | `SPRINT-07-quotes-invoices.md` | Quotes, invoices, credit notes, document numbering, PDF generation |
| 8 | `SPRINT-08-loyalty.md` | Loyalty accounts, ledger, earning/redemption rules, tiers, POS + storefront UI |
| 9 | `SPRINT-09-reports-hardening.md` | Margin/slow-moving/reorder reports, printing bridge (if pursued), security/audit hardening, load/negative-stock edge cases |

## 6. Non-negotiable rules (apply to every sprint)

Same discipline as the original migration (`tasks/README.md`), plus epic-specific ones:

- The live storefront and admin console must keep working at every step —
  no sprint may regress `COMMERCE_PROVIDER=mzali-api` behavior that's
  already in production use.
- Never touch `types/*` except additively; run
  `node backend/scripts/check-contracts.mjs` after any contract change.
- Money stays integer millimes in the backend; convert only at the contract
  edge.
- Every stock mutation goes through a service method that also writes a
  `StockMovement` row in the same transaction — never a bare `$set` on
  `quantityOnHand`/`quantityReserved` from a controller or script.
- New modules follow the core-module/API-module split when they need both
  HTTP controllers and worker/CLI consumption.
- No secrets in git; `.env.local`, `deploy/.env` and `data/` stay gitignored.
- Verify with `npx tsc --noEmit` (frontend), `npm run typecheck` / `npm test`
  (backend) — not repeated full Docker rebuilds, per existing project
  convention (see memory: avoid slow builds).
- Each sprint file's Verification gate must pass, and `progress.md` gets a
  new entry, before starting the next sprint.

## 7. Reference

- Original migration plan (already executed): `C:\Users\Ala\.claude\plans\compiled-petting-hartmanis.md`
- Original migration audit: `docs/current-system-audit.md`
- Original migration task index: `tasks/README.md`
- This epic's audit: `docs/pos-platform/current-state-audit.md`
- Source master prompt for this epic (verbatim, kept for reference): `docs/pos-platform/_master-prompt.md`
