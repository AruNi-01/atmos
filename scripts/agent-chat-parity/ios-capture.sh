#!/usr/bin/env bash
# Screenshot F1–F13 in light and dark, then capture motion passes:
# f13-tail scrolled to Reply 50 (three frames muxed when they differ),
# a second f13-tail launch that taps the scroll pill after that hold,
# stream-tools sampled while rows append, an F12 launch that taps the plan
# and queue pills and then the Skip chip (agent-chat-permission-skip) on the
# permission card, an f13-tail launch that swipes the F12 card pills under the
# pinned scroll pill in light and dark, an F1 launch that taps the composer so
# the software keyboard opens, and F4 / F12 / composer passes that freeze each
# script step (`atMs` in the pin) and take a simctl screenshot.
# A wall-clock draw finishes before a slow screenshot returns. The replay,
# pinned lane, and composer-state screenshots do not fail the job. A PillTap
# miss exits non-zero.
# Each frame is its own launch. This script writes Documents/parity-frame.json
# first. The preview reads that file, logs `[parity] ready F# <theme> #0`,
# then `[parity] painted F# <theme> #0` when transcript height is stable.
# It does not arm the in-app carousel. A JS timer in one process stopped
# after about 12 minutes (runs 38823255381, 38831101582, 38837550765).
# PARITY_SHARD=all|stills|motion (default all). CI splits stills and motion.
# This script does not call simctl openurl.
# Requires a booted iOS Simulator with land.atmos.mobile already installed.
# macOS runner only. Do not run this on Linux.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${PARITY_PHONE_OUT:-$ROOT/artifacts/phone}"
BUNDLE_ID="land.atmos.mobile"
RECORD_SECONDS="${RECORD_SECONDS:-4}"
RECORD_IDS=(F4 F12 F13)
PARITY_SHARD="${PARITY_SHARD:-all}"
PILL_TAP_ACTION="${PILL_TAP_ACTION:-test}"
PILL_TAP_DERIVED="${PILL_TAP_DERIVED:-/tmp/pill-tap-derived}"

shard_stills() { [[ "$PARITY_SHARD" == "all" || "$PARITY_SHARD" == "stills" ]]; }
shard_motion() { [[ "$PARITY_SHARD" == "all" || "$PARITY_SHARD" == "motion" ]]; }

phase() {
  echo "[capture $(date -u +%H:%M:%S)] $*"
}
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
  local at_ms="${9:-}"
  local cards="${10:-}"
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
  if [[ "$cards" == "lane" ]]; then extra+=',"cards":"lane"'; fi
  if [[ "$at_ms" =~ ^[0-9]+$ ]]; then extra+=",\"atMs\":${at_ms}"; fi
  printf '{"id":"%s","theme":"%s"%s}\n' "$id" "$theme" "$extra" >"${docs}/parity-frame.json"
  echo "wrote parity-frame.json ${id} ${theme}${scroll:+ ${scroll}}${motion:+ ${motion}}${replay:+ ${replay}}${lane:+ ${lane}}${pill:+ ${pill}}${composer:+ ${composer}}${cards:+ ${cards}}${at_ms:+ at ${at_ms}}"
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
  local suffix="${3:-}"
  local waited=0
  stop_console
  if [[ -n "$suffix" ]]; then
    CURRENT_LOG="$OUT/console-${id}-${theme}-${suffix}.log"
  else
    CURRENT_LOG="$OUT/console-${id}-${theme}.log"
  fi
  : >"$CURRENT_LOG"
  xcrun simctl launch --console-pty --terminate-running-process booted "$BUNDLE_ID" >"$CURRENT_LOG" 2>&1 &
  console_pid=$!
  while (( waited < 10 )); do
    if kill -0 "$console_pid" 2>/dev/null; then
      break
    fi
    sleep 0.2
    waited=$((waited + 1))
  done
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

