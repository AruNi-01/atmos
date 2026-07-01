#!/usr/bin/env bash
set -euo pipefail

REPO="${ATMOS_GITHUB_REPO:-AruNi-01/atmos}"
INSTALL_ROOT="${ATMOS_INSTALL_DIR:-$HOME/.atmos}"
CLI_BIN_DIR="$HOME/.atmos/bin"
VERSION="${ATMOS_VERSION:-latest}"
PORT="${ATMOS_PORT:-30303}"
ARCHIVE_PATH=""
NO_START=0
NO_OPEN=0
USE_GITHUB_SOURCE=0
REGISTER_TOKEN=""
RELAY_URL=""
RELAY_URL_EXPLICIT=0
RELAY_SECRET_KEY="${ATMOS_RELAY_SECRET_KEY:-}"
DISPLAY_NAME="${ATMOS_COMPUTER_DISPLAY_NAME:-}"
DAEMON=0

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
  --token <token>        Registration code; install, register, and start this Computer
  --relay <url>          Relay URL used with --token (default: https://relay.atmos.land)
  --relay-secret-key <k> Relay secret for private relays
  --display-name <name>  Display name used with --token
  --daemon               Start in background mode when used with --token
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
    --token)
      require_value "$1" "${2-}"
      REGISTER_TOKEN="$2"
      shift 2
      ;;
    --relay)
      require_value "$1" "${2-}"
      RELAY_URL="$2"
      RELAY_URL_EXPLICIT=1
      shift 2
      ;;
    --relay-secret-key)
      require_value "$1" "${2-}"
      RELAY_SECRET_KEY="$2"
      shift 2
      ;;
    --display-name)
      require_value "$1" "${2-}"
      DISPLAY_NAME="$2"
      shift 2
      ;;
    --daemon)
      DAEMON=1
      shift
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

if [[ -n "$REGISTER_TOKEN" && "$NO_START" -eq 1 ]]; then
  echo "--token cannot be combined with --no-start; registration requires starting the local API." >&2
  exit 1
fi

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

curl_to_file() {
  local url="$1"
  local output="$2"
  curl -fsSL --retry 3 --retry-delay 1 --retry-all-errors --connect-timeout 10 "$url" -o "$output"
}

curl_to_stdout() {
  local url="$1"
  curl -fsSL --retry 3 --retry-delay 1 --retry-all-errors --connect-timeout 10 "$url"
}

download_with_fallback() {
  local asset="$1"
  local version="$2"
  local custom_url="${DOWNLOAD_BASE}/local-web-runtime/${version}/${asset}"
  local github_url="https://github.com/${REPO}/releases/download/${version}/${asset}"

  if [[ "$USE_GITHUB_SOURCE" -eq 1 ]]; then
    echo "Downloading from GitHub: ${github_url}"
    curl_to_file "$github_url" "$ARCHIVE_FILE"
    return 0
  fi

  echo "Downloading from custom domain: ${custom_url}"
  if curl_to_file "$custom_url" "$ARCHIVE_FILE"; then
    return 0
  fi

  echo "Failed to download from custom domain, trying GitHub as fallback..."
  echo "Downloading from GitHub: ${github_url}"
  curl_to_file "$github_url" "$ARCHIVE_FILE"
}

