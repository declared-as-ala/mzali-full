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
latest="$(find "$BACKUP_TARGET/mongo" -mindepth 1 -maxdepth 1 -type d -print | sort | tail -n 1)"
[[ -n "$latest" && -s "$latest/dump.archive.gz" ]] || { echo "No valid MongoDB backup found" >&2; exit 1; }

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

mongo_id="$(compose ps -q mongo)"
[[ -n "$mongo_id" ]] || { echo "Production MongoDB container is not running" >&2; exit 1; }
network="$(docker inspect "$mongo_id" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' | head -n 1)"
[[ -n "$network" ]] || { echo "Could not determine the MongoDB network" >&2; exit 1; }

verify_name="mzali-backup-verify-$$"
cleanup() { docker rm -f "$verify_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --rm --name "$verify_name" --network "$network" mongo:7 \
  mongod --bind_ip_all >/dev/null
for _ in {1..30}; do
  docker exec "$verify_name" mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' 2>/dev/null | grep -q 1 && break
  sleep 2
done
docker exec "$verify_name" mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' | grep -q 1
docker exec -i "$verify_name" mongorestore --quiet --archive --gzip < "$latest/dump.archive.gz"

live_count() {
  # Database credentials and COLLECTION expand inside the Mongo container.
  # shellcheck disable=SC2016
  compose exec -T -e COLLECTION="$1" mongo sh -ec '
    mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" \
      --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin \
      mzali --eval "db.getCollection(process.env.COLLECTION).countDocuments({})"
  ' | tr -d '[:space:]'
}

restored_count() {
  docker exec -e COLLECTION="$1" "$verify_name" mongosh --quiet mzali \
    --eval 'db.getCollection(process.env.COLLECTION).countDocuments({})' | tr -d '[:space:]'
}

for collection in products orders employees; do
  live="$(live_count "$collection")"
  restored="$(restored_count "$collection")"
  [[ "$live" =~ ^[0-9]+$ && "$restored" =~ ^[0-9]+$ ]] || {
    echo "Could not read $collection counts (live=$live restored=$restored)" >&2
    exit 1
  }
  if [[ "$live" -ne "$restored" ]]; then
    echo "$collection count mismatch: live=$live restored=$restored" >&2
    exit 1
  fi
  echo "$collection: $live (verified)"
done

echo "Latest backup verified successfully: $latest"
