import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuditActor } from '@contracts';
import { Product } from '@/catalog/product.schema';
import { Variant } from '@/catalog/variant.schema';
import { StockItem } from './stock-item.schema';
import { StockMovement } from './stock-movement.schema';
import { StockLedgerService } from './stock-ledger.service';
import { ActivateMatrixDto, BoutiqueQuantityDto, SetModeDto, SetStockQuantitiesDto, VariantAdjustmentDto } from './variant-stock.dto';

export const combinationKey = (size: string, color: string) => JSON.stringify([size.trim().normalize('NFC').toLocaleLowerCase('fr'), color.trim().normalize('NFC').toLocaleLowerCase('fr')]);

@Injectable()
export class VariantStockService {
  constructor(
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(Variant.name) private readonly variants: Model<Variant>,
    @InjectModel(StockItem.name) private readonly items: Model<StockItem>,
    @InjectModel(StockMovement.name) private readonly movements: Model<StockMovement>,
    private readonly ledger: StockLedgerService,
  ) {}

  async configuration(productId: string) {
    const product = await this.products.findById(productId);
    if (!product) throw new NotFoundException('Produit introuvable');
    const variants = await this.variants.find({ productId, boutiquePool: { $ne: true } });
    const stock = await this.items.find({ variantId: { $in: variants.map(v => v.id) } });
    const boutique = await this.ledger.boutiqueBalance(productId);
    return { boutique, productId, name: product.name,
      model: product.inventoryModel ?? 'LEGACY',
      depotTrackingMode: product.depotTrackingMode ?? 'SIMPLE',
      boutiqueTrackingMode: product.boutiqueTrackingMode ?? 'SIMPLE',
      legacyStockQuantity: product.stockQuantity, options: product.options,
      variants: variants.map(v => ({ id: v.id, sku: v.sku, attributes: v.attributes, active: v.active, retired: v.retired, sellingPriceMinor: v.sellingPriceMinor, lowStockThreshold: v.lowStockThreshold,
        stock: stock.filter(s => s.variantId === v.id).map(s => ({ locationId: s.locationId, onHand: s.quantityOnHand, reserved: s.quantityReserved })) })) };
  }

