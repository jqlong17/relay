#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is required but was not found in PATH." >&2
  exit 1
fi

pm2 stop relay-web relay-bridge || true

echo
echo "Relay dev services have been stopped."
