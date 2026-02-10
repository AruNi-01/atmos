# Atmos Terminal Dynamic Title Shim - Fish
#
# Sourced via `fish --init-command 'source /path/to/fish_shim.fish'`.
# Fish's --init-command runs BEFORE config.fish, so user customizations
# load normally after this.
#
# Protocol: \033]9999;TYPE:PAYLOAD\007
#   CMD_START:<command>  — a foreground command is starting
#   CMD_END:<cwd>        — the command finished, shell is idle at <cwd>
#
# Inside tmux, OSC sequences are wrapped in DCS passthrough so they
# reach the outer PTY reader (tmux drops unrecognized OSC codes).

function __atmos_send_meta
    if set -q TMUX
        # Inside tmux: wrap in DCS passthrough
        printf '\033Ptmux;\033\033]9999;%s:%s\007\033\\' $argv[1] $argv[2]
    else
        # Outside tmux: plain OSC
        printf '\033]9999;%s:%s\007' $argv[1] $argv[2]
    end
end

function __atmos_preexec --on-event fish_preexec
    __atmos_send_meta "CMD_START" "$argv"
end

function __atmos_precmd --on-event fish_prompt
    __atmos_send_meta "CMD_END" "$PWD"
end
