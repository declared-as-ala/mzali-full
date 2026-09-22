import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import type { StockMovementType, AuditActor, InventoryItem as InventoryItemContract, StockMovement as StockMovementContract } from '@contracts';
import { clampPagination, paginate } from '@/common/pagination';
import { normalizePublicMediaUrl } from '@/common/public-media-url';
import { LocationsService } from '@/catalog/locations.service';
import { SettingsService } from '@/settings/settings.service';
import { Product } from '@/catalog/product.schema';
import { primaryProductImage } from '@/catalog/product-media';
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
    private readonly settings: SettingsService,
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
    exactVariantId?: string | null,
  ): Promise<ReserveResult> {
    const variantId = await this.resolveExact(productId, exactVariantId);
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
    exactVariantId?: string | null,
  ): Promise<void> {
    const variantId = await this.resolveExact(productId, exactVariantId);
    const locationId = await this.locations.getDefaultOnlineLocationCode();
    const current = await this.ledger.stockAt(variantId, locationId);
    const releaseQty = Math.min(qty, current?.quantityReserved ?? 0);
    if (releaseQty <= 0) return;
    const { item } = await this.ledger.applyMovement({
      variantId,
      locationId,
      type: 'order_release',
      reservedDelta: -releaseQty,
      orderId,
      actor,
      session,
    });
    await this.syncProductStock(productId, item, session);
  }

  /**
   * The single point where an online order's stock actually moves.
   * If units were already reserved (wasReserved = true), reservedDelta unreserves
   * them and onHandDelta decrements the physical stock atomically.
   */
  async commit(
    productId: string,
    qty: number,
    orderId: string,
    actor: AuditActor,
    session?: ClientSession,
    strict = true,
    exactVariantId?: string | null,
    wasReserved = false,
  ): Promise<void> {
    const variantId = await this.resolveExact(productId, exactVariantId);
    const locationId = await this.locations.getDefaultOnlineLocationCode();
    const current = await this.ledger.stockAt(variantId, locationId);
    const reservedToRelease = wasReserved ? Math.min(qty, current?.quantityReserved ?? 0) : 0;
    const { item } = await this.ledger.applyMovement({
      variantId,
      locationId,
      type: 'order_commit',
      onHandDelta: -qty,
      reservedDelta: -reservedToRelease,
      requireAvailableAtLeast: strict && !wasReserved ? qty : undefined,
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
    exactVariantId?: string | null,
    movement?: { type: StockMovementType; orderId: string },
  ): Promise<void> {
    const variantId = await this.resolveExact(productId, exactVariantId);
    const targetLocation = locationId === 'BOUTIQUE'
      ? (await this.locations.getDefaultPosLocationCode())
      : (await this.locations.getDefaultOnlineLocationCode());
    const run = async (s?: ClientSession) => {
      const { item } = await this.ledger.applyMovement({
        variantId,
        locationId: targetLocation,
        type: movement?.type ?? 'manual_adjust',
        orderId: movement?.orderId,
        reference: movement?.orderId,
        onHandDelta: qtyDelta,
        requireAvailableAtLeast: qtyDelta < 0 ? -qtyDelta : undefined,
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
    const productDocs = await this.products.find(productFilter).select({ name: 1, slug: 1, images: 1, inventoryModel: 1, depotTrackingMode: 1, boutiqueTrackingMode: 1 }).sort({ name: 1 });
    const byId = new Map(productDocs.map((p) => [p.id, p]));

    const variantByProduct = await this.variants.findManyByProductIds(Array.from(byId.keys()));
    const variantIdByProductId = new Map(Array.from(variantByProduct.entries()).map(([pid, v]) => [pid, v.id]));
    const productIdByVariantId = new Map(Array.from(variantIdByProductId.entries()).map(([pid, vid]) => [vid, pid]));

    const variantIds = Array.from(productIdByVariantId.keys());
    const depotCode = await this.locations.getDefaultOnlineLocationCode();
    const boutiqueCode = await this.locations.getDefaultPosLocationCode();
    const [depotItems, boutiqueItems] = await Promise.all([
      this.ledger.stockForVariants(variantIds, depotCode),
      this.ledger.stockForVariants(variantIds, boutiqueCode),
    ]);
    const depotByVariant = new Map(depotItems.map((i) => [i.variantId, i]));
    const boutiqueByVariant = new Map(boutiqueItems.map((i) => [i.variantId, i]));

    const incomingAgg = await this.purchaseOrders.aggregate<{ _id: string; incoming: number }>([
      { $match: { status: { $in: InventoryService.OPEN_PO_STATUSES } } },
      { $unwind: '$lines' },
      { $match: { 'lines.variantId': { $in: variantIds } } },
      { $addFields: { remaining: { $max: [0, { $subtract: ['$lines.orderedQuantity', '$lines.receivedQuantity'] }] } } },
      { $group: { _id: '$lines.variantId', incoming: { $sum: '$remaining' } } },
    ]);
    const incomingByVariant = new Map(incomingAgg.map((row) => [row._id, row.incoming]));

    // Every product appears here, not just ones that already have a stock
    // item — a product created through the admin form (as opposed to the
    // original migration import) never gets one provisioned automatically,
    // so it would otherwise silently vanish from this list even though it
    // exists and shows up fine on /produits. Missing stock is shown as 0
    // rather than hiding the row; adjusting it for the first time creates
    // the real stock item lazily (see resolveVariantId/adjust()).
    const now = new Date();
    let contracts: InventoryItemContract[] = productDocs.map((product) => {
      const variantId = variantIdByProductId.get(product.id);
      const depotItem = variantId ? depotByVariant.get(variantId) ?? null : null;
      const boutiqueItem = variantId ? boutiqueByVariant.get(variantId) ?? null : null;
      const incoming = variantId ? incomingByVariant.get(variantId) ?? 0 : 0;
      return this.toContract(
        depotItem ?? { locationId: depotCode, quantityOnHand: 0, quantityReserved: 0, lowStockThreshold: null, updatedAt: now },
        boutiqueItem,
        product.id,
        product,
        incoming,
      );
    });
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

  async resolveExact(productId: string, variantId?: string | null) {
    if (variantId) {
      const v = await this.variants.findById(variantId);
      if (!v || v.productId !== productId || v.retired) throw new BadRequestException('Variante historique : réconciliation requise.');
      return v.id;
    }
    return (await this.variants.resolveForSale(productId)).id;
  }

  /** Historical snapshots may resolve only through a unique exact size/color match. */
  async resolveHistoricalVariant(productId: string, variantId: string | null | undefined, variation: Record<string, string> | null | undefined): Promise<string> {
    if (variantId) {
      const existing = await this.variants.findById(variantId);
      if (existing && existing.productId === productId && !existing.retired) return existing.id;
      if (existing && existing.productId !== productId) throw new BadRequestException('Variante et produit incompatibles.');
    }
    const product = await this.products.findById(productId);
    if (product?.inventoryModel !== 'MATRIX') return this.resolveExact(productId, variantId);
    const normalized = (value: string) => value.trim().normalize('NFC').toLocaleLowerCase('fr');
    const entries = Object.entries(variation ?? {});
    const sizes = entries.filter(([k]) => /^(taille|tallie|taile|size|pointure)s?$/.test(normalized(k))).map(([, v]) => normalized(v));
    const colors = entries.filter(([k]) => /^(couleur|color|colour)s?$/.test(normalized(k))).map(([, v]) => normalized(v));
    const matches = sizes.length === 1 && colors.length === 1 ? (await this.variants.allForProducts([productId])).filter(v => normalized(v.attributes.size ?? '') === sizes[0] && normalized(v.attributes.color ?? '') === colors[0]) : [];
    if (matches.length !== 1) throw new BadRequestException('Commande historique : aucune correspondance exacte taille/couleur. Réconciliation manuelle requise avant mouvement de stock.');
    return matches[0].id;
  }

  async resolveSaleVariant(productId: string, variantId?: string | null) {
    return this.variants.resolveForSale(productId, variantId);
  }

  async validateOrderAvailability(params: {
    channel?: 'ONLINE' | 'ADMIN' | 'POS';
    productId: string;
    variantId?: string | null;
    variation?: Record<string, string> | null;
    quantity: number;
    existingQuantity?: number;
  }) {
    const { channel = 'ONLINE', productId, variantId, variation, quantity, existingQuantity = 0 } = params;
    if (quantity <= 0) {
      throw new BadRequestException('La quantité doit être supérieure à zéro.');
    }

    const inventorySettings = await this.settings.getInventorySettings();
    const inventoryEnabled = inventorySettings.enabled !== false;

    const product = await this.products.findById(productId);
    if (!product || product.deletedAt) {
      throw new BadRequestException('Produit introuvable');
    }

    const locationId: 'DEPOT' | 'BOUTIQUE' = channel === 'POS' ? 'BOUTIQUE' : 'DEPOT';

    // Mode sans stock
    if (!inventoryEnabled || product.manageStock === false) {
      return {
        valid: true,
        available: true,
        stock: Infinity,
        mode: 'UNTRACKED',
        location: locationId,
        requiredDelta: Math.max(0, quantity - existingQuantity),
      };
    }

    const trackingMode = locationId === 'BOUTIQUE'
      ? (product.boutiqueTrackingMode ?? 'SIMPLE')
      : (product.depotTrackingMode ?? (product.inventoryModel === 'MATRIX' ? 'VARIANT' : 'SIMPLE'));

    const requiredDelta = Math.max(0, quantity - existingQuantity);

    if (trackingMode === 'SIMPLE') {
      let available = 0;
      if (locationId === 'BOUTIQUE') {
        const balance = await this.ledger.boutiqueBalance(productId);
        available = Math.max(0, balance.onHand - balance.reserved);
      } else {
        const variants = await this.variants.allForProducts([productId]);
        const activeVariants = variants.filter((v) => v.active);
        const rows = await this.ledger.stockForVariants(activeVariants.map((v) => v.id), 'DEPOT');
        available = rows.reduce((sum, r) => sum + Math.max(0, r.quantityOnHand - r.quantityReserved), 0);
      }

      if (available <= 0 && requiredDelta > 0) {
        return {
          valid: false,
          available: false,
          stock: 0,
          mode: 'SIMPLE',
          location: locationId,
          requiredDelta,
          error: 'Ce produit est actuellement épuisé.',
        };
      }

      if (requiredDelta > available) {
        return {
          valid: false,
          available: false,
          stock: available,
          mode: 'SIMPLE',
          location: locationId,
          requiredDelta,
          error: `Stock insuffisant pour ${product.name} (disponible : ${available}).`,
        };
      }

      return {
        valid: true,
        available: true,
        stock: available,
        mode: 'SIMPLE',
        location: locationId,
        requiredDelta,
      };
    }

    // VARIANT mode
    let targetVariantId = variantId;
    if (!targetVariantId && variation) {
      try {
        targetVariantId = await this.resolveHistoricalVariant(productId, null, variation);
      } catch {
        targetVariantId = null;
      }
    }

    if (!targetVariantId) {
      return {
        valid: false,
        available: false,
        stock: 0,
        mode: 'VARIANT',
        location: locationId,
        requiredDelta,
        error: 'Veuillez sélectionner une taille et une couleur.',
      };
    }

    const variant = await this.variants.findById(targetVariantId);
    if (!variant || variant.productId !== productId || !variant.active || variant.retired) {
      return {
        valid: false,
        available: false,
        stock: 0,
        mode: 'VARIANT',
        location: locationId,
        requiredDelta,
        error: 'Cette variante est inactive ou indisponible.',
      };
    }

    const variantLabel = [variant.attributes?.size, variant.attributes?.color].filter(Boolean).join(' / ') || variant.sku || 'Variante';
    const stockItem = await this.ledger.stockAt(variant.id, locationId);
    const available = stockItem ? Math.max(0, stockItem.quantityOnHand - stockItem.quantityReserved) : 0;

    if (available <= 0 && requiredDelta > 0) {
      return {
        valid: false,
        available: false,
        stock: 0,
        mode: 'VARIANT',
        location: locationId,
        resolvedVariantId: variant.id,
        variantLabel,
        requiredDelta,
        error: `${variantLabel} — ÉPUISÉ`,
      };
    }

    if (requiredDelta > available) {
      return {
        valid: false,
        available: false,
        stock: available,
        mode: 'VARIANT',
        location: locationId,
        resolvedVariantId: variant.id,
        variantLabel,
        requiredDelta,
        error: `Stock insuffisant pour ${variantLabel}.`,
      };
    }

    return {
      valid: true,
      available: true,
      stock: available,
      mode: 'VARIANT',
      location: locationId,
      resolvedVariantId: variant.id,
      variantLabel,
      requiredDelta,
    };
  }

  async assertOrderAvailability(params: {
    channel?: 'ONLINE' | 'ADMIN' | 'POS';
    productId: string;
    variantId?: string | null;
    variation?: Record<string, string> | null;
    quantity: number;
    existingQuantity?: number;
  }) {
    const res = await this.validateOrderAvailability(params);
    if (!res.valid) {
      throw new BadRequestException(res.error || 'Stock insuffisant');
    }
    return res;
  }

  async validateAvailable(productId: string, variantId: string, qty: number, channel: 'ONLINE' | 'ADMIN' | 'POS' = 'ONLINE') {
    await this.assertOrderAvailability({ channel, productId, variantId, quantity: qty });
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
    if (item.locationId !== 'DEPOT') return;
    const variants = await this.variants.allForProducts([productId]);
    const rows = await this.ledger.stockForVariants(variants.filter(v => v.active).map(v => v.id), 'DEPOT');
    const available = rows.reduce((sum, row) => sum + Math.max(0, row.variantId === item.variantId ? item.quantityOnHand - item.quantityReserved : row.quantityOnHand - row.quantityReserved), 0);
    await this.products.updateOne({ _id: productId }, { $set: { stockQuantity: available } }, { session });
  }

  private toContract(
    item: Pick<StockItemDocument, 'locationId' | 'quantityOnHand' | 'quantityReserved' | 'lowStockThreshold' | 'updatedAt'>,
    boutiqueItem: StockItemDocument | null,
    productId: string,
    product: { name: string; slug: string; images?: { url: string }[]; depotTrackingMode?: string; boutiqueTrackingMode?: string },
    incomingPurchase: number,
  ): InventoryItemContract {
    return {
      productId,
      productName: product.name,
      productSlug: product.slug,
      imageUrl: normalizePublicMediaUrl(primaryProductImage(product.images)?.url ?? null),
      warehouseId: item.locationId,
      onHand: item.quantityOnHand,
      reserved: item.quantityReserved,
      available: item.quantityOnHand - item.quantityReserved,
      lowStockThreshold: item.lowStockThreshold,
      depotTrackingMode: (product.depotTrackingMode as 'SIMPLE' | 'VARIANT') ?? 'SIMPLE',
      boutiqueTrackingMode: (product.boutiqueTrackingMode as 'SIMPLE' | 'VARIANT') ?? 'SIMPLE',
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
