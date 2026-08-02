# POS Architecture

Covers master-prompt §3, §11–§16, §35–§36 as applied to this codebase. See
`PLAN.md` decisions D1 (separate POS app), D6 (printing bridge is optional),
**D8 (touch-first browse/select workflow is primary, not barcode scanning
— confirmed with the user 2026-07-20)**.

## Primary workflow (confirmed with the user, drives every UI decision below)

This is a clothing boutique. The salesperson does **not** scan barcodes as
the main path — they browse and tap:

```
Browse categories → tap product → select size/color → add to cart → pay
```

Everything in this document is optimized for that loop being fast on a
touchscreen: large tap targets, an excellent product grid with real
images, instant category filtering, quick search, favorites, and recently-
sold shortcuts. Barcode scanning is not required for Sprint 2 — see
"Barcode scanning (optional, future)" at the end of this document.

## App shape

New Next.js app at repo root, sibling to the existing frontend and `backend/`:

```
pos/
  app/
    login/                     — terminal + cashier login
    (till)/                    — main sale screen (route group, requires open session)
      page.tsx
      cart/
    sessions/open/
    sessions/close/
    layout.tsx
  lib/
    api-auth.ts                — mirrors mzali-full/lib/api-auth.ts (JWT refresh-on-401)
  components/
    CategoryRail.tsx           — horizontal, touch-scrollable category chips
    ProductGrid.tsx            — image-first tap targets, primary surface
    FavoritesBar.tsx           — pinned best-sellers, always visible
    RecentlySoldRail.tsx       — last N distinct products sold this session/day
    VariantPicker.tsx          — full-size sheet, not a cramped inline popover
    Cart.tsx
    CustomerPanel.tsx
    PaymentModal.tsx
    TicketPreview.tsx
  Dockerfile
```

Same BFF pattern as the existing frontend: `pos/` never talks to MongoDB/Redis/MinIO
directly, only to the NestJS API via server routes carrying a `Bearer` token
tied to the logged-in employee **and** the approved terminal record (see
`security-model.md`). Money, contracts, and the JWT verification helper are
copied/adapted from the existing frontend (`lib/jwt.ts`, `lib/api-auth.ts`),
not reimplemented.

## Screens (from master-prompt §12, reordered for the touch-first workflow)

