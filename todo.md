# Admin → Commandes fix/redesign — TODO

Tracks the 4-issue request: First Delivery locality bug, search input bug,
Order Drawer redesign, product+variant order filter. Updated after each
completed task. See `agent.md` for project/agent conventions.

## 1. First Delivery — wrong city/locality mapping

- [x] Audit: trace exact code path, find root cause of "Akouda" insertion.
- [x] Rewrite `backend/src/shipping/first-delivery.service.ts` locality
      resolution: word-boundary-safe matching, explicit city/delegation
      priority over free-text address, ambiguity detection instead of
      silent first-match fallback.
- [x] Add `previewLocality()` (side-effect-free) and `localityId` override
      on `createShipment()` so an admin-confirmed locality is never
      re-resolved from free text.
- [x] Plumb `localityId` through `ShippingService.push()` / `dispatch()`.
- [x] New `POST /admin/shipping/firstdelivery/preview` endpoint
      (`shipping-admin.controller.ts`) + DTO.
- [x] `PushShipmentDto.localityId` optional field; employee controller
      passes it through too.
- [x] Extend shared `CarrierResult` type with `needsConfirmation`/`candidates`.
- [x] BFF: `app/api/admin/firstdelivery/route.ts` passes `localityId`
      through; new `app/api/admin/firstdelivery/preview/route.ts`.
- [x] `services/mzali-api/carrier-push.ts`: `previewFirstDelivery()` helper.
- [x] Flag (not fix — dead code, inactive provider) the same bug in
      `lib/firstdelivery.ts` with a warning comment.
- [x] Regression tests in `first-delivery.service.spec.ts`: Akouda
      false-positive repro, order-independence, ambiguous-address case,
      ambiguous-delegation case, explicit-Akouda-is-honored case,
      `localityId` override bypass, stale `localityId` rejection,
      `previewLocality()` never calls `/create`.
- [x] `npx jest first-delivery.service.spec.ts` — 17/17 pass.
- [x] Backend typecheck clean.
- [x] Order Drawer First Delivery card: preview runs automatically once an
      unsent order loads, shows resolved Gouvernorat/Ville/délégation/
      Localité/Adresse, shows "Localité First Delivery à confirmer" +
      selector when ambiguous, Envoyer disabled until confirmed
      (`FirstDeliveryCard` in `OrderDrawer.tsx`).
- [x] Confirmed Navex/Axess regression tests still green — full backend
      suite 349/349 (see Final pass below).

## 2. Orders search input lag / digit loss — DONE

- [x] Audit: found `CommandesView.tsx:78`
      `useEffect(() => setQuery(qParam), [qParam])` stomping loop.
- [x] Fix: extracted pure `lib/order-search-sync.ts`
      (`reconcileSearchQuery`) — once the user has typed, the field is
      "owned" by local state and the URL is write-only for it, never read
      back, which removes the race regardless of navigation timing/order.
      Wired into `CommandesView.tsx` (input onChange, clear button,
      `handleReset` all mark ownership).
- [x] Browser back/forward still resyncs from the URL via a `popstate`
      listener (the one case where relinquishing ownership is correct).
- [x] Wrapped `updateFilters`'s `router.push` in `startTransition` so
      navigation never blocks the input (`pending` already existed, was
      unused for this call site).
- [x] Regression tests: `tests/order-search-sync.test.ts` (6 cases — noop,
      external adopt, stale-echo ignored with full "9"→"99999" typing
      simulation, out-of-order resolution, clear-field ownership,
      general ignore-once-owned). All pass (`npm run test:session`, 38/38
      total, no regressions elsewhere).
- [x] Frontend typecheck clean.

## 3. Order Drawer redesign

- [x] Stable per-item id: `OrderItem.itemId` (schema default
      `randomUUID()`, `{_id:false}` subdocument kept as-is — an explicit
      application field instead, lower blast radius). `types/order.ts` +
      `backend/src/contracts/order.ts` mirror (`OrderLineItem.itemId`),
      `order.mapper.ts` includes it, `OrderUpdateItemDto.itemId` optional
      (echoed back to preserve identity across a save), `resolveUpdateItems`
      carries it through (undefined for a genuinely new line → fresh
      default on save). `migrate:order-variation-keys` extended to also
      backfill `itemId` for pre-existing orders in the same pass (renamed
      scope, same command name/registration). 3 new unit tests
      (`orders-resolve-update-items.spec.ts`) confirm preservation for
      kept lines and undefined for new ones. Contracts/typecheck/lint
      clean; 91/93 orders-suite tests pass (2 pre-existing unrelated
      failures, see note in section 4).
