import { BadRequestException, ConflictException } from '@nestjs/common';
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose, { Connection, Model } from 'mongoose';
import { CategoriesService } from '@/catalog/categories.service';
import { Category, CategorySchema } from '@/catalog/category.schema';
import { LocationsService } from '@/catalog/locations.service';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { Product, ProductSchema } from '@/catalog/product.schema';
import { ProductsService } from '@/catalog/products.service';
import { Variant, VariantSchema } from '@/catalog/variant.schema';
import { InventoryService } from '@/inventory/inventory.service';
import { OnlineAvailabilityService } from '@/inventory/online-availability.service';
import { StockItem, StockItemSchema } from '@/inventory/stock-item.schema';
import { StockLedgerService } from '@/inventory/stock-ledger.service';
import { StockMovement, StockMovementSchema } from '@/inventory/stock-movement.schema';
import { VariantStockService } from '@/inventory/variant-stock.service';
import { MediaService } from '@/media/media.service';
import { ArchiveBoutiqueStockCommand } from '@/migration/commands/archive-boutique-stock.command';
import { PosCatalogService } from '@/pos/pos-catalog.service';
import { PurchaseOrder, PurchaseOrderSchema } from '@/purchase-orders/purchase-order.schema';
import { SettingsService } from '@/settings/settings.service';
import { REDIS } from '@/redis/redis.constants';

/**
 * ONE inventory (DEPOT): website, admin and POS read and write the same quantity.
 * Needs a MongoDB replica set (the ledger uses transactions). Default: the
 * throwaway container on :27098; override with MONGODB_STOCK_TEST_URI. Skips
 * itself when it is unreachable, like the other integration specs.
 */
const URI = process.env.MONGODB_STOCK_TEST_URI ?? 'mongodb://127.0.0.1:27098/mzali_single_depot?directConnection=true';
const ADMIN = { type: 'employee' as const, id: 'admin-1', name: 'Admin' };
const POS = { type: 'employee' as const, id: 'cashier-1', name: 'Caissier' };