log_mark() {
  if [[ -f "$OUT/parity-stream.log" ]]; then
    wc -c <"$OUT/parity-stream.log" | tr -d ' '
  else
    echo 0
  fi
}

# Lines already in the stream belong to an earlier launch. Replay start and
# replay done are only counted after this mark.
log_has_since() {
  local needle="$1"
  local mark="$2"
  if [[ -f "$CURRENT_LOG" ]] && grep -F -q -- "$needle" "$CURRENT_LOG"; then
    return 0
  fi
  if [[ ! -f "$OUT/parity-stream.log" ]]; then
    return 1
  fi
  # set -e does not fail this function when the caller is an if. Return the
  # search status explicitly so a missing line stays missing.
  python3 - "$OUT/parity-stream.log" "$mark" "$needle" <<'PY'
import sys

path, mark, needle = sys.argv[1], int(sys.argv[2]), sys.argv[3]
with open(path, "rb") as handle:
    handle.seek(max(0, mark))
    data = handle.read()
sys.exit(0 if needle.encode() in data else 1)
PY
  return $?
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
  # Run 39530230224 attempt 2: a 45s `log show --last 10m` blocked every frame
  # after 4s. The JS ready line was already in os_log. Keep this as a late
  # fallback; the pty log stream is the primary wait.
  run_bounded 8 xcrun simctl spawn booted log show --last 30s --info --debug --style compact \
    --predicate 'eventMessage CONTAINS "[parity]"' \
    >"$OUT/device-log-fallback.txt" 2>&1 || true
}

