# SPRINT 09 — Advanced reports, printing bridge (optional), security/operational hardening

You are a senior NestJS + Next.js + DevOps engineer extending the Mzali
platform. Repo root: `c:\Users\Ala\Desktop\mzali full`. All prior sprints
(01–08) should be complete before this one — it's the closing pass across
the whole epic, matching master-prompt §52 Phase 9. Confirm with the user
which sub-parts below they actually want before building all of them; this
sprint is intentionally the most negotiable in scope.

## Read first

- `docs/pos-platform/PLAN.md` §4 "Acceptance criteria" — this sprint's job
  is to make every remaining unchecked box true.
- `docs/pos-platform/_master-prompt.md` §19, §23, §33, §42–§43, §50.
- `docs/pos-platform/printing-architecture.md` §"Strategy 2" — only build
  this if the user confirms it's still wanted (see `PLAN.md` decision D6).

## Build — reports (extend `backend/src/stats/`, do not create a parallel system)

- Margin per product/category/POS-sale/online-order/day/month (uses
  `averageCostMinor` from Sprint 6).
- Products sold below cost (flag, don't block — a manager may intend a
  loss-leader).
- Slow-moving / dead stock (no `stock_movements` of type `pos_sale` or
  `online_sale` for a variant within a configurable window).
- Reorder suggestions per master-prompt §19's formula:
  `suggestedQuantity = targetStockLevel - currentAvailableStock -
  pendingPurchaseQuantity + forecastedDemand`, with `forecastedDemand`
  kept deliberately simple (e.g. trailing-N-week average sale velocity) —
  do not build a machine-learning forecast; the master prompt explicitly
  rules this out until "basic data quality is reliable."
- Supplier price evolution (from `supplier_variant_offers` +
  `goods_receipts` history).
- Discount report, refund report, return-reason breakdown (only if
  refunds/returns were built — see Sprint 3's flagged scope gap; if not
  built yet, this sprint either builds the minimal returns flow first or
  explicitly defers this report, don't fake data for it).

All new report endpoints follow the existing `StatsService` pattern (real
aggregation, filterable by date range/location/cashier/register/payment
method/product/category/brand/channel per master-prompt §33) and render
into `DashboardCommandCenter.tsx` or a new `app/mzali/reports` page if the
count of panels is getting too large for the main dashboard — check with
the user which they'd prefer once the report list is finalized.

## Build — printing bridge (optional, confirm first)

If confirmed wanted: implement per
`docs/pos-platform/printing-architecture.md` §"Strategy 2" in full — local
service, ESC/POS, terminal-scoped auth token, origin-locked CORS, payload
validation, printer-status endpoint. Ship as a separate installable
package (not part of the Docker Compose stack), with install instructions
in a new `docs/pos-platform/printing-bridge-install.md`.

## Build — security/operational hardening

- Rate limiting on the terminal-pairing endpoint (Sprint 2) — confirm it
  has one; if not, add it now (this is the one genuinely public-ish
  endpoint in the whole POS surface).
- Full negative-stock audit trail review: confirm every
  `flags: ['NEGATIVE_STOCK']` movement (per `stock-business-rules.md`) is
  actually surfaced in a dedicated admin view, not just written to the
  ledger and forgotten.
- Idempotency-key coverage audit: confirm every mutating POS/purchasing/
  invoicing endpoint that could plausibly be retried by a flaky connection
  (sale creation, goods-receipt posting, invoice finalization, loyalty
  redemption) has one — this was called out per-sprint but re-verify here
  as a cross-cutting pass.
- Audit-log coverage audit: walk the action list in
  `docs/pos-platform/security-model.md` §"Audit log entries" and confirm
  every one is actually emitted, not just planned.
- Load/edge-case pass on the two "cannot oversell" scenarios from
  master-prompt §50: two cashiers on different terminals attempting the
  last boutique unit simultaneously; two online customers attempting the
  last depot unit simultaneously. Both need an actual concurrency test
  (parallel requests in a test), not just a code read-through.
- MinIO-outage and Redis-outage resilience checks per master-prompt §50's
  last two bullets: a completed POS sale must survive a MinIO outage
  (ticket PDF/media upload failure shouldn't roll back the sale — queue a
  retry instead) and a Redis outage must not cause duplicate stock changes
  (the pub/sub layer from Sprint 4 is notification-only, verify the actual
  write path doesn't depend on Redis being up).

## Tests

- Concurrency: two simultaneous "last unit" sales (one POS, one online, or
  two POS) — exactly one succeeds, matching master-prompt §50's explicit
  test list.
- Reorder-suggestion formula matches a hand-computed scenario.
- Simulated MinIO failure during ticket/PDF generation does not roll back
  the parent sale/invoice transaction.
- Simulated Redis failure during a stock mutation does not prevent the
  mutation or duplicate it — only the notification layer degrades.

## Verification gate

Full `npm run check:contracts && npm run typecheck && npm run lint && npm
test` across `backend/`, `npx tsc --noEmit` across the main frontend and
`pos/`. Walk the entire `docs/pos-platform/PLAN.md` §4 acceptance-criteria
list and check off each item against the running system — this is the
epic's final gate, not just this sprint's.

## Do NOT

- Build the printing bridge without explicit confirmation it's still
  wanted — it may turn out the HTML fallback has been fine in practice.
- Build a forecasting model beyond simple trailing-average velocity.
- Treat this sprint as "polish, low risk" — the concurrency and
  outage-resilience tests here are exactly the kind of thing that's easy
  to skip and expensive to discover missing in production.
