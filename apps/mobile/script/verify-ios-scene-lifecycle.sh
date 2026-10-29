#!/usr/bin/env bash
# QUALITY-011. Structural checks run on Linux after prebuild.
# Simulator checks need a Mac with the iOS 27.0 and iOS 26.5 runtimes.
#
# Exit codes for every mode:
#   0  PASS. Every check this mode ran succeeded.
#   1  FAIL. A check ran and failed (plist, Swift, build, a pod install
#      error that is not a prebuilt miss, cold launch, or deep link).
#   2  NOT RUN. The simulator proof did not run. xcrun is missing, or pod
#      install fell back to a source build / did not download
#      reactnative-dependencies-*-release.tar.gz. Not a pass, and not a
#      product failure. structural and built-plist do not use this code.
#
# `simulator` prints NOT RUN and exits 2 in those cases. It does not claim
# a launch that did not happen, and it does not xcodebuild after a bad
# prebuilt download. Cold launch waits COLD_LAUNCH_WAIT_SECONDS (4, at
# least 3) and passes only if that pid is still alive and no new Atmos
# .ips appeared. A bad ATMOS_DIAGNOSTIC_REPORTS path warns. An empty failed
# `log show` fails the launch instead of skipping the runtime-issue check.
# Deep links still use the JS unmatched-route judge.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# Tests point this at an empty tree so a developer prebuild cannot satisfy `structural`.
IOS_DIR="${ATMOS_IOS_DIR:-$MOBILE_DIR/ios}"
BUNDLE_ID="land.atmos.mobile"
URL_LOG="AtmosSceneLifecycle delivered URL to RCTLinkingManager"
ACTIVITY_LOG="AtmosSceneLifecycle delivered userActivity to RCTLinkingManager"
RUNTIME_ISSUE="UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption"
# 4 seconds is past the 3 second cold-launch bar and matches the old log window.
COLD_LAUNCH_WAIT_SECONDS=4

usage() {
  cat <<'EOF'
Usage:
  verify-ios-scene-lifecycle.sh structural
  verify-ios-scene-lifecycle.sh built-plist <Info.plist>
  verify-ios-scene-lifecycle.sh simulator

structural   After expo prebuild. Checks ios/Atmos/Info.plist and AppDelegate.swift.
built-plist  Checks a built Atmos.app Info.plist expands to Atmos.SceneDelegate.
simulator    Release-builds and cold-starts iOS 27.0, then iOS 26.5.
             A deep-link failure on the first runtime still runs the second.
             Exits 2 without building when the Release prebuilt tarball is missing.

Exit codes:
  0  PASS
  1  FAIL (a check ran and did not pass)
  2  NOT RUN (no xcrun, or pod install has no usable Release prebuilt)

Linux checks, no simulator:
  verify-ios-scene-lifecycle.sh judge-prebuilt <pod-log> <artifacts-dir>
  verify-ios-scene-lifecycle.sh judge-cold <label> <launch-status> <launch-output> <alive> <seconds> <runtime-log> <before-ips> <after-ips>
  verify-ios-scene-lifecycle.sh list-ips <diagnostic-reports-dir> [more-dirs]
  verify-ios-scene-lifecycle.sh parse-launch-pid <launch-output>

Environment for simulator:
  ATMOS_IOS27_DEVICE         default: iPhone 18 Pro
  ATMOS_IOS27_RUNTIME        default: 27.0
  ATMOS_IOS26_DEVICE         default: iPhone 17 Pro
  ATMOS_IOS26_RUNTIME        default: 26.5
  ATMOS_DIAGNOSTIC_REPORTS   one crash-report directory instead of the Mac defaults
  ATMOS_IOS_DIR              ios project directory (default: apps/mobile/ios). Tests only.
EOF
}

parse_launch_pid() {
  local out="$1"
  local line rest pid
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    case "$line" in
      "${BUNDLE_ID}:"*)
        rest="${line#"${BUNDLE_ID}:"}"
        rest="${rest#"${rest%%[![:space:]]*}"}"
        pid="${rest%%[^0-9]*}"
        printf '%s\n' "$pid"
        return 0
        ;;
    esac
  done <<<"$out"
}

