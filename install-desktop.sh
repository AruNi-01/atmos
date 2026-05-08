#!/usr/bin/env bash
set -euo pipefail

REPO="${ATMOS_GITHUB_REPO:-AruNi-01/atmos}"
VERSION="${ATMOS_VERSION:-latest}"
ARCHIVE_PATH=""
USE_GITHUB_SOURCE=0

# Default to custom domain, fallback to GitHub
DOWNLOAD_BASE="${ATMOS_DOWNLOAD_BASE_URL:-https://install.atmos.land}"

usage() {
  cat <<'EOF'
Usage: install-desktop.sh [options]

Options:
  --version <tag>        Install a specific release tag instead of latest
  --archive <path>       Install from a prebuilt local archive
  --github-source        Use GitHub Releases instead of custom domain
  -h, --help             Show this help

Supported platforms:
  - macOS (Intel & Apple Silicon): .app.tar.gz → /Applications
  - Linux (x64): .AppImage → ~/.local/bin/
  - Windows (x64): .exe installer → silent install
EOF
}

require_value() {
  local flag="$1"
  local value="${2-}"
  if [[ -z "$value" || "$value" == --* ]]; then
    echo "Missing value for ${flag}" >&2
    usage >&2
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      require_value "$1" "${2-}"
      VERSION="$2"
      shift 2
      ;;
    --archive)
      require_value "$1" "${2-}"
      ARCHIVE_PATH="$2"
      shift 2
      ;;
    --github-source)
      USE_GITHUB_SOURCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

detect_target() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "${os}:${arch}" in
    Darwin:arm64|Darwin:aarch64) echo "macos-aarch64" ;;
    Darwin:x86_64) echo "macos-x64" ;;
    Linux:x86_64) echo "linux-x64" ;;
    Linux:arm64|Linux:aarch64) echo "linux-arm64" ;;
    MINGW*|MSYS*|CYGWIN*:x86_64) echo "windows-x64" ;;
    *)
      echo "Unsupported platform: ${os} ${arch}" >&2
      exit 1
      ;;
  esac
}

get_asset_name() {
  local target="$1"
  case "$target" in
    macos-aarch64) echo "Atmos_aarch64.app.tar.gz" ;;
    macos-x64) echo "Atmos_x64.app.tar.gz" ;;
    linux-x64) echo "Atmos_amd64.AppImage" ;;
    linux-arm64)
      echo "Unsupported: Linux ARM64 desktop app not available yet" >&2
      exit 1
      ;;
    windows-x64) echo "Atmos_x64-setup.exe" ;;
    *)
      echo "Unknown target: $target" >&2
      exit 1
      ;;
  esac
}

install_asset() {
  local target="$1"
  local asset_file="$2"

  case "$target" in
    macos-*)
      echo "Extracting to /Applications..."
      tar -xzf "$asset_file" -C /Applications
      echo "Installed Atmos Desktop app to /Applications"
      echo "Launch with: open /Applications/Atmos.app"
      ;;
    linux-x64)
      echo "Installing AppImage..."
      chmod +x "$asset_file"
      mv "$asset_file" "$HOME/.local/bin/atmos-desktop.AppImage"
      mkdir -p "$HOME/.local/bin"
      echo "Installed Atmos Desktop AppImage to $HOME/.local/bin/atmos-desktop.AppImage"
      echo "Launch with: $HOME/.local/bin/atmos-desktop.AppImage"
      ;;
    windows-x64)
      echo "Running Windows installer..."
      # Windows: just run the installer
      if command -v cmd.exe >/dev/null 2>&1; then
        cmd.exe //c "$asset_file" //silent
      else
        "$asset_file" //silent
      fi
      echo "Atmos Desktop installer completed"
      ;;
    *)
      echo "Unsupported installation method for target: $target" >&2
      exit 1
      ;;
  esac
}

download_url() {
  local asset="$1"
  local resolved_version="$2"

  if [[ "$USE_GITHUB_SOURCE" -eq 1 ]]; then
    echo "https://github.com/${REPO}/releases/download/${resolved_version}/${asset}"
  else
    echo "${DOWNLOAD_BASE}/desktop/${resolved_version}/${asset}"
  fi
}

download_with_fallback() {
  local asset="$1"
  local version="$2"
  local custom_url="${DOWNLOAD_BASE}/desktop/${version}/${asset}"
  local github_url="https://github.com/${REPO}/releases/download/${version}/${asset}"

  if [[ "$USE_GITHUB_SOURCE" -eq 1 ]]; then
    echo "Downloading from GitHub: ${github_url}"
    curl -fsSL "$github_url" -o "$ARCHIVE_FILE"
    return 0
  fi

  echo "Downloading from custom domain: ${custom_url}"
  if curl -fsSL "$custom_url" -o "$ARCHIVE_FILE"; then
    return 0
  fi

  echo "Failed to download from custom domain, trying GitHub as fallback..."
  echo "Downloading from GitHub: ${github_url}"
  curl -fsSL "$github_url" -o "$ARCHIVE_FILE"
}

resolve_release_tag() {
  if [[ "$VERSION" != "latest" ]]; then
    echo "$VERSION"
    return 0
  fi

  curl -fsSL "https://api.github.com/repos/${REPO}/releases?per_page=100" | python3 -c '
import json
import sys

releases = json.load(sys.stdin)
for release in releases:
  tag = str(release.get("tag_name") or "")
  if release.get("draft"):
    continue
  if release.get("prerelease"):
    continue
  if tag.startswith("desktop-v"):
    print(tag)
    break
' | head -n 1
}

TARGET="$(detect_target)"
ASSET="$(get_asset_name "$TARGET")"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

RESOLVED_VERSION="$(resolve_release_tag)"
if [[ -z "$RESOLVED_VERSION" ]]; then
  echo "Unable to resolve a desktop release tag from GitHub releases." >&2
  exit 1
fi

ARCHIVE_FILE="${TMP_DIR}/${ASSET}"
if [[ -n "$ARCHIVE_PATH" ]]; then
  cp "$ARCHIVE_PATH" "$ARCHIVE_FILE"
else
  download_with_fallback "$ASSET" "$RESOLVED_VERSION"
fi

install_asset "$TARGET" "$ARCHIVE_FILE"

echo "Installed release: ${RESOLVED_VERSION}"