download_latest_with_fallback() {
  local asset="$1"
  local latest_path="${DOWNLOAD_BASE}/local-web-runtime/latest/${asset}"
  local latest_url="${latest_path}?v=$(date +%s)"

  if [[ "$USE_GITHUB_SOURCE" -eq 0 ]]; then
    echo "Trying to download from custom domain latest path: ${latest_path}"
    if curl_to_file "$latest_url" "$ARCHIVE_FILE"; then
      echo "Successfully downloaded from latest path"
      RESOLVED_VERSION="latest"
      return 0
    fi
  fi

  echo "Latest path not available, falling back to GitHub API to resolve version..."
  if ! RESOLVED_VERSION="$(resolve_release_tag)" || [[ -z "$RESOLVED_VERSION" ]]; then
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
  awk '
    /"status"[[:space:]]*:/ || /"runtime"[[:space:]]*:/ {
      in_status = 1
    }

    in_status && match($0, /"url"[[:space:]]*:[[:space:]]*"[^"]*"/) {
      value = substr($0, RSTART, RLENGTH)
      sub(/^"url"[[:space:]]*:[[:space:]]*"/, "", value)
      sub(/"$/, "", value)
      print value
      exit 0
    }
  '
}

read_cli_version() {
  local cli_path="$1"
  if [[ ! -x "$cli_path" ]]; then
    return 0
  fi

  "$cli_path" --version 2>/dev/null | awk '{print $NF}' | head -n 1 || true
}

version_ge() {
  local left right length i lpart rpart
  left="${1%%+*}"
  left="${left%%-*}"
  right="${2%%+*}"
  right="${right%%-*}"

  local -a left_parts right_parts
  IFS='.' read -r -a left_parts <<< "$left"
  IFS='.' read -r -a right_parts <<< "$right"
  length="${#left_parts[@]}"
  if (( ${#right_parts[@]} > length )); then
    length="${#right_parts[@]}"
  fi

  for ((i = 0; i < length; i += 1)); do
    lpart="${left_parts[$i]:-0}"
    rpart="${right_parts[$i]:-0}"
    lpart="${lpart%%[^0-9]*}"
    rpart="${rpart%%[^0-9]*}"
    lpart="${lpart:-0}"
    rpart="${rpart:-0}"

    if (( 10#$lpart > 10#$rpart )); then
      return 0
    fi
    if (( 10#$lpart < 10#$rpart )); then
      return 1
    fi
  done

  return 0
}

resolve_cli_manifest_asset() {
  local target="$1"
  local manifest_path="$2"
  local output_path="$3"
  local version tag
  version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest_path" | head -n 1)"
  tag="$(sed -n 's/.*"tag"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest_path" | head -n 1)"

  awk -v target="$target" -v version="$version" -v tag="$tag" '
    function extract_string(line, key, value, pattern) {
      pattern = "\"" key "\"[[:space:]]*:[[:space:]]*\"[^\"]*\""
      if (match(line, pattern)) {
        value = substr(line, RSTART, RLENGTH)
        sub("^\"" key "\"[[:space:]]*:[[:space:]]*\"", "", value)
        sub("\"$", "", value)
        return value
      }
      return ""
    }

    function reset_asset() {
      asset_name = ""
      asset_target = ""
      asset_url = ""
    }

    BEGIN {
      in_assets = 0
      in_asset = 0
      found = 0
      reset_asset()
    }

    /"assets"[[:space:]]*:[[:space:]]*\[/ {
      in_assets = 1
    }

    in_assets {
      if ($0 ~ /\{/) {
        in_asset = 1
        reset_asset()
      }

      if (in_asset) {
        value = extract_string($0, "name")
        if (value != "") {
          asset_name = value
        }
        value = extract_string($0, "target")
        if (value != "") {
          asset_target = value
        }
        value = extract_string($0, "url")
        if (value != "") {
          asset_url = value
        }
      }

      if (in_asset && $0 ~ /\}/) {
        if (asset_target == target || (index(asset_name, target) > 0 && asset_name ~ /\.(tar\.gz|tgz)$/)) {
          if (asset_url == "") {
            asset_url = "cli/" tag "/" asset_name
          }
          print version
          print asset_url
          found = 1
          exit 0
        }
        in_asset = 0
        reset_asset()
      }
    }

    END {
      if (!found) {
        exit 1
      }
    }
  ' "$manifest_path" > "$output_path"
}

install_latest_cli_from_manifest() {
  local target="$1"
  local cli_install="$2"
  local manifest_url="${ATMOS_CLI_UPDATE_MANIFEST_URL:-${DOWNLOAD_BASE}/cli/latest.json}"
  local manifest_file="${TMP_DIR}/cli-latest.json"
  local meta_file="${TMP_DIR}/cli-latest.txt"
  local archive_file="${TMP_DIR}/atmos-cli-${target}.tar.gz"
  local extract_dir="${TMP_DIR}/cli-latest"

  if ! curl_to_file "$manifest_url" "$manifest_file"; then
    echo "Could not fetch latest Atmos CLI manifest."
    return 1
  fi

  if ! resolve_cli_manifest_asset "$target" "$manifest_file" "$meta_file"; then
    echo "Could not resolve a compatible Atmos CLI asset."
    return 1
  fi

  local latest_cli_version cli_url
  latest_cli_version="$(sed -n '1p' "$meta_file")"
  cli_url="$(sed -n '2p' "$meta_file")"
  if [[ "$cli_url" != http://* && "$cli_url" != https://* ]]; then
    if [[ "$cli_url" == /* ]]; then
      cli_url="${DOWNLOAD_BASE}${cli_url}"
    else
      cli_url="${DOWNLOAD_BASE}/${cli_url}"
    fi
  fi

  local installed_version
  installed_version="$(read_cli_version "$cli_install")"
  if [[ -n "$installed_version" && -n "$latest_cli_version" ]] && version_ge "$installed_version" "$latest_cli_version"; then
    echo "Keeping existing Atmos CLI ${installed_version} at ${cli_install}"
    return 0
  fi

  echo "Downloading latest Atmos CLI ${latest_cli_version:-unknown}: ${cli_url}"
  if ! curl_to_file "$cli_url" "$archive_file"; then
    echo "Could not download latest Atmos CLI."
    return 1
  fi

  mkdir -p "$extract_dir"
  if ! tar -xzf "$archive_file" -C "$extract_dir"; then
    echo "Could not extract latest Atmos CLI."
    return 1
  fi

  local extracted_cli
  extracted_cli="$(find "$extract_dir" -maxdepth 5 -type f -name atmos | head -n 1)"
  if [[ -z "$extracted_cli" ]]; then
    echo "Latest Atmos CLI archive did not contain atmos."
    return 1
  fi

  cp "$extracted_cli" "$cli_install"
  chmod +x "$cli_install"
  echo "Installed Atmos CLI ${latest_cli_version:-latest} to ${cli_install}"
}

install_best_cli() {
  local target="$1"
  local cli_install="$2"

  if install_latest_cli_from_manifest "$target" "$cli_install"; then
    return 0
  fi

  local installed_version
  installed_version="$(read_cli_version "$cli_install")"
  if [[ -n "$installed_version" ]]; then
    echo "Keeping existing Atmos CLI ${installed_version} at ${cli_install}."
    return 0
  fi

  echo "Unable to install Atmos CLI. Check ${ATMOS_CLI_UPDATE_MANIFEST_URL:-${DOWNLOAD_BASE}/cli/latest.json} or install the standalone CLI first." >&2
  return 1
}

resolve_release_tag() {
  if [[ "$VERSION" != "latest" ]]; then
    echo "$VERSION"
    return 0
  fi

  local releases_json
  if ! releases_json="$(curl_to_stdout "https://api.github.com/repos/${REPO}/releases?per_page=100")"; then
    echo "Failed to query GitHub releases. Try again, or pass --version local-web-runtime-2026.7.2." >&2
    return 1
  fi

  local resolved_tag
  if ! resolved_tag="$(printf '%s' "$releases_json" | awk '
    function extract_string(line, key, value, pattern) {
      pattern = "\"" key "\"[[:space:]]*:[[:space:]]*\"[^\"]*\""
      if (match(line, pattern)) {
        value = substr(line, RSTART, RLENGTH)
        sub("^\"" key "\"[[:space:]]*:[[:space:]]*\"", "", value)
        sub("\"$", "", value)
        return value
      }
      return ""
    }

    function extract_bool(line, key, value, pattern) {
      pattern = "\"" key "\"[[:space:]]*:[[:space:]]*(true|false)"
      if (match(line, pattern)) {
        value = substr(line, RSTART, RLENGTH)
        sub("^\"" key "\"[[:space:]]*:[[:space:]]*", "", value)
        return value
      }
      return ""
    }

    function maybe_select() {
      if (selected == "" && tag ~ /^local-web-runtime-[0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}$/ && draft == "false" && prerelease == "false") {
        selected = tag
      }
    }

    /^  \{/ {
      tag = ""
      draft = ""
      prerelease = ""
    }

    {
      value = extract_string($0, "tag_name")
      if (value != "") {
        tag = value
      }

      value = extract_bool($0, "draft")
      if (value != "") {
        draft = value
      }

      value = extract_bool($0, "prerelease")
      if (value != "") {
        prerelease = value
      }

      maybe_select()
    }

    END {
      if (selected != "") {
        print selected
      }
    }
  ')"; then
    return 1
  fi

  if [[ -z "$resolved_tag" ]]; then
    echo "No published local-web-runtime release was found." >&2
    return 1
  fi

  echo "$resolved_tag"
}

TARGET="$(detect_target)"
ASSET="atmos-local-runtime-${TARGET}.tar.gz"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

ARCHIVE_FILE="${TMP_DIR}/${ASSET}"
if [[ -n "$ARCHIVE_PATH" ]]; then
  cp "$ARCHIVE_PATH" "$ARCHIVE_FILE"
  RESOLVED_VERSION="$VERSION"
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

chmod +x "${INSTALL_ROOT}/runtime/current/bin/api"
mkdir -p "${CLI_BIN_DIR}"
install_best_cli "$TARGET" "${CLI_BIN_DIR}/atmos"
ensure_path_hint "${CLI_BIN_DIR}"

echo "Installed Atmos local runtime to ${INSTALL_ROOT}/runtime/current"

if [[ "$NO_START" -eq 0 ]]; then
  if [[ -n "$REGISTER_TOKEN" ]]; then
    echo "Registering and starting Atmos Computer..."
    START_CMD=(
      "${CLI_BIN_DIR}/atmos"
      --json
      computer
      start
      --token "$REGISTER_TOKEN"
      --port "$PORT"
    )
    if [[ "$RELAY_URL_EXPLICIT" -eq 1 ]]; then
      START_CMD+=(--relay "$RELAY_URL")
    fi
    if [[ -n "$DISPLAY_NAME" ]]; then
      START_CMD+=(--display-name "$DISPLAY_NAME")
    fi
    if [[ -n "$RELAY_SECRET_KEY" ]]; then
      START_CMD+=(--relay-secret-key "$RELAY_SECRET_KEY")
    fi
    if [[ "$DAEMON" -eq 1 ]]; then
      START_CMD+=(--daemon)
    fi
    START_OUTPUT="$(
      ATMOS_REGISTRATION_VIA=local-web-runtime \
      ATMOS_REGISTRATION_VERSION="${RESOLVED_VERSION}" \
      "${START_CMD[@]}"
    )"
  else
    echo "Starting Atmos local runtime..."
    START_OUTPUT="$("${CLI_BIN_DIR}/atmos" --json runtime ensure --force-restart --port "$PORT")"
  fi
  ACTUAL_URL="$(printf '%s' "$START_OUTPUT" | parse_runtime_url)"
  if [[ -z "$ACTUAL_URL" ]]; then
    ACTUAL_URL="http://127.0.0.1:${PORT}"
  fi
  if [[ -n "$REGISTER_TOKEN" ]]; then
    echo "Atmos Computer is running: ${ACTUAL_URL}"
  else
    echo "Atmos local runtime is running: ${ACTUAL_URL}"
    open_browser "$ACTUAL_URL"
  fi
fi

echo
echo "Atmos CLI: ${CLI_BIN_DIR}/atmos"
echo "Installed release: ${RESOLVED_VERSION}"
if [[ "${ACTUAL_URL:-}" != "" ]]; then
  echo "Local app URL: ${ACTUAL_URL}"
else
  echo "Local app URL: http://127.0.0.1:${PORT}"
fi
if [[ -n "$REGISTER_TOKEN" ]]; then
  echo "Check status with: ${CLI_BIN_DIR}/atmos computer status"
else
  echo "Start later with: ${CLI_BIN_DIR}/atmos runtime ensure"
fi
echo "Stop with: ${CLI_BIN_DIR}/atmos runtime stop"
