# Production Deployment — Reference

For the one-time initial setup, see `first-deployment.md`. This doc is the
ongoing reference for how the system is structured and how routine
deployments work once it's already running.

## Architecture

Three independent Next.js/NestJS builds behind one Caddy reverse proxy —
see `docs/deployment/ovh-production-audit.md` §1-2 for the full audit.
Admin is not a separate app; it's routes inside the storefront build,
reached via a redirect from `admin.ahmedmzaliboutique.tn` (§6 of the
audit doc explains why).

```
                         ┌─────────── Caddy (80/443 only) ───────────┐
                         │                                            │
  ahmedmzaliboutique.tn ─┤→ storefront:3000                          │
  www.ahmedmzaliboutique.tn → 301 → ahmedmzaliboutique.tn             │
  admin.ahmedmzaliboutique.tn → 301 → ahmedmzaliboutique.tn/admin     │
  pos.ahmedmzaliboutique.tn ──┤→ pos:3001                             │
  api.ahmedmzaliboutique.tn ──┤→ api:4000                             │
  media.ahmedmzaliboutique.tn →│ minio:9000 (catalog/categories/banners only)
                         └────────────────────────────────────────────┘
                                  mzali-internal network (no public ports)
                         mongo (rs0, auth)   redis (auth)   minio
```

## Where everything lives on the VPS

```
/opt/mzali/
  releases/mzali/      # git checkout, updated in place by CD (git checkout <sha>)
    deploy/.env         # symlink -> /opt/mzali/shared/.env.production
    deploy/.last-good    # last SHA that passed health+smoke checks
  shared/
    .env.production      # the ONLY copy of production secrets, chmod 600
  backups/
    mongo/<timestamp>/dump.archive.gz
    minio/<timestamp>/...
  logs/                  # reserved for any host-level cron log redirection
```

## Files that make this work

| File | Purpose |
|---|---|
| `deploy/docker-compose.yml` | Base: mongo, redis, minio, minio-init (infra only). |
| `deploy/docker-compose.prod.yml` | Adds storefront, pos, api, worker, caddy — all pulling `ghcr.io/.../mzali-*:${IMAGE_TAG}`. |
| `deploy/caddy/Caddyfile` | All six domains, security headers, SSE passthrough for POS live events, admin redirect, media allow-list. |
| `deploy/.env` (symlink) | Every `${VAR:?...}` in the compose files above. |
| `deploy/scripts/deploy.sh` | Backup → pull → up → wait-healthy → smoke test → record `.last-good`. Auto-rolls-back on any failure. |
| `deploy/scripts/rollback-production.sh` | Standalone rollback, also called automatically by `deploy.sh`. |
| `deploy/scripts/verify-production.sh` | The smoke-test suite (all 6 domains + product page + API health). |
| `deploy/scripts/backup-mongodb.sh` / `backup-minio.sh` | Pre-deploy backups; also cron these independently. |
| `.github/workflows/ci.yml` | Lint/typecheck/test/build/compose-validate/docker-build/Trivy-scan. |
| `.github/workflows/deploy-production.yml` | Build+push 4 images → SSH (password) → `deploy.sh`. |

## Routine deployment (after CI passes on `master`)

Nothing to do — `deploy-production.yml` triggers automatically. Watch it in
**Actions**. If your `production` GitHub environment requires an approving
reviewer, approve the run when prompted.

## Manual deployment of a specific commit

```bash
gh workflow run deploy-production.yml -f sha=<commit-sha>
```

## Manual deployment directly on the VPS (bypassing CI/CD entirely)

Only for emergencies / debugging the pipeline itself — normally let CD do
this:

```bash
ssh ubuntu@149.202.34.65
cd /opt/mzali/releases/mzali
git fetch origin && git checkout <commit-sha>
bash deploy/scripts/deploy.sh <commit-sha>
```

Note this requires the images for `<commit-sha>` to already exist in GHCR
(deploy.sh only pulls, it never builds).

## Image tags

Every image is tagged with the exact commit SHA (`mzali-storefront:<sha>`,
etc.) — `IMAGE_TAG` in `deploy/.env` is what's actually running, updated by
`deploy.sh` only after a deploy passes every check. `latest` is also pushed
as a convenience pointer for manual `docker pull` debugging, but the VPS
never deploys `latest` — only an explicit SHA, so a deploy is always
reproducible and rollback-able.

## What CI checks before any deploy can happen

`frontend` (storefront lint/typecheck/build), `pos` (same), `backend`
(contract-drift check, lint, typecheck, unit tests, integration tests
against real Mongo replica-set/Redis/MinIO service containers),
`compose-validate` (the merged prod compose file resolves with no missing
required variables), `docker` (builds all 4 images, scans each with Trivy
for CRITICAL CVEs). Every job must pass — `deploy-production.yml` only
triggers on a successful CI run.
