# TASK 05 — Seed the new database with the current live data

You are running the real data migration for the Mzali platform. Repo root:
`c:\Users\Ala\Desktop\mzali full`. TASK-04's tooling must be built and its
gate green. The live WooCommerce store stays UNTOUCHED (read-only API keys).

## Preconditions

1. Dev/staging infra up: `docker compose -f deploy/docker-compose.yml -f
   deploy/docker-compose.dev.yml up -d` (Mongo rs, Redis, MinIO healthy).
2. `backend/.env` filled: `WOO_API_URL=https://wp.ahmedmzaliboutique.com`,
   `WOO_CONSUMER_KEY/SECRET` (copy from the root `.env.local` — these are the
   live read keys), MinIO + Mongo settings.
3. Confirm reachability: `curl -u "$WOO_CONSUMER_KEY:$WOO_CONSUMER_SECRET"
   "$WOO_API_URL/wp-json/wc/v3/products?per_page=1"` returns 200.

## Run order (each step: dry-run first, review the report, then real run)

```bash
cd backend
node dist/cli.js migrate:all --dry-run          # full preview, review reports/
node dist/cli.js migrate:categories
node dist/cli.js migrate:media                  # long-running; resumable — rerun on interruption
node dist/cli.js migrate:products
node dist/cli.js migrate:employees              # from data/employees.json + admin
node dist/cli.js migrate:orders                 # full history
node dist/cli.js migrate:customers
node dist/cli.js migrate:settings
node dist/cli.js migrate:verify                 # MUST exit 0
```

Then prove idempotency: re-run `migrate:all` — every entity must report
0 created / 0 updated (unchanged checksums), and `migrate:verify` stays green.

## Review checklist (manual, against the live site)

- Product count on `/shop` (live site) == published products in Mongo.
- Open 5 random products on the live site; compare name/price/sale
  badge/bundle offers/images against the Mongo docs (use Swagger or mongosh).
- Category tree matches the live navigation; slugs identical.
- Order count + per-status totals in `migrate:verify` match; spot-check the
  3 most recent orders field-by-field (customer, items, totals, assigned
  employee, carrier tracking meta).
- Employees: both accounts from `data/employees.json` exist, `active` flags
  correct; login works with the OLD passwords (scrypt verify-then-rehash) —
  test via `POST /api/v1/auth/login`; after login the stored hash algo has
  become argon2id.
- Media: failed-image report reviewed; any 404s either fixed or accepted
  with the legacy-URL fallback flag.
- Counters: next order number > max Woo order number + 999.

## Deliverables

- `backend/reports/` populated (gitignored) + a short summary written to
  `docs/migration-report-<date>.md`: counts table (Woo vs Mongo per entity),
  financial reconciliation result, failed media count + disposition, any
  flagged records needing manual review. No PII, no secrets in this doc.

## Do NOT

- Run against the production Mongo (this seeds the dev/staging DB; the
  production seeding re-uses this same procedure during TASK-08 cutover).
- Fix data by hand in Mongo — fix the importer and re-run (idempotent).
- Commit reports containing customer data.
