#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

TARGET_TRIPLE=""
NO_BUNDLE="false"
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET_TRIPLE="${2:-}"
      shift 2
      ;;
    --target=*)
      TARGET_TRIPLE="${1#*=}"
      shift
      ;;
    --no-bundle)
      NO_BUNDLE="true"
      shift
      ;;
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ -z "$TARGET_TRIPLE" ]]; then
  ARCH="$(uname -m)"
  case "$ARCH" in
    arm64) TARGET_TRIPLE="aarch64-apple-darwin" ;;
    x86_64) TARGET_TRIPLE="x86_64-apple-darwin" ;;
    *)
      echo "❌ Unsupported macOS arch: $ARCH"
      echo "💡 Please specify --target explicitly."
      exit 1
      ;;
  esac
fi

echo "🚀 Building desktop app locally"
echo "📦 Target: $TARGET_TRIPLE"
echo "🧰 Bundle: $([[ "$NO_BUNDLE" == "true" ]] && echo "disabled" || echo "enabled")"

TARGET_TRIPLE="$TARGET_TRIPLE" bash "$ROOT_DIR/scripts/desktop/prepare-sidecar.sh"

BUILD_CMD=(bun tauri build --target "$TARGET_TRIPLE")
if [[ "$NO_BUNDLE" == "true" ]]; then
  BUILD_CMD+=(--no-bundle)
fi

if ((${#EXTRA_ARGS[@]} > 0)); then
  BUILD_CMD+=("${EXTRA_ARGS[@]}")
fi

echo "▶️ Running: ${BUILD_CMD[*]}"
(
  cd apps/desktop
  "${BUILD_CMD[@]}"
)

echo "✅ Done"
echo "📁 App bundle: target/${TARGET_TRIPLE}/release/bundle/macos/Atmos.app"
echo "📦 DMG installer: target/${TARGET_TRIPLE}/release/bundle/dmg/Atmos_0.1.0_${TARGET_TRIPLE%%-*}.dmg"
