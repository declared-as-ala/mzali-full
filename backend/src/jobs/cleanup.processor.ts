import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model } from 'mongoose';
import { DeliveryCarrierName, Order, OrderDocument } from '@/orders/order.schema';
import { DRAFT_STATUS } from '@/orders/order-status';
import { LowStockCheckService } from '@/inventory/alerts/low-stock-check.service';
import { AxessService } from '@/shipping/axess.service';
import { checkDeliveredStatus } from '@/shipping/delivery-status';
import { FirstDeliveryService } from '@/shipping/first-delivery.service';
import { NavexService } from '@/shipping/navex.service';
import { QUEUES } from './queues';

const DEFAULT_DRAFT_MAX_AGE_DAYS = 14;

/** Bound per run — "tens of thousands of orders" means this must never
 *  try to sync everything in one pass; the 20-minute repeat cadence
 *  (see cleanup.module.ts) works through the backlog gradually,
 *  oldest-checked-first. */
const DELIVERY_SYNC_BATCH_SIZE = 150;
/** An order still not delivered after 45 days is an edge case worth an
 *  admin's manual attention, not indefinite automated polling against
 *  carrier API quota. */
const DELIVERY_SYNC_MAX_AGE_DAYS = 45;
const CARRIER_NAMES: readonly DeliveryCarrierName[] = ['navex', 'firstdelivery', 'axess'];

/**
 * Shares the CLEANUP queue rather than getting its own — this is a
 * periodic maintenance job like the draft purge, not a fundamentally
 * different kind of work (deliberate scope decision D6: 4 queues only).
 */
export type CleanupJob =
  | { task: 'purge-drafts'; maxAgeDays?: number }
  | { task: 'check-low-stock' }
  | { task: 'sync-delivery-status' };

@Processor(QUEUES.CLEANUP)
export class CleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(CleanupProcessor.name);

  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    private readonly lowStockCheck: LowStockCheckService,
    private readonly navex: NavexService,
    private readonly firstDelivery: FirstDeliveryService,
    private readonly axess: AxessService,
  ) {
    super();
  }

  async process(job: Job<CleanupJob>): Promise<void> {
    if (job.data.task === 'purge-drafts') {
      const maxAgeDays = job.data.maxAgeDays ?? DEFAULT_DRAFT_MAX_AGE_DAYS;
      const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
      const result = await this.orders.deleteMany({ status: DRAFT_STATUS, createdAt: { $lt: cutoff } });
      this.logger.log(`Purged ${result.deletedCount} checkout-draft orders older than ${maxAgeDays}d`);
    } else if (job.data.task === 'check-low-stock') {
      await this.lowStockCheck.run();
    } else if (job.data.task === 'sync-delivery-status') {
      await this.syncDeliveryStatus();
    }
  }

  /** Picks which carrier a pushed-but-not-yet-delivered order should be
   *  polled on — in practice an order is pushed to exactly one carrier,
   *  so "first one with a successful push + tracking number" is correct
   *  for the overwhelming majority; a retried order pushed to a second
   *  carrier after the first failed is handled the same way (the failed
   *  one never has `status:'sent'`). */
  private activeCarrierFor(order: OrderDocument): { carrier: DeliveryCarrierName; tracking: string } | null {
    for (const name of CARRIER_NAMES) {
      const result = order.carrier[name];
      if (result?.status === 'sent' && result.tracking) return { carrier: name, tracking: result.tracking };
    }
    return null;
  }

  private serviceFor(carrier: DeliveryCarrierName): NavexService | FirstDeliveryService | AxessService {
    if (carrier === 'navex') return this.navex;
    if (carrier === 'firstdelivery') return this.firstDelivery;
    return this.axess;
  }

  /**
   * Polls each carrier's real status endpoint for orders that were
   * successfully pushed but not yet confirmed delivered — this is the
   * ONLY source that ever sets `delivery.status`/`deliveredAt` (see
   * order.schema.ts's OrderDelivery doc). Never triggered by an admin
   * status change; the delivery-revenue page's numbers only move when
   * this job (or the manual override, see delivery-revenue module)
   * confirms a real delivery.
   */
  async syncDeliveryStatus(): Promise<void> {
    const cutoff = new Date(Date.now() - DELIVERY_SYNC_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    const candidates = await this.orders
      .find({
        'delivery.status': { $ne: 'DELIVERED' },
        createdAt: { $gte: cutoff },
        $or: CARRIER_NAMES.map((name) => ({ [`carrier.${name}.status`]: 'sent', [`carrier.${name}.tracking`]: { $ne: null } })),
      })
      .sort({ 'delivery.lastCheckedAt': 1 })
      .limit(DELIVERY_SYNC_BATCH_SIZE);

    let checked = 0;
    let delivered = 0;
    for (const order of candidates) {
      const active = this.activeCarrierFor(order);
      if (!active) continue;
      checked++;
      const now = new Date();
      try {
        const result = await this.serviceFor(active.carrier).getState(active.tracking);
        if (!result.ok) {
          await this.orders.updateOne({ _id: order._id }, { $set: { 'delivery.lastCheckedAt': now } });
          continue;
        }
        const { delivered: isDelivered, rawText } = checkDeliveredStatus(result.raw);
        if (isDelivered) {
          // Write-once at the query level too — a delivered event seen
          // twice (this run or a future one) can never re-trigger this
          // branch for the same order once the first write lands.
          const res = await this.orders.updateOne(
            { _id: order._id, 'delivery.status': { $ne: 'DELIVERED' } },
            { $set: { 'delivery.status': 'DELIVERED', 'delivery.deliveredAt': now, 'delivery.provider': active.carrier, 'delivery.rawStatus': rawText, 'delivery.lastCheckedAt': now } },
          );
          if (res.modifiedCount > 0) delivered++;
        } else {
          await this.orders.updateOne({ _id: order._id }, { $set: { 'delivery.rawStatus': rawText, 'delivery.lastCheckedAt': now } });
        }
      } catch (err) {
        this.logger.warn(`Delivery-status sync failed for order ${order.id} (${active.carrier}): ${String(err)}`);
        await this.orders.updateOne({ _id: order._id }, { $set: { 'delivery.lastCheckedAt': now } });
      }
    }
    if (checked > 0) this.logger.log(`Delivery-status sync: checked ${checked}, newly delivered ${delivered}`);
  }
}
