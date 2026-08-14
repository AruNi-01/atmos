#!/usr/bin/env bash
# Atmos cloud/CI install bootstrap.
#
# Prefers a reproducible Nix dev shell (flake.nix) when Nix is available on the
# host, and otherwise falls back to the host toolchains (bun + rustup/cargo).
# Point a Cloud Agent / CI "install" step at this script for a vendor-neutral,
# reproducible setup:
#
#     bash scripts/dev/cloud-install.sh
#
# Env toggles:
#   ATMOS_SKIP_NIX=1   Force the host-toolchain path even if Nix is installed.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

# Make host Rust/bun discoverable. Only adopt the standard Cursor Cloud paths
# when they exist and are not already configured, so this stays portable to
# other hosts (where rustup uses ~/.cargo / ~/.rustup and bun is on PATH).
prepare_host_path() {
  if [ -z "${CARGO_HOME:-}" ] && [ -d /usr/local/cargo ]; then export CARGO_HOME=/usr/local/cargo; fi
  if [ -z "${RUSTUP_HOME:-}" ] && [ -d /usr/local/rustup ]; then export RUSTUP_HOME=/usr/local/rustup; fi
  if [ -n "${CARGO_HOME:-}" ] && [ -d "${CARGO_HOME}/bin" ]; then export PATH="${CARGO_HOME}/bin:${PATH}"; fi
  if [ -d "${HOME}/.bun/bin" ]; then export PATH="${HOME}/.bun/bin:${PATH}"; fi
}

if [ "${ATMOS_SKIP_NIX:-0}" != "1" ] && command -v nix >/dev/null 2>&1 && [ -f flake.nix ]; then
  echo "==> Atmos install via Nix dev shell (reproducible)"
  nix develop --command bash -c 'set -euo pipefail; bun install; cargo build --bin api'
else
  echo "==> Atmos install via host toolchains (no Nix)"
  prepare_host_path
  bun install
  cargo build --bin api
fi
