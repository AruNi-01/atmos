#!/usr/bin/env bash
set -euo pipefail

REPO="${ATMOS_GITHUB_REPO:-AruNi-01/atmos}"
INSTALL_ROOT="${ATMOS_INSTALL_DIR:-$HOME/.atmos}"
VERSION="${ATMOS_VERSION:-latest}"
PORT="${ATMOS_PORT:-30303}"
ARCHIVE_PATH=""
NO_START=0
NO_OPEN=0
USE_GITHUB_SOURCE=0

# Default to custom domain, fallback to GitHub
DOWNLOAD_BASE="${ATMOS_DOWNLOAD_BASE_URL:-https://install.atmos.land}"

usage() {
  cat <<'EOF'
Usage: install-local-web-runtime.sh [options]

Options:
  --version <tag>        Install a specific release tag instead of latest
  --archive <path>       Install from a prebuilt local runtime archive
  --install-dir <path>   Override install root (default: ~/.atmos)
  --port <port>          Port used when auto-starting the local runtime
  --no-start             Install only, do not launch the local runtime
  --no-open              Install/start but do not open the browser
  --github-source        Use GitHub Releases instead of custom domain
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
    --install-dir)
      require_value "$1" "${2-}"
      INSTALL_ROOT="$2"
      shift 2
      ;;
    --port)
      require_value "$1" "${2-}"
      PORT="$2"
      shift 2
      ;;
    --no-start)
      NO_START=1
      shift
      ;;
    --no-open)
      NO_OPEN=1
      shift
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
    Darwin:arm64|Darwin:aarch64) echo "aarch64-apple-darwin" ;;
    Darwin:x86_64) echo "x86_64-apple-darwin" ;;
    Linux:x86_64) echo "x86_64-unknown-linux-gnu" ;;
    Linux:arm64|Linux:aarch64)
      echo "Unsupported platform: Linux ${arch} (no local runtime release asset is published yet)" >&2
      exit 1
      ;;
    *)
      echo "Unsupported platform: ${os} ${arch}" >&2
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
    echo "${DOWNLOAD_BASE}/local-web-runtime/${resolved_version}/${asset}"
  fi
}

