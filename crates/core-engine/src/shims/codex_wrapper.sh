#!/bin/sh
# Hooks must run in the launching terminal's process environment. Codex's
# shared app-server daemon otherwise reuses the first terminal's pane identity.

if [ "${ATMOS_SHIMS_REAL_PATH+x}" = x ]; then
    PATH=$ATMOS_SHIMS_REAL_PATH
    export PATH
elif [ "${ATMOS_GROK_REAL_PATH+x}" = x ]; then
    PATH=$ATMOS_GROK_REAL_PATH
    export PATH
fi

real_codex=$(command -v codex 2>/dev/null || true)
if [ -z "$real_codex" ] || [ "$real_codex" = "$0" ] ||
    { [ -n "${ATMOS_SHIMS_BIN:-}" ] && [ "$real_codex" = "${ATMOS_SHIMS_BIN%/}/codex" ]; }; then
    printf '%s\n' "Atmos could not find the real Codex executable on PATH." >&2
    exit 127
fi

if [ "${ATMOS_MANAGED:-}" = "1" ]; then
    # Older Codex releases have no shared daemon and do not accept this flag.
    case "$("$real_codex" --help 2>/dev/null)" in
        *--no-daemon*)
            for arg in "$@"; do
                case "$arg" in
                    --no-daemon) exec "$real_codex" "$@" ;;
                    --) break ;;
                esac
            done
            exec "$real_codex" --no-daemon "$@"
            ;;
    esac
fi
exec "$real_codex" "$@"
