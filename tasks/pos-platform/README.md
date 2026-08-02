# POS / Inventory / Suppliers / Invoicing / Loyalty — Sprint Prompts

Each `SPRINT-XX-*.md` file is a **self-contained prompt** for one sprint of
the unified-commerce epic (storefront + admin console, already live, being
extended with a POS app, multi-location inventory, suppliers/purchasing,
quotes/invoicing and loyalty). Run them **in order** — each sprint's
Verification gate must pass before starting the next. Same discipline as
the original `tasks/TASK-01..08` migration (see `tasks/README.md`), which
this epic builds directly on top of.

## How to use

1. Read `docs/pos-platform/PLAN.md` and `docs/pos-platform/current-state-audit.md`
   first — they explain what already exists and the decisions that
   reconcile the source master prompt with this codebase.
2. Open a new Claude Code session in this repo root (`mzali full`).
3. Give it the sprint file as the prompt, e.g.:
   `Read tasks/pos-platform/SPRINT-01-foundation-inventory.md and execute it.`
4. When the session finishes, run the Verification gate yourself (or ask
   the session to). Only then move to the next sprint.
5. Update `progress.md` at repo root with a new entry after each sprint.

## Order

| # | File | Delivers |
|---|------|----------|
| 01 | SPRINT-01-foundation-inventory.md | `variants` + `locations` collections, migration/backfill, extended stock-movement ledger, shared contracts |
| 02 | SPRINT-02-pos-core-sales.md | POS Next.js app, terminal auth, product/barcode search, cart, sale creation, boutique stock deduction, HTML ticket printing |
| 03 | SPRINT-03-cash-sessions-reports.md | Cashier sessions, cash movements, payments, X/Z reports, daily-revenue dashboard widgets |
| 04 | SPRINT-04-online-reservations-sync.md | Multi-location reserve/commit/release for online orders, storefront sold-out sync, cache invalidation |
| 05 | SPRINT-05-transfers-stocktakes.md | Depot↔boutique transfer workflow, stocktake workflow, low-stock alerts |
| 06 | SPRINT-06-suppliers-purchasing.md | Suppliers, supplier-product offers, purchase orders, goods receipts, cost/margin tracking |
| 07 | SPRINT-07-quotes-invoices.md | Quotes, invoices, credit notes, document numbering, PDF generation |
| 08 | SPRINT-08-loyalty.md | Loyalty accounts, ledger, earning/redemption rules, tiers, POS + storefront UI |
| 09 | SPRINT-09-reports-hardening.md | Margin/slow-moving/reorder reports, printing bridge (optional), security/audit hardening |

## Non-negotiable rules (apply to every sprint — see `docs/pos-platform/PLAN.md` §6 for the full list)

- The live storefront and admin console must keep working at every step.
- Never touch `types/*` except additively; run
  `node backend/scripts/check-contracts.mjs` after any contract change.
- Money stays integer millimes in the backend, dinars only at the contract
  edge (`backend/src/common/money.ts`).
- Every stock mutation goes through `StockLedgerService.applyMovement()` in
  the same transaction as its business effect — never a bare `$set`.
- New modules needing both HTTP controllers and worker/CLI use follow the
  core-module/API-module split (see any of `backend/src/shipping/*`,
  `backend/src/migration/*`, `backend/src/audit/*` for the pattern).
- No secrets in git. Verify with `npx tsc --noEmit` / `npm run typecheck`,
  not repeated full Docker rebuilds.

The full plan lives at `docs/pos-platform/PLAN.md`; the audit at
`docs/pos-platform/current-state-audit.md`; the original source master
prompt at `docs/pos-platform/_master-prompt.md`.
