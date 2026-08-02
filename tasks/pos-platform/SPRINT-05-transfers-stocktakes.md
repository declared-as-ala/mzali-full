# SPRINT 05 — Stock transfers, stocktakes, low-stock alerts

You are a senior NestJS + Next.js engineer extending the Mzali platform.
Repo root: `c:\Users\Ala\Desktop\mzali full`. SPRINT-01's gate must pass
first. SPRINT-02 (POS) is recommended-but-not-required first, since this
sprint is what actually populates BOUTIQUE stock for the first time.

## Read first

- `docs/pos-platform/_master-prompt.md` §17–§19.
- `docs/pos-platform/inventory-architecture.md`,
  `docs/pos-platform/stock-business-rules.md`.
- `backend/src/inventory/stock-ledger.service.ts` — the single write path.

## Build — backend (`backend/src/inventory/transfers/`, `.../stocktakes/`)

### `stock-transfer.schema.ts`

`transferNumber` (atomic counter, prefix `TR`), `sourceLocationId`,
`destinationLocationId`, `status` per master-prompt §17's 9-value enum,
`lines[]` (`variantId`, `requestedQuantity`, `approvedQuantity`,
`shippedQuantity`, `receivedQuantity`, `damagedQuantity`,
`missingQuantity`), `statusHistory`, `requestedBy`, `approvedBy`,
`createdAt`.

Workflow endpoints, each a status transition + (where noted) a
`StockLedgerService.applyMovement()` call:

```
POST /api/v1/admin/inventory/transfers                    — DRAFT/REQUESTED
POST /api/v1/admin/inventory/transfers/:id/approve         — sets approvedQuantity per line
POST /api/v1/admin/inventory/transfers/:id/ship             — transfer_out at sourceLocationId, status SHIPPED
POST /api/v1/admin/inventory/transfers/:id/receive          — transfer_in at destinationLocationId (per line, supports partial → PARTIALLY_RECEIVED), records damaged/missing
POST /api/v1/admin/inventory/transfers/:id/cancel
```

Source stock decreases on **ship**, destination stock increases on
**receive** — not before, matching master-prompt §17's "do not increase
boutique stock before receipt confirmation." A `pos.request_transfer`
permission gates creation from the POS side (store manager requesting
depot stock); `inventory.transfer_approve` gates the approve step.

Printable transfer note: reuse whatever PDF/print approach Sprint 7
introduces if it's done first, otherwise a simple HTML print view (same
pattern as Sprint 2's ticket fallback) is enough for this sprint — don't
block this sprint on PDF infrastructure.

### `stocktake.schema.ts`

`stocktakeNumber` (prefix `INV`), `locationId`, `status` per
master-prompt §18's 7-value enum, `scope` (category filter or "all"),
`lines[]` (`variantId`, `expectedQuantity` — snapshotted at freeze time,
`countedQuantity | null`, `difference`, `reasonIfLarge | null`),
`blindCount: boolean` (hides `expectedQuantity` from the counting UI when
true), `startedBy`, `approvedBy`, `postedAt`.

```
POST /api/v1/admin/inventory/stocktakes                    — DRAFT, freezes expectedQuantity snapshot for the scope
POST /api/v1/admin/inventory/stocktakes/:id/count           — submit countedQuantity per line (scan-driven, incremental)
POST /api/v1/admin/inventory/stocktakes/:id/approve
POST /api/v1/admin/inventory/stocktakes/:id/post            — writes stocktake_correction movements for every non-zero difference, sets quantityOnHand directly to the counted value (this is the one place a movement's quantityDelta is derived from a target rather than a signed input — document this clearly in the movement's `reason` field)
```

Large differences (configurable threshold, `settings.inventory
.stocktakeVarianceThreshold`) require `reasonIfLarge` before the line can
be included in a post.

### Low-stock alerts

Extend the existing low-stock query (`inventory.service.ts`'s current
`lowStockThreshold` check) to also honor the new `reorderPoint`/
`targetStockLevel` fields per variant+location, and to run per-location
(a variant can be low at BOUTIQUE while fine at DEPOT). Surface as a
BullMQ job (`inventory.check-low-stock`, scheduled) that upserts into a
lightweight `alerts` collection (or reuses `settings`-driven notification
plumbing if one already exists — check before adding a new mechanism) —
consumed by the dashboard's existing low-stock widget
(`DashboardCommandCenter.tsx`'s `LowStock` component), extended to show
per-location badges.

## Build — frontend

- `app/mzali/transfers` — list + create + approve + ship + receive flow,
  matching the existing drawer-based CRUD pattern
  (`ProduitsView.tsx`/`ProductDrawer.tsx`).
- `app/mzali/stocktakes` — count-entry screen with barcode scan support
  (reuse the barcode-input hook built for the POS in Sprint 2 if it's
  factored somewhere shareable, otherwise a lightweight duplicate here is
  fine — this is admin-console code, not POS code, don't force a shared
  package prematurely).
- `components/admin/StockView.tsx` — this sprint is what finally makes the
  side-by-side depot/boutique columns meaningful (Sprint 1 built the
  columns, this sprint is the first thing that puts non-zero numbers in
  the BOUTIQUE side via transfers).

## Tests

- Transfer: stock only decreases at source on ship, only increases at
  destination on receive; a cancelled transfer before shipping leaves both
  locations untouched.
- Partial receipt: receiving less than shipped correctly updates
  `receivedQuantity`/`missingQuantity` and leaves the transfer
  `PARTIALLY_RECEIVED` until the remainder is received or written off.
- Stocktake post: every line with a non-zero difference produces exactly
  one `stocktake_correction` movement; `quantityOnHand` after posting
  equals `countedQuantity` exactly.
- Blind count mode: the count-entry API never returns `expectedQuantity`
  to the client when `blindCount: true`.

## Verification gate

`npm run check:contracts && npm run typecheck && npm run lint && npm test`
green in `backend/`. `npx tsc --noEmit` green at repo root. Manual
walkthrough: request a transfer from BOUTIQUE for a DEPOT-stocked variant
→ approve → ship (verify DEPOT decreases) → receive (verify BOUTIQUE
increases) → confirm `/mzali/stock` reflects both. Separately: start a
stocktake at BOUTIQUE → count a few lines with deliberate differences →
post → confirm the movement ledger shows `stocktake_correction` rows and
`/mzali/stock` reflects the corrected quantities.

## Do NOT

- Increase destination stock before receipt confirmation (the one
  explicit "do not" in master-prompt §17).
- Let a stocktake post silently correct stock without a `reason` for
  large differences.
- Build supplier-driven purchase-order-suggested transfers in this
  sprint — that's a Sprint 6 concept (reorder suggestions), this sprint's
  transfers are manually requested/approved only.
