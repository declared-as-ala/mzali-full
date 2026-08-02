# Deployment Plan

Covers master-prompt §48–§49 as extensions to the existing
`deploy/docker-compose*.yml` + CI/CD (`current-state-audit.md` §11) —
extends, does not replace.

## Docker Compose additions

```yaml
# deploy/docker-compose.prod.yml — new service, alongside existing storefront/api/worker
pos:
  image: ${REGISTRY}/${GHCR_OWNER}/mzali-pos:${IMAGE_TAG}
  build: { context: ../pos, dockerfile: Dockerfile }
  environment:
    MZALI_API_URL: http://api:4000
    MZALI_SERVICE_TOKEN: ${MZALI_SERVICE_TOKEN}
    JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET}
  restart: unless-stopped
  networks: [mzali]
```

Same BFF pattern as `storefront` today — `pos` talks to `api` over the
internal Docker network only, never exposes it publicly, never talks to
Mongo/Redis/MinIO directly.

## Domains

```
ahmedmzaliboutique.com, www.        — existing storefront (unchanged)
pos.ahmedmzaliboutique.com          — new, routes to the `pos` service
admin.ahmedmzaliboutique.com        — stays commented out (see PLAN.md D1/D5) — admin remains at /mzali on the apex
api.ahmedmzaliboutique.com          — stays commented out (BFF pattern unchanged — see original migration D1)
media.ahmedmzaliboutique.com        — existing MinIO read-only route (unchanged)
```

Caddy config addition (`deploy/Caddyfile` or wherever the existing routes
live — check the file before assuming its name):

```
pos.ahmedmzaliboutique.com {
  reverse_proxy pos:3000
}
```

Only Caddy is publicly exposed, matching the existing rule (master-prompt
§48, already true for every other service).

## Health checks

`pos` gets the same healthcheck shape as `storefront`
(`GET /api/health` on the Next.js app, `curl`-based Docker healthcheck,
30s interval) — copy the existing storefront Dockerfile's healthcheck
block rather than inventing a new one.

## CI/CD additions

`.github/workflows/ci.yml` gains a `pos` job mirroring the existing
`frontend` job exactly (npm ci, eslint, tsc, build) plus a Docker build
step for `pos/Dockerfile`, and the `check-contracts` step already covers
any new `packages/contracts`-equivalent additions automatically since it's
a generic diff against `types/*.ts` (new contract files just need to be
added to the same mirrored-files list in
`backend/scripts/check-contracts.mjs`).

`.github/workflows/cd.yml` gains `mzali-pos` to the list of images built/
tagged/pushed on merge to main, and to the smoke-test step (a basic
`curl https://pos.ahmedmzaliboutique.com/api/health` after deploy, same
pattern as the existing storefront/api smoke checks).

## Backup scope

`deploy/scripts/backup.sh` (mongodump + MinIO mirror) needs no changes —
new collections (`variants`, `locations`, `stock_items`,
`suppliers`, `purchase_orders`, `goods_receipts`, `quotes`, `invoices`,
`loyalty_accounts`, `loyalty_transactions`, `pos_*`) live in the same
`mzali` database and are covered by the existing full-database dump
automatically. No new backup job needed unless the business wants a
faster/more-frequent backup cadence specifically for POS sales data —
raise that with the user if daily backup feels too infrequent once the
POS is handling real transaction volume.

## Rollout sequence (once Sprint 2+ is ready for a boutique to actually use)

1. Deploy `pos` service to production alongside the existing stack
   (already-proven deploy flow: build immutable images tagged with commit
   SHA, backup Mongo, pull, migrate, start, smoke test, keep previous
   images for rollback — unchanged from the original migration's CI/CD,
   `docs/deployment.md`).
2. Approve exactly one terminal (the actual till computer) via the admin
   console's new terminal-approval screen (`security-model.md`).
2. Run a single supervised test sale at the real terminal before handing
   it to a cashier unsupervised — verify the ticket prints (HTML fallback
   is fine for this), the boutique stock item actually decremented, and
   the sale shows up in the admin console's POS sales list.
3. Only after that: normal cashier operation.

No parallel-run/staging rehearsal is prescribed here the way the original
WooCommerce cutover required one (that migration had 32k+ historical
orders and a live production store to protect) — POS is a genuinely new
capability with no prior state to reconcile against, so the supervised-
first-sale check above is the appropriate bar, not a multi-day parallel
run.
