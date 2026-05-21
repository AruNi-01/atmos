#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

TARGET_TRIPLE="${TARGET_TRIPLE:-$(rustc -vV | awk '/^host:/ { print $2 }')}"
BIN_EXT=""
if [[ "$TARGET_TRIPLE" == *"windows"* ]]; then
  BIN_EXT=".exe"
fi

cargo build --release --bin api --target "$TARGET_TRIPLE"
cargo build --release --bin atmos --target "$TARGET_TRIPLE"

mkdir -p apps/desktop/src-tauri/binaries
cp "target/$TARGET_TRIPLE/release/api$BIN_EXT" \
  "apps/desktop/src-tauri/binaries/atmos-sidecar-$TARGET_TRIPLE$BIN_EXT"

echo "✅ Prepared sidecar: apps/desktop/src-tauri/binaries/atmos-sidecar-$TARGET_TRIPLE$BIN_EXT"

# Always build + bundle the latest web static export (no Next dev / hot reload).
# Set ATMOS_DESKTOP_SKIP_WEB_BUILD=1 to reuse an existing apps/web/out.
node "$ROOT_DIR/scripts/desktop/build-web-static.mjs" "$ROOT_DIR"

node "$ROOT_DIR/scripts/desktop/layout-runtime-bundle.mjs" "$ROOT_DIR" "$TARGET_TRIPLE" "$BIN_EXT"
