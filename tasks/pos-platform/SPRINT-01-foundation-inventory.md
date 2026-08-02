# SPRINT 01 — Foundation: variants, locations, extended stock ledger

You are a senior NestJS/MongoDB engineer extending the Mzali platform.
Repo root: `c:\Users\Ala\Desktop\mzali full`. This is the first sprint of
the POS/inventory/suppliers/invoicing/loyalty epic — read
`docs/pos-platform/PLAN.md` and `docs/pos-platform/current-state-audit.md`
in full before starting, they explain why this sprint exists and the
decisions (D1–D6) that shape it. Do not modify the storefront's visible
behavior; `COMMERCE_PROVIDER=mzali-api` stays fully functional throughout.

## Read first

- `docs/pos-platform/inventory-architecture.md` — the target schemas for
  this sprint, in full.
- `docs/pos-platform/stock-business-rules.md` — the invariants every
  future sprint (and this one) must preserve.
- `backend/src/catalog/product.schema.ts` — current `options[]`/`bundles[]`
  shape to generate variants from.
- `backend/src/inventory/inventory-item.schema.ts`,
  `backend/src/inventory/stock-movement.schema.ts` — what's being extended,
  not replaced.
- `backend/src/orders/order-status.ts` — the existing
  `stockEffectForStatus`/`planStockTransition` state machine this sprint
  must not break (Sprint 4 wires it to multi-location, this sprint only
  needs it to keep working against the renamed/extended schema).
