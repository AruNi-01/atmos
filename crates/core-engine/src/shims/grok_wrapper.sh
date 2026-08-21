#!/bin/sh
# Make Grok treat Atmos's tmux-backed terminal like a regular PTY so its
# default alt_screen=auto policy uses the real alternate screen.

if [ "${ATMOS_GROK_REAL_PATH+x}" = x ]; then
    PATH=$ATMOS_GROK_REAL_PATH
    export PATH
fi

real_grok=$(command -v grok 2>/dev/null || true)
if [ -z "$real_grok" ] || [ "$real_grok" = "$0" ] ||
    { [ -n "${ATMOS_SHIMS_BIN:-}" ] && [ "$real_grok" = "${ATMOS_SHIMS_BIN%/}/grok" ]; }; then
    printf '%s\n' "Atmos could not find the real Grok executable on PATH." >&2
    exit 127
fi

unset TMUX TMUX_PANE
exec "$real_grok" "$@"
