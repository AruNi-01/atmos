#!/usr/bin/env bash
# Screenshot F1–F13 in light and dark, then record F4, F12, and F13.
# Requires a booted iOS Simulator with land.atmos.mobile already installed.
# macOS runner only. Do not run this on Linux.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${PARITY_PHONE_OUT:-$ROOT/artifacts/phone}"
BUNDLE_ID="land.atmos.mobile"
URL_SCHEME="atmos"
# Cold start of the embedded bundle, then a settle after each deep link.
WARMUP_SECONDS=25
SETTLE_SECONDS=12
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

# A fresh simulator asks "Open in Atmos?" and never delivers the URL.
# Map the scheme to this bundle before the first openurl (same write EAS uses).
echo "preapprove ${URL_SCHEME} -> ${BUNDLE_ID}"
xcrun simctl spawn booted defaults write \
  com.apple.launchservices.schemeapproval \
  "com.apple.CoreSimulator.CoreSimulatorBridge-->${URL_SCHEME}" \
  -string "$BUNDLE_ID"
xcrun simctl spawn booted defaults read com.apple.launchservices.schemeapproval
xcrun simctl spawn booted killall -9 cfprefsd || true

echo "warming ${BUNDLE_ID}"
xcrun simctl launch booted "$BUNDLE_ID" || true
sleep "$WARMUP_SECONDS"

open_fixture() {
  local id="$1"
  local theme="$2"
  xcrun simctl ui booted appearance "$theme"
  xcrun simctl openurl booted "${URL_SCHEME}://preview-chat?fixture=${id}&theme=${theme}"
}

# simctl has no stable query for the parity-ready accessibility id.
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

# The system confirmation dialog is the same bitmap for every fixture.
hash_f1="$(shasum -a 256 "$OUT/F1-light.png" | awk '{print $1}')"
hash_f12="$(shasum -a 256 "$OUT/F12-light.png" | awk '{print $1}')"
if [[ "$hash_f1" == "$hash_f12" ]]; then
  echo "F1-light and F12-light are identical (${hash_f1})." >&2
  echo "The preview route did not render distinct fixtures." >&2
  exit 1
fi

record_one() {
  local id="$1"
  local video="$OUT/${id}.mp4"
  local rec_pid
  local status
  local duration
  rm -f "$video"
  echo "record ${id}"
  xcrun simctl ui booted appearance light
  xcrun simctl io booted recordVideo --codec=h264 --force "$video" &
  rec_pid=$!
  xcrun simctl openurl booted "${URL_SCHEME}://preview-chat?fixture=${id}&theme=light"
  sleep "$RECORD_SECONDS"
  if kill -0 "$rec_pid" 2>/dev/null; then
    kill -INT "$rec_pid"
  fi
  sleep 1
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
  duration="$(afinfo "$video" | awk -F': ' '/estimated duration/ {print $2; exit}')"
  echo "recording ${id} duration ${duration}"
  if ! python3 - "$duration" <<'PY'
import sys
raw = sys.argv[1].split()[0] if len(sys.argv) > 1 else ""
try:
    seconds = float(raw)
except ValueError:
    seconds = 0.0
if seconds < 3:
    sys.exit(1)
PY
  then
    echo "recording ${video} is shorter than 3s (${duration})." >&2
    exit 1
  fi
}

for id in "${RECORD_IDS[@]}"; do
  record_one "$id"
done

echo "phone artifacts written to ${OUT}"
