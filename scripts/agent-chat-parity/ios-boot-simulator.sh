#!/usr/bin/env bash
# Select Xcode 26.5, force the software framebuffer, and boot iPhone 17 Pro
# on iOS 26.5. Capture shards call this; ios-build does not.
# Usage: ios-boot-simulator.sh [all|setup|boot]
#   setup — xcode-select, framebuffer hint, keyboard default. Kill the
#           simulator service here, before any xcodebuild.
#   boot  — create/boot iPhone 17 Pro and pin the status bar.
#   all   — setup then boot (default, local / stills).
set -euo pipefail

MODE="${1:-all}"

setup_xcode() {
  sudo xcode-select -s /Applications/Xcode_26.5.app
  # simctl screenshots stay black unless the simulator service starts
  # with the software framebuffer. The service is already running on
  # the runner image, so write the default and restart it before boot.
  defaults write com.apple.CoreSimulator.IndigoFramebufferServices FramebufferRendererHint -integer 3
  killall -9 com.apple.CoreSimulator.CoreSimulatorService || true
  sleep 2
  echo "xcode-select: $(xcode-select -p)"
  xcodebuild -version
  echo "----- xcrun simctl list -----"
  xcrun simctl list
  # A connected hardware keyboard hides the software keyboard, so a
  # composer tap cannot show it. Write this before the simulator boots.
  defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool false
}

boot_iphone() {
  if ! parsed="$(python3 - << 'PY'
import json, subprocess, sys

def run(args):
    return subprocess.check_output(args, text=True)

devices = json.loads(run(["xcrun", "simctl", "list", "devices", "available", "-j"]))
runtimes = json.loads(run(["xcrun", "simctl", "list", "runtimes", "-j"]))
runtime_id = ""
for runtime in runtimes.get("runtimes", []):
    version = str(runtime.get("version", ""))
    name = str(runtime.get("name", ""))
    identifier = str(runtime.get("identifier", ""))
    if runtime.get("isAvailable") and (
        version == "26.5" or name == "iOS 26.5" or identifier.endswith("iOS-26-5")
    ):
        runtime_id = identifier
        break
if not runtime_id:
    print("iOS 26.5 simulator runtime is not installed", file=sys.stderr)
    sys.exit(2)

bucket = devices.get("devices", {})
runtime_devices = bucket.get(runtime_id, [])
if not runtime_devices:
    for key, value in bucket.items():
        if "iOS-26-5" in key:
            runtime_id = key
            runtime_devices = value
            break

udid = ""
for device in runtime_devices:
    if device.get("name") == "iPhone 17 Pro" and device.get("isAvailable", True):
        udid = str(device.get("udid", ""))
        break
print(runtime_id)
print(udid)
PY
)"; then
    echo "Simulator pin failed. Full simctl list follows."
    xcrun simctl list
    exit 1
  fi

  runtime_id="$(printf '%s\n' "$parsed" | sed -n '1p')"
  udid="$(printf '%s\n' "$parsed" | sed -n '2p')"
  echo "runtime: ${runtime_id}"
  if [[ -z "$udid" ]]; then
    echo "Creating iPhone 17 Pro on ${runtime_id}"
    if ! udid="$(xcrun simctl create "iPhone 17 Pro" "iPhone 17 Pro" "$runtime_id")"; then
      echo "Could not create iPhone 17 Pro. Full simctl list follows."
      xcrun simctl list
      exit 1
    fi
    udid="$(printf '%s' "$udid" | tr -d '[:space:]')"
  fi
  echo "udid: ${udid}"

  boot_status=0
  xcrun simctl boot "$udid" || boot_status=$?
  if [[ "$boot_status" -ne 0 ]]; then
    echo "simctl boot exited ${boot_status}; waiting for bootstatus"
  fi
  if ! xcrun simctl bootstatus "$udid" -b; then
    echo "Simulator did not boot. Full simctl list follows."
    xcrun simctl list
    exit 1
  fi
  xcrun simctl status_bar booted override --time "9:41" --batteryState charged --batteryLevel 100
  echo "booted ${udid}"
}

case "$MODE" in
  setup) setup_xcode ;;
  boot) boot_iphone ;;
  all)
    setup_xcode
    boot_iphone
    ;;
  *)
    echo "usage: $0 [all|setup|boot]" >&2
    exit 2
    ;;
esac
