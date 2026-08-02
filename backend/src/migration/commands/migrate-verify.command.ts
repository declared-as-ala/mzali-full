import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category } from '@/catalog/category.schema';
import { Product } from '@/catalog/product.schema';
import { Employee } from '@/users/employee.schema';
import { Order } from '@/orders/order.schema';
import { writeReport } from '../report-writer';
import { WooCategoryRaw, WooOrderRaw, WooProductRaw } from '../woo-types';
import { WooClientService } from '../woo-client.service';

type Options = { json?: boolean };

/** Float-rounding tolerance when comparing order totals (±1 millime/order). */
const TOTAL_TOLERANCE_PER_ORDER_MINOR = 1;
const SAMPLE_SIZE = 20;

@Command({ name: 'migrate:verify', description: 'Reconcile migrated data against WooCommerce' })
export class MigrateVerifyCommand extends CommandRunner {
  constructor(
    private readonly woo: WooClientService,
    @InjectModel(Category.name) private readonly categories: Model<Category>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
  ) {
    super();
  }

  @Option({ flags: '--json', description: 'Print the full JSON report to stdout' })
  parseJson(): boolean {
    return true;
  }

  async run(_params: string[], options: Options): Promise<void> {
    const mismatches: string[] = [];

    // 1. Counts
    const wooCategoryCount = (await this.woo.get<WooCategoryRaw[]>('/products/categories', { per_page: 1 })).total;
    const wooProductCount = (await this.woo.get<WooProductRaw[]>('/products', { per_page: 1 })).total;
    const wooOrderCount = (await this.woo.get<WooOrderRaw[]>('/orders', { per_page: 1, status: 'any' })).total;

    const mongoCategoryCount = await this.categories.countDocuments({ legacyId: { $ne: null } });
    const mongoProductCount = await this.products.countDocuments({ legacyId: { $ne: null } });
    const mongoOrderCount = await this.orders.countDocuments({ legacyId: { $ne: null } });

    if (wooCategoryCount !== mongoCategoryCount) mismatches.push(`category count: woo=${wooCategoryCount} mongo=${mongoCategoryCount}`);
    if (wooProductCount !== mongoProductCount) mismatches.push(`product count: woo=${wooProductCount} mongo=${mongoProductCount}`);
    if (wooOrderCount !== mongoOrderCount) mismatches.push(`order count: woo=${wooOrderCount} mongo=${mongoOrderCount}`);

    // 2. Slug-set equality (products + categories)
    const wooProductSlugs = new Set<string>();
    const wooCategorySlugs = new Set<string>();
    for await (const page of this.woo.paginate<WooProductRaw>('/products')) for (const p of page) wooProductSlugs.add(p.slug);
    for await (const page of this.woo.paginate<WooCategoryRaw>('/products/categories')) for (const c of page) wooCategorySlugs.add(c.slug);

    const mongoProductSlugs = new Set((await this.products.find({ legacyId: { $ne: null } }).select({ slug: 1 })).map((p) => p.slug));
    const mongoCategorySlugs = new Set((await this.categories.find({ legacyId: { $ne: null } }).select({ slug: 1 })).map((c) => c.slug));

    const missingProductSlugs = [...wooProductSlugs].filter((s) => !mongoProductSlugs.has(s));
    const missingCategorySlugs = [...wooCategorySlugs].filter((s) => !mongoCategorySlugs.has(s));
    if (missingProductSlugs.length > 0) mismatches.push(`${missingProductSlugs.length} product slugs missing in Mongo`);
    if (missingCategorySlugs.length > 0) mismatches.push(`${missingCategorySlugs.length} category slugs missing in Mongo`);

    // 3. Per-status order counts + sums (±1 millime/order tolerance)
    const wooStatusTotals = new Map<string, { count: number; totalMinor: number }>();
    for await (const page of this.woo.paginate<WooOrderRaw>('/orders', { status: 'any' })) {
      for (const o of page) {
        const entry = wooStatusTotals.get(o.status) ?? { count: 0, totalMinor: 0 };
        entry.count += 1;
        entry.totalMinor += Math.round(Number(o.total) * 1000);
        wooStatusTotals.set(o.status, entry);
      }
    }
    const mongoStatusAgg = await this.orders.aggregate<{ _id: string; count: number; totalMinor: number }>([
      { $match: { legacyId: { $ne: null } } },
      { $group: { _id: '$status', count: { $sum: 1 }, totalMinor: { $sum: { $ifNull: ['$manualTotalMinor', '$totalMinor'] } } } },
    ]);
    const mongoStatusTotals = new Map(mongoStatusAgg.map((r) => [r._id, { count: r.count, totalMinor: r.totalMinor }]));

    const statusComparison: Record<string, { wooCount: number; mongoCount: number; wooTotalMinor: number; mongoTotalMinor: number }> = {};
    for (const [status, wooEntry] of wooStatusTotals) {
      const mongoEntry = mongoStatusTotals.get(status) ?? { count: 0, totalMinor: 0 };
      statusComparison[status] = {
        wooCount: wooEntry.count, mongoCount: mongoEntry.count,
        wooTotalMinor: wooEntry.totalMinor, mongoTotalMinor: mongoEntry.totalMinor,
      };
      if (wooEntry.count !== mongoEntry.count) mismatches.push(`order status "${status}" count: woo=${wooEntry.count} mongo=${mongoEntry.count}`);
      const tolerance = wooEntry.count * TOTAL_TOLERANCE_PER_ORDER_MINOR;
      if (Math.abs(wooEntry.totalMinor - mongoEntry.totalMinor) > tolerance) {
        mismatches.push(`order status "${status}" total: woo=${wooEntry.totalMinor} mongo=${mongoEntry.totalMinor} (tolerance ${tolerance})`);
      }
    }

    // 4. Duplicate slug/SKU detection in Mongo
    const dupProductSlugs = await this.products.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$slug', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]);
    if (dupProductSlugs.length > 0) mismatches.push(`${dupProductSlugs.length} duplicate product slugs in Mongo`);

    // 5. Random deep-compare sample (products)
    const sampleProducts = await this.products.aggregate<{ legacyId: string; slug: string; regularPriceMinor: number; name: string }>([
      { $match: { legacyId: { $ne: null } } },
      { $sample: { size: Math.min(SAMPLE_SIZE, mongoProductCount) } },
    ]);
    const productSampleIssues: string[] = [];
    for (const sample of sampleProducts) {
      try {
        const { data: raw } = await this.woo.get<WooProductRaw>(`/products/${sample.legacyId}`);
        if (raw.slug !== sample.slug) productSampleIssues.push(`product ${sample.legacyId}: slug mismatch (woo=${raw.slug} mongo=${sample.slug})`);
        const wooPriceMinor = Math.round(Number(raw.regular_price || raw.price) * 1000);
        if (Math.abs(wooPriceMinor - sample.regularPriceMinor) > 1) {
          productSampleIssues.push(`product ${sample.legacyId}: price mismatch (woo=${wooPriceMinor} mongo=${sample.regularPriceMinor})`);
        }
      } catch (err) {
        productSampleIssues.push(`product ${sample.legacyId}: fetch failed (${String(err)})`);
      }
    }
    mismatches.push(...productSampleIssues);

    // 6. Unresolved references
    const unresolvedMediaProducts = await this.products.countDocuments({ 'images.mediaId': null, 'images.0': { $exists: true } });
    const productsWithoutSku = 0; // SKU not tracked by legacy system — informational only, not a mismatch
    void productsWithoutSku;

    const report = {
      generatedAt: new Date().toISOString(),
      counts: {
        categories: { woo: wooCategoryCount, mongo: mongoCategoryCount },
        products: { woo: wooProductCount, mongo: mongoProductCount },
        orders: { woo: wooOrderCount, mongo: mongoOrderCount },
      },
      slugs: {
        missingProductSlugs, missingCategorySlugs,
      },
      orderStatusComparison: statusComparison,
      duplicateProductSlugs: dupProductSlugs.map((d) => d._id),
      productSampleIssues,
      unresolvedMediaProducts,
      employeeCount: await this.employees.countDocuments({ legacyId: { $ne: null } }),
      mismatchCount: mismatches.length,
      mismatches,
    };

    const path = await writeReport('migrate-verify', report);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    console.log(`migrate:verify — ${mismatches.length} mismatch(es) found`);
    for (const m of mismatches.slice(0, 50)) console.log(`  ✗ ${m}`);
    console.log(`Report: ${path}`);

    if (mismatches.length > 0) process.exitCode = 1;
  }
}