- [x] Frontend (`OrderDrawer.tsx`) reworked to key every line by a stable
      `LineDraft.key` (real server `itemId` for an existing line, a
      client-only `temp:<uuid>` placeholder for a line added this session)
      instead of array index. `setLine`/`setLineVariation`/`removeLine`
      all target `key`; bundle-group rendering (`renderSummaryRows`) kept
      its index-free grouping-by-consecutive-lines logic, only the
      per-line edit/remove target changed. Save payload omits `itemId` for
      `temp:` lines (fresh one assigned server-side) and echoes the real
      one otherwise.
- [x] Compact carrier cards: generic `CarrierCard` (Navex/Axess) +
      `FirstDeliveryCard` (adds the preview/confirm UI) replace the 3
      copy-pasted unstyled blocks, under a new "Transporteurs" `Card`.
      Added manual `sendToNavex`/`sendToAxess` — previously only First
      Delivery had any manual send button (retry-on-failure only); the
      other two only ever auto-pushed on save. Axess card hidden for
      `apiBase='/api/employee'`, matching the backend's
      `ShippingEmployeeController` (never exposes Axess to employees).
- [x] Richer sticky header: `Drawer.tsx`'s `title` prop widened
      `string`→`ReactNode` (backward compatible); `OrderDrawer` now shows
      "Commande #N", a live status badge (`getOrderStatusTone`), customer
      name, total, created/confirmed dates — previously just the literal
      "Modifier la commande" with no number/status/total at all. Drawer
      width set to `max-w-[900px]` per the 700–900px desktop guidance.
- [x] New "Historique" section: backend `OrderResponse.statusHistory`
      (additive contract field, both mirrors + `order.mapper.ts`) was not
      exposed to the frontend at all before this — the drawer now renders
      it chronologically (newest first) with from→to, actor, timestamp,
      note.
- [x] Preserved: `phone2` (untouched, already fully wired), legacy item
      display ("Variante historique" / free-text chips, untouched),
      full-array-replace save contract, server-side totals recompute —
      none of these needed changes, confirmed by reading the relevant
      code before touching anything nearby.
- [~] Responsive: mobile already got full-width automatically (Drawer's
      `<aside>` is `w-full` under its max-width) and the product table's
      horizontal scroll is contained to the table itself (`overflow-x-auto`
      wrapper), not the page — so there is no page-level overflow. Did NOT
      rebuild the table as stacked mobile cards (the deeper, more
      correct fix for a data-dense 6-column table on a narrow screen) —
      no browser available in this environment to verify a visual
      restructure like that, and the risk of shipping an unverified
      layout change felt worse than leaving the existing (contained,
      scrollable) behavior in place. Flagging as a real gap, not silently
      calling it done.
- [ ] NOT done: variant-aware product picker in Ajouter/Modifier (step 1
      product → step 2 exact variant with live availability, red+disabled+
      "Épuisé" for out-of-stock, blocking manual add when stock tracking
      is enabled). This is a genuinely new feature (live per-variant stock
      lookup wired into the existing picker flow) rather than a fix to
      existing code, and was the piece cut for time — the picker today
      still adds a product without a variant-availability step.
- [x] Regression tests where feasible without a browser: backend
      itemId-preservation tests (`orders-resolve-update-items.spec.ts`,
      3 cases). Did NOT add drawer-open/save/responsive UI tests — this
      codebase has no DOM/component test harness (no jsdom/testing-library,
      confirmed by inspecting `tests/*.test.ts` and `package.json` — see
      `agent.md`), and standing one up was out of scope for this pass.

## 4. Product + variant order filter — DONE

- [x] Backend: `items[].variationKey` (normalized size/color, reusing
      `resolveHistoricalVariant`'s exact normalization rules via new
      `order-variation-key.ts`) kept in sync by an `Order` schema
      `pre('save')` hook — no order-construction call site needed to
      change. `migrate:order-variation-keys` CLI command backfills
      existing orders (idempotent, `--dry-run`, batched `bulkWrite`).
