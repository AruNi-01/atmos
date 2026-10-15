#!/usr/bin/env bash
# Screenshot F1–F13 in light and dark, then record F4, F12, and F13.
# Requires a booted iOS Simulator with land.atmos.mobile already installed.
# macOS runner only. Do not run this on Linux.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${PARITY_PHONE_OUT:-$ROOT/artifacts/phone}"
BUNDLE_ID="land.atmos.mobile"
SETTLE_SECONDS=8
RECORD_SECONDS=8
FIXTURES=(F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12 F13)
THEMES=(light dark)
RECORD_IDS=(F4 F12 F13)

mkdir -p "$OUT"

if ! xcrun simctl list devices booted | grep -q "(Booted)"; then
  echo "No booted simulator. Full simctl list:" >&2
  xcrun simctl list >&2
  exit 1
fi

if ! xcrun simctl get_app_container booted "$BUNDLE_ID" >/dev/null 2>&1; then
  echo "Bundle ${BUNDLE_ID} is not installed on the booted simulator." >&2
  xcrun simctl listapps booted >&2 || true
  exit 1
fi

open_fixture() {
  local id="$1"
  local theme="$2"
  xcrun simctl ui booted appearance "$theme"
  xcrun simctl openurl booted "atmos://preview-chat?fixture=${id}&theme=${theme}"
}

# simctl has no stable query for the parity-ready accessibility id.
# The workflow allows an 8 second settle before the screenshot.
wait_for_ready() {
  sleep "$SETTLE_SECONDS"
}

for theme in "${THEMES[@]}"; do
  for id in "${FIXTURES[@]}"; do
    echo "screenshot ${id} ${theme}"
    open_fixture "$id" "$theme"
    wait_for_ready
    xcrun simctl io booted screenshot "$OUT/${id}-${theme}.png"
  done
done

record_one() {
  local id="$1"
  local video="$OUT/${id}.mp4"
  local rec_pid
  local status
  rm -f "$video"
  echo "record ${id}"
  xcrun simctl ui booted appearance light
  xcrun simctl io booted recordVideo --codec=h264 --force "$video" &
  rec_pid=$!
  xcrun simctl openurl booted "atmos://preview-chat?fixture=${id}&theme=light"
  sleep "$RECORD_SECONDS"
  if kill -0 "$rec_pid" 2>/dev/null; then
    kill -INT "$rec_pid"
  fi
  status=0
  wait "$rec_pid" || status=$?
  if [[ "$status" -ne 0 && "$status" -ne 130 && "$status" -ne 143 ]]; then
    echo "recordVideo for ${id} exited ${status}" >&2
    exit "$status"
  fi
  if [[ ! -s "$video" ]]; then
    echo "recording ${video} is missing or empty" >&2
    exit 1
  fi
}

for id in "${RECORD_IDS[@]}"; do
  record_one "$id"
done

echo "phone artifacts written to ${OUT}"
