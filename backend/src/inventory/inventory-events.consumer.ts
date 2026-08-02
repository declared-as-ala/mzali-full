import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type Redis from 'ioredis';
import { Model } from 'mongoose';
import { Product } from '@/catalog/product.schema';
import { Variant } from '@/catalog/variant.schema';
import { REDIS } from '@/redis/redis.constants';
import { INVENTORY_UPDATED_CHANNEL, InventoryUpdatedEvent } from './inventory-events';
import { OnlineAvailabilityService } from './online-availability.service';

const LAST_KNOWN_KEY_PREFIX = 'inv:online-avail:';

/**
 * Worker-only subscriber: on any stock movement, recomputes the affected
 * variant's online availability and — only when it crosses the sold-out
 * boundary (available <-> unavailable) — tells the storefront to
 * revalidate the affected pages. Never revalidates on every movement (that
 * would hammer Next.js under normal POS sale volume, which mostly moves
 * BOUTIQUE stock that doesn't even affect online availability under
 * DEPOT_ONLY policy). See SPRINT-04-online-reservations-sync.md.
 */
@Injectable()
export class InventoryEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryEventsConsumer.name);
  private subscriber?: Redis;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly availability: OnlineAvailabilityService,
    @InjectModel(Variant.name) private readonly variants: Model<Variant>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe(INVENTORY_UPDATED_CHANNEL);
    this.subscriber.on('message', (_channel: string, message: string) => {
      this.handle(message).catch((err) => this.logger.warn(`Failed to process inventory.updated: ${String(err)}`));
    });
    this.logger.log(`Subscribed to ${INVENTORY_UPDATED_CHANNEL}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber && this.subscriber.status !== 'end') await this.subscriber.quit();
  }

  private async handle(raw: string): Promise<void> {
    let event: InventoryUpdatedEvent;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    const nowAvailable = (await this.availability.resolve(event.variantId)) > 0;
    const key = `${LAST_KNOWN_KEY_PREFIX}${event.variantId}`;
    const previousRaw = await this.redis.getset(key, nowAvailable ? '1' : '0');
    // No prior known state (cold start / first sighting) — nothing to
    // compare a "crossing" against, so don't guess.
    if (previousRaw === null) return;
    if ((previousRaw === '1') === nowAvailable) return;

    const variant = await this.variants.findById(event.variantId).catch(() => null);
    if (!variant) return;
    const product = await this.products
      .findOne({ _id: variant.productId, deletedAt: null })
      .select({ slug: 1, categorySlugs: 1 })
      .catch(() => null);
    if (!product) return;

    const paths = [`/produit/${product.slug}`, '/shop', ...product.categorySlugs.map((slug) => `/categorie/${slug}`)];
    await this.notifyStorefront(paths);
  }

  private async notifyStorefront(paths: string[]): Promise<void> {
    const base = this.config.get<string>('STOREFRONT_URL');
    const token = this.config.get<string>('SERVICE_TOKEN');
    try {
      const res = await fetch(`${base}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Service-Token': token ?? '' },
        body: JSON.stringify({ paths }),
      });
      if (!res.ok) this.logger.warn(`Revalidation request failed (${res.status}) for ${paths.join(', ')}`);
    } catch (err) {
      this.logger.warn(`Failed to notify storefront revalidation: ${String(err)}`);
    }
  }
}
