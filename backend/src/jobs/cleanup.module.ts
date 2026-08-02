import { Module, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Product, ProductSchema } from '@/catalog/product.schema';
import { Variant, VariantSchema } from '@/catalog/variant.schema';
import { Alert, AlertSchema } from '@/inventory/alerts/alert.schema';
import { LowStockCheckService } from '@/inventory/alerts/low-stock-check.service';
import { InventoryCoreModule } from '@/inventory/inventory-core.module';
import { Order, OrderSchema } from '@/orders/order.schema';
import { CleanupProcessor } from './cleanup.processor';
import { QUEUES } from './queues';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Alert.name, schema: AlertSchema },
      { name: Variant.name, schema: VariantSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    InventoryCoreModule,
  ],
  providers: [CleanupProcessor, LowStockCheckService],
})
export class CleanupModule implements OnModuleInit {
  constructor(@InjectQueue(QUEUES.CLEANUP) private readonly queue: Queue) {}

  /** Schedules all repeatable jobs (idempotent — same jobId replaces itself). */
  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'purge-drafts',
      { task: 'purge-drafts' },
      { jobId: 'purge-drafts-nightly', repeat: { pattern: '0 3 * * *' } },
    );
    await this.queue.add(
      'check-low-stock',
      { task: 'check-low-stock' },
      { jobId: 'check-low-stock-hourly', repeat: { pattern: '0 * * * *' } },
    );
    // Loyalty tiers were removed — drop the previously-scheduled repeatable
    // job so it doesn't keep firing forever from Redis's stored schedule.
    await this.queue.removeRepeatable('evaluate-tiers', { pattern: '0 4 * * *' }, 'evaluate-tiers-nightly');
  }
}
