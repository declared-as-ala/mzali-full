import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
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
  migration?: boolean;
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
    if (!input.session) {
      const session = await this.items.db.startSession();
      try { return (await session.withTransaction(() => this.applyMovement({ ...input, session })))!; }
      finally { await session.endSession(); }
    }
    if (input.locationId.toUpperCase() === 'BOUTIQUE' && !input.migration && this.items.db.models.Variant) {
      const source = await this.items.db.models.Variant.findById(input.variantId).session(input.session ?? null);
      if (!source) throw new ConflictException('Produit de stock introuvable');
      // Only consolidate into the pool when boutiqueTrackingMode is SIMPLE (default).
      // For VARIANT Boutique, each variant has its own StockItem at BOUTIQUE.
      const productModel = this.items.db.models.Product;
      const boutiqueMode = productModel
        ? ((await productModel.findById(source.productId).select('boutiqueTrackingMode').session(input.session ?? null)) as { boutiqueTrackingMode?: string } | null)?.boutiqueTrackingMode ?? 'SIMPLE'
        : 'SIMPLE';
      if (boutiqueMode !== 'VARIANT') {
        const pool = await this.consolidateBoutique(source.productId, input.actor, input.session!);
        input = { ...input, variantId: pool.id };
      }
      // else: BOUTIQUE VARIANT — write to the exact variant's StockItem directly.
    }
    const onHandDelta = input.onHandDelta ?? 0;
    const reservedDelta = input.reservedDelta ?? 0;
    const locationId = input.locationId.toUpperCase();

    if (![onHandDelta, reservedDelta].every(Number.isSafeInteger)) throw new BadRequestException('Quantité entière requise');
    const variantModel = this.items.db.models.Variant;
    const variant = variantModel ? await variantModel.findOneAndUpdate(
      { _id: input.variantId, ...(input.migration ? {} : { retired: { $ne: true } }), ...(['pos_sale', 'order_commit'].includes(input.type) && onHandDelta < 0 ? { active: true } : {}) },
      { $inc: { inventoryRevision: 1 } }, { new: true, session: input.session },
    ) : null;
    if (variantModel && !variant) throw new ConflictException('Variante historique ou introuvable : réconciliation requise.');
    if (variant?.boutiquePool && locationId !== 'BOUTIQUE') throw new BadRequestException('Le stock produit Boutique ne peut pas être utilisé au Dépôt.');
    const before = await this.items.findOne({ variantId: input.variantId, locationId }).session(input.session ?? null);
    if ((before?.quantityOnHand ?? 0) + onHandDelta < 0 || (before?.quantityReserved ?? 0) + reservedDelta < 0) throw new InsufficientStockError(input.variantId, locationId);
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

    const [movement] = await this.movements.create(
      [
        {
          variantId: input.variantId,
          productId: variant?.productId ?? null,
          onHandBefore: before?.quantityOnHand ?? 0,
          reservedBefore: before?.quantityReserved ?? 0,
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

  /** Stable product-level identity for Boutique; no stock is changed here. */
  async boutiqueVariant(productId: string, session?: ClientSession) {
    const model = this.items.db.models.Variant;
    try { return await model.findOneAndUpdate({ productId, combinationKey: '__boutique_pool__' }, { $setOnInsert: { productId, combinationKey: '__boutique_pool__', boutiquePool: true, sku: `BOUTIQUE-${productId}`, attributes: {}, active: true, retired: false } }, { upsert: true, new: true, session }); }
    catch (error) {
      // Concurrent catalog requests may create the same unique pool identity.
      if (!session && (error as { code?: number }).code === 11000) return model.findOne({ productId, combinationKey: '__boutique_pool__' }).orFail();
      throw error;
    }
  }

  async boutiqueBalance(productId: string, session?: ClientSession) {
    const variants = await this.items.db.models.Variant.find({ productId }).select('_id').session(session ?? null);
    const stocks = await this.items.find({ variantId: { $in: variants.map(v => v.id) }, locationId: 'BOUTIQUE' }).session(session ?? null);
    return stocks.reduce((sum, item) => ({ onHand: sum.onHand + item.quantityOnHand, reserved: sum.reserved + item.quantityReserved }), { onHand: 0, reserved: 0 });
  }

  /** Move historical per-variant balances into the product pool within the caller's transaction. */
  async consolidateBoutique(productId: string, actor: AuditActor, session: ClientSession) {
    const pool = await this.boutiqueVariant(productId, session);
    const variants = await this.items.db.models.Variant.find({ productId, _id: { $ne: pool._id } }).select('_id').session(session);
    const stocks = await this.items.find({ variantId: { $in: variants.map(v => v.id) }, locationId: 'BOUTIQUE' }).session(session);
    for (const item of stocks) {
      if (!item.quantityOnHand && !item.quantityReserved) continue;
      const common = { locationId: 'BOUTIQUE', type: 'correction' as const, reason: 'Regroupement du stock Boutique par produit', actor, session, migration: true };
      await this.applyMovement({ ...common, variantId: item.variantId, onHandDelta: -item.quantityOnHand, reservedDelta: -item.quantityReserved });
      await this.applyMovement({ ...common, variantId: pool.id, onHandDelta: item.quantityOnHand, reservedDelta: item.quantityReserved });
    }
    return pool;
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

  async stockAt(variantId: string, locationId: string, session?: ClientSession): Promise<StockItemDocument | null> {
    return await this.items.findOne({ variantId, locationId: locationId.toUpperCase() }).session(session ?? null) as StockItemDocument | null;
  }
}
