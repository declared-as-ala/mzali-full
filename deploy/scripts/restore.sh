#!/usr/bin/env bash
set -Eeuo pipefail

usage() { echo "Usage: $0 <backup-dir> [--force-prod]" >&2; exit 64; }
[[ $# -ge 1 && $# -le 2 ]] || usage
BACKUP_DIR="$1"
FORCE_PROD=false
[[ ${2:-} == "--force-prod" ]] && FORCE_PROD=true
[[ -d "$BACKUP_DIR" ]] || { echo "Backup directory not found: $BACKUP_DIR" >&2; exit 1; }

archive="$BACKUP_DIR/dump.archive.gz"
[[ -s "$archive" ]] || { echo "Missing or empty archive: $archive" >&2; exit 1; }

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/deploy/.env}"
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${RESTORE_MONGODB_URI:?Set RESTORE_MONGODB_URI to the intended restore target}"
production_uri="${PROD_MONGODB_URI:-${MONGODB_URI:-}}"
if [[ -n "$production_uri" && "$RESTORE_MONGODB_URI" == "$production_uri" && "$FORCE_PROD" != true ]]; then
  echo "Refusing to restore into the production URI without --force-prod" >&2
  exit 1
fi

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

echo "Restoring $archive into the explicitly configured target (existing collections will be dropped)."
# RESTORE_URI is deliberately expanded inside the Mongo container.
# shellcheck disable=SC2016
compose exec -T -e RESTORE_URI="$RESTORE_MONGODB_URI" mongo sh -ec \
  'mongorestore --quiet --uri "$RESTORE_URI" --drop --archive --gzip' < "$archive"
echo "Restore completed."
