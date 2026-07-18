use serde::{Deserialize, Serialize};

/// Information about a tmux session
#[derive(Debug, Clone, Serialize)]
pub struct TmuxSessionInfo {
    pub name: String,
    pub windows: u32,
    pub created: String,
    pub attached: bool,
}

/// Information about a tmux window
#[derive(Debug, Clone, Serialize)]
pub struct TmuxWindowInfo {
    pub index: u32,
    pub name: String,
    pub active: bool,
    pub panes: u32,
}

/// Atmos-specific metadata stored on a tmux window through user options.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct TmuxWindowAtmosMetadata {
    pub terminal_kind: Option<String>,
    pub side_chat_id: Option<String>,
    pub context_id: Option<String>,
    pub source_pane_id: Option<String>,
    pub source_tmux_window_name: Option<String>,
}

/// Snapshot of a tmux pane for initial terminal hydration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmuxPaneSnapshot {
    pub data: String,
    pub cursor_x: u32,
    pub cursor_y: u32,
    pub cols: u32,
    pub rows: u32,
    pub alternate: bool,
    /// Whether the frontend should re-enable TUI mouse tracking after reattach.
    ///
    /// `capture-pane` restores cells, not DEC modes. Restore when:
    /// - the pane is on the alternate screen (standard full-screen TUIs), or
    /// - the foreground is a known **inline** mouse TUI (see
    ///   [`is_inline_mouse_tui_command`]) that enables mouse reporting without
    ///   alt-screen.
    ///
    /// Do **not** enable for arbitrary non-shell processes: that steals the
    /// wheel from xterm scrollback (`npm run dev`, non-mouse agent TUIs, etc.).
    #[serde(default)]
    pub restore_mouse_tracking: bool,
}

/// Shell names treated as "idle at prompt" for title/mouse restore heuristics.
pub fn is_shell_command(cmd: &str) -> bool {
    matches!(
        cmd.trim(),
        "zsh" | "bash" | "fish" | "sh" | "dash" | "ksh" | "tcsh" | "csh"
    )
}

/// Basename of `pane_current_command` (handles absolute paths).
pub fn pane_command_basename(cmd: &str) -> &str {
    let trimmed = cmd.trim();
    std::path::Path::new(trimmed)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(trimmed)
}

/// Interactive TUIs that enable mouse reporting **without** always entering the
/// alternate screen (e.g. Grok under tmux control mode / `alt_screen=auto`).
///
/// Keep this list tight: each entry opts the process into mouse mode on reattach,
/// which disables xterm wheel scrollback until the app exits or sends disable.
///
/// Grok's installed binary is versioned (`grok-0.2.103-macos-aarch64`); the
/// `grok` PATH entry is only a symlink. tmux `#{pane_current_command}` reports
/// that versioned basename (sometimes truncated), not `grok`.
pub fn is_inline_mouse_tui_command(cmd: &str) -> bool {
    let name = pane_command_basename(cmd);
    name == "grok" || name.starts_with("grok-")
}

/// Decide whether reattach hydration should re-enable xterm mouse tracking.
pub fn should_restore_tui_mouse_tracking(alternate: bool, current_command: &str) -> bool {
    if alternate {
        return true;
    }
    is_inline_mouse_tui_command(current_command)
}

/// One page of tmux scrollback for canvas `extract-text` pagination.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmuxPaneCapturePage {
    pub snapshot: TmuxPaneSnapshot,
    pub skip_from_bottom: i32,
    pub lines_returned: u32,
    pub has_more_older: bool,
    pub next_skip_from_bottom: Option<i32>,
}

/// Tmux version information
#[derive(Debug, Clone, Serialize)]
pub struct TmuxVersion {
    pub major: u32,
    pub minor: u32,
    pub raw: String,
}

