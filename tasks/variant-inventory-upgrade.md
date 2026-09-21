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
- [x] Deploy the coordinated API/Admin/storefront/POS release — bf04dc5, 2026-09-21.
- [ ] Count and allocate each legacy product, pilot one product, verify and activate.

Products remain LEGACY until explicitly allocated and activated; existing size/color
options alone do not establish their stock. The code is deployed; product allocation remains an explicit operator action.

## Production deployment — 2026-09-21

Release `bf04dc5a2b04b550f85b92eae02e38f2506b71b4` pushed and deployed successfully.
CI and Deploy Production workflows passed. API, worker, storefront and POS all
run the matching image and report healthy. Public domain/product smoke tests passed.
A fresh Mongo backup was restored successfully in an isolated container before
rollout; the deployment also backed up MongoDB and media.

Post-deploy read-only audit: 94 legacy products, 94 variants, 137 stock rows,
18,547 movements, DEPOT 1,114,746 and BOUTIQUE 195,072; no negative balances,
duplicates, orphans, missing ledger snapshots or stock/ledger mismatches.
No product allocation or inventory migration was activated.

Deployment run: https://github.com/declared-as-ala/mzali-full/actions/runs/35543584820

## Simplified stock entry — deployed 2026-09-21

- [x] Generate all size/color combinations automatically from saved product options.
- [x] Remove per-combination price, SKU and manual generation controls from the form.
- [x] Configure stock directly from Stock Dépôt / Stock Boutique without opening the product.
- [x] Enter first stock in Dépôt in one save; Boutique starts at zero.
- [x] Keep transfer workflow for moving Dépôt quantities to Boutique.
- [x] Preserve existing per-location totals when splitting legacy stock.
- [x] Verify 18 transaction tests and 17 frontend tests.

Normal flow: Products (details, shared price, options) → Stock Dépôt (quantities)
→ Transfers (Dépôt to Boutique). Initial entry is explicit, audited and atomic.

Follow-up verification: backend/frontend typechecks, lint and production builds passed.
Existing unrelated frontend lint warnings remain. Simplification deployed as 680a054; all application containers healthy.

Deployment of `680a0546246beb31e063ba2a280fa9decf9649ca` succeeded after CI and
pre-deployment backups. API, worker, storefront and POS run the matching images.
Workflow: https://github.com/declared-as-ala/mzali-full/actions/runs/35544573959


## Stock and transfer interface follow-up — local, not deployed

- [x] Remove Inventaires and Mouvements navigation and stock-row movement links; retain historical records and backend audit functionality.
- [x] Combine configuration and adjustments under « Configurer le stock et ajuster ».
- [x] Lock adjustments to the stock page's location. Boutique cannot edit Dépôt quantities or change global variant configuration.
- [x] Display matching stock dashboards for Dépôt and Boutique: physical, available, reserved and exhausted combinations.
- [x] Print the complete location stock report across all pages, with size/color details and totals, independently of table filters.
- [x] Show products on transfer-field focus without mandatory search.
- [x] Select multiple exact size/color quantities with availability limits and a selection summary.
- [x] Keep approval, shipment and receipt steps; preserve server stock guards.

Usage: create product/options → configure and receive stock in Dépôt → create a
transfer with quantities per combination → approve → ship → receive in Boutique.
Boutique corrections affect Boutique only. Initial legacy allocation stays in
Dépôt because it must preserve both existing location totals.

Validation: frontend production build, TypeScript, targeted lint and 17 frontend tests passed. Existing unrelated lint warnings remain. POS changes requested during this follow-up were reverted at user request; existing POS behavior is unchanged.


## Variant totals follow-up — local, not deployed

- Remove the legacy total correction form and manual reason field.
- Rename Stock Dépôt to Stock; remove Boutique configuration/adjustment action.
- Initial variant configuration explicitly replaces the historical Dépôt total
  with the sum of entered quantities (e.g. Vert XL 50 + Vert L 20 = 70).
- Save the replacement atomically with ledger corrections and preserve history.
- Preserve existing Boutique totals during allocation; reservation and open
  transfer/session checks still apply. No production quantities changed automatically.
- This replaces the earlier requirement to match the historical Dépôt total;
  API callers without the explicit replacement flag retain the conservation rule.


## Single stock page — local follow-up

Remove the separate Stock Boutique navigation/page; old URLs redirect to Stock.
Stock now has a Dépôt/Boutique location selector with statistics, printing and
location-specific adjustments for either selection. This corrects the earlier
interpretation that Boutique adjustments should be removed.
