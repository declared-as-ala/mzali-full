import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model } from 'mongoose';
import { Order } from '@/orders/order.schema';
import { DRAFT_STATUS } from '@/orders/order-status';
import { LowStockCheckService } from '@/inventory/alerts/low-stock-check.service';
import { QUEUES } from './queues';

const DEFAULT_DRAFT_MAX_AGE_DAYS = 14;

/**
 * Shares the CLEANUP queue rather than getting its own — this is a
 * periodic maintenance job like the draft purge, not a fundamentally
 * different kind of work (deliberate scope decision D6: 4 queues only).
 */
export type CleanupJob =
  | { task: 'purge-drafts'; maxAgeDays?: number }
  | { task: 'check-low-stock' };

@Processor(QUEUES.CLEANUP)
export class CleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(CleanupProcessor.name);

  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    private readonly lowStockCheck: LowStockCheckService,
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
    }
  }
}
