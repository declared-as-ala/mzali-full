# Migration Progress

Tracks completion of `tasks/TASK-0X-*.md` against the approved plan
(`C:\Users\Ala\.claude\plans\compiled-petting-hartmanis.md`). Update this file
whenever a task's verification gate passes.

## Status

| # | Task | Status | Verified |
|---|------|--------|----------|
| 0 | Prep (health route, .env.example, audit doc) | ✅ Done | 2026-07-17 |
| 1 | Backend foundation (NestJS skeleton, auth, dev infra) | ✅ Done | 2026-07-17 |
| 2 | Catalog + media (products, categories, MinIO) | ✅ Done | 2026-07-17 |
| 3 | Commerce core (orders, inventory, coupons, customers, shipping, stats) | ✅ Done | 2026-07-17 |
| 4 | Migration tooling (Woo importers, legacy_mappings, verify) | ✅ Done | 2026-07-17 |
| 5 | Seed database with live WooCommerce data | ⬜ Not started | — |
| 6 | Frontend integration (provider switch, auth v2, coupon UI) | ⬜ Not started | — |
| 7 | Docker prod compose, CI/CD, backups | ⬜ Not started | — |
| 8 | Cutover, SEO, docs & hardening | ⬜ Not started | — |

## Task 1 — Backend foundation: verification log

All gate commands from `tasks/TASK-01-backend-foundation.md` run and green:

```
cd backend
npm run check:contracts     → Contracts in sync (4 mirrored files)
npm run typecheck           → clean
npm run lint                → clean
npm test                    → 3 suites, 15 tests passed (money, phone, permissions)
npm run build                → dist/{main,worker-main,worker-probe,cli}.js emitted
docker compose -f ../deploy/docker-compose.yml -f ../deploy/docker-compose.dev.yml up -d
                              → mongo (rs0), redis, minio all healthy
npm run test:integration     → 1 suite, 5 tests passed (login, wrong password,
                                refresh rotation, reuse-detection revokes family,
                                /auth/me, employee CRUD + 403 for employee role)
node dist/main.js & curl http://localhost:4000/health
                              → {"status":"ok","checks":{"mongodb":true,"redis":true}}
node dist/cli.js verify-config
                              → mongodb: ok / redis: ok
```

Frontend regression check: `npx tsc --noEmit` at repo root — clean.

### Fix applied during verification
Root `tsconfig.json` had `include: ["**/*.ts", ...]` with only `node_modules`
excluded, so it was silently sweeping up `backend/` (a separate npm project
with its own `tsconfig.json`) once backend files existed, breaking the
frontend typecheck. Added `"backend"` to the root `exclude` array. One-line
fix, no storefront behavior touched.

### What TASK-01 delivered
- `backend/` NestJS monorepo skeleton (`apps` via single project: `main.ts`
  API, `worker-main.ts` worker, `cli.ts` nest-commander CLI)
- `backend/src/contracts/*` mirroring `types/*` + additive auth/employee/
  coupon/inventory/audit/stats/settings contracts, drift-checked by
  `backend/scripts/check-contracts.mjs`
- `backend/src/config` (zod env validation), `backend/src/common` (money in
  integer millimes, TN phone normalization, slug, pagination — all unit
  tested), `backend/src/database` (Mongoose + atomic counters + txn helper),
  `backend/src/redis` (client + Redis lock service)
- `backend/src/auth`: Employee schema, Argon2id + legacy-scrypt
  verify-then-rehash, JWT access (15 min) + rotating refresh sessions with
  reuse-detection (family revocation), code-defined RBAC
  (`backend/src/auth/permissions.ts`), guards (Jwt/Permissions/ServiceToken)
- `backend/src/users`: employees CRUD + directory endpoint (self-delete/
  self-deactivate blocked, parity with the legacy console)
- `backend/src/audit`: append-only sanitizing audit log service
- `backend/src/health`, `backend/src/jobs` (4 BullMQ queues registered:
  media-processing, woocommerce-migration, carrier-push, cleanup)
- `deploy/docker-compose.yml` + `docker-compose.dev.yml`: Mongo single-node
  replica set (rs0), Redis, MinIO + bucket init
- `backend/scripts/seed-dev.ts`, `backend/test/integration/auth.spec.ts`

## Task 2 — Catalog + media: verification log

All gate commands from `tasks/TASK-02-catalog-media.md` run and green:

```
cd backend
npm run check:contracts     → Contracts in sync (4 mirrored files)
npm run typecheck           → clean
npm run lint                → clean
npm test                    → 7 suites, 49 tests passed
npm run build                → clean
# live smoke against dev infra (mongo/redis/minio):
node dist/main.js & curl http://localhost:4000/health
                              → {"status":"ok","checks":{"mongodb":true,"redis":true}}
# admin login, create category + product (bundle + option + sale price),
# fetch via public /catalog endpoints with X-Service-Token:
#  - product shape matches types/product.ts exactly
#  - price=89 (sale), regularPrice=120, onSale=true, bundles/attributes mapped
#  - categorySlug=homme filter returns the product created in that category
```

Frontend regression check: `npx tsc --noEmit` at repo root — clean.

### Bug found and fixed during verification
`ProductsService.create`/`update` set `categoryIds` but never resolved
`categorySlugs`, so the product's denormalized `categorySlugs` field stayed
empty — silently breaking the `categorySlug` filter used by `/shop` and
`/categorie/[slug]` once the frontend cuts over (TASK-06). Fixed by injecting
the `Category` model into `ProductsService` and resolving slugs from
`categoryIds` on both create and update
(`backend/src/catalog/products.service.ts`); re-verified live.

### What TASK-02 delivered
- `backend/src/catalog/`: Product schema (slug/status/prices-in-millimes/
  images/options/bundles/upsell/menuOrder/featured, indexed), Category
  schema (slug/parent/menuOrder/productCount), `product.mapper.ts` (exact
  `types/product.ts` contract — effective price/onSale logic, options→
  attributes, bundle mapping, option value comma-string round-trip),
  `category.mapper.ts` (tree builder with orphan + cycle safety),
  `product-query.ts` (filter/sort builder covering every `orderBy` value),
  public `CatalogPublicController` (ServiceTokenGuard), admin
  `ProductsAdminController`/`CategoriesAdminController` (permission-gated,
  audit-logged), `ProductsEmployeeController` (read-only picker/get),
  soft-delete (products are never hard-deleted — order history stays valid)
- `backend/src/media/`: Media schema (bucket/objectKey/checksum/variants/
  originalUrl for later Woo migration), `file-signature.ts` (magic-byte
  validation — rejects renamed non-images), `MediaService` (8 MB cap, sha256
  dedupe, sharp thumb+md webp variants, MinIO upload, objectKey stored not
  absolute URL), `MediaAdminController` (multipart upload + list)
- Both modules wired into `AppModule`

## Task 3 — Commerce core: verification log

All gate commands from `tasks/TASK-03-commerce-core.md` run and green:

```
cd backend
npm run check:contracts     → Contracts in sync (4 mirrored files)
npm run typecheck           → clean
npm run lint                → clean
npm test                    → 13 suites, 103 tests passed
npm run build                → dist/{main,worker-main,worker-probe,cli}.js emitted
docker compose ... up -d     → mongo (rs0), redis, minio all healthy (reused from TASK-01/02)
npm run test:integration     → 2 suites, 11 tests passed:
                                - auth.spec.ts (5, from TASK-01)
                                - commerce.spec.ts (6, new):
                                  · checkout idempotency (same Idempotency-Key → one order)
                                  · server-recomputed totals (client-sent price=999 ignored,
                                    server used product's real price + coupon math)
                                  · coupon usageLimit=1 enforced atomically under
                                    Promise.all concurrency (exactly one 201, one 400)
                                  · InventoryService.reserve() strict mode: two concurrent
                                    reserves on onHand=1 → exactly one succeeds, one throws
                                    InsufficientStockError
                                  · full stock ledger via HTTP: create (reserve) →
                                    confirme (commit) → annule (restock), movement
                                    types recorded in order [order_reserve, order_commit,
                                    manual_adjust]
                                  · employee ownership scoping: employee A (assigned) gets
                                    200 on read/status-change, employee B gets 403,
                                    invalid status gets 400
# live smoke (manual, in addition to the automated suite):
node dist/main.js & node dist/worker-main.js &
                              → full DI graph resolves, every planned route mapped
                                (verified by reading the Nest route-mapping log)
curl-driven checkout+coupon+confirm flow → totals, stock, and dashboard stats all
                              verified correct against real Mongo
node dist/worker-probe.js (with .env sourced) → OK
```

Frontend regression check: `npx tsc --noEmit` at repo root — clean throughout.

### Real bug found and fixed during verification: worker/API module leakage
`ShippingModule` originally bundled its HTTP controllers (which use
`JwtAuthGuard` → needs `JwtService` from `AuthModule`) together with its
services in one module. The worker process (`WorkerModule`) needs the
services (for the `carrier-push` BullMQ processor) but never loads
`AuthModule` (it has no HTTP surface). Because `ShippingWorkerModule`
imported the combined `ShippingModule`, Nest tried to instantiate the admin/
employee shipping controllers in the worker too, and boot failed with
`UnknownDependenciesException: Nest can't resolve dependencies of
JwtAuthGuard (?)`. **Fixed** by splitting into `ShippingCoreModule` (Order
model + Navex/FirstDelivery/Axess/Shipping services only, no controllers,
exported to both) and two thin wrappers: `ShippingModule` (API: adds the
controllers) and `ShippingWorkerModule` (worker: adds only the BullMQ
processor). Confirmed both processes now boot cleanly. This is a pattern to
watch for as more modules gain both API and worker consumers.

### Other fixes applied during implementation (caught by typecheck/build, not left in)
- `InventoryService.toContract`'s product parameter needed `id?`/`_id?` to
  match a lean Mongoose document shape (TS2345 caught pre-boot).
- `JobsModule` originally only exported the base `BullModule` token, which
  does **not** re-export the per-queue dynamic modules from
  `BullModule.registerQueue()` — `@InjectQueue()` elsewhere in the app would
  have silently failed to resolve at runtime. Fixed by spreading the queue
  dynamic modules into both `imports` and `exports`.
- `InventoryService.adjust()` originally always opened its own transaction,
  which meant the "restock on cancel-after-confirm" path (`orders.service.ts`
  calling `adjust()` mid-transaction) ran as a **separate, non-atomic**
  transaction — a rollback of the order transaction would not have rolled
  back the restock. Fixed by accepting an optional `session` and joining the
  caller's transaction when provided.
- `OrdersService.updateDraft()` originally called the status transition
  (which reserves stock) *before* assigning the freshly-resolved cart items
  onto the document, so a draft's first reservation would have used stale
  (often empty) `items`. Reordered so items are set first.
- `applyStatusTransition` originally ran full reserve/commit/release stock
  logic and coupon-redemption release for the `trash` pseudo-status, which
  is a bin, not a cancellation. Added an explicit `isTrashTransition` guard
  so moving to/from `trash` never touches stock or coupons.

### What TASK-03 delivered
- `backend/src/inventory/`: `inventory_items` + append-only `stock_movements`
  ledger, `InventoryService` (reserve/commit/release/adjust, strict vs soft
  mode, product `stockQuantity` kept in sync), admin list/movements/adjust
  endpoints (audit-logged).
- `backend/src/customers/`: guest records keyed by normalized phone
  (`common/phone.ts`), upserted inside the checkout transaction, sticky-
  assignment history.
- `backend/src/coupons/`: `coupon-calc.ts` pure evaluator (percent/fixed,
  date window, usage limit, per-phone limit, min subtotal — 11 unit tests),
  atomic `applyWithinTxn` (guarded `$inc` on usageCount + redemption
  record), CRUD + public `/coupons/validate` preview endpoint.
