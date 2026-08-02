import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import type { AuditActor, InventoryItem as InventoryItemContract, StockMovement as StockMovementContract } from '@contracts';
import { clampPagination, paginate } from '@/common/pagination';
import { LocationsService } from '@/catalog/locations.service';
import { Product } from '@/catalog/product.schema';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { PurchaseOrder } from '@/purchase-orders/purchase-order.schema';
import { StockItemDocument } from './stock-item.schema';
import { StockMovementDocument } from './stock-movement.schema';
import { InsufficientStockError, StockLedgerService } from './stock-ledger.service';

export { InsufficientStockError };

export type ReserveResult = { insufficient: boolean };

/**
 * Product-keyed facade over StockLedgerService, preserved so every existing
 * caller (orders.service.ts, inventory-admin.controller.ts) keeps working
 * against `productId` exactly as before — Sprint 1 introduces per-variant,
 * per-location stock underneath without changing this public contract.
 * Every write targets the location flagged `isDefaultOnlineLocation`
 * (resolved + cached via LocationsService, defaults to DEPOT) rather than
 * a hardcoded location code — see docs/pos-platform/stock-business-rules.md.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly ledger: StockLedgerService,
    private readonly variants: ProductVariantsService,
    private readonly locations: LocationsService,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(PurchaseOrder.name) private readonly purchaseOrders: Model<PurchaseOrder>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private static readonly OPEN_PO_STATUSES = ['SUBMITTED', 'CONFIRMED_BY_SUPPLIER', 'PARTIALLY_RECEIVED'];

  async reserve(
    productId: string,
    qty: number,
    orderId: string,
    actor: AuditActor,
    strict: boolean,
    session?: ClientSession,
  ): Promise<ReserveResult> {
    const variantId = await this.resolveVariantId(productId);
    const { item } = await this.ledger.applyMovement({
      variantId,
      locationId: await this.locations.getDefaultOnlineLocationCode(),
      type: 'order_reserve',
      reservedDelta: qty,
      requireAvailableAtLeast: strict ? qty : undefined,
      orderId,
      actor,
      session,
    });
    await this.syncProductStock(productId, item, session);
    return { insufficient: item.quantityOnHand - item.quantityReserved < 0 };
  }

  async release(
    productId: string,
    qty: number,
    orderId: string,
    actor: AuditActor,
    session?: ClientSession,
  ): Promise<void> {
    const variantId = await this.resolveVariantId(productId);
    const { item } = await this.ledger.applyMovement({
      variantId,
      locationId: await this.locations.getDefaultOnlineLocationCode(),
      type: 'order_release',
      reservedDelta: -qty,
      orderId,
      actor,
      session,
    });
    await this.syncProductStock(productId, item, session);
  }

  /**
   * The single point where an online order's stock actually moves — this
   * store does not reserve on creation, so `commit()` both is the
   * availability check (when `strict`) and the deduction, in one movement.
   * `reservedDelta: -qty` is a no-op clamp for orders that never reserved
   * (see StockLedgerService's negative-reserved clamp) — harmless if a
   * future flow ever does reserve first.
   */
  async commit(
    productId: string,
    qty: number,
    orderId: string,
    actor: AuditActor,
    session?: ClientSession,
    strict = false,
  ): Promise<void> {
    const variantId = await this.resolveVariantId(productId);
    const { item } = await this.ledger.applyMovement({
      variantId,
      locationId: await this.locations.getDefaultOnlineLocationCode(),
      type: 'order_commit',
      onHandDelta: -qty,
      reservedDelta: -qty,
      requireAvailableAtLeast: strict ? qty : undefined,
      orderId,
      actor,
      session,
    });
    await this.syncProductStock(productId, item, session);
  }

  async adjust(
    productId: string,
    qtyDelta: number,
    reason: string,
    actor: AuditActor,
    session?: ClientSession,
    locationId?: string,
  ): Promise<void> {
    const variantId = await this.resolveVariantId(productId);
    const targetLocation = locationId === 'BOUTIQUE'
      ? (await this.locations.getDefaultPosLocationCode())
      : (await this.locations.getDefaultOnlineLocationCode());
    const run = async (s?: ClientSession) => {
      const { item } = await this.ledger.applyMovement({
        variantId,
        locationId: targetLocation,
        type: 'manual_adjust',
        onHandDelta: qtyDelta,
        reason,
        actor,
        session: s,
      });
      await this.syncProductStock(productId, item, s);
    };
    if (session) await run(session);
    else await withOptionalTxn(this.connection, run);
  }

  async ensureItem(productId: string, initialOnHand = 0): Promise<void> {
    const variantId = await this.resolveVariantId(productId);
    await this.ledger.applyMovement({
      variantId,
      locationId: await this.locations.getDefaultOnlineLocationCode(),
      type: 'migration_init',
      onHandDelta: initialOnHand,
      actor: { type: 'system', id: null, name: 'ensureItem' },
    });
  }

  async list(page?: number, perPage?: number, search?: string, lowStockOnly?: boolean) {
    const { page: p, perPage: pp, skip } = clampPagination(page, perPage, 100);
    const productFilter: Record<string, unknown> = { deletedAt: null };
    if (search) productFilter.name = { $regex: search, $options: 'i' };
    const productDocs = await this.products.find(productFilter).select({ name: 1, slug: 1, images: 1 });
    const byId = new Map(productDocs.map((p) => [p.id, p]));

    const variantByProduct = await this.variants.findManyByProductIds(Array.from(byId.keys()));
    const productIdByVariantId = new Map(Array.from(variantByProduct.entries()).map(([pid, v]) => [v.id, pid]));

    const variantIds = Array.from(productIdByVariantId.keys());
    const depotCode = await this.locations.getDefaultOnlineLocationCode();
    const boutiqueCode = await this.locations.getDefaultPosLocationCode();
    const [depotItems, boutiqueItems] = await Promise.all([
      this.ledger.stockForVariants(variantIds, depotCode),
      this.ledger.stockForVariants(variantIds, boutiqueCode),
    ]);
    const boutiqueByVariant = new Map(boutiqueItems.map((i) => [i.variantId, i]));

    const incomingAgg = await this.purchaseOrders.aggregate<{ _id: string; incoming: number }>([
      { $match: { status: { $in: InventoryService.OPEN_PO_STATUSES } } },
      { $unwind: '$lines' },
      { $match: { 'lines.variantId': { $in: variantIds } } },
      { $addFields: { remaining: { $max: [0, { $subtract: ['$lines.orderedQuantity', '$lines.receivedQuantity'] }] } } },
      { $group: { _id: '$lines.variantId', incoming: { $sum: '$remaining' } } },
    ]);
    const incomingByVariant = new Map(incomingAgg.map((row) => [row._id, row.incoming]));

    let contracts: InventoryItemContract[] = depotItems
      .map((i) => {
        const pid = productIdByVariantId.get(i.variantId);
        const product = pid ? byId.get(pid) : undefined;
        return product
          ? this.toContract(i, boutiqueByVariant.get(i.variantId) ?? null, pid!, product, incomingByVariant.get(i.variantId) ?? 0)
          : null;
      })
      .filter((c): c is InventoryItemContract => c !== null);
    if (lowStockOnly) {
      contracts = contracts.filter((c) => {
        const thresh = c.lowStockThreshold ?? 5;
        return c.available <= thresh || c.boutiqueAvailable <= thresh;
      });
    }
    const total = contracts.length;
    const pageItems = contracts.slice(skip, skip + pp);
    return paginate(pageItems, total, p, pp);
  }

  async movementsFor(productId: string, page?: number, perPage?: number) {
    const { page: p, perPage: pp, skip } = clampPagination(page, perPage, 100);
    const variantId = await this.resolveVariantId(productId);
    const all = await this.ledger.movementsFor(variantId);
    const total = all.length;
    const pageItems = all.slice(skip, skip + pp);
    return paginate(pageItems.map((d) => this.movementToContract(d, productId)), total, p, pp);
  }

  private async resolveVariantId(productId: string): Promise<string> {
    const existing = await this.variants.findByProductId(productId);
    if (existing) return existing.id;
    // Defensive fallback for a product created after Sprint 1's migration
    // ran but before any variant-generation hook fires for it — mirrors
    // the pre-existing "lazy inventory_items creation" behavior.
    const created = await this.variants.generateDefaultVariant(productId);
    return created.id;
  }

  private async syncProductStock(productId: string, item: StockItemDocument, session?: ClientSession): Promise<void> {
    const available = Math.max(0, item.quantityOnHand - item.quantityReserved);
    await this.products.updateOne({ _id: productId }, { $set: { stockQuantity: available } }, { session });
  }

  private toContract(
    item: StockItemDocument,
    boutiqueItem: StockItemDocument | null,
    productId: string,
    product: { name: string; slug: string; images?: { url: string }[] },
    incomingPurchase: number,
  ): InventoryItemContract {
    return {
      productId,
      productName: product.name,
      productSlug: product.slug,
      imageUrl: product.images?.[0]?.url ?? null,
      warehouseId: item.locationId,
      onHand: item.quantityOnHand,
      reserved: item.quantityReserved,
      available: item.quantityOnHand - item.quantityReserved,
      lowStockThreshold: item.lowStockThreshold,
      boutiqueOnHand: boutiqueItem?.quantityOnHand ?? 0,
      boutiqueReserved: boutiqueItem?.quantityReserved ?? 0,
      boutiqueAvailable: boutiqueItem ? boutiqueItem.quantityOnHand - boutiqueItem.quantityReserved : 0,
      incomingPurchase,
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private movementToContract(m: StockMovementDocument, productId: string): StockMovementContract {
    return {
      id: String(m.id ?? m._id),
      productId,
      warehouseId: m.locationId,
      type: m.type,
      qty: m.qty,
      onHandAfter: m.onHandAfter,
      reservedAfter: m.reservedAfter,
      orderId: m.orderId,
      reason: m.reason,
      actor: m.actor,
      createdAt: m.createdAt.toISOString(),
    };
  }
}

/** Runs `fn` in a transaction when the connection supports it, otherwise plain. */
async function withOptionalTxn<T>(connection: Connection, fn: (session?: ClientSession) => Promise<T>): Promise<T> {
  const session = await connection.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
