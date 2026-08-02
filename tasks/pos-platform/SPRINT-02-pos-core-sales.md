# SPRINT 02 — POS app skeleton, terminal auth, touch-first product grid, cart, sale, ticket

You are a senior NestJS + Next.js engineer extending the Mzali platform.
Repo root: `c:\Users\Ala\Desktop\mzali full`. SPRINT-01's gate must pass
first — this sprint assumes `variants`, `locations` (BOUTIQUE/DEPOT) and
the extended `StockLedgerService` already exist. Do not modify the
storefront or admin console's existing behavior.

**Primary workflow, confirmed with the user (2026-07-20) — read this before
building anything:** this is a clothing boutique. Cashiers do **not** scan
barcodes as their main path. The workflow is: browse categories → tap a
product → select size/color if applicable → add to cart → pay. The
product grid, category rail, search, favorites bar and recently-sold rail
are the primary UI investment for this sprint — not barcode input. See
`docs/pos-platform/PLAN.md` decision D8 and `docs/pos-platform/pos-architecture.md`
in full, which was rewritten around this workflow.

## Read first

- `docs/pos-platform/pos-architecture.md` — full screen/UX spec for this
  sprint, touch-first workflow.
- `docs/pos-platform/security-model.md` §"POS terminal binding" and
  §"New permissions".
- `docs/pos-platform/stock-business-rules.md` §"POS sale lifecycle".
- `docs/pos-platform/printing-architecture.md` §"Strategy 1 — HTML print".
- `lib/api-auth.ts`, `lib/jwt.ts`, `app/api/auth/route.ts` — the existing
  JWT-cookie pattern to replicate for the new `pos/` app (same shared
  `JWT_ACCESS_SECRET`, same refresh-on-401 helper, adapted).
- `backend/src/auth/permissions.ts` — where to add the new `pos.*`
  permissions and a `cashier` role.
- `backend/src/catalog/catalog-public.controller.ts` — the existing
  category/product listing pattern this sprint's catalog endpoint follows
  (same categories, same product images/pricing — just filtered to active
  + variant + boutique stock joined in).

## Build — backend (`backend/src/pos/`)

New module, core/API split (`PosCoreModule` for schemas, `PosModule` for
controllers — the worker will eventually need the sale schema for
background jobs like receipt emailing).

### Schemas

- `pos-terminal.schema.ts` per `security-model.md`.
- `pos-register.schema.ts` — minimal for this sprint (`code`, `name`,
  `locationId`, `active`); cashier sessions (Sprint 3) reference it.
- `pos-sale.schema.ts` — `saleNumber` (atomic counter, prefix `POS`),
  `terminalId`, `registerId`, `cashierId`, `locationId` (always BOUTIQUE
  for now), `status: 'SUSPENDED' | 'COMPLETED' | 'REFUNDED' | 'CANCELLED'`,
  `lines[]` (immutable snapshot: `variantId`, `descriptionSnapshot`,
  `sku`, `qty`, `unitPriceMinor`, `discountMinor`, `lineTotalMinor`),
  `customerId | null`, `subtotalMinor`, `discountMinor`, `totalMinor`,
  `idempotencyKey` (unique sparse), `createdAt`.

  Payments are Sprint 3's schema — this sprint's sale can complete with a
  single implicit `CASH` payment record inline if Sprint 3 isn't done yet,
  but design the sale schema so Sprint 3 only needs to add a
  `pos-payment.schema.ts` and reference it, not restructure `pos-sale`.

### Terminal pairing + guard

`POST /api/v1/pos/terminals/pairing` (unauthenticated, rate-limited) —
device posts its generated fingerprint, gets back a short pairing code.
`GET /api/v1/pos/terminals/pairing/:code` — polled by the device until an
admin approves it. `POST /api/v1/admin/pos/terminals/:id/approve` (admin
only). `PosTerminalGuard` — validates `X-POS-Terminal` header against an
active, approved, fingerprint-matching terminal record; applied to every
`pos/*` controller alongside the existing `JwtAuthGuard`.

### Catalog for POS (primary — this is what the product grid loads)

`GET /api/v1/pos/catalog` — returns the full active catalog in one call:
every product with its single variant (Sprint 1), category, images, price,
and `boutiqueStock`/`depotStock` (`quantityAvailable` per location, one
joined query per `stock-business-rules.md`) — small today (21 products),
loaded once per till session and filtered/searched **client-side** for
zero-latency category taps and search-as-you-type (see
`pos-architecture.md` §"Catalog loading"). Also returns the active
category list for the category rail, and `favoriteProductIds` from
`settings.pos` for the favorites bar.

`GET /api/v1/pos/products/barcode/:barcode` — **optional for this
sprint's gate**, build only if time allows. Resolves a barcode to a
variant the same shape as a catalog entry. Every variant already has an
optional `barcode` field from Sprint 1, so this is a thin lookup, not a
schema change — safe to defer entirely without blocking anything else.