screen_record_alive() {
  local pid
  pid="$(tr -d '[:space:]' <"$1" 2>/dev/null || true)"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

# Same as wait_for_line, but only lines written after `mark`. When pidfile is
# set, a dead recorder returns 2 so the caller can start again.
wait_for_since() {
  local needle="$1"
  local timeout="$2"
  local mark="$3"
  local pidfile="${4:-}"
  local deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    if log_has_since "$needle" "$mark"; then
      return 0
    fi
    if [[ -n "$pidfile" && -s "$pidfile" ]] && ! screen_record_alive "$pidfile"; then
      echo "screen record exited before ${needle}" >&2
      return 2
    fi
    sleep 0.5
  done
  return 1
}

wait_for_line() {
  local needle="$1"
  local timeout="$2"
  local deadline=$((SECONDS + timeout))
  local next_show=$((SECONDS + 12))
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
      next_show=$((SECONDS + 15))
    fi
    sleep 0.2
  done
  return 1
}

booted_udid() {
  # Prefer the UDID the boot step pinned. Do not silently switch to another
  # leftover iPhone 17 Pro (the runner image had three in run 39578448510).
  if [[ -n "${PARITY_UDID:-}" ]]; then
    xcrun simctl list devices booted -j | PARITY_UDID="$PARITY_UDID" python3 -c '
import json, os, sys
want = os.environ["PARITY_UDID"].strip()
data = json.load(sys.stdin)
for devices in data.get("devices", {}).values():
    for device in devices:
        if device.get("udid") == want and device.get("state") == "Booted":
            print(want)
            sys.exit(0)
sys.exit(1)
'
    return
  fi
  xcrun simctl list devices booted -j | python3 -c '
import json, sys
data = json.load(sys.stdin)
booted = []
for devices in data.get("devices", {}).values():
    for device in devices:
        if device.get("state") == "Booted" and device.get("udid"):
            booted.append(device["udid"])
if len(booted) == 1:
    print(booted[0])
'
}

xcode_sees_udid() {
  local udid="$1"
  xcodebuild \
    -project "$ROOT/scripts/agent-chat-parity/pill-tap/PillTap.xcodeproj" \
    -scheme PillTap \
    -showdestinations 2>/dev/null | grep -E "id: ?${udid}" >/dev/null
}

wait_for_xcode_destination() {
  local udid="$1"
  local deadline=$((SECONDS + 60))
  while (( SECONDS < deadline )); do
    if xcode_sees_udid "$udid"; then
      echo "xcodebuild sees ${udid}"
      return 0
    fi
    sleep 2
  done
  echo "PillTap destination missing: xcodebuild cannot see ${udid}" >&2
  xcodebuild \
    -project "$ROOT/scripts/agent-chat-parity/pill-tap/PillTap.xcodeproj" \
    -scheme PillTap \
    -showdestinations >&2 || true
  xcrun simctl list devices booted >&2 || true
  return 1
}

settle_pill_runner() {
  xcrun simctl terminate booted land.atmos.pill-tap.uitests.xctrunner >/dev/null 2>&1 || true
}

run_pill_tap() {
  local test_id="$1"
  local udid attempt=1 status=1 log
  udid="$(booted_udid)"
  if [[ -z "$udid" ]]; then
    echo "pill tap ${test_id} has no pinned booted simulator" >&2
    xcrun simctl list devices booted >&2 || true
    return 1
  fi
  if ! wait_for_xcode_destination "$udid"; then
    return 1
  fi
  log="$(mktemp)"
  while (( attempt <= 3 )); do
    settle_pill_runner
    set +e
    python3 "$ROOT/scripts/agent-chat-parity/run-until-line.py" \
      --seconds 720 \
      --grace 20 \
      --needle "Test Suite 'Selected tests' passed" \
      -- \
      xcodebuild "$PILL_TAP_ACTION" \
      -project "$ROOT/scripts/agent-chat-parity/pill-tap/PillTap.xcodeproj" \
      -scheme PillTap \
      -sdk iphonesimulator \
      -destination "platform=iOS Simulator,id=${udid}" \
      -derivedDataPath "$PILL_TAP_DERIVED" \
      -only-testing:PillTapUITests/PillTapUITests/${test_id} \
      -parallel-testing-enabled NO \
      CODE_SIGNING_ALLOWED=NO \
      CODE_SIGNING_REQUIRED=NO >"$log" 2>&1
    status=$?
    set -e
    cat "$log"
    if [[ "$status" -eq 0 ]]; then
      rm -f "$log"
      return 0
    fi
    # Run 39578448510: xcodebuild listed only placeholders. That is a
    # destination failure, not an XCTAssert miss. Do not retry it as a tap.
    if grep -q 'Unable to find a device matching the provided destination' "$log"; then
      echo "PillTap destination missing: ${udid}" >&2
      rm -f "$log"
      return 1
    fi
    # Run 39554572933: test-without-building hit SpringBoard Busy while the
    # previous xctrunner was still installing or uninstalling. Retry that.
    # Real XCTAssert misses still fail the script.
    if grep -q 'installing or uninstalling\|Simulator device failed to launch land.atmos.pill-tap' "$log"; then
      echo "pill tap ${test_id} runner busy (attempt ${attempt})"
      attempt=$((attempt + 1))
      sleep 5
      continue
    fi
    rm -f "$log"
    return 1
  done
  rm -f "$log"
  return 1
}

fail_pill_log() {
  local log="$1"
  local what="$2"
  if grep -q 'PillTap destination missing:' "$log"; then
    echo "PillTap destination missing: ${what}" >&2
  else
    echo "PillTap missed: ${what}" >&2
  fi
  tail -n 80 "$log" >&2 || true
  exit 1
}

start_parity_stream() {
  python3 - "$OUT/parity-stream.log" <<'PY' &
import os
import pty
import sys

path = sys.argv[1]
cmd = [
    "xcrun",
    "simctl",
    "spawn",
    "booted",
    "log",
    "stream",
    "--level",
    "debug",
    "--style",
    "compact",
    "--predicate",
    'eventMessage CONTAINS "[parity]"',
]
master, slave = pty.openpty()
pid = os.fork()
if pid == 0:
    os.close(master)
    os.dup2(slave, 1)
    os.dup2(slave, 2)
    os.close(slave)
    os.execvp(cmd[0], cmd)
os.close(slave)
with open(path, "wb", buffering=0) as out:
    while True:
        try:
            chunk = os.read(master, 4096)
        except OSError:
            break
        if not chunk:
            break
        out.write(chunk)
        out.flush()
os.waitpid(pid, 0)
PY
  stream_pid=$!
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
  local mark
  mark="$(log_mark)"
  write_frame_file "$id" "$theme" "away"
  echo "launch ${id} ${theme} away"
  launch_frame "$id" "$theme"
  if ! wait_for_since "[parity] preview-chat module" 90 "$mark"; then
    echo "missing [parity] preview-chat module for ${id}" >&2
    dump_runtime_logs
    exit 1
  fi
  if ! wait_for_since "[parity] ready f13-tail light #0" 120 "$mark"; then
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
  local mark
  mark="$(log_mark)"
  write_frame_file "$id" "$theme"
  echo "launch ${id} ${theme}"
  launch_frame "$id" "$theme"
  if ! wait_for_since "[parity] preview-chat module" 90 "$mark"; then
    echo "missing [parity] preview-chat module for ${id}" >&2
    dump_runtime_logs
    exit 1
  fi
  if ! wait_for_since "[parity] ready stream-tools light #0" 120 "$mark"; then
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

# The pin's atMs freezes replay, lane, and composer. simctl then shoots that
# step. A miss is logged and the matrix artifacts still upload.
held_shot_list() {
  local kind="$1"
  refresh_parity_show || true
  python3 - "$kind" "$CURRENT_LOG" "$OUT/parity-stream.log" "$OUT/device-log-fallback.txt" <<'PY'
import pathlib, re, sys
kind = sys.argv[1]
blob = []
for path in sys.argv[2:]:
    file = pathlib.Path(path)
    if file.exists():
        blob.append(file.read_text(errors="replace"))
found = re.findall(r"\[parity\] " + re.escape(kind) + r" shots ([0-9 ]+)", "\n".join(blob))
if not found:
    sys.exit(1)
print(found[-1].strip())
PY
}

capture_pinned_steps() {
  local id="$1"
  local theme="$2"
  local scroll="$3"
  local motion="$4"
  local replay="$5"
  local lane="$6"
  local pill="$7"
  local composer="$8"
  local kind="$9"
  local dest="${10}"
  local prefix="${11}"
  local shots ms png frames index shot video duration mark
  mark="$(log_mark)"
  write_frame_file "$id" "$theme" "$scroll" "$motion" "$replay" "$lane" "$pill" "$composer" "0"
  echo "launch ${id} ${theme} ${kind} hold"
  launch_frame "$id" "$theme"
  if ! wait_for_since "[parity] preview-chat module" 90 "$mark"; then
    echo "${kind} missed the module" >&2
    return 0
  fi
  if ! wait_for_since "[parity] ${kind} shots " 60 "$mark"; then
    echo "${kind} did not publish shots" >&2
    dump_runtime_logs || true
    return 0
  fi
  if ! shots="$(held_shot_list "$kind")"; then
    echo "${kind} shot list missing" >&2
    return 0
  fi
  echo "${kind} shots ${shots}"
  mkdir -p "$dest"
  for ms in $shots; do
    mark="$(log_mark)"
    write_frame_file "$id" "$theme" "$scroll" "$motion" "$replay" "$lane" "$pill" "$composer" "$ms"
    if ! wait_for_since "[parity] ${kind} held ${ms}" 45 "$mark"; then
      echo "${kind} missed hold ${ms}" >&2
      continue
    fi
    sleep 0.4
    png="$dest/${prefix}-$(printf '%05d' "$ms").png"
    take_screenshot "$png" || true
  done
  frames="$(mktemp -d)"
  index=0
  while IFS= read -r shot; do
    [[ -n "$shot" ]] || continue
    index=$((index + 1))
    sips -s format jpeg "$shot" --out "$frames/$(printf '%03d' "$index").jpg" >/dev/null || true
  done < <(find "$dest" -name "${prefix}-*.png" | sort)
  if (( index < 2 )); then
    echo "${kind} has ${index} frames; not muxing" >&2
    rm -rf "$frames"
    return 0
  fi
  if ! python3 - "$dest" "$prefix" <<'PY'
import hashlib, pathlib, sys
dest = pathlib.Path(sys.argv[1])
prefix = sys.argv[2]
files = sorted(dest.glob(f"{prefix}-*.png"))
digests = {hashlib.sha256(path.read_bytes()).hexdigest() for path in files if path.stat().st_size}
print(f"{prefix} distinct frames {len(digests)} of {len(files)}")
if len(digests) < 2:
    sys.exit(1)
PY
  then
    echo "${kind} screenshots are identical; not muxing" >&2
    rm -rf "$frames"
    return 0
  fi
  video="$dest.mov"
  if duration="$(python3 "$ROOT/scripts/agent-chat-parity/mp4-duration.py" --write-mjpeg "$video" "$frames" "$RECORD_SECONDS")"; then
    echo "recording ${kind} duration ${duration} frames ${index}"
  else
    echo "${kind} mux failed" >&2
  fi
  rm -rf "$frames"
}

# simctl screenshot does not return while the live shimmer is painting, and the
# file that eventually lands is Springboard. Record the unfrozen replay instead.
start_screen_record() {
  local video="$1"
  local pidfile="$2"
  local errlog="$3"
  rm -f "$pidfile" "$video"
  python3 - "$video" "$pidfile" "$errlog" <<'PY' &
import subprocess
import sys

video, pidfile, errlog = sys.argv[1], sys.argv[2], sys.argv[3]
err = open(errlog, "w", encoding="utf-8", buffering=1)
proc = subprocess.Popen(
    ["xcrun", "simctl", "io", "booted", "recordVideo", "--codec", "h264", "--force", video],
    start_new_session=True,
    stdout=err,
    stderr=err,
)
with open(pidfile, "w", encoding="utf-8") as handle:
    handle.write(str(proc.pid))
raise SystemExit(proc.wait())
PY
  local waited=0
  while [[ ! -s "$pidfile" && "$waited" -lt 25 ]]; do
    sleep 0.2
    waited=$((waited + 1))
  done
}

stop_screen_record() {
  local pidfile="$1"
  local pid
  pid="$(tr -d '[:space:]' <"$pidfile" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    echo "screen record has no pid" >&2
    return 0
  fi
  python3 - "$pid" <<'PY'
import os
import signal
import sys
import time

pid = int(sys.argv[1])

def alive() -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True

if not alive():
    sys.exit(0)
try:
    os.killpg(pid, signal.SIGINT)
except ProcessLookupError:
    sys.exit(0)
for _ in range(20):
    if not alive():
        sys.exit(0)
    time.sleep(1)
os.killpg(pid, signal.SIGKILL)
PY
}

# Both passes freeze on the finished card at atMs 15000, open recordVideo,
# then drop atMs. Reduced motion stays on that pin. Run 39174689600's reduced
# movie never received a moov atom, and run 39180040384's playable reduced
# movie jumped 5.5s across the answer, while the replay was taking simctl
# screenshots. Those stills are written by the pinned pass after this
# function. Keep each attempt and copy the larger file.
record_replay_movie() {
  local motion="$1"
  local label="$2"
  local done_line="$3"
  local attempt mark video pidfile errlog
  local canonical="$OUT/f4-${label}-motion.mov"
  local best="" best_size=0 candidate size
  open -a Simulator || true
  for attempt in 1 2; do
    echo "record f4 ${label} replay attempt ${attempt}"
    video="$OUT/f4-${label}-motion-${attempt}.mov"
    pidfile="$OUT/f4-${label}-record-${attempt}.pid"
    errlog="$OUT/f4-${label}-record-${attempt}.log"
    mark="$(log_mark)"
    write_frame_file "F4" "light" "" "$motion" "script" "" "" "" 15000
    launch_frame "F4" "light" "$label"
    if ! wait_for_since "[parity] replay held 15000" 90 "$mark"; then
      echo "f4 ${label} replay missed the held frame" >&2
      continue
    fi
    start_screen_record "$video" "$pidfile" "$errlog"
    echo "f4 ${label} recorder open attempt ${attempt}"
    write_frame_file "F4" "light" "" "$motion" "script"
    if ! wait_for_since "[parity] replay start" 20 "$mark" "$pidfile"; then
      echo "f4 ${label} replay missed the start" >&2
      stop_screen_record "$pidfile" || true
      continue
    fi
    if wait_for_since "$done_line" 40 "$mark" "$pidfile"; then
      sleep 0.5
      stop_screen_record "$pidfile" || true
      break
    fi
    echo "f4 ${label} replay missed ${done_line}" >&2
    stop_screen_record "$pidfile" || true
  done
  for attempt in 1 2; do
    candidate="$OUT/f4-${label}-motion-${attempt}.mov"
    if [[ -s "$candidate" ]]; then
      size="$(wc -c <"$candidate" | tr -d ' ')"
      if (( size > best_size )); then
        best="$candidate"
        best_size="$size"
      fi
    fi
  done
  if [[ -n "$best" ]]; then
    cp "$best" "$canonical"
    echo "recorded f4 ${label} bytes ${best_size} from $(basename "$best")"
  else
    echo "f4 ${label} recording is missing" >&2
  fi
}

capture_f4_replay() {
  record_replay_movie "" "live" "[parity] replay done live" || true
  record_replay_movie "reduced" "reduced" "[parity] replay done reduced" || true
  capture_pinned_steps "F4" "light" "" "reduced" "script" "" "" "" "replay" "$OUT/f4-replay-reduced" "f4" || true
}

# Pill steps for F12. The pin freezes each reducer state for a simctl shot.
# This is not a Simulator tap, and it does not answer the permission.
capture_f12_lane() {
  capture_pinned_steps "F12" "light" "" "" "" "steps" "" "" "lane" "$OUT/f12-lane" "lane" || true
}

# F12 with no lane pin, so the pill row is the live reducer. The test activates
# the running app and taps plan, then queue, then queue again, then the
# permission pill, then the Skip chip (agent-chat-permission-skip). F12's
# permission options are Allow and Skip. A PillTap miss exits non-zero.
# recordVideo stays open across the taps and this pass does not take simctl
# screenshots.
tap_card_pills() {
  local udid
  udid="$(booted_udid)"
  if [[ -z "$udid" ]]; then
    echo "card pill tap has no single booted simulator" >&2
    return 1
  fi
  echo "tapping agent-chat-card-pill-plan on ${udid}"
  run_pill_tap testTapCardPills
}

capture_f12_pill_taps() {
  local mark video pidfile errlog
  video="$OUT/f12-pill-tap.mov"
  pidfile="$OUT/f12-pill-tap-record.pid"
  errlog="$OUT/f12-pill-tap-record.log"
  mark="$(log_mark)"
  write_frame_file "F12" "light"
  launch_frame "F12" "light" "pills"
  if ! wait_for_since "[parity] ready F12 light" 90 "$mark"; then
    echo "PillTap missed: f12 pill tap never became ready" >&2
    exit 1
  fi
  start_screen_record "$video" "$pidfile" "$errlog"
  echo "f12 pill recorder open"
  if ! tap_card_pills >"$OUT/f12-pill-tap.log" 2>&1; then
    stop_screen_record "$pidfile" || true
    fail_pill_log "$OUT/f12-pill-tap.log" "f12 card pill tap failed"
  fi
  sleep 0.5
  stop_screen_record "$pidfile" || true
}

# f13-tail scrolled away, with the F12 card lane mounted. The scroll pill stays
# pinned while the test swipes the card pills, taps plan, then taps the scroll
# pill. Light keeps f12f13-pill-row.mov. Dark writes f12f13-pill-row-dark.mov.
# A PillTap miss exits non-zero. recordVideo stays open and this pass
# does not take simctl screenshots.
tap_card_row() {
  local udid
  udid="$(booted_udid)"
  if [[ -z "$udid" ]]; then
    echo "card row swipe has no single booted simulator" >&2
    return 1
  fi
  echo "swiping agent-chat-card-pill-scroller on ${udid}"
  run_pill_tap testSwipeCardPills
}

capture_f12_card_row() {
  local theme="${1:-light}"
  local mark video pidfile errlog taplog
  if [[ "$theme" == "light" ]]; then
    video="$OUT/f12f13-pill-row.mov"
    pidfile="$OUT/f12f13-pill-row-record.pid"
    errlog="$OUT/f12f13-pill-row-record.log"
    taplog="$OUT/f12f13-pill-row.log"
  else
    video="$OUT/f12f13-pill-row-${theme}.mov"
    pidfile="$OUT/f12f13-pill-row-${theme}-record.pid"
    errlog="$OUT/f12f13-pill-row-${theme}-record.log"
    taplog="$OUT/f12f13-pill-row-${theme}.log"
  fi
  mark="$(log_mark)"
  write_frame_file "f13-tail" "$theme" "away" "" "" "" "" "" "" "lane"
  launch_frame "f13-tail" "$theme" "cards"
  if ! wait_for_since "[parity] ready f13-tail ${theme}" 90 "$mark"; then
    echo "PillTap missed: f12 card row ${theme} never became ready" >&2
    exit 1
  fi
  start_screen_record "$video" "$pidfile" "$errlog"
  echo "f12 card row ${theme} recorder open"
  if ! tap_card_row >"$taplog" 2>&1; then
    stop_screen_record "$pidfile" || true
    fail_pill_log "$taplog" "f12 card row ${theme} swipe failed"
  fi
  sleep 0.5
  stop_screen_record "$pidfile" || true
}

# Composer states for S23. Keyboard is a TextInput focus call, not a Simulator
# tap. The manual preview link does not set this pin.
capture_composer_states() {
  capture_pinned_steps "F1" "light" "" "" "" "" "" "states" "composer" "$OUT/composer-states" "composer" || true
}

# Idle F1 composer. The test activates the running app and taps the field.
# The software keyboard is the proof. A PillTap miss exits non-zero.
# recordVideo stays open and this pass does not take simctl screenshots.
tap_composer() {
  local udid
  udid="$(booted_udid)"
  if [[ -z "$udid" ]]; then
    echo "composer tap has no single booted simulator" >&2
    return 1
  fi
  echo "tapping agent-chat-composer-input on ${udid}"
  run_pill_tap testTapComposerField
}

capture_composer_keyboard() {
  local mark video pidfile errlog
  video="$OUT/composer-keyboard.mov"
  pidfile="$OUT/composer-keyboard-record.pid"
  errlog="$OUT/composer-keyboard-record.log"
  mark="$(log_mark)"
  write_frame_file "F1" "light"
  launch_frame "F1" "light" "keys"
  if ! wait_for_since "[parity] ready F1 light" 90 "$mark"; then
    echo "PillTap missed: composer keyboard never became ready" >&2
    exit 1
  fi
  start_screen_record "$video" "$pidfile" "$errlog"
  echo "composer keyboard recorder open"
  if ! tap_composer >"$OUT/composer-keyboard.log" 2>&1; then
    stop_screen_record "$pidfile" || true
    fail_pill_log "$OUT/composer-keyboard.log" "composer keyboard tap failed"
  fi
  sleep 0.5
  stop_screen_record "$pidfile" || true
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

if ! shard_stills && ! shard_motion; then
  echo "PARITY_SHARD must be all, stills, or motion (got ${PARITY_SHARD})" >&2
  exit 1
fi
phase "shard ${PARITY_SHARD} pill=${PILL_TAP_ACTION} record=${RECORD_SECONDS}s"

# simctl screenshots stay black unless Simulator.app owns the framebuffer.
open -a Simulator || true
sleep 1

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
start_parity_stream

if shard_stills; then
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
    # Run 39561423684: F4-light retries matched the previous launch's
    # painted line in the cumulative stream and shot Springboard.
    mark="$(log_mark)"
    launch_frame "$id" "$theme"
    if ! wait_for_since "[parity] preview-chat module" 90 "$mark"; then
      echo "missing [parity] preview-chat module for ${id} ${theme}" >&2
      dump_runtime_logs
      exit 1
    fi
    echo "wait ${needle}"
    if ! wait_for_since "$needle" 120 "$mark"; then
      echo "missing ${needle}" >&2
      dump_runtime_logs
      exit 1
    fi
    echo "wait [parity] painted ${id} ${theme}"
    if ! wait_for_since "[parity] painted ${id} ${theme}" 25 "$mark"; then
      echo "no painted line for ${id} ${theme}; shooting after ready"
    fi
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
      if (( flat_attempt >= 6 )); then
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
    xcrun simctl terminate booted "$BUNDLE_ID" >/dev/null 2>&1 || true
    sleep 2
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
    run_bounded 15 xcrun simctl spawn booted log show --last 3m --info --style compact \
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
phase "stills complete"
fi

# After the hold gate, tap the scroll pill. A PillTap miss exits non-zero.
# The preview logs `[parity] pill awaiting tap` and does not call the handler.
tap_scroll_pill() {
  local udid
  udid="$(booted_udid)"
  if [[ -z "$udid" ]]; then
    echo "scroll pill tap has no single booted simulator" >&2
    return 1
  fi
  echo "tapping agent-chat-scroll-pill on ${udid}"
  # Run 39131560794 printed the suite passed line, then xcodebuild stayed open
  # until the 360s SIGKILL. Stop once the suite has passed.
  run_pill_tap testTapScrollPill
}

capture_tail_return() {
  local dest frames video duration index shot mark
  dest="$OUT/f13-tail-return"
  clear_motion_shots || true
  mark="$(log_mark)"
  write_frame_file "f13-tail" "light" "away" "" "" "" "return"
  echo "launch f13-tail light away return"
  launch_frame "f13-tail" "light"
  if ! wait_for_since "[parity] preview-chat module" 90 "$mark"; then
    echo "f13 tail return missed the module" >&2
    dump_runtime_logs
    exit 1
  fi
  if ! wait_for_since "[parity] pill awaiting tap" 90 "$mark"; then
    echo "PillTap missed: f13 tail return never offered the pill" >&2
    dump_runtime_logs || true
    copy_motion_shots "$dest" || true
    exit 1
  fi
  echo "tapping the scroll pill" >&2
  if ! tap_scroll_pill >"$OUT/pill-tap.log" 2>&1; then
    fail_pill_log "$OUT/pill-tap.log" "scroll pill tap failed"
  fi
  if ! wait_for_since "[parity] tail returned" 60 "$mark"; then
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

if shard_motion; then
phase "motion start"
capture_tail_away
capture_tail_return || echo "f13 tail return capture failed" >&2
capture_stream_motion
capture_f4_replay || echo "f4 replay capture failed" >&2
capture_f12_lane || echo "f12 lane capture failed" >&2
capture_f12_pill_taps
capture_f12_card_row light
capture_f12_card_row dark
capture_composer_states || echo "composer states capture failed" >&2
capture_composer_keyboard
phase "motion complete"
fi

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

if shard_stills; then
for id in "${RECORD_IDS[@]}"; do
  record_still "$id"
done
fi

# The log stream and console pty outlive this script. Leave them. The job
# tears the step down, and killing by name would hit unrelated processes.
echo "phone artifacts written to ${OUT}"
