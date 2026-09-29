import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuditActor } from '@contracts';
import { DEPOT_CODE } from '@/catalog/location.schema';
import { Product } from '@/catalog/product.schema';
import { primaryProductImage } from '@/catalog/product-media';
import { normalizePublicMediaUrl } from '@/common/public-media-url';
import { Variant } from '@/catalog/variant.schema';
import { combinationKey } from '@/catalog/variant-options';
import { StockItem } from './stock-item.schema';
import { StockMovement } from './stock-movement.schema';
import { StockLedgerService } from './stock-ledger.service';
import { ActivateMatrixDto, SaveStockDto, VariantAdjustmentDto } from './variant-stock.dto';

export { combinationKey };

/** Default "low stock" threshold when neither the variant nor its stock row sets one. */
const DEFAULT_LOW_STOCK = 3;

/**
 * Stock administration for the ONE operational inventory: DEPOT.
 *
 * There are no tracking "modes" any more. A product WITH real size/color
 * variants (inventoryModel MATRIX) is tracked per exact variant; a product
 * without is tracked as one quantity on its single default variant. Both are
 * edited through the same `saveStock` call. Every quantity change goes through
 * StockLedgerService (manual_adjust, before/after, actor, reason).
 */
@Injectable()
export class VariantStockService {
  constructor(
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(Variant.name) private readonly variants: Model<Variant>,
    @InjectModel(StockItem.name) private readonly items: Model<StockItem>,
    @InjectModel(StockMovement.name) private readonly movements: Model<StockMovement>,
    private readonly ledger: StockLedgerService,
  ) {}

  /** Everything the adjustment modal needs for one product. */
  async configuration(productId: string) {
    const product = await this.products.findById(productId);
    if (!product || product.deletedAt) throw new NotFoundException('Produit introuvable');
    const variants = await this.variants.find({ productId, boutiquePool: { $ne: true }, retired: { $ne: true } }).sort({ createdAt: 1 });
    const stock = await this.items.find({ variantId: { $in: variants.map((v) => v.id) }, locationId: DEPOT_CODE });
    const isMatrix = product.inventoryModel === 'MATRIX';
    return {
      productId,
      name: product.name,
      /** Derived, never chosen: true when the product has real size/color variants. */
      hasVariants: isMatrix,
      options: product.options,
      variants: variants.map((v) => {
        const s = stock.find((row) => row.variantId === v.id);
        return {
          id: v.id,
          sku: v.sku,
          attributes: v.attributes,
          active: v.active,
          obsoleteByOptions: Boolean(v.obsoleteByOptions),
          lowStockThreshold: v.lowStockThreshold,
          onHand: s?.quantityOnHand ?? 0,
          reserved: s?.quantityReserved ?? 0,
        };
      }),
    };
  }

