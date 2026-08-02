import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { DEPOT_CODE } from '@/catalog/location.schema';
import { Product } from '@/catalog/product.schema';
import { Variant } from '@/catalog/variant.schema';
import { StockItem } from '@/inventory/stock-item.schema';

type Options = { json?: boolean };

@Command({ name: 'migrate:verify-inventory-foundation', description: 'Reconcile the variants/locations/stock-items migration' })
export class VerifyInventoryFoundationCommand extends CommandRunner {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(Variant.name) private readonly variants: Model<Variant>,
    @InjectModel(StockItem.name) private readonly stockItems: Model<StockItem>,
  ) {
    super();
  }

  @Option({ flags: '--json', description: 'Print the full JSON report to stdout' })
  parseJson(): boolean {
    return true;
  }

  async run(_params: string[], options: Options): Promise<void> {
    const mismatches: string[] = [];

    // 1. Every product has exactly one variant.
    const productCount = await this.products.countDocuments();
    const variantCount = await this.variants.countDocuments();
    const productsWithoutVariant = await this.products.aggregate([
      // variants.productId is a string (matches Variant.id), products._id is
      // an ObjectId — must cast before joining, $lookup does not auto-cast.
      { $lookup: { from: 'variants', let: { pid: { $toString: '$_id' } }, pipeline: [{ $match: { $expr: { $eq: ['$productId', '$$pid'] } } }], as: 'v' } },
      { $match: { v: { $size: 0 } } },
      { $count: 'n' },
    ]);
    const missingVariants = productsWithoutVariant[0]?.n ?? 0;
    if (missingVariants > 0) mismatches.push(`${missingVariants} product(s) have no variant`);
    if (variantCount < productCount) mismatches.push(`variant count (${variantCount}) < product count (${productCount})`);

    // 2. No stock_movements rows left with the old field shape.
    const unmigratedMovements = await this.connection.collection('stock_movements').countDocuments({ variantId: { $exists: false } });
    if (unmigratedMovements > 0) mismatches.push(`${unmigratedMovements} stock_movements row(s) still have the old productId/warehouseId shape`);

    // 3. Sum preservation: old inventory_items onHand/reserved totals must
    //    equal the new stock_items (DEPOT) totals exactly — the migration
    //    must not have gained or lost any stock.
    const [oldTotals] = await this.connection.collection('inventory_items').aggregate([
      { $group: { _id: null, onHand: { $sum: '$onHand' }, reserved: { $sum: '$reserved' } } },
    ]).toArray();
    const [newTotals] = await this.stockItems.aggregate([
      { $match: { locationId: DEPOT_CODE } },
      { $group: { _id: null, onHand: { $sum: '$quantityOnHand' }, reserved: { $sum: '$quantityReserved' } } },
    ]);
    const oldOnHand = oldTotals?.onHand ?? 0;
    const oldReserved = oldTotals?.reserved ?? 0;
    const newOnHand = newTotals?.onHand ?? 0;
    const newReserved = newTotals?.reserved ?? 0;
    if (oldOnHand !== newOnHand) mismatches.push(`onHand sum mismatch: old=${oldOnHand} new=${newOnHand}`);
    if (oldReserved !== newReserved) mismatches.push(`reserved sum mismatch: old=${oldReserved} new=${newReserved}`);

    // 4. Every DEPOT stock item's variant actually belongs to a real product.
    const orphanedStockItems = await this.stockItems.aggregate([
      { $match: { locationId: DEPOT_CODE } },
      { $lookup: { from: 'variants', let: { vid: { $toObjectId: '$variantId' } }, pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$vid'] } } }], as: 'v' } },
      { $match: { v: { $size: 0 } } },
      { $count: 'n' },
    ]);
    const orphaned = orphanedStockItems[0]?.n ?? 0;
    if (orphaned > 0) mismatches.push(`${orphaned} stock_items row(s) reference a nonexistent variant`);

    const report = {
      productCount,
      variantCount,
      missingVariants,
      unmigratedMovements,
      onHand: { old: oldOnHand, new: newOnHand },
      reserved: { old: oldReserved, new: newReserved },
      orphanedStockItems: orphaned,
      mismatches,
      ok: mismatches.length === 0,
    };

    if (options.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`migrate:verify-inventory-foundation — ${report.ok ? 'OK' : 'MISMATCHES FOUND'}`);
      console.log(`  products=${productCount} variants=${variantCount} missingVariants=${missingVariants}`);
      console.log(`  onHand old=${oldOnHand} new=${newOnHand} | reserved old=${oldReserved} new=${newReserved}`);
      console.log(`  unmigratedMovements=${unmigratedMovements} orphanedStockItems=${orphaned}`);
      mismatches.forEach((m) => console.log(`  MISMATCH: ${m}`));
    }

    if (!report.ok) process.exitCode = 1;
  }
}