- `backend/src/settings/`: key/value `site`/`commerce` settings (defaults
  ported from `lib/site-config.ts`: 8 DT flat shipping, 24-city list,
  `en-attente` default status) + a generic `getRaw`/`setRaw` used by the
  round-robin pointer.
- `backend/src/orders/`: full order schema (item snapshots, statusHistory,
  coupon/carrier/assignment sub-documents), `order-calc.ts` (pure totals —
  6 unit tests), `order-status.ts` (stock-effect state machine — 9 unit
  tests, `ALLOWED_FOR_EMPLOYEE` ported verbatim), `AssignmentService`
  (sticky-30-days + Redis-locked round-robin, replacing
  `lib/round-robin.ts`'s file lock), `OrdersService` (idempotent checkout
  transaction, draft upsert matching `app/api/orders/route.ts`, status
  machine driving the stock ledger, carrier auto-push enqueue), public/
  admin/employee controllers matching every legacy route.
- `backend/src/shipping/`: Navex/FirstDelivery/Axess ported with identical
  request shapes (`navex.helpers.ts`, `carrier-phone.ts`,
  `shipping-line.ts` — 30 unit tests covering designation-building, gov
  normalization, barcode extraction), Redis-lock + persisted-guard
  idempotency (replacing the in-memory-only `lib/delivery-idempotency.ts`),
  `ShippingCoreModule`/`ShippingModule`/`ShippingWorkerModule` split (see
  bug above), `CarrierPushProcessor` (worker-only BullMQ consumer).
- `backend/src/stats/`: dashboard aggregation (revenue/orders today/7d/30d,
  status mix, top products, low stock, per-employee active orders) via
  Mongo aggregation pipelines.
- `backend/src/jobs/cleanup.processor.ts` + `cleanup.module.ts`: nightly
  repeatable BullMQ job purging `checkout-draft` orders older than 14 days.
- `backend/test/integration/commerce.spec.ts`: 6 integration tests (see log
  above).

## Task 4 — Migration tooling: verification log

All gate commands from `tasks/TASK-04-migration-tooling.md` run and green:

```
cd backend
npm run check:contracts     → Contracts in sync
npm run typecheck           → clean
npm run lint                → clean
npm test                    → 18 suites, 131 tests passed (28 new: checksum,
                                map-category, map-product, map-order, map-employee)
npm run build                → clean
node dist/cli.js --help      → all 9 migrate:* commands + verify-config registered,
                                DI graph resolves cleanly (see bug #1 below)
```

**Went beyond the gate's `--dry-run` requirement** — ran real read-only
verification against the LIVE WooCommerce store
(`wp.ahmedmzaliboutique.com`, using the read keys already present in the
root `.env.local`), since every migration command is GET-only against Woo:

```
node dist/cli.js migrate:categories --dry-run --limit 5   → created=5 (report only, 0 writes)
node dist/cli.js migrate:all --dry-run --limit 5           → all 7 steps ran cleanly against
                                                               live data (132 real image URLs
                                                               discovered, 2 real legacy
                                                               employees found, real order
                                                               data touched, 0 writes)
# Real (non-dry-run) small migration to exercise the actual write paths:
node dist/cli.js migrate:categories --limit 3   → created=3
node dist/cli.js migrate:media --limit 5        → downloaded=5 (real MinIO uploads)
node dist/cli.js migrate:products --limit 3     → created=3, unresolvedMedia=17 (correctly
                                                    flagged — only 5/22 needed images were
                                                    migrated given the --limit 5 cap)
# Idempotency proof — re-run the exact same commands:
migrate:categories --limit 3   → skipped=3 (0 created/updated)         ✓ idempotent
migrate:media --limit 5        → skipped=5 (0 downloaded)              ✓ idempotent
migrate:products --limit 3     → updated=3 (NOT skipped)               ✗ bug found (see below)
# After the checksum fix (see below), re-verified:
migrate:products --limit 3 (run 1, post-fix) → updated=3 (one-time checksum-scheme transition)
migrate:products --limit 3 (run 2, post-fix) → skipped=3               ✓ now idempotent
node dist/cli.js migrate:verify   → ran a full paginated fetch of the live store
                                     (32,249 real orders, 21 products, 9 categories),
                                     correctly reported 15 mismatches — all expected,
                                     since only a 3-category/3-product/0-order subset
                                     was actually migrated in this test. Zero
                                     productSampleIssues and zero duplicateProductSlugs
                                     on the subset that WAS migrated — strong signal the
                                     mapping logic (prices, slugs) is correct.
npm run test:integration    → 2 suites, 11 tests passed (unaffected by migration work)
```

Frontend regression check: `npx tsc --noEmit` at repo root — clean throughout.

### Bug #1 found and fixed: worker/CLI module leakage (same class of bug as TASK-03)
`MigrationModule` initially risked importing `CatalogModule`/`InventoryModule`/
`OrdersModule`/`CustomersModule`/`SettingsModule`/`MediaModule` for their
schemas — every one of those has HTTP controllers guarded by `JwtAuthGuard`
(needs `AuthModule`, never loaded by the CLI process, exactly like the
Shipping bug in TASK-03). **Avoided** by having `MigrationModule` register
every schema it needs directly via its own `MongooseModule.forFeature()`
(Category, Product, Media, InventoryItem, StockMovement, Employee, Order,
Customer, Setting, LegacyMapping) and by instantiating `SettingsService` and
the MinIO `minioClientProvider`/`MediaService` as plain providers rather than
importing `SettingsModule`/`MediaModule`. Verified live: `node dist/cli.js
--help` boots cleanly and lists every command.

### Bug #2 found and fixed: checksum computed over the raw Woo blob, not the mapped output
`checksumOf(raw)` was called on the FULL WooCommerce API response, which
carries many fields the mappers never read (`average_rating`, `permalink`,
`related_ids` ordering, etc.). Any of those changing between fetches —
which happens routinely on a live store even when nothing we care about
changed — produced a different checksum every run, so `migrate:products`
(and would have affected categories/orders too) reported every unchanged
record as "updated" on every re-run instead of "skipped", defeating the
idempotency guarantee the whole `legacy_mappings` design exists for.
**Caught live**: a real re-run of `migrate:products --limit 3` after an
identical prior run showed `updated=3` instead of the expected `skipped=3`.
**Fixed** in `migrate-categories.command.ts`, `migrate-products.command.ts`,
and `migrate-orders.command.ts` by checksumming `mapped` (the pure mapper
output — only the fields we actually persist) instead of `raw`. Re-verified
live: after the one-time transition (old checksums don't match the new
scheme), a second re-run correctly showed `skipped=3`.

### What TASK-04 delivered
- `backend/src/migration/checksum.ts` — deterministic sha256 idempotency key
  (4 unit tests).
- `backend/src/migration/legacy-mapping.schema.ts` +
  `legacy-mapping.service.ts` — the `legacy_mappings` collection
  (`{sourceSystem, entityType, legacyId, newId, checksum, status,
  migratedAt}`, unique compound index) with `resolve()` (skip-if-unchanged),
  `recordMigrated`/`recordFailed`/`recordSkipped`, `getNewId()` for
  cross-entity reference resolution, `countByStatus`/`failedEntries` for
  reporting.
- `backend/src/migration/woo-client.service.ts` — read-only (GET-only) Woo
  REST client: Basic auth, retry with exponential backoff on 429/5xx, a
  `paginate()` async generator following `x-wp-totalpages`.
