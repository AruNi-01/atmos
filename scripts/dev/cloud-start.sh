#!/usr/bin/env bash
# Atmos cloud/CI start command.
#
# Launches the API (Atmos Server, loopback :30303) in the background and the
# Next.js web dev server (:3030) in the foreground so the process stays
# attached. Prefers the Nix dev shell when available, otherwise the host
# toolchains. Point a Cloud Agent / CI "start" step at this script:
#
#     bash scripts/dev/cloud-start.sh
#
# Env toggles:
#   ATMOS_SKIP_NIX=1   Force the host-toolchain path even if Nix is installed.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

api_log="${ATMOS_API_LOG:-/tmp/atmos-api.log}"

if [ "${ATMOS_SKIP_NIX:-0}" != "1" ] && command -v nix >/dev/null 2>&1 && [ -f flake.nix ]; then
  echo "==> Atmos start via Nix dev shell (reproducible)"
  exec nix develop --command bash -c "just dev-api > '$api_log' 2>&1 & exec just dev-web"
else
  echo "==> Atmos start via host toolchains (no Nix detected)"
  [ -d "$HOME/.bun/bin" ] && export PATH="$HOME/.bun/bin:$PATH"
  [ -d /usr/local/cargo/bin ] && export PATH="/usr/local/cargo/bin:$PATH"
  just dev-api > "$api_log" 2>&1 &
  exec just dev-web
fi
