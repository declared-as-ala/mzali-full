import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import { Subject } from 'rxjs';
import { INVENTORY_UPDATED_CHANNEL, InventoryUpdatedEvent } from '@/inventory/inventory-events';
import { REDIS } from '@/redis/redis.constants';

/**
 * Fans out the shared `inventory.updated` Redis channel to every connected
 * POS SSE client via one RxJS Subject — a single dedicated Redis
 * subscriber connection regardless of how many tills are watching, not one
 * per connection. See SPRINT-04 "Admin/POS live badge updates".
 */
@Injectable()
export class PosEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PosEventsService.name);
  private subscriber?: Redis;
  private readonly subject = new Subject<InventoryUpdatedEvent>();

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleInit(): Promise<void> {
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe(INVENTORY_UPDATED_CHANNEL);
    this.subscriber.on('message', (_channel: string, message: string) => {
      try {
        this.subject.next(JSON.parse(message));
      } catch {
        // ignore malformed payloads — never crash the fan-out for one bad message
      }
    });
    this.logger.log(`Subscribed to ${INVENTORY_UPDATED_CHANNEL} for POS SSE fan-out`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber && this.subscriber.status !== 'end') await this.subscriber.quit();
    this.subject.complete();
  }

  stream() {
    return this.subject.asObservable();
  }
}
