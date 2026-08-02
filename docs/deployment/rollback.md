# Rollback

## Automatic rollback

`deploy/scripts/deploy.sh` already rolls back automatically: it records the
previous `IMAGE_TAG` before touching anything, and if the new deployment
fails health checks or smoke tests (`deploy/scripts/verify-production.sh`),
its `ERR` trap immediately calls `rollback-production.sh` with the previous
tag. You'll see this in the `deploy-production.yml` Action log — a failed
run doesn't necessarily mean production is broken, it means the *new*
version was rejected and the *previous* version should already be running
again. Always check the log for `"ROLLBACK SUCCEEDED"` vs
`"ROLLBACK FAILED"`.

## Manual rollback

```bash
ssh ubuntu@149.202.34.65
cd /opt/mzali/releases/mzali
bash deploy/scripts/rollback-production.sh            # rolls back to deploy/.last-good
bash deploy/scripts/rollback-production.sh <old-sha>   # rolls back to a specific tag
```

This:
1. Sets `IMAGE_TAG` in `deploy/.env` to the target tag.
2. `docker compose pull && up -d --remove-orphans`.
3. Waits for `api`/`storefront`/`pos` health.
4. Runs the full domain smoke-test suite.
5. Updates `deploy/.last-good` only if all of the above succeeded.

Reports `ROLLBACK SUCCEEDED` or `ROLLBACK FAILED` explicitly — it does not
exit silently either way.

## What rollback does NOT do

**It never touches the database.** Rolling back containers to an older
image does not undo migrations or restore data — see the next section for
why, and what to do if you genuinely need a database rollback too.

## Database rollback — separate, manual, deliberate

Container rollback and database rollback are different operations with
different blast radii, and conflating them is how you lose data that a
*newer* order/product/customer record needed. Only restore the database if:

- The failed deployment ran a destructive/irreversible migration (this
  repo's migration commands are designed to be additive/idempotent —
  see `backend/src/migration/` — but always verify for the specific change
  in question), **and**
- You've confirmed real production writes since the pre-deploy backup are
  either acceptable to lose or have been manually reconciled.

If you decide it's necessary:

```bash
# 1. Stop write traffic first — take the storefront/api/pos offline or put
#    Caddy in maintenance mode, otherwise new writes race the restore.
# 2. Find the backup taken immediately before the bad deploy:
ls -la /opt/mzali/backups/mongo/
# 3. Restore into the live URI — requires the explicit safety flag:
RESTORE_MONGODB_URI="$MONGODB_URI" bash deploy/scripts/restore-mongodb.sh \
  /opt/mzali/backups/mongo/<timestamp> --force-prod
# 4. Restart the app containers, verify, then resume traffic.
```

See `docs/deployment/backup-and-restore.md` for the full restore procedure
and its safety rails (it refuses to run against the production URI without
`--force-prod`, by design).

## Keeping enough history to roll back

- **Previous commit SHA**: `deploy/.last-good` on the VPS.
- **Previous image tags**: every SHA ever deployed stays in GHCR
  indefinitely (images aren't deleted automatically) — you can roll back to
  any prior SHA, not just the immediately preceding one, as long as you know
  the SHA (`git log` in the repo).
- **Pre-deployment database backup**: `deploy/scripts/deploy.sh` takes one
  before every single deploy, timestamped, under
  `/opt/mzali/backups/{mongo,minio}/`.

## Verifying a rollback actually worked

```bash
bash deploy/scripts/verify-production.sh
```
Same smoke-test suite used during deploy — run it again any time you're
unsure of current production state.
