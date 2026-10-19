#!/usr/bin/env bash
# Capture proof from the e2e simulator. Publish to the orphan branch
# `agent-artifacts` under pr-<N>/<sha>/ only when EVIDENCE_PUSH=1.
#
#   just mobile-e2e-evidence <pr-number> [note]
#
# Env:
#   ATMOS_E2E_DEVICE            simulator UDID or name (default: see resolve-device.mjs)
#   EVIDENCE_SCALE=0.4          screenshot scale (0.01-1)
#   EVIDENCE_RECORD_SECONDS=0   >0 records the screen that long and adds a contact sheet
#   EVIDENCE_LINK=atmos://...   open this deep link in the app before capturing
#   EVIDENCE_WAIT_MS=3000       settle time after opening the app
#   EVIDENCE_PUSH=1             publish to agent-artifacts (default: do not push)
#   EVIDENCE_REMOTE=<url>       remote to push to (default: origin of this checkout)
#
# Captured: screen.png (simctl framebuffer, scaled), a11y.txt (agent-device snapshot -i), report.json and
# failure traces from the last `e2e run`, contact-sheet.png (optional), meta.json, README.md.
# The remote is PUBLIC. Do not push screenshots or chat content of a paired app
# (workspace names, chat text, Computer URLs). Default is local only. Set
# EVIDENCE_PUSH=1 only for a neutral route (EVIDENCE_LINK).
# Videos stay local (.e2e/evidence/); only the contact sheet is pushed. Reads the
# simulator only: it never installs, relaunches, erases or shuts anything down.
set -euo pipefail

evidence_should_push() {
  [[ "${EVIDENCE_PUSH:-}" == "1" ]]
}

evidence_write_meta() {
  local out="$1"
  local pr="$2"
  local sha="$3"
  local branch="$4"
  local device="$5"
  local bundle="$6"
  local captured_at="$7"
  local agent_device="$8"
  local note="$9"
  # jq --arg keeps newlines, backslashes, and quotes as data. A raw heredoc
  # only escaped quotes and wrote invalid JSON for the other two.
  jq -n \
    --argjson pr "$pr" \
    --arg sha "$sha" \
    --arg branch "$branch" \
    --arg device "$device" \
    --arg bundleId "$bundle" \
    --arg capturedAt "$captured_at" \
    --arg agentDevice "$agent_device" \
    --arg note "$note" \
    '{pr:$pr, sha:$sha, branch:$branch, device:$device, bundleId:$bundleId, capturedAt:$capturedAt, agentDevice:$agentDevice, note:$note}' \
    >"$out/meta.json"
}

PR="${1:?usage: evidence.sh <pr-number> [note]}"
NOTE="${2:-}"
[[ "$PR" =~ ^[0-9]+$ ]] || { echo "pr-number must be numeric" >&2; exit 2; }

if [[ "${EVIDENCE_ARG_PROBE:-}" == "1" ]]; then
  printf '%s\n' "$PR"
  printf '%s\n' "$NOTE"
  exit 0
fi

if [[ "${EVIDENCE_POLICY_PROBE:-}" == "1" ]]; then
  OUT="${EVIDENCE_POLICY_OUT:?EVIDENCE_POLICY_OUT is required}"
  mkdir -p "$OUT"
  evidence_write_meta "$OUT" "$PR" "probe-sha" "probe-branch" "probe-device" \
    "land.atmos.mobile" "2026-01-01T00:00:00Z" "agent-device probe" "$NOTE"
  if evidence_should_push; then printf '%s\n' PUSH; else printf '%s\n' NO_PUSH; fi
  exit 0
fi

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$E2E_DIR/../../.." && pwd)"
BUNDLE_ID="land.atmos.mobile"
SCALE="${EVIDENCE_SCALE:-0.4}"
SECONDS_REC="${EVIDENCE_RECORD_SECONDS:-0}"
UDID="$(node "$E2E_DIR/scripts/resolve-device.mjs")"
SHA="$(git -C "$ROOT" rev-parse --short=9 HEAD)"
BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
REMOTE="${EVIDENCE_REMOTE:-$(git -C "$ROOT" remote get-url origin)}"
REL="pr-${PR}/${SHA}"
OUT="$E2E_DIR/.e2e/evidence/$REL"
SESSION="atmos-evidence-$$"
AD="$E2E_DIR/node_modules/.bin/agent-device"
[[ -x "$AD" ]] || { echo "Run: just mobile-e2e-install-deps" >&2; exit 1; }
export E2E_TELEMETRY_DISABLED="${E2E_TELEMETRY_DISABLED:-1}"

