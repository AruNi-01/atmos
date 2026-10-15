#!/usr/bin/env bash
# Screenshot F1–F13 in light and dark from the in-app carousel.
# The preview route logs `[parity] ready F# <theme> #<seq>` and holds each
# frame for PARITY_HOLD_MS (90s). A screenshot that returns after the next
# ready line fails the run. This script does not call simctl openurl.
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

dump_runtime_logs() {
  echo "----- console.log (tail) -----" >&2
  if [[ -f "$OUT/console.log" ]]; then
    tail -n 200 "$OUT/console.log" >&2 || true
  else
    echo "(no console.log)" >&2
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
  if [[ -f "$OUT/console.log" ]] && grep -F -q "$needle" "$OUT/console.log"; then
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

xcrun simctl ui booted appearance light

echo "streaming [parity] logs"
xcrun simctl spawn booted log stream --level debug --style compact \
  --predicate 'eventMessage CONTAINS "[parity]"' >"$OUT/parity-stream.log" 2>&1 &
stream_pid=$!

echo "launching ${BUNDLE_ID}"
xcrun simctl terminate booted "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl launch --console-pty --terminate-running-process booted "$BUNDLE_ID" >"$OUT/console.log" 2>&1 &
console_pid=$!
sleep 3
if ! kill -0 "$console_pid" 2>/dev/null; then
  echo "console launch exited early; retrying without a pty" >&2
  xcrun simctl launch booted "$BUNDLE_ID" || true
fi

if ! wait_for_line "[parity] preview-chat module" 90; then
  echo "missing [parity] preview-chat module" >&2
  dump_runtime_logs
  exit 1
fi
if ! wait_for_line "[parity] preview-chat route" 30; then
  echo "missing [parity] preview-chat route" >&2
  dump_runtime_logs
  exit 1
fi

frame_rows="$(mktemp)"
if ! (cd "$ROOT" && bun -e '
import { parityCycleFrames, parityReadyLine } from "./apps/mobile/src/features/agent-chat/parity-cycle.ts";
for (const [seq, frame] of parityCycleFrames().entries()) {
  console.log(`${frame.id}\t${frame.theme}\t${parityReadyLine(frame, seq)}`);
}
') >"$frame_rows"; then
  echo "could not read the parity carousel from parity-cycle.ts" >&2
  dump_runtime_logs
  exit 1
fi

current_theme=""
rows=()
while IFS= read -r row; do
  if [[ -n "$row" ]]; then
    rows+=("$row")
  fi
done <"$frame_rows"
rm -f "$frame_rows"

for i in "${!rows[@]}"; do
  IFS=$'\t' read -r id theme needle <<<"${rows[$i]}"
  if [[ "$theme" != "$current_theme" ]]; then
    xcrun simctl ui booted appearance "$theme"
    current_theme="$theme"
  fi
  echo "wait ${needle}"
  # The first frame includes JS boot. Later frames stay up for the 90s hold,
  # so a fast screenshot still has to wait out the rest of that hold.
  timeout=120
  if ! wait_for_line "$needle" "$timeout"; then
    echo "missing ${needle}" >&2
    dump_runtime_logs
    exit 1
  fi
  xcrun simctl io booted screenshot "$OUT/${id}-${theme}.png"
  next_index=$((i + 1))
  if (( next_index < ${#rows[@]} )); then
    IFS=$'\t' read -r _next_id _next_theme next_needle <<<"${rows[$next_index]}"
    if log_has "$next_needle"; then
      echo "screenshot of ${id}-${theme} finished after ${next_needle} was already logged" >&2
      echo "simctl io screenshot outlived the frame hold." >&2
      dump_runtime_logs
      exit 1
    fi
  fi
  if [[ "$needle" == *"#0" ]]; then
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
