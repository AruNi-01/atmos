#!/usr/bin/env bash
# Atmos environment start (dev servers).
#
# Starts the Atmos dev servers in ANY environment — a fresh local machine, CI,
# or a Cloud Agent: the API (Atmos Server, loopback :30303) in the background
# and the Next.js web dev server (:3030) in the foreground so the process stays
# attached. When the foreground web process exits or is interrupted, the
# background API process group is torn down with it so port 30303 is not left
# occupied. Prefers the Nix dev shell when available, otherwise host toolchains.
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

# Re-enter this script inside `nix develop` so one supervisor path owns API+web.
# Avoids serializing functions through `bash -c` (quoting / missing pgrep).
if [ "${ATMOS_SKIP_NIX:-0}" != "1" ] && [ "${ATMOS_IN_NIX_SHELL:-0}" != "1" ] \
  && command -v nix >/dev/null 2>&1 && [ -f flake.nix ]; then
  echo "==> Atmos start via Nix dev shell (reproducible)"
  export ATMOS_IN_NIX_SHELL=1
  exec nix develop --command bash "${BASH_SOURCE[0]}" "$@"
fi

if [ "${ATMOS_IN_NIX_SHELL:-0}" != "1" ]; then
  echo "==> Atmos start via host toolchains (no Nix)"
  prepare_host_path
fi

# Job control gives each background job its own process group (PGID == pid).
# Cleanup then reaps just → recipe → child trees without pgrep, including when
# SIGTERM hits this supervisor directly (Cloud/CI stop) rather than the tty.
set -m
just dev-api > "$api_log" 2>&1 &
api_pid=$!
just dev-web &
web_pid=$!

cleanup() {
  trap - EXIT INT TERM
  if [ -n "${web_pid:-}" ]; then
    kill -- -"$web_pid" 2>/dev/null || kill "$web_pid" 2>/dev/null || true
    wait "$web_pid" 2>/dev/null || true
  fi
  if [ -n "${api_pid:-}" ]; then
    kill -- -"$api_pid" 2>/dev/null || kill "$api_pid" 2>/dev/null || true
    wait "$api_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM
wait "$web_pid"
