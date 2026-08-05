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

# $ENV_FILE (deploy/.env) is normally a symlink to the real secrets file at
# /opt/mzali/shared/.env.production — resolve it before writing, otherwise
# `mv` onto the symlink path deletes the symlink and drops a disconnected
# copy in its place, silently breaking "edit the shared file" forever after.
real_env_file="$(readlink -f "$ENV_FILE")"
tmp_env="$(mktemp "$real_env_file.XXXXXX")"
awk -v tag="$NEW_TAG" '
  BEGIN { replaced=0 }
  /^IMAGE_TAG=/ { print "IMAGE_TAG=" tag; replaced=1; next }
  { print }
  END { if (!replaced) print "IMAGE_TAG=" tag }
' "$real_env_file" > "$tmp_env"
chmod --reference="$real_env_file" "$tmp_env"
mv -f -- "$tmp_env" "$real_env_file"
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

deploy_failed() {
  local exit_code=$?
  echo "Deployment $NEW_TAG failed (exit $exit_code)." >&2
  if [[ -n "$previous_tag" && "$previous_tag" != "$NEW_TAG" ]]; then
    echo "Automatically rolling back to $previous_tag ..." >&2
    if bash "$SCRIPT_DIR/rollback-production.sh" "$previous_tag"; then
      echo "Rollback to $previous_tag succeeded." >&2
    else
      echo "Rollback to $previous_tag ALSO FAILED — manual intervention required." >&2
      echo "Previous known-good tag: $previous_tag" >&2
    fi
  else
    echo "No previous deploy tag recorded in deploy/.last-good — nothing to roll back to." >&2
  fi
  exit "$exit_code"
}
trap deploy_failed ERR

bash "$SCRIPT_DIR/backup-mongodb.sh"
bash "$SCRIPT_DIR/backup-minio.sh"
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
wait_for_container pos "fetch('http://127.0.0.1:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# Domain smoke tests require DNS to already point here (and a live TLS cert).
# During pre-DNS bring-up, set SKIP_DOMAIN_SMOKE_TESTS=true in deploy/.env —
# the container-internal health checks above already prove the app itself
# is healthy. Remove/unset this once DNS is live; it must not stay set in
# steady-state production (it would hide a real Caddy/DNS/TLS regression).
if [[ "${SKIP_DOMAIN_SMOKE_TESTS:-false}" == "true" ]]; then
  echo "SKIP_DOMAIN_SMOKE_TESTS=true — skipping domain smoke tests (container health checks above already passed)." >&2
else
  bash "$SCRIPT_DIR/verify-production.sh"
fi

printf '%s\n' "$NEW_TAG" > "$LAST_GOOD_FILE"
trap - ERR
echo "Deployment $NEW_TAG is healthy; previous tag was ${previous_tag:-none}."

# Every deploy pulls a fresh set of uniquely-tagged images and nothing ever
# removed the old ones — with a deploy on every push, that's an unbounded
# amount of dead image layers piling up on the host forever. Runs only after
# a confirmed-healthy deploy (never mid-deploy/rollback, where an older tag
# might still be needed) and only removes images with no running container,
# so this is always safe: anything actually in use is never touched, and
# anything pruned can simply be re-pulled from the registry if a rollback
# ever needs it again later.
docker image prune -af >&2 || echo "docker image prune failed (non-fatal, deploy already succeeded)" >&2
