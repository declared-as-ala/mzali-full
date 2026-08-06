# OVH Production Deployment — Audit

Audited directly against the repository contents on 2026-07-29. This is not a
speculative plan — every claim below was verified by reading the actual files
listed.

## 1. Real architecture (not the architecture assumed in the request)

This is **three independent, non-workspace npm projects** plus a NestJS
backend — not a monorepo, no Turborepo/Nx, no shared `node_modules`:

| App | Location | package.json name | Port | Notes |
|---|---|---|---|---|
| Storefront **+ Admin** | `/` (repo root) | `mzali-next` | 3000 | Admin (`app/admin/**`) is **not a separate app** — it's routes inside the same Next.js build as the storefront. |
| POS | `pos/` | `mzali-pos` | 3001 | Genuinely separate Next.js app, own build, own auth cookies (`mzali_pos_at`/`mzali_pos_rt`). |
| API | `backend/` (main entry) | `mzali-backend` | 4000 | NestJS, own `package.json`/lockfile. |
| Worker | `backend/` (worker entry) | same package, `dist/worker-main.js` | — | Same image build, different `CMD`. |

**Critical correction to the request's assumed architecture:** there is no
"Admin container" to route `admin.ahmedmzaliboutique.tn` to. Admin lives at
`ahmedmzaliboutique.tn/admin/*` inside the storefront app. See §6 for how
this is handled without a risky app-splitting rewrite.

## 2. What already exists and works — reuse, don't replace

This repo already has a materially complete production deployment system
from an earlier build-out. Reusing it (not duplicating it) is the right call
per your own instructions.

- **`deploy/docker-compose.yml`** (base) + **`deploy/docker-compose.prod.yml`**
  (prod overlay) + **`deploy/docker-compose.dev.yml`** (dev port-exposure
  overlay). Services: `mongo` (replica set, keyfile auth, idempotent
  `rs.initiate` in the healthcheck), `redis` (password-protected, AOF
  persistence), `minio` + `minio-init` (idempotent bucket creation:
  `catalog`, `categories`, `banners`, `avatars`, `documents`, `exports`,
  `temp`), `storefront`, `api`, `worker`, `caddy`.
- **`deploy/caddy/Caddyfile`** — Caddy already chosen and working
  (automatic HTTPS via ACME, `encode zstd gzip`). Currently routes only
  `STOREFRONT_DOMAIN` and `MEDIA_DOMAIN` (scoped to GET/HEAD on
  `/catalog/* /categories/* /banners/*` — MinIO console is never exposed).
  API is deliberately **not** publicly routed today (commented out, with an
  explanatory comment — see §5).
- **`.github/workflows/ci.yml`** — frontend job (lint, typecheck, build),
  backend job (contract-drift check, lint, typecheck, unit tests,
  integration tests against real Mongo replica-set + Redis + MinIO service
  containers), docker job (builds storefront/api/worker images, no push).
  **Gap: POS is never built or tested.**
- **`.github/workflows/cd.yml`** — triggers on CI success on `master`,
  builds+pushes `storefront`/`api`/`worker` to GHCR tagged with commit SHA
  (+ `latest`), then SSHes into the VPS via `appleboy/ssh-action` and runs
  `deploy/scripts/deploy.sh <sha>`. **Gap: uses `VPS_SSH_KEY` (private key),
  not password auth. POS is never built/pushed/deployed. No rollback-on-
  failure, no concurrency guard, no `workflow_dispatch`.**
