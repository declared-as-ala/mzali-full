#!/usr/bin/env bash
# Restores a timestamped MinIO backup directory (created by backup-minio.sh)
# back into the live MinIO instance. Mirrors files in — does NOT delete
# objects that exist live but aren't in the backup, so this is safe to run
# against a partial/incremental backup without destroying newer data;
# pass --exact if you specifically want live to match the backup exactly
# (deletes anything not present in the backup).
set -Eeuo pipefail

usage() { echo "Usage: $0 <backup-dir> [--exact] [--force-prod]" >&2; exit 64; }
[[ $# -ge 1 && $# -le 3 ]] || usage
BACKUP_DIR="$1"; shift
EXACT=false
FORCE_PROD=false
for arg in "$@"; do
  case "$arg" in
    --exact) EXACT=true ;;
    --force-prod) FORCE_PROD=true ;;
    *) usage ;;
  esac
done
[[ -d "$BACKUP_DIR" ]] || { echo "Backup directory not found: $BACKUP_DIR" >&2; exit 1; }
[[ -n "$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]] || { echo "Backup directory is empty: $BACKUP_DIR" >&2; exit 1; }

if [[ "$FORCE_PROD" != true ]]; then
  echo "Refusing to restore into the live MinIO instance without --force-prod" \
       "(this always targets whatever deploy/.env currently points at)." >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/deploy/.env}"
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

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

# BACKUP_DIR is a host path; mc runs inside the one-shot minio-init
# container, which already mounts $BACKUP_TARGET at /backups (see
# docker-compose.yml). Translate the host path to the in-container one.
BACKUP_TARGET="${BACKUP_TARGET:-/opt/mzali/backups}"
case "$BACKUP_DIR" in
  "$BACKUP_TARGET"/*) container_dir="/backups/${BACKUP_DIR#"$BACKUP_TARGET"/}" ;;
  *) echo "Backup dir must be under BACKUP_TARGET ($BACKUP_TARGET) so the container can see it" >&2; exit 1 ;;
esac

mirror_flag=""
[[ "$EXACT" == true ]] && mirror_flag="--remove"

echo "Restoring MinIO from $BACKUP_DIR into the live instance (exact=$EXACT)"
# shellcheck disable=SC2016
compose run --rm --no-deps --entrypoint /bin/sh minio-init -ec '
  mc alias set restore-target http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
  mc mirror --overwrite '"$mirror_flag"' "'"$container_dir"'" restore-target/
'
echo "MinIO restore completed."
