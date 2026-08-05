#!/usr/bin/env bash
# Post-deploy smoke tests — verifies every public domain actually resolves,
# terminates TLS with a valid certificate (curl fails closed on a bad cert;
# no -k anywhere in this script), and returns a real response. Called by
# deploy.sh after containers report healthy; also safe to run standalone
# against an already-running deployment.
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/deploy/.env}"
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${STOREFRONT_DOMAIN:?Set STOREFRONT_DOMAIN in deploy/.env}"
: "${WWW_DOMAIN:?Set WWW_DOMAIN in deploy/.env}"
: "${ADMIN_DOMAIN:?Set ADMIN_DOMAIN in deploy/.env}"
: "${POS_DOMAIN:?Set POS_DOMAIN in deploy/.env}"
: "${API_DOMAIN:?Set API_DOMAIN in deploy/.env}"
: "${MEDIA_DOMAIN:?Set MEDIA_DOMAIN in deploy/.env}"
# SMOKE_PRODUCT_PATH is now optional — resolved dynamically below when unset
# (or still left at the deploy/.env.example placeholder). A manually-pinned
# slug goes stale the moment that product is ever unpublished/renamed/
# deleted, which previously made this ONE check permanently red — including
# during rollback, which re-runs this same script against the *previous*
# tag and fails it identically, so a bad SMOKE_PRODUCT_PATH could turn any
# ordinary failed smoke test into an unrecoverable "rollback also failed".
SMOKE_PRODUCT_PATH="${SMOKE_PRODUCT_PATH:-}"

CURL_RETRY=(--retry 5 --retry-delay 3 --retry-all-errors --max-time 20)
fail=0

# Expects exactly this status code (a real page must render).
check_status() {
  local name="$1" url="$2" want="$3"
  local got
  got="$(curl "${CURL_RETRY[@]}" --silent --show-error --location --output /dev/null --write-out '%{http_code}' "$url" || echo "000")"
  if [[ "$got" == "$want" ]]; then
    echo "OK   $name -> $got ($url)"
  else
    echo "FAIL $name -> got $got, expected $want ($url)" >&2
    fail=1
  fi
}

# Only proves TLS + HTTP actually answered — used where the correct response
# code varies by path (media only serves specific object prefixes; a bare
# domain hit there is a legitimate 404, not a failure).
check_reachable() {
  local name="$1" url="$2"
  local got
  got="$(curl "${CURL_RETRY[@]}" --silent --show-error --output /dev/null --write-out '%{http_code}' "$url" || echo "000")"
  if [[ "$got" != "000" ]]; then
    echo "OK   $name reachable -> $got ($url)"
  else
    echo "FAIL $name unreachable (TLS/connection failure) ($url)" >&2
    fail=1
  fi
}

# Pulls one real, currently-published product slug straight from the public
# catalog API (the same one the storefront itself calls) instead of relying
# on a path someone hand-typed into deploy/.env once — that product can be
# unpublished/renamed/deleted at any point afterward with nothing to catch
# the drift until the next deploy's smoke test mysteriously starts failing.
resolve_smoke_product_path() {
  if [[ -n "$SMOKE_PRODUCT_PATH" && "$SMOKE_PRODUCT_PATH" != "/produit/replace-with-a-real-product-slug" ]]; then
    echo "$SMOKE_PRODUCT_PATH"
    return
  fi
  local slug
  slug="$(curl "${CURL_RETRY[@]}" --silent --show-error \
    -H "X-Service-Token: ${SERVICE_TOKEN:-}" \
    "https://${API_DOMAIN}/api/v1/catalog/products?perPage=1&status=published" \
    | grep -o '"slug":"[^"]*"' | head -n1 | sed -E 's/"slug":"([^"]*)"/\1/' || true)"
  [[ -n "$slug" ]] && echo "/produit/$slug"
  return 0
}

echo "=== Verifying production domains ==="
check_status  "storefront home"        "https://${STOREFRONT_DOMAIN}/"                        200
check_status  "www -> storefront"      "https://${WWW_DOMAIN}/"                                200
check_status  "admin -> /admin"        "https://${ADMIN_DOMAIN}/"                              200
check_status  "pos home"               "https://${POS_DOMAIN}/"                                200
check_status  "api health/ready"       "https://${API_DOMAIN}/health/ready"                    200

resolved_product_path="$(resolve_smoke_product_path || true)"
if [[ -n "$resolved_product_path" ]]; then
  check_status "storefront product" "https://${STOREFRONT_DOMAIN}${resolved_product_path}" 200
else
  echo "WARN storefront product -> could not resolve any published product slug to check (catalog empty, or API unreachable) — skipping, not failing the deploy over it" >&2
fi
check_reachable "media"                "https://${MEDIA_DOMAIN}/"

if [[ "$fail" -ne 0 ]]; then
  echo "=== Smoke tests FAILED ===" >&2
  exit 1
fi
echo "=== All smoke tests passed ==="
