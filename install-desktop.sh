#!/usr/bin/env bash
set -euo pipefail

REPO="${ATMOS_GITHUB_REPO:-AruNi-01/atmos}"
VERSION="${ATMOS_VERSION:-latest}"
ARCHIVE_PATH=""
USE_GITHUB_SOURCE=0
NO_CLI=0
CLI_BIN_DIR="$HOME/.atmos/bin"

# Default to custom domain, fallback to GitHub
DOWNLOAD_BASE="${ATMOS_DOWNLOAD_BASE_URL:-https://install.atmos.land}"

usage() {
  cat <<'EOF'
Usage: install-desktop.sh [options]

Options:
  --version <tag>        Install a specific release tag instead of latest
                         (example: desktop-electron-2026.7.29)
  --archive <path>       Install from a prebuilt local .zip or .app.tar.gz archive
  --github-source        Use GitHub Releases instead of custom domain
  --no-cli               Install Desktop only, do not install/update ~/.atmos/bin/atmos
  -h, --help             Show this help

This installer is for macOS only.
For Linux/Windows, download the installer directly from GitHub Releases:
https://github.com/AruNi-01/atmos/releases
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
    --no-cli)
      NO_CLI=1
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
    Darwin:arm64|Darwin:aarch64) echo "aarch64" ;;
    Darwin:x86_64) echo "x64" ;;
    *)
      echo "Unsupported platform: ${os} ${arch}" >&2
      echo "This installer is for macOS only." >&2
      echo "For Linux/Windows, download the installer directly from GitHub Releases:" >&2
      echo "https://github.com/AruNi-01/atmos/releases" >&2
      exit 1
      ;;
  esac
}

detect_cli_target() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "${os}:${arch}" in
    Darwin:arm64|Darwin:aarch64) echo "aarch64-apple-darwin" ;;
    Darwin:x86_64) echo "x86_64-apple-darwin" ;;
    *)
      echo "Unsupported CLI platform for Desktop installer: ${os} ${arch}" >&2
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

curl_to_file() {
  local url="$1"
  local output="$2"
  curl -fsSL --retry 3 --retry-delay 1 --retry-all-errors --connect-timeout 10 "$url" -o "$output"
}

ensure_path_hint() {
  local bin_dir="$1"
  local default_bin="$HOME/.atmos/bin"
  if [[ "$bin_dir" != "$default_bin" ]]; then
    echo "PATH not modified automatically for custom CLI bin dir: ${bin_dir}"
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
    echo '# Atmos CLI'
    echo "$snippet"
  } >> "$profile"
  echo "Updated PATH in ${profile}"
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

  mkdir -p "$(dirname "$cli_install")"
  if install_latest_cli_from_manifest "$target" "$cli_install"; then
    ensure_path_hint "$(dirname "$cli_install")"
    return 0
  fi

  local installed_version
  installed_version="$(read_cli_version "$cli_install")"
  if [[ -n "$installed_version" ]]; then
    echo "Keeping existing Atmos CLI ${installed_version} at ${cli_install}."
    ensure_path_hint "$(dirname "$cli_install")"
    return 0
  fi

  echo "Unable to install Atmos CLI. Check ${ATMOS_CLI_UPDATE_MANIFEST_URL:-${DOWNLOAD_BASE}/cli/latest.json} or install the standalone CLI first." >&2
  return 1
}

# Map a release tag to the calendar version segment (no tag prefix).
desktop_tag_version() {
  local tag="$1"
  case "$tag" in
    desktop-electron-*) echo "${tag#desktop-electron-}" ;;
    desktop-*) echo "${tag#desktop-}" ;;
    *) echo "$tag" ;;
  esac
}

# Asset names differ by channel:
# - Electron latest path: Atmos_<arch>.zip (unversioned)
# - Electron tag path:    Atmos_<version>_<arch>.zip
# - Legacy Tauri:         Atmos_<arch>.app.tar.gz
desktop_asset_candidates() {
  local target="$1"
  local tag_or_latest="$2"
  local version

  if [[ "$tag_or_latest" == "latest" ]]; then
    echo "Atmos_${target}.zip"
    echo "Atmos_${target}.app.tar.gz"
    return 0
  fi

  version="$(desktop_tag_version "$tag_or_latest")"
  case "$tag_or_latest" in
    desktop-electron-*)
      echo "Atmos_${version}_${target}.zip"
      echo "Atmos_${target}.zip"
      ;;
    desktop-*)
      echo "Atmos_${target}.app.tar.gz"
      ;;
    *)
      echo "Atmos_${version}_${target}.zip"
      echo "Atmos_${target}.zip"
      echo "Atmos_${target}.app.tar.gz"
      ;;
  esac
}

download_latest_with_fallback() {
  local target="$1"
  local asset candidate_url
  local -a candidates=()

  while IFS= read -r asset; do
    candidates+=("$asset")
  done < <(desktop_asset_candidates "$target" "latest")

  for asset in "${candidates[@]}"; do
    candidate_url="${DOWNLOAD_BASE}/desktop/latest/${asset}"
    ARCHIVE_FILE="${TMP_DIR}/${asset}"
    echo "Trying custom domain latest path: ${candidate_url}"
    if curl -fsSL "$candidate_url" -o "$ARCHIVE_FILE"; then
      echo "Successfully downloaded from latest path"
      ASSET="$asset"
      return 0
    fi
  done

  echo "Latest path not available, falling back to GitHub API to resolve version..."
  RESOLVED_VERSION="$(resolve_release_tag)"
  if [[ -z "$RESOLVED_VERSION" ]]; then
    echo "Unable to resolve a desktop release tag from GitHub releases." >&2
    exit 1
  fi

  download_with_fallback_resolved "$target" "$RESOLVED_VERSION"
}