  /** Allocations are explicit, never inferred from option labels or order history. */
  async activate(productId: string, dto: ActivateMatrixDto, actor: AuditActor) {
    if (!dto.reason.trim()) throw new BadRequestException('Motif obligatoire');
    const keys = dto.rows.map(r => combinationKey(r.size, r.color));
    if (new Set(keys).size !== keys.length || new Set(dto.rows.map(r => r.sku.trim())).size !== dto.rows.length) throw new BadRequestException('Combinaison ou SKU en double');
    if (dto.rows.some(r => !r.size.trim() || !r.color.trim() || !r.sku.trim())) throw new BadRequestException('Taille, couleur et SKU obligatoires');
    await this.variants.init();
    const session = await this.products.db.startSession();
    try {
      return await session.withTransaction(async () => {
        const product = await this.products.findById(productId).session(session);
        if (!product) throw new NotFoundException('Produit introuvable');
        if (product.inventoryModel === 'MATRIX') throw new ConflictException('Ce produit est déjà configuré. Utilisez les ajustements de stock.');
        const legacy = await this.variants.find({ productId, boutiquePool: { $ne: true } }).session(session);
        const legacyIds = legacy.map(v => v.id);
        const openTransfer = await this.products.db.collection('stock_transfers').findOne({ 'lines.variantId': { $in: legacyIds }, status: { $nin: ['RECEIVED', 'CANCELLED', 'REJECTED'] } }, { session, projection: { _id: 1 } });
        const openCount = await this.products.db.collection('stocktakes').findOne({ 'lines.variantId': { $in: legacyIds }, status: { $nin: ['POSTED', 'CANCELLED'] } }, { session, projection: { _id: 1 } });
        if (openTransfer || openCount) throw new ConflictException('Terminez ou annulez les transferts et inventaires ouverts de ce produit avant migration.');
        const openSessions = await this.products.db.collection('pos_cashier_sessions').find({ status: 'OPEN' }, { session, projection: { _id: 1 } }).toArray();
        const editableSale = openSessions.length ? await this.products.db.collection('pos_sales').findOne({ sessionId: { $in: openSessions.map(s => String(s._id)) }, status: 'COMPLETED', 'lines.variantId': { $in: legacyIds } }, { session, projection: { _id: 1 } }) : null;
        if (editableSale) throw new ConflictException('Clôturez les sessions de caisse contenant ce produit avant migration.');
        const stock = await this.items.find({ variantId: { $in: legacy.map(v => v.id) } }).session(session);
        if (stock.some(s => s.quantityReserved !== 0 || s.quantityOnHand < 0 || !['DEPOT', 'BOUTIQUE'].includes(s.locationId))) throw new ConflictException('Réconciliez les réservations et emplacements avant migration.');
        if (!stock.length && product.stockQuantity) throw new ConflictException('Stock historique sans registre : réconciliation requise avant allocation.');
        const before = { DEPOT: 0, BOUTIQUE: 0 };
        for (const s of stock) before[s.locationId as keyof typeof before] += s.quantityOnHand;
        if (dto.initialStock && (before.DEPOT !== 0 || before.BOUTIQUE !== 0 || dto.rows.some(r => r.boutique !== 0))) throw new BadRequestException('Le premier stock doit être ajouté au Dépôt sur un produit sans stock existant.');
        if (!dto.initialStock && ((!dto.replaceDepotStock && dto.rows.reduce((s, r) => s + r.depot, 0) !== before.DEPOT) || dto.rows.reduce((s, r) => s + r.boutique, 0) !== before.BOUTIQUE)) throw new BadRequestException(dto.replaceDepotStock ? `Les allocations doivent conserver le stock Boutique existant : ${before.BOUTIQUE}.` : `Les allocations doivent conserver Dépôt ${before.DEPOT} et Boutique ${before.BOUTIQUE}.`);
        const clash = await this.variants.exists({ sku: { $in: dto.rows.map(r => r.sku.trim()) } }).session(session);
        if (clash) throw new BadRequestException('Un SKU est déjà utilisé. Les SKU historiques restent réservés.');
        if (dto.dryRun) return { dryRun: true, before, variantCount: dto.rows.length };
        // Serialize with every movement using the legacy variants, including sales
        // that resolved their variant just before activation.
        await this.variants.updateMany({ productId, boutiquePool: { $ne: true } }, { $set: { retired: true, active: false }, $inc: { inventoryRevision: 1 } }, { session });
        for (const s of stock) if (s.quantityOnHand) await this.ledger.applyMovement({ variantId: s.variantId, locationId: s.locationId, type: 'correction', onHandDelta: -s.quantityOnHand, reference: `matrix:${productId}`, reason: dto.reason, actor, session, migration: true });
        for (let i = 0; i < dto.rows.length; i++) {
          const r = dto.rows[i];
          const [v] = await this.variants.create([{ productId, combinationKey: keys[i], attributes: { size: r.size.trim(), color: r.color.trim() }, sku: r.sku.trim(), active: r.active, sellingPriceMinor: r.sellingPriceMinor ?? null, lowStockThreshold: r.lowStockThreshold ?? null }], { session });
          for (const [locationId, qty] of [['DEPOT', r.depot], ['BOUTIQUE', r.boutique]] as const) await this.ledger.applyMovement({ variantId: v.id, locationId, type: dto.initialStock ? 'manual_adjust' : 'correction', onHandDelta: qty, reference: `matrix:${productId}`, reason: dto.reason, actor, session });
        }
        product.inventoryModel = 'MATRIX';
        product.depotTrackingMode = 'VARIANT';
        await product.save({ session });
        return { dryRun: false, before, variantCount: dto.rows.length };
      });
    } finally { await session.endSession(); }
  }

