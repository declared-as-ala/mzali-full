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
: "${SMOKE_PRODUCT_PATH:?Set SMOKE_PRODUCT_PATH to a real product page in deploy/.env}"

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

echo "=== Verifying production domains ==="
check_status  "storefront home"        "https://${STOREFRONT_DOMAIN}/"                        200
check_status  "storefront product"     "https://${STOREFRONT_DOMAIN}${SMOKE_PRODUCT_PATH}"     200
check_status  "www -> storefront"      "https://${WWW_DOMAIN}/"                                200
check_status  "admin -> /admin"        "https://${ADMIN_DOMAIN}/"                              200
check_status  "pos home"               "https://${POS_DOMAIN}/"                                200
check_status  "api health/ready"       "https://${API_DOMAIN}/health/ready"                    200
check_reachable "media"                "https://${MEDIA_DOMAIN}/"

if [[ "$fail" -ne 0 ]]; then
  echo "=== Smoke tests FAILED ===" >&2
  exit 1
fi
echo "=== All smoke tests passed ==="
