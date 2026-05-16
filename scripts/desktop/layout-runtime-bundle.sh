#!/usr/bin/env bash
# Lay out Desktop / shared local runtime: binaries/runtime/current/{bin,web,system-skills}
set -euo pipefail

layout_runtime_bundle() {
  local root_dir="$1"
  local target_triple="$2"
  local bin_ext="${3:-}"

  local binaries_dir="$root_dir/apps/desktop/src-tauri/binaries"
  local runtime_root="$binaries_dir/runtime/current"
  local api_src="$root_dir/target/$target_triple/release/api$bin_ext"
  local cli_src="$root_dir/target/$target_triple/release/atmos$bin_ext"
  if [[ ! -f "$api_src" ]]; then
    api_src="$root_dir/target/$target_triple/debug/api$bin_ext"
    cli_src="$root_dir/target/$target_triple/debug/atmos$bin_ext"
  fi
  local web_src="$binaries_dir/web-out"
  local skills_src="$binaries_dir/system-skills"

  if [[ ! -f "$api_src" ]]; then
    echo "error: missing API binary at $api_src (run cargo build --release --bin api first)" >&2
    return 1
  fi

  mkdir -p "$runtime_root/bin"
  cp "$api_src" "$runtime_root/bin/api$bin_ext"
  if [[ -f "$cli_src" ]]; then
    cp "$cli_src" "$runtime_root/bin/atmos$bin_ext"
  fi

  if [[ -d "$web_src" ]]; then
    rm -rf "$runtime_root/web"
    cp -r "$web_src" "$runtime_root/web"
  else
    mkdir -p "$runtime_root/web"
  fi

  if [[ -d "$skills_src" ]]; then
    rm -rf "$runtime_root/system-skills"
    cp -r "$skills_src" "$runtime_root/system-skills"
  fi

  if [[ -f "$root_dir/apps/desktop/src-tauri/Cargo.toml" ]]; then
    local version
    version="$(grep -E '^version\s*=' "$root_dir/apps/desktop/src-tauri/Cargo.toml" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')"
    if [[ -n "$version" ]]; then
      printf '%s\n' "$version" >"$runtime_root/version.txt"
    fi
  fi

  echo "✅ Runtime bundle: $runtime_root"
}
