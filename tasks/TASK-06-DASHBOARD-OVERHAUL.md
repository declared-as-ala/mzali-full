# DASHBOARD OVERHAUL — turn the admin dashboard into a real store-management command center

You are a senior full-stack engineer + product designer picking up
mid-migration work on the Mzali Boutique WooCommerce→NestJS/MongoDB/MinIO
project. Repo root: `c:\Users\Ala\Desktop\mzali full` (Next.js 14 App Router
at root, NestJS backend in `backend/`). Read `progress.md` at the repo root
first — TASK-01 through TASK-06 are done, the backend is live with real
migrated data (~32k orders, 21 products, 9 categories), and
`COMMERCE_PROVIDER=mzali-api` works end to end. **Before starting this task,
first apply the fixes in `tasks/TASK-06-FIX-media-and-orders.md` if they
haven't been applied yet** — the dashboard you're about to build needs
correct order/product data flowing to look right.

## Where things stand today

`app/mzali/page.tsx` (dashboard route) currently renders 4 flat KPI cards
(revenue/orders/AOV/low-stock), 3 small summary cards (today/7d revenue,
today orders), a status-mix list, a top-products list, and a low-stock list
— all plain text, no charts, no trend lines, no visual hierarchy beyond
color-coded gradient cards. It's functional but not a real "at a glance"
command center. The backend endpoint behind it,
`GET /api/v1/admin/stats/dashboard`
(`backend/src/stats/stats.service.ts` + `stats-admin.controller.ts`), only
returns **point-in-time aggregates** (today/7d/30d totals, a status
breakdown, top-5 products by qty, low-stock list, per-employee active-order
counts) — there is **no time-series data**, which means no chart can be
drawn yet without new backend work.

## Goal

Redesign `/mzali` into a genuinely useful, chart-rich, data-dense but clean
admin dashboard — the kind a real store owner would open every morning to
understand the business at a glance, spot problems (stock, stuck orders,
underperforming carriers), and make decisions. This is a **quality bar
task**, not a checkbox task: default AI-generated dashboards tend to be
generic grids of cards; avoid that. Use the `dataviz` skill (if available in
your environment) before writing any chart code — it has a validated color
system, chart-form heuristics, and accessibility rules that will make this
look like a coherent system instead of five different chart libraries'
default themes glued together.

## Backend work — new/extended endpoints (`backend/src/stats/`)

The existing `dashboard()` aggregate stays (it's still useful for the KPI
row) but split time-series and drill-down data into their own endpoints so
the dashboard can lazy-load slower widgets independently and so other pages
(e.g. a future "Reports" page) can reuse them. Suggested additions to
`StatsService` + new controller routes under `/admin/stats/*`:

1. **`GET /admin/stats/revenue-series?days=30&granularity=day`** — daily (or
   weekly, for `days>90`) revenue + order-count buckets for the requested
   window, using the same `EXCLUDED_STATUSES` filter and
   `manualTotalMinor ?? totalMinor` logic already in `revenueSince()`.
   MongoDB `$group` by `{$dateTrunc: {date: '$createdAt', unit: 'day'}}` (or
   `$dateToString` with `%Y-%m-%d`), sorted ascending, zero-filled for days
   with no orders (don't let the chart silently skip gaps — a store owner
   needs to see the zero days too).
2. **`GET /admin/stats/status-funnel`** — counts per status ordered in
   actual business-process order (`checkout-draft → en-attente → confirme →
   [commit] ; annule/tentative as branches`), for a funnel/bar visualization
   distinct from the raw `statusMix` object (which has no inherent order).
3. **`GET /admin/stats/carrier-performance`** — per carrier
   (`navex`/`firstdelivery`/`axess`), count of pushed orders, success rate
   (`carrier.<name>.status === 'sent'` vs `'failed'`), and average time from
   order `createdAt` to `carrier.<name>.pushedAt`. This directly answers "is
   our delivery partner working" — currently invisible.
4. **`GET /admin/stats/coupon-performance`** — from the `coupons` +
   `coupon_redemptions` collections: usage count vs. limit, total discount
   given, per coupon. Only meaningful once coupons are actually used, but
   build it now since the collections already exist (TASK-03).
