#!/usr/bin/env bash
# Rolls the running deployment back to a previous image tag. Called
# automatically by deploy.sh when a new deployment fails health/smoke
# checks; also safe to run manually:
#   bash deploy/scripts/rollback-production.sh [tag]
# With no argument, rolls back to whatever's recorded in deploy/.last-good
# (which deploy.sh only updates AFTER a deployment passes verification, so
# it's always the last known-good tag, not necessarily the immediately
# prior one).
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$REPO_ROOT/deploy/.env"
LAST_GOOD_FILE="$REPO_ROOT/deploy/.last-good"

[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }
cd "$REPO_ROOT"

TARGET_TAG="${1:-}"
if [[ -z "$TARGET_TAG" ]]; then
  [[ -f "$LAST_GOOD_FILE" ]] || { echo "No tag given and no deploy/.last-good on record — nothing to roll back to." >&2; exit 1; }
  TARGET_TAG="$(tr -d '[:space:]' < "$LAST_GOOD_FILE")"
fi
[[ -n "$TARGET_TAG" ]] || { echo "Resolved an empty rollback tag." >&2; exit 1; }

echo "Rolling back to image tag: $TARGET_TAG"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

tmp_env="$(mktemp "$ENV_FILE.XXXXXX")"
awk -v tag="$TARGET_TAG" '
  BEGIN { replaced=0 }
  /^IMAGE_TAG=/ { print "IMAGE_TAG=" tag; replaced=1; next }
  { print }
  END { if (!replaced) print "IMAGE_TAG=" tag }
' "$ENV_FILE" > "$tmp_env"
chmod --reference="$ENV_FILE" "$tmp_env"
mv -f -- "$tmp_env" "$ENV_FILE"
export IMAGE_TAG="$TARGET_TAG"

compose() {
  if [[ ${OSTYPE:-} == msys* ]]; then
    local windows_env
    windows_env="$(cygpath -w "$ENV_FILE")"
    MSYS_NO_PATHCONV=1 docker compose --env-file "$windows_env" \
      -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml "$@"
  else
    docker compose --env-file "$ENV_FILE" \
      -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml "$@"
  fi
}

# Rollback never re-runs migrations or touches data — see
# docs/deployment/rollback.md for why a database rollback is a separate,
# explicit, manual decision, not something this script does automatically.
compose pull
compose up -d --remove-orphans

wait_for_container() {
  local service="$1" probe="$2" attempts="${3:-30}"
  for ((i=1; i<=attempts; i++)); do
    if compose exec -T "$service" node -e "$probe" >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done
  echo "$service did not become healthy during rollback" >&2
  return 1
}

if ! wait_for_container api "fetch('http://127.0.0.1:4000/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
  || ! wait_for_container storefront "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
  || ! wait_for_container pos "fetch('http://127.0.0.1:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then
  echo "ROLLBACK FAILED: containers did not become healthy on tag $TARGET_TAG." >&2
  exit 1
fi

if ! bash "$SCRIPT_DIR/verify-production.sh"; then
  echo "ROLLBACK FAILED: smoke tests did not pass on tag $TARGET_TAG." >&2
  exit 1
fi

printf '%s\n' "$TARGET_TAG" > "$LAST_GOOD_FILE"
echo "ROLLBACK SUCCEEDED: now running $TARGET_TAG."
