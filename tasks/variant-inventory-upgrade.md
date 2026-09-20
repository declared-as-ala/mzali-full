# Variant inventory upgrade checklist

Local implementation and automated verification complete. A checked item is not a deployment.

- [x] Audit Product / Variant / Stock / POS / Orders / Transfers in code.
- [x] Audit production read-only; record legacy data and consistency findings.
- [x] Keep historical variant IDs, order snapshots and stock movements.
- [x] Add explicit per-location allocation and transaction-based migration dry-run.
- [x] Populate the size/color editor from saved options, including `tallie`.
- [x] Propagate variant IDs through checkout, confirmation, editing and cancellation.
- [x] Add Stock Dépôt, Stock Boutique and movement-history pages.
- [x] Connect exact-variant transfer selection and variant stocktakes.
- [x] Complete variant editing: SKU, price override, threshold, activation, new combinations.
- [x] Complete storefront/POS availability and cart behavior review.
- [x] Expand concurrency, idempotency, no-stock-mode and migration tests.
- [x] Run backend/frontend/POS tests and final TypeScript/lint checks.
- [x] Run backend, storefront/Admin and POS production builds.
- [x] Write audit, migration/rollout instructions and verification evidence.
- [x] Final diff review; report limitations and deliver the implementation.

- [x] Show **Épuisé** on the website and disable sold-out size/color combinations.
- [x] Deduct only the ordered quantity of the exact DEPOT variant on confirmation.

## Deployment boundary

No production inventory changes are part of the read-only audit. Do not run
automatic allocation or activate a product without its verified per-variant,
per-location quantities. Do not reuse the old foundation migration to split
stock or rewrite historic order variant IDs.

## Production audit baseline (2026-09-20)

94 products; 94 variants (all without size/color attributes); 53 products with
options; 137 stock rows; 18,547 movements; 56,447 orders; 904 POS sales.
86,823 order lines lack variant IDs. No transfers or stocktakes.

Read-only checks found no duplicate stock keys/SKUs, orphan stock/variants,
negative balances, missing movement histories or discrepancies between current
stock and its latest movement snapshot. Counts can change with live trading.

`syna word` has four colors and four sizes: 16 combinations. Recorded Dépôt
stock is 0; no Boutique stock row exists. Do not infer any physical inventory
from its options or photos.

## Verification evidence

- Backend: 323 unit tests passed.
- Isolated Mongo replica set: 16 variant tests and 16 POS cash tests passed.
- Frontend: 14 tests passed, including rendered size availability and Épuisé.
- POS: 2 session tests and 41 hardware tests passed.
- Backend typecheck/lint, frontend/POS build typecheck/lint, mirrored contracts
  and production builds passed. Existing unrelated lint warnings remain.
- Migration allocation dry-run conserved totals without writes; isolated audit
  returned zero negative stock, duplicates, orphans or ledger mismatches.
- Production read-only baseline is recorded above. No production writes were made.

See [audit and migration guide](../docs/pos-platform/variant-inventory-upgrade.md).

## Remaining before going live

- [ ] Browser visual acceptance on desktop/mobile (browser unavailable in this session).
- [ ] Deploy the coordinated API/Admin/storefront/POS release.
- [ ] Count and allocate each legacy product, pilot one product, verify and activate.

Products remain LEGACY until explicitly allocated and activated; existing size/color
options alone do not establish their stock. The code has not been pushed or deployed.
