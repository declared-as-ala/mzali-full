# Variant inventory upgrade — audit and rollout

Implementation date: 2026-09-20. This document supersedes the original
one-default-variant inventory design for products explicitly activated as MATRIX.
The implementation is local; production has only been inspected read-only.

## Production baseline

The production audit used native Mongo collection reads through the existing API
container, without loading application models, creating indexes, writing data,
or exporting customer details. The SSH connection was closed afterward.

| Collection / check | Result |
| --- | ---: |
| Products | 94 |
| Products with selectable options | 53 |
| Variants | 94 |
| Variants with size/color attributes | 0 |
| Stock rows | 137 |
| Stock movements | 18,547 |
| Online orders | 56,447 |
| Order lines without variant IDs | 86,823 |
| POS sales | 904 |
| Transfers / stocktakes | 0 / 0 |
| DEPOT on hand / reserved | 1,114,746 / 0 |
| BOUTIQUE on hand / reserved | 195,072 / 0 |

No duplicate stock keys/SKUs, orphan variants/stock, negative quantities, missing
movement histories, or mismatches between stock and its latest ledger snapshot
were found. These are recorded balances, not verified physical counts. The live
database continues changing as trading continues.

`syna word` has four saved colors and four saved sizes, under the labels
`couleur ` and `tallie `. The matrix editor recognizes these labels, including
whitespace and the spelling `tallie`, and supports explicit option selection.
Its 16 combinations start at zero. The audit found DEPOT stock 0 and no BOUTIQUE
stock row. Photos and option labels do not establish physical quantities.

## Audit of the previous architecture

1. Product stored catalog details, options, prices and a cached `stockQuantity`.
2. Each product had one default Variant with a stable ID, SKU and empty attributes.
3. Size/color were customer preference snapshots, without separate stock identity.
4. StockItem already held on-hand/reserved quantities per variant and location.
5. Stock rows used `variantId`, but product-keyed services selected the default.
6. DEPOT and BOUTIQUE were location codes; online and POS defaulted to different locations.
7. POS stock checks used the default variant's Boutique balance.
8. Website availability used product/default-variant quantities; individual options
   could not be sold out independently.
9. Pending and tentative orders did not deduct; confirmation committed stock.
10. POS sales deducted immediately through StockLedgerService inside transactions.
11. Cancellation restored product/default-variant quantities; historical online
    lines did not identify real size/color variants.
12. Confirmed edits calculated product-level deltas, so color swaps had no effect.
13. Transfers stored variant IDs, but creation resolved a product's default variant.
14. StockLedgerService wrote stock and movements; negative clamping could mask
    invalid deductions, and several callers reused documents on transaction retry.
15. Existing pools need counted allocation; historical IDs and snapshots must remain.
16. Additive changes affect products, variants, orders, pos_sales, stock_movements
    and stock_transfers. Existing stock_items keys remain unchanged. The main
    code areas are catalog, inventory, orders, POS, Admin, storefront and cart contracts.
17. Migration validates explicit per-location totals, archives the legacy variant,
    and moves quantities through ledger corrections in one transaction.
18. Roll out backend and clients together while products remain LEGACY; pilot one
    counted product, verify both channels and history, then activate further products.

## Implemented behavior

- A MATRIX product has stable variant IDs with normalized unique size/color keys,
  unique editable SKUs, active flags, optional price overrides and stock thresholds.
- Website reads DEPOT; POS sells BOUTIQUE. Variant stock is never combined across
  locations for online availability.
- Product cards show **Épuisé** only when no active DEPOT combination is available.
  Detail selectors disable each sold-out size for the selected color. Disabling
  inventory tracking keeps active variants purchasable.
- New carts and orders carry exact variant IDs and size/color snapshots. Checkout
  validates aggregate quantities, including repeated variant lines in bundles.
- Pending/tentative orders do not reserve or deduct. Confirmation deducts the
  exact variant. Confirmation retries cannot deduct twice. Cancellation restores
  once; confirmed edits apply exact-variant quantity differences atomically.
- Orders and POS sales remember whether stock was actually deducted. A cancellation
  reverses an earlier tracked deduction even after mode changes. An untracked sale
  never creates a phantom return after stock tracking is re-enabled. Editing
  quantities on a tracked sale requires stock mode to be on.
- Separate Stock Dépôt / Stock Boutique pages provide filters, search, pagination,
  thresholds, adjustments with a required reason, and movement history links.
- Product variants show both location totals and per-combination quantities.
  New combinations can be added at zero without changing existing IDs.
- Transfers use exact variant lines; shipping and keyed partial receipts are
  atomic and retry-safe. Stocktakes count every variant and refuse stale counts
  rather than overwriting stock changed by a sale.
