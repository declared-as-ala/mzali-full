# SPRINT 04 — Multi-location online order flow, sold-out sync, real-time events

You are a senior NestJS + Next.js engineer extending the Mzali platform.
Repo root: `c:\Users\Ala\Desktop\mzali full`. SPRINT-01's gate must pass
first (SPRINT-02/03 are not hard prerequisites for this sprint, but doing
them first is recommended so the POS side exists to validate cross-channel
behavior against). This sprint touches the **live** online checkout flow —
be more careful here than in any other sprint; the storefront must not
regress.

## Read first

- `docs/pos-platform/stock-business-rules.md` — full spec, especially
  "Online order lifecycle" and "Sold-out propagation to the storefront".
- `backend/src/orders/order-status.ts`, `backend/src/orders/orders.service.ts`
  — the existing reserve/commit/release implementation this sprint wires
  to `locationId=DEPOT` explicitly.
- `backend/src/inventory/stock-ledger.service.ts` (from Sprint 1) — the
  single write path every mutation in this sprint must use.
- The catalog product-listing/detail read path (`backend/src/catalog/
  products.service.ts` or equivalent) — where "is this variant available"
  gets decided today, to be replaced by `resolveOnlineAvailability()`.

## Build — backend

### Explicit DEPOT routing

Update every call site in `orders.service.ts` that currently reserves/
commits/releases stock to pass `locationId` resolved from
`locations.findOne({isDefaultOnlineLocation: true})` (cached, not
re-queried per line) rather than implicitly assuming the single warehouse.
No behavior change from the customer's perspective — this is purely making
the existing correct behavior explicit against the new multi-location
schema.

### Reservation expiry job

BullMQ repeatable job (`backend/src/jobs/` or wherever existing repeatable
jobs live) scanning for orders past `settings.orders.reservationTtlMinutes`
still in a reserve-state status, releasing them through the existing
`order_release` path — check whether this job already exists from the
original migration (`current-state-audit.md` says "check before picking a
number," confirm the setting key name against what's actually there) and
extend rather than duplicate if so.

### `resolveOnlineAvailability(variantId, policy)`

Single function per `docs/pos-platform/inventory-architecture.md`
§"Stock policy". Default `DEPOT_ONLY`. Wire the product-detail and
product-listing read paths through it. New `settings.inventory.stockPolicy`
key, admin-editable (new settings form field, doesn't need its own page —
add to the existing settings UI).

### Real-time sync

Per `docs/pos-platform/_master-prompt.md` §16: on any stock movement,
publish an `inventory.updated` event (`{variantId, locationId,
quantityAvailable}`) via Redis pub/sub (new, minimal — a single channel is
enough at this scale, don't over-engineer a topic hierarchy). Two
consumers for this sprint:

1. **Storefront revalidation** — a worker-side subscriber calls Next.js's
   on-demand revalidation (`revalidatePath`/`revalidateTag` via the
   existing `MZALI_SERVICE_TOKEN`-authenticated revalidation endpoint if
   one exists, or add a minimal one) for the affected product's page when
   its DEPOT availability crosses zero in either direction. Don't
   revalidate on every stock change — only on the boundary crossing
   (available→sold-out or sold-out→available), since that's the only
   change a cached page actually needs to reflect immediately.
2. **Admin/POS live badge updates** (if Sprint 2/3 are done) — a simple
   SSE endpoint (`GET /api/v1/pos/events` or similar) the POS product grid
   subscribes to for stock-badge refresh, per master-prompt §16's "use
   WebSockets or SSE for administration and POS live updates." SSE is
   sufficient here (one-directional server→client); don't build a full
   WebSocket layer unless a later sprint needs bidirectional push.

The database remains authoritative — these are notifications only, never
consulted for an actual availability decision at checkout/payment time
(`stock-business-rules.md` §"Availability check timing").

## Build — frontend

- Product detail page: sold-out state per variant (disable the specific
  size/color in the picker, not the whole "add to cart" button, unless
  every variant is sold out) — check the existing variant-picker component
  and extend it, don't rewrite the page.
- No changes needed to product-listing cards beyond what the revalidation
  mechanism already handles (they re-render from the revalidated cache).

## Tests

- Order creation reserves DEPOT stock only; a variant's BOUTIQUE stock is
  provably untouched by an online order (mirror of Sprint 2's inverse
  test).
- Reservation expiry releases stock and the variant becomes purchasable
  again without a server restart.
- A variant crossing to zero DEPOT availability makes its product page
  show sold-out (for that variant) within one revalidation cycle, verified
  by an integration test that creates an order consuming the last unit and
  then fetches the product page.
- `resolveOnlineAvailability` under each policy value returns the expected
  boolean for constructed DEPOT/BOUTIQUE stock combinations (even though
  only `DEPOT_ONLY` is active by default, the function itself is fully
  tested so switching the setting later is safe).

## Verification gate

`npm run check:contracts && npm run typecheck && npm run lint && npm test`
green in `backend/`. `npx tsc --noEmit` green at repo root. Full manual
regression of the existing checkout flow (browse → cart → checkout →
confirm → merci page) against dev compose — this must behave identically
to before this sprint. Manual test: reduce a variant's DEPOT stock to 1
via the admin stock-adjustment UI, place an order for it, confirm the
product page shows sold-out immediately after confirmation without a
manual cache clear.

## Do NOT

- Change the storefront's checkout UX or URLs.
- Revalidate on every stock movement — only on availability-boundary
  crossings, to avoid hammering Next.js's revalidation under normal POS
  sale volume (POS sales move BOUTIQUE stock, which doesn't affect
  storefront availability under `DEPOT_ONLY` policy — confirm this
  filtering is correct, it's the main risk in this sprint).
- Treat the SSE/pub-sub layer as authoritative for any write decision.
