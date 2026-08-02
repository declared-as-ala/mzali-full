# TASK 04 — WooCommerce migration tooling (importers, mappings, verify)

You are a senior NestJS engineer on the Mzali migration. Repo root:
`c:\Users\Ala\Desktop\mzali full`. TASK-01..03 gates must pass first.
This task builds the tooling ONLY — the real seeding run is TASK-05.
Do not modify the Next.js storefront.

## Read first

- `services/woo/woo-client.ts` — how to call the Woo REST API (Basic auth,
  `/wp-json/wc/v3`, pagination via `x-wp-total`/`x-wp-totalpages` headers)
- `services/woo/woo-types.ts` + `services/woo/woo-mappers.ts` — the raw Woo
  shapes and the exact field mapping (incl. `_mzem_bundles`, `_mzem_options`,
  `_mzem_cost`, `_mzem_delivery_price`, `_mzem_delivery_cost` product meta and
  every `_mzem_*` / `_navex_*` / `_fd_*` / `_axess_*` order meta key)
- `lib/employee-storage.ts` + `lib/admin-storage.ts` — legacy employee/admin
  JSON formats (scrypt hex hash + salt)
- `backend/src/contracts/*` and the schemas built in TASK-02/03

## Build (all in `backend/src/migration/`)

### 1. Read-only Woo client
`woo.client.ts` — fetch-based, Basic auth from `WOO_API_URL` /
`WOO_CONSUMER_KEY` / `WOO_CONSUMER_SECRET` env; GET only (never write to
Woo); paginated iterator (`per_page=100`, follows `x-wp-totalpages`); retry
with backoff on 429/5xx; supports `modified_after` for incremental sync.

### 2. `legacy_mappings` collection
{sourceSystem: 'woocommerce'|'file', entityType, legacyId, newId, checksum
(sha256 of the raw source JSON), status: pending|migrated|failed|skipped,
error, migratedAt}; unique {sourceSystem, entityType, legacyId}.
Idempotency rule: unchanged checksum ⇒ skip; changed ⇒ update the target doc.

### 3. CLI commands (nest-commander, registered in `src/cli/cli.module.ts`)
All support `--dry-run` (report only, zero writes), `--since <ISO>`
(incremental), `--limit <n>`; each prints a summary table and writes a JSON
report to `backend/reports/<command>-<timestamp>.json` (gitignored).

- `migrate:categories` — two passes (insert all, then resolve parentId via
  mappings). Slugs preserved exactly.
- `migrate:media` — collect distinct image URLs from Woo categories +
  products (and order line images); download, verify content-type + magic
  bytes, sha256 dedupe against `media.checksum`, upload original to MinIO
  (`catalog`/`categories` buckets), generate sharp variants, insert media doc
  with `originalUrl` = the wp-content URL. Resumable (mappings), failures
  recorded with reason; `--report` flag re-prints the failed list. Run via
  the `media-processing` queue when `--queue` is passed, inline otherwise.
- `migrate:products` — map per `woo-mappers.ts` semantics: prices →
  millimes (`parseToMinor`), `_mzem_bundles`/`_mzem_options` meta → embedded
  bundles/options, categories via mappings, images via media mappings
  (fallback: keep wp URL + flag `unresolvedMedia`), menu_order, featured,
  status, slug preserved. Init `inventory_items` (onHand = stock_quantity ??
  0) + `migration_init` ledger row (skip when item already exists).
- `migrate:orders` — FULL history, every status incl. custom slugs and
  `checkout-draft`. Map `_mzem_*` meta → assignment/phone2/privateNote/
  exchange/manualSubtotal/manualTotal/attempts/source; `_navex_*`/`_fd_*`/
  `_axess_*` → `carrier.*`; line items → snapshots with `legacyProductId` +
  resolved productId (missing ⇒ snapshot-only + flag); statusHistory seeded
  `{to: currentStatus, by: {type:'migration'}}`. NO stock effects. Employee
  ids in assignment meta are legacy UUIDs — resolve through the employee
  mappings (so run `migrate:employees` first, or resolve lazily by legacyId).
- `migrate:customers` — aggregate migrated orders by normalized phone
  (`common/phone.ts`) → customers docs (ordersCount, totalSpentMinor,
  first/lastOrderAt, lastAssignment from the newest order's assignment).
- `migrate:employees` — `data/employees.json` + `data/admin.json` →
  `employees` collection: passwordHash {algo:'scrypt-legacy', hash, salt}
  (verify-then-rehash happens automatically at first login — already built),
  legacyId = old UUID; admin.json (or env-only admin) → `admin@mzali.local`,
  role `super_admin`, legacyId 'admin'. If data/admin.json is absent, create
  the super_admin with `mustChangePassword: true` and a random password
  printed ONCE to the console (never logged to file). Never print or persist
  plaintext passwords or hashes in reports.
- `migrate:settings` — `data/site-settings.json` → settings `site` doc;
  seed `commerce` settings (shippingFlat 8, defaultOrderStatus 'en-attente',
  cities from `lib/site-config.ts` — copy the literal list); seed the
  `orderNumber` counter to `maxWooOrderNumber + 1000`
  (`CountersService.ensureAtLeast`).
- `migrate:all` — runs the above in order: categories → media → products →
  employees → orders → customers → settings.
- `migrate:verify` — compares and prints a reconciliation report:
  per-entity counts (Woo vs Mongo), per-status order counts, per-status sum
  of order totals (tolerance ±1 millime per order for float rounding),
  slug-set equality for products & categories, 20 random deep product
  compares (name/price/bundles/options/images count) + 20 random order
  compares (totals/items/status/assignment), unresolved media refs,
  unresolved product refs, duplicate SKU/slug detection. Exits non-zero on
  any mismatch beyond tolerance. `--json` writes the full report.

### 4. npm scripts (backend/package.json)
`migration:dry-run` (= migrate:all --dry-run), `migration:run`
(= migrate:all), `migration:verify`, plus per-entity variants.

## Tests

- Unit: checksum idempotency (same payload ⇒ skip), meta mapping (a fixture
  Woo product with bundles/options → expected doc; a fixture order with all
  `_mzem_*` keys → expected doc), employee JSON parsing (valid, duplicate
  email, invalid email row → reported not imported).
- Integration: run `migrate:products --dry-run` against a MOCKED Woo server
  (nock/undici fixtures) ⇒ zero writes; run real import twice against the
  mock ⇒ second run reports 0 changes (idempotency).

## Verification gate

```bash
cd backend
npm run check:contracts && npm run typecheck && npm run lint && npm test
npm run build && npm run test:integration
node dist/cli.js migrate:all --dry-run --limit 5   # against mock or real Woo (read-only) — no writes, sane report
```

## Do NOT

- Ever write to the WooCommerce API (GET only).
- Print passwords, hashes, tokens, or full customer PII in logs/reports.
- Hard-code the Woo URL/keys — env only.
