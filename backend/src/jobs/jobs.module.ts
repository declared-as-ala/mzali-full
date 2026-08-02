import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUES } from './queues';

const queueModules = Object.values(QUEUES).map((name) => BullModule.registerQueue({ name }));

/**
 * BullMQ wiring shared by the API (producers) and the worker (processors).
 * Defaults: retry with exponential backoff, keep failed jobs for inspection.
 * Re-exports each per-queue dynamic module so `@InjectQueue(name)` works in
 * any module application-wide without re-registering the queue.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>('REDIS_URL') },
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: { age: 24 * 3600, count: 1000 },
          removeOnFail: false,
        },
      }),
    }),
    ...queueModules,
  ],
  exports: [BullModule, ...queueModules],
})
export class JobsModule {}
