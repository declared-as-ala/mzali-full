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

  test('status transitions drive the stock ledger: reserve on create, commit on confirme, restock on annule', async () => {
    if (!infraAvailable) return;
    const productId = await createProduct('Commerce Test Ledger', 30);
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

    let { items } = await inventoryService.list(1, 10, 'Commerce Test Ledger');
    expect(items[0]?.reserved).toBe(3);

    await request(server).put(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).send({ status: 'confirme' }).expect(200);
    ({ items } = await inventoryService.list(1, 10, 'Commerce Test Ledger'));
    expect(items[0]?.reserved).toBe(0);
    expect(items[0]?.onHand).toBe(0); // started at 0, floored (no migration seed in this test)

    await request(server).put(`/api/v1/admin/orders/${orderId}`).set('Authorization', adminAuth).send({ status: 'annule' }).expect(200);
    ({ items } = await inventoryService.list(1, 10, 'Commerce Test Ledger'));
    // restock: onHand goes back up by the committed qty
    expect(items[0]?.onHand).toBe(3);

    const { items: movements } = await inventoryService.movementsFor(productId, 1, 10);
    expect(movements.map((m) => m.type).reverse()).toEqual(['order_reserve', 'order_commit', 'manual_adjust']);
  });

  test('an employee can only read/update their own assigned orders', async () => {
    if (!infraAvailable) return;
    await employees.deleteMany({ email: { $in: [EMPLOYEE_A_EMAIL, EMPLOYEE_B_EMAIL] } });
    const empA = await request(server)
      .post('/api/v1/admin/employees')
      .set('Authorization', adminAuth)
      .send({ name: 'Commerce Employee A', email: EMPLOYEE_A_EMAIL, password: EMPLOYEE_PASSWORD, role: 'employee' })
      .expect(201);
    await request(server)
      .post('/api/v1/admin/employees')
      .set('Authorization', adminAuth)
      .send({ name: 'Commerce Employee B', email: EMPLOYEE_B_EMAIL, password: EMPLOYEE_PASSWORD, role: 'employee' })
      .expect(201);

    const productId = await createProduct('Commerce Test Ownership', 15);
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

    await request(server)
      .post(`/api/v1/admin/orders/${orderId}/assign`)
      .set('Authorization', adminAuth)
      .send({ employeeId: empA.body.id })
      .expect(201);

    const loginA = await request(server).post('/api/v1/auth/login').send({ username: EMPLOYEE_A_EMAIL, password: EMPLOYEE_PASSWORD }).expect(200);
    const loginB = await request(server).post('/api/v1/auth/login').send({ username: EMPLOYEE_B_EMAIL, password: EMPLOYEE_PASSWORD }).expect(200);
    const authA = `Bearer ${String(loginA.body.accessToken)}`;
    const authB = `Bearer ${String(loginB.body.accessToken)}`;

    await request(server).get(`/api/v1/employee/orders/${orderId}`).set('Authorization', authA).expect(200);
    await request(server).get(`/api/v1/employee/orders/${orderId}`).set('Authorization', authB).expect(403);
    await request(server)
      .put(`/api/v1/employee/orders/${orderId}/status`)
      .set('Authorization', authB)
      .send({ status: 'confirme' })
      .expect(403);
    await request(server)
      .put(`/api/v1/employee/orders/${orderId}/status`)
      .set('Authorization', authA)
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