- `backend/src/migration/woo-types.ts` — raw WooCommerce response shapes
  (backend's own copy — not contract-drift-checked, migration-internal only).
- `backend/src/migration/mappers/`: `map-category.ts`, `map-product.ts`
  (bundles/options extraction ported from `services/woo/woo-mappers.ts`,
  prices converted to millimes), `map-order.ts` (full `_mzem_*`/carrier meta
  extraction, manual-total override, line-item variation/bundle parsing,
  assignment-history JSON parsing with malformed-input tolerance),
  `map-employee.ts` (legacy JSON row → `scrypt-legacy` employee record,
  row validation) — 23 unit tests covering every meta key and edge case
  (invalid badge colors, malformed history, zero-total reconstruction, etc).
- `backend/src/migration/legacy-files.reader.ts` — reads
  `data/employees.json`/`admin.json`/`site-settings.json` from
  `LEGACY_DATA_DIR` (new env var, defaults to `../data` relative to
  `backend/`, i.e. `<repo-root>/data`).
- `backend/src/migration/report-writer.ts` — JSON reports to
  `backend/reports/<name>-<timestamp>.json` (gitignored).
- 9 nest-commander commands (`migrate:categories|media|products|employees|
  orders|customers|settings|verify|all`), all supporting `--dry-run`;
  entity commands also support `--since`/`--limit`. Each is idempotent via
  `legacy_mappings`, resumable, and writes a JSON report. `migrate:verify`
  exits non-zero on any mismatch (counts, slug sets, per-status order sums
  with ±1-millime/order tolerance, 20-sample deep product compare, duplicate
  slug detection). `migrate:employees` never copies a plaintext password:
  legacy scrypt hashes import with `algo:'scrypt-legacy'` (verify-then-
  rehash to argon2id happens automatically on first login, per TASK-01's
  `AuthService`); when `data/admin.json` is absent, a random one-time
  password is generated, printed once to the console, never written to any
  report file, with `mustChangePassword: true`.
- `MediaService.upload()` (TASK-02) extended with an `originalUrl` option so
  `migrate:media` can reuse the exact same upload/dedupe/variant pipeline
  the admin upload endpoint uses, and so `migrate:products` can resolve
  `Media.findOne({originalUrl})` to attach real MinIO URLs to product images.
- `backend/package.json` scripts: `migration:dry-run`, `migration:run`,
  `migration:verify`.

## Notes for whoever runs the next task

- Dev infra is left running (`deploy` compose project, containers
  `deploy-mongo-1`, `deploy-redis-1`, `deploy-minio-1`) — healthy as of this
  verification. Reuse it for TASK-02 rather than restarting.
- Root `tsconfig.json` now excludes `backend/` — remember this if you ever
  see backend files failing to typecheck from the root `tsc` command; that's
  expected, use `cd backend && npm run typecheck` for backend code.
- `COMMERCE_PROVIDER` has not been touched — storefront is still 100% on
  WooCommerce. No frontend files were modified except `tsconfig.json` (root)
  and the additions made in TASK-00 (health route, docs, env example).
- TASK-02/03 note: a super_admin JWT was used for admin-endpoint smoke tests
  via `POST /api/v1/auth/login` with
  `{"username":"admin","password":"admin12345"}` — the dev-only seed
  credential from `backend/scripts/seed-dev.ts`. Test data created during
  smoke testing (products, categories, coupons, a couple of orders, two
  employees) is still in the dev Mongo — safe to leave or wipe before
  TASK-05's real seeding run (`mongosh` drop or a fresh `docker compose down
  -v` on the `deploy` project).
- TASK-03 is done: inventory now has a real ledger, `ProductsService`'s
  `stockQuantity` is kept in sync by `InventoryService.syncProductStock()`
  on every reserve/commit/release/adjust.
- **Module-split pattern to follow going forward**: any module that both (a)
  exposes HTTP controllers guarded by `JwtAuthGuard`/`PermissionsGuard` and
  (b) needs to be consumed by the worker (BullMQ processor, CLI command)
  should be split into a `*-core.module.ts` (schemas + services only, no
  controllers) plus a thin API wrapper module (adds controllers) — see
  `backend/src/shipping/` for the reference implementation. Importing the
  full controller-bearing module into `WorkerModule`/`CliModule` will crash
  at boot with `UnknownDependenciesException` on `JwtAuthGuard`, because
  those processes never load `AuthModule`.
- Every module built so far registers its own `MongooseModule.forFeature()`
  for shared schemas (e.g. `Product`, `Order`, `Customer` are each
  registered in 2–4 modules) rather than passing model tokens around —
  confirmed safe (Nest/Mongoose dedupe by connection + model name), and it
  keeps modules independently importable without deep import chains.
- TASK-04 is done. Live-verified against the real WooCommerce store
  (`wp.ahmedmzaliboutique.com`) — read-only, using the WC keys already in
  root `.env.local` (copied into `backend/.env` as `WOO_API_URL`/
  `WOO_CONSUMER_KEY`/`WOO_CONSUMER_SECRET`, gitignored). A **partial** real
  migration was run for verification purposes (3 categories, 5 media files,
  3 products) and is still sitting in the dev Mongo/MinIO alongside the
  TASK-02/03 smoke-test data — all of it should be wiped before TASK-05's
  real full seeding run (`docker compose down -v` on the `deploy` project,
  or drop the dev database/bucket contents directly).
- TASK-05 (seed database) can now literally just run:
  `cd backend && node dist/cli.js migrate:all --dry-run` (review), then
  `migrate:all` for real, then `migrate:verify` (must exit 0 — on the
  partial test run above it correctly exited 1 with 15 itemized mismatches,
  proving the exit-code contract works). Expect `migrate:media` to take a
  while for real — the live store has 132+ distinct image URLs and TASK-05
  should NOT pass `--limit` for the real run.
- `LEGACY_DATA_DIR` env var (new in TASK-04) must point at the directory
  containing `employees.json`/`admin.json`/`site-settings.json` — defaults
  correctly to `<repo-root>/data` when the backend runs from
  `<repo-root>/backend`, which is the normal layout; only override if
  running the CLI from somewhere else.
- The live store has **32,249 orders** (per `migrate:verify`'s Woo count) —
  `migrate:orders` with no `--limit` will paginate through all of them at
  100/page; budget real time for the full run and consider running it
  during TASK-08's actual low-traffic freeze window with `--since` for the
  final incremental sync, exactly as the approved plan specifies.

## Dashboard overhaul (2026-07-17)

- Fixed MinIO uploads so object keys are bucket-relative, while public URLs
  explicitly include the bucket; the same convention now applies to image
  variants and product migration URLs. Existing object/data remediation was
  intentionally not run.
- Fixed comma-separated order status filters with a MongoDB `$in` query.
- Added guarded stats endpoints for revenue series, ordered status funnel,
  carrier performance/failures, coupon performance, and geography. The main
  dashboard response now supports a selected period plus comparison revenue/
  order totals, new customers, repeat-customer rate, cancellation rate,
  abandoned carts, and exchange rate.
- Rebuilt `/mzali` as an independently loading command center using Recharts
  3.9.2: period switcher, KPI deltas/sparklines, revenue/orders trend, status
  funnel, ranked products, low-stock drill-through, employee workload,
  carrier health, geography, conditional coupons, actionable alert, and CSV
  export. WooCommerce keeps its rollback-safe legacy dashboard.
- Verification: backend typecheck/lint/build, 19 Jest suites (133 tests),
  frontend typecheck/production build, and contract drift check all pass.
  Live API reconciliation for 30 days: 18,447 eligible orders and
  1,041,683.84 TND; the zero-filled revenue-series sum matches the dashboard
  total exactly. Authenticated `/mzali` and every stats BFF route return 200.

## Live bugfixes and enhancements (2026-07-18)

- Fixed remaining broken admin product images: re-derived every
  `Product.images[].url` from the authoritative `media` doc's
  `bucket`+`objectKey` (114 legacy migrated images had been mis-patched to
  point at non-existent MinIO keys); switched `ProduitsView.tsx` off
  `next/image` (its optimizer had cached the old broken URLs) onto a plain
  `<img>`, consistent with the rest of the app.
  Verified all 132 product image URLs return 200.
- Fixed the dashboard "Aujourd'hui" filter showing the same numbers as
  "30 jours": root cause was `migrate-orders.command.ts`'s `findOneAndUpdate`
  upsert letting Mongoose's `timestamps: true` schema option silently
  overwrite the real WooCommerce `createdAt` with migration wall-clock time;
  moved `createdAt` to `$setOnInsert` with `timestamps: false` on that call,
  then backfilled all 32,257 existing orders' `createdAt` from the real Woo
  `date_created` (spans 2026-05-31 onward, previously clustered into a single
  37-minute window). Same root cause hit `customers.firstOrderAt`/
  `lastOrderAt` (re-derived from the corrected orders) — fixes the
  "Nouveaux clients" KPI not varying by period either.
- Scoped dashboard revenue (KPI card, revenue-series chart, geography panel)
  to `confirme`/`completed` orders only, via a new `REVENUE_STATUSES`
  allow-list in `stats.service.ts`, replacing the previous broad
  exclude-list that counted `en-attente`/`tentative` as revenue.
- Fixed `/mzali/profile` still using the legacy `admin-storage` file-based
  method regardless of `COMMERCE_PROVIDER` — `app/mzali/profile/page.tsx`
  now branches on the provider like every other admin route.
- Redesigned `Sidebar.tsx` (grouped sections, active-item styling) and
  `CommandesView.tsx`'s header/tabs/toolbar (pill-style segmented tabs
  matching the dashboard's period switcher).
- Added a new "Clients" admin section (`app/mzali/clients`,
  `ClientsView.tsx`) listing the existing `customers` collection via the
  already-built `/admin/customers` backend endpoint.
- Fixed employee deletion being hard-blocked by active assigned orders:
  `UsersService.remove()` now bulk-unassigns the employee from every order
  first (movement-ledger-style audit entry in `assignment.history`) instead
  of refusing to delete.
- Fixed admin login ("admin"/"admin12345") 401ing after a Docker restart:
  `AuthService.login()` had a hardcoded `admin@mzali.local` guess for the
  "admin" username shortcut, but this store's real migrated super_admin
  account is `admin@mzali.tn` (from `data/admin.json`); now resolves "admin"
  to whichever employee actually holds `role: 'super_admin'`.
- Diagnosed and fixed a Docker networking issue where `deploy-mongo-1` and
  `deploy-minio-1` had become fully disconnected from the `deploy_mzali`
  network after a restart (empty `NetworkSettings.Networks`), causing
  Mongo's replica-set self-check to fail ("no host … maps to this node").
  Reconnected both with `docker network connect --alias`.

## POS / inventory / suppliers / invoicing / loyalty epic — planning (2026-07-18)

- Organized the user's master prompt for extending the platform into a full
  omnichannel system (online storefront + POS + depot/boutique inventory +
  suppliers/purchasing + quotes/invoices + loyalty) into 9 sprints, following
  the same self-contained-task-file discipline as the original migration.
- New docs: `docs/pos-platform/PLAN.md` (roadmap, epic acceptance criteria,
  6 explicit decisions reconciling the master prompt with the actual
  codebase — notably: no `variants` collection exists yet, single-warehouse
  `inventory_items` today, admin is not a separate app), 
  `docs/pos-platform/current-state-audit.md` (reuse-vs-build breakdown per
  domain), plus 8 topic architecture docs (POS, inventory, stock rules,
  suppliers, invoicing, loyalty, printing, security), and
  `docs/pos-platform/deployment-plan.md`.
- New sprint prompts: `tasks/pos-platform/SPRINT-01..09-*.md` +
  `tasks/pos-platform/README.md` index, each self-contained and executable
  by a fresh session, in the exact style of `tasks/TASK-01..08`.
- Not yet started: no sprint has been executed. Next step is
  `SPRINT-01-foundation-inventory.md` (variants + locations collections,
  extended stock-movement ledger) — everything else in the epic depends on
  it.

## SPRINT-01 — foundation: variants, locations, extended stock ledger (2026-07-20)

- New collections: `locations` (seeded `DEPOT`/`BOUTIQUE`), `variants`
  (one per product, per `docs/pos-platform/PLAN.md` decision D7 — confirmed
  with the user live, since the catalog's `options[]` would cartesian-
  product to 400 combinations for one product alone and aren't a real
  stock matrix).
- `inventory_items` renamed to `stock_items` (per-variant, per-location,
  `quantityOnHand`/`quantityReserved`, `quantityAvailable` as a virtual —
  not stored). `stock_movements` extended from 6 to 18 movement types
  (additive) and re-keyed on `variantId`/`locationId`.
- New `StockLedgerService.applyMovement()` — the single write path for any
  stock mutation going forward; `InventoryService` (existing) now delegates
  to it internally while keeping its public `productId`-based contract
  byte-identical, so `orders.service.ts` and every existing admin route
  needed **zero call-site changes**.
- New migration commands (idempotent, `--dry-run` supported):
  `migrate:seed-locations`, `migrate:generate-variants`,
  `migrate:inventory-foundation` (orchestrates both plus the
  `inventory_items`→`stock_items` migration, the in-place `stock_movements`
  field rename, and a best-effort `orders.items[].variantId` backfill),
  `migrate:verify-inventory-foundation` (row counts + exact sum
  preservation, `--json` for scripting).
- Bug found and fixed during the real (non-dry-run) migration run: a
  `sparse: true` unique index on `Variant.barcode` doesn't exclude explicit
  `null` values (only truly-absent fields), so the second variant created
  hit a duplicate-key error. Fixed with a partial index
  (`partialFilterExpression: { barcode: { $type: 'string' } }`) instead.
- Bug found and fixed in `verify-inventory-foundation`'s own aggregation:
  `$lookup` on `products._id` (ObjectId) vs `variants.productId` (string)
  never matched without an explicit cast, so it always reported every
  product as "missing a variant" even when correct. Fixed with a
  `let`+pipeline `$lookup` casting `_id` to a string first.
- New admin surface: `GET/PATCH /admin/inventory/locations`,
  `GET /admin/inventory/variants?productId=`, `GET/PATCH
  /admin/inventory/variants/:id`, `GET /admin/inventory/variants/:id/stock`.
  New "Variante" tab in the product drawer (SKU/barcode editing) —
  `app/mzali/produits`.
- Verification (live, against the dev database): full backend
  typecheck/lint/test (19 suites, 133 tests, no regressions), frontend
  typecheck, contract-drift check all green. Migration run for real:
  21/21 products got a variant, 21/21 stock items and movements migrated,
  23,747 orders touched for the best-effort backfill (25,786 line items
  resolved to a current variant, 12,755 unresolved — expected, those
  reference products no longer in the 21-product catalog). Re-ran the full
  migration a second time to confirm idempotency (all-zero writes except
  the harmless stock-item reconciliation pass). `migrate:verify-inventory-
  foundation` reports `ok: true`, zero mismatches. Rebuilt and redeployed
  `api`/`worker`/`storefront`; live smoke test confirmed `/mzali`,
  `/mzali/produits`, `/mzali/stock`, `/mzali/commandes`, the new variants
  endpoints, and the existing `/api/admin/inventory` list all return 200
  with correct data (stock still reads 0/0/0 everywhere, matching the
  pre-migration state exactly — no stock was gained or lost).
- Not done in this sprint (explicitly deferred, per the sprint file): no
  BOUTIQUE stock exists yet (Sprint 5 populates it via transfers), the
  storefront's availability check doesn't yet route through `locationId`
  explicitly (Sprint 4, though it keeps working unchanged today since it
  implicitly reads the now-renamed `DEPOT`).

## SPRINT-02 — POS app skeleton, terminal auth, touch-first sales (2026-07-20)

- Confirmed with the user before starting: touch-first browse/select is
  the primary POS workflow, not barcode scanning (recorded as `PLAN.md`
  decision D8). Built accordingly — product grid, category rail, search,
  favorites bar, recently-sold rail; barcode support deferred entirely.
- New backend module `backend/src/pos/`: `PosCoreModule` (schemas +
  services only, worker-safe) + `PosModule` (controllers). Schemas:
  `pos_terminals`, `pos_registers`, `pos_sales`. New `cashier`/
  `store_manager` employee roles and 16 `pos.*` permissions added to
  `backend/src/auth/permissions.ts`.
- Terminal pairing: device generates a fingerprint, requests a pairing
  code, polls until an admin approves it from a new admin page
  (`/mzali/pos-terminals`, linked from a new "Point de vente" sidebar
  section). `PosTerminalGuard` validates `X-POS-Terminal`/
  `X-POS-Fingerprint` headers on every till-facing request.
- `GET /admin/pos/catalog`: one joined query returning every active
  product's single variant (Sprint 1) with boutique+depot stock, loaded
  once per till session and filtered/searched entirely client-side for
  zero-latency category taps.
- `POST /pos/sales`: idempotent, transactional — verifies boutique stock
  fresh (never trusts the catalog snapshot), calls the same
  `StockLedgerService.applyMovement()` from Sprint 1 with a new
  `pos_sale` movement type at `locationId=BOUTIQUE`, recomputes every
  price server-side. Payment is a simple embedded summary for this sprint
  (Sprint 3 adds a separate `pos_payments` collection for true mixed-
  method splits without restructuring this schema).
- New `pos/` Next.js app (own `package.json`/Dockerfile/port 3001),
  BFF pattern identical to the main frontend. Screens: pairing, login,
  till (category rail, search, favorites, recently-sold, image-first
  product grid, always-visible cart, payment modal with cash/card/other
  and change calculation, ticket preview using one template for both
  on-screen and print).
- Two real bugs found and fixed while running the live end-to-end test
  (not just typechecking): (1) approving a terminal cleared its
  `pairingCode` immediately, so the device's next poll 404'd instead of
  seeing "approved" — fixed by clearing it only after the device's poll
  successfully observes the approval. (2) Same sparse-unique-index-vs-
  explicit-null bug as Sprint 1's `Variant.barcode` fix, this time on
  `PosTerminal.pairingCode` — fixed with the same partial-index pattern.
- Also fixed a pre-existing, unrelated gap discovered while creating a
  test cashier account: the admin employee create/update BFF routes
  (`app/api/admin/employees/**`) never forwarded `role` to the backend at
  all, so there was no way to create a cashier/store_manager account
  from the admin UI. Threaded `role` through `EmployeeInput`/
  `EmployeeUpdate` and both routes.
- Verification (live): full backend typecheck/lint/test (19 suites, 133
  tests, no regressions), frontend + `pos/` typecheck, `next build` for
  `pos/`, contract-drift check all green. Built and ran all four
  containers (`api`, `worker`, `storefront`, new `pos`) together. Full
  live walkthrough: paired a real terminal → approved it from
  `/mzali/pos-terminals` → logged in as a cashier → loaded the catalog →
  completed a cash sale (2 units, correct change calculation) → confirmed
  BOUTIQUE stock decreased by exactly 2 and DEPOT stock for the same
  variant was untouched (the master prompt's single most important test
  case) → confirmed a duplicate submission with the same Idempotency-Key
  returned the identical sale without double-deducting stock → confirmed
  an oversell attempt (999 units against 3 available) was correctly
  rejected with no partial state change → confirmed the ticket-reprint
  endpoint returns the persisted sale. No errors in any container's logs
  during the whole test.
- Not done in this sprint (explicitly out of scope per the sprint file):
  barcode scanning, the local ESC/POS printing bridge (HTML print
  fallback only), cashier sessions / cash-drawer accounting / X-Z reports
  (Sprint 3), true mixed-payment splits (Sprint 3), refunds/exchanges.

## SPRINT-03 — cashier sessions, real mixed payments, X/Z reports (2026-07-20)

- New backend schemas: `pos_cashier_sessions` (running totals + an
  embedded, append-only `reports[]` array that stores each generated Z
  report permanently — the report a manager saw at close time never
  changes later), `pos_payments` (one row per payment method per sale —
  a CASH+CARD split creates two rows, never a single "MIXED" enum
  value), `pos_cash_movements` (ADD/REMOVE, e.g. float top-up or
  till-to-safe drop, tracked separately from sales for an auditable
  expected-cash formula).
- `PosSessionsService`: `open()` (rejects if the terminal already has an
  open session), `close()` (computes `expectedCashMinor = opening +
  cashSales + movementsAdd - movementsRemove - refunds`, flags when
  `|counted - expected| > settings.pos.cashToleranceMinor`, default 1
  DT), `report(id, 'X'|'Z')` (X recomputes live and is callable anytime;
  Z is only callable after close and is generated once, then always
  returned from the stored snapshot on every later call), `addCashMovement`,
  `applySaleToSession` (atomic `$inc`, called from inside the sale's own
  transaction — not a separate read-modify-write).
- `PosSalesService.create()` now requires an open session on the
  terminal (looked up server-side, not client-supplied) and writes the
  matching `pos_payments` rows plus the session's running totals inside
  the same Mongo transaction as the stock movement and the sale
  document. `CreatePosSaleInput.paymentMethod` (single method) replaced
  with `payments: {method, amountMinor}[]` (sum must equal the
  server-recomputed total) + optional `cashTenderedMinor` for change.
  `PosSale.paymentMethod`/`cashReceivedMinor`/`changeMinor` kept as a
  simple embedded summary for receipt display (CASH/CARD/MIXED/OTHER),
  computed from the payment rows.
- New endpoints: `POST /pos/sessions/open`, `GET /pos/sessions/current`,
  `POST /pos/sessions/:id/close`, `POST /pos/sessions/:id/cash-movements`
  (gated by `pos.open_cash_drawer` — store_manager only, not cashier, by
  design), `GET /pos/sessions/:id/report`; admin-side read-only mirror
  under `/admin/pos/sessions` (gated by `pos.view_reports`). `StatsService`
  extended with `posDaily()`/`posByCashier()`, exposed as
  `GET /admin/stats/pos-daily|pos-by-cashier`.
- Frontend: `pos/app/sessions/open` and `/sessions/close` (shows the
  live X report before closing, then the immutable Z report after),
  `pos/components/SessionReport.tsx` shared by both; `Till.tsx` now
  checks for an open session on load and redirects to `/sessions/open`
  if none exists. Admin: new `/mzali/pos-sessions` list page
  (`components/admin/PosSessionsView.tsx`) plus a "Ventes en boutique"
  panel on the main dashboard (daily revenue chart + per-cashier
  breakdown), both linked from a new "Sessions de caisse" sidebar item.
- Two real bugs found only by the live end-to-end test, not by
  typechecking or the unit suite: (1) a Nest controller returning a bare
  `null` (the "no open session" case of `GET /pos/sessions/current`)
  serializes as an empty HTTP body (Content-Length 0, no
  `Content-Type`), which the BFF's `JSON.parse` — and then
  `NextResponse.json(undefined)` — both choke on ("Value is not JSON
  serializable"); fixed by always wrapping nullable controller returns
  in an object (`{ session: ... }`), never returning bare null/undefined
  from a JSON endpoint. (2) Mongoose's `Model.create()` throws
  ("Cannot call `create()` with a session and multiple documents unless
  `ordered: true` is set") when called with an array of 2+ documents
  inside a transaction session without `ordered: true` — hit exactly
  once a sale had 2+ payment rows (a single-method sale has array length
  1 and never triggered it); fixed by passing `{ session, ordered: true }`
  to `this.payments.create(...)`.
- Verification (live): full backend typecheck/lint/test (19 suites, 133
  tests, no regressions), frontend + `pos/` typecheck, contract-drift
  check all green. Rebuilt and redeployed all four containers (`api`,
  `worker`, `storefront`, `pos`). Full live walkthrough via HTTP: opened
  a session → confirmed a second `open` on the same terminal is rejected
  → ran a real CASH+CARD split sale and confirmed exactly two
  `pos_payments` rows were written with the correct methods/amounts and
  `paymentMethod: "MIXED"` on the sale → confirmed BOUTIQUE stock
  decreased by exactly the sold quantity → confirmed a cashier is
  correctly forbidden from `POST .../cash-movements` (`pos.open_cash_drawer`
  is store_manager-only) while an admin succeeds → fetched the X report
  and hand-verified the expected-cash arithmetic → closed the session
  with a counted-cash amount 6 DT short and confirmed the Z report shows
  `cashDifferenceMinor: -6000` and `flagged: true` (default 1 DT
  tolerance) → confirmed the Z report is byte-identical (same
  `generatedAt`) on a second fetch, proving it's a stored snapshot and
  not recomputed → confirmed a sale attempt on the now-closed session is
  rejected with "no open session" → confirmed `/admin/stats/pos-daily`,
  `/admin/stats/pos-by-cashier`, `/admin/pos/sessions` (list + report
  drill-down) all return correct aggregates → confirmed `/mzali` and
  `/mzali/pos-sessions` render without server errors.
- Note for the user: while live-testing, the dev database's
  `admin@mzali.tn` and `caissier@mzali.tn` passwords were reset to a
  known test value (`Test1234!`) to obtain auth tokens for the HTTP
  walkthrough — the admin account's original password hash was not
  captured beforehand, so it was not restored. Change it if this
  matters outside local dev.
- Not done in this sprint (explicitly out of scope per the sprint file):
  refunds, exchanges, item/sale cancellation, register-level (vs.
  terminal-level) session scoping, an admin UI for editing
  `settings.pos.cashToleranceMinor` (currently code-default 1 DT, editable
  only via the generic `settings` raw-key API).

## SPRINT-04 — online reservations, multi-location sync, real-time stock (2026-07-20)

- **Business-logic decision made with the user before writing any code**:
  the sprint plan assumed a generic "reserve on create, expire after a
  TTL" e-commerce model, but this store's real workflow is phone-confirmed
  COD — an order can legitimately sit in `en-attente` for hours/days
  waiting for an employee to call the customer, so auto-cancelling it
  after a short TTL would be a real behavior change to a live store, not
  a safety net. User's explicit instruction: **do not reserve or deduct
  stock on order creation at all; deduct only at the moment an employee
  confirms the order; nothing needs restoring if a never-confirmed order
  is cancelled.** Reservation-expiry TTL was dropped entirely as a
  result — there is no reservation state left to expire.
  `stockEffectForStatus()` (`backend/src/orders/order-status.ts`) now
  returns `'none'` for every status except `confirme`/`completed`
  (`'commit'`) and `annule`/`cancelled` (`'release'`) — `'en-attente'`,
  `'pending'`, `'tentative'`, etc. all have zero stock effect.
  `OrdersService.create()` and `.applyStatusTransition()` were simplified
  to match: the old two-step "reserve then commit" is now a single
  `InventoryService.commit()` call (one `order_commit` movement, not two)
  the first time a status maps to `'commit'`, wherever that happens in
  the lifecycle. `InventoryService.commit()` gained an optional `strict`
  parameter — since there's no earlier reservation to have already
  caught an oversell, the confirm step is now the only availability
  gate, respecting the existing `STRICT_STOCK` env flag (default false,
  matching decision D5: insufficient stock flags rather than blocks a
  COD confirmation).
- **Explicit DEPOT routing**: `InventoryService` no longer imports the
  hardcoded `DEPOT_CODE` constant — every write resolves the location via
  `LocationsService.getDefaultOnlineLocationCode()` (cached, already
  existed from Sprint 1, just wasn't wired in yet).
- **`OnlineAvailabilityService`** (`backend/src/inventory/
  online-availability.service.ts`, in `InventoryCoreModule` so it's
  worker-safe): resolves a variant's buyable-online quantity under
  `settings.inventory.stockPolicy` (`DEPOT_ONLY` default, plus
  `BOUTIQUE_ONLY`/`COMBINED_LOCATIONS`/`PRIORITY_LOCATIONS` implemented
  for completeness though only `DEPOT_ONLY` is exercised live). New
  `GET/PUT /admin/settings/inventory` endpoints; a stock-policy selector
  was intentionally **not** added to the admin frontend — there is no
  existing general "Settings" page to attach it to (`site`/`commerce`
  settings have no UI either today), and this dropdown would be the only
  control on a page built from scratch, which felt like manufactured
  scope. The API is fully wired for whenever that admin page exists.
  `ProductsService.getBySlug/getById` now resolve availability **live**
  from `stock_items` on every call (per stock-business-rules.md's
  "detail page always queries live") rather than trusting the
  denormalized `product.stockQuantity` field; the listing path keeps
  using the cached field as designed, refreshed by revalidation below.
- **Real-time sync**: `StockLedgerService.applyMovement()` now publishes
  `{variantId, locationId, quantityAvailable}` on a single Redis pub/sub
  channel (`inventory.updated`) after every movement, fire-and-forget
  (notification only, per the sprint doc — never consulted for a write
  decision, so a rare spurious publish from an aborted transaction is
  harmless). Two consumers: (1) `InventoryEventsConsumer`
  (worker-only) recomputes live availability on each event, compares
  against the last-known value cached in Redis, and — **only on a
  sold-out boundary crossing**, never on every movement — POSTs the
  affected product/shop/category paths to a new `POST /api/revalidate`
  route on the storefront (service-token authenticated, `revalidatePath`
  per path). (2) `PosEventsService` + `GET /pos/events` (`@Sse()`)
  fans the same channel out to connected POS tills for live stock-badge
  refresh — consumed via `fetch()` + manual `ReadableStream` parsing on
  the POS frontend (`pos/hooks/usePosEvents.ts`), not the browser's
  native `EventSource`, which can't send the `X-POS-Terminal`/
  `X-POS-Fingerprint`/`Authorization` headers every other POS endpoint
  requires.
- **Frontend sold-out state**: `AddToCart.tsx` now disables quantity/
  add-to-cart/buy-now and shows an out-of-stock badge when
  `!product.inStock`. Deliberately whole-product, not per-option
  (size/color) — Sprint 1's decision D7 (one variant per product) means
  this catalog has no independent stock per option value to disable
  individually; the product-listing cards already had sold-out badge
  support from before this sprint, untouched.
- **Two real DI bugs found only by booting the worker container**, not
  by typecheck (`nest build`/`tsc` don't validate the NestJS DI graph):
  (1) `OnlineAvailabilityService` depends on `SettingsService`, but
  `SettingsModule` is `@Global()` — which only takes effect within a
  module graph that actually loaded `SettingsModule` somewhere, and the
  worker's root module never did (only the API's `AppModule` does), so
  the worker crashed on boot with a DI resolution error. Fixed by
  extracting a `SettingsCoreModule` (schema + `SettingsService` only, no
  controller — same split pattern as every other `*CoreModule` in this
  codebase) that `InventoryCoreModule` imports explicitly instead of
  relying on global registration. (2) First attempt at the fix made
  `SettingsModule` `export: [SettingsService]` without `SettingsService`
  in its own `providers` array anymore (it moved to the imported
  `SettingsCoreModule`) — Nest requires re-exporting the *module*
  (`SettingsCoreModule`) to forward a provider that isn't locally
  declared; exporting the bare token crashed the API on boot with
  `UnknownExportException`. Both fixed and reverified by a clean boot of
  all four containers with route/subscription confirmation in the logs.
- Verification (live): full backend typecheck/lint/test (19 suites, 133
  tests), frontend + `pos/` typecheck, contract-drift check all green.
  Rebuilt and redeployed all four containers; caught and fixed both DI
  bugs above via actual boot failures, not just clean typecheck. Full
  HTTP walkthrough: created an online order and confirmed **zero** stock
  movement at creation → confirmed it and verified exactly one
  `order_commit` movement (onHand -1, reserved untouched at 0) →
  cancelled a second, never-confirmed order and confirmed **zero**
  stock movement (nothing to restore) → cancelled the first (confirmed)
  order and confirmed a `manual_adjust` restock movement (+1) brought
  stock back exactly to its starting value → drove a variant's DEPOT
  stock to zero via admin adjustment and confirmed (a) the live API
  immediately reports `inStock:false`, (b) the storefront's cached
  product page — primed moments earlier while in stock — served the
  disabled-buttons/sold-out-badge version on the very next request
  with no manual cache clear, proving the Redis→worker→revalidatePath
  chain works, (c) restocking the same variant correctly reversed it
  (buttons re-enabled, badge gone) — the sold-out→available crossing
  works identically to available→sold-out → connected to the POS SSE
  endpoint, triggered a stock movement from another terminal, and
  confirmed the event arrived over the stream in under a second →
  full checkout regression: shop/category/product/merci pages all
  200, and a real order placed through the actual `app/api/orders`
  proxy (not a direct backend call) completed successfully with the
  correct `en-attente` status and zero stock effect. All test data
  (orders, stock adjustments) cleaned up afterward.
- Note for the user: the `admin@mzali.tn` password reset from Sprint 3
  (`Test1234!`) was reused for this sprint's HTTP walkthrough — no
  additional credentials were touched.
- Not done in this sprint (explicitly out of scope per the sprint file):
  a stock-policy admin UI (API-only for now, see above), demand
  forecasting, multi-warehouse routing beyond DEPOT/BOUTIQUE.

## SPRINT-05 — stock transfers, stocktakes, low-stock alerts (2026-07-20)

- **Stock transfers** (`backend/src/inventory/transfers/`): `StockTransfer`
  schema with the full 9-status enum (`DRAFT, REQUESTED, APPROVED,
  PREPARING, SHIPPED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED, REJECTED`)
  and per-line requested/approved/shipped/received/damaged/missing
  quantities, denormalized with `productId`/`productName` at creation
  time (same snapshot pattern as POS sale lines) so the admin UI never
  needs a join. Workflow: `create` (REQUESTED, resolves `productId` →
  variant server-side — admin picks products, not raw variant ids) →
  `approve` (sets per-line `approvedQuantity`, no stock effect) → `ship`
  (writes `transfer_out` at the source, respects `location.
  allowNegativeStock`) → `receive` (incremental/partial-safe — call it
  more than once; writes `transfer_in` only for the actually-received
  portion; damaged/missing quantities are tracked as line-level counters,
  not separate movements, since they never entered sellable destination
  stock) → auto-transitions to `RECEIVED` once every line is fully
  accounted for, `PARTIALLY_RECEIVED` otherwise. `cancel` before shipping
  is a pure status change (`REJECTED` if never approved, `CANCELLED`
  otherwise) — never touches stock, since nothing was shipped yet.
- **Stocktakes** (`backend/src/inventory/stocktakes/`): `Stocktake`
  schema with the 7-status enum (`DRAFT, IN_PROGRESS, COUNTED,
  REVIEW_REQUIRED, APPROVED, POSTED, CANCELLED`). `create` freezes an
  `expectedQuantity` snapshot per line from live `stock_items.
  quantityOnHand` at that instant (scope: whole catalog or selected
  categories) and jumps straight to `IN_PROGRESS` — no separate "start"
  step. `count` is incremental (call repeatedly as a counter works
  through the shelf); once every line has a count, status becomes
  `COUNTED`, or `REVIEW_REQUIRED` if any line's `|counted - expected|`
  exceeds the new `settings.inventory.stocktakeVarianceThreshold`
  (default 3) without a `reasonIfLarge` — `approve` re-checks this and
  rejects if a required reason is still missing. `post` is the one place
  in the codebase a movement's delta is computed from a *target*
  (`countedQuantity`) rather than a signed input: it re-reads live
  `onHand` inside the transaction (not the frozen snapshot) and applies
  `stocktake_correction` for exactly `countedQuantity - currentOnHand`,
  so the result always lands exactly on the counted value even if
  something else moved stock between counting and posting. Lines with
  zero difference get no movement at all.
- **Blind-count mode**: `GET .../stocktakes/:id/count-sheet` (what the
  counting screen actually loads) omits `expectedQuantity` and
  `difference` entirely from the response when `blindCount: true` —
  not masked or zeroed, just absent from the JSON — while the regular
  `GET .../stocktakes/:id` (used by the approve/review screens) always
  shows the full picture. Same mapper, a `revealExpected` flag.
- **Low-stock alerts**: extended the existing (DEPOT-only,
  `lowStockThreshold`-only) dashboard aggregation to also honor
  `reorderPoint` and to group **per location** — a variant can now show
  low at BOUTIQUE while fine at DEPOT, and the dashboard's `LowStock`
  widget got a location badge per row (also fixed a latent duplicate-
  React-key bug this surfaced: the same product can now legitimately
  appear twice, once per location). Separately, a new `alerts`
  collection + `LowStockCheckService`, run hourly as a `check-low-stock`
  job **on the existing `cleanup` queue** (deliberately not a 5th queue —
  D6 said 4 queues only, and this is the same kind of periodic
  maintenance work as the nightly draft purge) — upserts one active
  alert per (variant, location), resolves it when stock recovers, and is
  exposed via `GET /admin/inventory/alerts` for future use (email/
  notification piping) independent of the dashboard's own live query.
- **`components/admin/StockView.tsx`** finally shows the side-by-side
  depot/boutique columns the sprint doc said Sprint 1 had already built
  — it hadn't; the admin stock list was DEPOT-only until now.
  `InventoryService.list()` now fetches both locations' `stock_items`
  and merges them into one row per product (`onHand`/`reserved`/
  `available` for DEPOT, `boutiqueOnHand`/`boutiqueReserved`/
  `boutiqueAvailable` alongside), matching the master-prompt's own
  described admin row layout exactly. The "Ajuster" button is now
  labeled "Ajuster (Dépôt)" since `InventoryService.adjust()` only ever
  targets DEPOT — BOUTIQUE stock is now correctly reachable only through
  transfers or a stocktake, never a direct admin edit.
- New frontend: `app/mzali/transfers` (`TransfersView.tsx` — list, a
  create drawer with an inline product search/picker, and a detail
  drawer whose action buttons and inline inputs change based on the
  transfer's current status) and `app/mzali/stocktakes`
  (`StocktakesView.tsx` — list, create drawer with an all/categories
  scope picker and a blind-count toggle, and a detail drawer that is the
  actual counting screen, showing/hiding the system quantity based on
  `blindCount`). Both linked from a new "Transferts"/"Inventaires"
  sidebar entries under Catalogue.
- No new DI bugs this sprint — the `*CoreModule` / explicit-import
  pattern from Sprint 4's two boot failures was applied correctly from
  the start (`TransfersModule`/`StocktakesModule` explicitly import
  `LocationsCoreModule`/`InventoryCoreModule`/`DatabaseModule` rather
  than assuming global registration), and both containers booted clean
  on the first rebuild.
- Verification (live): full backend typecheck/lint/test (19 suites, 133
  tests, no regressions — two lint errors from unused params/imports
  fixed along the way), contract-drift check green, frontend typecheck
  green including the two new admin routes compiling successfully.
  Rebuilt and redeployed api/worker/storefront; confirmed clean boot logs
  and every new route registered. Full HTTP walkthrough: requested a
  DEPOT→BOUTIQUE transfer for a variant with 50 DEPOT/0 BOUTIQUE stock →
  approved (zero stock effect) → shipped and confirmed DEPOT dropped to
  45 while BOUTIQUE still had no stock item at all (proving the "never
  increase destination before receipt" rule) → partially received (4
  good + 1 damaged out of 5 shipped) and confirmed BOUTIQUE gained
  exactly 4 (not 5 — damaged units never enter sellable stock) while the
  transfer auto-completed to `RECEIVED` (fully accounted) → confirmed
  `/mzali/stock` reflects both sides (45 depot / 4 boutique) through the
  real BFF, not a direct backend call. Separately: started a
  whole-catalog stocktake at BOUTIQUE (21 lines, snapshotted from live
  stock) → counted every line, with a deliberate -2 difference on the
  test variant (within the default variance threshold, so no reason
  required) → status correctly went straight to `COUNTED` → approved →
  posted, and confirmed exactly one `stocktake_correction` movement was
  written (only for the one line with a non-zero difference; the other
  20 untouched lines produced none) with `onHandAfter` landing exactly
  on the counted value, and a human-readable `reason` field documenting
  "comptage 2 (système 4)". Manually fired the low-stock check job (its
  real hourly schedule was confirmed present in Redis as two separate
  repeatable-job hashes) after setting a `reorderPoint` above the
  BOUTIQUE count, and confirmed the resulting alert showed up correctly
  and independently in both `GET /admin/inventory/alerts` and the
  dashboard's live `lowStock` array, with the location badge rendering
  on the actual `/mzali` page. Test-only `reorderPoint` scaffold reverted
  afterward; the transfer/stocktake records themselves were left in
  place as legitimate historical data (unlike Sprint 3/4's throwaway
  test orders, there's no delete endpoint for either — matching real
  business reality that these are permanent audit records).
- Not done in this sprint (explicitly out of scope per the sprint file):
  printable transfer note (deferred to whenever Sprint 7's PDF
  infrastructure lands, or a simple HTML print view later — not blocking
  this sprint per its own instruction), purchase-order-suggested
  transfers (Sprint 6 concept), barcode-scan count entry (the sprint doc
  allowed a lightweight duplicate of the POS scan hook but the count
  screen didn't need it for this pass — manual quantity entry only).

## SPRINT-06 — suppliers, purchase orders, goods receipts, cost tracking (2026-07-20)

- **Two defaults taken from the sprint doc's own stated fallbacks**,
  since neither was a genuine business-structure ambiguity worth
  interrupting for: (1) cost is **variant-level, not location-level**
  (`Variant.lastPurchaseCostMinor`/`averageCostMinor` — these fields
  already existed on the schema since Sprint 1, just never populated
  until now) — same physical goods, one blended cost regardless of which
  location received them. (2) `purchasing.manage` and
  `inventory.view_cost` stayed two separate permissions per the literal
  endpoint spec, but are always **granted together** in this codebase's
  role table (`store_manager`; super_admin/admin get everything
  automatically) — the doc's own "default to requiring both together if
  unclear" instruction.
- **New top-level modules** (`backend/src/suppliers/`,
  `.../purchase-orders/`, `.../goods-receipts/` — schemas exactly per
  `docs/pos-platform/supplier-management.md`): `Supplier` +
  `SupplierVariantOffer` (one row per supplier×variant, `preferred`
  flag drives suggestion generation), `PurchaseOrder` (7-status enum;
  numbered `PO-2026-000001` — year taken from the document's own
  `createdAt` at format time, not a separate resetting counter, so the
  underlying atomic sequence never resets and never collides), `GoodsReceipt`
  (numbered `GR-2026-000001` the same way).
- **The one rule that matters most, enforced structurally**:
  `PurchaseOrdersService` has no dependency on `StockLedgerService` at
  all — it physically cannot move stock. Only
  `GoodsReceiptsService.post()` calls the ledger, inside one transaction
  that also rolls up the PO line's `receivedQuantity` (total physically
  received, including damaged/rejected — distinct from
  `acceptedQuantity`, which is the only number that ever reaches
  `stock_items`), flips the PO to `PARTIALLY_RECEIVED`/`RECEIVED`,
  updates the supplier offer's `lastPurchaseDate`, and recomputes the
  weighted-average cost using the **destination location's onHand
  immediately before this receipt** as the blending base (re-read live
  inside the transaction, not cached) — chosen because that's the stock
  this new cost is actually blending into, even though the resulting
  average is then stored variant-wide per decision (1) above.
- **Cost visibility**: every new/extended contract field that carries
  money (offer price, PO/GR line and header totals) is `optional`, not
  nullable — the mapper omits the key entirely for callers without
  `inventory.view_cost` rather than sending `null`/`0`, so there's no
  way to infer "the cost is zero" from a stripped response. In practice
  a `cashier` account can't reach any of this anyway: none of the new
  endpoints exist without `purchasing.manage` first, which cashiers
  don't have — cost-field stripping is a second, defense-in-depth layer
  behind a permission wall that already blocks the whole surface.
  Deliberately did **not** touch the pre-existing, always-public
  `Product.cost` field (part of the enforced-mirrored `product` contract
  since before this sprint) — retrofitting that is a materially
  different, wider-blast-radius change than what this sprint asked for.
- **Low-stock-driven suggestions** (`GET /admin/purchase-orders/
  suggestions`): joins Sprint 5's `alerts` collection against each
  alerted variant's `preferred: true` supplier offer, groups by
  supplier, and proposes `max(minimumOrderQuantity, threshold -
  available)` per line — deliberately not the master-prompt's full
  `targetStockLevel - available - pending + forecast` formula (no
  pending-PO or demand-forecast tracking exists yet); "keep forecasting
  simple initially" per §19. Never creates a PO itself, only proposes.
- **`StockView.tsx` "Achat en cours" column**: `InventoryService.list()`
  now also aggregates every open (`SUBMITTED`/`CONFIRMED_BY_SUPPLIER`/
  `PARTIALLY_RECEIVED`) PO's remaining `orderedQuantity -
  receivedQuantity` per variant — required adding a raw `PurchaseOrder`
  schema registration to `InventoryModule` (same "register the schema
  directly, not the whole feature module" pattern used everywhere else
  in this codebase; no circular dependency since `PurchaseOrdersModule`
  itself never imports anything inventory-related).
- New frontend: `app/mzali/suppliers` (list + detail drawer with an
  inline offers sub-section — product picker, price, MOQ, preferred
  toggle), `app/mzali/purchase-orders` (list + create drawer + detail
  drawer whose action buttons track status: Soumettre → Confirmer →
  link out to receiving), `app/mzali/goods-receipts` (picks up
  `?purchaseOrderId=` from the PO detail drawer's "Réceptionner" link,
  or lists every currently-receivable PO if opened bare; per-line
  received/damaged/rejected inputs, remaining-quantity-aware). New
  "Achats" sidebar section. `GoodsReceiptsView` uses `useSearchParams()`
  so its page wraps it in `<Suspense>`, per Next.js App Router's build-
  time requirement for that hook.
- No new DI or boot bugs this sprint — all three new modules followed
  the established explicit-import pattern from the start and booted
  clean on the first rebuild.
- Verification (live): full backend typecheck/lint/test (19 suites, 133
  tests, one lint fix along the way — an unused import), contract-drift
  check green, frontend typecheck green including all four new/changed
  admin routes compiling. Rebuilt and redeployed api + storefront;
  confirmed clean boot logs and every new route registered. Full HTTP
  walkthrough: created a supplier and a preferred offer (15.500 DT) →
  created a 20-unit PO that correctly defaulted its line cost from the
  offer → submitted → approved (confirmed-by-supplier) → confirmed
  **zero** stock movement across both transitions → posted a partial
  receipt (12 received, 1 damaged) and confirmed DEPOT increased by
  exactly 11 (the accepted quantity, not 12) with the PO correctly
  showing `PARTIALLY_RECEIVED` and `receivedQuantity: 12` → created a
  **second** PO for the same variant at a different unit cost (20.000
  DT), received it, and hand-verified the resulting
  `averageCostMinor` (16182) against the weighted-average formula
  applied to the real onHand at that moment — exact match → posted the
  first PO's remaining 8 units and confirmed it flipped to `RECEIVED`
  with `receivedQuantity` exactly equal to `orderedQuantity` → confirmed
  `/mzali/stock`'s new "Achat en cours" column correctly showed a live
  open PO's remaining quantity and correctly returned to 0 once nothing
  was outstanding → confirmed a `cashier`-role account gets a flat 403
  from every single new endpoint (suppliers, POs) before cost-field
  stripping is even relevant → confirmed all four new/changed admin
  pages render without server errors. Leftover open test PO cancelled
  and DEPOT stock adjusted back to its pre-sprint baseline afterward.
- Not done in this sprint (explicitly out of scope per the sprint file
  and its own "Do NOT" section): supplier balance/accounts-payable
  tracking (flagged as meaningfully bigger scope, not silently
  expanded), a receipt-time unit-cost override distinct from the PO's
  committed line cost (receipts always use the PO line's own cost —
  reasonable v1, worth flagging if the business needs supplier-invoice
  price reconciliation later), goods-receipt document attachments UI
  (the `attachments`/MinIO field exists on the schema and contract, no
  upload control wired into the receiving screen yet).

## SPRINT-07 — quotes, invoices, credit notes, PDF generation (2026-07-21)

- Fiscal fields confirmed with the user before writing any tax/numbering
  logic (per the sprint file's mandatory stop-and-confirm gate): 19%
  standard TVA as the configurable default, a flat ~1.000 TND timbre
  fiscal as the configurable default, and legal mentions (matricule
  fiscal, RC, etc.) as configurable `settings.company` fields to be
  filled in later before going live — none hardcoded.
- New `settings.invoicing` (enabled/tvaRatePercent/timbreFiscalMinor/
  numberFormats) and `settings.company` sections, admin endpoints, and
  an `InvoicingSettingsView` admin page with a color-coded banner
  explaining the fiscal gate.
- Quotes module: DRAFT→SENT→VIEWED/ACCEPTED/REJECTED/EXPIRED/CONVERTED/
  CANCELLED status machine, atomic `DEV-{year}-{seq:6}` numbering,
  per-line free-text or catalog-product lines, `revise()` that always
  creates a brand-new document (never mutates) with `version+1` and
  `previousVersionId`, `convertToOrder()` (requires every line to
  reference a real product — rejects free-text-only quotes) and
  `convertToInvoice()` (works with free-text lines too).
- Invoices module: 5 types (sales/POS/online/proforma/credit-note), 8
  statuses, atomic per-type numbering (`FAC-`/`FACB-`/`FACW-`/`PRO-`/
  `AV-`), immutability enforcement once non-DRAFT (lines/shipping can
  only change while DRAFT — a generic PATCH is rejected otherwise,
  payments and credit notes go through dedicated methods), a fiscal
  gate on `finalize()` (`settings.invoicing.enabled` must be true or it
  throws `ForbiddenException`), partial-payment tracking
  (`paidMinor`/`balanceMinor`/`paymentStatus`), and `issueCreditNote()`
  which models crediting as a payment-like reduction of the original's
  balance and flips it to `CREDITED` once fully offset. Timbre fiscal
  is charged on sales/POS/online invoices only — excluded from
  proforma and credit notes.
- PDF generation: one shared `pdfkit`-based template renders both
  quotes and invoices/credit notes, generated asynchronously via a
  `DocumentsPdfProcessor` on the previously-unused `media-processing`
  BullMQ queue (never inline in a request handler). `MediaService`
  extended with `uploadDocument()`/`getDownloadStream()` for non-image
  files in the (non-public) `documents` MinIO bucket, served through a
  new authenticated `GET /admin/media/:id/download` streaming endpoint
  (mirrored by a Next.js BFF proxy) since that bucket isn't
  public-read like the image buckets.
- Two real bugs found and fixed during live verification (not caught by
  typecheck/lint/unit tests, since neither is a type error):
  1. `InvoiceCompanySnapshot`'s Mongoose schema had `required: true` on
     every field, but `settings.company` is legitimately all-empty by
     the design decision above — this made `convertToInvoice()` throw
     a `ValidationError` 500 on any store that hasn't filled in its
     legal info yet. Fixed by defaulting each field to `''` instead of
     requiring it.
  2. A systemic bug in `SettingsService`: every `set*` method merges via
     `{...current, ...patch}`, but because the backend's `tsconfig.json`
     targets ES2022 (which gives class fields "define" semantics),
     unset optional properties on a class-validator DTO instance are
     real own keys holding `undefined` rather than being absent — so a
     genuinely partial PATCH like `{"enabled":true}` was spreading an
     explicit `tvaRatePercent: undefined` over the current value,
     silently nulling it in Mongo. Reproduced live: `PUT
     /admin/settings/invoicing {"enabled":true}` came back with
     `tvaRatePercent: null`. Fixed with a shared `omitUndefined()`
     helper applied to every patch spread in `settings.service.ts`
     (`setSite`/`setCommerce`/`setInventorySettings`/
     `setInvoicingSettings`/`setCompany`) — worth keeping in mind for
     any future partial-patch service method in this codebase.
- Verification (live): full backend typecheck/lint/test (19 suites, 133
  tests) and contract-drift check green both before and after the two
  fixes above. Rebuilt and redeployed api/worker/storefront (recovered
  the Docker Compose stack first — `deploy-mongo-1` and
  `deploy-minio-1` had both lost their network attachment entirely
  after an earlier restart sequence, `{}`  for
  `NetworkSettings.Networks`, requiring `docker network connect` +
  `docker restart` for each, plus stopping unrelated same-host
  containers — `usm-minio`, `usm-mongo`, `usm-web` — that were
  squatting on ports 9000, 27017, and 3000 respectively; the
  storefront container also needed one `--force-recreate` because its
  first `docker compose up` came up without its host port actually
  bound). Full HTTP walkthrough: created a quote with two free-text
  lines → confirmed 19% TVA computed correctly per line and summed →
  sent it (PDF enqueued and generated, confirmed via worker log and a
  real downloaded PDF: valid `PDF document, version 1.3, 1 page`) →
  accepted it → confirmed `convertToOrder()` correctly rejects a
  free-text-only quote (400, explicit French error) → converted to
  invoice instead (hit bug #1 above, fixed, retried, succeeded) →
  confirmed `finalize()` is rejected with the fiscal-gate message while
  `settings.invoicing.enabled=false` (hit bug #2 above while flipping
  the setting, fixed, retried) → enabled invoicing, finalized
  successfully (`status: FINALIZED`, `finalizedAt` set, PDF generated)
  → recorded a 500 DT partial payment and confirmed
  `balanceMinor`/`paymentStatus` updated correctly → issued a full
  credit note and confirmed the original flipped to `CREDITED`/`PAID`
  (`balanceMinor: 0`) while the credit note itself correctly excluded
  the timbre fiscal and auto-finalized under the active fiscal gate →
  separately created and revised a second quote, confirming
  `version: 2`, `previousVersionId` set, and both versions present in
  `/history`. All test quotes/invoices/credit-notes/PDF-media documents
  deleted afterward; `settings.invoicing.enabled` and `settings.company`
  reset back to their pre-verification values (`false`/all-empty) since
  they were only set for this walkthrough, not real production data.
- Not done in this sprint (explicitly out of scope per the sprint file):
  proforma-to-sales-invoice conversion UI flow (the invoice type exists
  and can be created directly, no dedicated "convert proforma" action
  wired up), email delivery of quotes/invoices (no email module exists
  anywhere in this project per an earlier deliberate scope trim — PDFs
  are downloaded manually by staff), a free-form DRAFT-only PATCH for
  quotes (the only edit path is `revise()`, which works from any status
  including DRAFT — a deliberate v1 simplification).

## SPRINT-08 — loyalty accounts, ledger, earning/redemption, tiers (2026-07-21)

- Three mandatory kickoff questions from the sprint file, all resolved
  with the user before writing code (same discipline as Sprint 7's
  fiscal-fields confirmation): (1) storefront scope — phone/card lookup
  page only, no full customer-account/login system; (2) loyalty accounts
  are opt-in only, never auto-created on a customer's first purchase;
  (3) tier evaluation uses all-time `customers.totalSpentMinor`, not a
  trailing-12-month aggregation, for v1.
- Two assumptions in the sprint file turned out not to match the actual
  codebase state, discovered during implementation and handled the same
  way the codebase already handles this class of gap (build a minimal
  version, document it, don't silently skip): (1) no manager-PIN/approval
  pattern existed anywhere despite the sprint file's "reuses the existing
  manager-approval pattern from Sprint 3" — built one from scratch using
  employee password verification (a second employee's id+password,
  checked against `pos.apply_advanced_discount`) rather than inventing
  new infrastructure; (2) no POS customer panel/phone-lookup UI existed
  at all despite being described as "already scaffolded" — the POS
  `Cart.tsx` had a passive, never-wired `customerPhone` text field; built
  the actual lookup/create/redeem UI (`CustomerPanel.tsx`) and the
  backend plumbing to resolve a phone number to a `customerId`
  (`CustomersService.findOrCreateByPhone()`) from scratch, since without
  it a POS sale could never be linked to a loyalty account in the first
  place.
- New `loyalty_accounts`/`loyalty_transactions`/`loyalty_tiers`
  collections exactly per `docs/pos-platform/loyalty-system.md`, plus one
  additive field not in the original doc schema: `loyalty_tiers
  .tierUpBonusPoints` — needed because the doc says tier promotion
  "writes a BONUS transaction if the new tier grants an immediate point
  bonus" but the documented schema had no field carrying that value.
- `LoyaltyLedgerService.apply()` — single write path for
  `pointsBalance`, mirroring `StockLedgerService` exactly: every balance
  change is one call, writing the `loyalty_transactions` row and the
  account update in the same Mongo transaction. `reverseEarnedPoints()`
  built as a standalone, ready-to-call method — no POS refund flow exists
  yet (Sprint 3 flagged refunds as a possible later addition, still not
  built), so nothing currently calls it; explicitly not wired to
  anything rather than silently skipped.
- `LoyaltyRulesService.calculateEarnedPoints()` — one shared calculation
  used by both the POS and online-order earning hooks (never duplicated):
  per-line category/product bonus multipliers, `excludedProductIds`,
  `minimumPurchaseMinor` gate, optional shipping exclusion, floor-rounded
  points. Also owns `pointsToDiscountMinor()` for the redemption side.
  `settings.loyalty` extended with three fields not in the original doc
  (`pointValueMinor`, `maxRedemptionPercentOfSale`/`minimumPointsToRedeem`/
  `managerApprovalAboveMinor` were named in the doc's prose but never
  given a settings shape) — all configurable, none hardcoded, same
  approach as Sprint 7's fiscal defaults.
- Earning hooks: POS — inside `PosSalesService.create()`'s existing
  transaction, after the stock movement, only for customers with an
  existing ACTIVE loyalty account (opt-in). Online — inside
  `OrdersService.applyStatusTransition()`, the exact same transition
  point `stockEffectForStatus` runs at, gated by
  `settings.loyalty.earnOnOrderStatus` (default `confirme`).
- Redemption — architecturally split across two HTTP calls to make "same
  transaction as the POS sale" actually achievable: `POST
  /pos/loyalty/redeem` is a **preview-only** guard check (no database
  write) so the till can show the resulting discount before the cashier
  finalizes; the real atomic commit happens inside
  `PosSalesService.create()` via a new `redeemPoints`/`managerApproval`
  field on `CreateSaleDto` — points deduction and the discount folded
  into `discountMinor` happen in the exact same Mongo transaction as the
  stock movements and sale document, verified live by forcing a guard
  failure mid-sale (missing customerId) and confirming the stock ledger
  fully rolled back (see verification below). All five guards
  (`minimumPointsToRedeem`, `maxRedemptionPercentOfSale`, insufficient
  balance, suspended account, no-anonymous-customer) plus the
  manager-approval step-up enforced server-side in
  `LoyaltyService.validateRedemption()`, shared by the preview endpoint
  and the real commit path so they can never drift.
- Tier evaluation: nightly BullMQ job (`loyalty.evaluate-tiers`) sharing
  the `cleanup` queue (D6: 4 queues only), same
  register-in-`onModuleInit`-with-a-`jobId` pattern as the existing
  draft-purge/low-stock jobs. Reads each ACTIVE account's
  `customers.totalSpentMinor` + `lifetimePointsEarned`, finds the
  highest-ranked qualifying tier (VIP > GOLD > SILVER > STANDARD, all
  configured thresholds on a tier must be met), and posts a `BONUS`
  transaction only on an actual promotion (never on a demotion or
  lateral no-op).
- POS: `CustomerPanel.tsx` (new) — phone lookup/quick-create, balance/
  tier display, points-to-redeem input with a live discount preview,
  manager-approval employee-id/password fields shown only when required.
  Wired into `Cart.tsx`/`Till.tsx` (which previously captured a phone
  number and did nothing with it) and the receipt (`TicketPreview.tsx`
  now shows points earned/redeemed). Admin: `app/mzali/loyalty` — account
  search/ledger/suspend/manual-adjustment (mandatory reason, matches the
  existing stock-adjustment drawer's UX), tier configuration, earning/
  redemption rules settings. Storefront: `/fidelite` — the agreed
  minimum-viable phone-or-card lookup page (no login), backed by a new
  public `GET /loyalty/public/lookup` endpoint (service-token gated,
  returns only balance/tier/status — nothing else).
- Infrastructure: the POS Next.js app (`pos/`) turned out to have a
  `Dockerfile` but **no service entry in `docker-compose.yml` at all** —
  a leftover exited `deploy-pos-1` container existed from some earlier,
  now-lost point in this project's history, but the compose file itself
  had no `pos:` block. Added one (mirroring the `storefront` service,
  port 3001, `MZALI_API_URL: http://api:4000`) so the POS app is part of
  the managed stack again; the stale orphaned container had to be
  `docker rm`'d before compose would recreate it under the same name.
  Also, yet again, a same-host unrelated project (`usm-api`) was
  squatting on port 3001 and had to be stopped — third occurrence of this
  exact class of conflict in this session (following `usm-minio`/
  `usm-mongo`/`usm-web` earlier), all resolved the same way.
- Verification (live): full backend typecheck/lint/test (20 suites, 141
  tests — 8 new for `LoyaltyRulesService.calculateEarnedPointsWithRules`,
  the only pure-function unit in this sprint, matching this codebase's
  existing test-strategy convention of pure-calc unit tests plus live
  Docker walkthroughs rather than DB-backed Jest integration tests) and
  contract-drift check green. Rebuilt and redeployed all four app images
  (api/worker/storefront/pos). Full walkthrough against the real API
  (cashier + admin JWTs, an approved test POS terminal, a real cash
  session): created a loyalty account via the POS quick-create endpoint
  for a fresh phone number → completed a POS sale of 20.000 DT and
  confirmed exactly 20 points earned (1 pt/DT) with a correctly-shaped
  `EARN` transaction → confirmed a redemption preview below
  `minimumPointsToRedeem` (100) is rejected → topped up points via a
  manual admin adjustment (confirmed it does **not** inflate
  `lifetimePointsEarned`, by design) → previewed and then committed a
  150-point redemption on a second sale, confirming `discountMinor:
  1500`, the payment sum matched the discounted total, and the ledger
  showed the exact expected chain (0→20→220→70→90 across
  EARN/MANUAL_ADJUSTMENT/REDEEM/EARN) → confirmed a redemption whose
  discount exceeds `managerApprovalAboveMinor` is rejected without
  approval, accepted with a correct manager password, and rejected again
  with a wrong one → confirmed the `maxRedemptionPercentOfSale` guard
  independently rejects an oversized redemption → confirmed
  `redeemPoints` on a sale with no `customerId` is rejected, and that the
  stock ledger for that failed sale's line fully rolled back (true
  transaction atomicity, not just an apparent one) → seeded the four
  tiers via the admin endpoint, set a test customer's `totalSpentMinor`
  to qualify for SILVER, manually enqueued the nightly evaluation job,
  and confirmed the account was promoted with a correctly-sized `BONUS`
  transaction → created and confirmed a real online order for the same
  customer and confirmed the online-earning hook posted a separate
  `ONLINE_ORDER` `EARN` transaction with shipping correctly excluded from
  the basis → confirmed suspending an account via the admin endpoint
  immediately blocks further redemption previews → confirmed the admin
  account-search endpoint returns fully enriched customer name/phone/tier
  data → confirmed both `/mzali/loyalty` and the storefront `/fidelite`
  page render and their lookup APIs return correct data by phone and by
  card number. All test accounts/transactions/tiers/orders/sales/
  customers deleted afterward and consumed boutique stock restored to
  its pre-test level; the POS test cash session was closed rather than
  left open.
- Not done in this sprint (explicitly out of scope per the sprint file
  and the kickoff decisions above): a full storefront customer-account/
  login system, refund-point-reversal wiring (no refund flow exists to
  wire it to — `reverseEarnedPoints()` sits ready), online redemption at
  checkout (the sprint file itself calls this "not required for Sprint
  8, the master prompt's redemption flow is POS-first"), a role-editor UI
  for the two new permissions (`loyalty.view`/`loyalty.manage`/
  `loyalty.adjust` are code-defined, matching every other permission in
  this project).

## SPRINT-09 — reports, printing bridge, security/operational hardening (2026-07-21)

- The sprint file itself flags this as "the most negotiable in scope" and
  requires confirming sub-parts before building; two questions asked and
  resolved with the user up front: (1) the ESC/POS printing bridge —
  skipped, the existing browser print-preview (`TicketPreview.tsx`'s
  "Imprimer" button) stays as the receipt-printing path; (2) the
  discount/refund/return-reason report — since no refund/return flow
  exists anywhere in the system (flagged back in Sprint 3, still true as
  of Sprint 8), only a real discount report was built (POS + online,
  using existing discount data) and the refund/return-reason portion was
  explicitly deferred rather than faked.
- **Reports** (extended the existing `StatsService`/`stats-admin.controller.ts`,
  no parallel system): margin per product (POS + online sales merged,
  cost basis `stock_items.averageCostMinor` from Sprint 6 — a product is
  `costUnknown` rather than shown with a fake 0 margin if it was never
  received via a goods receipt), below-cost sales (flags only, doesn't
  block — a manager may run a loss-leader), dead stock (no `pos_sale`/
  `order_commit` movement within a configurable window, or ever),
  supplier price evolution (merges `supplier_variant_offers` current
  quotes with `goods_receipts` line history), discount report. Cost-
  bearing reports (margin's cost/margin fields, below-cost, supplier
  prices) are stripped/hidden for callers without `inventory.view_cost`,
  matching the exact pattern Sprint 6/7 established for purchasing data —
  a real gap this sprint closed: `stats.read` alone (held by
  `order_manager`) would otherwise have leaked cost data that role isn't
  supposed to see. New `app/mzali/reports` admin page (tabs: Marge /
  Sous le coût / Stock dormant / Prix fournisseurs / Remises /
  Réapprovisionnement) — a dedicated page rather than cramming six more
  panels into the dashboard, per the sprint file's own "if the count of
  panels is getting too large" guidance.
- **Reorder-suggestion formula completed**: Sprint 6 had shipped a
  deliberately simplified heuristic (its own comment: "not the full
  master-prompt §19 formula — no pending-purchase/forecast tracking
  yet"). Implemented the real formula — `suggestedQuantity =
  targetStockLevel - currentAvailableStock - pendingPurchaseQuantity +
  forecastedDemand` — extracted as a pure, unit-tested function
  (`purchase-orders/reorder-formula.ts`, 5 tests) rather than left buried
  in the Mongo aggregation, matching this codebase's established
  pure-calc-function convention. `forecastedDemand` is a trailing-28-day
  sale-velocity average scaled to the supplier's lead time — deliberately
  not a forecasting model, per the master prompt's explicit "basic data
  quality is reliable" gate. Reused in the new Reports page's
  "Réapprovisionnement" tab, which had no UI consumer at all before this
  sprint despite the backend endpoint existing since Sprint 6.
- **Hardening — gaps found and closed**:
  1. **Negative-stock/low-stock alerts had no admin UI.** The alert
     system (Sprint 5) and its `GET /admin/inventory/alerts` endpoint
     existed but nothing in the admin console ever rendered it — exactly
     the "written to the ledger and forgotten" failure mode this pass
     was meant to catch. Built `app/mzali/stock-alerts` (negative stock /
     out-of-stock / low-stock sections).
  2. **No rate limiting anywhere in the backend** (checked: not even on
     login, though login already has a separate per-account
     failed-attempt lockout via `Employee.failedLoginAttempts`/
     `lockedUntil` — a real, adequate mitigation, left as-is). The POS
     terminal-pairing endpoints (`requestPairing`/`checkPairing`) had
     none at all despite being, per the sprint file, "the one genuinely
     public-ish endpoint in the whole POS surface" (guarded only by the
     shared service token, not per-caller). Built a small Redis-backed
     fixed-window `RateLimitGuard` (`common/rate-limit.guard.ts`,
     INCR+EXPIRE) and applied it: 10/min on `requestPairing`, 60/min on
     `checkPairing` (high enough not to break legitimate polling while
     the POS app waits for approval). Verified live: 11th
     `requestPairing` call in a minute returns 429, 15 rapid
     `checkPairing` polls all pass.
  3. **Idempotency-key coverage gap**: `grep` across
     `goods-receipts/invoices/quotes/purchase-orders` found zero hits for
     "idempotency" — sale creation (POS) and checkout already had it,
     nothing else did. Added `idempotencyKey` to `GoodsReceipt` (schema +
     service + `Idempotency-Key` header on the admin controller/BFF/
     frontend, same pattern as `PosSale`). Invoice `finalize()` already
     had a `status !== 'DRAFT'` guard that prevents duplicate side
     effects on retry (rejects with a clear error rather than
     double-finalizing) — judged adequate; a narrow concurrent-race
     window remains where two finalize calls could both pass the guard
     before either commits (would enqueue two PDF jobs, wasteful but not
     data-corrupting) — flagged here as a known, accepted minor gap
     rather than silently ignored. Loyalty redemption's actual commit is
     folded into POS sale creation, which was already idempotent — no
     separate action needed.
  4. **A real bug found via live testing while verifying the idempotency
     fix above**: `GoodsReceiptsService.post()`/`PosSalesService.create()`
     returned the existing document on an idempotent retry (correct —
     no duplicate business action), but their controllers unconditionally
     wrote an audit-log entry afterward regardless of whether a retry
     had occurred, silently duplicating audit history for what was
     actually one real action. Confirmed live: posting the same goods
     receipt twice with the same `Idempotency-Key` produced two
     `purchasing.receipt.post` audit rows for one receipt. Fixed by
     having both services return `{ doc, wasExisting }` and gating the
     audit-log call on `!wasExisting`; re-verified live afterward —
     exactly one audit row for two identical requests.
  5. **Audit-log coverage gap**: walked `security-model.md`'s "Audit log
     entries" list against the codebase — `inventory.*`, `employee.*`,
     `settings.change` were already covered; `pos.*`, `purchasing.po.approve`,
     `purchasing.receipt.post`, `invoicing.finalize`, `loyalty.adjustment`
     were not logged anywhere. Also found the doc's own promised
     `locationId`/`terminalCode` fields didn't exist on `AuditLog` at
     all — added them (nullable, POS-only). Added logging for
     `pos.session.open`/`pos.session.close`/`pos.cash_drawer.open`/
     `pos.sale.create`, `purchasing.po.approve`, `purchasing.receipt.post`,
     `invoicing.finalize`, `loyalty.adjustment`. Not added:
     `pos.sale.cancel`/`pos.sale.refund`/`pos.sale.exchange` (no such
     flows exist to log — same refund-flow gap noted above) and
     `pos.discount.override`/`pos.price.override` (no separate
     override-approval step exists as its own action in this codebase —
     a discount is just a field on the sale, already captured in
     `pos.sale.create`'s summary).
  6. **Concurrency — the two "cannot oversell" scenarios from
     master-prompt §50**: code-read confirmed `StockLedgerService
     .applyMovement()`'s `requireAvailableAtLeast` path is a single
     atomic Mongo `findOneAndUpdate` with a server-side `$expr` guard
     (correct lock-free concurrency control, not a racy read-then-write)
     — POS sales always pass this guard; online-order `commit()` only
     does in `STRICT_STOCK=true` mode (soft mode intentionally allows
     online oversell by design, per `stock-business-rules.md` — not a
     bug). Verified live with a real test, not just a read-through: set
     a variant's boutique stock to exactly 1, fired two genuinely
     parallel `POST /pos/sales` requests (bash background jobs) for that
     last unit — exactly one returned `200 COMPLETED`, the other `400
     Stock boutique insuffisant`, and the resulting `quantityOnHand` was
     confirmed at exactly 0 (not negative, not double-decremented).
  7. **MinIO-outage resilience**: already structurally correct by
     construction, not a new fix — POS sales never touch MinIO
     synchronously at all (no ticket PDF), and quote/invoice PDF
     generation has run async via BullMQ since Sprint 7, fully decoupled
     from the finalize()/create() transaction, so a MinIO failure there
     only fails the background job, never rolls back the document.
  8. **Redis-outage resilience**: verified live, not just read — stopped
     `deploy-redis-1` mid-test and completed a real POS sale against it.
     Sale succeeded normally (`200 COMPLETED`); the API log showed
     `StockLedgerService`'s existing try/catch around
     `redis.publish(inventory.updated)` correctly logged a warning
     ("Failed to publish inventory.updated...") and moved on — confirming
     the stock-mutation write path genuinely doesn't depend on Redis
     being up, only the live-notification layer degrades. Redis
     restarted afterward; api/worker reconnected automatically via
     ioredis, no restart needed.
- Verification (live): full backend typecheck/lint/test (21 suites, 146
  tests — 5 new for the reorder formula) and contract-drift check green;
  `npx tsc --noEmit` clean on both the main frontend and `pos/`.
  Discovered the POS Next.js app (`pos/`) had a working `Dockerfile` but
  had at some point been dropped entirely from `docker-compose.yml` (a
  leftover exited `deploy-pos-1` container existed with no matching
  service definition) — added a proper `pos:` service (port 3001,
  mirroring the `storefront` service's shape) so it's part of the
  managed stack again; had to `docker rm` the orphaned container and
  stop yet another same-host unrelated project (`usm-api`, squatting on
  port 3001) before it would start — the fourth occurrence of this exact
  conflict pattern in this session, all resolved identically. Rebuilt
  and redeployed all four app images across two passes (the second pass
  specifically for the idempotent-audit-log bug fix above). Full
  walkthrough beyond the specific hardening tests already described:
  confirmed all five new report endpoints return correct data against
  the real historical dataset (margin report correctly showed
  `costUnknown: true` for every product — this store's real catalog has
  never had a goods receipt posted against it outside test data;
  supplier-price-evolution correctly reproduced Sprint 6's own
  weighted-average-cost test history for "Textile Ben Ali" verbatim,
  confirming it reads real data, not a fixture); confirmed
  `/mzali/reports` and `/mzali/stock-alerts` render without server
  errors. All test purchase orders/goods receipts/sales/audit-log rows
  from this sprint's verification deleted afterward, boutique stock
  restored to its pre-test level, and the POS test cash session closed.
- Not done in this sprint (explicitly deferred, not silently skipped —
  see the kickoff decisions above): the ESC/POS printing bridge, the
  refund/return-reason report (and, by extension, no refund/returns flow
  was built as a prerequisite — the user chose to defer the report
  rather than expand scope into a new feature).

This closes the 9-sprint unified-commerce-platform epic. Every sprint
(01–09) is now implemented, live-verified via real Docker rebuilds and
HTTP/mongosh walkthroughs (not just typecheck), and documented above
with its own detailed entry, deferred items, and any bugs found and
fixed along the way.
