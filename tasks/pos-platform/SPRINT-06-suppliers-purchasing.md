# SPRINT 06 — Suppliers, purchase orders, goods receipts, cost tracking

You are a senior NestJS + Next.js engineer extending the Mzali platform.
Repo root: `c:\Users\Ala\Desktop\mzali full`. SPRINT-01's gate must pass
first. Independent of Sprints 2–5 otherwise — can run in parallel with
them if the team splits work, since suppliers/POs don't touch the POS or
storefront at all.

## Read first

- `docs/pos-platform/supplier-management.md` — full schema/flow spec for
  this sprint, read it in full before starting.
- `backend/src/database/counters.service.ts` — the atomic-counter pattern
  to reuse for `PO-`/`GR-` numbering.
- `backend/src/inventory/stock-ledger.service.ts` — the single write path
  goods receipts call into.
- `backend/src/media/*` — MinIO upload pattern to reuse for supplier
  documents/attachments (no changes needed there, just new callers).

## Build — backend (`backend/src/suppliers/`, `.../purchase-orders/`, `.../goods-receipts/`)

Schemas exactly as specified in `docs/pos-platform/supplier-management.md`
(`suppliers`, `supplier_variant_offers`, `purchase_orders`,
`goods_receipts`). Core/API module split for `purchase-orders` (goods
receipts posting could eventually run from a worker job for large
batch imports — split now to avoid a later refactor).

### The one rule that matters most

`PurchaseOrdersService` never calls `StockLedgerService`. Only
`GoodsReceiptsService.post()` does — inside one transaction: increase
`stock_items.quantityOnHand` at the receipt's `locationId` via
`applyMovement(..., type: 'purchase_receipt')`, update the PO line's
`receivedQuantity` and roll the PO's overall `status`
(`PARTIALLY_RECEIVED`/`RECEIVED`), update the variant's
`lastPurchaseCostMinor` and weighted-average `averageCostMinor` per
`supplier-management.md`'s formula, update the supplier offer's
`lastPurchaseDate`.

### Endpoints

```
GET/POST  /api/v1/admin/suppliers
GET/PATCH /api/v1/admin/suppliers/:id
GET/POST  /api/v1/admin/suppliers/:id/offers

GET/POST  /api/v1/admin/purchase-orders
POST      /api/v1/admin/purchase-orders/:id/submit
POST      /api/v1/admin/purchase-orders/:id/approve
POST      /api/v1/admin/purchase-orders/:id/cancel
POST      /api/v1/admin/goods-receipts               — create + post in one call
GET       /api/v1/admin/goods-receipts?purchaseOrderId=
```

New permission `purchasing.manage` (create/submit/approve POs), separate
from `inventory.view_cost` (see cost visibility below) since a purchasing
clerk may need the former without the latter in some org setups — check
with the user whether this distinction matters for their actual staff
structure, default to requiring both together if unclear.

### Low-stock-driven PO suggestions

`GET /api/v1/admin/purchase-orders/suggestions?locationId=` — reuses
Sprint 5's low-stock alert data + each variant's preferred supplier offer
(`supplier_variant_offers.preferred: true`) to propose draft PO lines per
supplier, per master-prompt §21's "create from low-stock suggestions."
Returns suggestions grouped by supplier; the admin picks which to turn
into an actual draft PO — this endpoint never creates a PO itself.

### Cost visibility

New `inventory.view_cost` permission gates `lastPurchaseCostMinor`/
`averageCostMinor`/margin fields in every API response that would
otherwise include them (products list, stock overview, PO lines) —
strip the fields server-side for callers without the permission, don't
rely on the frontend to hide them.

## Build — frontend

- `app/mzali/suppliers` — list/detail/edit, offers sub-tab, following the
  established page+drawer pattern.
- `app/mzali/purchase-orders` — list/create/detail, line-item editor
  (product/variant picker reusing whatever picker component
  `ProductDrawer.tsx` already has for bundles/related products), status
  actions (submit/approve/cancel) as buttons gated by permission.
- `app/mzali/goods-receipts` — receipt entry against an open PO
  (ordered vs. previously-received vs. receiving-now per line, damaged/
  rejected quantity inputs).
- Stock overview page (`StockView.tsx`) — "incoming purchase" column
  (sum of open POs' remaining `orderedQuantity - receivedQuantity` per
  variant) per `docs/pos-platform/inventory-architecture.md`'s row shape.

## Tests

- PO creation/submission/approval never touches `stock_items` — assert
  the DEPOT stock item for a PO's variant is byte-identical before and
  after every PO status transition up to (not including) receipt.
- Goods receipt posting increases stock exactly by `acceptedQuantity`
  (not `receivedNow` — damaged/rejected units don't restock).
- Weighted-average cost calculation matches a hand-computed scenario
  across two receipts at different unit costs.
- `inventory.view_cost`-lacking caller never receives cost fields in any
  of the new endpoints' responses, even when explicitly requested.
- Partial receipt across multiple goods-receipt documents against the
  same PO correctly accumulates `receivedQuantity` and only flips the PO
  to `RECEIVED` once every line is fully received.

## Verification gate

`npm run check:contracts && npm run typecheck && npm run lint && npm test`
green in `backend/`. `npx tsc --noEmit` green at repo root. Manual
walkthrough: create a supplier → add an offer for a variant → create a PO
→ submit → approve → post a partial goods receipt (verify DEPOT stock
increases by the accepted quantity, PO shows `PARTIALLY_RECEIVED`) → post
the remaining receipt (PO shows `RECEIVED`) → confirm the variant's
`lastPurchaseCostMinor` updated and a `cashier`-role test account cannot
see it anywhere in the admin UI.

## Do NOT

- Increase stock at PO creation or submission — only at receipt posting.
- Let a cashier-permission-level account see purchase cost anywhere.
- Build supplier balance/payment-tracking beyond what's explicitly listed
  in `supplier-management.md` — if the business needs full
  accounts-payable tracking, that's a meaningfully bigger scope, flag it
  to the user rather than expanding this sprint silently.
