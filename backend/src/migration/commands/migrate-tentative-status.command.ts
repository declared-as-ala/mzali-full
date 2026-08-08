import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { attemptStatus, LEGACY_TENTATIVE_STATUS, MIN_ATTEMPT } from '@/orders/order-status';
import { Order } from '@/orders/order.schema';

type Options = { dryRun?: boolean };

/**
 * One-off migration for the flat 'tentative' status → explicit
 * tentative-1..tentative-5 (see order-status.ts for why: the old status
 * carried no attempt number of its own, and the separate `attempts` counter
 * field it relied on defaulted to 0 and was never guaranteed to be kept in
 * sync — which is exactly how orders ended up displaying "Tentative 0").
 *
 * Never deletes orders. Maps each order's existing `attempts` value,
 * clamped into [MIN_ATTEMPT, MAX_ATTEMPT] (0/unset → tentative-1, since
 * "zero attempts logged" is the same starting point as "first attempt").
 * A statusHistory entry is appended for the migration itself so the change
 * is auditable, not a silent overwrite. Idempotent — once no document has
 * status:'tentative' left, a re-run finds nothing to do.
 */
@Command({ name: 'migrate:tentative-status', description: "Convert flat status:'tentative' orders to explicit tentative-1..5" })
export class MigrateTentativeStatusCommand extends CommandRunner {
  constructor(@InjectModel(Order.name) private readonly orders: Model<Order>) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, write zero data' })
  parseDryRun(): boolean {
    return true;
  }

  async run(_params: string[], options: Options): Promise<void> {
    const docs = await this.orders.find({ status: LEGACY_TENTATIVE_STATUS });
    let converted = 0;
    for (const doc of docs) {
      const attempts = Number.isFinite(doc.attempts) && doc.attempts > 0 ? doc.attempts : MIN_ATTEMPT;
      const nextStatus = attemptStatus(attempts);
      console.log(`${options.dryRun ? '[dry-run] ' : ''}order #${doc.orderNumber} (${doc.id}): tentative (attempts=${doc.attempts}) -> ${nextStatus}`);
      if (!options.dryRun) {
        doc.statusHistory.push({
          from: LEGACY_TENTATIVE_STATUS,
          to: nextStatus,
          by: { type: 'system', id: null, name: 'migrate:tentative-status' },
          at: new Date(),
          note: 'Migration automatique du statut "tentative" (obsolète) vers un numéro de tentative explicite.',
        } as Order['statusHistory'][number]);
        doc.status = nextStatus;
        doc.attempts = attempts;
        await doc.save();
      }
      converted += 1;
    }
    console.log(`migrate:tentative-status — found=${docs.length} converted=${converted}${options.dryRun ? ' (dry-run)' : ''}`);
  }
}
