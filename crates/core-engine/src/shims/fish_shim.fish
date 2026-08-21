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

function __atmos_ensure_shims_path
    if set -q ATMOS_SHIMS_BIN; and test -d "$ATMOS_SHIMS_BIN"
        set -l shim_path (string trim -r -c / -- "$ATMOS_SHIMS_BIN")
        set -l filtered
        for path_entry in $PATH
            if test (string trim -r -c / -- "$path_entry") != "$shim_path"
                set -a filtered "$path_entry"
            end
        end
        set -gx ATMOS_GROK_REAL_PATH (string join : -- $filtered)
        set -gx PATH "$shim_path" $filtered
    end
end

function __atmos_install_grok_function
    if set -q ATMOS_SHIMS_BIN
        functions -e grok 2>/dev/null
        function grok
            __atmos_ensure_shims_path
            set -l wrapper (string trim -r -c / -- "$ATMOS_SHIMS_BIN")/grok
            if test -x "$wrapper"
                command "$wrapper" $argv
            else
                command grok $argv
            end
        end
    end
end

# --init-command runs before config.fish; repeat at the first prompt in case
# user configuration replaces PATH after this file is sourced.
__atmos_ensure_shims_path
__atmos_install_grok_function

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
    __atmos_ensure_shims_path
    __atmos_install_grok_function
    __atmos_send_meta "CMD_START" "$argv"
end

function __atmos_precmd --on-event fish_prompt
    __atmos_ensure_shims_path
    __atmos_install_grok_function
    __atmos_send_meta "CMD_END" "$PWD"
end