  /**
   * Converts a product that has no variants yet into one tracked per exact
   * variant. Allocations are explicit (never inferred from option labels or
   * order history); the old single quantity is zeroed by correction movements
   * and the allocated quantities are booked on the new variants.
   */
  async activate(productId: string, dto: ActivateMatrixDto, actor: AuditActor) {
    if (!dto.reason.trim()) throw new BadRequestException('Motif obligatoire');
    const keys = dto.rows.map((r) => combinationKey(r.size, r.color));
    if (new Set(keys).size !== keys.length || new Set(dto.rows.map((r) => r.sku.trim())).size !== dto.rows.length) throw new BadRequestException('Combinaison ou SKU en double');
    if (dto.rows.some((r) => !r.size.trim() || !r.color.trim() || !r.sku.trim())) throw new BadRequestException('Taille, couleur et SKU obligatoires');
    await this.variants.init();
    const session = await this.products.db.startSession();
    try {
      return await session.withTransaction(async () => {
        const product = await this.products.findById(productId).session(session);
        if (!product) throw new NotFoundException('Produit introuvable');
        if (product.inventoryModel === 'MATRIX') throw new ConflictException('Ce produit a déjà des variantes. Ajustez leur stock directement.');
        const legacy = await this.variants.find({ productId, boutiquePool: { $ne: true } }).session(session);
        const legacyIds = legacy.map((v) => v.id);
        const openCount = await this.products.db.collection('stocktakes').findOne({ 'lines.variantId': { $in: legacyIds }, status: { $nin: ['POSTED', 'CANCELLED'] } }, { session, projection: { _id: 1 } });
        if (openCount) throw new ConflictException('Terminez ou annulez les inventaires ouverts de ce produit avant de créer les variantes.');
        const openSessions = await this.products.db.collection('pos_cashier_sessions').find({ status: 'OPEN' }, { session, projection: { _id: 1 } }).toArray();
        const editableSale = openSessions.length ? await this.products.db.collection('pos_sales').findOne({ sessionId: { $in: openSessions.map((s) => String(s._id)) }, status: 'COMPLETED', 'lines.variantId': { $in: legacyIds } }, { session, projection: { _id: 1 } }) : null;
        if (editableSale) throw new ConflictException('Clôturez les sessions de caisse contenant ce produit avant de créer les variantes.');
        const stock = await this.items.find({ variantId: { $in: legacyIds }, locationId: DEPOT_CODE }).session(session);
        if (stock.some((s) => s.quantityReserved !== 0 || s.quantityOnHand < 0)) throw new ConflictException('Réconciliez les réservations avant de créer les variantes.');
        const before = stock.reduce((sum, s) => sum + s.quantityOnHand, 0);
        const allocated = dto.rows.reduce((sum, r) => sum + r.depot, 0);
        if (!dto.replaceDepotStock && !dto.initialStock && allocated !== before) throw new BadRequestException(`La répartition doit conserver le stock actuel : ${before}.`);
        const clash = await this.variants.exists({ sku: { $in: dto.rows.map((r) => r.sku.trim()) } }).session(session);
        if (clash) throw new BadRequestException('Un SKU est déjà utilisé. Les SKU historiques restent réservés.');
        if (dto.dryRun) return { dryRun: true, before, variantCount: dto.rows.length };
        // Serialize with every movement using the old variants, including sales that resolved their variant just before.
        await this.variants.updateMany({ productId, boutiquePool: { $ne: true } }, { $set: { retired: true, active: false }, $inc: { inventoryRevision: 1 } }, { session });
        for (const s of stock) if (s.quantityOnHand) await this.ledger.applyMovement({ variantId: s.variantId, locationId: DEPOT_CODE, type: 'correction', onHandDelta: -s.quantityOnHand, reference: `variants:${productId}`, reason: dto.reason, actor, session, migration: true });
        for (let i = 0; i < dto.rows.length; i++) {
          const r = dto.rows[i];
          const [v] = await this.variants.create([{ productId, combinationKey: keys[i], attributes: { size: r.size.trim(), color: r.color.trim() }, sku: r.sku.trim(), active: r.active, sellingPriceMinor: r.sellingPriceMinor ?? null, lowStockThreshold: r.lowStockThreshold ?? null }], { session });
          await this.ledger.applyMovement({ variantId: v.id, locationId: DEPOT_CODE, type: 'manual_adjust', onHandDelta: r.depot, reference: `variants:${productId}`, reason: dto.reason, actor, session });
        }
        product.inventoryModel = 'MATRIX';
        product.depotTrackingMode = 'VARIANT';
        await product.save({ session });
        return { dryRun: false, before, variantCount: dto.rows.length };
      });
    } finally { await session.endSession(); }
  }

  /**
   * One row per product for the Stock page: Produit / Disponible / Stock / État,
   * plus the summary cards. Stock and availability count only ACTIVE variants
   * (a disabled variant keeps its stock but is not for sale).
   */
  async overview(query: Record<string, string | undefined>) {
    const search = query.search?.trim().toLocaleLowerCase('fr');
    const products = await this.products.find({ deletedAt: null, ...(query.productId ? { _id: query.productId } : {}) })
      .select({ name: 1, images: 1, inventoryModel: 1, status: 1 });
    const productIds = products.map((p) => p.id);
    const variants = await this.variants.find({ productId: { $in: productIds }, retired: { $ne: true }, boutiquePool: { $ne: true } });
    const stock = await this.items.find({ variantId: { $in: variants.map((v) => v.id) }, locationId: DEPOT_CODE });
    const stockOf = new Map(stock.map((s) => [s.variantId, s]));

    let soldOutCombinations = 0;
    let lowStockProducts = 0;
    let stockTotal = 0;
    let availableTotal = 0;
    const rows = products.map((p) => {
      const own = variants.filter((v) => v.productId === p.id && !v.obsoleteByOptions);
      const live = own.filter((v) => v.active);
      let onHand = 0;
      let available = 0;
      let threshold = DEFAULT_LOW_STOCK;
      let soldOut = 0;
      for (const v of live) {
        const s = stockOf.get(v.id);
        const oh = s?.quantityOnHand ?? 0;
        const av = Math.max(0, oh - (s?.quantityReserved ?? 0));
        onHand += oh;
        available += av;
        threshold = Math.max(threshold, v.lowStockThreshold ?? s?.lowStockThreshold ?? DEFAULT_LOW_STOCK);
        if (av <= 0) soldOut += 1;
      }
      const disabledStock = own.filter((v) => !v.active).reduce((sum, v) => sum + (stockOf.get(v.id)?.quantityOnHand ?? 0), 0);
      const state: 'in' | 'low' | 'out' = available <= 0 ? 'out' : available <= threshold ? 'low' : 'in';
      return {
        productId: p.id,
        productName: p.name,
        imageUrl: normalizePublicMediaUrl(primaryProductImage(p.images)?.url ?? null),
        hasVariants: p.inventoryModel === 'MATRIX',
        variantCount: own.length,
        onHand,
        available,
        disabledStock,
        soldOutVariants: soldOut,
        state,
      };
    });
    for (const r of rows) {
      stockTotal += r.onHand;
      availableTotal += r.available;
      soldOutCombinations += r.soldOutVariants;
      if (r.state === 'low') lowStockProducts += 1;
    }
    const filtered = rows.filter((r) => (!search || r.productName.toLocaleLowerCase('fr').includes(search))
      && (!query.status || (query.status === 'out' ? r.state === 'out' : query.status === 'low' ? r.state === 'low' : r.state === 'in')));
    filtered.sort((a, b) => query.sort === 'available' ? a.available - b.available : a.productName.localeCompare(b.productName, 'fr'));
    const perPage = 30;
    const page = Math.max(1, Number(query.page) || 1);
    return {
      items: filtered.slice((page - 1) * perPage, page * perPage),
      total: filtered.length,
      totalPages: Math.ceil(filtered.length / perPage),
      page,
      summary: { stockTotal, available: availableTotal, soldOutCombinations, lowStockProducts },
    };
  }

