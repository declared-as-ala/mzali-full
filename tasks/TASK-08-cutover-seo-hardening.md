# TASK 08 — Staging run, production cutover, SEO, docs & hardening

You are the release engineer for the Mzali migration. Repo root:
`c:\Users\Ala\Desktop\mzali full`. TASK-01..07 green. This task takes the
platform live and closes out the project. Proceed phase by phase; get
explicit human approval before the production cutover step.

## Phase A — Staging parallel run

1. Provision the VPS (or a staging host), DNS for staging subdomains, lower
   production DNS TTL now (for the later cutover).
2. Deploy the full prod compose (TASK-07) with `COMMERCE_PROVIDER=mzali-api`
   and a fresh seed: run the TASK-05 procedure against the staging Mongo
   (full `migrate:all` + `migrate:verify` green).
3. Side-by-side comparison, live prod (Woo) vs staging (mzali-api):
   home, /shop page 1+2, 5 product pages (same slugs!), category pages,
   full checkout with a test order, admin + employee consoles, carrier push
   on a test order (then cancel it with the carrier).
4. Operator walkthrough: the real admin does a normal day's workflow on
   staging and signs off.
5. Rehearse: backup → restore (verify-backup.sh), CD deploy, rollback to the
   previous image tag, provider-flag rollback.

## Phase B — SEO (net-new, ship before or right after cutover)

- `generateMetadata` on `/produit/[slug]` (title, description from
  shortDescription, openGraph incl. image), `/categorie/[slug]`, `/shop`.
- JSON-LD: Product (+offer with price/availability in TND) on product pages,
  BreadcrumbList on product+category pages.
- `app/sitemap.ts` — products + categories + static routes from the API.
- Canonical URLs via metadata `alternates.canonical`; ensure
  `NEXT_PUBLIC_SITE_URL` points at the real storefront domain (NOT the wp.
  host — fix the env value).
- Keep `public/robots.txt` but update the stale `/admin` entry to `/mzali`.
- Gate: Google Rich Results test passes on a product page; sitemap fetches;
  zero slug/URL changes vs the live site.

## Phase C — Production cutover (requires explicit approval)

1. T-1 day: full `migrate:all` + `migrate:verify` against the production
   Mongo on the VPS.
2. Freeze window (low-traffic hours): stop admin edits (announce to staff);
   note the timestamp.
3. `migrate:all --since <freeze-timestamp>` + `migrate:verify`.
4. Point production DNS at the VPS (storefront + media domains). Flip
   `COMMERCE_PROVIDER=mzali-api`. Deploy.
5. Smoke: browse, place a real test COD order (then cancel it), admin login,
   employee login, order assignment fired, carrier push on a test order.
6. Monitor 48h: order rate vs baseline, API error logs, checkout drafts.
7. **Rollback at any point**: flip provider to `woocommerce` + DNS back if
   needed. Woo was never written to. Export any orders created on the new
   backend during the window (`node dist/cli.js export:orders --since <cutover>`
   — build this small command if not present) for manual re-entry.

## Phase D — Stabilization & cleanup (1–2 weeks after cutover)

- Rotate ALL legacy secrets: WC consumer keys, WP app password,
  ADMIN_PASSWORD (retire), SESSION_SECRET (retire after legacy cookie
  fallback removal), carrier tokens (re-issue into backend env only).
- Set WordPress/WooCommerce to maintenance/read-only; schedule decommission.
- Remove the legacy cookie fallback from `lib/auth.ts`; remove
  `services/woo/*`, `lib/woo.ts`, `lib/employee-storage.ts`,
  `lib/admin-storage.ts`, `lib/round-robin.ts` usage behind the provider
  flag ONLY after the rollback window closes (keep one tagged release that
  still contains them). Archive `data/` (encrypted) then delete locally.
- Harden: tighten `next.config.mjs` images.remotePatterns to the media
  domain only; `serverActions.allowedOrigins` to the real domain; upgrade
  Next 14.2.34 to the patched 14.2.x (security advisory); enable login
  rate-limit via Redis on the backend (if not already); set
  `SWAGGER_ENABLED=false` in prod.

## Phase E — Documentation deliverables (complete `docs/`)

`target-architecture.md`, `data-model.md`, `api-contract.md` (or link
Swagger export), `security-model.md`, `employee-migration.md`,
`woocommerce-migration.md` (runbook + final report), `media-storage.md`,
`local-development.md`, `staging-deployment.md`, `production-deployment.md`,
`backup-and-restore.md`, `rollback-plan.md`, `admin-user-guide.md` (FR,
screenshots optional), `troubleshooting.md`. Update `README.md` with the
real commands (only ones that exist).

## Final acceptance checklist

- Storefront serves from NestJS/Mongo; URLs unchanged; WooCommerce
  disabled; media on MinIO; employees in Mongo (no JSON file reads in any
  production path); stock has a ledger; orders idempotent; RBAC enforced
  server-side; audit logs populated; compose stack + health checks green;
  CI/CD live; backups scheduled AND a restore has been performed and
  documented; rollback procedure tested; no secret committed; no mock data;
  no plaintext passwords anywhere.
