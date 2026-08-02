#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/deploy/.env}"
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

BACKUP_TARGET="${BACKUP_TARGET:-/backups}"
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

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mongo_dir="$BACKUP_TARGET/mongo/$timestamp"
minio_dir="$BACKUP_TARGET/minio/$timestamp"
mkdir -p -- "$mongo_dir" "$minio_dir"

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

echo "Mirroring MinIO into $minio_dir"
# MinIO credentials expand in the one-shot container, not in the host shell.
# shellcheck disable=SC2016
compose run --rm --no-deps --entrypoint /bin/sh minio-init -ec '
  mc alias set backup-source http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
  mc mirror --overwrite backup-source/ "/backups/minio/'"$timestamp"'"
'

find "$BACKUP_TARGET/mongo" -mindepth 1 -maxdepth 1 -type d -mtime "+$BACKUP_RETENTION_DAYS" -exec rm -rf -- {} +
find "$BACKUP_TARGET/minio" -mindepth 1 -maxdepth 1 -type d -mtime "+$BACKUP_RETENTION_DAYS" -exec rm -rf -- {} +

echo "Backup completed: $timestamp"
