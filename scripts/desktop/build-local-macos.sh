#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/apps/desktop"
TAURI_DIR="$DESKTOP_DIR/src-tauri"
cd "$ROOT_DIR"

TARGET_TRIPLE=""
NO_BUNDLE="false"
AD_HOC_SIGN_MODE="auto"
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
    --ad-hoc-sign)
      AD_HOC_SIGN_MODE="force"
      shift
      ;;
    --no-ad-hoc-sign)
      AD_HOC_SIGN_MODE="off"
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

# Check available disk space
AVAILABLE_GB=$(df /System/Volumes/Data 2>/dev/null | awk 'NR==2 {printf "%.0f", $4/1024/1024}')
echo "💾 Available disk space: ${AVAILABLE_GB}GB"

MINIMUM_DISK_GB=15
if (( $(echo "$AVAILABLE_GB < $MINIMUM_DISK_GB" | bc -l 2>/dev/null || echo "0") )); then
  echo "❌ Insufficient disk space: ${AVAILABLE_GB}GB available"
  echo "   Required: ${MINIMUM_DISK_GB}GB minimum for successful DMG creation"
  echo ""
  echo "💡 Please free up disk space before building:"
  echo "   - cargo clean"
  echo "   - rm -rf apps/desktop/src-tauri/target"
  echo "   - bun pm cache rm"
  echo "   - npm cache clean --force"
  echo ""
  echo "   Or use --no-bundle to skip DMG creation"
  exit 1
fi

echo "🚀 Building desktop app locally"
echo "📦 Target: $TARGET_TRIPLE"
echo "🧰 Bundle: $([[ "$NO_BUNDLE" == "true" ]] && echo "disabled" || echo "enabled")"

SIGNING_MODE="unsigned"
if [[ -n "${APPLE_SIGNING_IDENTITY:-}" || -n "${APPLE_CERTIFICATE:-}" ]]; then
  SIGNING_MODE="configured"
elif [[ "$AD_HOC_SIGN_MODE" != "off" ]]; then
  export APPLE_SIGNING_IDENTITY="-"
  SIGNING_MODE="ad-hoc"
fi

NOTARIZATION_MODE="disabled"
if [[ -n "${APPLE_API_KEY:-}" || -n "${APPLE_ID:-}" ]]; then
  NOTARIZATION_MODE="configured"
fi

echo "🔐 Signing: $SIGNING_MODE"
echo "🛡️ Notarization: $NOTARIZATION_MODE"

if [[ "$SIGNING_MODE" == "ad-hoc" ]]; then
  echo "⚠️ Using ad-hoc signing only."
  echo "   This is suitable for local testing and limited sharing, but recipients may still need"
  echo "   to allow the app in Privacy & Security because the app is not notarized."
fi

if [[ "$SIGNING_MODE" == "unsigned" ]]; then
  echo "⚠️ No signing configured."
  echo "   Apps shared to other Macs may show as damaged or blocked by Gatekeeper."
fi

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
  cd "$DESKTOP_DIR"
  ATMOS_LOG_LEVEL="${ATMOS_LOG_LEVEL:-info}" "${BUILD_CMD[@]}"
)

APP_BUNDLE="$(find "$TAURI_DIR/target" -path "*/${TARGET_TRIPLE}/release/bundle/macos/Atmos.app" -print -quit 2>/dev/null || true)"
if [[ -z "$APP_BUNDLE" ]]; then
  APP_BUNDLE="$(find "$TAURI_DIR/target" -path "*/bundle/macos/Atmos.app" -print -quit 2>/dev/null || true)"
fi

DMG_INSTALLER="$(find "$TAURI_DIR/target" -path "*/${TARGET_TRIPLE}/release/bundle/dmg/*.dmg" -print -quit 2>/dev/null || true)"
if [[ -z "$DMG_INSTALLER" ]]; then
  DMG_INSTALLER="$(find "$TAURI_DIR/target" -path "*/bundle/dmg/*.dmg" -print -quit 2>/dev/null || true)"
fi

ZIP_ARCHIVE=""
if [[ -n "$APP_BUNDLE" ]]; then
  ZIP_ARCHIVE="$(dirname "$APP_BUNDLE")/Atmos_${TARGET_TRIPLE%%-*}.zip"
  rm -f "$ZIP_ARCHIVE"
  ditto -c -k --sequesterRsrc --keepParent "$APP_BUNDLE" "$ZIP_ARCHIVE"
fi

echo "✅ Done"
if [[ -n "$APP_BUNDLE" ]]; then
  echo "📁 App bundle: $APP_BUNDLE"
fi
if [[ -n "$DMG_INSTALLER" ]]; then
  echo "📦 DMG installer: $DMG_INSTALLER"
fi
if [[ -n "$ZIP_ARCHIVE" ]]; then
  echo "🗜️ Shareable zip: $ZIP_ARCHIVE"
fi

if [[ -n "$APP_BUNDLE" ]]; then
  if codesign --verify --deep --strict "$APP_BUNDLE" >/dev/null 2>&1; then
    echo "✅ codesign verification passed"
  else
    echo "⚠️ codesign verification failed"
  fi

  SPCTL_LOG="$(mktemp "${TMPDIR:-/tmp}/atmos-spctl.XXXXXX")"
  if spctl -a -vv "$APP_BUNDLE" >"$SPCTL_LOG" 2>&1; then
    echo "✅ Gatekeeper assessment passed"
  else
    echo "⚠️ Gatekeeper assessment did not pass"
    sed -n '1,4p' "$SPCTL_LOG"
  fi
  rm -f "$SPCTL_LOG"
fi

if [[ "$NOTARIZATION_MODE" == "disabled" ]]; then
  echo "ℹ️ For frictionless distribution to other Macs, provide Apple signing + notarization"
  echo "   credentials (for example APPLE_SIGNING_IDENTITY + APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID"
  echo "   or the App Store Connect API key variables supported by Tauri)."
fi
