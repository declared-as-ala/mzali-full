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

export type AvailabilityCheck = {
  valid: boolean;
  available: boolean;
  stock: number;
  mode: 'SIMPLE' | 'VARIANT' | 'UNTRACKED';
  location: string;
  requiredDelta: number;
  productId?: string;
  variantId?: string | null;
  resolvedVariantId?: string;
  variantLabel?: string;
  error?: string;
};

const stockChangedMessage = (label: string, left: number) =>
  `Stock modifié pendant la saisie. Il reste ${left} unité${left > 1 ? 's' : ''} de ${label}.`;

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
    // One operational inventory (DEPOT). `locationId` is kept only so old call sites still compile.
    void locationId;
    const targetLocation = await this.locations.getDefaultOnlineLocationCode();
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
    const depotItems = await this.ledger.stockForVariants(variantIds, depotCode);
    const depotByVariant = new Map(depotItems.map((i) => [i.variantId, i]));

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
      const incoming = variantId ? incomingByVariant.get(variantId) ?? 0 : 0;
      return this.toContract(
        depotItem ?? { locationId: depotCode, quantityOnHand: 0, quantityReserved: 0, lowStockThreshold: null, updatedAt: now },
        null,
        product.id,
        product,
        incoming,
      );
    });
    if (lowStockOnly) {
      contracts = contracts.filter((c) => {
        const thresh = c.lowStockThreshold ?? 5;
        return c.available <= thresh;
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

  /**
   * THE stock check for every channel (storefront, admin manual order / edit,
   * POS). One location (DEPOT) and one rule:
   *  - product with real size/color variants (inventoryModel MATRIX) -> the exact
   *    variant's stock;
   *  - product without variants -> the product's single quantity.
   * `existingQuantity` is what the order already holds (edit of a confirmed
   * order): only the extra units are required from free stock.
   */
  async validateOrderAvailability(params: {
    channel?: 'ONLINE' | 'ADMIN' | 'POS';
    productId: string;
    variantId?: string | null;
    variation?: Record<string, string> | null;
    quantity: number;
    existingQuantity?: number;
  }): Promise<AvailabilityCheck> {
    const { productId, variantId, variation, quantity, existingQuantity = 0 } = params;
    const location = await this.locations.getDefaultOnlineLocationCode();
    if (quantity <= 0) {
      throw new BadRequestException('La quantité doit être supérieure à zéro.');
    }

    const inventoryEnabled = (await this.settings.getInventorySettings()).enabled !== false;
    const product = await this.products.findById(productId);
    if (!product || product.deletedAt) {
      throw new BadRequestException('Produit introuvable');
    }
    const requiredDelta = Math.max(0, quantity - existingQuantity);

    if (!inventoryEnabled || product.manageStock === false) {
      return { valid: true, available: true, stock: Infinity, mode: 'UNTRACKED', location, requiredDelta };
    }

    const isMatrix = product.inventoryModel === 'MATRIX';

    if (!isMatrix) {
      const variants = (await this.variants.allForProducts([productId])).filter((v) => v.active);
      const rows = await this.ledger.stockForVariants(variants.map((v) => v.id), location);
      const stock = rows.reduce((sum, r) => sum + Math.max(0, r.quantityOnHand - r.quantityReserved), 0);
      const base = { mode: 'SIMPLE' as const, location, requiredDelta, productId, variantLabel: product.name, stock };
      if (stock <= 0 && requiredDelta > 0) return { ...base, valid: false, available: false, error: `${product.name} — ÉPUISÉ` };
      if (requiredDelta > stock) return { ...base, valid: false, available: false, error: stockChangedMessage(product.name, stock) };
      return { ...base, valid: true, available: true };
    }

    let targetVariantId = variantId;
    if (!targetVariantId && variation) {
      try {
        targetVariantId = await this.resolveHistoricalVariant(productId, null, variation);
      } catch {
        targetVariantId = null;
      }
    }
    if (!targetVariantId) {
      return { valid: false, available: false, stock: 0, mode: 'VARIANT', location, requiredDelta, productId, error: 'Veuillez sélectionner une taille et une couleur.' };
    }

    const variant = await this.variants.findById(targetVariantId);
    if (!variant || variant.productId !== productId || !variant.active || variant.retired || variant.boutiquePool) {
      return { valid: false, available: false, stock: 0, mode: 'VARIANT', location, requiredDelta, productId, variantId: targetVariantId, error: 'Cette variante est désactivée ou n’existe plus.' };
    }

    const variantLabel = [variant.attributes?.size, variant.attributes?.color].filter(Boolean).join(' / ') || variant.sku || 'Variante';
    const stockItem = await this.ledger.stockAt(variant.id, location);
    const stock = stockItem ? Math.max(0, stockItem.quantityOnHand - stockItem.quantityReserved) : 0;
    const base = { mode: 'VARIANT' as const, location, requiredDelta, productId, resolvedVariantId: variant.id, variantId: variant.id, variantLabel, stock };
    if (stock <= 0 && requiredDelta > 0) return { ...base, valid: false, available: false, error: `${variantLabel} — ÉPUISÉ` };
    if (requiredDelta > stock) return { ...base, valid: false, available: false, error: stockChangedMessage(variantLabel, stock) };
    return { ...base, valid: true, available: true };
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
      // Structured body: the admin order form uses productId/variantId/available to point at the
      // exact line and keep everything else the employee typed.
      throw new BadRequestException({
        message: res.error || 'Stock insuffisant',
        code: 'INSUFFICIENT_STOCK',
        productId: params.productId,
        variantId: res.variantId ?? params.variantId ?? null,
        variantLabel: res.variantLabel ?? null,
        available: Number.isFinite(res.stock) ? res.stock : null,
        requested: params.quantity,
      });
    }
    return res;
  }

  /**
   * Live availability of one product, for the admin order form (and anything
   * else that needs to show stock BEFORE saving). Read-only, DEPOT only.
   */
  async getAvailability(productId: string) {
    const product = await this.products.findById(productId);
    if (!product || product.deletedAt) throw new BadRequestException('Produit introuvable');
    const location = await this.locations.getDefaultOnlineLocationCode();
    const tracked = (await this.settings.getInventorySettings()).enabled !== false && product.manageStock !== false;
    const isMatrix = product.inventoryModel === 'MATRIX';
    const variants = await this.variants.allForProducts([productId]);
    const stock = await this.ledger.stockForVariants(variants.map((v) => v.id), location);
    const availableOf = new Map(stock.map((r) => [r.variantId, Math.max(0, r.quantityOnHand - r.quantityReserved)]));
    const rows = variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      size: v.attributes?.size ?? '',
      color: v.attributes?.color ?? '',
      active: v.active,
      available: availableOf.get(v.id) ?? 0,
    }));
    const sellable = rows.filter((r) => r.active);
    return {
      productId,
      name: product.name,
      tracked,
      mode: isMatrix ? ('VARIANT' as const) : ('SIMPLE' as const),
      total: sellable.reduce((sum, r) => sum + r.available, 0),
      /** Only real variants; a product without variants has none (its stock is `total`). */
      variants: isMatrix ? rows : [],
      /** For products without variants: the single variant that carries the quantity. */
      defaultVariantId: isMatrix ? null : (sellable[0]?.id ?? null),
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Builds the refusal for "not enough stock at the moment of saving": names the exact variant, says how
   * many are really left, and carries structured details so the admin form can point at that line and
   * keep everything else the employee typed. `extra` = the request was for ADDITIONAL units of an order
   * that already holds some (confirmed-order edit), so the wording is about the extra units.
   */
  async insufficientStockError(productId: string, variantId: string | null | undefined, requested: number, opts: { extra?: boolean } = {}) {
    const location = await this.locations.getDefaultOnlineLocationCode();
    let vid = variantId ?? null;
    if (!vid) vid = (await this.variants.findByProductId(productId))?.id ?? null;
    let free = 0;
    let label = '';
    if (vid) {
      const item = await this.ledger.stockAt(vid, location);
      free = item ? Math.max(0, item.quantityOnHand - item.quantityReserved) : 0;
      const v = await this.variants.findById(vid);
      label = [v?.attributes?.size, v?.attributes?.color].filter(Boolean).join(' / ');
    }
    if (!label) label = (await this.products.findById(productId))?.name ?? 'ce produit';
    const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
    const message = opts.extra
      ? `${plural(free, 'unité')} supplémentaire${free > 1 ? 's' : ''} disponible${free > 1 ? 's' : ''}, ${requested} requise${requested > 1 ? 's' : ''} (${label}).`
      : free <= 0
        ? `${label} vient d’être épuisé.`
        : `Stock modifié pendant la saisie. Il reste ${plural(free, 'unité')} de ${label}.`;
    return new BadRequestException({ message, code: 'INSUFFICIENT_STOCK', productId, variantId: vid, variantLabel: label, available: free, requested });
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
