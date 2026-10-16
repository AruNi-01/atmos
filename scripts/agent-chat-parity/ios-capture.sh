#!/usr/bin/env bash
# Screenshot F1–F13 in light and dark.
# Each frame is its own launch. This script writes Documents/parity-frame.json
# first. The preview reads that file, logs `[parity] ready F# <theme> #0`,
# and does not arm the in-app carousel. A JS timer in one process stopped
# after about 12 minutes (runs 38823255381, 38831101582, 38837550765).
# This script does not call simctl openurl.
# Requires a booted iOS Simulator with land.atmos.mobile already installed.
# macOS runner only. Do not run this on Linux.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${PARITY_PHONE_OUT:-$ROOT/artifacts/phone}"
BUNDLE_ID="land.atmos.mobile"
RECORD_SECONDS=8
RECORD_IDS=(F4 F12 F13)
# Empty scene window through run 38769715486.
black_scene="fbcb6a8c2222c51b2c61b122762b964463322680781a5457888a05fee632c0b6"
# Pair screen on run 38789917018, before the preview redirect.
pair_screen="51cd7923f442b9cb4c4a5c22644a36b435f8ca844c53a4adaa0b658e97ff9342"

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

CURRENT_LOG="$OUT/console.log"
console_pid=""

stop_console() {
  if [[ -n "$console_pid" ]]; then
    kill "$console_pid" 2>/dev/null || true
    wait "$console_pid" 2>/dev/null || true
    console_pid=""
  fi
}

write_frame_file() {
  local id="$1"
  local theme="$2"
  local container docs
  container="$(xcrun simctl get_app_container booted "$BUNDLE_ID" data)"
  docs="${container}/Documents"
  mkdir -p "$docs"
  printf '{"id":"%s","theme":"%s"}\n' "$id" "$theme" >"${docs}/parity-frame.json"
  echo "wrote parity-frame.json ${id} ${theme}"
}

launch_frame() {
  local id="$1"
  local theme="$2"
  stop_console
  xcrun simctl terminate booted "$BUNDLE_ID" >/dev/null 2>&1 || true
  sleep 1
  CURRENT_LOG="$OUT/console-${id}-${theme}.log"
  : >"$CURRENT_LOG"
  xcrun simctl launch --console-pty --terminate-running-process booted "$BUNDLE_ID" >"$CURRENT_LOG" 2>&1 &
  console_pid=$!
  sleep 2
  if ! kill -0 "$console_pid" 2>/dev/null; then
    echo "console launch exited early for ${id} ${theme}; retrying without a pty" >&2
    xcrun simctl launch booted "$BUNDLE_ID" || true
    console_pid=""
  fi
}

dump_runtime_logs() {
  echo "----- console (tail) -----" >&2
  if [[ -f "$CURRENT_LOG" ]]; then
    tail -n 200 "$CURRENT_LOG" >&2 || true
  else
    echo "(no console log)" >&2
  fi
  echo "----- parity stream (tail) -----" >&2
  if [[ -f "$OUT/parity-stream.log" ]]; then
    tail -n 80 "$OUT/parity-stream.log" >&2 || true
  fi
  echo "----- device log -----" >&2
  xcrun simctl spawn booted log show --last 5m --info --debug --style compact \
    --predicate 'processImagePath CONTAINS "Atmos" OR subsystem CONTAINS "com.facebook.react" OR eventMessage CONTAINS "[parity]" OR eventMessage CONTAINS "RCTFatal" OR eventMessage CONTAINS "JavaScript"' \
    >"$OUT/device-log.txt" 2>&1 || true
  tail -n 400 "$OUT/device-log.txt" >&2 || true
  screencapture -x "$OUT/desktop-on-failure.png" || true
}

log_has() {
  local needle="$1"
  if [[ -f "$CURRENT_LOG" ]] && grep -F -q "$needle" "$CURRENT_LOG"; then
    return 0
  fi
  if [[ -f "$OUT/parity-stream.log" ]] && grep -F -q "$needle" "$OUT/parity-stream.log"; then
    return 0
  fi
  return 1
}

