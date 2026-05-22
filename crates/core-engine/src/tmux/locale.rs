use std::process::Command;

use super::TmuxEngine;

fn is_utf8_locale(value: &str) -> bool {
    let upper = value.to_ascii_uppercase();
    upper.contains("UTF-8") || upper.contains("UTF8")
}

fn default_utf8_locale() -> String {
    #[cfg(target_os = "macos")]
    {
        "en_US.UTF-8".to_string()
    }
    #[cfg(not(target_os = "macos"))]
    {
        "C.UTF-8".to_string()
    }
}

pub(crate) fn resolve_utf8_locale() -> String {
    std::env::var("LC_CTYPE")
        .ok()
        .filter(|v| is_utf8_locale(v))
        .or_else(|| std::env::var("LANG").ok().filter(|v| is_utf8_locale(v)))
        .unwrap_or_else(default_utf8_locale)
}

pub(crate) fn apply_utf8_env(cmd: &mut Command) {
    let locale = resolve_utf8_locale();
    cmd.env("LANG", &locale);
    cmd.env("LC_CTYPE", &locale);
}

impl TmuxEngine {
    /// Keep tmux server environment UTF-8 so new shells inside windows render
    /// Nerd Font / Powerline glyphs instead of falling back to ASCII placeholders.
    /// Also injects `ATMOS_MANAGED=1` so agent hook scripts can distinguish
    /// Atmos-managed terminals from external terminals.
    fn sync_utf8_environment(&self) {
        let locale = resolve_utf8_locale();
        let _ = self.run_tmux(&["set-environment", "-g", "LANG", &locale]);
        let _ = self.run_tmux(&["set-environment", "-g", "LC_CTYPE", &locale]);
        let _ = self.run_tmux(&["set-environment", "-g", "ATMOS_MANAGED", "1"]);
    }

    /// Apply the standard tmux configuration options for Atmos sessions.
    ///
    /// Key design decisions:
    /// - **Control mode transport**: tmux sends raw pane output via `%output`,
    ///   so xterm.js receives the application's real terminal stream and builds
    ///   scrollback naturally.
    /// - **xterm TERM inside panes**: applications target xterm.js semantics.
    ///   Several modern full-screen TUIs rely on xterm's background-color erase
    ///   behavior for sparse redraws; `tmux-256color` lacks that capability on
    ///   macOS and leaves stale cells behind in tmux's own pane state.
    /// - **Alternate screen enabled**: TUI apps use the alternate buffer
    ///   normally instead of leaking frames into scrollback.
    /// - **Mouse OFF**: xterm.js handles all scrolling locally (native scrollbar,
    ///   smooth scroll, 10K line buffer). TUI apps that enable their own mouse
    ///   tracking still work because they send escape sequences directly.
    fn apply_standard_config(&self) {
        let _ = self.run_tmux(&["set-option", "-g", "status", "off"]);
        let _ = self.run_tmux(&["set-option", "-g", "default-terminal", "xterm-256color"]);
        let _ = self.run_tmux(&["set-option", "-g", "allow-passthrough", "on"]);
        let _ = self.run_tmux(&["set-option", "-g", "mouse", "off"]);
        let _ = self.run_tmux(&["set-option", "-gu", "terminal-features"]);
        let _ = self.run_tmux(&["set-option", "-ga", "terminal-features", "xterm*:RGB"]);
        let _ = self.run_tmux(&["set-option", "-gu", "terminal-overrides"]);
        let _ = self.run_tmux(&["set-option", "-g", "history-limit", "10000"]);
        // Keep automatic sizing enabled for tmux window creation. tmux 3.6a can
        // exit unexpectedly when `new-window` runs with global `window-size
        // manual`; Atmos still pins real browser sizes explicitly after attach.
        let _ = self.run_tmux(&["set-option", "-g", "aggressive-resize", "off"]);
        let _ = self.run_tmux(&["set-option", "-g", "window-size", "latest"]);
        let _ = self.run_tmux(&["set-option", "-g", "allow-rename", "off"]);
        let _ = self.run_tmux(&["set-option", "-g", "automatic-rename", "off"]);
    }

    /// Re-apply Atmos' tmux server/session defaults to an existing server.
    ///
    /// This is intentionally idempotent and is called before attach as well as
    /// create, because development sessions may have been created by an older
    /// binary with stale terminal-overrides.
    pub fn ensure_standard_config(&self) {
        self.sync_utf8_environment();
        self.apply_standard_config();
    }
}