5. **`GET /admin/stats/geography`** — order count + revenue grouped by
   `customer.city` (the checkout's governorate field) — a store shipping
   across all of Tunisia should see which governorates drive the business.
6. Extend the existing `dashboard()` response with a few more MISSING but
   cheap numbers a real owner wants: `newCustomers` (customers whose
   `firstOrderAt` falls in the window, from the `customers` collection),
   `repeatCustomerRate` (% of orders where `ordersCount > 1` on the
   `customers` doc at order time), `cancelledRate` (annule+cancelled ÷ total
   in the window — a rising cancellation rate is an early warning sign).

All new endpoints: `JwtAuthGuard` + `PermissionsGuard` +
`@RequirePermissions('stats.read')`, same pattern as the existing
`StatsAdminController`. Keep them in `backend/src/stats/` (core stats
module already has no controllers issue — it's API-only already, no
worker/CLI conflict to worry about here, unlike Shipping/Audit). Add unit
tests for any new pure aggregation-shaping logic (date-bucket zero-fill,
funnel ordering) the same way `order-calc.spec.ts` etc. test pure logic —
don't test Mongo aggregation pipelines themselves (that's what the
integration suite pattern in `backend/test/integration/` is for, extend it
if you add non-trivial new logic).

## Frontend work

### Dependency decision (ask yourself, don't just default)
No chart library exists in this project yet (`package.json` has only
`lucide-react`, `clsx`, `zustand`). Recommend adding a lightweight,
Tailwind-friendly SVG charting library — **Recharts** is the standard,
well-maintained choice for this kind of admin dashboard (composable React
components, good defaults, small enough). This is scoped to the admin
bundle only (`/mzali/*`), not the storefront, so it doesn't affect
storefront bundle size/performance — that's the boundary that matters here,
not "avoid all new deps everywhere." If you pick something else, justify it
briefly in your summary.

### New dashboard layout — recommended structure (adapt, don't blindly copy)

1. **Header row**: date-range switcher (Aujourd'hui / 7 jours / 30 jours /
   90 jours) that re-fetches the relevant widgets — don't hardcode 3
   separate cards for today/7d/30d like today's version; let one control
   drive the whole page.