  async list(query: Record<string, string | undefined>) {
    const locationId = query.locationId === 'BOUTIQUE' ? 'BOUTIQUE' : 'DEPOT';
    const products = await this.products.find({ deletedAt: null, ...(query.productId ? { _id: query.productId } : {}) }).select({ name: 1, inventoryModel: 1 });
    if (locationId === 'BOUTIQUE' && (!query.productId || query.groupBy === 'product')) {
      const rows = await Promise.all(products.map(async p => {
        const balance = await this.ledger.boutiqueBalance(p.id);
        return { productId: p.id, variantId: p.id, productName: p.name, size: '', color: '', sku: '', active: true, migrationRequired: false, onHand: balance.onHand, reserved: balance.reserved, available: balance.onHand - balance.reserved, threshold: 3, locationId };
      }));
      const search = query.search?.trim().toLocaleLowerCase('fr');
      const filtered = rows.filter(r => (!search || r.productName.toLocaleLowerCase('fr').includes(search)) && (query.status === 'out' ? r.available <= 0 : query.status === 'low' ? r.available > 0 && r.available <= r.threshold : query.status === 'in' ? r.available > 0 : true));
      filtered.sort((a,b) => query.sort === 'available' ? a.available - b.available : a.productName.localeCompare(b.productName, 'fr'));
      const page = Math.max(1, Number(query.page) || 1);
      return { items: filtered.slice((page - 1) * 30, page * 30), total: filtered.length, totalPages: Math.ceil(filtered.length / 30), page, sizes: [], colors: [], products: products.map(p => ({ id: p.id, name: p.name })) };
    }
    const byId = new Map(products.map(p => [p.id, p]));
    const variants = await this.variants.find({ productId: { $in: [...byId.keys()] }, retired: { $ne: true }, boutiquePool: { $ne: true } });
    const stock = await this.items.find({ variantId: { $in: variants.map(v => v.id) }, locationId });
    const byVariant = new Map(stock.map(s => [s.variantId, s]));
    let rows = variants.map(v => {
      const s = byVariant.get(v.id), p = byId.get(v.productId)!;
      const onHand = s?.quantityOnHand ?? 0, reserved = s?.quantityReserved ?? 0;
      return { variantId: v.id, productId: v.productId, productName: p.name, size: v.attributes.size ?? '', color: v.attributes.color ?? '', sku: v.sku, active: v.active, migrationRequired: p.inventoryModel !== 'MATRIX', onHand, reserved, available: onHand - reserved, threshold: v.lowStockThreshold ?? s?.lowStockThreshold ?? 3, locationId };
    });
    if (locationId === 'BOUTIQUE' && query.productId) {
      const balance = await this.ledger.boutiqueBalance(query.productId);
      rows = rows.map(row => ({ ...row, onHand: balance.onHand, reserved: balance.reserved, available: balance.onHand - balance.reserved }));
    }
    if (query.groupBy === 'product') {
      const grouped = new Map<string, typeof rows[number]>();
      for (const row of rows) {
        const existing = grouped.get(row.productId);
        if (existing) {
          existing.onHand += row.onHand;
          existing.reserved += row.reserved;
          existing.available += row.available;
          existing.threshold += row.threshold;
          existing.active ||= row.active;
        } else grouped.set(row.productId, { ...row, size: '', color: '', sku: '' });
      }
      rows = [...grouped.values()];
    }
    const sizes = [...new Set(rows.map(r => r.size).filter(Boolean))].sort();
    const colors = [...new Set(rows.map(r => r.color).filter(Boolean))].sort();
    const search = query.search?.trim().toLocaleLowerCase('fr');
    rows = rows.filter(r => (!search || `${r.productName} ${r.sku} ${r.size} ${r.color}`.toLocaleLowerCase('fr').includes(search)) && (!query.size || r.size === query.size) && (!query.color || r.color === query.color) && (query.status === 'out' ? r.available <= 0 : query.status === 'low' ? r.available > 0 && r.available <= r.threshold : query.status === 'in' ? r.available > 0 : true));
    rows.sort((a, b) => query.sort === 'available' ? a.available - b.available : a.productName.localeCompare(b.productName, 'fr') || a.sku.localeCompare(b.sku));
    const page = Math.max(1, Number(query.page) || 1), perPage = 30;
    return { items: rows.slice((page - 1) * perPage, page * perPage), total: rows.length, totalPages: Math.ceil(rows.length / perPage), page, sizes, colors, products: products.map(p => ({ id: p.id, name: p.name })) };
  }

