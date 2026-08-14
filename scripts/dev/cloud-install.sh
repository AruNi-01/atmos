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

install_native() {
  # rust-toolchain.toml drives the rustc/cargo version via rustup.
  [ -d "$HOME/.bun/bin" ] && export PATH="$HOME/.bun/bin:$PATH"
  [ -d /usr/local/cargo/bin ] && export PATH="/usr/local/cargo/bin:$PATH"
  bun install
  cargo build --bin api
}

if [ "${ATMOS_SKIP_NIX:-0}" != "1" ] && command -v nix >/dev/null 2>&1 && [ -f flake.nix ]; then
  echo "==> Atmos install via Nix dev shell (reproducible)"
  nix develop --command bash -c 'set -euo pipefail; bun install; cargo build --bin api'
else
  echo "==> Atmos install via host toolchains (no Nix detected)"
  install_native
fi