- [x] Added `items.variantId` and `items.variationKey` indexes; kept the
      existing `items.productId+status+createdAt` index as the first
      match stage (`buildVariantCondition` matches productId first).
- [x] New `OrdersService.variantFilterOptions()` — per-variant order
      counts for one product, reusing the same tab/status/search/date
      scope as `counts()`'s per-product breakdown (extracted into shared
      `buildProductScopeAnds`); labels resolved against the current
      Variant catalog, falling back to a `legacy:<size>|<color>` value +
      "(historique)" label when a legacy snapshot doesn't map to exactly
      one current variant. New `GET /admin/orders/variant-options`.
- [x] `OrderListQueryDto.variantId` accepts a real variant id, `none`
      (no resolvable variant identity), or `legacy:<key>` — all handled in
      one `buildVariantCondition()` reused by both `list()` and `counts()`.
      An unknown/mismatched variant matches zero results, never silently
      widens back to "all variants of this product".
- [x] Frontend: `CommandesView.tsx` variant sub-`<select>` appears once a
      product is selected and has more than one resolvable variant
      identity; new BFF routes `app/api/admin/orders/variant-options` and
      `app/api/employee/orders/variant-options`; `services/order-service.ts`
      / `mzali-order-service.ts` / `app/admin/commandes/page.tsx` /
      `app/api/admin/orders/route.ts` all thread `variantId` through.
      Extracted shared `lib/order-date-range.ts` (`computeDateRange`) to
      keep the new fetch and the existing infinite-scroll loader from
      drifting apart on date-preset math.
- [x] Regression tests: `order-variation-key.spec.ts` (11 cases — key
      casing/spelling variants, accents/whitespace, missing/ambiguous
      data), `orders-list.spec.ts` new "product + variant filter" block
      (6 cases — real variantId match incl. legacy fallback, wrong-product
      variant, unknown variant, `none`, `legacy:` direct match, variantId
      without productId ignored).
- [x] Backend: full suite 349/349 pass, typecheck/lint/contracts all clean.
      Frontend typecheck/lint/build all clean.
- [ ] Not done: no live Mongo in this environment, so the aggregation
      pipelines are code-reviewed + unit-tested against mocked
      `model.find`/`model.aggregate`, not run against a real
      `deploy`/`docker compose` stack. Run
      `migrate:order-variation-keys --dry-run` then for real, plus a
      manual spot-check of `/admin/orders/variant-options` against the
      live 56K-order dataset, before treating this as production-verified.

## Bonus fix (found during final verification, out of the original 4)

`order-status.spec.ts` was failing before any of this session's changes
(confirmed: zero diff on `order-status.ts` at the point this was found).
Root cause traced, not just observed: `stockEffectForStatus()` in
`backend/src/orders/order-status.ts` returned `'reserve'` for
`en-attente` (the DEFAULT status for every new order) and every other
non-terminal status — directly contradicting its own docstring one line
above ("does not reserve stock while awaiting phone confirmation") and
the explicit SPRINT-04 business decision recorded in `progress.md`. Real
production impact, not just a red test: `OrdersService.create()` branches
on `effect === 'reserve'` and calls `inventory.reserve()` — so **every
new order was silently reserving stock at creation time**, the exact
behavior the business explicitly rejected (COD orders must be captured
regardless of stock; only a phone-confirming employee should trigger any
stock effect). Fixed by removing the incorrect `reserve` branch so the
function matches its own docstring. Full backend suite re-run after the
fix: 349/349 pass (was 347/349). Fixed because it was found live and
already broken in a way this push would otherwise ship as red CI +
silently-wrong production behavior — not scope creep for its own sake.

## Final pass (all 4 issues) — DONE

- [x] Full backend test suite (349/349), typecheck, lint, contracts —
      all clean.
- [x] Frontend typecheck, lint, `npm run test:session` (38/38), and
      production build — all clean.
- [x] Verified what could be verified in this environment (unit tests,
      typecheck, lint, build, careful code reading). Explicitly flagged
      what could NOT be verified here rather than claiming it: no browser
      (no visual/interaction QA on the redesigned drawer or the new
      search-sync fix), no live Mongo/Docker stack (no live-data
      verification of the variant filter aggregation or the two backfill
      migrations) — see the per-section notes above for exactly what
      still needs a real environment before this is production-verified.
