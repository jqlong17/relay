#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ECOSYSTEM_FILE="$ROOT_DIR/ecosystem.config.cjs"
BRIDGE_URL="${RELAY_LOCAL_BRIDGE_URL:-http://127.0.0.1:4242}"
WEB_URL="${RELAY_WEB_URL:-http://localhost:3000}"

wait_for_url() {
  local name="$1"
  local url="$2"
  local attempts="${3:-60}"
  local delay="${4:-1}"

  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "$name is healthy: $url"
      return 0
    fi

    sleep "$delay"
  done

  echo "$name failed health check: $url" >&2
  return 1
}

cd "$ROOT_DIR"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is required but was not found in PATH." >&2
  exit 1
fi

pm2 start "$ECOSYSTEM_FILE"

wait_for_url "local-bridge" "$BRIDGE_URL/health"
wait_for_url "web" "$WEB_URL"

echo
echo "Relay dev services are up."
echo
echo "- local-bridge: $BRIDGE_URL/health"
echo "- web: $WEB_URL"
echo
echo "Use 'pm2 logs relay-bridge' or 'pm2 logs relay-web' to inspect runtime logs."
