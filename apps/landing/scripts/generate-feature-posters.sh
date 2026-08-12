#!/usr/bin/env bash
# Generate static poster stills for Feature Showcase sphere covers.
# Extract feature showcase poster JPGs from local public/videos/*.mp4.
# Production posters live on R2 (landing/videos/); sync uploads after regenerating.
#
# Usage:
#   bash apps/landing/scripts/generate-feature-posters.sh
#   bash apps/landing/scripts/generate-feature-posters.sh path/to/video.mp4

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIDEOS_DIR="${ROOT}/public/videos"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required (brew install ffmpeg)" >&2
  exit 1
fi

extract_one() {
  local input="$1"
  local base
  base="$(basename "$input" .mp4)"
  local out="${VIDEOS_DIR}/${base}-poster.jpg"

  if [[ ! -f "$input" ]]; then
    echo "skip missing: $input" >&2
    return 1
  fi

  echo "→ $(basename "$out")"
  # Prefer ~1s in; fall back earlier if the clip is very short.
  if ! ffmpeg -y -ss 1 -i "$input" -frames:v 1 \
    -vf "scale=960:540:force_original_aspect_ratio=increase,crop=960:540" \
    -q:v 4 "$out" >/dev/null 2>&1; then
    ffmpeg -y -ss 0.5 -i "$input" -frames:v 1 \
      -vf "scale=960:540:force_original_aspect_ratio=increase,crop=960:540" \
      -q:v 4 "$out" >/dev/null 2>&1
  fi
}

FEATURE_VIDEOS=(
  agent-terminal-use-flow.mp4
  built-in-terminal-agents.mp4
  Browser-Element-Inspector.mp4
  global-search-command-panel.mp4
  integrated-git-workflow.mp4
  terminal-side-chat.mp4
  Usage-Analytics-Dashboard.mp4
  automation.mp4
  appshots.mp4
  Agent-Status-Notifications.mp4
  Kanban-View.mp4
  canvas.mp4
  built-in-lightweight-editor.mp4
  skill-manager.mp4
  multi-workspace-dev.mp4
)

if [[ $# -gt 0 ]]; then
  for arg in "$@"; do
    extract_one "$arg"
  done
else
  for name in "${FEATURE_VIDEOS[@]}"; do
    extract_one "${VIDEOS_DIR}/${name}"
  done
fi

echo "done"