python_check_plist() {
  local plist="$1"
  local mode="$2"
  python3 - "$plist" "$mode" <<'PY'
import plistlib
import sys

path, mode = sys.argv[1], sys.argv[2]
with open(path, "rb") as handle:
    data = plistlib.load(handle)
manifest = data.get("UIApplicationSceneManifest")
if not isinstance(manifest, dict):
    raise SystemExit(f"{path}: missing UIApplicationSceneManifest")
if manifest.get("UIApplicationSupportsMultipleScenes") is not False:
    raise SystemExit(f"{path}: UIApplicationSupportsMultipleScenes must be false")
configs = (
    manifest.get("UISceneConfigurations", {})
    .get("UIWindowSceneSessionRoleApplication", [])
)
if len(configs) != 1:
    raise SystemExit(f"{path}: expected one application scene configuration")
name = configs[0].get("UISceneDelegateClassName")
expected = {
    "source": "$(PRODUCT_MODULE_NAME).SceneDelegate",
    "built": "Atmos.SceneDelegate",
}[mode]
if name != expected:
    raise SystemExit(f"{path}: UISceneDelegateClassName is {name!r}, expected {expected!r}")
print(f"{mode} UISceneDelegateClassName={name}")
PY
}

check_swift() {
  local swift="$IOS_DIR/Atmos/AppDelegate.swift"
  if [[ ! -f "$swift" ]]; then
    echo "Missing $swift. Run expo prebuild --platform ios first." >&2
    exit 1
  fi
  local launch
  launch="$(awk '
    /didFinishLaunchingWithOptions/ { capture=1 }
    capture { print }
    /\/\/ Linking API/ { exit }
  ' "$swift")"
  if grep -q 'UIWindow(frame:' <<<"$launch"; then
    echo "didFinishLaunchingWithOptions still creates a UIWindow" >&2
    exit 1
  fi
  if grep -q 'factory.startReactNative' <<<"$launch"; then
    echo "didFinishLaunchingWithOptions still starts React Native" >&2
    exit 1
  fi
  if grep -q 'HomeTabBarClearGlass' "$swift"; then
    echo "private tab bar glass swizzle must not return in $swift" >&2
    exit 1
  fi
  if ! grep -q 'class SceneDelegate: UIResponder, UIWindowSceneDelegate' "$swift"; then
    echo "SceneDelegate class missing from $swift" >&2
    exit 1
  fi
  if grep -q '@objc(SceneDelegate)' "$swift"; then
    echo "SceneDelegate must not use a custom @objc name" >&2
    exit 1
  fi
  local needle
  for needle in \
    'UIWindow(windowScene:' \
    'openURLContexts' \
    'connectionOptions.urlContexts' \
    'connectionOptions.userActivities' \
    'UIApplicationLaunchOptionsURLKey' \
    'UIApplicationLaunchOptionsUserActivityDictionaryKey' \
    'NSUserActivityTypeBrowsingWeb' \
    'RCTOpenURLNotification' \
    'RCTLinkingManager.application' \
    'func sceneDidDisconnect' \
    'window = nil' \
    'if !observer.wasNotified' \
    "$URL_LOG" \
    "$ACTIVITY_LOG"
  do
    if ! grep -q -F "$needle" "$swift"; then
      echo "AppDelegate.swift is missing: $needle" >&2
      exit 1
    fi
  done
  echo "AppDelegate.swift scene lifecycle ok"
}

check_route_signal() {
  local screen="$MOBILE_DIR/app/+not-found.tsx"
  if [[ ! -f "$screen" ]]; then
    echo "Missing $screen" >&2
    exit 1
  fi
  if ! grep -q -F 'console.error("ATMOS_ROUTE unmatched")' "$screen"; then
    echo "NotFoundRoute is missing the fixed unmatched-route log" >&2
    exit 1
  fi
  if ! grep -q -F '[pathname]' "$screen"; then
    echo "NotFoundRoute must log again when the unmatched path changes" >&2
    exit 1
  fi
  local log_line
  log_line="$(grep -F 'console.error' "$screen")"
  if grep -q 'pathname\|atmos://\|scene-lifecycle-probe\|`' <<<"$log_line"; then
    echo "NotFoundRoute log must not include the URL" >&2
    exit 1
  fi
}

structural() {
  check_route_signal
  local plist="$IOS_DIR/Atmos/Info.plist"
  if [[ ! -f "$plist" ]]; then
    echo "Missing $plist. Run expo prebuild --platform ios first." >&2
    exit 1
  fi
  python_check_plist "$plist" source
  check_swift
}

built_plist() {
  local plist="${1:-}"
  if [[ -z "$plist" || ! -f "$plist" ]]; then
    echo "built-plist needs a path to Info.plist" >&2
    return 1
  fi
  python_check_plist "$plist" built
}

