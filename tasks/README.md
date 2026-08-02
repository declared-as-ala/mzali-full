# Migration Task Prompts

Each `TASK-XX-*.md` file is a **self-contained prompt** for one phase of the
WooCommerce → NestJS/MongoDB migration. Run them **in order** — each task's
"Verification gate" must pass before starting the next.

## How to use

1. Open a new Claude Code session in this repo root (`mzali full`).
2. Give it the task file as the prompt, e.g.:
   `Read tasks/TASK-02-catalog-media.md and execute it.`
3. When the session finishes, run the Verification gate commands yourself
   (or ask the session to). Only then move to the next task.

## Order

| # | File | Phase |
|---|------|-------|
| 01 | TASK-01-backend-foundation.md | NestJS skeleton, auth, users, audit, dev infra (partially done — see file) |
| 02 | TASK-02-catalog-media.md | Products, categories, MinIO media |
| 03 | TASK-03-commerce-core.md | Orders, inventory, coupons, customers, assignment, shipping, settings, stats |
| 04 | TASK-04-migration-tooling.md | Woo importers, legacy_mappings, verify, dry-run |
| 05 | TASK-05-seed-database.md | Seed the new MongoDB with the current live data |
| 06 | TASK-06-frontend-integration.md | mzali-api services, provider switch, auth v2, coupon UI, admin pages |
| 07 | TASK-07-docker-cicd.md | Prod compose, GitHub Actions CI/CD, backups |
| 08 | TASK-08-cutover-seo-hardening.md | Cutover runbook, SEO, docs, hardening |

## Non-negotiable rules (apply to every task)

- The live storefront must keep working at every step. `COMMERCE_PROVIDER`
  stays `woocommerce` until TASK-06 is verified.
- Never touch `types/*` except additively; run
  `node backend/scripts/check-contracts.mjs` after any contract change.
- Money is stored as integer millimes (`backend/src/common/money.ts`);
  API responses also expose float dinars for the storefront contract.
- No secrets in git. `.env.local` and `data/` are gitignored — keep it that way.
- Verify with `npx tsc --noEmit` (frontend) / `npm run typecheck` (backend),
  not repeated full builds.

The approved full plan lives at
`C:\Users\Ala\.claude\plans\compiled-petting-hartmanis.md`; the system audit at
`docs/current-system-audit.md`.

## Next epic: POS / inventory / suppliers / invoicing / loyalty

This TASK-01..08 series covers the WooCommerce→NestJS migration only
(complete). The follow-on epic extending the platform into a full
omnichannel system (POS app, depot/boutique inventory, suppliers,
purchase orders, quotes, invoices, loyalty) is planned separately at
`tasks/pos-platform/` (see `tasks/pos-platform/README.md` and
`docs/pos-platform/PLAN.md`) — same self-contained-sprint discipline,
next step is `tasks/pos-platform/SPRINT-01-foundation-inventory.md`.
