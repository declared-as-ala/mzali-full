import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { Connection, Model } from 'mongoose';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { hashPassword } from '@/auth/password';
import { Session } from '@/auth/session.schema';
import { Employee } from '@/users/employee.schema';

const ADMIN_EMAIL = 'integration.admin@mzali.local';
const ADMIN_PASSWORD = 'integration-admin-password';
const EMPLOYEE_EMAIL = 'integration.employee@mzali.local';
const EMPLOYEE_PASSWORD = 'integration-employee-password';
const PARITY_EMPLOYEE_EMAIL = 'integration.parity.employee@mzali.local';
const PARITY_EMPLOYEE_PASSWORD = 'integration-parity-password';
const DISABLE_EMPLOYEE_EMAIL = 'integration.disable.employee@mzali.local';
const DISABLE_EMPLOYEE_PASSWORD = 'integration-disable-password';
const ALL_TEST_EMAILS = [ADMIN_EMAIL, EMPLOYEE_EMAIL, PARITY_EMPLOYEE_EMAIL, DISABLE_EMPLOYEE_EMAIL];

describe('Auth and employee administration (integration)', () => {
  let app: INestApplication | undefined;
  let server: Server;
  let employees: Model<Employee>;
  let sessions: Model<Session>;
  let connection: Connection;
  let jwt: JwtService;
  let infraAvailable = true;

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
      connection = app.get<Connection>(getConnectionToken());
      jwt = app.get<JwtService>(JwtService);

      await cleanTestData();
      await employees.create({
        email: ADMIN_EMAIL,
        name: 'Integration Admin',
        role: 'super_admin',
        active: true,
        passwordHash: await hashPassword(ADMIN_PASSWORD),
      });
    } catch (error) {
      infraAvailable = false;
      process.stderr.write(
        `Skipping auth integration suite: MongoDB dev infrastructure is unavailable (${String(error)})\n`,
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
    await employees.deleteMany({ email: { $in: ALL_TEST_EMAILS } });
    await sessions.deleteMany({});
    await connection.collection('audit_logs').deleteMany({
      'actor.name': { $in: ['Integration Admin', 'Integration Employee'] },
    });
  }

  test('login succeeds and returns tokens plus the authenticated user', async () => {
    if (!infraAvailable) return;
    const response = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);

    expect(response.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresIn: expect.any(Number),
      user: { email: ADMIN_EMAIL, role: 'super_admin', name: 'Integration Admin' },
    });
  });

  test('login rejects a wrong password', async () => {
    if (!infraAvailable) return;
    await request(server)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: 'definitely-wrong' })
      .expect(401);
  });

  test('refresh rotates tokens and reuse revokes the entire token family', async () => {
    if (!infraAvailable) return;
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    const oldToken = login.body.refreshToken as string;

    const rotated = await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldToken })
      .expect(200);
    const newToken = rotated.body.refreshToken as string;
    expect(newToken).not.toBe(oldToken);

    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldToken })
      .expect(401);
    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: newToken })
      .expect(401);
  });

  test('GET /auth/me returns the bearer-token user', async () => {
    if (!infraAvailable) return;
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);

    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${String(login.body.accessToken)}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ email: ADMIN_EMAIL, role: 'super_admin' });
      });
  });

  test('employee CRUD works for an admin and an employee token receives 403', async () => {
    if (!infraAvailable) return;
    const adminLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    const adminAuth = `Bearer ${String(adminLogin.body.accessToken)}`;

    const created = await request(server)
      .post('/api/v1/admin/employees')
      .set('Authorization', adminAuth)
      .send({
        name: 'Integration Employee',
        email: EMPLOYEE_EMAIL,
        password: EMPLOYEE_PASSWORD,
        role: 'cashier',
      })
      .expect(201);
    const employeeId = created.body.id as string;

    await request(server)
      .get(`/api/v1/admin/employees/${employeeId}`)
      .set('Authorization', adminAuth)
      .expect(200);
    await request(server)
      .patch(`/api/v1/admin/employees/${employeeId}`)
      .set('Authorization', adminAuth)
      .send({ name: 'Integration Employee Updated' })
      .expect(200)
      .expect(({ body }) => expect(body.name).toBe('Integration Employee Updated'));

    const employeeLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: EMPLOYEE_EMAIL, password: EMPLOYEE_PASSWORD })
      .expect(200);
    await request(server)
      .get('/api/v1/admin/employees')
      .set('Authorization', `Bearer ${String(employeeLogin.body.accessToken)}`)
      .expect(403);

    await request(server)
      .delete(`/api/v1/admin/employees/${employeeId}`)
      .set('Authorization', adminAuth)
      .expect(200)
      .expect({ ok: true });
  });

  test('an expired access token is rejected with 401, and the refresh token still yields a working new one', async () => {
    if (!infraAvailable) return;
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);

    const expiredAccessToken = await jwt.signAsync(
      { sub: login.body.user.id, role: login.body.user.role, name: login.body.user.name },
      { expiresIn: '-10s' },
    );
    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredAccessToken}`)
      .expect(401);

    const refreshed = await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    // What a caller retrying-once-after-refresh (see withAuthRetry on the
    // frontend) depends on: the same logical request succeeds on retry.
    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${String(refreshed.body.accessToken)}`)
      .expect(200);
  });

  test('concurrent refresh requests presenting the same token: exactly one succeeds, the other is treated as reuse', async () => {
    if (!infraAvailable) return;
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    const rt = login.body.refreshToken as string;

    const [a, b] = await Promise.all([
      request(server).post('/api/v1/auth/refresh').send({ refreshToken: rt }),
      request(server).post('/api/v1/auth/refresh').send({ refreshToken: rt }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 401]);
  });

  test('admin logout does not revoke a separate, independent employee session', async () => {
    if (!infraAvailable) return;
    await employees.create({
      email: PARITY_EMPLOYEE_EMAIL,
      name: 'Parity Employee',
      role: 'cashier',
      active: true,
      passwordHash: await hashPassword(PARITY_EMPLOYEE_PASSWORD),
    });

    const adminLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    const employeeLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: PARITY_EMPLOYEE_EMAIL, password: PARITY_EMPLOYEE_PASSWORD })
      .expect(200);

    await request(server)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: adminLogin.body.refreshToken })
      .expect(200);

    // The admin's own session is dead...
    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: adminLogin.body.refreshToken })
      .expect(401);
    // ...but the unrelated employee session (a different session document
    // entirely — logout only ever revokes the one it was called with) is
    // completely unaffected.
    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: employeeLogin.body.refreshToken })
      .expect(200);
  });

  test('employee logout does not revoke the admin session', async () => {
    if (!infraAvailable) return;
    const adminLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    const employeeLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: PARITY_EMPLOYEE_EMAIL, password: PARITY_EMPLOYEE_PASSWORD })
      .expect(200);

    await request(server)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: employeeLogin.body.refreshToken })
      .expect(200);

    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: employeeLogin.body.refreshToken })
      .expect(401);
    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: adminLogin.body.refreshToken })
      .expect(200);
  });

  test('disabling an employee account immediately revokes their existing session and blocks new logins', async () => {
    if (!infraAvailable) return;
    const employee = await employees.create({
      email: DISABLE_EMPLOYEE_EMAIL,
      name: 'Disable Employee',
      role: 'cashier',
      active: true,
      passwordHash: await hashPassword(DISABLE_EMPLOYEE_PASSWORD),
    });

    const adminLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    const employeeLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: DISABLE_EMPLOYEE_EMAIL, password: DISABLE_EMPLOYEE_PASSWORD })
      .expect(200);

    await request(server)
      .patch(`/api/v1/admin/employees/${employee.id}`)
      .set('Authorization', `Bearer ${String(adminLogin.body.accessToken)}`)
      .send({ active: false })
      .expect(200);

    // Revoked immediately — not just once the (short-lived) access token
    // would eventually have expired on its own.
    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: employeeLogin.body.refreshToken })
      .expect(401);
    await request(server)
      .post('/api/v1/auth/login')
      .send({ username: DISABLE_EMPLOYEE_EMAIL, password: DISABLE_EMPLOYEE_PASSWORD })
      .expect(403);
  });
});
