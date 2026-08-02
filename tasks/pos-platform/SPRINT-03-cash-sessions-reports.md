# SPRINT 03 — Cashier sessions, payments, X/Z reports, daily revenue

You are a senior NestJS + Next.js engineer extending the Mzali platform.
Repo root: `c:\Users\Ala\Desktop\mzali full`. SPRINT-02's gate must pass
first. Do not modify the storefront or admin console's existing behavior
beyond adding new dashboard widgets.

## Read first

- `docs/pos-platform/_master-prompt.md` §13, §33.
- `backend/src/pos/pos-sale.schema.ts`, `pos-terminal.schema.ts`,
  `pos-register.schema.ts` (from Sprint 2).
- `backend/src/stats/stats.service.ts` — the existing aggregation pattern
  this sprint extends with POS metrics (reuse `revenueBetween`-style
  helpers, don't build a parallel reporting system).
- `components/admin/dashboard/DashboardCommandCenter.tsx` — where new POS
  widgets slot in.

## Build — backend

### `pos-cashier-session.schema.ts`

`cashierId`, `terminalId`, `registerId`, `openingCashMinor`,
`openedAt`, `closedAt | null`, `closingCountedCashMinor | null`,
`status: 'OPEN' | 'CLOSED'`, running totals updated as sales/payments post
against it (`grossSalesMinor`, `refundsMinor`, `discountsMinor`,
`cashSalesMinor`, `cardSalesMinor`, `otherSalesMinor`, `transactionCount`,
`cashMovementsMinor` — added/removed cash outside of sales).

`POST /api/v1/pos/sessions/open` — requires `pos.open_session`; rejects if
the terminal already has an open session. Update Sprint 2's `pos-sale`
creation flow to require an open session (`sessionId` field added to
`pos-sale.schema.ts`) and to increment the session's running totals inside
the same transaction as the sale.

### `pos-payment.schema.ts`

Per `docs/pos-platform/_master-prompt.md` §38: `saleId`, `method: 'CASH' |
'CARD' | 'BANK_TRANSFER' | 'MIXED_COMPONENT' | 'OTHER'`, `amountMinor`,
`status`, `receivedBy`, `receivedAt`. A mixed-payment sale creates two rows
(one per method) rather than one row with a `MIXED` type — matches the
master prompt's mixed-payment example exactly and keeps every report's
"by payment method" grouping a simple `$group` on `method`.

### `pos-cash-movement.schema.ts`

For cash added/removed outside a sale (float top-up, till-to-safe drop):
`sessionId`, `type: 'ADD' | 'REMOVE'`, `amountMinor`, `reason`,
`performedBy`, `at`.

### Session close

`POST /api/v1/pos/sessions/:id/close` — requires `pos.close_session`,
body carries `closingCountedCashMinor`. Computes `expectedCashMinor =
openingCashMinor + cashSalesMinor + cashMovements(ADD) -
cashMovements(REMOVE) - cashRefundsMinor`, stores the difference, flags it
for manager review if non-zero beyond a configurable tolerance
(`settings.pos.cashToleranceMinor`).

### X / Z reports

`GET /api/v1/pos/sessions/:id/report?type=X|Z` — X is the same
aggregation as close-time computation but callable anytime without
closing; Z is only available after close and is immutable once generated
(store the rendered report snapshot on the session document at close time
so a later Z-report fetch is exact, not re-aggregated against
possibly-changed data — e.g. a later refund against a closed session's
sale should not silently change its Z report).

### Dashboard extensions

Extend `StatsService` (not a parallel service) with: revenue by
cashier/register/payment-method/hour, POS ticket count, POS average
basket, cash-difference-per-session list (flagged sessions surfaced for
admin review). New endpoints:
`GET /api/v1/admin/stats/pos-daily`,
`GET /api/v1/admin/stats/pos-by-cashier`.

## Build — frontend

- `pos/app/sessions/open/page.tsx`, replace Sprint 2's stub — real
  opening-cash-amount form.
- `pos/app/sessions/close/page.tsx` — counted-cash entry, shows expected
  vs. counted, difference.
- `pos/components/SessionReport.tsx` — X/Z report view, printable (reuse
  the `TicketPreview` print stylesheet pattern, different content).
- `app/mzali/pos/` (new admin route group) — Terminals, Registers, Cashier
  Sessions list (with the cash-difference flag surfaced), matching
  master-prompt §34's "POS Management" nav section. Terminal approval UI
  from Sprint 2's pairing flow lives here.
- `components/admin/dashboard/DashboardCommandCenter.tsx` — add a
  "Ventes en boutique" panel (revenue by cashier/register, ticket count)
  alongside the existing panels, same `Panel`/`ReportState` component
  pattern already in that file.

## Tests

- Session totals match a hand-computed scenario: N cash sales, M card
  sales, one refund, one manual cash-add — expected vs. actual.
- A sale cannot be created against a closed or nonexistent session.
- Z report is immutable after generation even if a later action would
  change the underlying aggregation.
- Cash difference beyond tolerance is flagged; within tolerance is not.
- Mixed payment produces exactly two `pos_payments` rows summing to the
  sale total.

## Verification gate

`npm run check:contracts && npm run typecheck && npm run lint && npm test`
green in `backend/`. `npx tsc --noEmit` green in `pos/` and the main
frontend. Manual walkthrough: open session → 2–3 sales (mixed payment
methods) → manual cash movement → X report matches running totals → close
session with a deliberate counted-cash mismatch → Z report shows the
flagged difference → admin console's Cashier Sessions list shows the
closed session with the same numbers.

## Do NOT

- Let a sale bypass session validation "for testing convenience" — this
  is exactly the accounting integrity master-prompt §13 exists to protect.
- Re-aggregate a Z report from live data after close — snapshot it.
- Build refunds/exchanges in this sprint (master-prompt §24) — that's
  scoped for a later sprint once the sale/payment/session foundation is
  solid; note it as follow-up if the business needs it sooner and flag to
  the user rather than silently expanding this sprint's scope.