  async setBoutiqueQuantity(productId: string, dto: BoutiqueQuantityDto, actor: AuditActor) {
    const session = await this.products.db.startSession();
    try {
      return await session.withTransaction(async () => {
        const product = await this.products.findById(productId).session(session);
        if (!product || product.deletedAt) throw new NotFoundException('Produit introuvable');
        if ((product.boutiqueTrackingMode ?? 'SIMPLE') === 'VARIANT') throw new BadRequestException('Ce produit utilise le stock par variante en Boutique. Utilisez le tableau taille/couleur.');
        const pool = await this.ledger.consolidateBoutique(productId, actor, session);
        const before = await this.ledger.boutiqueBalance(productId, session);
        if (before.onHand !== dto.expectedQuantity) throw new ConflictException('Le stock a changé. Actualisez avant de réessayer.');
        const delta = dto.quantity - before.onHand;
        if (delta) await this.ledger.applyMovement({ variantId: pool.id, locationId: 'BOUTIQUE', type: 'manual_adjust', onHandDelta: delta, requireAvailableAtLeast: delta < 0 ? -delta : undefined, actor, session, reason: 'Quantité produit Boutique saisie' });
        return { ok: true };
      });
    } finally { await session.endSession(); }
  }

  async setQuantities(productId: string, dto: SetStockQuantitiesDto, actor: AuditActor) {
    if (dto.locationId === 'BOUTIQUE') {
      // In BOUTIQUE+VARIANT mode, per-variant quantities are allowed.
      const product = await this.products.findById(productId);
      if ((product?.boutiqueTrackingMode ?? 'SIMPLE') !== 'VARIANT') throw new BadRequestException('Ce produit utilise le stock global Boutique. Saisissez une quantité globale.');
    }
    if (new Set(dto.rows.map(r => r.variantId)).size !== dto.rows.length) throw new BadRequestException('Variante en double');
    const session = await this.products.db.startSession();
    try {
      return await session.withTransaction(async () => {
        const product = await this.products.findById(productId).session(session);
        if (!product || product.inventoryModel !== 'MATRIX') throw new BadRequestException('Configurez les variantes en premier.');
        for (const row of dto.rows) {
          const variant = await this.variants.findOne({ _id: row.variantId, productId, retired: { $ne: true } }).session(session);
          if (!variant) throw new BadRequestException('Variante invalide pour ce produit');
          const item = await this.items.findOne({ variantId: row.variantId, locationId: dto.locationId }).session(session);
          const before = item?.quantityOnHand ?? 0;
          if (before !== row.expectedQuantity) throw new ConflictException('Le stock a changé. Actualisez le tableau avant de réessayer.');
          const delta = row.quantity - before;
          if (delta) await this.ledger.applyMovement({ variantId: row.variantId, locationId: dto.locationId, type: 'manual_adjust', onHandDelta: delta, requireAvailableAtLeast: delta < 0 ? -delta : undefined, reason: 'Quantité saisie dans le tableau couleur / taille', actor, session });
        }
        return { ok: true };
      });
    } finally { await session.endSession(); }
  }

  async adjust(dto: VariantAdjustmentDto, actor: AuditActor) {
    if (!dto.reason.trim() || !dto.qty) throw new BadRequestException('Quantité non nulle et motif obligatoires');
    await this.ledger.applyMovement({ variantId: dto.variantId, locationId: dto.locationId, type: 'manual_adjust', onHandDelta: dto.qty, requireAvailableAtLeast: dto.qty < 0 ? -dto.qty : undefined, reason: dto.reason, actor });
    return { ok: true };
  }

