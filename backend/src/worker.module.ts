import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { AuditModule } from './audit/audit.module';
import { JobsModule } from './jobs/jobs.module';
import { CleanupModule } from './jobs/cleanup.module';
import { InventoryEventsWorkerModule } from './inventory/inventory-events-worker.module';
import { ShippingWorkerModule } from './shipping/shipping-worker.module';
import { DocumentsWorkerModule } from './documents/documents-worker.module';

/**
 * Worker composition root — registers BullMQ processors only (no HTTP).
 * carrier-push: auto-push a confirmed/created order to its delivery carrier.
 * cleanup: nightly purge of abandoned checkout-draft orders + hourly
 * low-stock check. media-processing: quote/invoice PDF generation
 * (Sprint 7) — woocommerce-migration processor is CLI-only, added by the
 * migration commands directly, not here.
 */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    AuditModule,
    JobsModule,
    ShippingWorkerModule,
    CleanupModule,
    InventoryEventsWorkerModule,
    DocumentsWorkerModule,
  ],
})
export class WorkerModule {}
