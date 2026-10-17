#!/usr/bin/env bash
# Screenshot F1–F13 in light and dark, then capture motion passes:
# f13-tail scrolled to Reply 50 (three frames muxed when they differ),
# a second f13-tail launch that calls the scroll-pill handler after that hold,
# stream-tools sampled while rows append, and an F4 script replay that
# writes its own PNGs during the tree draw. The replay and the pill return
# do not fail the job.
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
  local scroll="${3:-}"
  local motion="${4:-}"
  local replay="${5:-}"
  local lane="${6:-}"
  local pill="${7:-}"
  local composer="${8:-}"
  local container docs extra=""
  container="$(xcrun simctl get_app_container booted "$BUNDLE_ID" data)"
  docs="${container}/Documents"
  mkdir -p "$docs"
  if [[ "$scroll" == "away" ]]; then extra+=',"scroll":"away"'; fi
  if [[ "$motion" == "reduced" ]]; then extra+=',"motion":"reduced"'; fi
  if [[ "$replay" == "script" ]]; then extra+=',"replay":"script"'; fi
  if [[ "$lane" == "steps" ]]; then extra+=',"lane":"steps"'; fi
  if [[ "$pill" == "return" ]]; then extra+=',"pill":"return"'; fi
  if [[ "$composer" == "states" ]]; then extra+=',"composer":"states"'; fi
  printf '{"id":"%s","theme":"%s"%s}\n' "$id" "$theme" "$extra" >"${docs}/parity-frame.json"
  echo "wrote parity-frame.json ${id} ${theme}${scroll:+ ${scroll}}${motion:+ ${motion}}${replay:+ ${replay}}${lane:+ ${lane}}${pill:+ ${pill}}${composer:+ ${composer}}"
}

clear_motion_shots() {
  local container
  container="$(xcrun simctl get_app_container booted "$BUNDLE_ID" data)"
  rm -rf "${container}/Documents/parity-motion"
}

copy_motion_shots() {
  local dest="$1"
  local container src count
  container="$(xcrun simctl get_app_container booted "$BUNDLE_ID" data)"
  src="${container}/Documents/parity-motion"
  mkdir -p "$dest"
  if [[ -d "$src" ]]; then
    cp -R "$src"/. "$dest"/ || true
  fi
  count="$(find "$dest" -name '*.png' | wc -l | tr -d ' ')"
  echo "copied ${count} parity motion pngs to ${dest}"
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
  run_bounded 60 xcrun simctl spawn booted log show --last 5m --info --debug --style compact \
    --predicate 'processImagePath CONTAINS "Atmos" OR subsystem CONTAINS "com.facebook.react" OR eventMessage CONTAINS "[parity]" OR eventMessage CONTAINS "RCTFatal" OR eventMessage CONTAINS "JavaScript"' \
    >"$OUT/device-log.txt" 2>&1 || true
  tail -n 400 "$OUT/device-log.txt" >&2 || true
  screencapture -x "$OUT/desktop-on-failure.png" || true
}

log_has() {
  local needle="$1"
  local file
  for file in "$CURRENT_LOG" "$OUT/parity-stream.log" "$OUT/device-log-fallback.txt"; do
    if [[ -f "$file" ]] && grep -F -q -- "$needle" "$file"; then
      return 0
    fi
  done
  return 1
}

refresh_parity_show() {
  # Run 38985042070: the module line was in the first show. The ready line was
  # in that same output, 169ms later. The next show used --last 3m and started
  # after that line had aged out, so F1 failed with no tail frames.
  run_bounded 45 xcrun simctl spawn booted log show --last 10m --info --debug --style compact \
    --predicate 'eventMessage CONTAINS "[parity]"' \
    >"$OUT/device-log-fallback.txt" 2>&1 || true
}

wait_for_line() {
  local needle="$1"
  local timeout="$2"
  local deadline=$((SECONDS + timeout))
  local next_show=$((SECONDS + 4))
  while (( SECONDS < deadline )); do
    if log_has "$needle"; then
      return 0
    fi
    if (( SECONDS >= next_show )); then
      refresh_parity_show
      if log_has "$needle"; then
        echo "found ${needle} via log show"
        return 0
      fi
      if [[ -f "$OUT/parity-stream.log" ]] && grep -F -q '[parity]' "$OUT/parity-stream.log"; then
        next_show=$((SECONDS + 15))
      else
        next_show=$((SECONDS + 5))
      fi
    fi
    sleep 0.5
  done
  return 1
}