wait_for_line() {
  local needle="$1"
  local timeout="$2"
  local deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    if log_has "$needle"; then
      return 0
    fi
    sleep 0.2
  done
  return 1
}

# simctl screenshots stay black unless Simulator.app owns the framebuffer.
open -a Simulator || true
sleep 2

# Prove the framebuffer before the app covers Springboard. The known black
# scene hash is the empty app window, not a generic dark home screen.
echo "springboard screenshot (before launch)"
xcrun simctl io booted screenshot "$OUT/springboard.png"
spring_hash="$(shasum -a 256 "$OUT/springboard.png" | awk '{print $1}')"
echo "springboard sha256 ${spring_hash}"
if [[ "$spring_hash" == "$black_scene" ]]; then
  echo "simctl framebuffer is the black scene before launch (${spring_hash})" >&2
  screencapture -x "$OUT/desktop-on-failure.png" || true
  exit 1
fi

echo "streaming [parity] logs"
xcrun simctl spawn booted log stream --level debug --style compact \
  --predicate 'eventMessage CONTAINS "[parity]"' >"$OUT/parity-stream.log" 2>&1 &
stream_pid=$!

frame_rows="$(mktemp)"
if ! (cd "$ROOT" && bun -e '
import { parityCycleFrames, parityReadyLine } from "./apps/mobile/src/features/agent-chat/parity-cycle.ts";
for (const frame of parityCycleFrames()) {
  console.log(`${frame.id}\t${frame.theme}\t${parityReadyLine(frame, 0)}`);
}
') >"$frame_rows"; then
  echo "could not read the parity frames from parity-cycle.ts" >&2
  dump_runtime_logs
  exit 1
fi

rows=()
while IFS= read -r row; do
  if [[ -n "$row" ]]; then
    rows+=("$row")
  fi
done <"$frame_rows"
rm -f "$frame_rows"

for row in "${rows[@]}"; do
  IFS=$'\t' read -r id theme needle <<<"$row"
  xcrun simctl ui booted appearance "$theme"
  write_frame_file "$id" "$theme"
  echo "launch ${id} ${theme}"
  launch_frame "$id" "$theme"
  if ! wait_for_line "[parity] preview-chat module" 90; then
    echo "missing [parity] preview-chat module for ${id} ${theme}" >&2
    dump_runtime_logs
    exit 1
  fi
  echo "wait ${needle}"
  if ! wait_for_line "$needle" 120; then
    echo "missing ${needle}" >&2
    dump_runtime_logs
    exit 1
  fi
  # The ready line can land before UIKit composites the transcript.
  # Run 38843429024 saved a flat F1-light and a flat F11-dark that way.
  flat_attempt=1
  while true; do
    xcrun simctl io booted screenshot "$OUT/${id}-${theme}.png"
    flat_status=0
    python3 "$ROOT/scripts/agent-chat-parity/png-flat.py" "$OUT/${id}-${theme}.png" || flat_status=$?
    if [[ "$flat_status" == "1" ]]; then
      break
    fi
    if [[ "$flat_status" == "2" ]]; then
      echo "could not read ${id}-${theme}.png" >&2
      dump_runtime_logs
      exit 1
    fi
    if (( flat_attempt >= 3 )); then
      echo "screenshot ${id}-${theme} stayed a flat background" >&2
      dump_runtime_logs
      exit 1
    fi
    echo "screenshot ${id}-${theme} is flat; waiting for the transcript" >&2
    sleep 2
    flat_attempt=$((flat_attempt + 1))
  done
  if [[ -f "$CURRENT_LOG" ]]; then
    other="$(grep -F '[parity] ready ' "$CURRENT_LOG" | grep -F -v -e "$needle" || true)"
    if [[ -n "$other" ]]; then
      echo "launch ${id} ${theme} also logged another frame:" >&2
      printf '%s\n' "$other" >&2
      dump_runtime_logs
      exit 1
    fi
    cp "$CURRENT_LOG" "$OUT/console.log"
  fi
  if [[ "$id" == "F1" && "$theme" == "light" ]]; then
    cp "$OUT/${id}-${theme}.png" "$OUT/default-route.png"
    xcrun simctl spawn booted log show --last 3m --info --style compact \
      --predicate 'processImagePath CONTAINS "Atmos" OR subsystem CONTAINS "com.facebook.react" OR eventMessage CONTAINS "[parity]" OR eventMessage CONTAINS "RCTFatal" OR eventMessage CONTAINS "JavaScript"' \
      >"$OUT/device-log-after-warmup.txt" 2>&1 || true
    grep -E '\[parity\]|RCTFatal|JavaScript|topLoad|instanceHandle|Error' "$OUT/device-log-after-warmup.txt" | tail -n 40 >&2 || true
  fi
done

default_hash="$(shasum -a 256 "$OUT/default-route.png" | awk '{print $1}')"
echo "default-route sha256 ${default_hash}"
if [[ "$default_hash" == "$black_scene" || "$default_hash" == "$pair_screen" ]]; then
  echo "default route is not the preview carousel (${default_hash})" >&2
  dump_runtime_logs
  exit 1
fi

hash_f1="$(shasum -a 256 "$OUT/F1-light.png" | awk '{print $1}')"
hash_f12="$(shasum -a 256 "$OUT/F12-light.png" | awk '{print $1}')"
if [[ "$hash_f1" == "$hash_f12" ]]; then
  echo "F1-light and F12-light are identical (${hash_f1})." >&2
  echo "The preview carousel did not render distinct fixtures." >&2
  dump_runtime_logs
  exit 1
fi

python3 - "$OUT" "$black_scene" "$pair_screen" <<'PY'
import hashlib, pathlib, sys
out = pathlib.Path(sys.argv[1])
banned = {sys.argv[2], sys.argv[3]}
files = sorted(out.glob("F*-*.png"))
if len(files) != 26:
    print(f"expected 26 fixture screenshots, found {len(files)}", file=sys.stderr)
    sys.exit(1)
hashes = {}
for path in files:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest in banned:
        print(f"{path.name} is the black scene or the pair screen", file=sys.stderr)
        sys.exit(1)
    hashes.setdefault(digest, []).append(path.name)
dupes = [names for names in hashes.values() if len(names) > 1]
if dupes:
    print("fixture screenshots are not all distinct:", file=sys.stderr)
    for names in dupes:
        print("  " + ", ".join(names), file=sys.stderr)
    sys.exit(1)
print(f"{len(files)} distinct fixture screenshots")
PY

# Still frames. The movie lasts RECORD_SECONDS so the duration gate stays
# honest. It does not show reveal, tree draw-in, or a pill swap.
record_still() {
  local id="$1"
  local png="$OUT/${id}-light.png"
  local video="$OUT/${id}.mov"
  local frames
  local duration
  if [[ ! -s "$png" ]]; then
    echo "recording ${id} is missing ${png}" >&2
    exit 1
  fi
  frames="$(mktemp -d)"
  sips -s format jpeg "$png" --out "$frames/000.jpg" >/dev/null
  duration="$(python3 "$ROOT/scripts/agent-chat-parity/mp4-duration.py" --write-mjpeg "$video" "$frames" "$RECORD_SECONDS")"
  rm -rf "$frames"
  echo "recording ${id} duration ${duration}"
  if [[ ! -s "$video" ]]; then
    echo "recording ${video} is missing or empty" >&2
    exit 1
  fi
  if ! python3 - "$duration" <<'PY'
import sys
try:
    seconds = float(sys.argv[1])
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
  record_still "$id"
done

# The log stream and console pty outlive this script. Leave them. The job
# tears the step down, and killing by name would hit unrelated processes.
echo "phone artifacts written to ${OUT}"