download_with_fallback() {
  local asset="$1"
  local version="$2"
  local custom_url="${DOWNLOAD_BASE}/local-web-runtime/${version}/${asset}"
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

download_latest_with_fallback() {
  local asset="$1"
  local latest_url="${DOWNLOAD_BASE}/local-web-runtime/latest/${asset}"

  echo "Trying to download from custom domain latest path: ${latest_url}"
  if curl -fsSL "$latest_url" -o "$ARCHIVE_FILE"; then
    echo "Successfully downloaded from latest path"
    return 0
  fi

  echo "Latest path not available, falling back to GitHub API to resolve version..."
  RESOLVED_VERSION="$(resolve_release_tag)"
  if [[ -z "$RESOLVED_VERSION" ]]; then
    echo "Unable to resolve a local runtime release tag from GitHub releases." >&2
    exit 1
  fi

  download_with_fallback "$asset" "$RESOLVED_VERSION"
}

ensure_path_hint() {
  local bin_dir="$1"
  local default_bin="$HOME/.atmos/bin"
  if [[ "$bin_dir" != "$default_bin" ]]; then
    echo "PATH not modified automatically for custom install dir: ${bin_dir}"
    return 0
  fi

  if [[ ":$PATH:" == *":${bin_dir}:"* ]]; then
    return 0
  fi

  local profile=""
  if [[ -n "${ZDOTDIR:-}" && -f "${ZDOTDIR}/.zshrc" ]]; then
    profile="${ZDOTDIR}/.zshrc"
  elif [[ -f "$HOME/.zshrc" ]]; then
    profile="$HOME/.zshrc"
  elif [[ -f "$HOME/.bashrc" ]]; then
    profile="$HOME/.bashrc"
  elif [[ -f "$HOME/.bash_profile" ]]; then
    profile="$HOME/.bash_profile"
  else
    profile="$HOME/.profile"
  fi

  local snippet='export PATH="$HOME/.atmos/bin:$PATH"'
  if [[ -f "$profile" ]] && grep -Fq "$snippet" "$profile"; then
    return 0
  fi

  {
    echo
    echo '# Atmos local runtime'
    echo "$snippet"
  } >> "$profile"
  echo "Updated PATH in ${profile}"
}

open_browser() {
  local url="$1"
  if [[ "$NO_OPEN" -eq 1 ]]; then
    return 0
  fi

  if command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 || true
  fi
}

parse_runtime_url() {
  python3 -c '
import json
import sys

payload = json.load(sys.stdin)
status = payload.get("status") if isinstance(payload, dict) else None
if isinstance(status, dict) and status.get("url"):
    print(status["url"])
'
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
    if tag.startswith("local-web-runtime-v"):
        print(tag)
        break
' | head -n 1
}

TARGET="$(detect_target)"
ASSET="atmos-local-runtime-${TARGET}.tar.gz"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

ARCHIVE_FILE="${TMP_DIR}/${ASSET}"
if [[ -n "$ARCHIVE_PATH" ]]; then
  cp "$ARCHIVE_PATH" "$ARCHIVE_FILE"
else
  if [[ "$VERSION" == "latest" ]]; then
    download_latest_with_fallback "$ASSET"
    RESOLVED_VERSION="latest"
  else
    RESOLVED_VERSION="$VERSION"
    download_with_fallback "$ASSET" "$RESOLVED_VERSION"
  fi
fi

mkdir -p "${INSTALL_ROOT}/runtime"
tar -xzf "$ARCHIVE_FILE" -C "$TMP_DIR"

STAGED_RUNTIME="${TMP_DIR}/atmos-runtime"
if [[ ! -d "$STAGED_RUNTIME" ]]; then
  ALT_STAGE="$(find "$TMP_DIR" -maxdepth 3 -type d -name atmos-runtime | head -n 1)"
  if [[ -z "$ALT_STAGE" ]]; then
    echo "Unable to locate extracted atmos-runtime directory" >&2
    exit 1
  fi
  STAGED_RUNTIME="$ALT_STAGE"
fi

rm -rf "${INSTALL_ROOT}/runtime/current.tmp"
cp -R "$STAGED_RUNTIME" "${INSTALL_ROOT}/runtime/current.tmp"
rm -rf "${INSTALL_ROOT}/runtime/current"
mv "${INSTALL_ROOT}/runtime/current.tmp" "${INSTALL_ROOT}/runtime/current"

mkdir -p "${INSTALL_ROOT}/bin"
cp "${INSTALL_ROOT}/runtime/current/bin/atmos" "${INSTALL_ROOT}/bin/atmos"
chmod +x "${INSTALL_ROOT}/bin/atmos" "${INSTALL_ROOT}/runtime/current/bin/api" "${INSTALL_ROOT}/runtime/current/bin/atmos"
ensure_path_hint "${INSTALL_ROOT}/bin"

echo "Installed Atmos local runtime to ${INSTALL_ROOT}/runtime/current"

if [[ "$NO_START" -eq 0 ]]; then
  START_OUTPUT="$("${INSTALL_ROOT}/bin/atmos" local start --force-restart --port "$PORT")"
  printf '%s\n' "$START_OUTPUT"
  ACTUAL_URL="$(printf '%s' "$START_OUTPUT" | parse_runtime_url)"
  if [[ -z "$ACTUAL_URL" ]]; then
    ACTUAL_URL="http://127.0.0.1:${PORT}"
  fi
  open_browser "$ACTUAL_URL"
fi

echo
echo "Atmos CLI: ${INSTALL_ROOT}/bin/atmos"
echo "Installed release: ${RESOLVED_VERSION}"
if [[ "${ACTUAL_URL:-}" != "" ]]; then
  echo "Local app URL: ${ACTUAL_URL}"
else
  echo "Local app URL: http://127.0.0.1:${PORT}"
fi
echo "Start later with: ${INSTALL_ROOT}/bin/atmos local start"
echo "Stop with: ${INSTALL_ROOT}/bin/atmos local stop"