rm -rf "$OUT"; mkdir -p "$OUT"
ad() { "$AD" "$@" --platform ios --udid "$UDID" --session "$SESSION"; }
cleanup() { ad close >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[evidence] ${REL} on simulator ${UDID}"
if [[ -n "${EVIDENCE_LINK:-}" ]]; then ad open "$BUNDLE_ID" "$EVIDENCE_LINK" >/dev/null; else ad open "$BUNDLE_ID" >/dev/null; fi
ad wait "${EVIDENCE_WAIT_MS:-3000}" >/dev/null 2>&1 || true
ad snapshot -i >"$OUT/a11y.txt"
# simctl framebuffer, not `agent-device screenshot`: the latter draws iOS 26.5 sheets black.
xcrun simctl io "$UDID" screenshot --type=png "$OUT/screen-full.png" >/dev/null 2>&1
FULL_W="$(sips -g pixelWidth "$OUT/screen-full.png" | awk '/pixelWidth/ {print $2}')"
sips --resampleWidth "$(awk -v w="$FULL_W" -v s="$SCALE" 'BEGIN { printf "%d", w * s }')" \
  "$OUT/screen-full.png" --out "$OUT/screen.png" >/dev/null
rm -f "$OUT/screen-full.png"

if [[ "$SECONDS_REC" -gt 0 ]]; then
  ad record start "$OUT/recording.mp4" >/dev/null
  sleep "$SECONDS_REC"
  ad record stop >/dev/null
  "$AD" record contact-sheet "$OUT/recording.mp4" --out "$OUT/contact-sheet.png" >/dev/null || true
  mkdir -p "$E2E_DIR/.e2e/evidence-video/$REL"
  mv "$OUT/recording.mp4" "$E2E_DIR/.e2e/evidence-video/$REL/recording.mp4"
fi

[[ -f "$E2E_DIR/.e2e/report.json" ]] && cp "$E2E_DIR/.e2e/report.json" "$OUT/report.json"
if [[ -d "$E2E_DIR/.e2e/results" ]]; then
  find "$E2E_DIR/.e2e/results" -name trace.md -size -200k | while read -r trace; do
    mkdir -p "$OUT/traces"
    cp "$trace" "$OUT/traces/$(basename "$(dirname "$trace")").md"
  done
fi

evidence_write_meta "$OUT" "$PR" "$(git -C "$ROOT" rev-parse HEAD)" "$BRANCH" "$UDID" \
  "$BUNDLE_ID" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$("$AD" --version 2>/dev/null | head -1)" "$NOTE"
{
  echo "# PR #${PR} @ ${SHA}"
  echo
  echo "- branch: \`${BRANCH}\`  device: \`${UDID}\`  note: ${NOTE:-none}"
  echo "- screen.png (scale ${SCALE}), a11y.txt, meta.json$([[ -f "$OUT/report.json" ]] && echo ', report.json')$([[ -f "$OUT/contact-sheet.png" ]] && echo ', contact-sheet.png')"
} >"$OUT/README.md"

echo "[evidence] staged at ${OUT}"
if ! evidence_should_push; then
  echo "[evidence] not pushed (set EVIDENCE_PUSH=1 to publish; the remote is public)"
  exit 0
fi

# Publish through a throwaway repo so the working checkout is never touched.
STAGE="$(mktemp -d)"
trap 'cleanup; rm -rf "$STAGE"' EXIT
GIT_NAME="$(git -C "$ROOT" config user.name || echo atmos-agent)"
GIT_EMAIL="$(git -C "$ROOT" config user.email || echo atmos-agent@users.noreply.github.com)"

init_stage() {
  find "$STAGE" -mindepth 1 -delete
  git -C "$STAGE" init -q
  git -C "$STAGE" remote add origin "$REMOTE"
  git -C "$STAGE" config user.name "$GIT_NAME"
  git -C "$STAGE" config user.email "$GIT_EMAIL"
}

for attempt in 1 2 3; do
  init_stage
  if git ls-remote --exit-code --heads "$REMOTE" agent-artifacts >/dev/null 2>&1; then
    git -C "$STAGE" fetch -q --depth 1 origin agent-artifacts
    git -C "$STAGE" checkout -q -B agent-artifacts FETCH_HEAD
  else
    git -C "$STAGE" checkout -q --orphan agent-artifacts
    cat >"$STAGE/README.md" <<'MD'
# agent-artifacts

Orphan branch. No source code lives here. Local simulator proof from the Atmos
mobile agent e2e (`just mobile-e2e-evidence`), one folder per PR and commit:
`pr-<N>/<sha>/`. See specs/APP/QUALITY-009_mobile-agent-e2e/TECH.md.

Read: `git fetch origin agent-artifacts && git show origin/agent-artifacts:pr-<N>/<sha>/README.md`
MD
  fi
  rm -rf "${STAGE:?}/$REL"; mkdir -p "$STAGE/$REL"
  cp -R "$OUT/." "$STAGE/$REL/"
  git -C "$STAGE" add -A
  git -C "$STAGE" commit -q -m "evidence: pr-${PR} ${SHA}${NOTE:+ ($NOTE)}"
  if git -C "$STAGE" push -q origin HEAD:refs/heads/agent-artifacts; then
    echo "[evidence] pushed agent-artifacts:${REL}"
    echo "[evidence] read it: git fetch origin agent-artifacts && git show origin/agent-artifacts:${REL}/README.md"
    exit 0
  fi
  echo "[evidence] push raced (attempt ${attempt}); retrying" >&2
done
echo "[evidence] push failed" >&2
exit 1
