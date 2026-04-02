#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="$ROOT_DIR/.relay-dev"
BRIDGE_PID_FILE="$STATE_DIR/local-bridge.pid"
WEB_PID_FILE="$STATE_DIR/web.pid"

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

stop_service() {
  local name="$1"
  local pid_file="$2"
  local port="$3"
  local pid

  pid="$(read_pid "$pid_file")"

  if ! is_pid_running "$pid"; then
    pid="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  fi

  if ! is_pid_running "$pid"; then
    echo "$name is not running"
    rm -f "$pid_file"
    return
  fi

  echo "stopping $name (pid: $pid)..."
  kill "$pid"

  for _ in {1..20}; do
    if ! is_pid_running "$pid"; then
      rm -f "$pid_file"
      echo "$name stopped"
      return
    fi

    sleep 0.25
  done

  echo "$name did not stop in time, forcing shutdown..."
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$pid_file"
}

stop_service "web" "$WEB_PID_FILE" "3000"
stop_service "local-bridge" "$BRIDGE_PID_FILE" "4242"

echo
echo "Relay dev services have been stopped."
