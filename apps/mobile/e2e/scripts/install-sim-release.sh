#!/usr/bin/env bash
# Install the app built by build-sim-release.sh onto the e2e simulator.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT"
UDID="$(node apps/mobile/e2e/scripts/resolve-device.mjs)"
APP="apps/mobile/ios/DerivedData-Sim-Release/Build/Products/Release-iphonesimulator/Atmos.app"
[[ -d "$APP" ]] || { echo "No build at $APP. Run: just mobile-e2e-build" >&2; exit 1; }
xcrun simctl install "$UDID" "$APP"
echo "[mobile-e2e] installed land.atmos.mobile on ${UDID}"
