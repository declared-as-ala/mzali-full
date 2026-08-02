#!/usr/bin/env bash
# Thin wrapper — see deploy/scripts/restore-mongodb.sh.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/../deploy/scripts/restore-mongodb.sh" "$@"
