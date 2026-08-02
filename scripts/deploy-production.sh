#!/usr/bin/env bash
# Thin wrapper — the real implementation lives in deploy/scripts/deploy.sh
# alongside the compose files and backup/rollback scripts it calls directly
# by relative path. Kept here too so the file structure matches
# docs/deployment/production-deployment.md exactly.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/../deploy/scripts/deploy.sh" "$@"
