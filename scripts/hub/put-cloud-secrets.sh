#!/usr/bin/env bash
# Upload Hub Worker secrets from packages/hub/secrets.cloud.env
# Requires: wrangler logged in (`bunx wrangler login`)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HUB="$ROOT/packages/hub"
ENV_FILE="${1:-$HUB/secrets.cloud.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy secrets.cloud.env and fill OAuth values." >&2
  exit 1
fi

cd "$HUB"

# Keys Hub Worker expects (see packages/hub/src/env.ts)
KEYS=(
  BETTER_AUTH_SECRET
  BETTER_AUTH_URL
  GITHUB_CLIENT_ID
  GITHUB_CLIENT_SECRET
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  RELAY_URL
  RELAY_HUB_SYNC_SECRET
)

put_one() {
  local key="$1"
  local val
  val="$(grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/\r$//')"
  if [[ -z "${val// }" ]]; then
    echo "SKIP  $key (empty in $ENV_FILE)"
    return 0
  fi
  # wrangler secret put reads secret from stdin
  printf '%s' "$val" | bunx wrangler secret put "$key"
  echo "OK    $key"
}

echo "Putting secrets to Worker atmos-hub from $ENV_FILE"
for k in "${KEYS[@]}"; do
  put_one "$k"
done

echo
echo "Done. Deploy with: cd packages/hub && bunx wrangler deploy"
echo "Custom domain hub.atmos.land is created from wrangler.toml routes on first successful deploy"
echo "(zone atmos.land must already be on this Cloudflare account)."
