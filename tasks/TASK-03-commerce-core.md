# TASK 03 — Commerce core (orders, inventory, coupons, customers, assignment, shipping, settings, stats)

You are a senior NestJS engineer on the Mzali migration. Repo root:
`c:\Users\Ala\Desktop\mzali full`. TASK-01 and TASK-02 gates must pass first.
Do not modify the Next.js storefront.

## Read first (source of truth for behavior parity)

- `app/api/orders/route.ts` — checkout create/draft-upsert semantics
  (`{orderId?}` in body ⇒ update existing draft; validates name+phone+items)
- `services/order-service.ts` — OrderService interface (create/getById/list/
  update/remove/assignEmployee; OrderListQuery incl. assignedEmployeeId
  `any|unassigned`; status `any`)
- `services/woo/woo-order-service.ts` — order payload mapping, auto-assign +
  auto-push behavior, `_mzem_*` meta semantics
- `app/api/employee/orders/[id]/status/route.ts` — ALLOWED_FOR_EMPLOYEE =
  `pending, en-attente, processing, confirme, on-hold, tentative, completed,
  cancelled, annule` (port verbatim)
- `lib/round-robin.ts` — round-robin + sticky-customer assignment rules
- `lib/navex.ts`, `lib/firstdelivery.ts`, `lib/axess.ts` — carrier request
  formats (port VERBATIM, same env var names)
- `lib/site-config.ts` — cities list, currency, shipping=8 DT default

## Build (all in `backend/src/`)

### orders/
Schema per the plan: orderNumber (int unique from CountersService, sequence
`orderNumber`), status (custom slugs allowed; `checkout-draft` for drafts),
statusHistory, customer snapshot (+phone2), customerId ref, items (product
snapshots: productId, legacyProductId?, name, slug, imageUrl, qty,
unitPriceMinor, totalMinor, variation, bundleName?, bundleSlot?, costMinor),
subtotal/shipping/discount/totalMinor, manualSubtotal/TotalMinor (admin
overrides), coupon snapshot, deliveryCompany, carrier {navex,firstdelivery,
axess} (result payload + pushedAt + tracking), assignment {employeeId,
assignedAt, assignedBy, history[]}, privateNote, exchange, attempts, source,
paymentMethod 'cod', idempotencyKey (unique sparse), legacyId. Indexes per
plan. Timestamps.

**Checkout service** — POST /orders (ServiceTokenGuard):
- `Idempotency-Key` header → duplicate returns the existing order (200).
- Totals recomputed server-side: unit prices from product/bundle data in
  Mongo; shipping from settings (`shippingFlat`, default 8 DT); coupon
  validated + discount computed server-side; client subtotal/total only
  logged when mismatched.
- Draft flow parity: body may carry `status: 'checkout-draft'`;
  `PUT /orders/:id/draft` updates an existing draft (customer/items/status);
  transition draft → `en-attente` on final submit.