download_with_fallback_resolved() {
  local target="$1"
  local version="$2"
  local asset
  local -a candidates=()

  while IFS= read -r asset; do
    candidates+=("$asset")
  done < <(desktop_asset_candidates "$target" "$version")

  for asset in "${candidates[@]}"; do
    ARCHIVE_FILE="${TMP_DIR}/${asset}"
    if download_with_fallback "$asset" "$version"; then
      ASSET="$asset"
      return 0
    fi
  done

  echo "Failed to download a desktop installer for ${version} (${target})." >&2
  exit 1
}

# Override download_with_fallback to not fail hard on first URL so candidates can try.
download_with_fallback() {
  local asset="$1"
  local version="$2"
  local custom_url="${DOWNLOAD_BASE}/desktop/${version}/${asset}"
  local github_url="https://github.com/${REPO}/releases/download/${version}/${asset}"

  if [[ "$USE_GITHUB_SOURCE" -eq 1 ]]; then
    echo "Downloading from GitHub: ${github_url}"
    if curl -fsSL "$github_url" -o "$ARCHIVE_FILE"; then
      return 0
    fi
    return 1
  fi

  echo "Downloading from custom domain: ${custom_url}"
  if curl -fsSL "$custom_url" -o "$ARCHIVE_FILE"; then
    return 0
  fi

  echo "Failed to download from custom domain, trying GitHub as fallback..."
  echo "Downloading from GitHub: ${github_url}"
  if curl -fsSL "$github_url" -o "$ARCHIVE_FILE"; then
    return 0
  fi
  return 1
}

resolve_release_tag() {
  if [[ "$VERSION" != "latest" ]]; then
    echo "$VERSION"
    return 0
  fi

  local releases_json
  if ! releases_json="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases?per_page=100")"; then
    echo "Failed to query GitHub releases. Try again, or pass --version desktop-electron-2026.7.29." >&2
    return 1
  fi

  # Prefer production Electron tags; fall back to legacy Tauri desktop-* tags.
  printf '%s' "$releases_json" | awk '
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
      if (draft != "false" || prerelease != "false" || tag == "") {
        return
      }
      if (selected_electron == "" && tag ~ /^desktop-electron-[0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}$/) {
        selected_electron = tag
      }
      if (selected_legacy == "" && tag ~ /^desktop-[0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}$/) {
        selected_legacy = tag
      }
    }

    BEGIN {
      selected_electron = ""
      selected_legacy = ""
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
      if (selected_electron != "") {
        print selected_electron
      } else if (selected_legacy != "") {
        print selected_legacy
      }
    }
  '
}

install_app_archive() {
  local archive="$1"
  local extract_dir="${TMP_DIR}/app-extract"
  mkdir -p "$extract_dir"

  case "$archive" in
    *.zip)
      if ! command -v unzip >/dev/null 2>&1; then
        echo "unzip is required to install Electron desktop zip archives." >&2
        exit 1
      fi
      echo "Extracting zip archive..."
      unzip -q -o "$archive" -d "$extract_dir"
      ;;
    *.tar.gz|*.tgz)
      echo "Extracting tar archive..."
      tar -xzf "$archive" -C "$extract_dir"
      ;;
    *)
      echo "Unsupported archive format: $archive" >&2
      exit 1
      ;;
  esac

  local app_bundle
  app_bundle="$(find "$extract_dir" -maxdepth 3 -type d -name 'Atmos.app' | head -n 1)"
  if [[ -z "$app_bundle" ]]; then
    echo "Archive did not contain Atmos.app" >&2
    exit 1
  fi

  echo "Installing to /Applications..."
  rm -rf /Applications/Atmos.app
  cp -R "$app_bundle" /Applications/Atmos.app
}

TARGET="$(detect_target)"
CLI_TARGET="$(detect_cli_target)"
ASSET=""
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

ARCHIVE_FILE=""
if [[ -n "$ARCHIVE_PATH" ]]; then
  ARCHIVE_FILE="${TMP_DIR}/$(basename "$ARCHIVE_PATH")"
  cp "$ARCHIVE_PATH" "$ARCHIVE_FILE"
  RESOLVED_VERSION="$VERSION"
  ASSET="$(basename "$ARCHIVE_PATH")"
else
  if [[ "$VERSION" == "latest" ]]; then
    download_latest_with_fallback "$TARGET"
    RESOLVED_VERSION="latest"
  else
    RESOLVED_VERSION="$VERSION"
    download_with_fallback_resolved "$TARGET" "$RESOLVED_VERSION"
  fi
fi

install_app_archive "$ARCHIVE_FILE"

echo "Installed Atmos Desktop app to /Applications"
if [[ "$NO_CLI" -eq 0 ]]; then
  install_best_cli "$CLI_TARGET" "${CLI_BIN_DIR}/atmos"
  echo "Atmos CLI: ${CLI_BIN_DIR}/atmos"
fi
echo "Installed release: ${RESOLVED_VERSION}"
echo "Launch with: open /Applications/Atmos.app"
