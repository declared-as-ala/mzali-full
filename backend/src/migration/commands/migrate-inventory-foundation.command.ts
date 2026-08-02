import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import type { AnyBulkWriteOperation, Document as MongoDocument } from 'mongodb';
import { DEPOT_CODE } from '@/catalog/location.schema';
import { Variant } from '@/catalog/variant.schema';
import { StockItem } from '@/inventory/stock-item.schema';
import { MigrateGenerateVariantsCommand } from './migrate-generate-variants.command';
import { MigrateSeedLocationsCommand } from './migrate-seed-locations.command';

type Options = { dryRun?: boolean; skipOrderBackfill?: boolean };

const ORDER_BATCH_SIZE = 500;

@Command({
  name: 'migrate:inventory-foundation',
  description: 'Migrate inventory_items/stock_movements to the per-variant, per-location schema',
})
export class MigrateInventoryFoundationCommand extends CommandRunner {
  constructor(
    private readonly seedLocations: MigrateSeedLocationsCommand,
    private readonly generateVariants: MigrateGenerateVariantsCommand,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Variant.name) private readonly variants: Model<Variant>,
    @InjectModel(StockItem.name) private readonly stockItems: Model<StockItem>,
  ) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, write zero data' })
  parseDryRun(): boolean {
    return true;
  }

  @Option({ flags: '--skip-order-backfill', description: 'Skip the best-effort orders.items[].variantId backfill' })
  parseSkipOrderBackfill(): boolean {
    return true;
  }

  async run(params: string[], options: Options): Promise<void> {
    console.log('=== migrate:inventory-foundation — step 1/4 locations ===');
    await this.seedLocations.run(params, options);

    console.log('=== migrate:inventory-foundation — step 2/4 variants ===');
    await this.generateVariants.run(params, options);

    console.log('=== migrate:inventory-foundation — step 3/4 stock items + movements ===');
    await this.migrateStockData(options);

    if (!options.skipOrderBackfill) {
      console.log('=== migrate:inventory-foundation — step 4/4 order item variantId backfill ===');
      await this.backfillOrderVariantIds(options);
    } else {
      console.log('=== migrate:inventory-foundation — step 4/4 skipped (--skip-order-backfill) ===');
    }
  }

  private async migrateStockData(options: Options): Promise<void> {
    const variantByProduct = new Map<string, string>();
    for (const v of await this.variants.find().select({ productId: 1 })) {
      variantByProduct.set(v.productId, v.id);
    }

    // inventory_items (old collection) -> stock_items (new collection).
    const oldItems = await this.connection.collection('inventory_items').find({}).toArray();
    let itemsMigrated = 0;
    let itemsSkippedNoVariant = 0;
    for (const old of oldItems) {
      const variantId = variantByProduct.get(String(old.productId));
      if (!variantId) { itemsSkippedNoVariant += 1; continue; }
      itemsMigrated += 1;
      if (options.dryRun) continue;
      await this.stockItems.findOneAndUpdate(
        { variantId, locationId: DEPOT_CODE },
        {
          $set: {
            quantityOnHand: old.onHand ?? 0,
            quantityReserved: old.reserved ?? 0,
            lowStockThreshold: old.lowStockThreshold ?? null,
          },
          $setOnInsert: { reorderPoint: 0, targetStockLevel: null, averageCostMinor: null, lastPurchaseCostMinor: null },
        },
        { upsert: true },
      );
    }
    console.log(`  stock_items: migrated=${itemsMigrated} skipped(no variant)=${itemsSkippedNoVariant}`);

    // stock_movements — in-place field rename (same collection, old field
    // names -> new ones) for any row that hasn't been migrated yet.
    const oldMovements = await this.connection
      .collection('stock_movements')
      .find({ variantId: { $exists: false } })
      .toArray();
    let movementsMigrated = 0;
    let movementsSkippedNoVariant = 0;
    const ops: AnyBulkWriteOperation<MongoDocument>[] = [];
    for (const old of oldMovements) {
      const variantId = variantByProduct.get(String(old.productId));
      if (!variantId) { movementsSkippedNoVariant += 1; continue; }
      movementsMigrated += 1;
      if (options.dryRun) continue;
      const locationId = old.warehouseId === 'main' || !old.warehouseId ? DEPOT_CODE : String(old.warehouseId).toUpperCase();
      ops.push({
        updateOne: {
          filter: { _id: old._id },
          update: { $set: { variantId, locationId }, $unset: { productId: '', warehouseId: '' } },
        },
      });
    }
    if (ops.length) await this.connection.collection('stock_movements').bulkWrite(ops);
    console.log(`  stock_movements: migrated=${movementsMigrated} skipped(no variant)=${movementsSkippedNoVariant}`);
  }

  private async backfillOrderVariantIds(options: Options): Promise<void> {
    const variantByProduct = new Map<string, string>();
    for (const v of await this.variants.find().select({ productId: 1 })) {
      variantByProduct.set(v.productId, v.id);
    }

    const cursor = this.connection
      .collection('orders')
      .find({ 'items.variantId': { $exists: false } }, { projection: { items: 1 } });

    let batch: AnyBulkWriteOperation<MongoDocument>[] = [];
    let ordersUpdated = 0;
    let itemsResolved = 0;
    let itemsUnresolved = 0;

    const flush = async () => {
      if (!batch.length) return;
      if (!options.dryRun) await this.connection.collection('orders').bulkWrite(batch);
      ordersUpdated += batch.length;
      batch = [];
    };

    for await (const order of cursor) {
      const items = (order.items ?? []).map((item: { productId?: string }) => {
        const variantId = item.productId ? variantByProduct.get(item.productId) ?? null : null;
        if (variantId) itemsResolved += 1; else itemsUnresolved += 1;
        return { ...item, variantId };
      });
      batch.push({ updateOne: { filter: { _id: order._id }, update: { $set: { items } } } });
      if (batch.length >= ORDER_BATCH_SIZE) await flush();
    }
    await flush();

    console.log(`  orders: updated=${ordersUpdated} items resolved=${itemsResolved} unresolved=${itemsUnresolved}`);
  }
}
