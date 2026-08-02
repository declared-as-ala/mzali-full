# SPRINT 08 — Loyalty accounts, ledger, earning/redemption, tiers

You are a senior NestJS + Next.js engineer extending the Mzali platform.
Repo root: `c:\Users\Ala\Desktop\mzali full`. SPRINT-01's gate must pass
first. SPRINT-02/03 (POS sales + sessions) must be done first for the
redemption-at-payment flow to have somewhere to plug in — SPRINT-04
(online order status hooks) recommended too, for online earning.

**Before starting the storefront-facing piece, read
`docs/pos-platform/loyalty-system.md` §"Open question for Sprint 8
kickoff" and raise it with the user** — the storefront has no
logged-in-customer concept today, and "loyalty page" scope depends on
whether a fuller account system is wanted now or a minimal phone-lookup
page is enough.

## Read first

- `docs/pos-platform/loyalty-system.md` — full schema/flow spec.
- `backend/src/customers/customer.schema.ts`,
  `backend/src/customers/customers.service.ts` — the identity anchor
  this module references by `customerId`, not modifies.
- `backend/src/orders/order-status.ts` — where the online-earning hook
  attaches (same transition point `stockEffectForStatus` already runs
  at).
- `backend/src/pos/pos-sale.schema.ts` (Sprint 2) — where the POS-earning
  hook attaches.

## Build — backend (`backend/src/loyalty/`)

Schemas exactly as specified in `docs/pos-platform/loyalty-system.md`
(`loyalty_accounts`, `loyalty_transactions`, `loyalty_tiers`). Core/API
split — the tier-evaluation job (worker) needs the schemas without
`AuthModule`.

### `LoyaltyLedgerService.apply(...)`

Single write path, mirroring `StockLedgerService`'s discipline exactly:
every balance change is one call, writing both the `loyalty_transactions`
row and the `loyalty_accounts.pointsBalance` update in the same
transaction. No other code path touches `pointsBalance`.

### Earning hooks

- POS: inside `PosSalesService.create()`'s existing transaction (Sprint 2),
  after the stock movement, call
  `LoyaltyLedgerService.apply(..., type: 'EARN', sourceType: 'POS_SALE')`
  if the sale has a `customerId` and a loyalty account exists (auto-create
  one on first purchase only if the business wants opt-out-by-default —
  confirm with the user; default assumption is loyalty is opt-in via
  explicit card creation, not automatic).
- Online: hook into the same order-status-transition point
  `stockEffectForStatus` runs at, gated by
  `settings.loyalty.earnOnOrderStatus`.

Apply `settings.loyalty` rules per `loyalty-system.md` §"Earning rules"
(points-per-dinar, minimum purchase, bonus categories/products,
exclusions) — one shared `LoyaltyRulesService.calculateEarnedPoints(sale
OrOrder)` used by both hooks, not duplicated logic.

### Redemption

`POST /api/v1/pos/loyalty/redeem` — validates all guards from
`loyalty-system.md` §"Redemption" (max-percent-of-sale, minimum-points,
manager-approval-above-threshold via the existing manager-PIN pattern if
one exists from Sprint 3's discount-override flow, no-anonymous-customer),
deducts points and applies the resulting discount inside the *same*
transaction as the POS sale it's part of — a sale is never left
half-applied.

### Refund reversal

Hook into whatever refund flow exists (Sprint 3's scope note flagged
refunds as a possible later addition — if refunds aren't built yet by the
time this sprint starts, implement `LoyaltyLedgerService`'s
`reverseEarnedPoints(sourceId)` as a standalone method ready to be called
once refunds exist, and note this explicitly in `progress.md` rather than
silently skipping it).

### Tier evaluation job

BullMQ scheduled job (`loyalty.evaluate-tiers`, nightly) per
`loyalty-system.md` §"Tiers" — confirm at kickoff whether trailing-12-month
spend or all-time `customers.totalSpentMinor` is the right basis (the doc
flags this as unresolved) before implementing, don't silently pick one.

### Endpoints

```
GET  /api/v1/loyalty/accounts/:cardNumber
POST /api/v1/loyalty/accounts
POST /api/v1/loyalty/adjustments        — manual, mandatory reason, loyalty.adjust permission
GET  /api/v1/admin/loyalty/accounts?search=
GET  /api/v1/admin/loyalty/accounts/:id/transactions
POST /api/v1/admin/loyalty/accounts/:id/suspend
POST /api/v1/admin/loyalty/tiers        — configure tier thresholds
```

## Build — frontend

- POS customer panel (`pos-architecture.md`'s already-scaffolded panel
  from Sprint 2) — balance, tier, points-earned-this-cart, redeem control.
- Quick loyalty-account creation from the POS customer quick-create flow.
- `app/mzali/loyalty` — account search, ledger view, manual adjustment
  drawer (mandatory-reason form), tier configuration settings form.
- Storefront loyalty surface — scope per the kickoff discussion above;
  minimum viable is a phone/card-number lookup page showing balance +
  history + QR code, without a full login system, unless the user asks
  for the fuller account system.

## Tests

- Earning: a POS sale of a known amount produces the exact expected
  `EARN` transaction per the configured `pointsPerDinarSpent`, excluded
  products correctly excluded.
- Redemption: deducting points and applying the discount either both
  happen or neither does (transaction atomicity test — force a failure
  after the points deduction and assert the whole sale rolls back).
- Refund reversal produces a `REFUND_REVERSAL` transaction for exactly the
  proportional points of the refunded value, not the full sale's points.
- Redemption guards: max-percent, minimum-points, no-anonymous-customer
  each independently reject as expected.
- Tier evaluation job correctly promotes/keeps accounts per constructed
  spend/points scenarios.

## Verification gate

`npm run check:contracts && npm run typecheck && npm run lint && npm test`
green in `backend/`. `npx tsc --noEmit` green at repo root. Manual
walkthrough: create a loyalty account for a test customer → complete a POS
sale for them → confirm points earned matches the configured rule →
redeem some points on a second sale → confirm the balance and discount
are both correct → check the admin ledger view shows both transactions
with the right `sourceType`/`sourceId`.

## Do NOT

- Add loyalty fields directly to the `customers` schema — keep it a
  separate, referenced collection.
- Let any code path update `pointsBalance` outside
  `LoyaltyLedgerService.apply()`.
- Silently build a full storefront account/login system without
  confirming scope with the user first.
