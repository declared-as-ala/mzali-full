import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from '@/orders/order.schema';
import { Product } from '@/catalog/product.schema';
import { checksumOf } from '../checksum';
import { mapWooOrder } from '../mappers/map-order';
import { LegacyMappingService } from '../legacy-mapping.service';
import { writeReport } from '../report-writer';
import { WooOrderRaw } from '../woo-types';
import { WooClientService } from '../woo-client.service';

type Options = { dryRun?: boolean; since?: string; limit?: number };

@Command({ name: 'migrate:orders', description: 'Import full WooCommerce order history into MongoDB' })
export class MigrateOrdersCommand extends CommandRunner {
  constructor(
    private readonly woo: WooClientService,
    private readonly mappings: LegacyMappingService,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
  ) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, write zero data' })
  parseDryRun(): boolean {
    return true;
  }
  @Option({ flags: '--since <iso>', description: 'Only orders modified since this ISO timestamp' })
  parseSince(val: string): string {
    return val;
  }
  @Option({ flags: '--limit <n>', description: 'Stop after this many source records' })
  parseLimit(val: string): number {
    return Number(val);
  }

  async run(_params: string[], options: Options): Promise<void> {
    const report = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      unresolvedProducts: [] as { orderId: string; legacyProductId: string }[],
      errors: [] as { legacyId: string; error: string }[],
    };
    let count = 0;

    // Woo's `status: 'any'` includes trash — we want the full history.
    for await (const page of this.woo.paginate<WooOrderRaw>('/orders', { status: 'any', modified_after: options.since })) {
      for (const raw of page) {
        if (options.limit && count >= options.limit) break;
        count += 1;
        const mapped = mapWooOrder(raw);
        // Checksum the mapped output, not the raw Woo blob (see migrate-products
        // for why: volatile unrelated fields would defeat idempotency).
        const checksum = checksumOf(mapped);
        try {
          const resolution = await this.mappings.resolve('woocommerce', 'order', mapped.legacyId, checksum);
          if (resolution.action === 'skip') {
            report.skipped += 1;
            continue;
          }
          if (options.dryRun) {
            if (resolution.existingNewId) report.updated += 1;
            else report.created += 1;
            continue;
          }

          const employeeNewId = mapped.employeeLegacyId
            ? await this.mappings.getNewId('file', 'employee', mapped.employeeLegacyId)
            : null;

          const items = await Promise.all(
            mapped.items.map(async (i) => {
              const productNewId = await this.mappings.getNewId('woocommerce', 'product', i.legacyProductId);
              let slug = '';
              if (productNewId) {
                const p = await this.products.findById(productNewId).select({ slug: 1 });
                slug = p?.slug ?? '';
              } else {
                report.unresolvedProducts.push({ orderId: mapped.legacyId, legacyProductId: i.legacyProductId });
              }
              return {
                productId: productNewId ?? i.legacyProductId, // snapshot-only fallback when unresolved
                legacyProductId: i.legacyProductId,
                name: i.name,
                slug,
                imageUrl: i.imageUrl,
                qty: i.qty,
                unitPriceMinor: i.unitPriceMinor,
                totalMinor: i.totalMinor,
                variation: i.variation,
                bundleName: i.bundleName,
                bundleSlot: null,
                costMinor: 0,
              };
            }),
          );

          const orderNumber = raw.id; // Woo ids are unique integers — reuse directly.
          const doc = await this.orders.findOneAndUpdate(
            { legacyId: mapped.legacyId },
            {
              $set: {
                orderNumber,
                status: mapped.status,
                statusHistory: [
                  {
                    from: null,
                    to: mapped.status,
                    by: { type: 'migration', id: null, name: 'migrate:orders' },
                    at: mapped.createdAt,
                    note: null,
                  },
                ],
                customer: mapped.customer,
                customerId: null, // resolved by migrate:customers
                items,
                subtotalMinor: items.reduce((s, i) => s + i.totalMinor, 0),
                shippingMinor: mapped.shippingMinor,
                discountMinor: 0,
                totalMinor: mapped.totalMinor,
                manualSubtotalMinor: mapped.manualSubtotalMinor,
                manualTotalMinor: mapped.manualTotalMinor,
                currency: mapped.currency,
                coupon: null,
                deliveryCompany: mapped.deliveryCompany,
                carrier: mapped.carrier,
                assignment: {
                  employeeId: employeeNewId,
                  assignedAt: mapped.assignedAt ? new Date(mapped.assignedAt) : null,
                  assignedBy: mapped.assignedBy,
                  history: mapped.assignmentHistory.map((h) => ({ ...h, at: new Date(h.at) })),
                },
                privateNote: mapped.privateNote,
                exchange: mapped.exchange,
                attempts: mapped.attempts,
                source: mapped.source,
                paymentMethod: 'cod',
                updatedAt: new Date(),
              },
              $setOnInsert: { createdAt: mapped.createdAt },
            },
            // timestamps:false — the schema's auto-managed updatedAt would otherwise also
            // silently reset createdAt to wall-clock time on upsert, clobbering the real
            // WooCommerce order date with the migration run time.
            { upsert: true, new: true, setDefaultsOnInsert: true, timestamps: false },
          );
          if (resolution.existingNewId) report.updated += 1;
          else report.created += 1;
          await this.mappings.recordMigrated('woocommerce', 'order', mapped.legacyId, doc.id, checksum);
        } catch (err) {
          report.failed += 1;
          const message = err instanceof Error ? err.message : String(err);
          report.errors.push({ legacyId: mapped.legacyId, error: message });
          await this.mappings.recordFailed('woocommerce', 'order', mapped.legacyId, checksum, message);
        }
      }
      if (options.limit && count >= options.limit) break;
    }

    const path = await writeReport('migrate-orders', { options, report });
    console.log(
      `migrate:orders — created=${report.created} updated=${report.updated} skipped=${report.skipped} failed=${report.failed} unresolvedProducts=${report.unresolvedProducts.length}`,
    );
    console.log(`Report: ${path}`);
  }
}
