#!/usr/bin/env bash
# Deploy the Atmos Computer relay Worker (control plane + ServerHub DO).
#
# Usage (from repo root):
#   scripts/relay/deploy.sh
#
# Auth (pick one):
#   cd packages/relay && bunx wrangler login
#   export CLOUDFLARE_API_TOKEN="..."
# Optional: export CLOUDFLARE_ACCOUNT_ID="..."  # multi-account setups

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RELAY_ROOT="${REPO_ROOT}/packages/relay"
cd "$RELAY_ROOT"

if ! command -v bunx >/dev/null 2>&1; then
  echo "error: bunx not found (install Bun or run: npx wrangler deploy)" >&2
  exit 1
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  if ! bunx wrangler whoami >/dev/null 2>&1; then
    echo "error: not authenticated with Cloudflare" >&2
    echo "  cd packages/relay && bunx wrangler login" >&2
    echo "  or: export CLOUDFLARE_API_TOKEN=..." >&2
    exit 1
  fi
fi

echo "==> Deploying Worker from ${RELAY_ROOT}"
bunx wrangler deploy
echo "==> Deploy finished (relay.atmos.land)"
