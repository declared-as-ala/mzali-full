# TASK 06 — Frontend integration (provider switch, auth v2, coupon UI, admin pages)

You are a senior Next.js engineer on the Mzali migration. Repo root:
`c:\Users\Ala\Desktop\mzali full` (Next.js 14 App Router at root). TASK-01..05
gates green; the backend API works with seeded data. This is the FIRST task
that touches the storefront — every change must be reversible via
`COMMERCE_PROVIDER=woocommerce`.

## Locked rules

- `services/index.ts` is the ONLY provider switch. New code implements the
  EXISTING interfaces (`services/{product,category,order,employee}-service.ts`)
  returning the EXISTING `types/*` shapes — float dinars, same fields.
- Must NOT change: storefront routes/slugs, `types/*` (additive only), cart
  store + localStorage key `mzali-cart`, i18n/RTL, `formatPrice`, `<img>`
  usage, checkout draft auto-save UX, visual design.
- The API is called server-side only (BFF): base `MZALI_API_URL`, header
  `X-Service-Token: MZALI_SERVICE_TOKEN` for public reads/order create,
  `Authorization: Bearer <access token from cookie>` for admin/employee calls.

## Build

### 1. `services/mzali-api/`
- `client.ts` — small fetch wrapper (server-only): baseURL, service token,
  optional bearer, JSON errors → thrown `Error(message)` matching what the
  existing routes expect; `cache: 'no-store'`.
- `mzali-product-service.ts`, `mzali-category-service.ts`,
  `mzali-order-service.ts`, `mzali-employee-service.ts` implementing the four
  interfaces 1:1 against `/api/v1` (see backend Swagger). Order create maps
  `CheckoutPayload` unchanged; list queries pass through page/perPage/status/
  search/after/before/assignedEmployeeId.
- `services/index.ts`: `const provider = process.env.COMMERCE_PROVIDER ?? 'woocommerce'`
  choosing Woo/File vs MzaliApi implementations. Nothing else changes.

### 2. Auth v2 (`lib/auth.ts` + `app/api/auth/route.ts`)
- Login route: when provider is `mzali-api`, proxy to `POST /api/v1/auth/login`
  ({username, password}), then set cookies: `mzali_at` (access token, httpOnly,
  maxAge = expiresIn), `mzali_rt` (refresh token, httpOnly, path `/api/auth`),
  AND the legacy `mzali_session` cookie with the same `{role, userId, name}`
  payload — role mapped: super_admin/admin → 'admin', employee → 'employee'
  (other roles → 'admin' for console access per permissions). DELETE = call
  `/auth/logout` with the refresh token + clear all three cookies.
- `lib/auth.ts` `getSession()`: try `mzali_at` first — verify JWT locally with
  `JWT_ACCESS_SECRET` (HS256, use `jose` or Node crypto — no new heavy deps),
  fall back to the legacy HMAC cookie. Return the same `Session` shape.
- `lib/api-auth.ts` — helper for API routes: get bearer from cookie; on 401
  from the backend, call `/auth/refresh` with `mzali_rt`, reset cookies, retry
  once.

### 3. Existing API routes → provider branch
Routes that only use `services/*` need no change. Update the ones touching
legacy stores to delegate to the backend when provider is `mzali-api`:
- employees CRUD routes → `/api/v1/admin/employees*`
- `admin/profile` → `/api/v1/auth/password` (+ keep GET meta shape)
- `admin/site-settings` → `/api/v1/admin/settings/site`
- `admin/upload` → `/api/v1/admin/media` (multipart passthrough; response
  keeps `{id, url}` shape)
- `admin/customer-orders` → `/api/v1/admin/customers/orders?phone=`
- `admin/order-statuses`, `employee/order-statuses` → backend equivalents
- carrier routes (`admin|employee`/`navex|firstdelivery|axess`) →
  `/api/v1/{admin|employee}/shipping/*`
- `employees-directory` → `/api/v1/employees/directory`
Auto-assignment and auto-push now happen server-side in NestJS — the Woo
provider keeps its old behavior untouched.

### 4. Checkout coupon UI (additive, works only on mzali-api)
- `CheckoutPayload` gains optional `couponCode?: string` in `types/order.ts`
  (additive!) — run `node backend/scripts/check-contracts.mjs` and sync the
  mirror copy in the same commit.
- Small coupon field on `/commande` (code input + "Appliquer" button calling a
  new thin route `POST /api/coupons/validate` → backend validate): shows
  discount line in the summary; sends couponCode with the order. Hidden when
  provider is woocommerce. Match existing form styling (Tailwind, existing
  input classes) and FR/AR i18n via `lib/i18n.ts` additions.
- `/merci` shows the discount when the order carries one.

### 5. New admin console pages (match existing `/mzali` visual patterns —
reuse `components/admin/*` styles/Sidebar entries)
- `/mzali/coupons` — list/create/edit/toggle coupons (thin proxy routes under
  `app/api/admin/coupons*`).
- `/mzali/stock` — inventory table (search, low-stock filter), adjust dialog
  (qty delta + required reason), movement history drawer per product.
- `/mzali/journal` — audit log viewer (filters: entity, action, employee,
  date range; paginated).
- `/mzali` dashboard — when provider is mzali-api, fetch
  `/api/v1/admin/stats/dashboard` through a proxy route instead of computing
  client-side; keep the same cards/labels, add low-stock card.

### 6. `next.config.mjs`
Keep remotePatterns as-is (wildcard already allows the MinIO host — do not
tighten in this task; tightening happens in TASK-08 hardening).

## Verification gate

```bash
npx tsc --noEmit                      # frontend clean
node backend/scripts/check-contracts.mjs
# Manual QA with full local stack (compose + backend + frontend):
COMMERCE_PROVIDER=mzali-api npm run dev
```
- Storefront: home, /shop (+search/sort/pagination), category page, product
  page (options + bundles), cart, checkout with draft auto-save, coupon
  apply, order submit → merci page. Verify order appears in Mongo with
  correct totals + assignment + stock reservation.
- Admin: login as admin (old password), dashboard stats real, orders CRUD +
  assign + status change, products CRUD + image upload (lands in MinIO),
  categories, employees, coupons, stock adjust (ledger row appears), journal.
- Employee: login, sees only own orders, allowed status changes only,
  carrier push works.
- **Rollback rehearsal**: switch `COMMERCE_PROVIDER=woocommerce`, restart —
  storefront + admin behave exactly as before this task.

## Do NOT

- Redesign anything; no new UI libraries.
- Break the Woo provider path — it must stay fully functional.
- Store tokens in localStorage (httpOnly cookies only).
