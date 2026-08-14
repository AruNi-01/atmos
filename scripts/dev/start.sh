#!/usr/bin/env bash
# Atmos environment start (dev servers).
#
# Starts the Atmos dev servers in ANY environment — a fresh local machine, CI,
# or a Cloud Agent: the API (Atmos Server, loopback :30303) in the background
# and the Next.js web dev server (:3030) in the foreground so the process stays
# attached. When the foreground web process exits or is interrupted, the
# background API tree is torn down with it so port 30303 is not left occupied.
# Prefers the Nix dev shell when available, otherwise host toolchains.
#
#     bash scripts/dev/start.sh
#
# Env toggles:
#   ATMOS_SKIP_NIX=1   Force the host-toolchain path even if Nix is installed.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

api_log="${ATMOS_API_LOG:-/tmp/atmos-api.log}"

# Make host Rust/bun discoverable (see setup.sh for rationale).
prepare_host_path() {
  if [ -z "${CARGO_HOME:-}" ] && [ -d /usr/local/cargo ]; then export CARGO_HOME=/usr/local/cargo; fi
  if [ -z "${RUSTUP_HOME:-}" ] && [ -d /usr/local/rustup ]; then export RUSTUP_HOME=/usr/local/rustup; fi
  if [ -n "${CARGO_HOME:-}" ] && [ -d "${CARGO_HOME}/bin" ]; then export PATH="${CARGO_HOME}/bin:${PATH}"; fi
  if [ -d "${HOME}/.bun/bin" ]; then export PATH="${HOME}/.bun/bin:${PATH}"; fi
}

# Recursively signal a process and its descendants (just → recipe bash → cargo → api).
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

# Keep this shell as the supervisor: do not `exec just dev-web`, or the API
# background job is orphaned when web exits (port 30303 stays bound).
run_api_and_web() {
  just dev-api > "$api_log" 2>&1 &
  api_pid=$!

  cleanup() {
    trap - EXIT INT TERM
    if [ -n "${api_pid:-}" ]; then
      kill_tree "$api_pid"
      wait "$api_pid" 2>/dev/null || true
    fi
  }
  trap cleanup EXIT INT TERM
  just dev-web
}

if [ "${ATMOS_SKIP_NIX:-0}" != "1" ] && command -v nix >/dev/null 2>&1 && [ -f flake.nix ]; then
  echo "==> Atmos start via Nix dev shell (reproducible)"
  # exec nix develop is fine: the inner bash still supervises API + web.
  exec nix develop --command bash -c "$(declare -f kill_tree run_api_and_web); set -euo pipefail; api_log=$(printf '%q' "$api_log"); run_api_and_web"
else
  echo "==> Atmos start via host toolchains (no Nix)"
  prepare_host_path
  run_api_and_web
fi
