# Agent notes — Admin Commandes fix/redesign

Working notes for whichever agent (or human) picks up `todo.md`. Not a
project README — see `README.md`/`guide-admin.md`/`progress.md` for that.

## Scope

One user request, four issues, all in Admin → Commandes:
1. First Delivery sends the wrong city/locality ("Akouda" inserted for a
   "Sousse" order).
2. Orders search input loses characters while typing fast.
3. Order Drawer ("Modifier la commande") needs an ERP-style redesign.
4. Product filter on Orders needs a variant sub-filter that works for both
   new (`variantId`) and legacy (`size`/`color` snapshot, no `variantId`)
   orders.

Full original request and the audit report (9 numbered answers) are in the
conversation history this work started from — `todo.md` is the live
checklist, this file is orientation for picking the work back up cold.

## Key files

- `backend/src/shipping/first-delivery.service.ts` — locality resolution
  (fixed), `first-delivery.service.spec.ts` — regression tests.
- `backend/src/shipping/shipping.service.ts` — carrier dispatch,
  `previewFirstDeliveryLocality()`.
- `backend/src/shipping/shipping-admin.controller.ts` /
  `shipping-employee.controller.ts` — push + preview endpoints.
- `app/api/admin/firstdelivery/route.ts` (+ new `preview/route.ts`) —
  Next.js BFF routes; `services/mzali-api/carrier-push.ts` — shared helper.
- `components/admin/CommandesView.tsx` — orders list, search/filter state,
  the `qParam`→`query` sync bug is at (was) line 78.
- `components/admin/OrderDrawer.tsx` — 1410-line drawer, target of the
  redesign. Order items have **no stable id** today (`{ _id: false }` on
  the schema, array-index-based editing) — this is a real constraint, not
  just cosmetic; fixing it is schema + migration + frontend work.
- `backend/src/orders/order.schema.ts` — `OrderItem` subdocument
  (`productId`, `variantId | null`, `variation: Record<string,string> | null`).
- `backend/src/inventory/inventory.service.ts` —
  `resolveHistoricalVariant()` already has the legacy size/color
  normalization logic (regex for `taille/tallie/size`, `couleur/color`,
  NFC + French lowercase) — reuse it, don't reimplement.
- `backend/src/catalog/variant.schema.ts` — Variant model.

## Conventions this codebase already follows (keep using them)

- Module split pattern: anything with both HTTP controllers (needs
  `AuthModule`) and worker/CLI consumers gets a `*-core.module.ts`
  (schemas/services only) + thin API wrapper. See `backend/src/shipping/`.
- Money in integer millimes (`backend/src/common/money.ts`).
- `backend/scripts/check-contracts.mjs` after any `types/*` /
  `backend/src/contracts/*` change — keep them mirrored, additive only.
- Idempotency via `Idempotency-Key` header + persisted guard, not
  in-memory locks.
- Audit log every state-changing admin/employee action
  (`backend/src/audit/audit.service.ts`).
- Pure, unit-tested calc functions live in their own file (`order-calc.ts`,
  `coupon-calc.ts`, `reorder-formula.ts` style) rather than buried in
  aggregation pipelines or controllers.
- Status-tab counts already use a `$facet` aggregation
  (`orders.service.ts` around line 456) — that's the pattern to extend for
  product/variant filter counts, not a new one.

## Commands

```bash
cd backend
npm run typecheck
npm run lint
npm test                    # full jest suite
npx jest <path>              # scoped
npm run check:contracts

# frontend, from repo root
npx tsc --noEmit
npm run build
```

## Environment constraints (be honest about these, don't claim otherwise)

- No browser available in this environment — UI/visual changes are
  typecheck + build + logic-verified, not screenshot-verified. Say so.
- No live database/Docker stack running in this session by default —
  aggregation/migration logic is reasoned through and unit-tested against
  mocked data, not run against real Mongo, unless the stack is explicitly
  brought up first. Say so rather than claiming live verification that
  didn't happen.
- `COMMERCE_PROVIDER=mzali-api` is what's live in production; the parallel
  `lib/*.ts` WooCommerce-era files (e.g. `lib/firstdelivery.ts`) are dead
  code paths — don't spend effort fully re-implementing fixes there, a
  clear warning comment pointing at the real backend fix is enough.

## Update discipline

After finishing each checklist item in `todo.md`, check it off immediately
(don't batch). If a task turns out to need a follow-up not on the list,
add it rather than silently doing extra scope or silently dropping it.
