#!/bin/bash
# Atmos Terminal Dynamic Title Shim - Bash
#
# This script is sourced via `bash --init-file` when creating tmux windows.
# It first loads the user's normal .bashrc, then installs lightweight hooks
# that emit OSC 9999 escape sequences for dynamic tab title updates.
#
# Protocol: \033]9999;TYPE:PAYLOAD\007
#   CMD_START:<command>  — a foreground command is starting
#   CMD_END:<cwd>        — the command finished, shell is idle at <cwd>
#
# Inside tmux, OSC sequences are wrapped in DCS passthrough so they
# reach the outer PTY reader (tmux drops unrecognized OSC codes).

# ── 1. Source the user's normal startup files ──────────────────────────
# --init-file replaces .bashrc loading, so we must do it ourselves.
[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"

# Atmos-local command wrappers must stay ahead of PATH changes from direnv,
# virtualenvs, and prompt hooks.
__atmos_ensure_shims_path() {
    [[ -z "${ATMOS_SHIMS_BIN:-}" || ! -d "$ATMOS_SHIMS_BIN" ]] && return
    local filtered_path=":$PATH:"
    local shim_path="${ATMOS_SHIMS_BIN%/}"
    local shim_path_slash="$shim_path/"
    while [[ "$filtered_path" == *":$shim_path:"* || "$filtered_path" == *":$shim_path_slash:"* ]]; do
        filtered_path="${filtered_path//":$shim_path:"/:}"
        filtered_path="${filtered_path//":$shim_path_slash:"/:}"
    done
    filtered_path="${filtered_path#:}"
    filtered_path="${filtered_path%:}"
    export ATMOS_GROK_REAL_PATH="$filtered_path"
    export PATH="$shim_path${filtered_path:+:$filtered_path}"
}
__atmos_ensure_shims_path

# PATH can be rewritten asynchronously after shell startup, and prompt
# frameworks may replace the hooks below. Keep manual `grok` launches routed
# through the Atmos wrapper with a session-local shell function instead.
unalias grok 2>/dev/null || true
grok() {
    __atmos_ensure_shims_path
    local wrapper="${ATMOS_SHIMS_BIN%/}/grok"
    if [[ -n "${ATMOS_SHIMS_BIN:-}" && -x "$wrapper" ]]; then
        command "$wrapper" "$@"
    else
        command grok "$@"
    fi
}

# ── 2. Atmos hooks ────────────────────────────────────────────────────
__atmos_send_meta() {
    if [ -n "$TMUX" ]; then
        # Inside tmux: wrap in DCS passthrough (\ePtmux;\e<esc-seq>\e\\)
        # All \033 inside the sequence must be doubled to \033\033
        printf '\033Ptmux;\033\033]9999;%s:%s\007\033\\' "$1" "$2"
    else
        # Outside tmux: plain OSC
        printf '\033]9999;%s:%s\007' "$1" "$2"
    fi
}

# Flag to distinguish user-typed commands from internal evaluations.
# The DEBUG trap fires for EVERY simple command, including $PROMPT_COMMAND
# expansions and function internals. This flag ensures we only capture
# the actual user command once per prompt cycle.
__atmos_at_prompt=true

__atmos_preexec() {
    [ "$__atmos_at_prompt" != true ] && return
    __atmos_at_prompt=false
    __atmos_ensure_shims_path
    __atmos_send_meta "CMD_START" "$BASH_COMMAND"
}

__atmos_precmd() {
    __atmos_at_prompt=true
    __atmos_ensure_shims_path
    __atmos_send_meta "CMD_END" "$PWD"
}

trap '__atmos_preexec' DEBUG

# Append to PROMPT_COMMAND instead of overwriting, so user's prompt
# customizations (starship, oh-my-bash, etc.) continue to work.
if [[ -z "$PROMPT_COMMAND" ]]; then
    PROMPT_COMMAND="__atmos_precmd"
elif [[ "$PROMPT_COMMAND" != *"__atmos_precmd"* ]]; then
    PROMPT_COMMAND="${PROMPT_COMMAND};__atmos_precmd"
fi