require_xcrun() {
  if ! command -v xcrun >/dev/null 2>&1; then
    echo "NOT RUN: simulator. xcrun is not available on this machine." >&2
    exit 2
  fi
}

resolve_device() {
  local runtime="$1"
  local name="$2"
  python3 - "$runtime" "$name" <<'PY'
import json
import subprocess
import sys

runtime, device_name = sys.argv[1], sys.argv[2]
major, minor = runtime.split(".", 1)
suffix = f"iOS-{major}-{minor}"
display = f"iOS {runtime}"
raw = subprocess.check_output(["xcrun", "simctl", "list", "devices", "available", "-j"], text=True)
devices = json.loads(raw).get("devices", {})
matched_runtime = None
for key, entries in devices.items():
    if key.endswith(suffix) or key.endswith(display) or key == display:
        matched_runtime = key
        break
if matched_runtime is None:
    print(f"NOT FOUND runtime {runtime}. Available:", file=sys.stderr)
    for key in devices:
        print(f"  {key}", file=sys.stderr)
    raise SystemExit(1)
chosen = None
for entry in devices[matched_runtime]:
    if entry.get("name") == device_name and entry.get("isAvailable", True):
        chosen = entry
        break
if chosen is None:
    created = subprocess.check_output(
        ["xcrun", "simctl", "create", device_name, device_name, matched_runtime],
        text=True,
    ).strip()
    print(created)
else:
    print(chosen["udid"])
PY
}

boot_device() {
  local udid="$1"
  local status=0
  xcrun simctl boot "$udid" || status=$?
  if [[ "$status" -ne 0 ]]; then
    echo "simctl boot exited ${status}; waiting for bootstatus"
  fi
  # simulator() invokes this under `||`, which disables set -e for the call.
  xcrun simctl bootstatus "$udid" -b || return 1
}

log_since() {
  local udid="$1"
  local start="$2"
  local status=0
  set +e
  xcrun simctl spawn "$udid" log show --start "$start" --style compact --predicate 'processImagePath CONTAINS "Atmos" OR subsystem == "com.facebook.react.log" OR composedMessage CONTAINS "ATMOS_ROUTE unmatched" OR eventMessage CONTAINS "ATMOS_ROUTE unmatched" OR composedMessage CONTAINS "AtmosSceneLifecycle" OR eventMessage CONTAINS "AtmosSceneLifecycle" OR composedMessage CONTAINS "UIApplicationEvaluateRuntimeIssue" OR eventMessage CONTAINS "UIApplicationEvaluateRuntimeIssue"'
  status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    echo "WARN: log show exited ${status}; runtime-issue check did not see a complete log" >&2
    return "$status"
  fi
}

warn_diagnostic_root() {
  local label="$1"
  local root="$2"
  if [[ ! -d "$root" ]]; then
    echo "WARN ${label}: ATMOS_DIAGNOSTIC_REPORTS is not a directory: ${root}" >&2
  fi
}

snapshot_atmos_ips() {
  local dest="$1"
  shift
  # `|| return` keeps bash 3.2 `set -e` from exiting the simulator script
  # when this function is used in `if !`.
  bun "$SCRIPT_DIR/scene-launch-evidence.js" list-ips "$@" >"$dest" || return $?
}

