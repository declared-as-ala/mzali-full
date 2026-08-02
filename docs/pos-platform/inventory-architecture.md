# Inventory Architecture

Covers master-prompt §5–§9, §17–§19. Extends the existing
`backend/src/inventory/*` module rather than replacing it — see
`current-state-audit.md` §3 for what's already there.

## Collections

### `locations` (new)

```typescript
// backend/src/inventory/location.schema.ts
{
  code: string;              // 'DEPOT' | 'BOUTIQUE' | future codes, unique
  name: string;
  type: 'WAREHOUSE' | 'STORE';
  address?: Address;
  active: boolean;
  isDefaultOnlineLocation: boolean;   // exactly one true at a time
  isDefaultPosLocation: boolean;      // exactly one true at a time
  allowOnlineFulfillment: boolean;
  allowPosSales: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

Seed migration creates exactly two rows: `DEPOT` (warehouse,
`isDefaultOnlineLocation: true`, `allowOnlineFulfillment: true`) and
`BOUTIQUE` (store, `isDefaultPosLocation: true`, `allowPosSales: true`).

### `variants` (new — see `PLAN.md` decision D2)

```typescript
// backend/src/catalog/variant.schema.ts
{
  productId: string;         // ref Product
  sku: string;                // unique
  barcode: string | null;     // unique, sparse (not every variant has one yet)
  attributes: Record<string, string>;  // { size: 'M', color: 'Rouge' }
  active: boolean;
  sellingPriceMinor: number | null;    // null = inherit product price
  compareAtPriceMinor: number | null;
  lastPurchaseCostMinor: number | null;
  averageCostMinor: number | null;
  createdAt: Date;
  updatedAt: Date;
}
```

Migration step (Sprint 1, see `PLAN.md` decision D7): every product gets
**exactly one variant** (1:1, `attributes: {}`, same effective SKU as the
product), regardless of `options[]` — the live catalog's options are
customer-facing preference fields, not a reliable per-combination stock
matrix (one product alone resolves to 400 cartesian combinations), so
generating a variant per combination would produce nonsense. `options[]`
stays exactly as it is today, pure display metadata, untouched by this
migration. Every stock/movement row still uniformly keys on `variantId` —
no special-casing "simple product" vs "variable product" downstream — the
schema is ready for real per-combination variants the moment a specific
product actually needs them; nothing about `variants`/`stock_items`
requires the 1:1 assumption to hold forever, it's just what Sprint 1
populates.

### `stock_items` (extends existing `inventory_items`)

```typescript
// backend/src/inventory/stock-item.schema.ts — renamed from inventory-item.schema.ts
{
  variantId: string;          // was productId
  locationId: string;         // was warehouseId (free string) → ObjectId ref
  quantityOnHand: number;
  quantityReserved: number;
  // quantityAvailable is computed, not stored (avoids drift) — see below
  reorderPoint: number;
  targetStockLevel: number | null;
  lowStockThreshold: number | null;   // already exists, kept
  averageCostMinor: number | null;
  lastPurchaseCostMinor: number | null;
  updatedAt: Date;
}
```

Unique compound index `{variantId: 1, locationId: 1}` (already the pattern
used for `{productId, warehouseId}` today — unchanged shape, new fields).

`quantityAvailable` is **not** a stored field — every read computes
`quantityOnHand - quantityReserved` at query time (aggregation `$subtract`
or a Mongoose virtual). Storing it invites drift between three numbers
that must always agree; two is enough.

### `stock_movements` (extends existing, additive)

Add `variantId`/`locationId` (replacing `productId`/`warehouseId`, same
migration as stock items) and extend the `type` enum additively:

```typescript
export const STOCK_MOVEMENT_TYPES = [
  // existing — unchanged
  'migration_init', 'manual_adjust', 'order_reserve', 'order_release', 'order_commit', 'correction',
  // new
  'pos_sale', 'purchase_receipt', 'return_restock', 'refund_restock',
  'exchange_out', 'exchange_in', 'transfer_out', 'transfer_in',
  'damage', 'loss', 'stocktake_correction', 'supplier_return',
] as const;
```

Every write path (POS sale, transfer, goods receipt, stocktake post,
refund, exchange) calls one shared `StockLedgerService.applyMovement(...)`
— never a bare `updateOne` on `stock_items` — so the "never mutate stock
without a movement row" invariant is enforced in one place, not
re-implemented per module.

## Stock policy (master-prompt §9)

```typescript
// backend/src/settings — new setting key 'inventory.stockPolicy'
type StockPolicy = 'DEPOT_ONLY' | 'BOUTIQUE_ONLY' | 'COMBINED_LOCATIONS' | 'PRIORITY_LOCATIONS';
```

Default `DEPOT_ONLY`. The storefront-availability calculation
(`ProductsService`/catalog read path) resolves "is this variant buyable
online" through one function, `resolveOnlineAvailability(variantId,
policy)`, so changing the policy later doesn't require touching every
call site.

## Migration ordering (Sprint 1)

1. Create `locations`, seed `DEPOT`/`BOUTIQUE`.
2. Create `variants` from existing product `options[]`.
3. Rename/migrate `inventory_items` → `stock_items`: for every existing
   row (`productId`, `warehouseId: 'main'`), resolve the product's default
   variant and set `locationId = DEPOT` (all existing stock is online/depot
   stock today — there is no boutique concept yet, so nothing moves to
   BOUTIQUE in this migration; BOUTIQUE starts at zero and gets stocked via
   Sprint 5 transfers or a manual `INITIAL_IMPORT` if the business provides
   a physical count).
4. Migrate `stock_movements` the same way (`productId`→`variantId`,
   `warehouseId`→`locationId`).
5. Backfill `orders.items[].productId` references to also carry
   `variantId` where resolvable (best-effort; historical orders predate
   variants and may only resolve to the product's default variant).
6. Run `migrate:verify`-style checks (same pattern as the original
   WooCommerce migration): row counts match pre/post, no stock item lost
   its `quantityOnHand`/`quantityReserved`.

## API surface (new + extended)

```
GET  /api/v1/admin/inventory/locations
POST /api/v1/admin/inventory/locations
GET  /api/v1/admin/inventory/variants/:variantId
GET  /api/v1/admin/inventory/variants/:variantId/stock       — all locations
GET  /api/v1/admin/inventory/movements?variantId=&locationId=&type=
POST /api/v1/admin/inventory/adjustments                     — manual_adjust, requires reason
```

(Transfers and stocktakes get their own endpoints — see
`SPRINT-05-transfers-stocktakes.md`.)

## Frontend: stock overview page (master-prompt §35)

New admin page `app/mzali/stock` already exists in skeleton form from the
original migration (`components/admin/StockView.tsx`, single-location).
Sprint 1 extends its columns to show both locations side by side per the
row shape in master-prompt §35, and adds the view filters (all/depot/
boutique/low/out-of-stock/negative/reserved/pending-transfer/incoming-
purchase/slow-moving/no-movement/recently-adjusted) as query-param-driven
tabs, matching the existing `CommandesView.tsx` tab pattern.
