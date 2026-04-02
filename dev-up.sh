#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="$ROOT_DIR/.relay-dev"
BRIDGE_PID_FILE="$STATE_DIR/local-bridge.pid"
WEB_PID_FILE="$STATE_DIR/web.pid"
BRIDGE_LOG_FILE="$STATE_DIR/local-bridge.log"
WEB_LOG_FILE="$STATE_DIR/web.log"

BRIDGE_URL="${RELAY_LOCAL_BRIDGE_URL:-http://127.0.0.1:4242}"
WEB_URL="${RELAY_WEB_URL:-http://localhost:3000}"

mkdir -p "$STATE_DIR"

is_pid_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local file="$1"
  if [[ -f "$file" ]]; then
    tr -d '[:space:]' <"$file"
  fi
}

start_bridge() {
  local pid
  pid="$(read_pid "$BRIDGE_PID_FILE")"

  if is_pid_running "$pid"; then
    echo "local-bridge is already running (pid: $pid)"
    return
  fi

  echo "starting local-bridge..."
  nohup pnpm --filter local-bridge dev >"$BRIDGE_LOG_FILE" 2>&1 &
  echo $! >"$BRIDGE_PID_FILE"
}

start_web() {
  local pid
  pid="$(read_pid "$WEB_PID_FILE")"

  if is_pid_running "$pid"; then
    echo "web is already running (pid: $pid)"
    return
  fi

  echo "starting web..."
  nohup pnpm --filter web dev >"$WEB_LOG_FILE" 2>&1 &
  echo $! >"$WEB_PID_FILE"
}

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

print_status() {
  local bridge_pid web_pid
  bridge_pid="$(read_pid "$BRIDGE_PID_FILE")"
  web_pid="$(read_pid "$WEB_PID_FILE")"

  cat <<EOF

Relay dev services are up.

- local-bridge: $BRIDGE_URL/health
  pid: ${bridge_pid:-unknown}
  log: $BRIDGE_LOG_FILE

- web: $WEB_URL
  pid: ${web_pid:-unknown}
  log: $WEB_LOG_FILE
EOF
}

cd "$ROOT_DIR"

start_bridge
wait_for_url "local-bridge" "$BRIDGE_URL/health"

start_web
wait_for_url "web" "$WEB_URL"

print_status
