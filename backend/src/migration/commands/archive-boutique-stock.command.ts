import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { Product } from '@/catalog/product.schema';
import { Variant } from '@/catalog/variant.schema';
import { SettingsService } from '@/settings/settings.service';
import { StockItem } from '@/inventory/stock-item.schema';

type Options = { dryRun?: boolean; rollback?: boolean; force?: boolean };

const MARKER_KEY = 'migration:single-depot-inventory';
const ARCHIVE_COLLECTION = 'stock_items_boutique_archive';
const ARCHIVED_LOCATION = 'BOUTIQUE_ARCHIVED';

/**
 * Moves the store to ONE operational inventory (DEPOT) without destroying anything.
 *
 *  1. Snapshots every BOUTIQUE stock item into `stock_items_boutique_archive`
 *     (same _id, full document) so the state before the migration is recoverable.
 *  2. Relabels those stock items `BOUTIQUE` -> `BOUTIQUE_ARCHIVED`. No code reads that
 *     location any more (the ledger refuses to write to it), so it can never
 *     count towards availability again.
 *  3. Retires the per-product "Boutique pool" variants (kept in the database, so old
 *     stock movements and POS sale lines still resolve their variant id).
 *
 * Boutique quantities are NOT merged into DEPOT: doing that could duplicate physical
 * inventory. Movement history (`stock_movements`) is never touched. Idempotent;
 * `--rollback` restores the snapshot. Run with `--dry-run` first.
 *
 *   node dist/cli.js archive:boutique-stock --dry-run
 *   node dist/cli.js archive:boutique-stock
 *   node dist/cli.js archive:boutique-stock --rollback
 */
@Command({ name: 'archive:boutique-stock', description: 'Archive Boutique stock and switch to a single DEPOT inventory (non-destructive, reversible)' })
export class ArchiveBoutiqueStockCommand extends CommandRunner {
  constructor(
    @InjectModel(StockItem.name) private readonly stockItems: Model<StockItem>,
    @InjectModel(Variant.name) private readonly variants: Model<Variant>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectConnection() private readonly connection: Connection,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, write zero data' })
  parseDryRun(): boolean { return true; }

  @Option({ flags: '--rollback', description: 'Restore the archived Boutique stock and pool variants' })
  parseRollback(): boolean { return true; }

  @Option({ flags: '--force', description: 'Proceed even if open Boutique transfers/stocktakes exist' })
  parseForce(): boolean { return true; }

  async run(_params: string[], options: Options): Promise<void> {
    const archive = this.connection.collection(ARCHIVE_COLLECTION);
    if (options.rollback) return this.rollback(archive, options);

    const boutique = await this.stockItems.collection.find({ locationId: 'BOUTIQUE' }).toArray();
    const poolVariants = await this.variants.find({ boutiquePool: true, retired: { $ne: true } }).select({ _id: 1, productId: 1 });
    const depotRows = await this.stockItems.countDocuments({ locationId: 'DEPOT' });
    const units = boutique.reduce((sum, row) => sum + (Number(row.quantityOnHand) || 0), 0);
    const nonZero = boutique.filter((row) => Number(row.quantityOnHand) !== 0);

    // Per-product report so nothing is archived unseen.
    const variantDocs = await this.variants.find({ _id: { $in: nonZero.map((r) => String(r.variantId)) } }).select({ productId: 1 });
    const productOf = new Map(variantDocs.map((v) => [v.id, v.productId]));
    const productDocs = await this.products.find({ _id: { $in: [...new Set(variantDocs.map((v) => v.productId))] } }).select({ name: 1, deletedAt: 1 });
    const nameOf = new Map(productDocs.map((p) => [p.id, `${p.name}${p.deletedAt ? ' (supprimé)' : ''}`]));
    const perProduct = new Map<string, number>();
    for (const row of nonZero) {
      const label = nameOf.get(productOf.get(String(row.variantId)) ?? '') ?? `variante ${row.variantId}`;
      perProduct.set(label, (perProduct.get(label) ?? 0) + Number(row.quantityOnHand));
    }

    const openTransfers = await this.connection.collection('stock_transfers').countDocuments({ status: { $nin: ['RECEIVED', 'CANCELLED', 'REJECTED'] } });
    const openStocktakes = await this.connection.collection('stocktakes').countDocuments({ locationId: 'BOUTIQUE', status: { $nin: ['POSTED', 'CANCELLED'] } });

    console.log(`${options.dryRun ? '[dry-run] ' : ''}archive:boutique-stock`);
    console.log(`  DEPOT stock items (untouched): ${depotRows}`);
    console.log(`  BOUTIQUE stock items to archive: ${boutique.length} (${nonZero.length} non-zero, ${units} units in total)`);
    for (const [label, qty] of [...perProduct.entries()].sort((a, b) => b[1] - a[1])) console.log(`    - ${label}: ${qty}`);
    console.log(`  Boutique pool variants to retire: ${poolVariants.length}`);
    console.log(`  Open transfers: ${openTransfers}, open Boutique stocktakes: ${openStocktakes}`);
    console.log('  Boutique quantities are NOT added to DEPOT. Movement history is untouched.');

    if (options.dryRun) return;
    if ((openTransfers || openStocktakes) && !options.force) {
      console.log('  ABORTED: finish or cancel the open transfers/stocktakes first (or pass --force).');
      return;
    }

    if (boutique.length) {
      const stamp = new Date();
      await archive.bulkWrite(
        boutique.map((doc) => ({ replaceOne: { filter: { _id: doc._id }, replacement: { ...doc, archivedAt: stamp }, upsert: true } })),
        { ordered: false },
      );
      const stored = await archive.countDocuments({ _id: { $in: boutique.map((d) => d._id) } } as never);
      if (stored !== boutique.length) throw new Error(`Snapshot incomplete (${stored}/${boutique.length}); nothing was changed.`);
      await this.stockItems.collection.updateMany({ locationId: 'BOUTIQUE' }, { $set: { locationId: ARCHIVED_LOCATION } });
    }
    const poolIds = poolVariants.map((v) => v.id);
    if (poolIds.length) await this.variants.updateMany({ _id: { $in: poolIds } }, { $set: { retired: true, active: false } });

    await this.settings.setRaw(MARKER_KEY, { completedAt: new Date().toISOString(), archivedItems: boutique.length, archivedUnits: units, retiredPoolVariantIds: poolIds });
    console.log(`  DONE: archived ${boutique.length} stock items (${units} units), retired ${poolIds.length} pool variants. Snapshot: ${ARCHIVE_COLLECTION}.`);
  }

  private async rollback(archive: ReturnType<Connection['collection']>, options: Options): Promise<void> {
    const marker = await this.settings.getRaw(MARKER_KEY);
    const rows = await archive.find({}).toArray();
    const poolIds = (marker?.retiredPoolVariantIds as string[] | undefined) ?? [];
    console.log(`${options.dryRun ? '[dry-run] ' : ''}archive:boutique-stock --rollback: ${rows.length} archived stock items, ${poolIds.length} pool variants to restore`);
    if (options.dryRun) return;
    for (const row of rows) await this.stockItems.collection.updateOne({ _id: row._id }, { $set: { locationId: 'BOUTIQUE' } });
    if (poolIds.length) await this.variants.updateMany({ _id: { $in: poolIds } }, { $set: { retired: false, active: true } });
    await this.settings.setRaw(MARKER_KEY, { rolledBackAt: new Date().toISOString() });
    console.log('  Restored. Deploy the previous release before using Boutique stock again.');
  }
}