- The ledger rejects negative stock and records before/after balances, product,
  variant, location, actor, reason and transaction references. Legacy rows remain
  readable with missing fields shown as unknown rather than invented.
- POS catalog refreshes on focus, after sales, and every 30 seconds while visible.
  Existing inventory events also update availability. Server validation remains
  authoritative for stale tabs and simultaneous sales.

## Per-product migration

1. Back up the database and verify restoration before deployment. Use a staging
   copy to rehearse activation; no automated production activation is provided.
2. Deploy the API and storefront/Admin/POS changes together. Do not run the old
   foundation stock migration to split products or backfill order variant IDs.
3. Pause trading for the product. Finish/cancel its open transfers and stocktakes;
   close cash sessions that contain editable sales of the legacy variant. Activation
   rejects these outstanding references and nonzero reservations.
4. Open Product → Variantes & stock. Select the saved size/color options and
   generate the matrix. Disable combinations that are not produced. Verify SKUs.
5. Count stock separately in DEPOT and BOUTIQUE. If the recorded total is wrong,
   correct it first with an audited stock adjustment and a reason.
6. Allocate every location's recorded total explicitly across the new combinations.
   The API requires each location's total to be conserved independently. It never
   guesses an equal distribution, moves stock between locations, or uses photos.
7. Use **Vérifier sans modifier**. This validates identities, duplicate SKUs,
   reservations and totals without changing product, stock or movement records.
8. Use **Valider et activer les variantes** after reviewing the allocation.
   One transaction retires the old default, records its removal and the new
   per-variant allocations, and marks the product MATRIX. Failure rolls back all
   changes. Historical variants and movement IDs remain in the database.
9. Refresh both clients and verify one known combination in each location. Verify
   product totals, stock histories and historical order displays before resuming.

After activation, use stock adjustments, transfers and stocktakes for quantity
changes. The matrix cannot be rerun to replace IDs. There is no automatic downgrade
to product pools. Do not roll back to an application that only understands default
variants after any product has been activated; use a forward fix or a coordinated
database/application restore that accounts for subsequent trading.

## Historical records and boundaries

Old order snapshots are displayed unchanged. At a stock-changing operation, a
missing or retired variant can be resolved only when its saved size AND color
match exactly one current variant (trimmed, case-insensitive, including `tallie`).
This resolution does not rewrite the historical order snapshot. Ambiguous records
are blocked with a reconciliation message. They require an operator-reviewed
resolution; there is no tool that guesses or silently rewrites their history.

Historical records without a stock-tracking marker retain the prior status-based
assumption. The production audit found stock tracking enabled by default; the audit
cannot prove every past mode setting. Review unusual historical cancellations.

Stock pages paginate the rendered rows, with filtering performed over batched
catalog/stock reads. This is suitable for the audited catalog; much larger catalogs
would benefit from database-side joined pagination. Ledger history uses database
pagination. A stocktake that becomes stale must be cancelled and recreated.

## Verification

All database-writing tests use an isolated local Mongo replica set. The variant
suite refuses any database path other than `mzali_inventory_test`.

```powershell
# backend directory; explicitly configured isolated replica set
$env:VARIANT_TEST_URI = '<isolated connection ending in /mzali_inventory_test>'
$env:POS_CASH_TEST_URI = '<isolated connection ending in /mzali_cash_test>'
npm run test:integration -- test/integration/variant-inventory.spec.ts test/integration/pos-cash.spec.ts
npm test -- --runInBand
npm run typecheck
npm run lint
npm run check:contracts
npm run build
```

The read-only preflight is `npm run inventory:audit` with an explicitly supplied
`INVENTORY_AUDIT_URI`. It uses native collection reads only, reports totals,
unresolved historical lines, duplicate keys/SKUs, negatives, orphans and latest
ledger mismatches. Exit 2 indicates inconsistencies. Against a busy production
database, writes between reads can cause transient mismatches: repeat during a
quiet window before interpreting them as corruption. It never allocates stock.

Migration dry-run and conservation are exercised by the integration tests. Frontend
and POS session/hardware tests and production builds are also run. Browser visual
verification is still required before rollout because the in-app browser was not
available in this session. Existing unrelated lint warnings remain documented by
the build output. Local pre-existing PostCSS config deletions are preserved; the
final UI builds were verified temporarily using the tracked configurations.

### Recorded local results

323 backend unit tests; 32 database integration tests (16 inventory + 16 POS);
14 frontend tests including rendered selectors; 2 POS session tests and 41 bridge
hardware tests passed. Backend typecheck/lint/build, contract synchronization,
and storefront/Admin and POS production builds passed. The final isolated read-only
preflight found zero duplicate keys/SKUs, negative balances, orphans, missing ledger
rows or latest-snapshot mismatches. `git diff --check` passed.
