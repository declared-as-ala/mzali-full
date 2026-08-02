# Troubleshooting

## Certificate issuance fails / Caddy won't start

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml logs caddy
```

- **`dial tcp: lookup <domain>: no such host`** or ACME challenge timeout —
  DNS hasn't propagated yet (§2 of `first-deployment.md`). Wait, re-verify
  with `dig +short <domain>`, then restart just Caddy:
  `docker compose ... restart caddy`.
- **`too many certificates already issued`** — you hit Let's Encrypt's
  5/week-per-domain-set rate limit, almost always from repeatedly tearing
  down the `caddy-data` volume while testing. Wait out the window; don't
  delete `caddy-data` to "fix" this, that's what caused it.
- **Port 80 already in use** — something else is bound to it (check with
  `sudo ss -ltnp '( sport = :80 )'`). The bootstrap script warns about this
  on first run; if it changed since, find and stop the conflicting process.

## `deploy.sh` fails at the backup step

- Mongo backup: usually an auth failure (`MONGO_INITDB_ROOT_USERNAME`/
  `_PASSWORD` in `deploy/.env` don't match what Mongo was actually
  initialized with — these can't be changed after the volume already
  exists without re-initializing Mongo, which is destructive; if you need
  to change them, do it before the first `mongo` container start).
- MinIO backup: check `minio`/`minio-init` are healthy first
  (`docker compose ... ps`); `mc mirror` failures are usually a stale
  `MINIO_ROOT_PASSWORD` mismatch between `deploy/.env` and what's actually
  running.
- Either way: `deploy.sh` exits **before** touching any running containers
  if the backup fails — production is untouched, safe to fix and retry.

## `deploy.sh` fails at health-check / smoke-test — did it roll back?

Check the tail of the Action log (or the SSH session if run manually) for
`"ROLLBACK SUCCEEDED"` vs `"ROLLBACK FAILED"`. If it failed:

```bash
ssh ubuntu@149.202.34.65
cd /opt/mzali/releases/mzali
docker compose --env-file deploy/.env -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml ps
docker compose --env-file deploy/.env -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml logs --tail=100 api storefront pos
```

Diagnose from the logs, then either fix forward (push a new commit) or
force a manual rollback: `bash deploy/scripts/rollback-production.sh`.

## GitHub Action can't SSH in (`deploy-production.yml`)

- **`ssh: handshake failed`** / auth failure — `VPS_PASSWORD` secret is
  wrong or was rotated on the VPS without updating the secret (see
  "Rotating the VPS password" in `github-secrets.md`).
- **Connection refused / timeout** — UFW may have been reset (re-run
  `scripts/bootstrap-ovh-vps.sh`, it's idempotent) or `VPS_HOST`/`VPS_PORT`
  secrets are wrong.
- **Works manually but not from Actions** — check the VPS's Fail2ban
  hasn't banned GitHub's runner IP range after a prior failed-auth burst:
  `sudo fail2ban-client status sshd`.

## `docker: permission denied` when running compose commands on the VPS

The `ubuntu` user's docker-group membership only takes effect in a **new**
shell session. If you just ran the bootstrap script, log out and back in
(`exit` then `ssh` again) rather than continuing in the same session.

## Container shows `unhealthy` but looks fine in logs

Check the exact healthcheck command and its result directly:

```bash
docker inspect --format='{{json .State.Health}}' <container-name> | jq
```

For `api`/`storefront`/`pos`, the healthcheck hits their own
`/health*`/`/api/health` endpoint over `127.0.0.1` inside the container —
if the app is up but the healthcheck still fails, it's almost always the
app not actually listening on the expected port/host yet (check `PORT`/
`HOSTNAME` env vars match what's in the Dockerfile's `HEALTHCHECK`).

## MongoDB replica set won't initiate

```bash
docker compose ... exec mongo mongosh --quiet \
  --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin --eval 'rs.status()'
```

If this errors with "no replset config", the healthcheck's `rs.initiate()`
never ran successfully — check `docker compose ... logs mongo` for the
actual Mongo startup error (often a stale/mismatched keyfile after a
partial volume reset, or insufficient `start_period` on a very slow first
boot — the healthcheck allows 30 retries × 5s, should be enough on
reasonable VPS specs).

## Disk filling up

```bash
df -h /
docker system df
```

Old, unreferenced images accumulate over time (every deploy pushes new SHA
tags that are never automatically deleted from GHCR *or* pulled locally
without cleanup). Periodically, **not** as part of automated CI/CD:

```bash
docker image prune -a --filter "until=720h"   # images untouched for 30+ days
```

**Never** run `docker system prune --volumes` or `docker compose down -v`
on production — both would delete `mongo-data`/`redis-data`/`minio-data`.
Neither this doc nor any script here ever does either.

## "It works when I curl it but the browser shows a security warning"

Almost always an intermediate/stale browser HSTS cache from testing an
earlier, differently-configured deployment of the same domain, or a
clock-skew issue on the client. Confirm with `curl -v` (shows the actual
cert chain) before assuming a server-side problem.

## Where to look first, always

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml ps
docker compose --env-file deploy/.env -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml logs --tail=200 <service>
bash deploy/scripts/verify-production.sh
```
