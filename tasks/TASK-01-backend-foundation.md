# TASK 01 — Backend foundation (NestJS skeleton, auth, dev infra)

You are a senior NestJS engineer working on the Mzali Boutique migration
(WooCommerce → self-owned NestJS + MongoDB + Redis + MinIO). Repo root:
`c:\Users\Ala\Desktop\mzali full`. The Next.js storefront at the root must NOT
be modified in this task (except nothing — it stays untouched).

## Context

- The storefront is Next.js 14 App Router at repo root; it currently talks to
  WooCommerce through the service factory `services/index.ts`. Do not touch it.
- The new backend lives in `backend/` — an independent npm project, a single
  NestJS app with three entrypoints: `src/main.ts` (API), `src/worker-main.ts`
  (BullMQ worker), `src/cli.ts` (nest-commander migrations CLI).
- Architecture decisions (locked): BFF pattern (API never exposed to browsers;
  the Next server calls it with an `X-Service-Token`), money as integer
  millimes, contracts mirrored from `types/` into `backend/src/contracts/`
  (drift-checked by `backend/scripts/check-contracts.mjs`), JWT access (15 min)
  + rotating refresh tokens hashed in a `sessions` collection with family-reuse
  detection, Argon2id + legacy-scrypt verify-then-rehash, code-defined RBAC
  (`backend/src/auth/permissions.ts`), append-only audit logs.

## Already done (verify, don't redo)

- `backend/package.json`, `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`,
  `.gitignore`, `.env.example`, `eslint.config.mjs`, `jest.config.cjs`,
  `jest.integration.config.cjs`, `scripts/check-contracts.mjs`
- `src/contracts/*` (mirror of `types/` + additive auth/employee/coupon/
  inventory/audit/stats/settings contracts)
- `src/config/` (zod-validated env), `src/common/` (money, phone, slug,
  pagination + unit tests), `src/database/` (mongoose, counters, txn helper),
  `src/redis/` (client + lock service)
- `src/auth/` (schema-backed sessions, AuthService with login/refresh-rotation/
  reuse-detection/lockout, password.ts argon2+scrypt-legacy, permissions +
  spec, guards: JwtAuthGuard/PermissionsGuard/ServiceTokenGuard, controller,
  DTOs), `src/users/` (Employee schema, UsersService, admin employees
  controller + directory controller), `src/audit/` (schema, sanitizing
  service), `src/health/`, `src/jobs/` (BullMQ root + 4 queues:
  media-processing, woocommerce-migration, carrier-push, cleanup)
- `src/app.module.ts`, `src/main.ts` (helmet, ValidationPipe whitelist/
  forbidNonWhitelisted/transform, /api/v1 prefix, Swagger behind
  SWAGGER_ENABLED), `src/worker.module.ts`, `src/worker-main.ts`,
  `src/worker-probe.ts`, `src/cli.ts` + `src/cli/verify-config.command.ts`

## Remaining work

1. **Dev infrastructure** — create `deploy/docker-compose.yml` (base) and
   `deploy/docker-compose.dev.yml` (dev overlay) with services:
   - `mongo` (mongo:7) as a **single-node replica set** `rs0`. Use the
     healthcheck-initiation pattern: healthcheck runs
     `mongosh --quiet --eval "try { rs.status().ok } catch (e) { rs.initiate({_id:'rs0',members:[{_id:0,host:'HOST:27017'}]}).ok }"`.
     In the dev overlay the member host must be `localhost:27017` and port
     27017 published, so a backend running on the host can connect with
     `mongodb://localhost:27017/mzali?directConnection=true`.
   - `redis` (redis:7-alpine, appendonly yes, port 6379 published in dev).
   - `minio` (minio/minio, ports 9000/9001 in dev) + `minio-init` one-shot
     (minio/mc) creating buckets `catalog, categories, banners, avatars,
     documents, exports, temp`, 7-day expiry lifecycle on `temp`, anonymous
     download policy on `catalog` and `categories` only. Credentials from env
     vars `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` (no hardcoded values;
     provide `deploy/.env.example`).
   - Named volumes, healthchecks on every service, an internal network.
2. **Install & verify**: `cd backend && npm install`, fix any version
   resolution issues (respect the majors already pinned in package.json:
   Nest 11, Mongoose 8, BullMQ 5, zod 3, argon2 0.41, sharp 0.33).
3. Create `backend/.env` from `.env.example` for local dev (generate real
   random secrets with `openssl rand -hex 32` or Node crypto; do NOT commit).
4. **Seed a dev super-admin**: `backend/scripts/seed-dev.ts` (run via
   `npx ts-node -r tsconfig-paths/register scripts/seed-dev.ts` or add an npm
   script) that upserts employee `admin@mzali.local`, role `super_admin`,
   password from `SEED_ADMIN_PASSWORD` env (default `admin12345` dev-only),
   argon2id-hashed. Idempotent.
5. **Integration test** `backend/test/integration/auth.spec.ts` (run with
   `npm run test:integration` while compose dev infra is up): boots the Nest
   app via `@nestjs/testing` + supertest against real Mongo/Redis and covers:
   login success (200 + tokens + user), wrong password (401), refresh rotation
   (old refresh token invalid after use), **reuse detection** (using the old
   token again revokes the whole family → the NEW token also stops working),
   `GET /api/v1/auth/me` with bearer, employees CRUD happy path with
   permissions (employee-role token gets 403 on `/api/v1/admin/employees`).
   Skip the whole suite gracefully (`describe.skip` style guard) when Mongo is
   unreachable.

## Verification gate (all must pass)

```bash
cd backend
npm run check:contracts     # contracts in sync
npm run typecheck           # tsc clean
npm run lint                # eslint clean
npm test                    # unit tests green (money, phone, permissions)
npm run build               # nest build → dist/main.js, worker-main.js, cli.js
docker compose -f ../deploy/docker-compose.yml -f ../deploy/docker-compose.dev.yml up -d
npm run test:integration    # auth integration suite green
npm start                   # API boots; then:
curl http://localhost:4000/health         # {"status":"ok",...}
node dist/cli.js verify-config            # mongodb: ok / redis: ok
```

Also verify the storefront still typechecks untouched:
`cd .. && npx tsc --noEmit`.

## Do NOT

- Touch anything outside `backend/` and `deploy/` (except reading).
- Weaken TypeScript strictness or skip failing tests.
- Commit any `.env` or secret.
- Add modules for catalog/orders/etc. — that's TASK-02/03.
