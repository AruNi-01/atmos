//! Per-agent TUI interrupt keys for automation Cancel.
//!
//! Prefer tmux `send-keys` of named keys over simulating xterm.js: after launch
//! we detach the Atmos PTY client (`close_session`), and Cancel is usually
//! clicked from the automations page with no terminal tab attached.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TuiInterruptKind {
    Escape,
    CtrlC,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TuiInterrupt {
    pub kind: TuiInterruptKind,
    pub count: u8,
}

impl TuiInterrupt {
    pub fn tmux_key_names(self) -> Vec<&'static str> {
        let key = match self.kind {
            TuiInterruptKind::Escape => "Escape",
            TuiInterruptKind::CtrlC => "C-c",
        };
        vec![key; self.count.max(1) as usize]
    }
}

/// Window name used when spawning an automation Terminal surface.
pub fn automation_tui_window_name(run_guid: &str) -> String {
    format!("auto-{}", run_guid.chars().take(8).collect::<String>())
}

/// Documented interrupt for the built-in interactive CLIs.
///
/// - Claude / Codex / Pi / Gemini: Esc stops the current turn (Ctrl+C often
///   starts an exit sequence when idle).
/// - OpenCode / Kilo: double Esc within the TUI interrupt window.
/// - Cursor Agent: Ctrl+C while busy (`ctrl+c to stop`); Esc only leaves pickers.
pub fn tui_interrupt_for_agent(agent_id: &str) -> TuiInterrupt {
    match agent_id.trim() {
        "opencode" | "kilocode" => TuiInterrupt {
            kind: TuiInterruptKind::Escape,
            count: 2,
        },
        "cursor" => TuiInterrupt {
            kind: TuiInterruptKind::CtrlC,
            count: 1,
        },
        _ => TuiInterrupt {
            kind: TuiInterruptKind::Escape,
            count: 1,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_agents_use_documented_interrupt_keys() {
        assert_eq!(
            tui_interrupt_for_agent("claude").tmux_key_names(),
            vec!["Escape"]
        );
        assert_eq!(
            tui_interrupt_for_agent("codex").tmux_key_names(),
            vec!["Escape"]
        );
        assert_eq!(
            tui_interrupt_for_agent("gemini").tmux_key_names(),
            vec!["Escape"]
        );
        assert_eq!(
            tui_interrupt_for_agent("pi").tmux_key_names(),
            vec!["Escape"]
        );
        assert_eq!(
            tui_interrupt_for_agent("opencode").tmux_key_names(),
            vec!["Escape", "Escape"]
        );
        assert_eq!(
            tui_interrupt_for_agent("kilocode").tmux_key_names(),
            vec!["Escape", "Escape"]
        );
        assert_eq!(
            tui_interrupt_for_agent("cursor").tmux_key_names(),
            vec!["C-c"]
        );
        assert_eq!(
            tui_interrupt_for_agent("mystery-cli").tmux_key_names(),
            vec!["Escape"]
        );
    }

    #[test]
    fn window_name_matches_web_short_run_id() {
        assert_eq!(automation_tui_window_name("run-2xxxx"), "auto-run-2xxx");
    }
}
