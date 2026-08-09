import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { Connection, Model } from 'mongoose';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { hashPassword } from '@/auth/password';
import { Session } from '@/auth/session.schema';
import { Employee } from '@/users/employee.schema';
import { Product } from '@/catalog/product.schema';
import { InventoryService } from '@/inventory/inventory.service';
import { Order } from '@/orders/order.schema';
import { Customer } from '@/customers/customer.schema';
import { AuditLog } from '@/audit/audit-log.schema';

const ADMIN_EMAIL = 'edit.admin@mzali.local';
const ADMIN_PASSWORD = 'edit-admin-password';
const TEST_PHONE_PREFIX = '91';

/**
 * Confirmed-order edit flow — the business-critical paths this suite pins:
 *   - variation (color/size) edits on confirmed orders must succeed with a reason
 *   - no-op saves must not write, move stock, or demand a reason
 *   - stock moves ONLY the per-product delta (never a re-deduct/restore)
 *   - repeated identical saves never double-deduct
 *   - "mode sans stock" (settings.inventory.enabled=false) creates no movement
 *   - every meaningful edit lands a rich audit entry (before/after/reason)
 *   - optimistic concurrency (version) blocks silent overwrites with 409
 */
describe('Confirmed-order edit (integration)', () => {
  let app: INestApplication | undefined;
  let server: Server;
  let employees: Model<Employee>;
  let sessions: Model<Session>;
  let products: Model<Product>;
  let orders: Model<Order>;
  let customers: Model<Customer>;
  let auditLogs: Model<AuditLog>;
  let inventoryService: InventoryService;
  let connection: Connection;
  let infraAvailable = true;
  let adminAuth: string;
  let createdOrderIds: string[] = [];

  beforeAll(async () => {
    // The edit-time "insufficient stock" guard is only enforceable when
    // availability is checked — see InsufficientStockError in the service.
    process.env.STRICT_STOCK = 'true';
    try {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      app.setGlobalPrefix('api', { exclude: ['health', 'health/live', 'health/ready'] });
      app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
      );
      await app.init();

      server = app.getHttpServer() as Server;
      employees = app.get<Model<Employee>>(getModelToken(Employee.name));
      sessions = app.get<Model<Session>>(getModelToken(Session.name));
      products = app.get<Model<Product>>(getModelToken(Product.name));
      orders = app.get<Model<Order>>(getModelToken(Order.name));
      customers = app.get<Model<Customer>>(getModelToken(Customer.name));
      auditLogs = app.get<Model<AuditLog>>(getModelToken(AuditLog.name));
      inventoryService = app.get(InventoryService);
      connection = app.get<Connection>(getConnectionToken());

      await cleanTestData();
      await employees.create({
        email: ADMIN_EMAIL,
        name: 'Edit Admin',
        role: 'super_admin',
        active: true,
        passwordHash: await hashPassword(ADMIN_PASSWORD),
      });

      const adminLogin = await request(server)
        .post('/api/v1/auth/login')
        .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        .expect(200);
      adminAuth = `Bearer ${String(adminLogin.body.accessToken)}`;
    } catch (error) {
      infraAvailable = false;
      process.stderr.write(
        `Skipping confirmed-order edit suite: dev infrastructure is unavailable (${String(error)})\n`,
      );
      if (app) await app.close().catch(() => undefined);
      app = undefined;
    }
  }, 30_000);

  afterAll(async () => {
    if (!app) return;
    await cleanTestData();
    await app.close();
  });

  async function cleanTestData(): Promise<void> {
    await employees.deleteMany({ email: ADMIN_EMAIL });
    await sessions.deleteMany({});
    await products.deleteMany({ name: { $regex: /^Edit Test/ } });
    await connection.collection('stock_items').deleteMany({});
    await connection.collection('stock_movements').deleteMany({});
    await orders.deleteMany({ 'customer.phone': { $regex: `^${TEST_PHONE_PREFIX}` } });
    await customers.deleteMany({ phone: { $regex: `^${TEST_PHONE_PREFIX}` } });
    const ids = createdOrderIds;
    createdOrderIds = [];
    if (ids.length) await auditLogs.deleteMany({ entityId: { $in: ids } });
  }

  async function createProduct(name: string, regularPrice: number): Promise<string> {
    const res = await request(server)
      .post('/api/v1/admin/products')
      .set('Authorization', adminAuth)
      .send({ name, regularPrice, status: 'published' })
      .expect(201);
    return res.body.id as string;
  }

  function uniquePhone(): string {
    return `${TEST_PHONE_PREFIX}${Math.floor(Math.random() * 1_000_000)}`;
  }

  const seedActor = { type: 'system' as const, id: null, name: 'test' };

  async function stockFor(name: string): Promise<{ onHand: number; reserved: number }> {
    const { items } = await inventoryService.list(1, 10, name);
    const item = items[0];
    return { onHand: item?.onHand ?? 0, reserved: item?.reserved ?? 0 };
  }

  /** Checkout (en-attente, no stock effect) then confirm (commits qty units). */
  async function makeConfirmedOrder(name: string, price: number, qty: number, variation: Record<string, string>): Promise<{ orderId: string; productId: string }> {
    const productId = await createProduct(`Edit Test ${name} ${Math.floor(Math.random() * 1_000_000)}`, price);
    await inventoryService.adjust(productId, 10, 'test seed', seedActor);
    const phone = uniquePhone();
    const created = await request(server)
      .post('/api/v1/orders')
      .set('X-Service-Token', serviceToken())
      .send({
        customer: { firstName: 'Edit', phone, city: 'Tunis', address: 'Rue Edit' },
        items: [{ lineId: 'l1', productId, name: 'X', price, qty, image: '', variation }],
        shipping: 0,
      })
      .expect(201);
    const orderId = created.body.id as string;
    createdOrderIds.push(orderId);
    await request(server).put(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).send({ status: 'confirme' }).expect(200);
    return { orderId, productId };
  }

  const fullEditPayload = (productId: string, variation: Record<string, string>, qty = 1) => ({
    customer: { firstName: 'Edit', phone: '00000000', city: 'Tunis', address: 'Rue Edit', phone2: '', email: '', note: '' },
    items: [{ productId, qty, unitPrice: 25, variation, bundleName: undefined, bundleSlot: undefined }],
    shipping: 0,
    deliveryCompany: '',
    exchange: false,
    privateNote: '',
  });

  // ── Variation edits on confirmed orders ──────────────────────────────────

  test('change color only on a confirmed order succeeds with a reason', async () => {
    if (!infraAvailable) return;
    const { orderId } = await makeConfirmedOrder('Color Only', 25, 1, { color: 'noir', size: 'xl' });
    const before = await stockFor('Edit Test Color Only');
    expect(before.onHand).toBe(9); // 10 seeded - 1 committed at confirm

    const res = await request(server)
      .put(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminAuth)
      .send({ ...fullEditPayload(productId, { color: 'gris', size: 'xl' }), reason: 'Client a changé la couleur' })
      .expect(200);

    expect(res.body.items[0].attributes).toEqual(
      expect.arrayContaining([{ key: 'color', value: 'gris' }, { key: 'size', value: 'xl' }]),
    );
    const after = await stockFor('Edit Test Color Only');
    expect(after.onHand).toBe(9); // option-only change: stock untouched
    const order = await orders.findById(orderId);
    expect(order?.version).toBe(2); // 1 for confirm, 1 for this edit
  });

  test('change size only on a confirmed order succeeds with a reason', async () => {
    if (!infraAvailable) return;
    const { orderId } = await makeConfirmedOrder('Size Only', 25, 1, { color: 'noir', size: 'xl' });
    const res = await request(server)
      .put(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminAuth)
      .send({ ...fullEditPayload(productId, { color: 'noir', size: 'xxl' }), reason: 'Client a changé la taille' })
      .expect(200);
    expect(res.body.items[0].attributes).toEqual(
      expect.arrayContaining([{ key: 'color', value: 'noir' }, { key: 'size', value: 'xxl' }]),
    );
    const after = await stockFor('Edit Test Size Only');
    expect(after.onHand).toBe(9);
  });

  test('change color + size together succeeds with a reason', async () => {
    if (!infraAvailable) return;
    const { orderId } = await makeConfirmedOrder('Color And Size', 25, 1, { color: 'noir', size: 'xl' });
    const res = await request(server)
      .put(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminAuth)
      .send({ ...fullEditPayload(productId, { color: 'gris', size: 'xxl' }), reason: 'Modification demandée par le client' })
      .expect(200);
    expect(res.body.items[0].attributes).toEqual(
      expect.arrayContaining([{ key: 'color', value: 'gris' }, { key: 'size', value: 'xxl' }]),
    );
  });

  // ── No-op saves ───────────────────────────────────────────────────────────

  test('a no-op save (identical payload) needs no reason, writes nothing, moves no stock', async () => {
    if (!infraAvailable) return;
    const { orderId } = await makeConfirmedOrder('Noop', 25, 1, { color: 'noir', size: 'xl' });
    const orderBefore = await orders.findById(orderId);
    const before = await stockFor('Edit Test Noop');
    const payload = {
      customer: { firstName: 'Edit', phone: orderBefore?.customer.phone ?? '', city: 'Tunis', address: 'Rue Edit' },
      items: [{ productId: orderBefore?.items[0]?.productId, qty: 1, unitPrice: 25, variation: { color: 'noir', size: 'xl' } }],
      shipping: 0,
      deliveryCompany: '',
      exchange: false,
      privateNote: '',
    };

    const res = await request(server).put(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).send(payload).expect(200);
    expect(res.body.status).toBe('confirme');

    const orderAfter = await orders.findById(orderId);
    expect(orderAfter?.version).toBe(orderBefore?.version); // no write happened
    const after = await stockFor('Edit Test Noop');
    expect(after.onHand).toBe(before.onHand);
    const updates = await auditLogs.countDocuments({ entityId: orderId, action: 'order.update' });
    expect(updates).toBe(0);
  });

  // ── Reason gate ───────────────────────────────────────────────────────────

  test('a real modification on a confirmed order without a reason is rejected cleanly (400)', async () => {
    if (!infraAvailable) return;
    const { orderId } = await makeConfirmedOrder('No Reason', 25, 1, { color: 'noir' });
    const res = await request(server)
      .put(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminAuth)
      .send(fullEditPayload(productId, { color: 'gris' }))
      .expect(400);
    expect(res.body.message).toContain('motif');
    const after = await stockFor('Edit Test No Reason');
    expect(after.onHand).toBe(9); // nothing moved
  });

  // ── Delta stock movements ─────────────────────────────────────────────────

  test('quantity 1 -> 3 deducts exactly 2 more units', async () => {
    if (!infraAvailable) return;
    const { orderId } = await makeConfirmedOrder('Qty Up', 25, 1, { color: 'noir' });
    const res = await request(server)
      .put(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminAuth)
      .send({ ...fullEditPayload(productId, { color: 'noir' }, 3), reason: 'Augmentation quantité' })
      .expect(200);
    expect(res.body.total).toBe(75); // 3 × 25
    const after = await stockFor('Edit Test Qty Up');
    expect(after.onHand).toBe(7); // 9 - 2, never a full 3-unit re-deduct
  });

  test('quantity 3 -> 1 restores exactly 2 units', async () => {
    if (!infraAvailable) return;
    const { orderId } = await makeConfirmedOrder('Qty Down', 25, 3, { color: 'noir' });
    const res = await request(server)
      .put(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminAuth)
      .send({ ...fullEditPayload(productId, { color: 'noir' }, 1), reason: 'Réduction quantité' })
      .expect(200);
    expect(res.body.total).toBe(25);
    const after = await stockFor('Edit Test Qty Down');
    expect(after.onHand).toBe(9); // 7 + 2
  });

  test('product A -> product B restores A and deducts B atomically', async () => {
    if (!infraAvailable) return;
    const productBId = await createProduct('Edit Test Swap B', 25);
    await inventoryService.adjust(productBId, 10, 'test seed', seedActor);
    const { orderId, productId } = await makeConfirmedOrder('Swap A', 25, 1, { color: 'noir' });
    expect((await stockFor('Edit Test Swap A')).onHand).toBe(9);
    expect((await stockFor('Edit Test Swap B')).onHand).toBe(10);

    const res = await request(server)
      .put(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminAuth)
      .send({
        ...fullEditPayload(productId, { color: 'noir' }),
        items: [{ productId: productBId, qty: 1, unitPrice: 25, variation: { color: 'noir' } }],
        reason: 'Client a changé de produit',
      })
      .expect(200);

    expect(res.body.items[0].productId).toBe(productBId);
    expect((await stockFor('Edit Test Swap A')).onHand).toBe(10); // restored +1
    expect((await stockFor('Edit Test Swap B')).onHand).toBe(9); // deducted -1
  });

  test('removing a line restores exactly its committed quantity', async () => {
    if (!infraAvailable) return;
    const productBId = await createProduct('Edit Test Remove B', 25);
    await inventoryService.adjust(productBId, 10, 'test seed', seedActor);
    const { orderId, productId: productAId } = await makeConfirmedOrder('Remove A', 25, 2, { color: 'noir' });
    // Order confirmed with A×2 + B×3
    await request(server)
      .put(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminAuth)
      .send({
        customer: { firstName: 'Edit', phone: uniquePhone(), city: 'Tunis', address: 'Rue Edit' },
        items: [
          { productId: productAId, qty: 2, unitPrice: 25, variation: { color: 'noir' } },
          { productId: productBId, qty: 3, unitPrice: 25, variation: {} },
        ],
        shipping: 0,
        reason: 'Ajout deuxième produit',
      })
      .expect(200);
    expect((await stockFor('Edit Test Remove B')).onHand).toBe(7); // 10 - 3

    // Remove the B line entirely
    await request(server)
      .put(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminAuth)
      .send({
        customer: { firstName: 'Edit', phone: uniquePhone(), city: 'Tunis', address: 'Rue Edit' },
        items: [{ productId: productAId, qty: 2, unitPrice: 25, variation: { color: 'noir' } }],
        shipping: 0,
        reason: 'Retrait du deuxième produit',
      })
      .expect(200);

    expect((await stockFor('Edit Test Remove B')).onHand).toBe(10); // +3 restored
    expect((await stockFor('Edit Test Remove A')).onHand).toBe(8); // unchanged at 10 - 2
  });

  test('adding a line deducts only the newly added quantity', async () => {
    if (!infraAvailable) return;
    const productBId = await createProduct('Edit Test Add B', 25);
    await inventoryService.adjust(productBId, 10, 'test seed', seedActor);
    const { orderId, productId: productAId } = await makeConfirmedOrder('Add A', 25, 1, { color: 'noir' });
    expect((await stockFor('Edit Test Add B')).onHand).toBe(10);

    const res = await request(server)
      .put(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminAuth)
      .send({
        customer: { firstName: 'Edit', phone: uniquePhone(), city: 'Tunis', address: 'Rue Edit' },
        items: [
          { productId: productAId, qty: 1, unitPrice: 25, variation: { color: 'noir' } },
          { productId: productBId, qty: 2, unitPrice: 25, variation: {} },
        ],
        shipping: 0,
        reason: 'Ajout produit',
      })
      .expect(200);

    expect(res.body.items).toHaveLength(2);
    expect((await stockFor('Edit Test Add B')).onHand).toBe(8); // 10 - 2 only
    expect((await stockFor('Edit Test Add A')).onHand).toBe(9); // untouched
  });

  test('saving the same request twice never double-deducts stock', async () => {
    if (!infraAvailable) return;
    const { orderId } = await makeConfirmedOrder('Idempotent', 25, 1, { color: 'noir' });
    const payload = { ...fullEditPayload(productId, { color: 'gris' }, 3), reason: 'Augmentation quantité' };

    const first = await request(server).put(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).send(payload).expect(200);
    expect(first.body.total).toBe(75);
    expect((await stockFor('Edit Test Idempotent')).onHand).toBe(7); // 9 - 2

    // Identical retry: no changes vs persisted state -> no-op, zero movements
    const second = await request(server).put(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).send(payload).expect(200);
    expect(second.body.total).toBe(75);
    expect((await stockFor('Edit Test Idempotent')).onHand).toBe(7); // still 7 — never 4
    const order = await orders.findById(orderId);
    expect(order?.version).toBe(2); // confirm + first edit only
  });

  // ── Mode sans stock ───────────────────────────────────────────────────────

  test('with inventory tracking disabled, confirmed-order edits create no stock movement', async () => {
    if (!infraAvailable) return;
    const { orderId } = await makeConfirmedOrder('No Stock Mode', 25, 1, { color: 'noir' });
    const before = await stockFor('Edit Test No Stock Mode');
    expect(before.onHand).toBe(9);

    await request(server)
      .put('/api/v1/admin/settings/inventory')
      .set('Authorization', adminAuth)
      .send({ enabled: false })
      .expect(200);
    try {
      const res = await request(server)
        .put(`/api/v1/admin/orders/${orderId}`)
        .set('Authorization', adminAuth)
        .send({ ...fullEditPayload(productId, { color: 'gris' }, 3), reason: 'Augmentation quantité' })
        .expect(200);
      expect(res.body.items[0].attributes).toEqual(expect.arrayContaining([{ key: 'color', value: 'gris' }]));
      const after = await stockFor('Edit Test No Stock Mode');
      expect(after.onHand).toBe(9); // order changed, stock did NOT
      const { items: movements } = await inventoryService.movementsFor((await orders.findById(orderId))?.items[0]?.productId ?? '', 1, 10);
      expect(movements.filter((m) => m.type === 'order_commit' || m.type === 'manual_adjust')).toHaveLength(1); // only the confirm commit
    } finally {
      await request(server)
        .put('/api/v1/admin/settings/inventory')
        .set('Authorization', adminAuth)
        .send({ enabled: true })
        .expect(200);
    }
  });

  // ── Insufficient stock ────────────────────────────────────────────────────

  test('increasing quantity beyond available stock is rejected with a clear error and rolls back', async () => {
    if (!infraAvailable) return;
    // Seed exactly 1: confirm commits it (onHand 0), then +1 more has nothing left.
    const productId = await createProduct('Edit Test Insufficient', 25);
    await inventoryService.adjust(productId, 1, 'test seed', seedActor);
    const phone = uniquePhone();
    const created = await request(server)
      .post('/api/v1/orders')
      .set('X-Service-Token', serviceToken())
      .send({
        customer: { firstName: 'Edit', phone, city: 'Tunis', address: 'Rue Edit' },
        items: [{ lineId: 'l1', productId, name: 'X', price: 25, qty: 1, image: '', variation: { color: 'noir' } }],
        shipping: 0,
      })
      .expect(201);
    const orderId = created.body.id as string;
    createdOrderIds.push(orderId);
    await request(server).put(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).send({ status: 'confirme' }).expect(200);

    const res = await request(server)
      .put(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminAuth)
      .send({ ...fullEditPayload({ color: 'noir' }, 2), reason: 'Augmentation quantité' })
      .expect(400);
    expect(res.body.message).toContain('Stock insuffisant');

    const order = await orders.findById(orderId);
    expect(order?.items[0]?.qty).toBe(1); // order unchanged — full rollback
    expect((await stockFor('Edit Test Insufficient')).onHand).toBe(0); // stock untouched
  });

  // ── Audit history ─────────────────────────────────────────────────────────

  test('every confirmed-order edit writes before/after values, changed fields, and the reason', async () => {
    if (!infraAvailable) return;
    const { orderId } = await makeConfirmedOrder('Audit Trail', 25, 1, { color: 'noir', size: 'xl' });
    await request(server)
      .put(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminAuth)
      .send({ ...fullEditPayload(productId, { color: 'gris', size: 'xxl' }, 2), reason: 'Client a changé couleur et taille' })
      .expect(200);

    const entry = (await auditLogs.findOne({ entityId: orderId, action: 'order.update' }).lean()) as unknown as {
      actor: { type: string; id: string | null; name: string };
      summary: string;
      after: {
        reason: string;
        changedFields: string[];
        lineChanges: Array<{ fields: Array<{ field: string; from: unknown; to: unknown }> }>;
      };
      before: { items: Array<{ qty: number; variation: Record<string, string> }> };
    } | null;
    expect(entry).toBeTruthy();
    expect(entry!.actor).toEqual({ type: 'employee', id: expect.any(String), name: 'Edit Admin' });
    expect(entry!.summary).toContain('Client a changé couleur et taille');
    expect(entry!.after.reason).toBe('Client a changé couleur et taille');
    expect(entry!.after.changedFields).toEqual(expect.arrayContaining(['items']));
    const line = entry!.after.lineChanges[0];
    expect(line.fields).toEqual(
      expect.arrayContaining([
        { field: 'quantity', from: 1, to: 2 },
        { field: 'variation', from: { color: 'noir', size: 'xl' }, to: { color: 'gris', size: 'xxl' } },
      ]),
    );
    expect(entry!.before.items[0]).toEqual(expect.objectContaining({ qty: 1, variation: { color: 'noir', size: 'xl' } }));
  });

  // ── Optimistic concurrency ────────────────────────────────────────────────

  test('a stale version aborts the save with 409 — concurrent edits are never silently overwritten', async () => {
    if (!infraAvailable) return;
    const { orderId } = await makeConfirmedOrder('Concurrency', 25, 1, { color: 'noir' });
    const fresh = await request(server).get(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).expect(200);
    const currentVersion = fresh.body.version as number;

    // Employee B modifies and saves first (version +1)
    await request(server)
      .put(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminAuth)
      .send({ ...fullEditPayload(productId, { color: 'gris' }), reason: 'Modif B', version: currentVersion })
      .expect(200);

    // Employee A still holds the old version — rejected, not overwritten
    const stale = await request(server)
      .put(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminAuth)
      .send({ ...fullEditPayload(productId, { color: 'bleu' }), reason: 'Modif A', version: currentVersion })
      .expect(409);
    expect(stale.body.error).toContain('modifiée depuis son ouverture');

    // A reloads (new version) and saves on top — succeeds
    const reloaded = await request(server).get(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).expect(200);
    await request(server)
      .put(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminAuth)
      .send({ ...fullEditPayload(productId, { color: 'bleu' }), reason: 'Modif A après rechargement', version: reloaded.body.version as number })
      .expect(200);

    const order = await orders.findById(orderId);
    expect(order?.items[0]?.variation).toEqual({ color: 'bleu' });
  });

  function serviceToken(): string {
    return process.env.SERVICE_TOKEN ?? '';
  }
});