- **`deploy/scripts/deploy.sh`** — already does real work correctly: takes a
  backup (`backup.sh`) **before** pulling new images, updates `IMAGE_TAG` in
  `deploy/.env` idempotently, `docker compose pull && up -d`, waits for
  `api`/`storefront` health via an in-container Node fetch probe, curls two
  real storefront URLs as a smoke test, and only then writes
  `deploy/.last-good`. On any failure it prints the exact rollback command
  (doesn't yet auto-execute it).
- **`deploy/scripts/backup.sh`** — `mongodump --archive --gzip` piped
  straight to a timestamped file (never lands unencrypted `mongodump` output
  loose on disk) + `mc mirror` of the whole MinIO bucket set, with
  retention-day pruning of both. **Already runs before every deploy** —
  this satisfies your "backup before deployment, abort on backup failure"
  requirement almost entirely as-is (it uses `set -Eeuo pipefail`, so a
  failed backup aborts `deploy.sh` via the `trap ... ERR`).
- **`deploy/scripts/restore.sh`** — MongoDB-only restore, with a real safety
  rail: refuses to restore into a URI that matches the configured production
  URI unless you pass `--force-prod`.
- **`deploy/scripts/verify-backup.sh`** — spins up a *throwaway* `mongo:7`
  container on the same Docker network, restores the latest backup into it,
  and diffs `products`/`orders`/`employees` document counts against the live
  database. Real verification, not a file-exists check.
- **Dockerfiles** — `Dockerfile` (storefront), `pos/Dockerfile`,
  `backend/Dockerfile.api`, `backend/Dockerfile.worker`: all multi-stage,
  all run as the non-root `node` user, all use Next.js `output: 'standalone'`
  where applicable, all have a `HEALTHCHECK` hitting a real health endpoint.
  These need no rework — POS's Dockerfile in particular was already built
  correctly, it was just never wired into the compose/CI/CD files.
- **Health endpoints** — already exist and are already safe (no internal
  details leaked): API `GET /health`, `/health/live`, `/health/ready`
  (checks live Mongo connection state + Redis `PING`); storefront
  `GET /api/health`; POS `GET /api/health`. Nothing to build here.
- **`app/api/health/route.ts` comment confirms intent**: *"Intentionally
  reports no infrastructure details (public robots.txt already disallows
  /api/)."* — matches your health-check requirement already.

## 3. What must be added

- **POS is entirely missing from deployment.** Not in `deploy/docker-compose*.yml`,
  not in the Caddyfile, not built or pushed in CI/CD. This is the single
  biggest gap versus your acceptance criteria (`pos.ahmedmzaliboutique.tn`
  is explicitly required).
- **Admin/POS/API/media public domains** — only storefront + media are
  routed today. Need admin (see §6 for the real solution), pos, api, media.
- **Password-based SSH deploy** — `cd.yml` uses `secrets.VPS_SSH_KEY`. You
  explicitly want `VPS_HOST`/`VPS_PORT`/`VPS_USER`/`VPS_PASSWORD` instead,
  no private key. `appleboy/ssh-action` supports a `password:` input as a
  direct alternative to `key:` — same action, different auth path.
- **No `workflow_dispatch`, no `concurrency` group, no explicit rollback
  script** (only a printed hint) in the current CD flow.
- **No VPS bootstrap script** — nothing installs Docker/UFW/Fail2ban or
  creates `/opt/mzali` on a fresh VPS today.
- **No MinIO restore script** (only Mongo restore exists).
- **No dedicated `backup-mongodb.sh`/`backup-minio.sh` split** — currently
  one combined `backup.sh`. Splitting is a clean decomposition, not a
  rewrite (see §5 for how I did this without duplicating logic).
- **No CORS config on the API** — see §7, this is deliberate today and I'm
  keeping the default off, adding it only as an explicit opt-in.

## 4. Migration risk

- **Low risk for storefront/api/worker**: their compose service definitions,
  Dockerfiles, and CD path already work; I'm extending, not replacing them.
- **Medium risk for the admin domain**: see §6 — I'm using a redirect
  rather than an app-splitting rewrite specifically *because* the
  alternative (Next.js host-based middleware rewriting) touches live
  authentication-adjacent routing (`proxy.ts`) that turned out to be dead
  code (see the callout below) and deserves its own focused change, not a
  rider on an infra PR.
- **Zero risk to data**: nothing in this change touches `mongo-data`,
  `redis-data`, or `minio-data` volume definitions, and `deploy.sh` never
  runs `down -v`.
- **Pre-existing bug found, not fixed here (flagging, not silently
  patching):** `proxy.ts` at the repo root contains real `/admin/*` and
  `/employee/*` redirect-to-login logic (checks a signed `mzali_session`
  cookie), but Next.js 14 only auto-loads middleware from a file literally
  named `middleware.ts` — confirmed no such file exists and nothing imports
  `proxy.ts`. **This middleware currently never runs.** It is not a security
  hole (every admin API route independently checks `isAdmin()` server-side —
  confirmed by reading several), just a missing redirect-to-login UX layer.
  I'm not fixing this as a drive-by inside a deployment PR; flagging it here
  so it doesn't get lost.

## 5. Required GitHub Secrets

**Deploy transport (per your explicit requirement — password, no key):**
| Secret | Value |
|---|---|
| `VPS_HOST` | `149.202.34.65` |
| `VPS_PORT` | `22` |
| `VPS_USER` | `ubuntu` |
| `VPS_PASSWORD` | the VPS password (rotate after pasting into GitHub once) |
| `VPS_DEPLOY_PATH` | `/opt/mzali` |

**Registry:**
| Secret | Value |
|---|---|
| `GHCR_USERNAME` | not needed — CD uses `github.actor` + `secrets.GITHUB_TOKEN` already, matching the existing `cd.yml` pattern |

**Application secrets — do NOT put real values in the repo.** These already
live only in `deploy/.env` on the VPS (gitignored, `chmod 600`), populated
from `deploy/.env.example`. Full list with what each one actually does in
*this* codebase (I removed the ones your template listed that don't apply —
see the note at the end):

`GHCR_OWNER`, `IMAGE_TAG`, `STOREFRONT_DOMAIN`, `WWW_DOMAIN`, `ADMIN_DOMAIN`,
`POS_DOMAIN`, `API_DOMAIN`, `MEDIA_DOMAIN`, `MINIO_PUBLIC_URL`,
`CADDY_ACME_EMAIL`, `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_SITE_URL`,
`COMMERCE_PROVIDER`, `SESSION_SECRET`, `JWT_ACCESS_SECRET`, `SERVICE_TOKEN`,
`MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`,
`MONGO_REPLICA_KEY`, `MONGODB_URI`, `REDIS_PASSWORD`, `REDIS_URL`,
`MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `ACCESS_TOKEN_TTL_MINUTES`,
`REFRESH_TOKEN_TTL_DAYS`, `SESSION_ROLLING_ENABLED`,
`AUTH_PROACTIVE_REFRESH_SECONDS`, `STRICT_STOCK`, `CORS_ORIGINS` (new, optional —
see §7), carrier tokens (`NAVEX_*`/`FIRST_DELIVERY_*`/`AXESS_*`),
`BACKUP_TARGET`, `BACKUP_RETENTION_DAYS`, `SMOKE_PRODUCT_PATH`.

**Note on your secrets template vs. reality:** `SMTP_*`, `NEXTAUTH_SECRET`,
`COOKIE_SECRET`, and "payment secrets" don't correspond to anything in this
codebase — there is no email sending anywhere (confirmed: no SMTP client,
no mail queue processor exists), auth is custom JWT + HMAC-signed cookies
(not NextAuth), and payment is COD-only (no payment gateway integration
exists). I did not fabricate config for features that don't exist; I noted
this rather than silently dropping it so you know it was a deliberate
omission, not an oversight.

## 6. Admin domain — subdomain-native, no /admin in the URL bar

Superseded: `admin.ahmedmzaliboutique.tn` now serves `/admin/*` content
directly — no redirect, no `/admin` prefix ever visible. `middleware.ts`
(repo root) rewrites incoming requests based on the `Host` header: on
`ADMIN_DOMAIN`, bare paths are rewritten internally to their `/admin/*`
equivalent (e.g. `/stock` → `/admin/stock`, invisible to the browser);
`/login` rewrites to `/admin-login`. On the main storefront domain, old
`/admin/*` links get a 308 redirect over to the subdomain instead, for
backward compatibility with existing bookmarks.

Every internal admin link/redirect (Sidebar nav, login flow, drawer
401-handlers, dashboard widgets) had to be updated to be host-aware rather
than hardcoding `/admin/...` — see `lib/admin-nav.ts` (window/header-based
checks for use in event handlers, where `window` is reliably available
post-hydration) and `lib/admin-nav-context.tsx` (`useAdminHref()`, a React
context fed by `app/admin/layout.tsx`'s server-side `headers()` check — used
anywhere a link renders directly in JSX, since `window` isn't available
during SSR/first paint and using it there would show the wrong prefix on
initial load). Employee (`/employee/*`) and its shared `/admin-login` page
are unaffected — only admin moved.

Local dev (no `ADMIN_DOMAIN` env var set) is unaffected: middleware no-ops
entirely, and every host-aware link falls back to its original
`/admin`-prefixed form, exactly as before this change.

## 7. CORS — deliberately still off by default

`backend/src/main.ts` has an explicit comment: *"BFF architecture: browsers
never call this API directly — no CORS needed."* Confirmed true for both
apps: storefront calls the API via `MZALI_API_URL` server-side
(`http://api:4000`, internal Docker network only), and POS does the exact
same thing (`pos/lib/api-client.ts` reads `process.env.MZALI_API_URL`
server-side too). **No browser in this system calls the API's public domain
directly today.** Exposing `api.ahmedmzaliboutique.tn` publicly (per your
explicit domain list) is therefore safe from a functionality standpoint —
nothing depends on it — but I added an *optional* `CORS_ORIGINS` env var
wired through `main.ts` (disabled unless set) so that if you ever do want
browser-direct API calls later, it's a one-line env change, not a code
change. Left off by default to preserve the existing, deliberate security
boundary.

## 8. Required OVH DNS records

See `docs/deployment/ovh-dns.md` for the full guide. Summary:

```
@       A    149.202.34.65
www     A    149.202.34.65
admin   A    149.202.34.65
pos     A    149.202.34.65
api     A    149.202.34.65
media   A    149.202.34.65
```

No AAAA records (IPv6 not verified on this VPS — adding one without a
working IPv6 route/firewall rule would make some clients try IPv6 first and
fail).