  async addVariants(productId: string, dto: ActivateMatrixDto, actor: AuditActor) {
    if (!dto.reason.trim()) throw new BadRequestException('Motif obligatoire');
    if (dto.rows.some(r => !r.size.trim() || !r.color.trim() || !r.sku.trim() || r.depot || r.boutique)) throw new BadRequestException('Les nouvelles variantes commencent à zéro. Ajoutez le stock par ajustement après création.');
    const keys = dto.rows.map(r => combinationKey(r.size, r.color));
    if (new Set(keys).size !== keys.length || new Set(dto.rows.map(r => r.sku.trim())).size !== dto.rows.length) throw new BadRequestException('Combinaison ou SKU en double');
    await this.variants.init();
    const session = await this.products.db.startSession();
    try {
      return await session.withTransaction(async () => {
        const product = await this.products.findById(productId).session(session);
        if (!product || product.inventoryModel !== 'MATRIX') throw new BadRequestException('Activez la matrice initiale en premier.');
        if (await this.variants.exists({ productId, combinationKey: { $in: keys } }).session(session)) throw new ConflictException('Cette combinaison existe déjà. Son identité reste inchangée.');
        if (await this.variants.exists({ sku: { $in: dto.rows.map(r => r.sku.trim()) } }).session(session)) throw new ConflictException('SKU déjà utilisé');
        if (dto.dryRun) return { dryRun: true, variantCount: dto.rows.length };
        for (let i = 0; i < dto.rows.length; i++) {
          const r = dto.rows[i];
          if (await this.variants.exists({ productId, combinationKey: keys[i] }).session(session)) throw new ConflictException('Cette combinaison existe déjà. Son identité reste inchangée.');
          if (await this.variants.exists({ sku: r.sku.trim() }).session(session)) throw new ConflictException('SKU déjà utilisé');
          const [v] = await this.variants.create([{ productId, combinationKey: keys[i], sku: r.sku.trim(), attributes: { size: r.size.trim(), color: r.color.trim() }, active: r.active, sellingPriceMinor: r.sellingPriceMinor ?? null, lowStockThreshold: r.lowStockThreshold ?? null }], { session });
          for (const locationId of ['DEPOT', 'BOUTIQUE']) await this.ledger.applyMovement({ variantId: v.id, locationId, type: 'correction', onHandDelta: 0, reason: dto.reason, actor, session });
        }
        return { added: dto.rows.length };
      });
    } finally { await session.endSession(); }
  }

  async history(query: Record<string, string | undefined>) {
    const filter = { ...(query.variantId ? { variantId: query.variantId } : {}), ...(query.locationId ? { locationId: query.locationId } : {}) };
    const page = Math.max(1, Number(query.page) || 1);
    const [items, total] = await Promise.all([this.movements.find(filter).sort({ createdAt: -1 }).skip((page - 1) * 50).limit(50).lean(), this.movements.countDocuments(filter)]);
    return { items, total, page, totalPages: Math.ceil(total / 50) };
  }

