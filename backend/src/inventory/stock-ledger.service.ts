import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type Redis from 'ioredis';
import { ClientSession, Model } from 'mongoose';
import type { AuditActor, StockMovementType } from '@contracts';
import { REDIS } from '@/redis/redis.constants';
import { INVENTORY_UPDATED_CHANNEL, InventoryUpdatedEvent } from './inventory-events';
import { StockItem, StockItemDocument } from './stock-item.schema';
import { StockMovement, StockMovementDocument } from './stock-movement.schema';

/** Thrown when a movement requires more available stock than is on hand. */
export class InsufficientStockError extends Error {
  constructor(public readonly variantId: string, public readonly locationId: string) {
    super(`Stock insuffisant pour ${variantId} @ ${locationId}`);
    this.name = 'InsufficientStockError';
  }
}

export type ApplyMovementInput = {
  variantId: string;
  locationId: string;
  type: StockMovementType;
  /** Signed delta applied to quantityOnHand. Omit/0 if this movement doesn't touch it. */
  onHandDelta?: number;
  /** Signed delta applied to quantityReserved. Omit/0 if this movement doesn't touch it. */
  reservedDelta?: number;
  /**
   * Strict-mode guard: atomically reject (throwing InsufficientStockError)
   * unless `quantityOnHand - quantityReserved >= requireAvailableAtLeast`
   * BEFORE the deltas below are applied. Used by reservation-style
   * movements where overselling must be prevented; omit for movements
   * that should always succeed (POS sales in soft-stock mode, manual
   * adjustments, receipts, etc.).
   */
  requireAvailableAtLeast?: number;
  orderId?: string | null;
  reference?: string | null;
  reason?: string | null;
  actor: AuditActor;
  session?: ClientSession;
};

/**
 * The single write path for every stock mutation, in this codebase or any
 * future one. No other service/controller/script should touch `stock_items`
 * directly — see docs/pos-platform/stock-business-rules.md. Every call
 * both updates the current-state cache (`stock_items`) and appends an
 * immutable row to the historical ledger (`stock_movements`) atomically.
 */
@Injectable()
export class StockLedgerService {
  private readonly logger = new Logger(StockLedgerService.name);

  constructor(
    @InjectModel(StockItem.name) private readonly items: Model<StockItem>,
    @InjectModel(StockMovement.name) private readonly movements: Model<StockMovement>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async applyMovement(input: ApplyMovementInput): Promise<{ item: StockItemDocument; movement: StockMovementDocument }> {
    const onHandDelta = input.onHandDelta ?? 0;
    const reservedDelta = input.reservedDelta ?? 0;
    const locationId = input.locationId.toUpperCase();

    let doc: StockItemDocument | null;
    if (input.requireAvailableAtLeast !== undefined) {
      doc = await this.items.findOneAndUpdate(
        {
          variantId: input.variantId,
          locationId,
          $expr: { $gte: [{ $subtract: ['$quantityOnHand', '$quantityReserved'] }, input.requireAvailableAtLeast] },
        },
        { $inc: { quantityOnHand: onHandDelta, quantityReserved: reservedDelta } },
        { new: true, session: input.session },
      );
      if (!doc) throw new InsufficientStockError(input.variantId, locationId);
    } else {
      doc = await this.items.findOneAndUpdate(
        { variantId: input.variantId, locationId },
        {
          $inc: { quantityOnHand: onHandDelta, quantityReserved: reservedDelta },
          $setOnInsert: { reorderPoint: 0, targetStockLevel: null, lowStockThreshold: null, averageCostMinor: null, lastPurchaseCostMinor: null },
        },
        { new: true, upsert: true, session: input.session },
      );
    }

    // Never let a bookkeeping race (or a soft-mode oversell) drive either
    // counter negative — same defensive clamp the pre-Sprint-1 code used.
    let dirty = false;
    if (doc!.quantityOnHand < 0) { doc!.quantityOnHand = 0; dirty = true; }
    if (doc!.quantityReserved < 0) { doc!.quantityReserved = 0; dirty = true; }
    if (dirty) await doc!.save({ session: input.session });

    const [movement] = await this.movements.create(
      [
        {
          variantId: input.variantId,
          locationId,
          type: input.type,
          qty: onHandDelta !== 0 ? onHandDelta : reservedDelta,
          onHandAfter: doc!.quantityOnHand,
          reservedAfter: doc!.quantityReserved,
          orderId: input.orderId ?? null,
          reference: input.reference ?? null,
          reason: input.reason ?? null,
          actor: input.actor,
        },
      ],
      { session: input.session },
    );

    // Notification only — never consulted for an actual availability
    // decision (the read paths always query stock_items live/fresh). Best
    // effort: a Redis hiccup must never fail a stock movement, and a
    // movement published just before its caller's transaction happens to
    // abort is a harmless spurious refresh downstream, not a correctness bug.
    void this.publishUpdate({
      variantId: input.variantId,
      locationId,
      quantityAvailable: Math.max(0, doc!.quantityOnHand - doc!.quantityReserved),
    });

    return { item: doc!, movement };
  }

  private async publishUpdate(event: InventoryUpdatedEvent): Promise<void> {
    try {
      await this.redis.publish(INVENTORY_UPDATED_CHANNEL, JSON.stringify(event));
    } catch (err) {
      this.logger.warn(`Failed to publish inventory.updated for ${event.variantId}@${event.locationId}: ${String(err)}`);
    }
  }

  async movementsFor(variantId: string, locationId?: string): Promise<StockMovementDocument[]> {
    const filter: Record<string, unknown> = { variantId };
    if (locationId) filter.locationId = locationId.toUpperCase();
    return this.movements.find(filter).sort({ createdAt: -1 });
  }

  async stockFor(variantId: string): Promise<StockItemDocument[]> {
    return this.items.find({ variantId });
  }

  /** Bulk lookup at one location — avoids N+1 queries in list views. */
  async stockForVariants(variantIds: string[], locationId: string): Promise<StockItemDocument[]> {
    if (!variantIds.length) return [];
    return this.items.find({ variantId: { $in: variantIds }, locationId: locationId.toUpperCase() });
  }

  async stockAt(variantId: string, locationId: string): Promise<StockItemDocument | null> {
    return this.items.findOne({ variantId, locationId: locationId.toUpperCase() });
  }
}