- Mongo transaction: insert order → upsert customer (by normalized phone,
  `common/phone.ts`) → reserve stock per item (STRICT_STOCK=false ⇒ flag,
  don't block) → coupon usage $inc + redemption insert. Assignment runs
  post-commit.
- `GET /orders/:id` (service token) for the merci page.

**Status machine**: transitions append statusHistory + audit log; `→confirme`
commits stock + triggers carrier auto-push; `→annule` releases reservation;
`checkout-draft→en-attente` reserves. Employee status changes restricted to
the verbatim ALLOWED_FOR_EMPLOYEE set.

**Admin endpoints** (permissions orders.*): GET/POST /admin/orders (filters:
page, perPage, status|any, search [name/phone/number], after, before,
assignedEmployeeId|any|unassigned), GET/PUT/DELETE /admin/orders/:id (delete =
trash status then hard delete when already trashed — parity),
POST /admin/orders/:id/assign {employeeId|null}, GET /admin/order-statuses
(distinct slugs in use + standard fallback list),
GET /admin/customers/orders?phone= (exact-phone order history).

**Employee endpoints** (role employee; ownership `assignment.employeeId ===
jwt.sub` enforced in the service): GET /employee/orders (status, q),
GET/PUT /employee/orders/:id (PUT strips ownership fields),
PUT /employee/orders/:id/status, GET /employee/order-statuses,
GET /employee/products/:id, GET /employee/products/picker.

### inventory/
`inventory_items` {productId, warehouseId:'main', onHand, reserved,
lowStockThreshold} unique {productId,warehouseId}; append-only
`stock_movements` ledger (types: migration_init, manual_adjust, order_reserve,
order_release, order_commit, correction; qty signed; onHandAfter/
reservedAfter; orderId; actor; reason). Reserve/commit/release run inside the
order transaction with conditional updates (strict mode: filter
`onHand - reserved >= qty`). Admin: GET /admin/inventory (search, low-stock
filter), POST /admin/inventory/adjust (reason required, audit-logged),
GET /admin/inventory/movements (by product, paginated).

### coupons/
Schema per `backend/src/contracts/coupon.ts` (store value amounts in minor
units internally). POST /coupons/validate (service token) {code, items,
phone} → discount preview using the same server-side calculator as checkout.
Admin CRUD (permission coupons.*) + audit. Redemptions recorded per order;
usageLimit + perPhoneLimit enforced atomically at order creation.

### customers/
Guest records keyed by normalized phone: firstName/lastName, email, city,
address, altPhones, ordersCount, totalSpentMinor, firstOrderAt, lastOrderAt,
lastAssignment {employeeId, at}. Upserted in checkout txn.
GET /admin/customers (search + pagination).

### assignment (inside orders/)
Sticky: customer's `lastAssignment.employeeId` when that employee is still
active and assignment < 30 days old. Else round-robin over active employees
ordered by creation, pointer persisted in `settings` collection, guarded by
RedisLockService. Assignment history entries on the order + audit log.

### shipping/
Port the three carrier libs VERBATIM (same request/response handling, same
env names — see backend/.env.example). Redis lock (`carrier:{orderId}:{name}`)
+ persisted guard: skip when `order.carrier[name].pushedAt` exists. Auto-push
enqueued on the `carrier-push` queue (worker processor with retries) when the
order's deliveryCompany matches `*_AUTO_PUSH_LABEL` on entering `confirme` /
on create (match the exact current trigger in `woo-order-service.ts`).
Manual push endpoints: POST /admin/shipping/{navex|firstdelivery|axess},
POST /employee/shipping/{navex|firstdelivery} (own orders only). Results
stored on `order.carrier.*` and audit-logged.

### settings/ + stats/
`settings` key/value docs: `site` (from data/site-settings.json shape) +
`commerce` {shippingFlat, defaultOrderStatus:'en-attente', cities} seeded from
`lib/site-config.ts` values. GET/PUT /admin/settings/site (+audit).
GET /admin/stats/dashboard → `DashboardStats` contract via aggregation
pipelines (revenue today/7d/30d excluding drafts/cancelled per current
dashboard logic in `app/mzali/page.tsx` — read it), status mix, top products,
low stock, per-employee active order counts.

### cleanup processor (worker)
Purge `checkout-draft` orders older than 14 days (configurable env), nightly
repeatable job.

## Tests (integration, against dev compose)

- Double POST /orders with same Idempotency-Key ⇒ one order.
- Parallel checkouts on the last unit: STRICT_STOCK=true ⇒ exactly one
  succeeds; false ⇒ both succeed, second flagged.
- Status machine stock effects (reserve→commit→release paths, ledger rows).
- Employee A cannot read/update employee B's order (403/404).
- Coupon usageLimit=1 cannot be redeemed twice (parallel-safe).
- Carrier push idempotency with a mocked HTTP layer (nock or undici mock).
- Totals: hand-checked cases incl. bundle pricing and coupon percent/fixed.

## Verification gate

`npm run check:contracts && npm run typecheck && npm run lint && npm test &&
npm run build && npm run test:integration` all green with compose dev up.

## Do NOT

- Trust client-sent prices/totals.
- Invent order statuses beyond the ones in use.
- Bypass the ledger for any stock change.