describe('Single DEPOT inventory (integration)', () => {
  let infra = true;
  let connection: Connection;
  let products: ProductsService;
  let variantsSvc: ProductVariantsService;
  let inventory: InventoryService;
  let stock: VariantStockService;
  let ledger: StockLedgerService;
  let availability: OnlineAvailabilityService;
  let posCatalog: PosCatalogService;
  let variantModel: Model<Variant>;
  let itemModel: Model<StockItem>;
  let movementModel: Model<StockMovement>;
  let productModel: Model<Product>;
  const settingsStub = { getInventorySettings: async () => ({ enabled: true }), getRaw: async () => null, setRaw: async () => undefined };
  const marker: Record<string, unknown> = {};
  const settingsWithMarker = { ...settingsStub, getRaw: async (k: string) => marker[k] ?? null, setRaw: async (k: string, v: Record<string, unknown>) => { marker[k] = v; } };

  const onHand = async (variantId: string, location = 'DEPOT') => (await itemModel.findOne({ variantId, locationId: location }))?.quantityOnHand ?? 0;

  /** Product tracked per exact variant: rows = [size, color, depotQty]. */
  async function matrixProduct(name: string, rows: [string, string, number][]) {
    const created = await products.create({
      name, regularPrice: 30, status: 'published',
      options: [{ label: 'couleur', type: 'text', values: [...new Set(rows.map((r) => r[1]))] }, { label: 'tallie', type: 'text', values: [...new Set(rows.map((r) => r[0]))] }],
    });
    await stock.activate(created.id, {
      reason: 'test', initialStock: true,
      rows: rows.map(([size, color, depot], i) => ({ size, color, sku: `${name}-${i}`.toUpperCase(), active: true, depot })),
    }, ADMIN);
    const vs = await variantModel.find({ productId: created.id, retired: { $ne: true }, boutiquePool: { $ne: true } });
    const byKey = (size: string, color: string) => vs.find((v) => v.attributes.size === size && v.attributes.color === color)!;
    return { productId: created.id, byKey };
  }

  /** Product without variants: one quantity on its single default variant. */
  async function simpleProduct(name: string, qty: number) {
    const created = await products.create({ name, regularPrice: 10, status: 'published' });
    const v = (await variantsSvc.findByProductId(created.id))!;
    if (qty) await ledger.applyMovement({ variantId: v.id, locationId: 'DEPOT', type: 'manual_adjust', onHandDelta: qty, actor: ADMIN });
    return { productId: created.id, variantId: v.id };
  }

  beforeAll(async () => {
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [
          MongooseModule.forRoot(URI, { serverSelectionTimeoutMS: 3000 }),
          MongooseModule.forFeature([
            { name: Product.name, schema: ProductSchema },
            { name: Category.name, schema: CategorySchema },
            { name: Variant.name, schema: VariantSchema },
            { name: StockItem.name, schema: StockItemSchema },
            { name: StockMovement.name, schema: StockMovementSchema },
            { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
          ]),
        ],
        providers: [
          ProductsService, ProductVariantsService, InventoryService, VariantStockService, StockLedgerService, OnlineAvailabilityService, PosCatalogService,
          { provide: MediaService, useValue: { assertAndGetUrls: async () => new Map(), getUrlsByIds: async () => new Map(), markAttached: async () => undefined, markDetached: async () => undefined, deleteOrphaned: async () => false } },
          { provide: LocationsService, useValue: { getDefaultOnlineLocationCode: async () => 'DEPOT', requireByCode: async () => ({}) } },
          { provide: SettingsService, useValue: settingsWithMarker },
          { provide: CategoriesService, useValue: { list: async () => [] } },
          { provide: REDIS, useValue: { publish: async () => 0 } },
        ],
      }).compile();
      await moduleRef.init();
      connection = moduleRef.get<Connection>(getConnectionToken());
      products = moduleRef.get(ProductsService);
      variantsSvc = moduleRef.get(ProductVariantsService);
      inventory = moduleRef.get(InventoryService);
      stock = moduleRef.get(VariantStockService);
      ledger = moduleRef.get(StockLedgerService);
      availability = moduleRef.get(OnlineAvailabilityService);
      posCatalog = moduleRef.get(PosCatalogService);
      variantModel = moduleRef.get<Model<Variant>>(getModelToken(Variant.name));
      itemModel = moduleRef.get<Model<StockItem>>(getModelToken(StockItem.name));
      movementModel = moduleRef.get<Model<StockMovement>>(getModelToken(StockMovement.name));
      productModel = moduleRef.get<Model<Product>>(getModelToken(Product.name));
      await connection.dropDatabase();
      await variantModel.init();
      await itemModel.init();
    } catch (e) {
      infra = false;
      console.warn(`[single-depot-stock] MongoDB replica set unreachable at ${URI}; skipping. (${(e as Error).message})`);
    }
  }, 60000);

  afterAll(async () => { if (infra) { await connection.dropDatabase(); await mongoose.disconnect(); } });
  beforeEach(async () => { if (infra) { await connection.dropDatabase(); await variantModel.init(); await itemModel.init(); } }, 30000);

  it('S=10, M=5, XL=0: storefront, admin and POS all see the same DEPOT quantities', async () => {
    if (!infra) return;
    const { productId, byKey } = await matrixProduct('Bagy', [['S', 'Noir', 10], ['M', 'Noir', 5], ['XL', 'Noir', 0]]);

    const storefront = (await products.getById(productId))!;
    const seen = Object.fromEntries((storefront.variants ?? []).map((v) => [v.size, v.available]));
    expect(seen).toEqual({ S: 10, M: 5, XL: 0 }); // XL shows as sold out (0)

    const admin = await inventory.getAvailability(productId);
    expect(admin.mode).toBe('VARIANT');
    expect(admin.total).toBe(15);
    expect(Object.fromEntries(admin.variants.map((v) => [v.size, v.available]))).toEqual({ S: 10, M: 5, XL: 0 });

    const till = (await posCatalog.getCatalog()).items.filter((i) => i.productId === productId);
    expect(till).toHaveLength(3); // one till item per exact variant
    expect(Object.fromEntries(till.map((i) => [i.size, i.available]))).toEqual({ S: 10, M: 5, XL: 0 });

    // admin order limits
    expect((await inventory.validateOrderAvailability({ channel: 'ADMIN', productId, variantId: byKey('S', 'Noir').id, quantity: 10 })).valid).toBe(true);
    expect((await inventory.validateOrderAvailability({ channel: 'ADMIN', productId, variantId: byKey('S', 'Noir').id, quantity: 11 })).valid).toBe(false);
    expect((await inventory.validateOrderAvailability({ channel: 'ADMIN', productId, variantId: byKey('M', 'Noir').id, quantity: 6 })).valid).toBe(false);
    const xl = await inventory.validateOrderAvailability({ channel: 'ADMIN', productId, variantId: byKey('XL', 'Noir').id, quantity: 1 });
    expect(xl.valid).toBe(false);
    expect(xl.error).toMatch(/ÉPUISÉ/);
    // total stock never approves a sold-out variant
    expect(admin.total).toBeGreaterThan(0);
  });

  it('POS sells S ×2: DEPOT 10 -> 8, and website, admin and till all show 8', async () => {
    if (!infra) return;
    const { productId, byKey } = await matrixProduct('Bagy', [['S', 'Noir', 10]]);
    const s = byKey('S', 'Noir');
    // exactly what PosSalesService does for a sale line
    await ledger.applyMovement({ variantId: s.id, locationId: 'DEPOT', type: 'pos_sale', onHandDelta: -2, requireAvailableAtLeast: 2, reference: 'sale-1', actor: POS });
    expect(await onHand(s.id)).toBe(8);
    expect((await products.getById(productId))!.variants![0].available).toBe(8);
    expect((await inventory.getAvailability(productId)).variants[0].available).toBe(8);
    expect((await posCatalog.getCatalog()).items.find((i) => i.variantId === s.id)!.available).toBe(8);
    expect(await availability.resolve(s.id)).toBe(8);
  });

  it('product WITHOUT variants: one quantity, qty 5 allowed, 6 blocked, 0 = ÉPUISÉ', async () => {
    if (!infra) return;
    const { productId } = await simpleProduct('Casquette', 5);
    expect((await inventory.getAvailability(productId)).mode).toBe('SIMPLE');
    expect((await inventory.getAvailability(productId)).total).toBe(5);
    expect((await inventory.validateOrderAvailability({ productId, quantity: 5 })).valid).toBe(true);
    const over = await inventory.validateOrderAvailability({ productId, quantity: 6 });
    expect(over.valid).toBe(false);
    const { productId: empty } = await simpleProduct('Vide', 0);
    const res = await inventory.validateOrderAvailability({ productId: empty, quantity: 1 });
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/ÉPUISÉ/);
  });

  it('Boutique is gone: the ledger refuses any non-DEPOT movement and archived pool variants', async () => {
    if (!infra) return;
    const { variantId } = await simpleProduct('X', 3);
    await expect(ledger.applyMovement({ variantId, locationId: 'BOUTIQUE', type: 'manual_adjust', onHandDelta: 5, actor: ADMIN })).rejects.toBeInstanceOf(BadRequestException);
    expect(await onHand(variantId, 'BOUTIQUE')).toBe(0);
    expect(await onHand(variantId)).toBe(3);
  });

  it('a disabled variant keeps its stock but is not sold; it can be re-enabled', async () => {
    if (!infra) return;
    const { productId, byKey } = await matrixProduct('Noir', [['XL', 'Noir', 5], ['M', 'Noir', 4]]);
    const xl = byKey('XL', 'Noir');
    await stock.saveStock(productId, { rows: [{ variantId: xl.id, active: false }] }, ADMIN);
    expect(await onHand(xl.id)).toBe(5); // stock kept
    const res = await inventory.validateOrderAvailability({ productId, variantId: xl.id, quantity: 1 });
    expect(res.valid).toBe(false);
    expect((await products.getById(productId))!.variants!.find((v) => v.size === 'XL')!.active).toBe(false);
    expect((await posCatalog.getCatalog()).items.some((i) => i.variantId === xl.id)).toBe(false); // not on the till either
    const overview = await stock.overview({});
    expect(overview.items.find((r) => r.productId === productId)!.available).toBe(4); // only sellable stock counts
    expect(overview.items.find((r) => r.productId === productId)!.disabledStock).toBe(5);
    await stock.saveStock(productId, { rows: [{ variantId: xl.id, active: true }] }, ADMIN);
    expect((await inventory.validateOrderAvailability({ productId, variantId: xl.id, quantity: 5 })).valid).toBe(true);
  });

  it('stock adjustments go through the ledger as manual_adjust with before/after (+5, -4)', async () => {
    if (!infra) return;
    const { productId, byKey } = await matrixProduct('Adj', [['S', 'Noir', 10]]);
    const s = byKey('S', 'Noir');
    await stock.saveStock(productId, { rows: [{ variantId: s.id, quantity: 15, expectedQuantity: 10 }], reason: 'inventaire' }, ADMIN);
    await stock.saveStock(productId, { rows: [{ variantId: s.id, quantity: 11, expectedQuantity: 15 }] }, ADMIN);
    const moves = await movementModel.find({ variantId: s.id, type: 'manual_adjust' }).sort({ createdAt: 1 });
    const last2 = moves.slice(-2);
    expect(last2.map((m) => m.qty)).toEqual([5, -4]);
    expect(last2.map((m) => [m.onHandBefore, m.onHandAfter])).toEqual([[10, 15], [15, 11]]);
    expect(last2[0].actor.id).toBe('admin-1');
    expect(last2[0].reason).toBe('inventaire');
  });

  it('a stale adjustment (someone else changed the stock) is refused and changes nothing', async () => {
    if (!infra) return;
    const { productId, byKey } = await matrixProduct('Stale', [['S', 'Noir', 10]]);
    const s = byKey('S', 'Noir');
    await ledger.applyMovement({ variantId: s.id, locationId: 'DEPOT', type: 'pos_sale', onHandDelta: -3, actor: POS });
    await expect(stock.saveStock(productId, { rows: [{ variantId: s.id, quantity: 20, expectedQuantity: 10 }] }, ADMIN)).rejects.toBeInstanceOf(ConflictException);
    expect(await onHand(s.id)).toBe(7);
  });

  it('SAVE-TIME check: admin saw 10, another sale took 3 -> saving 10 is refused with the exact line and 7 left', async () => {
    if (!infra) return;
    const { productId, byKey } = await matrixProduct('Live', [['XL', 'Noir', 10]]);
    const xl = byKey('XL', 'Noir');
    expect((await inventory.getAvailability(productId)).variants[0].available).toBe(10); // what the employee saw
    await ledger.applyMovement({ variantId: xl.id, locationId: 'DEPOT', type: 'pos_sale', onHandDelta: -3, actor: POS });
    let body: Record<string, unknown> | undefined;
    try {
      await inventory.assertOrderAvailability({ channel: 'ADMIN', productId, variantId: xl.id, quantity: 10 });
    } catch (e) { body = (e as BadRequestException).getResponse() as Record<string, unknown>; }
    expect(body).toBeDefined();
    expect(body!.message).toBe('Stock modifié pendant la saisie. Il reste 7 unités de XL / Noir.');
    expect(body).toMatchObject({ code: 'INSUFFICIENT_STOCK', productId, variantId: xl.id, available: 7, requested: 10 });
  });

  it('CONFIRMED-ORDER EDIT uses the delta: 5 held + 3 free -> 7 ok, 9 rejected', async () => {
    if (!infra) return;
    const { productId, byKey } = await matrixProduct('Delta', [['XL', 'Noir', 3]]); // 3 free (the 5 are already deducted)
    const xl = byKey('XL', 'Noir');
    expect((await inventory.validateOrderAvailability({ channel: 'ADMIN', productId, variantId: xl.id, quantity: 7, existingQuantity: 5 })).valid).toBe(true); // needs 2
    const bad = await inventory.validateOrderAvailability({ channel: 'ADMIN', productId, variantId: xl.id, quantity: 9, existingQuantity: 5 }); // needs 4
    expect(bad.valid).toBe(false);
    expect(bad.requiredDelta).toBe(4);
    expect(bad.stock).toBe(3);
  });

  it('OVERSELL: two sales fighting for the last unit -> exactly one wins, stock never negative', async () => {
    if (!infra) return;
    const { variantId } = await simpleProduct('Last', 1);
    const sale = (id: string) => ledger.applyMovement({ variantId, locationId: 'DEPOT', type: 'pos_sale', onHandDelta: -1, requireAvailableAtLeast: 1, reference: id, actor: POS });
    const results = await Promise.allSettled([sale('a'), sale('b')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await onHand(variantId)).toBe(0);
  });

  it('a product without variants can be turned into a per-variant one by explicit allocation', async () => {
    if (!infra) return;
    const { productId, variantId } = await simpleProduct('Conv', 12);
    await productModel.updateOne({ _id: productId }, { $set: { options: [{ label: 'couleur', type: 'text', values: ['Noir'] }, { label: 'tallie', type: 'text', values: ['S', 'M'] }] } });
    await stock.activate(productId, { reason: 'répartition', rows: [
      { size: 'S', color: 'Noir', sku: 'CONV-S', active: true, depot: 7 },
      { size: 'M', color: 'Noir', sku: 'CONV-M', active: true, depot: 5 },
    ] }, ADMIN);
    const a = await inventory.getAvailability(productId);
    expect(a.mode).toBe('VARIANT');
    expect(a.total).toBe(12);
    expect(await onHand(variantId)).toBe(0); // old single quantity zeroed by a correction movement, history kept
    await expect(stock.activate(productId, { reason: 'x', rows: [{ size: 'S', color: 'Noir', sku: 'CONV-S2', active: true, depot: 1 }] }, ADMIN)).rejects.toBeInstanceOf(ConflictException);
  });

  describe('archive:boutique-stock migration', () => {
    const marker2 = (): Record<string, unknown> => marker['migration:single-depot-inventory'] as Record<string, unknown>;

    async function seedBoutique() {
      const { productId, variantId } = await simpleProduct('Mixte', 40);
      await itemModel.collection.insertOne({ variantId, locationId: 'BOUTIQUE', quantityOnHand: 9, quantityReserved: 0, reorderPoint: 0, targetStockLevel: null, lowStockThreshold: null, averageCostMinor: null, lastPurchaseCostMinor: null });
      const pool = await variantModel.create({ productId, sku: `BOUTIQUE-${productId}`, combinationKey: '__boutique_pool__', boutiquePool: true, attributes: {}, active: true, retired: false });
      await itemModel.collection.insertOne({ variantId: pool.id, locationId: 'BOUTIQUE', quantityOnHand: 100, quantityReserved: 0, reorderPoint: 0, targetStockLevel: null, lowStockThreshold: null, averageCostMinor: null, lastPurchaseCostMinor: null });
      await movementModel.collection.insertOne({ variantId: pool.id, productId, locationId: 'BOUTIQUE', type: 'pos_sale', qty: -1, onHandBefore: 101, onHandAfter: 100, reservedBefore: 0, reservedAfter: 0, actor: POS, createdAt: new Date() });
      const cmd = new ArchiveBoutiqueStockCommand(itemModel, variantModel, productModel, connection, settingsWithMarker as never);
      return { productId, variantId, pool, cmd };
    }

    it('dry-run changes nothing', async () => {
      if (!infra) return;
      const { cmd, variantId } = await seedBoutique();
      await cmd.run([], { dryRun: true });
      expect(await onHand(variantId, 'BOUTIQUE')).toBe(9);
      expect(await connection.collection('stock_items_boutique_archive').countDocuments()).toBe(0);
    });

    it('archives Boutique (snapshot + relabel), never merges it into DEPOT, keeps history, is idempotent', async () => {
      if (!infra) return;
      const { cmd, productId, variantId, pool } = await seedBoutique();
      await cmd.run([], {});
      expect(await onHand(variantId, 'BOUTIQUE')).toBe(0);
      expect(await onHand(variantId, 'BOUTIQUE_ARCHIVED')).toBe(9);
      expect(await onHand(variantId)).toBe(40); // DEPOT untouched: 40, NOT 49
      expect(await connection.collection('stock_items_boutique_archive').countDocuments()).toBe(2);
      expect((await variantModel.findById(pool.id))!.retired).toBe(true);
      expect(await movementModel.countDocuments({ locationId: 'BOUTIQUE', type: 'pos_sale' })).toBe(1); // history intact
      expect((await inventory.getAvailability(productId)).total).toBe(40);
      expect(marker2().archivedUnits).toBe(109);
      await cmd.run([], {}); // idempotent
      expect(await connection.collection('stock_items_boutique_archive').countDocuments()).toBe(2);
      expect(await onHand(variantId)).toBe(40);
    });

    it('rollback restores the snapshot', async () => {
      if (!infra) return;
      const { cmd, variantId, pool } = await seedBoutique();
      await cmd.run([], {});
      await cmd.run([], { rollback: true });
      expect(await onHand(variantId, 'BOUTIQUE')).toBe(9);
      expect(await onHand(variantId, 'BOUTIQUE_ARCHIVED')).toBe(0);
      expect((await variantModel.findById(pool.id))!.retired).toBe(false);
    });

    it('legacy POS ids (archived pool / retired default) map to the product single live variant, never for variant products', async () => {
      if (!infra) return;
      const { productId, variantId, pool } = await seedBoutique();
      expect((await variantsSvc.resolveLiveVariant(pool.id))?.id).toBe(variantId); // simple product: unambiguous
      await variantModel.updateOne({ _id: pool.id }, { $set: { retired: true, active: false } });
      expect((await variantsSvc.resolveLiveVariant(pool.id))?.id).toBe(variantId);
      const { productId: mp } = await matrixProduct('Multi', [['S', 'Noir', 1], ['M', 'Noir', 1]]);
      const poolM = await variantModel.create({ productId: mp, sku: `BOUTIQUE-${mp}`, combinationKey: '__boutique_pool__', boutiquePool: true, attributes: {}, active: false, retired: true });
      expect(await variantsSvc.resolveLiveVariant(poolM.id)).toBeNull(); // ambiguous -> caller must re-pick the size/color
      void productId;
    });
  });
});