2. **KPI strip** (4-6 cards, keep the existing gradient-card visual
   language from `app/mzali/page.tsx` for continuity — don't throw away the
   brand's current admin look): Revenu (selected range) with a small
   sparkline and vs.-previous-period delta (%, colored), Commandes (range)
   with delta, Panier moyen, Taux d'annulation, Nouveaux clients, Stock
   faible (count, links to `/mzali/stock?lowStock=true`).
3. **Revenue + orders trend chart** — the centerpiece. A combo chart
   (line for revenue, bars or a second line for order count) over the
   selected date range, from `revenue-series`. This is the single most
   useful "is the business growing" visual and is completely absent today.
4. **Status funnel/breakdown** — replace the plain list with a horizontal
   bar chart or funnel visualization ordered by process stage (draft →
   pending → confirmed), color-coded consistently with the status colors
   already defined in `components/admin/CommandesView.tsx`
   (`STATUS_TONE`/`STATUS_LABEL` — REUSE those constants, don't invent a
   second color mapping that drifts from the orders page).
5. **Top products** — keep, but add a small revenue-vs-quantity dual-axis
   or a simple ranked bar chart instead of a plain list; link each row to
   the product's edit drawer.
6. **Low stock panel** — keep the list but make each row link directly to
   `/mzali/stock` with that product pre-filtered/highlighted; add a
   severity indicator (how far below threshold).
7. **Carrier performance** — new panel: success rate per carrier as a small
   multi-bar or donut set, plus a flagged list of recent failed pushes
   (`carrier.<name>.error`) so staff can retry them from here.
8. **Orders by governorate** — a simple horizontal bar list (a real Tunisia
   map is out of scope — don't build a geo map, that's a distraction from
   the data value) ranked by revenue, from the `geography` endpoint.
9. **Per-employee workload** — keep, but as a horizontal bar chart instead
   of a plain list, sorted descending, so it's obvious at a glance who's
   overloaded vs. idle.
10. **Coupon performance** — small table/list, only render the section when
    at least one coupon has redemptions (avoid an empty, useless panel on a
    store that isn't using coupons yet).

### Loading & empty states
Every widget fetches independently (don't block the whole page on the
slowest query) — use React `Suspense` boundaries or per-widget client
fetches with skeleton loaders. A brand-new store with little data should
still look intentional (proper "pas encore de données" empty states with
the existing FR copy voice), not broken.

### Design constraints (do not violate)
- Match the existing brand system already defined in
  `tailwind.config.js`/`lib/site-config.ts` (brand/accent/cta color scales,
  `Inter`/`Cairo` fonts, existing `card`/`btn-primary`/`btn-ghost` utility
  classes) — this is an evolution of the current admin, not a rebrand.
  Load the `dataviz` skill (if present) for how to extend a categorical/
  sequential palette FROM the existing brand colors rather than introducing
  clashing chart-library defaults.
- Respect RTL: the storefront supports Arabic (`lib/i18n.ts`), the admin
  console currently doesn't need to (it's French-only per existing admin
  components) — confirm that's still the intended scope before adding any
  i18n work here; don't scope-creep into admin RTL support unless asked.
- No unnecessary animation; keep it fast — this project's own guidance
  (see `docs/current-system-audit.md` §8 "Storefront UI/UX" analog for
  admin) already says avoid excessive motion.
- Real data only — `DEVELOPMENT RULES` in the master migration prompt this
  whole project follows explicitly bans mock/placeholder data in final
  implementations. Every chart must render from the real
  `/admin/stats/*` endpoints against the live migrated dataset, not
  hardcoded sample numbers.
- Keep the WooCommerce-provider dashboard path (`LegacyDashboard` function
  in the current `app/mzali/page.tsx`) working and visually reasonable —
  it won't get the new charts (no backend to serve them on that provider),
  but it must not crash or look abandoned. A simple "upgrade to see
  advanced analytics" is NOT necessary; just keep today's simpler view
  functioning as the fallback.

## My recommendations (beyond the structural list above) — evaluate and pick what's worth building now vs. flagging for later

- **Alert banner**: a slim, dismissible banner at the top of the dashboard
  surfacing the single most urgent thing right now (e.g. "3 commandes en
  attente depuis plus de 48h" or "Stock épuisé sur 2 produits en
  promotion") — one sentence, one link. This is more actionable than
  another chart.
- **Abandoned-cart recovery visibility**: you already have
  `checkout-draft` orders with real customer phone numbers — surface a
  count + a "voir" link so staff can proactively call abandoned carts. This
  is a real revenue-recovery lever specific to this COD business model, not
  a generic dashboard idea.
- **Order-to-confirmation latency**: median time between `en-attente` and
  `confirme` in `statusHistory` — a rising number means staff are falling
  behind on phone confirmations, a leading indicator before it shows up as
  lost revenue.
- **Exchange rate**: `order.exchange === true` proportion — this business
  explicitly tracks exchanges (`_mzem_exchange` meta ported from Woo); a
  rising exchange rate might indicate a sizing/quality problem worth a
  dashboard callout.
- **Export button**: a simple "Exporter (CSV)" on the revenue trend and
  top-products widgets — store owners routinely want to paste numbers into
  a spreadsheet; cheap to add, disproportionately appreciated.
- **Don't build**: a generic "activity feed" duplicating `/mzali/journal`
  (already exists), a full BI/pivot-table builder (out of scope for this
  project's stage), or push notifications (no infra for that yet, would be
  new scope).
- **Sequencing suggestion**: ship the revenue/orders trend chart + KPI
  strip + status funnel first (highest value, most requested by any real
  store owner), then carrier performance + geography + employee workload,
  then the smaller nice-to-haves (alert banner, export, coupon panel) —
  don't try to land all ten widgets in one uninterrupted pass without
  checking in.

## Verification gate

```bash
cd backend
npm run typecheck && npm run lint && npm test && npm run build
cd ..
npx tsc --noEmit
node backend/scripts/check-contracts.mjs   # only if you touch any mirrored contract type
```

Manual QA with the full local stack up (dev compose + backend +
`npm run dev` with `COMMERCE_PROVIDER=mzali-api`):
- `/mzali` loads with real numbers from the live-migrated dataset (not
  zeros, not mock data) — cross-check one or two figures by hand against
  `mongosh` queries the way earlier QA in this session did.
- Date-range switcher actually changes every widget that depends on it.
- Every chart has a sane empty/loading state — test by temporarily filtering
  to a date range with no orders.
- `COMMERCE_PROVIDER=woocommerce` fallback dashboard still renders without
  errors (rollback safety — this project's #1 rule is "never break the live
  storefront/admin path").

## Do NOT

- Do not replace the KPI-card visual language wholesale with a different
  design system — extend it.
- Do not introduce a second, drifting color mapping for order statuses —
  reuse `STATUS_TONE`/`STATUS_LABEL` from `components/admin/CommandesView.tsx`
  (export them from there if they're not already exported, rather than
  copy-pasting).
- Do not fetch all stats in one giant blocking server-side call if it makes
  the page slow — prefer parallel/independent fetches per widget.
- Do not build a full custom charting engine from scratch; use a real
  library.
- Do not add mock/placeholder numbers anywhere, even temporarily "to see
  the layout" — build against the real endpoints from the start, they
  already have real data to render.
