#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
IOS_DIR="${ROOT_DIR}/apps/ios"
PACKAGE_DIR="${IOS_DIR}/RelayIOSKit"

if ! command -v rg >/dev/null 2>&1; then
  echo "error: ripgrep (rg) is required" >&2
  exit 1
fi

errors=0
warnings=0
TMP_OUTPUT="$(mktemp -t relay-ios-check.XXXXXX)"

trap 'rm -f "${TMP_OUTPUT}"' EXIT

print_header() {
  printf '\n[%s]\n' "$1"
}

fail_pattern() {
  local label="$1"
  local pattern="$2"
  local search_root="$3"

  if rg -n --glob '*.swift' "$pattern" "$search_root" >"${TMP_OUTPUT}" 2>/dev/null; then
    echo "error: ${label}"
    cat "${TMP_OUTPUT}"
    errors=$((errors + 1))
  else
    echo "ok: ${label}"
  fi
}

warn_pattern() {
  local label="$1"
  local pattern="$2"
  local search_root="$3"

  if rg -n --glob '*.swift' "$pattern" "$search_root" >"${TMP_OUTPUT}" 2>/dev/null; then
    echo "warn: ${label}"
    cat "${TMP_OUTPUT}"
    warnings=$((warnings + 1))
  else
    echo "ok: ${label}"
  fi
}

print_header "toolchain"
xcodebuild -version
swift --version

print_header "forbidden legacy patterns"
fail_pattern "Do not introduce ObservableObject in new iOS code" '\\bObservableObject\\b' "$IOS_DIR"
fail_pattern "Do not introduce @Published in new iOS code" '@Published\\b' "$IOS_DIR"
fail_pattern "Do not introduce @ObservedObject in new iOS code" '@ObservedObject\\b' "$IOS_DIR"
fail_pattern "Do not introduce @StateObject in new iOS code" '@StateObject\\b' "$IOS_DIR"
fail_pattern "Do not introduce @EnvironmentObject in new iOS code" '@EnvironmentObject\\b' "$IOS_DIR"
fail_pattern "Do not introduce NavigationView in new iOS code" '\\bNavigationView\\b' "$IOS_DIR"
fail_pattern "Prefer @MainActor / MainActor.run over DispatchQueue.main.async" 'DispatchQueue\\.main\\.async' "$IOS_DIR"
fail_pattern "Do not use XCTestCase in RelayIOSKit package tests" '\\bXCTestCase\\b' "${PACKAGE_DIR}/Tests"

print_header "review warnings"
warn_pattern "Review any new Combine dependency and justify why async/await is insufficient" '^import Combine$' "$IOS_DIR"
warn_pattern "Review every @unchecked Sendable and document the safety boundary" '@unchecked Sendable' "$IOS_DIR"

print_header "swift package strict concurrency"
swift test \
  --package-path "$PACKAGE_DIR" \
  -Xswiftc -swift-version \
  -Xswiftc 6 \
  -Xswiftc -strict-concurrency=complete \
  -Xswiftc -warnings-as-errors

print_header "summary"
echo "errors: ${errors}"
echo "warnings: ${warnings}"

if [[ "$errors" -gt 0 ]]; then
  exit 1
fi
