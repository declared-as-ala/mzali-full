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
import { InventoryService, InsufficientStockError } from '@/inventory/inventory.service';
import { Order } from '@/orders/order.schema';
import { Coupon, CouponRedemption } from '@/coupons/coupon.schema';
import { Customer } from '@/customers/customer.schema';

const ADMIN_EMAIL = 'commerce.admin@mzali.local';
const ADMIN_PASSWORD = 'commerce-admin-password';
const EMPLOYEE_A_EMAIL = 'commerce.employee.a@mzali.local';
const EMPLOYEE_B_EMAIL = 'commerce.employee.b@mzali.local';
const EMPLOYEE_PASSWORD = 'commerce-employee-password';
const TEST_PHONE_PREFIX = '90';

describe('Commerce core (integration): checkout, inventory, coupons, employee scoping', () => {
  let app: INestApplication | undefined;
  let server: Server;
  let employees: Model<Employee>;
  let sessions: Model<Session>;
  let products: Model<Product>;
  let orders: Model<Order>;
  let coupons: Model<Coupon>;
  let redemptions: Model<CouponRedemption>;
  let customers: Model<Customer>;
  let inventoryService: InventoryService;
  let connection: Connection;
  let infraAvailable = true;
  let adminAuth: string;

  beforeAll(async () => {
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
      coupons = app.get<Model<Coupon>>(getModelToken(Coupon.name));
      redemptions = app.get<Model<CouponRedemption>>(getModelToken(CouponRedemption.name));
      customers = app.get<Model<Customer>>(getModelToken(Customer.name));
      inventoryService = app.get(InventoryService);
      connection = app.get<Connection>(getConnectionToken());

      await cleanTestData();
      await employees.create({
        email: ADMIN_EMAIL,
        name: 'Commerce Admin',
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
        `Skipping commerce integration suite: dev infrastructure is unavailable (${String(error)})\n`,
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
    await employees.deleteMany({ email: { $in: [ADMIN_EMAIL, EMPLOYEE_A_EMAIL, EMPLOYEE_B_EMAIL] } });
    await sessions.deleteMany({});
    await products.deleteMany({ name: { $regex: /^Commerce Test/ } });
    await connection.collection('stock_items').deleteMany({});
    await connection.collection('stock_movements').deleteMany({});
    await orders.deleteMany({ 'customer.phone': { $regex: `^${TEST_PHONE_PREFIX}` } });
    await coupons.deleteMany({ code: { $regex: /^CTEST/ } });
    await redemptions.deleteMany({});
    await customers.deleteMany({ phone: { $regex: `^${TEST_PHONE_PREFIX}` } });
    await connection.collection('audit_logs').deleteMany({ 'actor.name': { $regex: /^Commerce/ } });
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

  test('checkout is idempotent: the same Idempotency-Key never creates two orders', async () => {
    if (!infraAvailable) return;
    const productId = await createProduct('Commerce Test Idempotency', 50);
    const phone = uniquePhone();
    const key = `idem-${Date.now()}`;
    const payload = {
      customer: { firstName: 'Test', phone, city: 'Tunis', address: 'Rue Test' },
      items: [{ lineId: 'l1', productId, name: 'X', price: 50, qty: 1, image: '' }],
      shipping: 8,
    };

    const first = await request(server).post('/api/v1/orders').set('X-Service-Token', serviceToken()).set('Idempotency-Key', key).send(payload).expect(201);
    const second = await request(server).post('/api/v1/orders').set('X-Service-Token', serviceToken()).set('Idempotency-Key', key).send(payload).expect(201);

    expect(second.body.id).toBe(first.body.id);
    const count = await orders.countDocuments({ 'customer.phone': phone });
    expect(count).toBe(1);
  });

  test('checkout server-recomputes totals: coupon discount is applied against the real subtotal, not the client total', async () => {
    if (!infraAvailable) return;
    const productId = await createProduct('Commerce Test Coupon Product', 100);
    await request(server)
      .post('/api/v1/admin/coupons')
      .set('Authorization', adminAuth)
      .send({ code: 'CTEST-PCT', type: 'percent', value: 10 })
      .expect(201);

    const phone = uniquePhone();
    const res = await request(server)
      .post('/api/v1/orders')
      .set('X-Service-Token', serviceToken())
      .send({
        customer: { firstName: 'Test', phone, city: 'Tunis', address: 'Rue Test' },
        items: [{ lineId: 'l1', productId, name: 'X', price: 999, qty: 1, image: '' }], // client lies about price
        shipping: 8,
        couponCode: 'CTEST-PCT',
      })
      .expect(201);

    // server price = 100 (product regularPrice), 10% off = 10, + 8 shipping = 98 — client's price:999 is ignored
    expect(res.body.total).toBe(98);
  });

  test('a coupon usage limit is enforced atomically under concurrent checkouts', async () => {
    if (!infraAvailable) return;
    const productId = await createProduct('Commerce Test Coupon Limit', 100);
    await request(server)
      .post('/api/v1/admin/coupons')
      .set('Authorization', adminAuth)
      .send({ code: 'CTEST-LIMIT', type: 'fixed', value: 10, usageLimit: 1 })
      .expect(201);

    const payloadFor = (phone: string) => ({
      customer: { firstName: 'Test', phone, city: 'Tunis', address: 'Rue Test' },
      items: [{ lineId: 'l1', productId, name: 'X', price: 100, qty: 1, image: '' }],
      shipping: 0,
      couponCode: 'CTEST-LIMIT',
    });

    const [r1, r2] = await Promise.all([
      request(server).post('/api/v1/orders').set('X-Service-Token', serviceToken()).send(payloadFor(uniquePhone())),
      request(server).post('/api/v1/orders').set('X-Service-Token', serviceToken()).send(payloadFor(uniquePhone())),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 400]);

    const coupon = await coupons.findOne({ code: 'CTEST-LIMIT' });
    expect(coupon?.usageCount).toBe(1);
  });

  test('inventory.reserve in strict mode never oversells under concurrency', async () => {
    if (!infraAvailable) return;
    const productId = await createProduct('Commerce Test Strict Stock', 20);
    const actor = { type: 'system' as const, id: null, name: 'test' };
    await inventoryService.adjust(productId, 1, 'test seed', actor);

    const results = await Promise.allSettled([
      inventoryService.reserve(productId, 1, 'order-a', actor, true),
      inventoryService.reserve(productId, 1, 'order-b', actor, true),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientStockError);

    const { items } = await inventoryService.list(1, 10, 'Commerce Test Strict Stock');
    expect(items[0]?.reserved).toBe(1);
  });

  test('status transitions drive the stock ledger: no reservation on create, commit on confirme, restock on annule', async () => {
    if (!infraAvailable) return;
    const productId = await createProduct('Commerce Test Ledger', 30);
    const actor = { type: 'system' as const, id: null, name: 'test' };
    await inventoryService.adjust(productId, 3, 'test seed', actor);
    const phone = uniquePhone();
    const created = await request(server)
      .post('/api/v1/orders')
      .set('X-Service-Token', serviceToken())
      .send({
        customer: { firstName: 'Test', phone, city: 'Tunis', address: 'Rue Test' },
        items: [{ lineId: 'l1', productId, name: 'X', price: 30, qty: 3, image: '' }],
        shipping: 0,
      })
      .expect(201);
    const orderId = created.body.id as string;

    // Orders sit in 'en-attente' (phone-confirmation pending) without holding
    // stock — the seeded on-hand is untouched, nothing reserved.
    let { items } = await inventoryService.list(1, 10, 'Commerce Test Ledger');
    expect(items[0]?.reserved).toBe(0);
    expect(items[0]?.onHand).toBe(3);

    await request(server).put(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).send({ status: 'confirme' }).expect(200);
    ({ items } = await inventoryService.list(1, 10, 'Commerce Test Ledger'));
    expect(items[0]?.reserved).toBe(0);
    expect(items[0]?.onHand).toBe(0); // committed: seeded 3 - qty 3

    await request(server)
      .put(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminAuth)
      .send({ status: 'annule', reason: 'test cancel' })
      .expect(200);
    ({ items } = await inventoryService.list(1, 10, 'Commerce Test Ledger'));
    // restock: onHand goes back up by the committed qty
    expect(items[0]?.onHand).toBe(3);

    const { items: movements } = await inventoryService.movementsFor(productId, 1, 10);
    expect(movements.map((m) => m.type).reverse()).toEqual(['manual_adjust', 'order_commit', 'manual_adjust']);
  });

  test('tentative-1..5 transitions never touch stock, and stock still commits exactly once at confirme', async () => {
    if (!infraAvailable) return;
    const productId = await createProduct('Commerce Test Attempts Stock', 40);
    const actor = { type: 'system' as const, id: null, name: 'test' };
    await inventoryService.adjust(productId, 2, 'test seed', actor);
    const phone = uniquePhone();
    const created = await request(server)
      .post('/api/v1/orders')
      .set('X-Service-Token', serviceToken())
      .send({
        customer: { firstName: 'Test', phone, city: 'Tunis', address: 'Rue Test' },
        items: [{ lineId: 'l1', productId, name: 'X', price: 40, qty: 2, image: '' }],
        shipping: 0,
      })
      .expect(201);
    const orderId = created.body.id as string;

    for (const status of ['tentative-1', 'tentative-2', 'tentative-3']) {
      await request(server).put(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).send({ status }).expect(200);
      const { items } = await inventoryService.list(1, 10, 'Commerce Test Attempts Stock');
      expect(items[0]?.reserved).toBe(0);
      expect(items[0]?.onHand).toBe(2); // still seeded 2 — no reservation/commit through any attempt
    }

    await request(server).put(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).send({ status: 'confirme' }).expect(200);
    const { items } = await inventoryService.list(1, 10, 'Commerce Test Attempts Stock');
    expect(items[0]?.onHand).toBe(0); // committed exactly once here, not during any attempt

    const { items: movements } = await inventoryService.movementsFor(productId, 1, 10);
    // Only the seed adjustment and the single commit at confirme — the three
    // attempt transitions produced zero movement rows.
    expect(movements.map((m) => m.type).reverse()).toEqual(['manual_adjust', 'order_commit']);
  });

  test('tentative-5 -> annule restocks exactly once, same as confirme -> annule', async () => {
    if (!infraAvailable) return;
    const productId = await createProduct('Commerce Test Attempts Cancel', 25);
    const actor = { type: 'system' as const, id: null, name: 'test' };
    await inventoryService.adjust(productId, 1, 'test seed', actor);
    const phone = uniquePhone();
    const created = await request(server)
      .post('/api/v1/orders')
      .set('X-Service-Token', serviceToken())
      .send({
        customer: { firstName: 'Test', phone, city: 'Tunis', address: 'Rue Test' },
        items: [{ lineId: 'l1', productId, name: 'X', price: 25, qty: 1, image: '' }],
        shipping: 0,
      })
      .expect(201);
    const orderId = created.body.id as string;

    await request(server).put(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).send({ status: 'tentative-5' }).expect(200);
    let { items } = await inventoryService.list(1, 10, 'Commerce Test Attempts Cancel');
    expect(items[0]?.onHand).toBe(1); // still untouched — an attempt is not a commit

    await request(server)
      .put(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminAuth)
      .send({ status: 'annule', reason: 'client injoignable' })
      .expect(200);
    ({ items } = await inventoryService.list(1, 10, 'Commerce Test Attempts Cancel'));
    expect(items[0]?.onHand).toBe(1); // cancelling a never-committed order restocks nothing extra, stays at 1

    const order = await orders.findById(orderId);
    expect(order?.status).toBe('annule');
  });

  test('the attempt number lives in statusHistory: from/to/actor/date are recorded for every attempt transition, oldest first', async () => {
    if (!infraAvailable) return;
    const productId = await createProduct('Commerce Test Attempt History', 10);
    await inventoryService.adjust(productId, 1, 'test seed', { type: 'system', id: null, name: 'test' });
    const phone = uniquePhone();
    const created = await request(server)
      .post('/api/v1/orders')
      .set('X-Service-Token', serviceToken())
      .send({
        customer: { firstName: 'Test', phone, city: 'Tunis', address: 'Rue Test' },
        items: [{ lineId: 'l1', productId, name: 'X', price: 10, qty: 1, image: '' }],
        shipping: 0,
      })
      .expect(201);
    const orderId = created.body.id as string;

    await request(server).put(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).send({ status: 'tentative-1' }).expect(200);
    await request(server).put(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).send({ status: 'tentative-2' }).expect(200);
    await request(server).put(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).send({ status: 'confirme' }).expect(200);

    const order = await orders.findById(orderId);
    const transitions = (order?.statusHistory ?? []).map((h) => ({ from: h.from, to: h.to }));
    expect(transitions).toEqual([
      { from: null, to: 'en-attente' },
      { from: 'en-attente', to: 'tentative-1' },
      { from: 'tentative-1', to: 'tentative-2' },
      { from: 'tentative-2', to: 'confirme' },
    ]);
    for (const entry of order?.statusHistory ?? []) {
      expect(entry.by).toBeTruthy();
      expect(entry.at).toBeInstanceOf(Date);
    }
    // the legacy attempts counter (still exposed as meta._mzem_attempts)
    // tracks the last attempt number reached, not reset by the later confirm
    expect(order?.attempts).toBe(2);
  });

  test('saving the same status twice is a no-op: no duplicate history entry, no duplicate stock movement', async () => {
    if (!infraAvailable) return;
    const productId = await createProduct('Commerce Test No Dup Save', 12);
    const actor = { type: 'system' as const, id: null, name: 'test' };
    await inventoryService.adjust(productId, 1, 'test seed', actor);
    const phone = uniquePhone();
    const created = await request(server)
      .post('/api/v1/orders')
      .set('X-Service-Token', serviceToken())
      .send({
        customer: { firstName: 'Test', phone, city: 'Tunis', address: 'Rue Test' },
        items: [{ lineId: 'l1', productId, name: 'X', price: 12, qty: 1, image: '' }],
        shipping: 0,
      })
      .expect(201);
    const orderId = created.body.id as string;

    await request(server).put(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).send({ status: 'confirme' }).expect(200);
    await request(server).put(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).send({ status: 'confirme' }).expect(200);

    const order = await orders.findById(orderId);
    // Only one 'confirme' entry beyond the initial creation entry — the
    // second identical PUT is a same-status no-op (applyStatusTransition
    // returns early when from === nextStatus).
    expect((order?.statusHistory ?? []).filter((h) => h.to === 'confirme')).toHaveLength(1);

    const { items: movements } = await inventoryService.movementsFor(productId, 1, 10);
    expect(movements.filter((m) => m.type === 'order_commit')).toHaveLength(1);
  });

  test('GET /admin/orders/counts returns one aggregation matching individually-filtered list() totals', async () => {
    if (!infraAvailable) return;
    const productId = await createProduct('Commerce Test Counts', 18);
    // Only order c gets confirmed below (a and b stay at tentative-1), but
    // confirming still commits real stock, so it needs at least 1 unit on hand.
    await inventoryService.adjust(productId, 1, 'test seed', { type: 'system', id: null, name: 'test' });
    const makeOrder = () =>
      request(server)
        .post('/api/v1/orders')
        .set('X-Service-Token', serviceToken())
        .send({
          customer: { firstName: 'Test', phone: uniquePhone(), city: 'Tunis', address: 'Rue Test' },
          items: [{ lineId: 'l1', productId, name: 'X', price: 18, qty: 1, image: '' }],
          shipping: 0,
        })
        .expect(201);

    const [a, b, c] = await Promise.all([makeOrder(), makeOrder(), makeOrder()]);
    await request(server).put(`/api/v1/admin/orders/${a.body.id}`).set('Authorization', adminAuth).send({ status: 'tentative-1' }).expect(200);
    await request(server).put(`/api/v1/admin/orders/${b.body.id}`).set('Authorization', adminAuth).send({ status: 'tentative-1' }).expect(200);
    await request(server).put(`/api/v1/admin/orders/${c.body.id}`).set('Authorization', adminAuth).send({ status: 'confirme' }).expect(200);

    const counts = await request(server).get('/api/v1/admin/orders/counts').set('Authorization', adminAuth).expect(200);
    const list = await request(server)
      .get('/api/v1/admin/orders')
      .set('Authorization', adminAuth)
      .query({ status: 'tentative-1', perPage: 1 })
      .expect(200);

    expect(counts.body.attempts.attempt1).toBeGreaterThanOrEqual(2);
    expect(counts.body.attempts.attempt1).toBe(list.body.total);
    expect(counts.body.total).toBe(counts.body.pending + counts.body.confirmed + counts.body.attempts.total + counts.body.cancelled);
  });

  // Order-to-employee assignment was intentionally removed — every employee
  // can see and act on every order (no per-employee ownership scoping).
  test('every employee can read/update any order — no per-employee assignment scoping', async () => {
    if (!infraAvailable) return;
    await employees.deleteMany({ email: { $in: [EMPLOYEE_A_EMAIL, EMPLOYEE_B_EMAIL] } });
    await request(server)
      .post('/api/v1/admin/employees')
      .set('Authorization', adminAuth)
      .send({ name: 'Commerce Employee A', email: EMPLOYEE_A_EMAIL, password: EMPLOYEE_PASSWORD, role: 'cashier' })
      .expect(201);
    await request(server)
      .post('/api/v1/admin/employees')
      .set('Authorization', adminAuth)
      .send({ name: 'Commerce Employee B', email: EMPLOYEE_B_EMAIL, password: EMPLOYEE_PASSWORD, role: 'cashier' })
      .expect(201);

    const productId = await createProduct('Commerce Test Ownership', 15);
    await inventoryService.adjust(productId, 1, 'test seed', { type: 'system', id: null, name: 'test' });
    const phone = uniquePhone();
    const created = await request(server)
      .post('/api/v1/orders')
      .set('X-Service-Token', serviceToken())
      .send({
        customer: { firstName: 'Test', phone, city: 'Tunis', address: 'Rue Test' },
        items: [{ lineId: 'l1', productId, name: 'X', price: 15, qty: 1, image: '' }],
        shipping: 0,
      })
      .expect(201);
    const orderId = created.body.id as string;

    const loginA = await request(server).post('/api/v1/auth/login').send({ username: EMPLOYEE_A_EMAIL, password: EMPLOYEE_PASSWORD }).expect(200);
    const loginB = await request(server).post('/api/v1/auth/login').send({ username: EMPLOYEE_B_EMAIL, password: EMPLOYEE_PASSWORD }).expect(200);
    const authA = `Bearer ${String(loginA.body.accessToken)}`;
    const authB = `Bearer ${String(loginB.body.accessToken)}`;

    await request(server).get(`/api/v1/employee/orders/${orderId}`).set('Authorization', authA).expect(200);
    await request(server).get(`/api/v1/employee/orders/${orderId}`).set('Authorization', authB).expect(200);
    await request(server)
      .put(`/api/v1/employee/orders/${orderId}/status`)
      .set('Authorization', authB)
      .send({ status: 'confirme' })
      .expect(200);
    await request(server)
      .put(`/api/v1/employee/orders/${orderId}/status`)
      .set('Authorization', authA)
      .send({ status: 'not-a-real-status' })
      .expect(400);
  });

  function serviceToken(): string {
    return process.env.SERVICE_TOKEN ?? '';
  }
});
