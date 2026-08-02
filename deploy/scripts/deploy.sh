#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 || -z "$1" ]]; then
  echo "Usage: $0 <git-sha>" >&2
  exit 64
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$REPO_ROOT/deploy/.env"
LAST_GOOD_FILE="$REPO_ROOT/deploy/.last-good"
NEW_TAG="$1"

[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }
cd "$REPO_ROOT"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

previous_tag="${IMAGE_TAG:-}"
if [[ -f "$LAST_GOOD_FILE" ]]; then
  previous_tag="$(tr -d '[:space:]' < "$LAST_GOOD_FILE")"
fi

tmp_env="$(mktemp "$ENV_FILE.XXXXXX")"
awk -v tag="$NEW_TAG" '
  BEGIN { replaced=0 }
  /^IMAGE_TAG=/ { print "IMAGE_TAG=" tag; replaced=1; next }
  { print }
  END { if (!replaced) print "IMAGE_TAG=" tag }
' "$ENV_FILE" > "$tmp_env"
chmod --reference="$ENV_FILE" "$tmp_env"
mv -f -- "$tmp_env" "$ENV_FILE"
export IMAGE_TAG="$NEW_TAG"

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

rollback_hint() {
  echo "Deployment failed." >&2
  if [[ -n "$previous_tag" ]]; then
    echo "Rollback: IMAGE_TAG=$previous_tag docker compose --env-file deploy/.env -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml up -d" >&2
  else
    echo "No previous deploy tag was recorded in deploy/.last-good." >&2
  fi
}
trap rollback_hint ERR

bash "$SCRIPT_DIR/backup.sh"
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
  echo "$service failed its post-deploy health probe" >&2
  return 1
}

wait_for_container api "fetch('http://127.0.0.1:4000/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
wait_for_container storefront "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

: "${STOREFRONT_DOMAIN:?Set STOREFRONT_DOMAIN in deploy/.env}"
: "${SMOKE_PRODUCT_PATH:?Set SMOKE_PRODUCT_PATH to a real product page in deploy/.env}"
curl --fail --silent --show-error --retry 5 --retry-delay 3 "https://${STOREFRONT_DOMAIN}/" >/dev/null
curl --fail --silent --show-error --retry 5 --retry-delay 3 "https://${STOREFRONT_DOMAIN}${SMOKE_PRODUCT_PATH}" >/dev/null

printf '%s\n' "$NEW_TAG" > "$LAST_GOOD_FILE"
trap - ERR
echo "Deployment $NEW_TAG is healthy; previous tag was ${previous_tag:-none}."