- `backend/src/migration/commands/*` — the established pattern for
  idempotent, `--dry-run`-capable, checksum-based migration commands (this
  sprint's data migration follows the exact same shape).

## Build

### `backend/src/catalog/location.schema.ts` + `locations` module

Schema per `inventory-architecture.md` §"locations". Follow the
core/API-module split (`LocationsCoreModule` for schema registration,
`LocationsModule` wrapping the admin controller) since inventory
adjustments from the worker (Sprint 5 transfers) will need this schema
without pulling in `AuthModule`.

Seed exactly two rows via a migration command (`migrate:seed-locations`,
idempotent — upsert by `code`): `DEPOT` (type `WAREHOUSE`,
`isDefaultOnlineLocation: true`, `allowOnlineFulfillment: true`,
everything else false) and `BOUTIQUE` (type `STORE`,
`isDefaultPosLocation: true`, `allowPosSales: true`, everything else
false).

### `backend/src/catalog/variant.schema.ts`

Schema per `inventory-architecture.md` §"variants". Per `PLAN.md` decision
D7 (confirmed with the user after auditing the live catalog — one product's
`options[]` alone would cartesian-product to 400 combinations, and the
option data isn't a real stock matrix), variant generation is **not**
cartesian — it's one variant per product, always. Add a
`ProductVariantsService` with:

- `generateDefaultVariant(productId)` — creates exactly one `Variant` for
  the product: `attributes: {}`, `sku: product.sku ?? product.slug`
  (falls back to the slug when the product has no explicit SKU — every
  product in the live catalog has a slug, not all have a SKU). Idempotent
  — re-running for an already-generated product is a no-op (check for an
  existing variant by `productId` first, never create a second one).
- Admin CRUD for editing a variant's `sku`/`barcode`/price overrides
  post-generation (`app/mzali/produits` product drawer gains a "Variants"
  tab — see Frontend section below). `options[]` is untouched by this
  service — it stays exactly as it is today, pure customer-facing
  display metadata.

Migration command `migrate:generate-variants` (idempotent, `--dry-run`)
runs `generateDefaultVariant` for every active product.

### `backend/src/inventory/` — rename and extend

Rename `inventory-item.schema.ts` → `stock-item.schema.ts` (collection
name `stock_items`, not `inventory_items` — this is a breaking rename,
handled entirely through the migration below, no dual-write period
needed since this hasn't shipped to any external consumer). Fields per
`inventory-architecture.md` §"stock_items": `productId`→`variantId`,
`warehouseId`→`locationId` (ObjectId ref), drop the stored
`quantityAvailable` if it existed, compute on read via a Mongoose virtual
or aggregation `$subtract`. Unique index `{variantId, locationId}`.

Extend `stock-movement.schema.ts`'s `type` enum additively per
`inventory-architecture.md` (keep every existing value, add the new
POS/transfer/purchase/loyalty-adjacent ones). Rename `productId`→
`variantId`, `warehouseId`→`locationId`.

Introduce `StockLedgerService.applyMovement(...)` as the **single** write
path for any stock mutation (wraps what today's ad hoc reserve/commit/
release calls in `orders.service.ts` do inline) — this sprint refactors
those existing call sites to go through it, without changing their
observable behavior. Every future sprint's stock mutation (POS sale,
transfer, goods receipt, stocktake, refund) calls this same service.

### Data migration (`backend/src/migration/commands/migrate-inventory-foundation.command.ts`)

Idempotent, `--dry-run`-capable, following the existing migration
commands' shape (`legacy_mappings`-style tracking isn't needed here since
this is an internal schema migration, not an external-source import — use
a simple "already migrated" marker instead, e.g. a `settings` key
`migrations.inventoryFoundation.completedAt`).

1. Ensure locations seeded (calls the locations seed command).
2. Ensure variants generated for every product (calls the variant
   generation command).
3. For every existing `inventory_items` row: resolve the product's default
   (or only) variant, write a `stock_items` row at `locationId=DEPOT` with
   the same `onHand`→`quantityOnHand`, `reserved`→`quantityReserved`,
   `lowStockThreshold` carried over.
4. For every existing `stock_movements` row: same `productId`→`variantId`
   resolution, `warehouseId: 'main'`→`locationId=DEPOT`.
5. Best-effort backfill `orders.items[].variantId` from `productId` (set
   to the product's default variant where resolvable).
6. Verification step (`migrate:verify-inventory-foundation`): row counts
   match, no stock item's `onHand`/`reserved` values changed during
   migration (sum before == sum after per product).

### Contracts

New `backend/src/contracts/location.ts`, `backend/src/contracts/variant.ts`
mirroring new `types/location.ts`, `types/variant.ts` (additive — run
`node backend/scripts/check-contracts.mjs` after). Extend
`types/dashboard.ts`/`contracts/stats.ts` only if a field name actually
changes (it shouldn't — `StatsService`'s existing queries keep working
unmodified against the renamed schema, since Mongoose field names in the
aggregations get updated, not the contract shapes).

### Frontend

- `components/admin/ProductDrawer.tsx` gains a "Variants" tab: list
  generated variants, edit SKU/barcode/price-override per row, matching
  the existing tab pattern already in that component.
- `components/admin/StockView.tsx` (`app/mzali/stock`) — extend its query/
  columns to show `variantId`+`locationId` instead of product-only,
  per `inventory-architecture.md` §"Frontend: stock overview page". Full
  location-comparison columns (depot vs. boutique side by side) land in
  Sprint 5 once BOUTIQUE actually has stock to show — this sprint just
  needs the page to not break against the renamed schema.

## Tests

- `generateDefaultVariant` produces exactly one variant per product,
  regardless of how many `options[]` groups/values it has (including the
  worst-case live product with 5 option groups / 400 theoretical
  combinations — must still yield exactly 1 variant).
- Migration is idempotent — running it twice produces zero additional
  writes on the second run.
- `onHand`/`reserved` sums are preserved exactly across the migration
  (property-based check across all migrated products).
- `StockLedgerService.applyMovement()` always writes exactly one
  `stock_movements` row per call, and the resulting `stock_items` values
  match the movement's `quantityBefore`/`quantityAfter`.
- Existing online-order reserve/commit/release integration tests (from
  the original migration, `backend/src/orders/*.spec.ts`) still pass
  unmodified against the renamed schema.

## Verification gate

`npm run check:contracts && npm run typecheck && npm run lint && npm test`
green in `backend/`. `npx tsc --noEmit` green at repo root. Full
`docker compose` dev stack boots; `migrate:generate-variants --dry-run`
and `migrate:inventory-foundation --dry-run` report sane counts against
the live dev database before running for real; post-migration,
`/mzali/produits` and `/mzali/stock` load without error and show the same
effective stock numbers as before the migration.

## Do NOT

- Drop or rename `stock_movements` history — this is a schema migration of
  field names, not a data-loss event; every existing row must survive with
  its `variantId`/`locationId` correctly resolved.
- Let any code path outside `StockLedgerService` write to `stock_items`.
- Invent BOUTIQUE stock quantities — BOUTIQUE starts at zero for every
  variant; it gets populated later via Sprint 5 transfers or a manual
  count the business provides.