  /** Every variant with its DEPOT stock, unpaginated: feeds the printable detailed stock report. */
  async details() {
    const products = await this.products.find({ deletedAt: null }).select({ name: 1, inventoryModel: 1 }).sort({ name: 1 });
    const names = new Map(products.map((p) => [p.id, p.name]));
    const variants = await this.variants.find({ productId: { $in: [...names.keys()] }, retired: { $ne: true }, boutiquePool: { $ne: true } });
    const stock = await this.items.find({ variantId: { $in: variants.map((v) => v.id) }, locationId: DEPOT_CODE });
    const stockOf = new Map(stock.map((s) => [s.variantId, s]));
    const rows = variants.filter((v) => !v.obsoleteByOptions).map((v) => {
      const s = stockOf.get(v.id);
      const oh = s?.quantityOnHand ?? 0;
      return {
        productId: v.productId, productName: names.get(v.productId) ?? '', size: v.attributes?.size ?? '', color: v.attributes?.color ?? '',
        sku: v.sku, active: v.active, onHand: oh, reserved: s?.quantityReserved ?? 0, available: Math.max(0, oh - (s?.quantityReserved ?? 0)),
      };
    });
    rows.sort((a, b) => a.productName.localeCompare(b.productName, 'fr') || a.color.localeCompare(b.color, 'fr') || a.size.localeCompare(b.size, 'fr', { numeric: true }));
    return { rows };
  }

  /**
   * The single save behind the adjustment modal, for products with and without
   * variants alike. Atomic: every quantity change and every availability switch
   * is applied in one transaction or none is.
   *  - `expectedQuantity` (optional) makes a stale edit fail instead of overwriting a newer count.
   *  - quantities move through the ledger as manual_adjust (+5 / -4), never a silent overwrite;
   *  - disabling a variant keeps its stock; a variant switched off because its option was removed
   *    (`obsoleteByOptions`) cannot be re-enabled here.
   */
  async saveStock(productId: string, dto: SaveStockDto, actor: AuditActor) {
    if (new Set(dto.rows.map((r) => r.variantId)).size !== dto.rows.length) throw new BadRequestException('Variante en double');
    const session = await this.products.db.startSession();
    try {
      return await session.withTransaction(async () => {
        const product = await this.products.findById(productId).session(session);
        if (!product || product.deletedAt) throw new NotFoundException('Produit introuvable');
        const stockChanges: { variantId: string; before: number; after: number }[] = [];
        const availabilityChanges: { variantId: string; active: boolean }[] = [];
        for (const row of dto.rows) {
          const variant = await this.variants.findOne({ _id: row.variantId, productId, retired: { $ne: true }, boutiquePool: { $ne: true } }).session(session);
          if (!variant) throw new BadRequestException('Variante invalide pour ce produit');
          if (row.quantity !== undefined) {
            const item = await this.items.findOne({ variantId: variant.id, locationId: DEPOT_CODE }).session(session);
            const before = item?.quantityOnHand ?? 0;
            if (row.expectedQuantity !== undefined && before !== row.expectedQuantity) throw new ConflictException('Le stock a changé. Actualisez avant de réessayer.');
            const delta = row.quantity - before;
            if (delta) {
              await this.ledger.applyMovement({
                variantId: variant.id, locationId: DEPOT_CODE, type: 'manual_adjust', onHandDelta: delta,
                requireAvailableAtLeast: delta < 0 ? -delta : undefined,
                reason: dto.reason?.trim() || 'Ajustement depuis la page Stock', actor, session,
              });
              stockChanges.push({ variantId: variant.id, before, after: row.quantity });
            }
          }
          if (row.active !== undefined && row.active !== variant.active) {
            if (row.active && variant.obsoleteByOptions) throw new ConflictException('Cette combinaison a été retirée des options du produit et ne peut pas être réactivée ici.');
            await this.variants.updateOne({ _id: variant.id, productId }, { $set: { active: row.active }, $inc: { inventoryRevision: 1 } }, { session });
            availabilityChanges.push({ variantId: variant.id, active: row.active });
          }
        }
        // Keep the denormalized product-level quantity in step (read by listings).
        const live = await this.variants.find({ productId, active: true, retired: { $ne: true }, boutiquePool: { $ne: true } }).session(session);
        const rows = await this.items.find({ variantId: { $in: live.map((v) => v.id) }, locationId: DEPOT_CODE }).session(session);
        const available = rows.reduce((sum, r) => sum + Math.max(0, r.quantityOnHand - r.quantityReserved), 0);
        await this.products.updateOne({ _id: productId }, { $set: { stockQuantity: available } }, { session });
        return { ok: true, stockChanges, availabilityChanges };
      });
    } finally { await session.endSession(); }
  }

