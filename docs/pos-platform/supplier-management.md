# Supplier Management & Purchasing

Covers master-prompt §20–§23. Fully net-new (`current-state-audit.md` §8)
— delivered in `SPRINT-06-suppliers-purchasing.md`.

## Collections

### `suppliers`

```typescript
// backend/src/suppliers/supplier.schema.ts
{
  code: string;               // unique, e.g. SUP-0001
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  secondaryPhone: string | null;
  taxIdentifier: string | null;
  registrationNumber: string | null;
  billingAddress: Address | null;
  warehouseAddress: Address | null;
  paymentTermsDays: number | null;
  preferredPaymentMethod: string | null;
  currency: 'TND';
  leadTimeDays: number | null;
  minimumOrderMinor: number | null;
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  notes: string | null;
  documentMediaIds: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

### `supplier_variant_offers`

One row per (supplier, variant) — a variant can have multiple offers, one
per supplier, with the `preferred` flag marking the default for
suggested-PO generation:

```typescript
{
  supplierId: string;
  variantId: string;
  supplierSku: string | null;
  purchasePriceMinor: number;
  minimumOrderQuantity: number;
  packSize: number;
  leadTimeDays: number | null;
  preferred: boolean;
  lastPurchaseDate: Date | null;
}
```

Unique index `{supplierId, variantId}`.

### `purchase_orders`

```typescript
{
  purchaseOrderNumber: string;    // PO-2026-000001, atomic counter — see below
  supplierId: string;
  destinationLocationId: string;  // usually DEPOT
  orderDate: Date;
  expectedDeliveryDate: Date | null;
  currency: 'TND';
  lines: PurchaseOrderLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
  paymentTerms: string | null;
  internalNotes: string | null;
  supplierNotes: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'CONFIRMED_BY_SUPPLIER' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED' | 'CLOSED';
  statusHistory: { from: string | null; to: string; by: Actor; at: Date }[];
  createdBy: string;
  approvedBy: string | null;
}

type PurchaseOrderLine = {
  variantId: string;
  supplierSku: string | null;
  descriptionSnapshot: string;   // product+variant name at PO time, immutable
  orderedQuantity: number;
  receivedQuantity: number;      // denormalized running total, source of truth is goods_receipts
  unitCostMinor: number;
  discountMinor: number;
  taxMinor: number;
  lineTotalMinor: number;
};
```

### `goods_receipts`

```typescript
{
  goodsReceiptNumber: string;     // GR-2026-000001
  purchaseOrderId: string;
  supplierId: string;
  locationId: string;
  receivedDate: Date;
  receivedBy: string;
  lines: GoodsReceiptLine[];
  attachments: string[];          // MinIO media ids
  notes: string | null;
  status: 'DRAFT' | 'POSTED';
}

type GoodsReceiptLine = {
  variantId: string;
  orderedQuantity: number;
  previouslyReceived: number;
  receivedNow: number;
  damagedQuantity: number;
  rejectedQuantity: number;
  acceptedQuantity: number;       // receivedNow - damagedQuantity - rejectedQuantity
  batchReference: string | null;
  unitCostMinor: number;
};
```

## The one rule that matters most (master-prompt §22)

**Stock increases on goods receipt, never on PO creation or submission.**
`PurchaseOrdersService.create()` and `.submit()` only ever write to
`purchase_orders` — no call into `StockLedgerService`. Only
`GoodsReceiptsService.post()` calls `StockLedgerService.applyMovement(...,
type: 'purchase_receipt', locationId)`, inside the same transaction that:

1. Increases `stock_items.quantityOnHand` at the receipt's `locationId`.
2. Updates the PO line's `receivedQuantity` and rolls the PO status to
   `PARTIALLY_RECEIVED` or `RECEIVED`.
3. Updates the variant's `lastPurchaseCostMinor` (and optionally
   `averageCostMinor` via weighted average — see below).
4. Updates the supplier-offer's `lastPurchaseDate`.

## Cost tracking (master-prompt §23)

`averageCostMinor` uses a simple weighted-moving-average on each posted
receipt:

```
newAverage = (existingOnHand * existingAverage + receivedQty * receiptUnitCost)
             / (existingOnHand + receivedQty)
```

Computed inside the same goods-receipt transaction, on the variant's
`stock_items` row (or a variant-level cost field if cost should be
location-independent — decide at Sprint 6 kickoff based on whether the
business buys the same variant from different suppliers at meaningfully
different prices per location; default assumption is **cost is
variant-level, not location-level**, since it's the same physical goods).

Margin reports (`grossMarginMinor = netSellingPriceMinor - costMinor`) sit
in `SPRINT-09-reports-hardening.md`, reusing the existing `StatsService`
aggregation pattern. Cost visibility is gated behind a new
`inventory.view_cost` permission — cashiers don't get it by default
(master-prompt §23's explicit requirement).

## Document numbering

Purchase orders and goods receipts use the same atomic-counter pattern
already proven for order numbers (`backend/src/database/counters.service.ts`
— reused directly, one counter key per document type: `po`, `gr`). Never
`collection.countDocuments()` for a number (master-prompt §39).

## API surface

```
GET    /api/v1/admin/suppliers
POST   /api/v1/admin/suppliers
GET    /api/v1/admin/suppliers/:id
PATCH  /api/v1/admin/suppliers/:id
GET    /api/v1/admin/suppliers/:id/offers
POST   /api/v1/admin/suppliers/:id/offers

GET    /api/v1/admin/purchase-orders
POST   /api/v1/admin/purchase-orders
POST   /api/v1/admin/purchase-orders/:id/submit
POST   /api/v1/admin/purchase-orders/:id/approve
POST   /api/v1/admin/purchase-orders/:id/cancel

POST   /api/v1/admin/goods-receipts             — creates + posts in one call (draft state is optional UX, not required)
GET    /api/v1/admin/goods-receipts?purchaseOrderId=
```

## Admin UI (master-prompt §34 "Purchasing" nav section)

New route group `app/mzali/suppliers`, `app/mzali/purchase-orders`,
`app/mzali/goods-receipts`, following the exact page/component split
already established by `app/mzali/produits` + `ProduitsView.tsx` +
`ProductDrawer.tsx` (server page fetches initial data, client view handles
list/filter/drawer-based create-edit). Low-stock-triggered PO suggestions
(master-prompt §21 "create from low-stock suggestions") link out from the
stock overview page's low-stock view (`inventory-architecture.md`).