### Sale creation

`POST /api/v1/pos/sales` — requires `Idempotency-Key` (reuse the existing
idempotency interceptor). Inside one transaction: validate terminal +
session (Sprint 3 — until sessions exist, validate terminal only), verify
BOUTIQUE availability per line via a **fresh** read (never trust the
catalog endpoint's stock numbers — see `stock-business-rules.md`
§"Availability check timing"), create the sale, call
`StockLedgerService.applyMovement(..., type: 'pos_sale', locationId:
BOUTIQUE)` per line. Commit, then (outside the transaction) queue the
ticket-render job if async email/print-log is needed — the synchronous
HTML print doesn't need a queue, only future email-receipt delivery
would.

`GET /api/v1/pos/sales/:id/ticket` — re-renders ticket data from the
persisted sale for reprint.

## Build — frontend (`pos/` — new Next.js app at repo root)

Follow `pos-architecture.md`'s file layout and screen order exactly. Copy
(don't re-derive) the JWT-cookie auth pattern from the main frontend's
`lib/api-auth.ts`/`lib/jwt.ts`, adapted for the terminal-pairing flow on
top.

**Primary build effort, in priority order:**

1. `ProductGrid.tsx` — image-first cards, ≥64px touch targets, price +
   compact stock badge on the card.
2. `CategoryRail.tsx` — horizontal touch-scrollable chips, instant
   client-side filter, "Tous" first.
3. Search box — instant client-side substring match (name + SKU), no
   network round trip per keystroke.
4. `FavoritesBar.tsx` — pinned row above the grid, from
   `settings.pos.favoriteProductIds`.
5. `RecentlySoldRail.tsx` — derived from the current session's own sale
   lines client-side, no extra query.
6. `VariantPicker.tsx` — full-size sheet with large chip buttons; today
   it's effectively a no-op (every product has one variant, tapping adds
   straight to cart) but build the component so it activates the moment a
   product gets more than one variant, with no further frontend work.
7. `Cart.tsx` — always-visible side panel, large `–`/`+` steppers.
8. `PaymentModal.tsx`, `TicketPreview.tsx`.

Screens: pairing/waiting, login, open-session (stub until Sprint 3 — for
this sprint, "open session" can be a no-op that just marks the terminal
ready, real session tracking lands in Sprint 3), till (the grid-first
screen above), ticket preview with print/reprint.

Barcode input listener (per `pos-architecture.md` §"Barcode scanning
(optional, future)") — **do not build in this sprint** unless everything
above is done with time to spare. It is explicitly not part of this
sprint's verification gate.

`Dockerfile` for `pos/` mirrors the existing root `Dockerfile` (Next.js
standalone build) — copy and adapt, don't write from scratch.

## Tests

- Terminal pairing: unapproved terminal's API calls are rejected;
  approved terminal's calls succeed; fingerprint mismatch is rejected even
  if the terminal id is otherwise valid.
- Duplicate `Idempotency-Key` on `/pos/sales` returns the original sale,
  no duplicate stock movement.
- Sale creation decreases `stock_items` at `locationId=BOUTIQUE` only —
  DEPOT for the same variant is untouched (this is the master-prompt's
  single most important test case; see `docs/pos-platform/_master-prompt.md`
  §50).
- Two concurrent sales for the last boutique unit: exactly one succeeds
  when negative stock is disabled.
- `GET /api/v1/pos/catalog` returns correct joined boutique/depot stock
  per product, and correctly reflects `favoriteProductIds`.

## Verification gate

`npm run check:contracts && npm run typecheck && npm run lint && npm test`
green in `backend/`. `npx tsc --noEmit` green in both the main frontend
and `pos/`. Docker Compose dev stack boots `pos` alongside the existing
services; a manual sale end-to-end (pair terminal → approve from admin →
login → **tap through category → product → add to cart** → pay cash →
print HTML ticket) works against the dev database; the sold variant's
BOUTIQUE `quantityOnHand` visibly decreases in `/mzali/stock`. Barcode
lookup is **not** part of this gate.

## Do NOT

- Let the POS talk to MongoDB/Redis/MinIO directly — BFF pattern only,
  same as the existing storefront/admin.
- Trust the catalog endpoint's stock numbers at payment time — re-verify
  inside the sale transaction.
- Build the local printing bridge in this sprint — HTML fallback only
  (see `docs/pos-platform/printing-architecture.md`, bridge is Sprint 9).
- Build cashier sessions/cash drawer accounting in this sprint — that's
  Sprint 3; this sprint's sale flow works without a real session record.
- Spend sprint time on the barcode listener/endpoint before the grid/
  category/search/favorites/recently-sold/variant-picker/cart/payment
  flow is solid — that flow is what the business actually uses.