  async adjust(dto: VariantAdjustmentDto, actor: AuditActor) {
    if (!dto.reason.trim() || !dto.qty) throw new BadRequestException('Quantité non nulle et motif obligatoires');
    await this.ledger.applyMovement({ variantId: dto.variantId, locationId: DEPOT_CODE, type: 'manual_adjust', onHandDelta: dto.qty, requireAvailableAtLeast: dto.qty < 0 ? -dto.qty : undefined, reason: dto.reason, actor });
    return { ok: true };
  }

  /** New combinations start at zero; stock is added afterwards through saveStock. */
  async addVariants(productId: string, dto: ActivateMatrixDto, actor: AuditActor) {
    if (!dto.reason.trim()) throw new BadRequestException('Motif obligatoire');
    if (dto.rows.some((r) => !r.size.trim() || !r.color.trim() || !r.sku.trim() || r.depot)) throw new BadRequestException('Les nouvelles variantes commencent à zéro. Ajoutez le stock par ajustement après création.');
    const keys = dto.rows.map((r) => combinationKey(r.size, r.color));
    if (new Set(keys).size !== keys.length || new Set(dto.rows.map((r) => r.sku.trim())).size !== dto.rows.length) throw new BadRequestException('Combinaison ou SKU en double');
    await this.variants.init();
    const session = await this.products.db.startSession();
    try {
      return await session.withTransaction(async () => {
        const product = await this.products.findById(productId).session(session);
        if (!product || product.inventoryModel !== 'MATRIX') throw new BadRequestException('Ce produit n’a pas encore de variantes : répartissez d’abord son stock.');
        if (await this.variants.exists({ productId, combinationKey: { $in: keys } }).session(session)) throw new ConflictException('Cette combinaison existe déjà. Son identité reste inchangée.');
        if (await this.variants.exists({ sku: { $in: dto.rows.map((r) => r.sku.trim()) } }).session(session)) throw new ConflictException('SKU déjà utilisé');
        if (dto.dryRun) return { dryRun: true, variantCount: dto.rows.length };
        for (let i = 0; i < dto.rows.length; i++) {
          const r = dto.rows[i];
          const [v] = await this.variants.create([{ productId, combinationKey: keys[i], sku: r.sku.trim(), attributes: { size: r.size.trim(), color: r.color.trim() }, active: r.active, sellingPriceMinor: r.sellingPriceMinor ?? null, lowStockThreshold: r.lowStockThreshold ?? null }], { session });
          await this.ledger.applyMovement({ variantId: v.id, locationId: DEPOT_CODE, type: 'correction', onHandDelta: 0, reason: dto.reason, actor, session });
        }
        return { added: dto.rows.length };
      });
    } finally { await session.endSession(); }
  }

  /** Full history, including the archived Boutique movements (read-only audit trail). */
  async history(query: Record<string, string | undefined>) {
    const filter = { ...(query.variantId ? { variantId: query.variantId } : {}), ...(query.productId ? { productId: query.productId } : {}), ...(query.locationId ? { locationId: query.locationId } : {}) };
    const page = Math.max(1, Number(query.page) || 1);
    const [items, total] = await Promise.all([this.movements.find(filter).sort({ createdAt: -1 }).skip((page - 1) * 50).limit(50).lean(), this.movements.countDocuments(filter)]);
    return { items, total, page, totalPages: Math.ceil(total / 50) };
  }
}
