import { createConnection, Connection, Types } from 'mongoose';
import { ProductsService } from '@/catalog/products.service';
import { Product, ProductSchema } from '@/catalog/product.schema';
import { Variant, VariantSchema } from '@/catalog/variant.schema';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { StockItem, StockItemSchema } from '@/inventory/stock-item.schema';
import { StockMovement, StockMovementSchema } from '@/inventory/stock-movement.schema';
import { StockLedgerService } from '@/inventory/stock-ledger.service';
import { VariantStockService } from '@/inventory/variant-stock.service';
import { InventoryService } from '@/inventory/inventory.service';
import { Order, OrderSchema } from '@/orders/order.schema';
import { OrdersService } from '@/orders/orders.service';
import { Counter, CounterSchema } from '@/database/counter.schema';
import { CountersService } from '@/database/counters.service';
import { StockTransfer, StockTransferSchema } from '@/inventory/transfers/stock-transfer.schema';
import { TransfersService } from '@/inventory/transfers/transfers.service';
import { Stocktake, StocktakeSchema } from '@/inventory/stocktakes/stocktake.schema';
import { StocktakesService } from '@/inventory/stocktakes/stocktakes.service';
import { OnlineAvailabilityService } from '@/inventory/online-availability.service';

const uri = process.env.VARIANT_TEST_URI;
const actor = { type: 'employee' as const, id: 'test', name: 'Inventory test' };
(uri ? describe : describe.skip)('Exact variants with real Mongo transactions', () => {
  let db: Connection, ledger: StockLedgerService, variants: ProductVariantsService, matrix: VariantStockService, inventory: InventoryService, orders: OrdersService, transfers: TransfersService, stocktakes: StocktakesService;
  let productId: string, black: string, white: string, enabled = true;
  const settings = { getInventorySettings: async () => ({ enabled, stockPolicy: 'DEPOT_ONLY', stocktakeVarianceThreshold: 3 }), getCommerce: async () => ({ defaultOrderStatus: 'en-attente', shippingFlat: 0 }) };
  const locations = { getDefaultOnlineLocationCode: async () => 'DEPOT', getDefaultPosLocationCode: async () => 'BOUTIQUE', requireByCode: async (code: string) => ({ code, allowNegativeStock: false }) };
  beforeAll(async () => {
    if (!uri || new URL(uri).pathname !== '/mzali_inventory_test') throw new Error('An isolated mzali_inventory_test replica-set DB is required');
    db = await createConnection(uri).asPromise();
    db.model(Product.name, ProductSchema); db.model(Variant.name, VariantSchema); db.model(StockItem.name, StockItemSchema); db.model(StockMovement.name, StockMovementSchema); db.model(Order.name, OrderSchema); db.model(Counter.name, CounterSchema); db.model(StockTransfer.name, StockTransferSchema); db.model(Stocktake.name, StocktakeSchema);
    await Promise.all(Object.values(db.models).map(m => m.init()));
    const products = db.model<Product>(Product.name), variantModel = db.model<Variant>(Variant.name);
    ledger = new StockLedgerService(db.model<StockItem>(StockItem.name), db.model<StockMovement>(StockMovement.name), { publish: async () => 0 } as never);
    variants = new ProductVariantsService(products, variantModel);
    matrix = new VariantStockService(products, variantModel, db.model<StockItem>(StockItem.name), db.model<StockMovement>(StockMovement.name), ledger);
    inventory = new InventoryService(ledger, variants, locations as never, products, {} as never, db);
    const counters = new CountersService(db.model<Counter>(Counter.name));
    orders = new OrdersService(db.model<Order>(Order.name), products, db, counters, inventory, {} as never, { upsertFromOrder: async () => null } as never, settings as never, {} as never, {} as never, {} as never, { log: async () => undefined } as never, { get: () => undefined } as never, {} as never);
    transfers = new TransfersService(db.model<StockTransfer>(StockTransfer.name), products, variants, locations as never, ledger, counters, db);
    stocktakes = new StocktakesService(db.model<Stocktake>(Stocktake.name), products, variants, locations as never, ledger, counters, settings as never, db);
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await Promise.all(Object.values(db.models).map(m => m.deleteMany({})));
    enabled = true;
    const p = await db.model<Product>(Product.name).create({ name: 'Ensemble Nike', slug: 'nike', status: 'published', regularPriceMinor: 59000, inventoryModel: 'MATRIX' }); productId = p.id;
    const rows = await db.model<Variant>(Variant.name).create([{ productId, sku: 'XL-NOIR', attributes: { size: 'XL', color: 'Noir' } }, { productId, sku: 'XL-BLANC', attributes: { size: 'XL', color: 'Blanc' } }]);
    black = rows[0].id; white = rows[1].id;
    for (const [variantId, depot, boutique] of [[black, 0, 3], [white, 5, 0]] as const) for (const [locationId, qty] of [['DEPOT', depot], ['BOUTIQUE', boutique]] as const) await ledger.applyMovement({ variantId, locationId, onHandDelta: qty, type: 'migration_init', actor });
  });
  const stock = async (id: string, location = 'DEPOT') => (await ledger.stockAt(id, location))!.quantityOnHand;
  const checkout = (variantId = white, qty = 1) => orders.create({ customer: { phone: '22123456' }, shipping: 0, items: [{ productId, variantId, lineId: '1', name: 'Nike', price: 59, image: '', qty }] }, new Types.ObjectId().toString());
  it('routes online availability to DEPOT independently of BOUTIQUE', async () => {
    const availability = new OnlineAvailabilityService(ledger, locations as never, settings as never);
    expect(await availability.resolve(black)).toBe(0); expect(await availability.resolve(white)).toBe(5);
    expect(await stock(black, 'BOUTIQUE')).toBe(3); expect(await stock(white, 'BOUTIQUE')).toBe(0);
    await expect(checkout(black)).rejects.toThrow('disponible');
  });
  it('pending and tentative orders do not deduct; confirmation and cancellation are retry safe', async () => {
    const order = await checkout(white, 2);
    for (const status of ['tentative-1', 'tentative-2', 'tentative-3', 'tentative-4', 'tentative-5']) await orders.changeStatus(order.id, status, actor);
    expect(await stock(white)).toBe(5);
    await Promise.all([orders.changeStatus(order.id, 'confirme', actor), orders.changeStatus(order.id, 'confirme', actor)]);
    expect(await stock(white)).toBe(3); expect(await stock(white, 'BOUTIQUE')).toBe(0);
    await Promise.all([orders.changeStatus(order.id, 'annule', actor), orders.changeStatus(order.id, 'annule', actor)]);
    expect(await stock(white)).toBe(5);
  });
  it('changes only exact variants and quantity deltas on a confirmed order', async () => {
    await ledger.applyMovement({ variantId: black, locationId: 'DEPOT', type: 'manual_adjust', onHandDelta: 4, actor });
    const order = await checkout(white, 2); await orders.changeStatus(order.id, 'confirme', actor);
    await orders.update(order.id, { items: [{ productId, variantId: black, qty: 1 }], reason: 'Changer couleur' }, actor);
    expect(await stock(white)).toBe(5); expect(await stock(black)).toBe(3);
    await orders.update(order.id, { items: [{ productId, variantId: black, qty: 3 }], reason: 'Ajouter deux' }, actor);
    expect(await stock(black)).toBe(1);
    await orders.update(order.id, { items: [{ productId, variantId: black, qty: 1 }], reason: 'Retirer deux' }, actor);
    expect(await stock(black)).toBe(3);
  });
  it('permits only one concurrent final-unit confirmation', async () => {
    const a = await checkout(white, 5), b = await checkout(white, 5);
    const results = await Promise.allSettled([orders.changeStatus(a.id, 'confirme', actor), orders.changeStatus(b.id, 'confirme', actor)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(await stock(white)).toBe(0);
  });
  it('mode sans stock preserves quantities and does not restore stock never deducted', async () => {
    enabled = false; const order = await checkout(black, 2);
    await orders.changeStatus(order.id, 'confirme', actor);
    enabled = true; await orders.changeStatus(order.id, 'completed', actor);
    expect(await stock(black)).toBe(0);
    await orders.changeStatus(order.id, 'annule', actor);
    expect(await stock(black)).toBe(0); expect(await stock(black, 'BOUTIQUE')).toBe(3);
  });
  it('transfers exact variants with atomic shipping and idempotent receipt', async () => {
    const t = await transfers.create({ sourceLocationId: 'DEPOT', destinationLocationId: 'BOUTIQUE', lines: [{ productId, variantId: white, requestedQuantity: 2 }] }, actor);
    await transfers.approve(t.id, { lines: [{ variantId: white, approvedQuantity: 2 }] }, actor);
    await Promise.all([transfers.ship(t.id, actor), transfers.ship(t.id, actor)]);
    const receipt = { operationKey: 'receipt-1', lines: [{ variantId: white, receivedQuantity: 2 }] };
    await Promise.all([transfers.receive(t.id, receipt, actor), transfers.receive(t.id, receipt, actor)]);
    expect(await stock(white)).toBe(3); expect(await stock(white, 'BOUTIQUE')).toBe(2); expect(await stock(black, 'BOUTIQUE')).toBe(3);
  });
  it('stocktakes count every variant and post one auditable correction', async () => {
    const t = await stocktakes.create({ locationId: 'DEPOT', scopeKind: 'all' }, actor);
    expect(t.lines).toHaveLength(2);
    await stocktakes.submitCount(t.id, { lines: [{ variantId: black, countedQuantity: 0 }, { variantId: white, countedQuantity: 4 }] }, actor);
    await stocktakes.approve(t.id, actor); await Promise.all([stocktakes.post(t.id, actor), stocktakes.post(t.id, actor)]);
    expect(await stock(white)).toBe(4); expect(await db.model(StockMovement.name).countDocuments({ type: 'stocktake_correction' })).toBe(1);
  });
  it('dry-runs allocation without writes and preserves legacy history at activation', async () => {
    const p = await db.model<Product>(Product.name).create({ name: 'Legacy', slug: 'legacy', regularPriceMinor: 1000 });
    const old = await variants.generateDefaultVariant(p.id);
    await ledger.applyMovement({ variantId: old.id, locationId: 'DEPOT', onHandDelta: 20, type: 'migration_init', actor });
    const dto = { reason: 'Comptage physique', rows: [{ size: 'M', color: 'Noir', sku: 'LEG-M', active: true, depot: 8, boutique: 0 }, { size: 'L', color: 'Blanc', sku: 'LEG-L', active: true, depot: 12, boutique: 0 }] };
    const count = await db.model(StockMovement.name).countDocuments();
    await matrix.activate(p.id, { ...dto, dryRun: true }, actor);
    expect(await db.model(StockMovement.name).countDocuments()).toBe(count);
    await expect(matrix.activate(p.id, { ...dto, rows: [{ ...dto.rows[0], depot: 19 }] }, actor)).rejects.toThrow('conserver');
    await matrix.activate(p.id, dto, actor);
    expect(await stock(old.id)).toBe(0); expect((await variants.findById(old.id))!.retired).toBe(true);
    expect(await db.model(StockMovement.name).countDocuments({ variantId: old.id, type: 'migration_init' })).toBe(1);
    const active = await variants.allForProducts([p.id]); expect(active).toHaveLength(2);
    expect((await Promise.all(active.map(v => stock(v.id)))).reduce((a, b) => a + b, 0)).toBe(20);
    await expect(ledger.applyMovement({ variantId: old.id, locationId: 'DEPOT', type: 'pos_sale', onHandDelta: -1, actor })).rejects.toThrow('réconciliation');
  });
  it('restores a tracked cancellation after disabling inventory but refuses tracked quantity edits', async () => {
    const order = await checkout(white, 2); await orders.changeStatus(order.id, 'confirme', actor);
    enabled = false;
    await expect(orders.update(order.id, { items: [{ productId, variantId: white, qty: 3 }], reason: 'Quantity' }, actor)).rejects.toThrow('Réactivez');
    expect(await stock(white)).toBe(3);
    await orders.changeStatus(order.id, 'annule', actor);
    await orders.changeStatus(order.id, 'annule', actor);
    expect(await stock(white)).toBe(5);
  });
  it('rejects missing, inactive and foreign variants without changing stock', async () => {
    await expect(variants.resolveForSale(productId)).rejects.toThrow('exacte');
    await db.model(Variant.name).updateOne({ _id: white }, { $set: { active: false } });
    await expect(checkout()).rejects.toThrow('inactive');
    await expect(variants.resolveForSale(new Types.ObjectId().toString(), white)).rejects.toThrow();
    expect(await stock(white)).toBe(5);
  });
  it('validates the sum of separate cart lines for one variant', async () => {
    await expect(orders.create({ customer: { phone: '22123456' }, shipping: 0, items: [1, 2].map(i => ({ productId, variantId: white, lineId: String(i), name: 'Nike', price: 59, image: '', qty: 3 })) }, new Types.ObjectId().toString())).rejects.toThrow('disponible');
    expect(await db.model(Order.name).countDocuments()).toBe(0);
  });
  it('rolls back all transfer lines if one variant lacks source stock', async () => {
    const t = await transfers.create({ sourceLocationId: 'DEPOT', destinationLocationId: 'BOUTIQUE', lines: [{ productId, variantId: white, requestedQuantity: 2 }, { productId, variantId: black, requestedQuantity: 1 }] }, actor);
    await transfers.approve(t.id, { lines: [{ variantId: white, approvedQuantity: 2 }, { variantId: black, approvedQuantity: 1 }] }, actor);
    await expect(transfers.ship(t.id, actor)).rejects.toThrow('insuffisant');
    expect(await stock(white)).toBe(5);
    expect((await transfers.getById(t.id)).status).toBe('APPROVED');
    expect(await db.model(StockMovement.name).countDocuments({ type: 'transfer_out' })).toBe(0);
  });
  it('refuses a stocktake that would overwrite sales after counting', async () => {
    const t = await stocktakes.create({ locationId: 'DEPOT', scopeKind: 'all' }, actor);
    await stocktakes.submitCount(t.id, { lines: [{ variantId: black, countedQuantity: 0 }, { variantId: white, countedQuantity: 4 }] }, actor);
    await stocktakes.approve(t.id, actor);
    const order = await checkout(); await orders.changeStatus(order.id, 'confirme', actor);
    await expect(stocktakes.post(t.id, actor)).rejects.toThrow('nouveau comptage');
    expect(await stock(white)).toBe(4);
    expect(await db.model(StockMovement.name).countDocuments({ type: 'stocktake_correction' })).toBe(0);
  });
  it('adds new zero-stock combinations without replacing existing IDs and rejects duplicate SKUs', async () => {
    const dto = { reason: 'Nouvelle taille', rows: [{ size: 'M', color: 'Noir', sku: 'M-NOIR', active: true, depot: 0, boutique: 0 }] };
    await matrix.addVariants(productId, { ...dto, dryRun: true }, actor);
    expect(await variants.allForProducts([productId])).toHaveLength(2);
    await matrix.addVariants(productId, dto, actor);
    const rows = await variants.allForProducts([productId]);
    expect(rows.map(v => v.id)).toEqual(expect.arrayContaining([black, white]));
    expect(rows).toHaveLength(3);
    expect(await stock(rows.find(v => v.sku === 'M-NOIR')!.id)).toBe(0);
    await expect(matrix.addVariants(productId, { ...dto, dryRun: true }, actor)).rejects.toThrow('existe');
    await expect(variants.update(black, { sku: 'XL-BLANC' })).rejects.toThrow();
  });

  it('restores historical orders only through an exact saved size/color match without rewriting their history', async () => {
    const order = await checkout(white, 2); await orders.changeStatus(order.id, 'confirme', actor);
    await db.model(Order.name).updateOne({ _id: order.id }, { $set: { 'items.0.variantId': null, 'items.0.variation': { 'tallie ': ' XL ', couleur: 'Blanc' } } });
    await orders.changeStatus(order.id, 'annule', actor);
    expect(await stock(white)).toBe(5);
    expect((await db.model<Order>(Order.name).findById(order.id))!.items[0].variantId).toBeNull();
    await expect(inventory.resolveHistoricalVariant(productId, null, { couleur: 'Blanc' })).rejects.toThrow('Réconciliation');
  });

  it('updates website card/detail availability after confirming the last exact unit', async () => {
    const catalog = new ProductsService(db.model<Product>(Product.name), {} as never, variants, new OnlineAvailabilityService(ledger, locations as never, settings as never), {} as never);
    await ledger.applyMovement({ variantId: white, locationId: 'DEPOT', type: 'manual_adjust', onHandDelta: -4, actor });
    let product = (await catalog.getById(productId))!;
    expect(product.inStock).toBe(true);
    expect(product.variants!.find(v => v.id === black)!.available).toBe(0);
    expect(product.variants!.find(v => v.id === white)!.available).toBe(1);
    const order = await checkout(white, 1);
    expect((await catalog.getById(productId))!.stockQuantity).toBe(1);
    await orders.changeStatus(order.id, 'confirme', actor);
    product = (await catalog.getById(productId))!;
    expect(product.inStock).toBe(false); expect(product.stockQuantity).toBe(0);
    expect((await catalog.list({}, true)).items[0].inStock).toBe(false);
    expect(await stock(black, 'BOUTIQUE')).toBe(3);
    await orders.changeStatus(order.id, 'annule', actor);
    expect((await catalog.getById(productId))!.inStock).toBe(true);
    enabled = false;
    expect((await catalog.getById(productId))!.variants!.find(v => v.id === black)!.active).toBe(true);
    expect((await catalog.getById(productId))!.inventoryEnabled).toBe(false);
  });

  it('adds first stock only to Depot and then transfers exact quantities to Boutique', async () => {
    const p = await db.model<Product>(Product.name).create({ name: 'New product', slug: 'new-stock', regularPriceMinor: 30000 });
    await variants.generateDefaultVariant(p.id);
    const dto = { initialStock: true, reason: 'Premier stock Dépôt', rows: [{ size: 'XL', color: 'Noir', sku: 'NEW-XL', active: true, depot: 10, boutique: 0 }] };
    await matrix.activate(p.id, { ...dto, dryRun: true }, actor);
    expect((await variants.allForProducts([p.id]))[0].attributes.size).toBeUndefined();
    await expect(matrix.activate(p.id, { ...dto, rows: [{ ...dto.rows[0], boutique: 2 }] }, actor)).rejects.toThrow('Dépôt');
    await matrix.activate(p.id, dto, actor);
    const variant = (await variants.allForProducts([p.id]))[0];
    expect(await stock(variant.id)).toBe(10); expect(await stock(variant.id, 'BOUTIQUE')).toBe(0);
    expect(variant.sellingPriceMinor).toBeNull();
    const transfer = await transfers.create({ sourceLocationId: 'DEPOT', destinationLocationId: 'BOUTIQUE', lines: [{ productId: p.id, variantId: variant.id, requestedQuantity: 3 }] }, actor);
    await transfers.approve(transfer.id, { lines: [{ variantId: variant.id, approvedQuantity: 3 }] }, actor);
    await transfers.ship(transfer.id, actor);
    await transfers.receive(transfer.id, { operationKey: 'first-transfer', lines: [{ variantId: variant.id, receivedQuantity: 3 }] }, actor);
    expect(await stock(variant.id)).toBe(7); expect(await stock(variant.id, 'BOUTIQUE')).toBe(3);
  });
  it('does not use first-stock entry to overwrite an existing legacy balance', async () => {
    const p = await db.model<Product>(Product.name).create({ name: 'Existing', slug: 'existing', regularPriceMinor: 30000 });
    const v = await variants.generateDefaultVariant(p.id);
    await ledger.applyMovement({ variantId: v.id, locationId: 'DEPOT', onHandDelta: 5, type: 'migration_init', actor });
    await expect(matrix.activate(p.id, { initialStock: true, reason: 'Test', rows: [{ size: 'XL', color: 'Noir', sku: 'EXIST-XL', active: true, depot: 10, boutique: 0 }] }, actor)).rejects.toThrow('sans stock');
    expect(await stock(v.id)).toBe(5);
  });

});
