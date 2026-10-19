#!/usr/bin/env bash
# QUALITY-010. Structural checks run on Linux after prebuild.
# Simulator checks need a Mac with the iOS 27.0 and iOS 26.5 runtimes.
# `simulator` exits 2 when xcrun is missing and prints NOT RUN. It does not
# claim a launch that did not happen.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
IOS_DIR="$MOBILE_DIR/ios"
BUNDLE_ID="land.atmos.mobile"
URL_LOG="AtmosSceneLifecycle delivered URL to RCTLinkingManager"
ACTIVITY_LOG="AtmosSceneLifecycle delivered userActivity to RCTLinkingManager"
RUNTIME_ISSUE="UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption"

usage() {
  cat <<'EOF'
Usage:
  verify-ios-scene-lifecycle.sh structural
  verify-ios-scene-lifecycle.sh built-plist <Info.plist>
  verify-ios-scene-lifecycle.sh simulator

structural   After expo prebuild. Checks ios/Atmos/Info.plist and AppDelegate.swift.
built-plist  Checks a built Atmos.app Info.plist expands to Atmos.SceneDelegate.
simulator    Release-builds and cold-starts iOS 27.0 and iOS 26.5. Mac only.

Environment for simulator:
  ATMOS_IOS27_DEVICE   default: iPhone 18 Pro
  ATMOS_IOS27_RUNTIME  default: 27.0
  ATMOS_IOS26_DEVICE   default: iPhone 17 Pro
  ATMOS_IOS26_RUNTIME  default: 26.5
EOF
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
  if ! grep -q 'HomeTabBarClearGlass.install()' <<<"$launch"; then
    echo "clear tab bar install was dropped from didFinishLaunchingWithOptions" >&2
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

structural() {
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
    exit 1
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
  xcrun simctl bootstatus "$udid" -b
}

log_since() {
  local udid="$1"
  local start="$2"
  xcrun simctl spawn "$udid" log show --start "$start" --style compact --predicate 'processImagePath CONTAINS "Atmos" OR composedMessage CONTAINS "AtmosSceneLifecycle" OR eventMessage CONTAINS "AtmosSceneLifecycle" OR composedMessage CONTAINS "UIApplicationEvaluateRuntimeIssue" OR eventMessage CONTAINS "UIApplicationEvaluateRuntimeIssue"' || true
}

assert_cold_launch() {
  local udid="$1"
  local label="$2"
  xcrun simctl terminate "$udid" "$BUNDLE_ID" || true
  local start out status
  start="$(date '+%Y-%m-%d %H:%M:%S')"
  set +e
  out="$(xcrun simctl launch "$udid" "$BUNDLE_ID" 2>&1)"
  status=$?
  set -e
  printf '%s\n' "$out"
  sleep 4
  local logs
  logs="$(log_since "$udid" "$start")"
  if [[ "$status" -ne 0 ]] || grep -q 'EXC_BREAKPOINT\|Terminated' <<<"$out"; then
    echo "FAIL ${label}: cold launch did not stay up" >&2
    printf '%s\n' "$logs" >&2
    exit 1
  fi
  if grep -q "$RUNTIME_ISSUE" <<<"$logs"; then
    echo "FAIL ${label}: UIKit reported no scene lifecycle" >&2
    printf '%s\n' "$logs" >&2
    exit 1
  fi
  if grep -q 'EXC_BREAKPOINT' <<<"$logs"; then
    echo "FAIL ${label}: EXC_BREAKPOINT in Atmos logs" >&2
    printf '%s\n' "$logs" >&2
    exit 1
  fi
  echo "PASS ${label}: cold launch"
}

assert_deep_links() {
  local udid="$1"
  xcrun simctl terminate "$udid" "$BUNDLE_ID" || true
  sleep 1
  local start
  start="$(date '+%Y-%m-%d %H:%M:%S')"
  xcrun simctl openurl "$udid" "atmos://scene-lifecycle-probe"
  sleep 4
  xcrun simctl openurl "$udid" "atmos://scene-lifecycle-probe-warm"
  sleep 3
  local logs count
  logs="$(log_since "$udid" "$start")"
  count="$(grep -c -F "$URL_LOG" <<<"$logs" || true)"
  if [[ "$count" -lt 2 ]]; then
    echo "FAIL deep link: expected two '$URL_LOG' lines, found ${count}" >&2
    printf '%s\n' "$logs" >&2
    exit 1
  fi
  echo "PASS deep link: cold and warm URL reached RCTLinkingManager (${count} log lines)"
  echo "The fixed NSLog does not include the URL. The system log may still mention it."
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
    build >&2
  local app="$derived/Build/Products/Release-iphonesimulator/Atmos.app"
  if [[ ! -d "$app" ]]; then
    echo "Release app not found at $app" >&2
    exit 1
  fi
  built_plist "$app/Info.plist" >&2
  printf '%s\n' "$app"
}

install_and_verify() {
  local udid="$1"
  local label="$2"
  local check_links="$3"
  local app
  app="$(build_release "$udid" "$label")"
  boot_device "$udid"
  xcrun simctl install "$udid" "$app"
  assert_cold_launch "$udid" "$label"
  if [[ "$check_links" == "yes" ]]; then
    assert_deep_links "$udid"
  fi
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
  (cd "$IOS_DIR" && pod install)

  local udid27 udid26
  udid27="$(resolve_device "$runtime27" "$device27")"
  echo "iOS ${runtime27} ${device27} udid=${udid27}"
  install_and_verify "$udid27" "ios27" yes

  udid26="$(resolve_device "$runtime26" "$device26")"
  echo "iOS ${runtime26} ${device26} udid=${udid26}"
  install_and_verify "$udid26" "ios26" yes

  echo "NOT RUN: universal links. app.json has no associatedDomains; S5 is the structural user-activity wiring."
  echo "PASS simulator: iOS ${runtime27} and iOS ${runtime26} cold start + custom-scheme deep links"
}

mode="${1:-structural}"
case "$mode" in
  structural) structural ;;
  built-plist) built_plist "${2:-}" ;;
  simulator) simulator ;;
  -h|--help|help) usage ;;
  *)
    usage >&2
    exit 1
    ;;
esac
