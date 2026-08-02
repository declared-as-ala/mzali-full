# TASK 07 — Docker production stack, CI/CD, backups

You are a senior DevOps engineer on the Mzali migration. Repo root:
`c:\Users\Ala\Desktop\mzali full`. TASK-01..06 gates green. Deployment
target: a Linux VPS with Docker Compose behind Caddy; images on GHCR.

## Build

### 1. Dockerfiles
- Root `Dockerfile` (storefront): multi-stage node:20-alpine — deps (npm ci)
  → build (`next build`, standalone output already configured) → runner:
  non-root `node` user, copy `.next/standalone` + `.next/static` + `public`,
  `HEALTHCHECK CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1`,
  `CMD ["node", "server.js"]`. Root `.dockerignore`: backend/, deploy/,
  data/, .env*, .git, .next, node_modules, tasks/, docs/.
- `backend/Dockerfile.api` and `backend/Dockerfile.worker`: shared builder
  stage (npm ci + `npm run build`), runtime: non-root, prod deps only
  (`npm ci --omit=dev`; note argon2/sharp need their prebuilds — alpine works
  with `apk add --no-cache libc6-compat` if needed, otherwise use
  node:20-slim). API healthcheck: GET /health/ready. Worker healthcheck:
  `node dist/worker-probe.js`. `backend/.dockerignore`.

### 2. Compose overlays (extend the existing deploy/docker-compose.yml + dev)
`deploy/docker-compose.prod.yml`:
- Services: storefront (env COMMERCE_PROVIDER, MZALI_API_URL=http://api:4000,
  service token, JWT secret), api, worker, mongo (rs0 + keyfile auth +
  MONGO_INITDB_ROOT_* from env), redis (requirepass from env, AOF), minio,
  minio-init, caddy. Images `ghcr.io/<owner>/mzali-{storefront,api,worker}:${IMAGE_TAG}`.
- ONLY caddy publishes ports (80/443). Mongo/Redis/MinIO/api/worker on the
  internal network only. Named volumes for mongo, redis, minio, caddy data.
  `restart: unless-stopped`, `depends_on` with `condition: service_healthy`,
  log rotation (json-file max-size/max-file).
- `deploy/caddy/Caddyfile`: `{$STOREFRONT_DOMAIN}` → storefront:3000;
  `{$MEDIA_DOMAIN}` → minio:9000 (read-only: only GET/HEAD proxied, path
  restricted to /catalog/* /categories/* /banners/*); admin console is part
  of the storefront (no separate domain); api.* stanza present but commented
  (BFF keeps the API internal); minio console NOT exposed (use SSH tunnel).
- `deploy/.env.example` documenting every variable (no real values).

### 3. GitHub Actions
- `.github/workflows/ci.yml` (on PR + push to master):
  - job frontend: npm ci, `npx next lint`, `npx tsc --noEmit`, `npm run build`
  - job backend: npm ci (backend/), `npm run check:contracts`, lint,
    typecheck, `npm test`; integration tests with service containers —
    mongo (single-node rs via healthcheck-init), redis, minio — then
    `npm run test:integration`
  - job docker: build all three images (no push) to prove Dockerfiles.
- `.github/workflows/cd.yml` (on push to master after CI, environment
  `production` with required approval):
  - build + push GHCR images tagged `${{ github.sha }}` (+ `latest`)
  - SSH deploy (appleboy/ssh-action or plain ssh with a deploy key secret):
    `deploy/scripts/deploy.sh <sha>` on the VPS which: writes IMAGE_TAG,
    runs `backup.sh` (pre-deploy gate — abort on failure), `docker compose
    pull`, `up -d`, waits on `/health/ready` + storefront `/api/health`,
    smoke-curls `/` and one product page; on failure prints rollback command
    (`IMAGE_TAG=<previous> docker compose up -d`) and exits non-zero.
  - Never deploy `latest` as the only tag; keep the previous tag documented
    in `deploy/.last-good` on the VPS.

### 4. Backup & restore (`deploy/scripts/`)
- `backup.sh`: mongodump (via the mongo container) → `/backups/mongo/<ts>/`
  compressed; `mc mirror` MinIO buckets → `/backups/minio/` (or a second
  disk/remote target from env `BACKUP_TARGET`); prune per retention env
  (default 14 daily). Designed for host cron (document the crontab line).
- `restore.sh <backup-dir>`: mongorestore --drop into a target URI (refuses
  to run against the prod URI without `--force-prod`).
- `verify-backup.sh`: restores the latest dump into a throwaway container,
  counts products/orders/employees, compares against live counts (±0), exits
  non-zero on mismatch. Document in `docs/backup-and-restore.md` and add a
  monthly verification reminder there.

## Verification gate

```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml config   # valid
docker build -t mzali-storefront .            # each image builds
docker build -f backend/Dockerfile.api -t mzali-api backend
docker build -f backend/Dockerfile.worker -t mzali-worker backend
# Full prod-like stack locally (with a test .env):
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml up -d
# → caddy serves the storefront, /health endpoints green, mongo rs healthy,
#   NO port published except caddy's; backup.sh + verify-backup.sh pass.
# CI: push a branch → both workflows' CI jobs green.
```

## Do NOT

- Publish Mongo/Redis/MinIO/API ports in prod compose.
- Put real secrets in any committed file.
- Run destructive migrations automatically in CD.