assert_cold_launch() {
  local udid="$1"
  local label="$2"
  xcrun simctl terminate "$udid" "$BUNDLE_ID" || true
  local before after launch_file runtime_file roots_host roots_device
  before="$(mktemp)"
  after="$(mktemp)"
  launch_file="$(mktemp)"
  runtime_file="$(mktemp)"
  cleanup_cold() {
    rm -f "$before" "$after" "$launch_file" "$runtime_file"
  }
  if [[ -n "${ATMOS_DIAGNOSTIC_REPORTS:-}" ]]; then
    warn_diagnostic_root "$label" "$ATMOS_DIAGNOSTIC_REPORTS"
    if ! snapshot_atmos_ips "$before" "$ATMOS_DIAGNOSTIC_REPORTS"; then
      echo "FAIL ${label}: could not list crash reports" >&2
      cleanup_cold
      return 1
    fi
  else
    roots_host="${HOME}/Library/Logs/DiagnosticReports"
    roots_device="${HOME}/Library/Developer/CoreSimulator/Devices/${udid}/data/Library/Logs/DiagnosticReports"
    if ! snapshot_atmos_ips "$before" "$roots_host" "$roots_device"; then
      echo "FAIL ${label}: could not list crash reports" >&2
      cleanup_cold
      return 1
    fi
  fi
  local start out status
  start="$(date '+%Y-%m-%d %H:%M:%S')"
  set +e
  out="$(xcrun simctl launch "$udid" "$BUNDLE_ID" 2>&1)"
  status=$?
  set -e
  printf '%s\n' "$out"
  printf '%s\n' "$out" >"$launch_file"
  sleep "$COLD_LAUNCH_WAIT_SECONDS"
  local pid alive
  pid="$(parse_launch_pid "$out")"
  alive=0
  if [[ "$status" -eq 0 && "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    alive=1
  fi
  if [[ -n "${ATMOS_DIAGNOSTIC_REPORTS:-}" ]]; then
    if ! snapshot_atmos_ips "$after" "$ATMOS_DIAGNOSTIC_REPORTS"; then
      echo "FAIL ${label}: could not list crash reports" >&2
      cleanup_cold
      return 1
    fi
  else
    if ! snapshot_atmos_ips "$after" "$roots_host" "$roots_device"; then
      echo "FAIL ${label}: could not list crash reports" >&2
      cleanup_cold
      return 1
    fi
  fi
  local logs judge_status log_status trimmed
  log_status=0
  logs="$(log_since "$udid" "$start")" || log_status=$?
  trimmed="${logs//[[:space:]]/}"
  if [[ "$log_status" -ne 0 && -z "$trimmed" ]]; then
    echo "FAIL ${label}: could not read the unified log" >&2
    cleanup_cold
    return 1
  fi
  printf '%s\n' "$logs" >"$runtime_file"
  judge_status=0
  bun "$SCRIPT_DIR/scene-launch-evidence.js" judge-cold \
    "$label" "$status" "$launch_file" "$alive" "$COLD_LAUNCH_WAIT_SECONDS" \
    "$runtime_file" "$before" "$after" || judge_status=$?
  cleanup_cold
  if [[ "$judge_status" -ne 0 ]]; then
    printf '%s\n' "$logs" >&2
    return 1
  fi
}

assert_deep_links() {
  local udid="$1"
  local label="$2"
  xcrun simctl terminate "$udid" "$BUNDLE_ID" || true
  sleep 1
  local start cold_log all_log
  start="$(date '+%Y-%m-%d %H:%M:%S')"
  cold_log="$(mktemp)"
  all_log="$(mktemp)"
  xcrun simctl openurl "$udid" "atmos://scene-lifecycle-probe"
  sleep 4
  local cold_log_status=0 warm_log_status=0
  log_since "$udid" "$start" >"$cold_log" || cold_log_status=$?
  if [[ "$cold_log_status" -ne 0 && ! -s "$cold_log" ]]; then
    echo "FAIL ${label}: could not read the unified log" >&2
    rm -f "$cold_log" "$all_log"
    return 1
  fi
  xcrun simctl openurl "$udid" "atmos://scene-lifecycle-probe-warm"
  sleep 3
  log_since "$udid" "$start" >"$all_log" || warm_log_status=$?
  if [[ "$warm_log_status" -ne 0 && ! -s "$all_log" ]]; then
    echo "FAIL ${label}: could not read the unified log" >&2
    rm -f "$cold_log" "$all_log"
    return 1
  fi
  local status=0
  bun "$SCRIPT_DIR/scene-deep-link-evidence.js" judge "$cold_log" "$all_log" || status=$?
  rm -f "$cold_log" "$all_log"
  if [[ "$status" -ne 0 ]]; then
    echo "FAIL ${label}: deep link did not reach the JS unmatched route" >&2
    return 1
  fi
  echo "PASS ${label}: cold and warm URLs reached the JS unmatched route"
}

build_release() {
  local udid="$1"
  local label="$2"
  local derived="$IOS_DIR/DerivedData-Scene-${label}"
  rm -rf "$derived"
  # xcodebuild progress stays on the terminal. Only the app path is captured.
  xcodebuild \
    -workspace "$IOS_DIR/Atmos.xcworkspace" \
    -scheme Atmos \
    -configuration Release \
    -sdk iphonesimulator \
    -destination "platform=iOS Simulator,id=${udid}" \
    -derivedDataPath "$derived" \
    build >&2 || return 1
  local app="$derived/Build/Products/Release-iphonesimulator/Atmos.app"
  if [[ ! -d "$app" ]]; then
    echo "Release app not found at $app" >&2
    return 1
  fi
  built_plist "$app/Info.plist" >&2 || return 1
  printf '%s\n' "$app"
}

install_and_verify() {
  local udid="$1"
  local label="$2"
  local app
  if ! app="$(build_release "$udid" "$label")"; then
    echo "FAIL ${label}: release build" >&2
    return 1
  fi
  boot_device "$udid" || return 1
  xcrun simctl install "$udid" "$app" || return 1
  assert_cold_launch "$udid" "$label" || return 1
  assert_deep_links "$udid" "$label" || return 1
}

simulator() {
  require_xcrun
  local device27="${ATMOS_IOS27_DEVICE:-iPhone 18 Pro}"
  local runtime27="${ATMOS_IOS27_RUNTIME:-27.0}"
  local device26="${ATMOS_IOS26_DEVICE:-iPhone 17 Pro}"
  local runtime26="${ATMOS_IOS26_RUNTIME:-26.5}"

  echo "Prebuild iOS (clean, no pod install yet)"
  (cd "$MOBILE_DIR" && CI=1 bunx expo prebuild --platform ios --no-install --clean)
  structural

  echo "pod install"
  local pod_log pod_status artifacts prebuilt_status
  pod_log="$(mktemp)"
  pod_status=0
  set +e
  (cd "$IOS_DIR" && pod install) 2>&1 | tee "$pod_log"
  pod_status="${PIPESTATUS[0]}"
  set -e
  artifacts="$IOS_DIR/Pods/ReactNativeDependencies-artifacts"
  prebuilt_status=0
  bun "$SCRIPT_DIR/scene-launch-evidence.js" judge-prebuilt "$pod_log" "$artifacts" || prebuilt_status=$?
  rm -f "$pod_log"
  if [[ "$prebuilt_status" -eq 2 ]]; then
    if [[ "$pod_status" -ne 0 ]]; then
      echo "pod install exited ${pod_status}" >&2
    fi
    exit 2
  fi
  if [[ "$prebuilt_status" -ne 0 ]]; then
    echo "FAIL simulator: prebuilt check exited ${prebuilt_status}" >&2
    exit 1
  fi
  if [[ "$pod_status" -ne 0 ]]; then
    echo "FAIL simulator: pod install exited ${pod_status}" >&2
    exit 1
  fi

  local udid27 udid26 failed
  udid27="$(resolve_device "$runtime27" "$device27")"
  echo "iOS ${runtime27} ${device27} udid=${udid27}"
  failed=0
  install_and_verify "$udid27" "ios27" || failed=1

  udid26="$(resolve_device "$runtime26" "$device26")"
  echo "iOS ${runtime26} ${device26} udid=${udid26}"
  install_and_verify "$udid26" "ios26" || failed=1

  echo "NOT RUN: universal links. app.json has no associatedDomains; S5 is the structural user-activity wiring."
  if [[ "$failed" -ne 0 ]]; then
    echo "FAIL simulator: iOS ${runtime27} or iOS ${runtime26} did not pass" >&2
    exit 1
  fi
  echo "PASS simulator: iOS ${runtime27} and iOS ${runtime26} cold start + custom-scheme deep links"
}

# Sourced by the Linux cold-launch driver. Executing the file still runs a mode.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  return 0
fi

mode="${1:-structural}"
case "$mode" in
  structural) structural ;;
  built-plist) built_plist "${2:-}" || exit 1 ;;
  simulator) simulator ;;
  judge-prebuilt)
    if [[ -z "${2:-}" || -z "${3:-}" ]]; then
      echo "judge-prebuilt needs a pod log and an artifacts directory" >&2
      exit 1
    fi
    bun "$SCRIPT_DIR/scene-launch-evidence.js" judge-prebuilt "$2" "$3"
    ;;
  judge-cold)
    if [[ -z "${9:-}" ]]; then
      echo "judge-cold needs label, launch status, launch output, alive, seconds, runtime log, before list, and after list" >&2
      exit 1
    fi
    bun "$SCRIPT_DIR/scene-launch-evidence.js" judge-cold "$2" "$3" "$4" "$5" "$6" "$7" "$8" "$9"
    ;;
  list-ips)
    shift
    if [[ "$#" -lt 1 ]]; then
      echo "list-ips needs at least one directory" >&2
      exit 1
    fi
    bun "$SCRIPT_DIR/scene-launch-evidence.js" list-ips "$@"
    ;;
  parse-launch-pid)
    if [[ -z "${2:-}" || ! -f "$2" ]]; then
      echo "parse-launch-pid needs a launch output file" >&2
      exit 1
    fi
    parse_launch_pid "$(cat "$2")"
    ;;
  -h|--help|help) usage ;;
  *)
    usage >&2
    exit 1
    ;;
esac