impl TmuxVersion {
    /// Check if version is at least the specified major.minor
    pub fn at_least(&self, major: u32, minor: u32) -> bool {
        self.major > major || (self.major == major && self.minor >= minor)
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct TmuxInstallPlan {
    pub installed: bool,
    pub supported: bool,
    pub platform: String,
    pub package_manager: Option<String>,
    pub package_manager_label: Option<String>,
    pub command: Option<String>,
    pub requires_sudo: bool,
    pub reason: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::{
        is_inline_mouse_tui_command, is_shell_command, pane_command_basename,
        should_restore_tui_mouse_tracking, TmuxVersion,
    };

    #[test]
    fn test_version_at_least() {
        let v = TmuxVersion {
            major: 3,
            minor: 4,
            raw: "tmux 3.4".to_string(),
        };
        assert!(v.at_least(3, 4));
        assert!(v.at_least(3, 3));
        assert!(v.at_least(2, 9));
        assert!(!v.at_least(3, 5));
        assert!(!v.at_least(4, 0));
    }

    #[test]
    fn shell_commands_are_recognized() {
        assert!(is_shell_command("zsh"));
        assert!(is_shell_command(" bash "));
        assert!(!is_shell_command("grok"));
        assert!(!is_shell_command("opencode"));
        assert!(!is_shell_command("node"));
    }

    #[test]
    fn pane_command_basename_strips_path() {
        assert_eq!(pane_command_basename("grok"), "grok");
        assert_eq!(pane_command_basename("/Users/me/.grok/bin/grok"), "grok");
        assert_eq!(pane_command_basename("  /usr/bin/node  "), "node");
    }

    #[test]
    fn inline_mouse_tui_whitelist_is_tight() {
        assert!(is_inline_mouse_tui_command("grok"));
        assert!(is_inline_mouse_tui_command("/Users/me/.grok/bin/grok"));
        // Versioned install binary (and tmux-truncated form).
        assert!(is_inline_mouse_tui_command("grok-0.2.103-macos-aarch64"));
        assert!(is_inline_mouse_tui_command("grok-0.2.103-ma"));
        assert!(is_inline_mouse_tui_command(
            "/Users/me/.grok/downloads/grok-0.2.103-macos-aarch64"
        ));
        assert!(!is_inline_mouse_tui_command("opencode"));
        assert!(!is_inline_mouse_tui_command("claude"));
        assert!(!is_inline_mouse_tui_command("node"));
        assert!(!is_inline_mouse_tui_command("npm"));
        assert!(!is_inline_mouse_tui_command("zsh"));
        assert!(!is_inline_mouse_tui_command("grokker"));
    }

    #[test]
    fn mouse_restore_for_alternate_or_inline_mouse_tui_only() {
        // Alternate screen: always restore (OpenCode, vim, htop, …).
        assert!(should_restore_tui_mouse_tracking(true, "zsh"));
        assert!(should_restore_tui_mouse_tracking(true, "opencode"));
        assert!(should_restore_tui_mouse_tracking(true, "npm"));

        // Inline mouse TUI whitelist (Grok without alt-screen).
        assert!(should_restore_tui_mouse_tracking(false, "grok"));
        assert!(should_restore_tui_mouse_tracking(
            false,
            "/Users/me/.grok/bin/grok"
        ));
        assert!(should_restore_tui_mouse_tracking(
            false,
            "grok-0.2.103-ma"
        ));
        assert!(should_restore_tui_mouse_tracking(
            false,
            "grok-0.2.103-macos-aarch64"
        ));

        // Everything else without alt-screen: keep xterm wheel scrollback.
        assert!(!should_restore_tui_mouse_tracking(false, "opencode"));
        assert!(!should_restore_tui_mouse_tracking(false, "claude"));
        assert!(!should_restore_tui_mouse_tracking(false, "node"));
        assert!(!should_restore_tui_mouse_tracking(false, "npm"));
        assert!(!should_restore_tui_mouse_tracking(false, "zsh"));
        assert!(!should_restore_tui_mouse_tracking(false, ""));
    }
}