tail_log_path() {
  local combined="$OUT/f13-tail.log"
  : >"$combined"
  if [[ -f "$CURRENT_LOG" ]]; then
    cat "$CURRENT_LOG" >>"$combined"
  fi
  if [[ -f "$OUT/parity-stream.log" ]]; then
    cat "$OUT/parity-stream.log" >>"$combined"
  fi
  if [[ -f "$OUT/device-log-fallback.txt" ]]; then
    cat "$OUT/device-log-fallback.txt" >>"$combined"
  fi
  printf '%s\n' "$combined"
}

tail_reading_held() {
  local log
  log="$(tail_log_path)"
  (cd "$ROOT" && PARITY_TAIL_LOG="$log" bun -e '
    import { parityTailReadingHeld, parityTailSamples } from "./apps/mobile/src/features/agent-chat/parity-motion-fixtures.ts";
    const log = await Bun.file(process.env.PARITY_TAIL_LOG).text();
    const samples = parityTailSamples(log);
    const held = parityTailReadingHeld(samples);
    if (!held) console.error(JSON.stringify(samples));
    process.exit(held ? 0 : 1);
  ')
}

# Three shots while the tail is still appending. simctl screenshots are too
# slow to sample a 400ms draw, and this list is held, so the gap between
# shots is the motion: Reply 50 stays put and the below count changes.
record_tail_hold() {
  local frames shot duration video
  frames="$(mktemp -d)"
  for shot in 1 2 3; do
    if [[ "$shot" != "1" ]]; then
      sleep 2
    fi
    take_screenshot "$OUT/f13-tail-away-${shot}.png"
    sips -s format jpeg "$OUT/f13-tail-away-${shot}.png" --out "$frames/00${shot}.jpg" >/dev/null
  done
  cp "$OUT/f13-tail-away-1.png" "$OUT/f13-tail-away-light.png"
  if ! python3 - "$OUT/f13-tail-away-1.png" "$OUT/f13-tail-away-2.png" "$OUT/f13-tail-away-3.png" <<'PY'
import hashlib, pathlib, sys
digests = {hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest() for path in sys.argv[1:]}
print(f"f13-tail distinct frames {len(digests)}")
if len(digests) < 2:
    print("f13-tail screenshots are identical, so the movie would not show the count growing", file=sys.stderr)
    sys.exit(1)
PY
  then
    rm -rf "$frames"
    dump_runtime_logs
    exit 1
  fi
  video="$OUT/f13-tail-away.mov"
  duration="$(python3 "$ROOT/scripts/agent-chat-parity/mp4-duration.py" --write-mjpeg "$video" "$frames" "$RECORD_SECONDS")"
  rm -rf "$frames"
  echo "recording f13-tail-away duration ${duration}"
  if [[ ! -s "$video" ]]; then
    echo "recording ${video} is missing or empty" >&2
    exit 1
  fi
}

capture_tail_away() {
  local id="f13-tail"
  local theme="light"
  write_frame_file "$id" "$theme" "away"
  echo "launch ${id} ${theme} away"
  launch_frame "$id" "$theme"
  if ! wait_for_line "[parity] preview-chat module" 90; then
    echo "missing [parity] preview-chat module for ${id}" >&2
    dump_runtime_logs
    exit 1
  fi
  if ! wait_for_line "[parity] ready f13-tail light #0" 120; then
    echo "missing [parity] ready f13-tail light #0" >&2
    dump_runtime_logs
    exit 1
  fi
  local deadline=$((SECONDS + 30))
  while (( SECONDS < deadline )); do
    if tail_reading_held; then
      echo "f13-tail reading line held while the below count grew"
      record_tail_hold
      return 0
    fi
    sleep 0.5
  done
  # log stream has dropped the launch burst before. The lines are still in log show.
  run_bounded 60 xcrun simctl spawn booted log show --last 3m --info --debug --style compact \
    --predicate 'eventMessage CONTAINS "[parity]"' \
    >"$OUT/device-log-fallback.txt" 2>&1 || true
  if tail_reading_held; then
    echo "f13-tail reading line held while the below count grew (via log show)"
    record_tail_hold
    return 0
  fi
  echo "f13-tail below count did not grow while the scroll offset held" >&2
  take_screenshot "$OUT/f13-tail-away-light.png" || true
  tail_log_path >/dev/null
  dump_runtime_logs
  exit 1
}

capture_stream_motion() {
  local id="stream-tools"
  local theme="light"
  write_frame_file "$id" "$theme"
  echo "launch ${id} ${theme}"
  launch_frame "$id" "$theme"
  if ! wait_for_line "[parity] preview-chat module" 90; then
    echo "missing [parity] preview-chat module for ${id}" >&2
    dump_runtime_logs
    exit 1
  fi
  if ! wait_for_line "[parity] ready stream-tools light #0" 120; then
    echo "missing [parity] ready stream-tools light #0" >&2
    dump_runtime_logs
    exit 1
  fi
  local frames shot
  frames="$(mktemp -d)"
  for shot in 1 2 3 4; do
    sleep 0.7
    take_screenshot "$OUT/stream-tools-${shot}.png"
    sips -s format jpeg "$OUT/stream-tools-${shot}.png" --out "$frames/00${shot}.jpg" >/dev/null
  done
  if ! python3 - "$OUT/stream-tools-1.png" "$OUT/stream-tools-2.png" "$OUT/stream-tools-3.png" "$OUT/stream-tools-4.png" <<'PY'
import hashlib, pathlib, sys
digests = {hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest() for path in sys.argv[1:]}
print(f"stream-tools distinct frames {len(digests)}")
if len(digests) < 2:
    print("stream-tools screenshots are identical, so the movie would not show motion", file=sys.stderr)
    sys.exit(1)
PY
  then
    dump_runtime_logs
    exit 1
  fi
  local video="$OUT/stream-tools.mov"
  local duration
  duration="$(python3 "$ROOT/scripts/agent-chat-parity/mp4-duration.py" --write-mjpeg "$video" "$frames" "$RECORD_SECONDS")"
  rm -rf "$frames"
  echo "recording stream-tools duration ${duration}"
  if [[ ! -s "$video" ]]; then
    echo "recording ${video} is missing or empty" >&2
    exit 1
  fi
}

# In-app PNGs of the F4 script. simctl screenshots are too slow for the 400ms
# draw. A miss is logged and the matrix artifacts still upload.
capture_f4_replay() {
  local label motion_arg dest frames video duration index shot
  for label in live reduced; do
    if [[ "$label" == "reduced" ]]; then motion_arg="reduced"; else motion_arg=""; fi
    dest="$OUT/f4-replay-${label}"
    clear_motion_shots || true
    write_frame_file "F4" "light" "" "$motion_arg" "script"
    echo "launch F4 light replay ${label}"
    launch_frame "F4" "light"
    if ! wait_for_line "[parity] preview-chat module" 90; then
      echo "f4 replay ${label} missed the module" >&2
      continue
    fi
    # The live pass logs `replay done live`. Waiting for the bare line let the
    # reduced pass match that older line and copy the live PNGs.
    if ! wait_for_line "[parity] replay done ${label}" 90; then
      echo "f4 replay ${label} did not finish" >&2
      dump_runtime_logs || true
      copy_motion_shots "$dest" || true
      continue
    fi
    sleep 2
    copy_motion_shots "$dest" || true
    frames="$(mktemp -d)"
    index=0
    while IFS= read -r shot; do
      [[ -n "$shot" ]] || continue
      index=$((index + 1))
      sips -s format jpeg "$shot" --out "$frames/$(printf '%03d' "$index").jpg" >/dev/null || true
    done < <(find "$dest" -name 'f4-*.png' | sort)
    if (( index < 2 )); then
      echo "f4 replay ${label} has ${index} frames; not muxing" >&2
      rm -rf "$frames"
      continue
    fi
    video="$OUT/f4-replay-${label}.mov"
    if duration="$(python3 "$ROOT/scripts/agent-chat-parity/mp4-duration.py" --write-mjpeg "$video" "$frames" "$RECORD_SECONDS")"; then
      echo "recording f4 replay ${label} duration ${duration} frames ${index}"
    else
      echo "f4 replay ${label} mux failed" >&2
    fi
    rm -rf "$frames"
  done
}

# Pill handler steps for F12. This is not a Simulator tap, and it does not
# answer the permission. A miss does not fail the job.
capture_f12_lane() {
  local dest frames video duration index shot
  dest="$OUT/f12-lane"
  clear_motion_shots || true
  write_frame_file "F12" "light" "" "" "" "steps"
  echo "launch F12 light lane steps"
  launch_frame "F12" "light"
  if ! wait_for_line "[parity] preview-chat module" 90; then
    echo "f12 lane missed the module" >&2
    return 0
  fi
  if ! wait_for_line "[parity] lane done" 60; then
    echo "f12 lane did not finish" >&2
    dump_runtime_logs || true
    copy_motion_shots "$dest" || true
    return 0
  fi
  sleep 1
  copy_motion_shots "$dest" || true
  frames="$(mktemp -d)"
  index=0
  while IFS= read -r shot; do
    [[ -n "$shot" ]] || continue
    index=$((index + 1))
    sips -s format jpeg "$shot" --out "$frames/$(printf '%03d' "$index").jpg" >/dev/null || true
  done < <(find "$dest" -name 'lane-*.png' | sort)
  if (( index < 2 )); then
    echo "f12 lane has ${index} frames; not muxing" >&2
    rm -rf "$frames"
    return 0
  fi
  video="$OUT/f12-lane.mov"
  if duration="$(python3 "$ROOT/scripts/agent-chat-parity/mp4-duration.py" --write-mjpeg "$video" "$frames" "$RECORD_SECONDS")"; then
    echo "recording f12 lane duration ${duration} frames ${index}"
  else
    echo "f12 lane mux failed" >&2
  fi
  rm -rf "$frames"
}

# Composer states for S23. Keyboard is a TextInput focus call, not a Simulator
# tap, and a miss does not fail the job. The manual preview link does not set
# this pin.
capture_composer_states() {
  local dest frames video duration index shot
  dest="$OUT/composer-states"
  clear_motion_shots || true
  write_frame_file "F1" "light" "" "" "" "" "" "states"
  echo "launch F1 light composer states"
  launch_frame "F1" "light"
  if ! wait_for_line "[parity] preview-chat module" 90; then
    echo "composer states missed the module" >&2
    return 0
  fi
  if ! wait_for_line "[parity] composer done" 60; then
    echo "composer states did not finish" >&2
    dump_runtime_logs || true
    copy_motion_shots "$dest" || true
    return 0
  fi
  sleep 2
  copy_motion_shots "$dest" || true
  frames="$(mktemp -d)"
  index=0
  while IFS= read -r shot; do
    [[ -n "$shot" ]] || continue
    index=$((index + 1))
    sips -s format jpeg "$shot" --out "$frames/$(printf '%03d' "$index").jpg" >/dev/null || true
  done < <(find "$dest" -name 'composer-*.png' | sort)
  if (( index < 2 )); then
    echo "composer states has ${index} frames; not muxing" >&2
    rm -rf "$frames"
    return 0
  fi
  video="$OUT/composer-states.mov"
  if duration="$(python3 "$ROOT/scripts/agent-chat-parity/mp4-duration.py" --write-mjpeg "$video" "$frames" "$RECORD_SECONDS")"; then
    echo "recording composer states duration ${duration} frames ${index}"
  else
    echo "composer states mux failed" >&2
  fi
  rm -rf "$frames"
}

# A stuck simctl screenshot consumed the 120 minute job (run 38857737524).
# Run 38871450335 then showed the app was ready and the shot still had not
# returned at 90s, while the previous green capture's slow frames took a few
# minutes. Kill the process group after 240s and let the caller retry.
run_bounded() {
  local seconds="$1"
  shift
  python3 - "$seconds" "$@" <<'PY'
import os
import signal
import subprocess
import sys

seconds = int(sys.argv[1])
cmd = sys.argv[2:]
proc = subprocess.Popen(cmd, start_new_session=True)
try:
    code = proc.wait(timeout=seconds)
except subprocess.TimeoutExpired:
    os.killpg(proc.pid, signal.SIGKILL)
    proc.wait()
    print(f"timed out after {seconds}s: {' '.join(cmd)}", file=sys.stderr)
    sys.exit(124)
sys.exit(code if code is not None else 1)
PY
}

take_screenshot() {
  run_bounded 240 xcrun simctl io booted screenshot "$1"
}

# simctl screenshots stay black unless Simulator.app owns the framebuffer.
open -a Simulator || true
sleep 2

# Prove the framebuffer before the app covers Springboard. The known black
# scene hash is the empty app window, not a generic dark home screen.
echo "springboard screenshot (before launch)"
spring_attempt=1
while true; do
  if take_screenshot "$OUT/springboard.png"; then
    break
  fi
  if (( spring_attempt >= 3 )); then
    echo "springboard screenshot timed out" >&2
    exit 1
  fi
  echo "springboard screenshot failed; retrying" >&2
  sleep 2
  spring_attempt=$((spring_attempt + 1))
done
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
  frame_attempt=1
  while true; do
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
    # Run 38877961991 wrote F1-light about 6s after ready, before the
    # markdown body was on screen. The composer alone kept it under 95%
    # one color. Wait, then shoot.
    sleep 15
    flat_attempt=1
    accepted=0
    while true; do
      shot_status=0
      flat_status=2
      if [[ -n "${console_pid}" ]] && ! kill -0 "$console_pid" 2>/dev/null; then
        shot_status=9
        flat_status=3
        echo "app exited before screenshot ${id}-${theme}" >&2
      else
        take_screenshot "$OUT/${id}-${theme}.png" || shot_status=$?
        if [[ "$shot_status" == "0" ]]; then
          flat_status=0
          python3 "$ROOT/scripts/agent-chat-parity/png-flat.py" "$OUT/${id}-${theme}.png" || flat_status=$?
          if [[ "$flat_status" == "1" ]]; then
            accepted=1
            break
          fi
        fi
      fi
      if (( flat_attempt >= 3 )); then
        break
      fi
      # Home screen means this process is not showing the preview.
      # Another screenshot of the same process stays on Springboard.
      if [[ "$flat_status" == "3" || "$shot_status" == "9" ]]; then
        echo "screenshot ${id}-${theme} is the home screen; relaunching" >&2
        break
      fi
      if [[ "$shot_status" != "0" ]]; then
        echo "screenshot ${id}-${theme} timed out; retrying" >&2
      elif [[ "$flat_status" == "0" ]]; then
        echo "screenshot ${id}-${theme} is flat; waiting for the transcript" >&2
      else
        echo "could not read ${id}-${theme}.png; retrying" >&2
      fi
      sleep 2
      flat_attempt=$((flat_attempt + 1))
    done
    if [[ "$accepted" == "1" ]]; then
      break
    fi
    if (( frame_attempt >= 3 )); then
      if [[ "$shot_status" != "0" && "$shot_status" != "9" ]]; then
        echo "screenshot ${id}-${theme} timed out" >&2
      elif [[ "$flat_status" == "0" ]]; then
        echo "screenshot ${id}-${theme} stayed a flat background" >&2
      elif [[ "$flat_status" == "3" || "$shot_status" == "9" ]]; then
        echo "screenshot ${id}-${theme} stayed on the home screen" >&2
      else
        echo "could not read ${id}-${theme}.png" >&2
      fi
      dump_runtime_logs
      exit 1
    fi
    frame_attempt=$((frame_attempt + 1))
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
    run_bounded 60 xcrun simctl spawn booted log show --last 3m --info --style compact \
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

# After the hold gate, call the scroll pill handler. A miss does not fail the job.
# This is not a Simulator tap.
capture_tail_return() {
  local dest frames video duration index shot
  dest="$OUT/f13-tail-return"
  clear_motion_shots || true
  write_frame_file "f13-tail" "light" "away" "" "" "" "return"
  echo "launch f13-tail light away return"
  launch_frame "f13-tail" "light"
  if ! wait_for_line "[parity] preview-chat module" 90; then
    echo "f13 tail return missed the module" >&2
    return 0
  fi
  if ! wait_for_line "[parity] tail returned" 60; then
    echo "f13 tail return did not land" >&2
    dump_runtime_logs || true
    copy_motion_shots "$dest" || true
    return 0
  fi
  sleep 1
  copy_motion_shots "$dest" || true
  frames="$(mktemp -d)"
  index=0
  while IFS= read -r shot; do
    [[ -n "$shot" ]] || continue
    index=$((index + 1))
    sips -s format jpeg "$shot" --out "$frames/$(printf '%03d' "$index").jpg" >/dev/null || true
  done < <(find "$dest" -name 'tail-*.png' | sort)
  if (( index < 2 )); then
    echo "f13 tail return has ${index} frames; not muxing" >&2
    rm -rf "$frames"
    return 0
  fi
  video="$OUT/f13-tail-return.mov"
  if duration="$(python3 "$ROOT/scripts/agent-chat-parity/mp4-duration.py" --write-mjpeg "$video" "$frames" "$RECORD_SECONDS")"; then
    echo "recording f13 tail return duration ${duration} frames ${index}"
  else
    echo "f13 tail return mux failed" >&2
  fi
  rm -rf "$frames"
}

capture_tail_away
capture_tail_return || echo "f13 tail return capture failed" >&2
capture_stream_motion
capture_f4_replay || echo "f4 replay capture failed" >&2
capture_f12_lane || echo "f12 lane capture failed" >&2
capture_composer_states || echo "composer states capture failed" >&2

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
