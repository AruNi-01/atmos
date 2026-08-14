#!/usr/bin/env bash
# Atmos environment setup (install / bootstrap).
#
# One idempotent command to bring up the Atmos dev dependencies in ANY new
# environment — a fresh local machine, CI, or a Cloud Agent. Prefers a
# reproducible Nix dev shell (flake.nix) when Nix is available, and otherwise
# falls back to the host toolchains (bun + rustup/cargo).
#
#     bash scripts/dev/setup.sh
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
  echo "==> Atmos setup via Nix dev shell (reproducible)"
  nix develop --command bash -c 'set -euo pipefail; bun install; cargo build --bin api'
else
  echo "==> Atmos setup via host toolchains (no Nix)"
  prepare_host_path
  bun install
  cargo build --bin api
fi
