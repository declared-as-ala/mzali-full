# Backup and restore operations

Production backups are created by `deploy/scripts/backup.sh`. The script
creates a compressed MongoDB archive under
`$BACKUP_TARGET/mongo/<UTC timestamp>/dump.archive.gz` and mirrors all MinIO
buckets to `$BACKUP_TARGET/minio/<UTC timestamp>/`. It exits non-zero if the
database archive is empty or either backup operation fails. The default
retention is 14 days and is controlled by `BACKUP_RETENTION_DAYS`.

## Scheduling

Run the backup as the same Linux user that owns the deployment checkout and
can access Docker. Example daily cron entry (02:15 UTC):

```cron
15 2 * * * cd /srv/mzali && bash ./deploy/scripts/backup.sh >> /var/log/mzali-backup.log 2>&1
```

Prefer mounting `BACKUP_TARGET` from a second disk or remote-backed filesystem.
A backup on the same disk as MongoDB is not sufficient disaster recovery.

## Verification

`deploy/scripts/verify-backup.sh` finds the latest archive, restores it into an
isolated throwaway MongoDB container, then compares exact `products`, `orders`,
and `employees` counts with the live database. The container is removed on
exit. Run this monthly and alert on any non-zero exit:

```cron
30 3 1 * * cd /srv/mzali && bash ./deploy/scripts/verify-backup.sh >> /var/log/mzali-backup-verify.log 2>&1
```

Monthly reminder: review the verification log, confirm MinIO files exist for
the same timestamp, and perform a manual sample download from each public
bucket.

## Restore

Set `RESTORE_MONGODB_URI` in `deploy/.env` to the explicit target, then pass the
timestamped Mongo backup directory:

```bash
bash ./deploy/scripts/restore.sh /backups/mongo/20260717T021500Z
```

The restore uses `mongorestore --drop`; existing collections in the target are
replaced. The script refuses to run when `RESTORE_MONGODB_URI` equals the
production `MONGODB_URI`. Restoring production requires an explicit second
argument and an approved maintenance window:

```bash
bash ./deploy/scripts/restore.sh /backups/mongo/20260717T021500Z --force-prod
```

Before a production restore, stop storefront writes, take another backup,
record the active `IMAGE_TAG`, and retain the failed database volume until the
restored system has passed checkout and admin smoke tests.
