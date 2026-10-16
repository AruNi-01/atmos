#!/usr/bin/env bash
# Build the Release (no Metro) land.atmos.mobile app for one iOS simulator and,
# unless ATMOS_E2E_NO_INSTALL=1, install it there. Run from anywhere:
#   just mobile-e2e-build
#   ATMOS_E2E_NO_INSTALL=1 just mobile-e2e-build   # build only; leave the simulator alone
# Never boots, erases or shuts down a simulator. The install replaces the app
# (not its simulator) for that UDID, so pick a simulator nobody else is using.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT"

UDID="$(node apps/mobile/e2e/scripts/resolve-device.mjs)"
IOS_DIR="apps/mobile/ios"
DERIVED="$IOS_DIR/DerivedData-Sim-Release"
APP="$DERIVED/Build/Products/Release-iphonesimulator/Atmos.app"

export SDKROOT="$(xcrun --sdk macosx --show-sdk-path)"
unset EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_DEVICE EXPO_PUBLIC_ATMOS_MOBILE_DEV_DEVICE_SETTINGS_URL

echo "[mobile-e2e] simulator ${UDID}"
just mobile-ios-prepare

# RN 0.85 swaps Debug/Release prebuilt cores in place; restore Debug afterwards
# so the daily Debug build keeps a Debug resting tree (same as mobile-ios-release).
restore_debug_rncore() { node apps/mobile/script/ensure-ios-rncore-configuration.js Debug || true; }
trap restore_debug_rncore EXIT
node apps/mobile/script/ensure-ios-rncore-configuration.js Release

xcodebuild \
  -workspace "$IOS_DIR/Atmos.xcworkspace" \
  -scheme Atmos \
  -configuration Release \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=${UDID}" \
  -derivedDataPath "$DERIVED" \
  build

[[ -d "$APP" ]] || { echo "[mobile-e2e] missing build product: $APP" >&2; exit 1; }
echo "[mobile-e2e] built $APP"

if [[ "${ATMOS_E2E_NO_INSTALL:-0}" == "1" ]]; then
  echo "[mobile-e2e] ATMOS_E2E_NO_INSTALL=1: skipping install. Later: just mobile-e2e-install"
  exit 0
fi
xcrun simctl install "$UDID" "$APP"
echo "[mobile-e2e] installed land.atmos.mobile on ${UDID}"
