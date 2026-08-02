# Backup and Restore

## What gets backed up, and when

`deploy/scripts/deploy.sh` runs both backup scripts before every single
deployment, automatically — a deploy aborts (via `set -Eeuo pipefail`) if
either backup fails, so a broken backup blocks the deploy rather than
silently letting it proceed.

- **`deploy/scripts/backup-mongodb.sh`** — `mongodump --archive --gzip`
  piped directly to `$BACKUP_TARGET/mongo/<UTC timestamp>/dump.archive.gz`.
  Fails loudly (non-zero exit) if the resulting archive is empty.
- **`deploy/scripts/backup-minio.sh`** — `mc mirror` of every bucket to
  `$BACKUP_TARGET/minio/<UTC timestamp>/`.

Both prune anything older than `BACKUP_RETENTION_DAYS` (default 14) on
every run.

## Scheduling independent backups (in addition to pre-deploy ones)

Deploys don't happen every day — schedule these on cron too, as the
`ubuntu` user (needs Docker access, which bootstrap already granted):

```cron
# /etc/cron.d/mzali-backup — edit with: sudo crontab -e -u ubuntu
15 2 * * * cd /opt/mzali/releases/mzali && bash deploy/scripts/backup-mongodb.sh >> /opt/mzali/logs/backup-mongo.log 2>&1
30 2 * * * cd /opt/mzali/releases/mzali && bash deploy/scripts/backup-minio.sh >> /opt/mzali/logs/backup-minio.log 2>&1
30 3 1 * * cd /opt/mzali/releases/mzali && bash deploy/scripts/verify-backup.sh >> /opt/mzali/logs/backup-verify.log 2>&1
```

## Off-server copy — do not skip this

**The VPS must not be the only copy of your backups.** OVH's own backup
offer covers infrastructure-level snapshots, not this application-level
data, and a single-server failure (disk death, accidental `rm`, OVH-side
incident) would otherwise take out your only backup along with your only
live data. Mirror `/opt/mzali/backups/` off-server on a schedule — pick one:

- **rclone to any S3-compatible/off-site storage** (OVH Object Storage,
  Backblaze B2, another provider entirely):
  ```bash
  rclone sync /opt/mzali/backups/ remote:mzali-backups/ --min-age 1h
  ```
- **A second small VPS/NAS you control**, pulled via `rsync -e ssh` from
  outside (safer than pushing from the potentially-compromised primary).

Whichever you choose, verify the *off-server* copy periodically too — a
sync job that's been silently failing for weeks is not a backup.

## Retention

`BACKUP_RETENTION_DAYS` (default 14) controls local pruning only. Keep a
longer retention window on the off-server copy (e.g. 90 days) since
storage there is typically cheaper and you may not notice a data problem
for a while.

## Verification

```bash
bash deploy/scripts/verify-backup.sh
```

Finds the latest Mongo backup, restores it into an isolated throwaway
`mongo:7` container (never touches the live database), and compares exact
`products`/`orders`/`employees` document counts against live. Exits
non-zero on any mismatch or missing data. Schedule monthly (see cron above)
and alert on non-zero exit. This is real verification, not a
file-exists check — an empty or corrupt archive will fail this even though
`backup-mongodb.sh` itself already checks for a non-empty file.

## Restore — MongoDB

```bash
RESTORE_MONGODB_URI="mongodb://user:pass@host:27017/mzali_restore_test?..." \
  bash deploy/scripts/restore-mongodb.sh /opt/mzali/backups/mongo/20260729T021500Z
```

Uses `mongorestore --drop` — existing collections in the *target* database
are replaced. The script **refuses to run** if `RESTORE_MONGODB_URI` equals
the live production `MONGODB_URI` unless you pass `--force-prod`:

```bash
RESTORE_MONGODB_URI="$MONGODB_URI" \
  bash deploy/scripts/restore-mongodb.sh /opt/mzali/backups/mongo/20260729T021500Z --force-prod
```

Before a production restore: stop write traffic, take a fresh backup of
the *current* (about-to-be-overwritten) state first, record the active
`IMAGE_TAG`, and don't delete the pre-restore backup until the restored
system has passed a full smoke test.

## Restore — MinIO

```bash
bash deploy/scripts/restore-minio.sh /opt/mzali/backups/minio/20260729T021500Z --force-prod
```

By default this **mirrors in** (adds/overwrites files from the backup, never
deletes anything currently live that isn't in the backup) — safe against a
partial/incremental backup. Pass `--exact` if you specifically want live to
match the backup exactly, including deleting anything not present in it:

```bash
bash deploy/scripts/restore-minio.sh /opt/mzali/backups/minio/20260729T021500Z --exact --force-prod
```

## Restic/encrypted-backup note

Nothing here encrypts backups at rest beyond `mongodump --gzip`'s
compression (not encryption) and whatever the off-server transport provides
(e.g. S3 server-side encryption, SSH transport encryption in transit).
Product/order/customer data is not currently classified as requiring
backup-at-rest encryption in this system, but if that changes, wrap the
off-server sync step in `gpg`/`age` encryption or use a backup tool with
built-in encryption (restic, borg) rather than modifying these scripts to
grow that responsibility.
