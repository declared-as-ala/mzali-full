# Stock Business Rules

Covers master-prompt §8–§10, §40. This is the definitive answer to "when
does a number change and by how much" — every sprint that touches stock
implements exactly this, no per-module reinterpretation.

## The two sources are separate, always

```
Online website stock source = DEPOT (variant's stock_item at locationId=DEPOT)
POS stock source            = BOUTIQUE (variant's stock_item at locationId=BOUTIQUE)
```

A POS sale **never** touches the DEPOT stock item. An online order
**never** touches the BOUTIQUE stock item. The only things that move stock
between them are transfers (Sprint 5), which are themselves two ordinary
movements (`transfer_out` at the source, `transfer_in` at the destination)
— there is no special "combined" mutation.

## Online order lifecycle (already built — see `current-state-audit.md` §3)

| Event | `quantityOnHand` | `quantityReserved` | Movement |
|---|---|---|---|
| Order created (pending) | unchanged | `+qty` | `order_reserve` |
| Order confirmed | `-qty` | `-qty` | `order_commit` |
| Order cancelled (was pending) | unchanged | `-qty` | `order_release` |
| Order cancelled (was confirmed) | `+qty` | unchanged | `refund_restock` (restock path) |
| Reservation expired (BullMQ job) | unchanged | `-qty` | `order_release` |

This state machine already exists in `backend/src/orders/order-status.ts`
(`stockEffectForStatus`, `planStockTransition`). Sprint 4's job is to route
these calls at `locationId=DEPOT` explicitly (today it's implicitly the
single warehouse) — the semantics do not change.

## POS sale lifecycle (new — Sprint 2)

A POS sale has no "pending reservation" phase by default — payment and
stock commit happen together, in one transaction, because a cashier is
standing at the till with the goods in hand (unlike online checkout, there
is no meaningful gap between "customer decided to buy" and "payment
happened"). Suspended sales (master-prompt §12 "suspend/resume") do **not**
reserve stock — they're a cart snapshot, not a commitment; stock is
verified again at the moment of actual payment.

| Event | `quantityOnHand` (BOUTIQUE) | Movement |
|---|---|---|
| Sale paid | `-qty` | `pos_sale` |
| Return (RESTOCK disposition) | `+qty` | `return_restock` |
| Return (DAMAGED/DISCARD disposition) | unchanged | none — value is written off, not restocked; see `docs/pos-platform/loyalty-system.md` n/a, see `SPRINT-06` cost-adjustment note |
| Exchange | `-qty`/`+qty` on the two affected variants | `exchange_out` + `exchange_in` |

## Availability check timing

- **Online checkout**: availability is verified inside the reservation
  transaction at order-creation time, using a fresh read (no stale cache),
  same as today.
- **POS payment**: availability is verified inside the sale transaction at
  payment time — the product grid's stock badge is informational (may be a
  few seconds stale from a WebSocket push), the transaction's own read is
  authoritative. This is master-prompt §40's "a cached stock badge must
  never authorize a sale," applied identically to both channels.

## Negative stock

Disabled by default (`allowNegativeStock: false` per location, stored on
the `locations` document). When disabled, a sale/order attempting to sell
past `quantityAvailable` is rejected with a clear error, before any write.
When a location administrator explicitly enables it (a distinct
`pos.override_stock` permission, separate from the location flag — both
must be true), the sale proceeds and the resulting stock item is allowed
to go negative; the movement is flagged (`flags: ['NEGATIVE_STOCK']`) and
surfaced in the audit log and a dedicated "negative stock" view in the
stock overview page (master-prompt §35).

## Sold-out propagation to the storefront (master-prompt §9)

A variant is sold out online when `DEPOT.quantityAvailable <= 0`. A
product is sold out when **all** its active variants are sold out; a
single unavailable size/color only disables that option in the product
page's variant picker, everything else on the page stays purchasable.

Implementation: the product-detail read path always queries
`stock_items` live (no long-lived cache on availability specifically —
product copy/images/price can still be cached per master-prompt §40, but
`quantityAvailable` is not baked into that cached payload). See
`SPRINT-04-online-reservations-sync.md` for the revalidation mechanism
that keeps the *product listing* page (which does benefit from caching)
in sync when a variant flips to sold out.

## Reservation expiry

Configurable duration, stored in `settings` (key
`orders.reservationTtlMinutes`, default carried over from whatever the
checkout flow uses today — check `backend/src/orders/checkout` before
picking a number in Sprint 4, don't invent one). A BullMQ repeatable job
scans for `pending`/reserve-state orders past their TTL and releases them
through the same `order_release` path as an explicit cancellation — no
separate code path for "timed out" vs. "cancelled by customer."

## What this document deliberately does not cover

- Multi-warehouse routing logic beyond DEPOT/BOUTIQUE (the `locations`
  collection supports more later per master-prompt §5, but no business
  rule beyond "pick one" needs writing until a third location actually
  exists).
- Demand forecasting math (master-prompt §19 explicitly says keep it
  simple — see `SPRINT-09-reports-hardening.md` for the eventual
  suggested-reorder-quantity formula, unchanged from the master prompt's
  `targetStockLevel - currentAvailableStock - pendingPurchaseQuantity +
  forecastedDemand`).
