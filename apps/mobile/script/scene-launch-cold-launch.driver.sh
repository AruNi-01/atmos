#!/usr/bin/env bash
# Linux stand-in for assert_cold_launch. sleep is local so the wait is instant.
# kill -0 and the before/after .ips snapshots are the real script path.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=verify-ios-scene-lifecycle.sh
source "$ROOT/verify-ios-scene-lifecycle.sh"
COLD_LAUNCH_WAIT_SECONDS=4

WORKDIR="$(mktemp -d)"
PIDS=()
LOCKED=""

cleanup() {
  local pid
  if [[ ${#PIDS[@]} -gt 0 ]]; then
    for pid in "${PIDS[@]}"; do
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    done
  fi
  if [[ -n "$LOCKED" && -d "$LOCKED" ]]; then
    chmod u+rwx "$LOCKED" || true
  fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

spawn_sleeper() {
  # Not inside $(...): a command substitution waits for this background sleep.
  /bin/sleep 60 >/dev/null 2>&1 &
  SLEEPER_PID=$!
  PIDS+=("$SLEEPER_PID")
}

sleep() {
  if [[ "${KILL_DURING_WAIT:-0}" == "1" && -n "${SLEEPER_PID:-}" ]]; then
    kill "$SLEEPER_PID" 2>/dev/null || true
  fi
  if [[ "${IPS_DURING_WAIT:-0}" == "1" && -n "${ATMOS_DIAGNOSTIC_REPORTS:-}" && -d "$ATMOS_DIAGNOSTIC_REPORTS" ]]; then
    printf 'crash\n' >"$ATMOS_DIAGNOSTIC_REPORTS/Atmos-2026-10-20-120000.ips"
  fi
}

xcrun() {
  if [[ "$1" == "simctl" && "$2" == "terminate" ]]; then
    return 0
  fi
  if [[ "$1" == "simctl" && "$2" == "launch" ]]; then
    printf '%s\n' "$LAUNCH_OUT"
    return "${LAUNCH_STATUS:-0}"
  fi
  if [[ "$1" == "simctl" && "$2" == "spawn" ]]; then
    if [[ "${LOG_FAIL:-0}" == "1" ]]; then
      printf '%s' "${LOG_BODY:-}"
      return 1
    fi
    printf '%s\n' "${LOG_BODY:-Atmos started}"
    return 0
  fi
  echo "unexpected xcrun: $*" >&2
  return 97
}

reset_case() {
  KILL_DURING_WAIT=0
  IPS_DURING_WAIT=0
  LOG_FAIL=0
  LOG_BODY=""
  LAUNCH_STATUS=0
  LAUNCH_OUT=""
  SLEEPER_PID=""
  unset ATMOS_DIAGNOSTIC_REPORTS || true
  HOME="$WORKDIR/home-$1"
  mkdir -p "$HOME"
  export HOME
}

run_case() {
  local name="$1"
  local out="$WORKDIR/$name.out"
  local err="$WORKDIR/$name.err"
  # `||` keeps a failing cold launch from exiting under `set -e`.
  local status=0
  assert_cold_launch "udid-test" "ios27" >"$out" 2>"$err" || status=$?
  printf '%s\n' "$status"
  cat "$out"
  printf '\n---stderr---\n'
  cat "$err"
}

expect_fail() {
  local name="$1"
  local needle="$2"
  local captured status out err
  captured="$(run_case "$name")"
  status="${captured%%$'\n'*}"
  out="$WORKDIR/$name.out"
  err="$WORKDIR/$name.err"
  if [[ "$status" -eq 0 ]]; then
    echo "FAIL $name: expected non-zero" >&2
    printf '%s\n' "$captured" >&2
    exit 1
  fi
  if ! grep -q -F "$needle" "$err" && ! grep -q -F "$needle" "$out"; then
    echo "FAIL $name: missing [$needle]" >&2
    printf '%s\n' "$captured" >&2
    exit 1
  fi
  if grep -q -F "PASS ios27: cold launch" "$out"; then
    echo "FAIL $name: printed PASS" >&2
    printf '%s\n' "$captured" >&2
    exit 1
  fi
  echo "ok $name"
}

expect_pass() {
  local name="$1"
  local captured status out err
  captured="$(run_case "$name")"
  status="${captured%%$'\n'*}"
  out="$WORKDIR/$name.out"
  err="$WORKDIR/$name.err"
  if [[ "$status" -ne 0 ]]; then
    echo "FAIL $name: expected 0, got $status" >&2
    printf '%s\n' "$captured" >&2
    exit 1
  fi
  if ! grep -q -F "PASS ios27: cold launch" "$out"; then
    echo "FAIL $name: missing PASS" >&2
    printf '%s\n' "$captured" >&2
    exit 1
  fi
  if grep -q -F "FAIL ios27:" "$err"; then
    echo "FAIL $name: printed FAIL" >&2
    printf '%s\n' "$captured" >&2
    exit 1
  fi
  echo "ok $name"
}

reset_case alive-pass
spawn_sleeper
LAUNCH_OUT="land.atmos.mobile: $SLEEPER_PID"
ATMOS_DIAGNOSTIC_REPORTS="$WORKDIR/reports-alive"
mkdir -p "$ATMOS_DIAGNOSTIC_REPORTS"
export ATMOS_DIAGNOSTIC_REPORTS
expect_pass alive-pass

reset_case dies-during-wait
spawn_sleeper
LAUNCH_OUT="land.atmos.mobile: $SLEEPER_PID"
KILL_DURING_WAIT=1
ATMOS_DIAGNOSTIC_REPORTS="$WORKDIR/reports-die"
mkdir -p "$ATMOS_DIAGNOSTIC_REPORTS"
export ATMOS_DIAGNOSTIC_REPORTS
expect_fail dies-during-wait "process was not alive 4s after launch"

reset_case new-ips
spawn_sleeper
LAUNCH_OUT="land.atmos.mobile: $SLEEPER_PID"
IPS_DURING_WAIT=1
ATMOS_DIAGNOSTIC_REPORTS="$WORKDIR/reports-ips"
mkdir -p "$ATMOS_DIAGNOSTIC_REPORTS"
export ATMOS_DIAGNOSTIC_REPORTS
expect_fail new-ips "new Atmos crash report"

reset_case no-pid
LAUNCH_OUT="simctl launched without a pid line"
LAUNCH_STATUS=0
ATMOS_DIAGNOSTIC_REPORTS="$WORKDIR/reports-nopid"
mkdir -p "$ATMOS_DIAGNOSTIC_REPORTS"
export ATMOS_DIAGNOSTIC_REPORTS
expect_fail no-pid "process was not alive 4s after launch"

reset_case launch-failed
spawn_sleeper
LAUNCH_OUT="land.atmos.mobile: $SLEEPER_PID"
LAUNCH_STATUS=1
ATMOS_DIAGNOSTIC_REPORTS="$WORKDIR/reports-launch"
mkdir -p "$ATMOS_DIAGNOSTIC_REPORTS"
export ATMOS_DIAGNOSTIC_REPORTS
expect_fail launch-failed "cold launch did not stay up"

reset_case unreadable-reports
LOCKED="$WORKDIR/locked-reports"
mkdir -p "$LOCKED"
chmod 000 "$LOCKED"
ATMOS_DIAGNOSTIC_REPORTS="$LOCKED"
export ATMOS_DIAGNOSTIC_REPORTS
spawn_sleeper
LAUNCH_OUT="land.atmos.mobile: $SLEEPER_PID"
expect_fail unreadable-reports "could not list crash reports"

reset_case missing-reports-warn
ATMOS_DIAGNOSTIC_REPORTS="$WORKDIR/missing-reports"
export ATMOS_DIAGNOSTIC_REPORTS
spawn_sleeper
LAUNCH_OUT="land.atmos.mobile: $SLEEPER_PID"
expect_pass missing-reports-warn
if ! grep -q -F "WARN ios27: ATMOS_DIAGNOSTIC_REPORTS is not a directory: $WORKDIR/missing-reports" "$WORKDIR/missing-reports-warn.err"; then
  echo "FAIL missing-reports-warn: missing WARN" >&2
  cat "$WORKDIR/missing-reports-warn.err" >&2
  exit 1
fi

reset_case file-reports-warn
ATMOS_DIAGNOSTIC_REPORTS="$WORKDIR/reports-file"
printf 'not a directory\n' >"$ATMOS_DIAGNOSTIC_REPORTS"
export ATMOS_DIAGNOSTIC_REPORTS
spawn_sleeper
LAUNCH_OUT="land.atmos.mobile: $SLEEPER_PID"
expect_fail file-reports-warn "could not list crash reports"
if ! grep -q -F "WARN ios27: ATMOS_DIAGNOSTIC_REPORTS is not a directory: $WORKDIR/reports-file" "$WORKDIR/file-reports-warn.err"; then
  echo "FAIL file-reports-warn: missing WARN" >&2
  cat "$WORKDIR/file-reports-warn.err" >&2
  exit 1
fi

reset_case default-roots-quiet
unset ATMOS_DIAGNOSTIC_REPORTS || true
spawn_sleeper
LAUNCH_OUT="land.atmos.mobile: $SLEEPER_PID"
expect_pass default-roots-quiet
if grep -q "WARN" "$WORKDIR/default-roots-quiet.err"; then
  echo "FAIL default-roots-quiet: warned about the default roots" >&2
  cat "$WORKDIR/default-roots-quiet.err" >&2
  exit 1
fi

reset_case empty-log
ATMOS_DIAGNOSTIC_REPORTS="$WORKDIR/reports-empty-log"
mkdir -p "$ATMOS_DIAGNOSTIC_REPORTS"
export ATMOS_DIAGNOSTIC_REPORTS
spawn_sleeper
LAUNCH_OUT="land.atmos.mobile: $SLEEPER_PID"
LOG_FAIL=1
LOG_BODY=""
expect_fail empty-log "could not read the unified log"
if ! grep -q -F "WARN: log show exited 1" "$WORKDIR/empty-log.err"; then
  echo "FAIL empty-log: missing log show WARN" >&2
  cat "$WORKDIR/empty-log.err" >&2
  exit 1
fi

reset_case partial-log
ATMOS_DIAGNOSTIC_REPORTS="$WORKDIR/reports-partial-log"
mkdir -p "$ATMOS_DIAGNOSTIC_REPORTS"
export ATMOS_DIAGNOSTIC_REPORTS
spawn_sleeper
LAUNCH_OUT="land.atmos.mobile: $SLEEPER_PID"
LOG_FAIL=1
LOG_BODY="UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption"
expect_fail partial-log "UIKit reported no scene lifecycle"
if ! grep -q -F "WARN: log show exited 1" "$WORKDIR/partial-log.err"; then
  echo "FAIL partial-log: missing log show WARN" >&2
  cat "$WORKDIR/partial-log.err" >&2
  exit 1
fi
