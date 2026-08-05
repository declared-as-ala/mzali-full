#!/usr/bin/env bash
# Logical MongoDB backup — mongodump piped straight to a compressed archive,
# never landing unencrypted on disk as loose files. Run before every deploy
# (see deploy.sh) and safe to run standalone / on a cron.
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/deploy/.env}"
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

BACKUP_TARGET="${BACKUP_TARGET:-/opt/mzali/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
if [[ "$BACKUP_TARGET" == /* ]]; then
  [[ "$BACKUP_TARGET" != "/" && ${#BACKUP_TARGET} -gt 4 ]]
elif [[ "$BACKUP_TARGET" =~ ^[A-Za-z]:/ ]]; then
  [[ ${#BACKUP_TARGET} -gt 7 ]]
else
  echo "BACKUP_TARGET must be a specific absolute directory, not '$BACKUP_TARGET'" >&2
  exit 1
fi
[[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] || { echo "Invalid BACKUP_RETENTION_DAYS" >&2; exit 1; }

# Prune BEFORE creating the new backup, not just after — see backup-minio.sh
# for why (a near-full disk needs the space freed before it can succeed).
find "$BACKUP_TARGET/mongo" -mindepth 1 -maxdepth 1 -type d -mtime "+$BACKUP_RETENTION_DAYS" -exec rm -rf -- {} + 2>/dev/null || true

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mongo_dir="$BACKUP_TARGET/mongo/$timestamp"
mkdir -p -- "$mongo_dir"

compose() {
  if [[ ${OSTYPE:-} == msys* ]]; then
    local windows_env windows_base windows_prod
    windows_env="$(cygpath -w "$ENV_FILE")"
    windows_base="$(cygpath -w "$REPO_ROOT/deploy/docker-compose.yml")"
    windows_prod="$(cygpath -w "$REPO_ROOT/deploy/docker-compose.prod.yml")"
    MSYS_NO_PATHCONV=1 docker compose --env-file "$windows_env" \
      -f "$windows_base" -f "$windows_prod" "$@"
  else
    docker compose --env-file "$ENV_FILE" \
      -f "$REPO_ROOT/deploy/docker-compose.yml" \
      -f "$REPO_ROOT/deploy/docker-compose.prod.yml" "$@"
  fi
}

echo "Creating MongoDB backup $mongo_dir/dump.archive.gz"
# Variables in this single-quoted command expand inside the Mongo container.
# shellcheck disable=SC2016
compose exec -T mongo sh -ec '
  mongodump --quiet --username "$MONGO_INITDB_ROOT_USERNAME" \
    --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin \
    --db mzali --archive --gzip
' > "$mongo_dir/dump.archive.gz"
[[ -s "$mongo_dir/dump.archive.gz" ]] || { echo "MongoDB backup is empty" >&2; exit 1; }

find "$BACKUP_TARGET/mongo" -mindepth 1 -maxdepth 1 -type d -mtime "+$BACKUP_RETENTION_DAYS" -exec rm -rf -- {} +

echo "MongoDB backup completed: $timestamp"
echo "REMINDER: this is a local copy only — mirror $BACKUP_TARGET/mongo off-server" \
     "(see docs/deployment/backup-and-restore.md). Do not rely on the VPS being the only copy."
