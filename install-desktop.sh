#!/usr/bin/env bash
set -euo pipefail

REPO="${ATMOS_GITHUB_REPO:-AruNi-01/atmos}"
VERSION="${ATMOS_VERSION:-latest}"
ARCHIVE_PATH=""

usage() {
  cat <<'EOF'
Usage: install-desktop.sh [options]

Options:
  --version <tag>        Install a specific release tag instead of latest
  --archive <path>       Install from a prebuilt local .app.tar.gz archive
  -h, --help             Show this help
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
    Darwin:arm64|Darwin:aarch64) echo "aarch64" ;;
    Darwin:x86_64) echo "x64" ;;
    *)
      echo "Unsupported platform: ${os} ${arch} (desktop app is macOS only)" >&2
      exit 1
      ;;
  esac
}

download_url() {
  local asset="$1"
  local resolved_version="$2"
  echo "https://github.com/${REPO}/releases/download/${resolved_version}/${asset}"
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
ASSET="Atmos_${TARGET}.app.tar.gz"
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
  URL="$(download_url "$ASSET" "$RESOLVED_VERSION")"
  echo "Downloading ${URL}"
  curl -fsSL "$URL" -o "$ARCHIVE_FILE"
fi

echo "Extracting to /Applications..."
tar -xzf "$ARCHIVE_FILE" -C /Applications

echo "Installed Atmos Desktop app to /Applications"
echo "Installed release: ${RESOLVED_VERSION}"
echo "Launch with: open /Applications/Atmos.app"