  /**
   * Switch the inventory tracking mode for a product at one location.
   *
   * VARIANT → SIMPLE (either location):
   *   Sums current per-variant stock at that location, writes it to the pool
   *   (BOUTIQUE) or the single legacy variant (DEPOT), sets the mode flag.
   *   Historical movements are preserved — nothing is deleted.
   *
   * SIMPLE → VARIANT (BOUTIQUE):
   *   Requires `distribution` when current global qty > 0.  Each distribution
   *   row must carry a valid variantId (a non-retired MATRIX variant for this
   *   product) and a qty.  Total must equal the current global Boutique qty.
   *   On confirm: pool stock is zeroed via correction movements, per-variant
   *   BOUTIQUE stock items are written, mode flag is set.
   *
   * SIMPLE → VARIANT (DEPOT):
   *   Delegates to the existing activate() / MATRIX activation flow.  Call
   *   POST /products/:id (ActivateMatrixDto) instead — this endpoint refuses
   *   the combination to avoid double-activating.
   */
  async setMode(productId: string, dto: SetModeDto, actor: AuditActor) {
    if (!dto.reason.trim()) throw new BadRequestException('Motif obligatoire');
    const session = await this.products.db.startSession();
    try {
      return await session.withTransaction(async () => {
        const product = await this.products.findById(productId).session(session);
        if (!product || product.deletedAt) throw new NotFoundException('Produit introuvable');

        const currentMode = dto.location === 'DEPOT'
          ? (product.depotTrackingMode ?? 'SIMPLE')
          : (product.boutiqueTrackingMode ?? 'SIMPLE');

        if (currentMode === dto.mode) return { ok: true, noChange: true };

        /* ── VARIANT → SIMPLE ──────────────────────────────────────────── */
        if (dto.mode === 'SIMPLE') {
          if (dto.location === 'BOUTIQUE') {
            // Aggregate all BOUTIQUE variant stock into the pool (which
            // consolidateBoutique already does), then just flip the flag.
            await this.ledger.consolidateBoutique(productId, actor, session);
            product.boutiqueTrackingMode = 'SIMPLE';
          } else {
            // DEPOT: sum all active per-variant DEPOT stocks into one correction
            // on the first non-retired variant, retire the matrix variants,
            // reset inventoryModel to LEGACY.
            const matrixVariants = await this.variants.find({ productId, retired: { $ne: true }, boutiquePool: { $ne: true } }).session(session);
            const depotItems = await this.items.find({ variantId: { $in: matrixVariants.map(v => v.id) }, locationId: 'DEPOT' }).session(session);
            const totalDepot = depotItems.reduce((s, i) => s + i.quantityOnHand, 0);
            // Zero out each variant's DEPOT stock
            for (const item of depotItems) {
              if (!item.quantityOnHand && !item.quantityReserved) continue;
              await this.ledger.applyMovement({ variantId: item.variantId, locationId: 'DEPOT', type: 'correction', onHandDelta: -item.quantityOnHand, reason: dto.reason, actor, session, migration: true });
            }
            // Retire all matrix variants (non-pool only)
            await this.variants.updateMany({ productId, boutiquePool: { $ne: true } }, { $set: { retired: true, active: false }, $inc: { inventoryRevision: 1 } }, { session });
            // Create a single plain legacy variant for DEPOT SIMPLE tracking
            const legacySku = `${product.slug}-${Date.now().toString(36)}`;
            const [newLegacy] = await this.variants.create([{ productId, sku: legacySku, attributes: {}, active: product.status !== 'private', sellingPriceMinor: null, boutiquePool: false }], { session });
            if (totalDepot > 0) {
              await this.ledger.applyMovement({ variantId: newLegacy.id, locationId: 'DEPOT', type: 'correction', onHandDelta: totalDepot, reason: dto.reason, actor, session, migration: true });
            }
            product.inventoryModel = 'LEGACY';
            product.depotTrackingMode = 'SIMPLE';

          }
          await product.save({ session });
          return { ok: true, mode: dto.mode };
        }

        /* ── SIMPLE → VARIANT ──────────────────────────────────────────── */
        if (dto.location === 'DEPOT') {
          // DEPOT SIMPLE → VARIANT requires the full ActivateMatrixDto flow.
          throw new BadRequestException('Pour activer le stock par variante au Dépôt, utilisez la section "Répartir par taille et couleur" (POST /products/:id).');
        }

        // BOUTIQUE SIMPLE → VARIANT
        if (product.depotTrackingMode !== 'VARIANT') {
          throw new BadRequestException('Le produit doit d\'abord être configuré en variantes au Dépôt (MATRIX) avant d\'activer les variantes en Boutique.');
        }
        const pool = await this.ledger.consolidateBoutique(productId, actor, session);
        const before = await this.ledger.boutiqueBalance(productId, session);

        if (dto.dryRun) {
          return { dryRun: true, currentGlobalQty: before.onHand, variantCount: (await this.variants.countDocuments({ productId, retired: { $ne: true }, boutiquePool: { $ne: true } })) };
        }

        if (before.onHand > 0) {
          // Distribution is required to redistribute pool stock to variants
          if (!dto.distribution?.length) {
            throw new BadRequestException(`Stock Boutique actuel : ${before.onHand}. Fournissez la répartition par variante.`);
          }
          const totalDistributed = dto.distribution.reduce((s, r) => s + r.qty, 0);
          if (totalDistributed !== before.onHand) {
            throw new BadRequestException(`Total distribué (${totalDistributed}) ≠ stock actuel (${before.onHand}). Corrigez la répartition.`);
          }
          // Zero the pool
          if (before.onHand) {
            await this.ledger.applyMovement({ variantId: pool.id, locationId: 'BOUTIQUE', type: 'correction', onHandDelta: -before.onHand, reason: dto.reason, actor, session, migration: true });
          }
          // Credit each variant at BOUTIQUE
          for (const row of dto.distribution) {
            const variant = await this.variants.findOne({ _id: row.variantId, productId, retired: { $ne: true }, boutiquePool: { $ne: true } }).session(session);
            if (!variant) throw new BadRequestException(`Variante introuvable: ${row.variantId}`);
            if (row.qty > 0) {
              await this.ledger.applyMovement({ variantId: variant.id, locationId: 'BOUTIQUE', type: 'correction', onHandDelta: row.qty, reason: dto.reason, actor, session, migration: true });
            }
          }
        }

        product.boutiqueTrackingMode = 'VARIANT';
        await product.save({ session });
        return { ok: true, mode: dto.mode };
      });
    } finally { await session.endSession(); }
  }
}

