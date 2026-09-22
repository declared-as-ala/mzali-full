import { randomUUID } from 'node:crypto';
import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectModel } from '@nestjs/mongoose';
import { AnyBulkWriteOperation, Model } from 'mongoose';
import { SettingsService } from '@/settings/settings.service';
import { computeVariationKey } from '@/orders/order-variation-key';
import { Order } from '@/orders/order.schema';

type Options = { dryRun?: boolean; force?: boolean };

const BATCH_SIZE = 500;

/** Persisted completion marker key (settings collection — same generic
 *  getRaw/setRaw store the round-robin pointer already uses for internal
 *  operational state). Lets this command be invoked unconditionally on
 *  every deploy (see deploy/scripts/deploy.sh) while only ever doing real
 *  work once: after the first successful non-dry-run pass it records
 *  completedAt here and every later invocation short-circuits instantly
 *  instead of re-scanning the whole orders collection. */
const COMPLETION_KEY = 'migration:order-variation-keys';

/**
 * One-off backfill for two fields added to `items[]` after this
 * collection already had tens of thousands of orders in it, neither of
 * which Mongoose can retroactively populate on its own (schema
 * `default`s and the `pre('save')` hook only apply to newly-constructed
 * or actually-saved documents, never to existing data merely read back):
 *
 *  - `itemId` — stable per-item identity (order.schema.ts), needed so the
 *    redesigned Order Drawer can target an exact line instead of array
 *    position.
 *  - `variationKey` — normalized size/color snapshot key
 *    (order-variation-key.ts), needed for the product+variant Orders
 *    filter to match legacy items that have no `variantId`.
 *
 * Read-then-write per order (not a pure server-side aggregation-pipeline
 * update) is deliberate for `variationKey`: the normalization it relies
 * on (dynamic size/color key-name regexes, NFC + French-locale
 * lowercasing) is not expressible in MongoDB's update-pipeline operators,
 * and must stay the exact same function the filter itself uses — see
 * order-variation-key.ts's module doc for why "one normalization
 * definition, not two that could drift apart" matters here.
 *
 * Idempotent: an order whose items already carry a correct `variationKey`
 * AND a non-empty `itemId` is skipped entirely (not included in the bulk
 * write), so a re-run only touches what genuinely changed (e.g. after a
 * code change to the normalization rules, or an order that somehow still
 * lacks an itemId). A once-assigned `itemId` is NEVER regenerated on a
 * re-run — only assigned when missing — so it stays stable across
 * repeated migration runs. Never touches any field other than
 * `items[].variationKey` / `items[].itemId`.
 */
@Command({ name: 'migrate:order-variation-keys', description: 'Backfill items[].itemId and items[].variationKey on existing orders (runs once — safe to invoke on every deploy)' })
export class MigrateOrderVariationKeysCommand extends CommandRunner {
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, write zero data' })
  parseDryRun(): boolean {
    return true;
  }

  @Option({ flags: '--force', description: 'Re-run even if already marked complete (e.g. after a normalization rule change)' })
  parseForce(): boolean {
    return true;
  }

  async run(_params: string[], options: Options): Promise<void> {
    // Dry-run always runs fresh (it's read-only and useful for inspection
    // regardless of completion state) — only a real run consults/sets the
    // marker, so "already done" is a statement about actual writes.
    if (!options.dryRun && !options.force) {
      const marker = await this.settings.getRaw(COMPLETION_KEY);
      if (marker?.completedAt) {
        console.log(`migrate:order-variation-keys — already completed at ${marker.completedAt} (orders_updated=${marker.ordersUpdated ?? '?'}). Skipping. Pass --force to re-run anyway.`);
        return;
      }
    }

    const cursor = this.orders.find({}, { items: 1, orderNumber: 1 }).lean().cursor();

    let scanned = 0;
    let ordersUpdated = 0;
    let variationKeysChanged = 0;
    let itemIdsAssigned = 0;
    let batch: AnyBulkWriteOperation<Order>[] = [];

    const flush = async () => {
      if (batch.length === 0) return;
      if (!options.dryRun) await this.orders.bulkWrite(batch, { ordered: false });
      batch = [];
    };

    for await (const doc of cursor) {
      scanned += 1;
      let changed = false;
      const nextItems = doc.items.map((item) => {
        const key = computeVariationKey(item.variation);
        if (key !== (item.variationKey ?? null)) {
          changed = true;
          variationKeysChanged += 1;
        }
        let itemId = item.itemId;
        if (!itemId) {
          itemId = randomUUID();
          changed = true;
          itemIdsAssigned += 1;
        }
        return { ...item, itemId, variationKey: key };
      });

      if (changed) {
        ordersUpdated += 1;
        batch.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { items: nextItems } },
          },
        });
        if (batch.length >= BATCH_SIZE) await flush();
      }
    }
    await flush();

    console.log(
      `migrate:order-variation-keys — scanned=${scanned} orders_updated=${ordersUpdated} ` +
        `variation_keys_changed=${variationKeysChanged} item_ids_assigned=${itemIdsAssigned}` +
        `${options.dryRun ? ' (dry-run, no writes)' : ''}`,
    );

    if (!options.dryRun) {
      await this.settings.setRaw(COMPLETION_KEY, {
        completedAt: new Date().toISOString(),
        scanned,
        ordersUpdated,
        variationKeysChanged,
        itemIdsAssigned,
      });
    }
  }
}
