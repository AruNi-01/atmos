#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

TARGET_TRIPLE="${TARGET_TRIPLE:-$(rustc -vV | rg '^host:' | awk '{print $2}')}"
BIN_EXT=""
if [[ "$TARGET_TRIPLE" == *"windows"* ]]; then
  BIN_EXT=".exe"
fi

cargo build --release --bin api --target "$TARGET_TRIPLE"

mkdir -p apps/desktop/src-tauri/binaries
cp "target/$TARGET_TRIPLE/release/api$BIN_EXT" \
  "apps/desktop/src-tauri/binaries/api-$TARGET_TRIPLE$BIN_EXT"

echo "Prepared sidecar: apps/desktop/src-tauri/binaries/api-$TARGET_TRIPLE$BIN_EXT"

# Copy Next.js static export so the sidecar can serve it directly.
# This lets the desktop webview load from http://127.0.0.1:{port} (pure HTTP),
# avoiding macOS WKWebView mixed-content blocking (tauri:// → http://).
WEB_OUT="$ROOT_DIR/apps/web/out"
SIDECAR_WEBOUT="$ROOT_DIR/apps/desktop/src-tauri/binaries/web-out"

if [ -d "$WEB_OUT" ]; then
  rm -rf "$SIDECAR_WEBOUT"
  cp -r "$WEB_OUT" "$SIDECAR_WEBOUT"
  echo "Copied web static export to: $SIDECAR_WEBOUT"
else
  echo "Warning: $WEB_OUT not found, skipping web static copy"
fi
