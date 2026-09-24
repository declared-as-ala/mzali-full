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

/** Bound per run — this must never try to sync the whole eligible pool
 *  in one pass; the 20-minute repeat cadence (see cleanup.module.ts)
 *  works through it gradually. At the base ~2 req/s pace, 600 orders
 *  takes ~5 minutes — comfortably inside the 20-minute window. */
const DELIVERY_SYNC_BATCH_SIZE = 600;
/** Scoped to the last month, per explicit request — the revenue page is
 *  only used for recent periods, and this also fixes the backlog
 *  problem directly: excluding anything older than 31 days shrinks the
 *  candidate pool from tens of thousands down to whatever was actually
 *  created in the last month, so the sync catches up in hours instead
 *  of days and stays caught up going forward. An order still not
 *  delivered after 31 days is an edge case worth an admin's manual
 *  attention, not indefinite automated polling against carrier API quota. */
const DELIVERY_SYNC_MAX_AGE_DAYS = 31;
/** Confirmed live against First Delivery's real API: firing requests
 *  back-to-back with no delay triggers `429 Too many requests` almost
 *  immediately, silently wasting most of a batch (a 429 counts as a
 *  failed check, same as any other non-ok response — see the `!result.ok`
 *  branch below). A fixed ~2 req/s pace per carrier stays well under
 *  that — PER CARRIER, not globally, so interleaved orders across the 3
 *  carriers don't needlessly throttle each other (see the `pacing` map
 *  in syncDeliveryStatus). */
const DELIVERY_SYNC_DELAY_MS = 500;
/** Extra cooldown applied to a specific carrier once IT reports a rate
 *  limit — confirmed live: a 429 doesn't mean "try again in 500ms", it
 *  means back off meaningfully before hitting that carrier again. */
const RATE_LIMIT_BACKOFF_MS = 5000;
const CARRIER_NAMES: readonly DeliveryCarrierName[] = ['navex', 'firstdelivery', 'axess'];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Detects a rate-limit response from whatever `getState()` put in
 *  `result.error` (each carrier service surfaces the HTTP status and/or
 *  the carrier's own error message there — see e.g. First Delivery's
 *  real `429 { message: "Too many requests, please try again later." }`
 *  response, captured live). */
function isRateLimitError(error: string | undefined): boolean {
  if (!error) return false;
  const norm = error.toLowerCase();
  return norm.includes('429') || norm.includes('too many request') || norm.includes('rate limit');
}

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
      // Never-checked orders (lastCheckedAt: null) all sort first as a
      // group either way — the secondary `createdAt: -1` breaks the tie
      // among them in favor of the MOST RECENT ones, so a fresh order
      // gets its first check well before a 40-day-old one does (recent
      // orders are both more likely to be actively in transit and more
      // relevant to what an admin is actually looking at on the revenue
      // page). Once an order has a real lastCheckedAt, it naturally sinks
      // behind the remaining never-checked ones for future runs.
      .sort({ 'delivery.lastCheckedAt': 1, createdAt: -1 })
      .limit(DELIVERY_SYNC_BATCH_SIZE);

    // Epoch-ms "don't call this carrier again before this instant" —
    // per carrier, not a single global clock, so e.g. a Navex cooldown
    // never delays a First Delivery call that's next in line.
    const nextAllowedAt: Record<DeliveryCarrierName, number> = { navex: 0, firstdelivery: 0, axess: 0 };
    let checked = 0;
    let delivered = 0;
    let failed = 0;
    const failureReasons = new Map<string, number>();
    const recordFailure = (reason: string) => failureReasons.set(reason, (failureReasons.get(reason) ?? 0) + 1);

    for (const order of candidates) {
      const active = this.activeCarrierFor(order);
      if (!active) continue;

      const waitMs = nextAllowedAt[active.carrier] - Date.now();
      if (waitMs > 0) await sleep(waitMs);

      checked++;
      const now = new Date();
      try {
        const result = await this.serviceFor(active.carrier).getState(active.tracking);
        const rateLimited = isRateLimitError(result.error);
        nextAllowedAt[active.carrier] = Date.now() + (rateLimited ? RATE_LIMIT_BACKOFF_MS : DELIVERY_SYNC_DELAY_MS);
        if (!result.ok) {
          failed++;
          recordFailure(result.error ?? 'unknown error');
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
        nextAllowedAt[active.carrier] = Date.now() + DELIVERY_SYNC_DELAY_MS;
        failed++;
        const reason = String(err);
        recordFailure(reason);
        this.logger.warn(`Delivery-status sync failed for order ${order.id} (${active.carrier}): ${reason}`);
        await this.orders.updateOne({ _id: order._id }, { $set: { 'delivery.lastCheckedAt': now } });
      }
    }
    if (checked > 0) {
      const reasons = [...failureReasons.entries()].map(([reason, count]) => `${reason} x${count}`).join('; ');
      this.logger.log(`Delivery-status sync: checked ${checked} (${failed} failed${reasons ? ` — ${reasons}` : ''}), newly delivered ${delivered}`);
    }
  }
}