**Login** — terminal is pre-registered (see `security-model.md` §"POS terminal
binding"); cashier enters employee credentials; on success, if no open
session exists for this terminal, redirect to "open session."

**Open session** — cashier, terminal, register, opening cash amount, note.
`POST /api/v1/pos/sessions/open`.

**Till (main screen)**

```
┌─────────────────────────────────────────────────────────────┐
│ Cashier · Register · Session open since HH:MM · ● online     │
├───────────────────────────────────────┬─────────────────────┤
│ [🔍 search]                            │ Customer: — [+]     │
│ ⭐ Favoris: [img][img][img][img][img]  │ ─────────────────── │
│ 🕓 Vendus récemment: [img][img][img]   │ 2× T-shirt M rouge  │
│ [Tous] [Chemises] [Pantalons] [...]    │   24.900 DT   [–][+]│
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐            │ 1× Jean 32          │
│ │ img │ │ img │ │ img │ │ img │  product │   89.900 DT   [–][+]│
│ │name │ │name │ │name │ │name │  grid    │ ─────────────────── │
│ │price│ │price│ │price│ │price│          │ Subtotal / Remise    │
│ │stock│ ...                              │ Total: 139.700 DT    │
│ └────┘ └────┘ └────┘ └────┘             │ [Suspendre] [PAYER]  │
└───────────────────────────────────────┴─────────────────────┘
```

The **product grid** is the primary surface, not a side panel — large
image-first cards (per master-prompt §12 "product images"), touch target
≥ 64px, price and a compact stock badge always visible on the card so the
cashier doesn't have to tap in to see availability.

**Category rail** — horizontal, touch-scrollable chips ("Tous" first,
then every active category with products); tapping filters the grid
instantly (client-side filter against the already-loaded catalog — no
round trip, see "Catalog loading" below). Multi-select is not needed for
a boutique till; one active category at a time keeps the interaction
one-tap.

**Favorites bar** — a pinned row of manually curated or best-selling
products (configurable per-boutique in admin, `settings.pos.favoriteProductIds`),
always visible above the grid regardless of category filter — the fastest
possible path for the 10–20 items that sell every day.

**Recently-sold rail** — the last N distinct products sold at this
register today (derived from the current cashier session's sale lines,
no extra query) — covers the very common case of "another one of what I
just sold" without re-browsing.

**Search** — instant, client-side substring match against the loaded
catalog (name + SKU); this is a *convenience* filter on top of the grid,
not a barcode-terminator listener. A cashier who knows the product name
types 2–3 letters and taps it, same speed class as browsing.

**Variant selection** — tapping a product with more than one active
variant (today: every product has exactly one, see `PLAN.md` decision D7,
so this sheet is skipped entirely and the product adds straight to cart —
the sheet only matters once a specific product is opted into real
per-size/color stock tracking) opens a full-size sheet with large chip
buttons per attribute (size, color, …), not a cramped inline popover —
optimized for a thumb on a tablet, not a mouse pointer. Confirms in one
more tap, back to the grid.

**Cart panel** — right-hand side, always visible (not a modal) so the
running total is never hidden mid-browse; quantity steppers are large
tap targets (`–`/`+`), no keyboard entry required for the common case.

**Payment modal** — method tabs (Cash/Card/Mixed/Other), cash tender +
computed change, "PAYER" commits the sale (`POST /api/v1/pos/sales`), then
shows the ticket preview with print/reprint actions.

**Customer panel** — phone search, quick-create, loyalty balance + redeem
control once Sprint 8 ships (panel exists from Sprint 2, loyalty fields
populate once the loyalty module exists). No scan requirement — phone-
number entry or lookup by name is the primary path for a boutique's
guest-checkout-style customer base.

## Catalog loading

The full active catalog (products + their single variant + boutique stock)
loads once per till session via `GET /api/v1/pos/catalog` into memory —
21 products today, comfortably small. Category filter, search and
favorites all operate client-side against this in-memory list for
zero-latency tapping; only cart/payment/sale actions hit the network.
Re-fetched on a stock-change SSE event (see `SPRINT-04-online-reservations-sync.md`'s
real-time layer) or a manual pull-to-refresh, not polled continuously.

## Real-time / connection state

The top bar's online/offline indicator is a lightweight heartbeat
(`GET /api/v1/health` every N seconds via the BFF). Sprint 2 ships
online-only (master-prompt §41: "build the first version as an online POS
with clear connection status"); the indicator exists from day one even
though it can only ever show "online" until an offline mode is built later
(not currently scheduled — see §41 in the master prompt for the
deferred design if the business later needs it).

## Suspend / resume

A suspended sale is a POS sale document in a `SUSPENDED` status (not yet a
committed `POS_SALE` stock movement) — no separate collection. Listing
suspended sales for a register is `GET /api/v1/pos/sales?status=SUSPENDED&registerId=`.

## Barcode scanning (optional, future — not required for Sprint 2)

Confirmed with the user (2026-07-20): this boutique's cashiers browse and
tap, they don't scan. Barcode support is **not** part of Sprint 2's
deliverable or verification gate. If it's picked up later:

USB/Bluetooth scanners act as keyboards typing fast + a terminator
(usually Enter) — a page-level keydown listener buffering characters
arriving faster than a human types (< 30ms between keystrokes) is enough,
no hardware SDK needed for USB-HID or Bluetooth-HID scanners. Every
variant already carries an optional `barcode` field (Sprint 1) precisely
so this can be layered on later without a schema change — only the POS
frontend listener and a `GET /api/v1/pos/products/barcode/:barcode`
lookup endpoint would need to be added. True serial (RS-232) scanners
would be a separate, larger effort and should only be scoped if the
business actually acquires that hardware.

## Keyboard shortcuts (secondary — touch is primary; useful if the till also has a keyboard)

| Key | Action |
|---|---|
| `F2` | Focus search field |
| `F4` | Open payment modal |
| `F6` | Suspend sale |
| `F7` | Resume suspended sale |
| `F9` | Void last line |
| `Esc` | Close modal |

## Relationship to cash sessions, sales, payments

See `SPRINT-02-pos-core-sales.md` (sale flow, stock deduction) and
`SPRINT-03-cash-sessions-reports.md` (sessions, X/Z reports) for the
backend schemas and transaction boundaries — this document only covers the
frontend/UX shape.
