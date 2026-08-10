#!/usr/bin/env bash
# Upload Relay Worker secrets (at least RELAY_HUB_SYNC_SECRET = Hub's value)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RELAY="$ROOT/packages/relay"
ENV_FILE="${1:-$RELAY/secrets.cloud.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

cd "$RELAY"

KEYS=(
  RELAY_HUB_SYNC_SECRET
  RELAY_SECRET_KEY
)

put_one() {
  local key="$1"
  local val
  val="$(grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/\r$//')"
  if [[ -z "${val// }" ]]; then
    echo "SKIP  $key (empty)"
    return 0
  fi
  printf '%s' "$val" | bunx wrangler secret put "$key"
  echo "OK    $key"
}

echo "Putting secrets to Worker atmos-computer-relay from $ENV_FILE"
for k in "${KEYS[@]}"; do
  put_one "$k"
done

echo
echo "Done. Deploy with: cd packages/relay && bunx wrangler deploy"
echo "Apply D1 migrations if needed: bunx wrangler d1 migrations apply atmos-computer-relay --remote"
