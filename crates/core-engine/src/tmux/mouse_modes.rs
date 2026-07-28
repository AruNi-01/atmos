//! Track DEC mouse-reporting modes from pane output (Ghostty-style state).
//!
//! `capture-pane` restores cells only. Full-screen TUIs enable mouse via DECSET
//! (`1000`/`1002`/`1003`/`1006`/…). Atmos observes those sequences on the live
//! control-mode stream, persists the effective mode on the tmux pane, and
//! reattaches with an exact restore sequence instead of a fixed guess.
//!
//! Event modes follow xterm.js exclusivity (last enable wins among
//! 9/1000/1002/1003). Format modes are independent (1005/1006/1015/1016).

use std::fmt;

/// Exclusive mouse event protocol (matches xterm.js `CoreMouseService`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum MouseEventMode {
    #[default]
    None,
    /// DECSET 9 — X10 (press only)
    X10,
    /// DECSET 1000 — VT200 press/release/wheel
    Normal,
    /// DECSET 1002 — button-event / drag
    Button,
    /// DECSET 1003 — any-event including hover (no button held)
    Any,
}

/// Mouse coordinate encoding.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum MouseFormat {
    #[default]
    Default,
    /// DECSET 1005
    Utf8,
    /// DECSET 1006 — SGR (most modern TUIs)
    Sgr,
    /// DECSET 1015
    Urxvt,
    /// DECSET 1016 — SGR pixels
    SgrPixels,
}

/// Effective mouse-reporting state observed from the application stream.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct MouseModeState {
    pub event: MouseEventMode,
    pub format: MouseFormat,
    pub focus_event: bool,
}

/// tmux pane user-option key for persisted mouse tracking state.
pub const ATMOS_MOUSE_TRACKING_OPTION: &str = "@atmos_mouse_tracking";

/// Default restore when we know the pane needs mouse but never observed modes
/// (first attach to an already-running alt-screen / inline TUI).
///
/// Includes `1003` so hover works; xterm.js last-wins among event modes.
pub const DEFAULT_TUI_MOUSE_RESTORE: &str = "\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h";

impl MouseModeState {
    pub fn is_active(&self) -> bool {
        self.event != MouseEventMode::None
    }

    /// Compact persist form: `none` | `any+sgr` | `button+sgr` | `normal` | …
    pub fn encode_persist(&self) -> String {
        if !self.is_active() {
            return "none".to_string();
        }
        let event = match self.event {
            MouseEventMode::None => "none",
            MouseEventMode::X10 => "x10",
            MouseEventMode::Normal => "normal",
            MouseEventMode::Button => "button",
            MouseEventMode::Any => "any",
        };
        let format = match self.format {
            MouseFormat::Default => "",
            MouseFormat::Utf8 => "+utf8",
            MouseFormat::Sgr => "+sgr",
            MouseFormat::Urxvt => "+urxvt",
            MouseFormat::SgrPixels => "+sgr_pixels",
        };
        let focus = if self.focus_event { "+focus" } else { "" };
        format!("{event}{format}{focus}")
    }

    /// Parse a value written by [`Self::encode_persist`].
    ///
    /// Returns `None` for empty / unrecognized strings (treat as "never observed").
    pub fn decode_persist(raw: &str) -> Option<Self> {
        let raw = raw.trim();
        if raw.is_empty() {
            return None;
        }
        if raw == "none" {
            return Some(Self::default());
        }

        let mut parts = raw.split('+');
        let event = match parts.next()? {
            "x10" => MouseEventMode::X10,
            "normal" => MouseEventMode::Normal,
            "button" => MouseEventMode::Button,
            "any" => MouseEventMode::Any,
            _ => return None,
        };

        let mut format = MouseFormat::Default;
        let mut focus_event = false;
        for part in parts {
            match part {
                "utf8" => format = MouseFormat::Utf8,
                "sgr" => format = MouseFormat::Sgr,
                "urxvt" => format = MouseFormat::Urxvt,
                "sgr_pixels" => format = MouseFormat::SgrPixels,
                "focus" => focus_event = true,
                _ => {}
            }
        }

        Some(Self {
            event,
            format,
            focus_event,
        })
    }

    /// DECSET sequence that recreates this state in xterm.js after `reset()`.
    pub fn restore_sequence(&self) -> String {
        if !self.is_active() {
            return String::new();
        }

        let mut out = String::with_capacity(48);
        // Enable lower modes then the highest so exclusive last-wins ends correct.
        match self.event {
            MouseEventMode::None => {}
            MouseEventMode::X10 => out.push_str("\x1b[?9h"),
            MouseEventMode::Normal => out.push_str("\x1b[?1000h"),
            MouseEventMode::Button => out.push_str("\x1b[?1000h\x1b[?1002h"),
            MouseEventMode::Any => out.push_str("\x1b[?1000h\x1b[?1002h\x1b[?1003h"),
        }
        match self.format {
            MouseFormat::Default => {}
            MouseFormat::Utf8 => out.push_str("\x1b[?1005h"),
            MouseFormat::Sgr => out.push_str("\x1b[?1006h"),
            MouseFormat::Urxvt => out.push_str("\x1b[?1015h"),
            MouseFormat::SgrPixels => out.push_str("\x1b[?1016h"),
        }
        if self.focus_event {
            out.push_str("\x1b[?1004h");
        }
        out
    }

    /// Scan `data` for DEC private mode set/reset affecting mouse tracking.
    /// Returns `true` when effective state changed.
    pub fn observe_bytes(&mut self, data: &[u8]) -> bool {
        let before = *self;
        let mut i = 0;
        while i < data.len() {
            // CSI: ESC [  or  0x9B
            let csi_start = if data[i] == 0x1b {
                if i + 1 < data.len() && data[i + 1] == b'[' {
                    i + 2
                } else {
                    i += 1;
                    continue;
                }
            } else if data[i] == 0x9b {
                i + 1
            } else {
                i += 1;
                continue;
            };

            // Private DEC modes use '?' after CSI.
            if csi_start >= data.len() || data[csi_start] != b'?' {
                i = csi_start;
                continue;
            }

            let mut j = csi_start + 1;
            while j < data.len() {
                let b = data[j];
                if b == b'h' || b == b'l' {
                    let params = &data[csi_start + 1..j];
                    let enable = b == b'h';
                    self.apply_private_params(params, enable);
                    j += 1;
                    break;
                }
                // Parameter bytes / intermediate: 0x20-0x3F and digits/semicolon
                if !(b.is_ascii_digit() || b == b';' || (0x20..=0x3f).contains(&b)) {
                    j += 1;
                    break;
                }
                j += 1;
            }
            i = j;
        }
        *self != before
    }

    fn apply_private_params(&mut self, params: &[u8], enable: bool) {
        for part in params.split(|b| *b == b';') {
            if part.is_empty() {
                continue;
            }
            let Ok(text) = std::str::from_utf8(part) else {
                continue;
            };
            let Ok(mode) = text.parse::<u16>() else {
                continue;
            };
            self.apply_mode(mode, enable);
        }
    }

    fn apply_mode(&mut self, mode: u16, enable: bool) {
        match mode {
            9 => {
                if enable {
                    self.event = MouseEventMode::X10;
                } else if self.event == MouseEventMode::X10 {
                    self.event = MouseEventMode::None;
                }
            }
            // xterm.js: resetting any of 1000/1002/1003 clears the protocol.
            1000 => {
                if enable {
                    self.event = MouseEventMode::Normal;
                } else {
                    self.event = MouseEventMode::None;
                }
            }
            1002 => {
                if enable {
                    self.event = MouseEventMode::Button;
                } else {
                    self.event = MouseEventMode::None;
                }
            }
            1003 => {
                if enable {
                    self.event = MouseEventMode::Any;
                } else {
                    self.event = MouseEventMode::None;
                }
            }
            1004 => self.focus_event = enable,
            1005 => {
                if enable {
                    self.format = MouseFormat::Utf8;
                } else if self.format == MouseFormat::Utf8 {
                    self.format = MouseFormat::Default;
                }
            }
            1006 => {
                if enable {
                    self.format = MouseFormat::Sgr;
                } else if self.format == MouseFormat::Sgr {
                    self.format = MouseFormat::Default;
                }
            }
            1015 => {
                if enable {
                    self.format = MouseFormat::Urxvt;
                } else if self.format == MouseFormat::Urxvt {
                    self.format = MouseFormat::Default;
                }
            }
            1016 => {
                if enable {
                    self.format = MouseFormat::SgrPixels;
                } else if self.format == MouseFormat::SgrPixels {
                    self.format = MouseFormat::Default;
                }
            }
            _ => {}
        }
    }
}

impl fmt::Display for MouseModeState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.encode_persist())
    }
}

/// Resolve what the frontend should inject after snapshot hydrate.
///
/// - Observed active state → exact sequence  
/// - Observed inactive (`none`) → do not restore  
/// - Never observed → alt-screen / inline-TUI heuristic with full default  
pub fn resolve_mouse_tracking_restore(
    observed: Option<MouseModeState>,
    alternate: bool,
    current_command: &str,
) -> (bool, Option<String>) {
    match observed {
        Some(state) if state.is_active() => (true, Some(state.restore_sequence())),
        Some(_) => (false, None),
        None => {
            if super::types::should_restore_tui_mouse_tracking(alternate, current_command) {
                (true, Some(DEFAULT_TUI_MOUSE_RESTORE.to_string()))
            } else {
                (false, None)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sgr_any_event_chain() {
        let mut state = MouseModeState::default();
        let changed = state.observe_bytes(b"\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h");
        assert!(changed);
        assert_eq!(state.event, MouseEventMode::Any);
        assert_eq!(state.format, MouseFormat::Sgr);
        assert_eq!(
            state.restore_sequence(),
            "\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h"
        );
    }

    #[test]
    fn combined_csi_params() {
        let mut state = MouseModeState::default();
        state.observe_bytes(b"\x1b[?1000;1002;1003;1006h");
        assert_eq!(state.event, MouseEventMode::Any);
        assert_eq!(state.format, MouseFormat::Sgr);
    }

    #[test]
    fn button_only_without_hover() {
        let mut state = MouseModeState::default();
        state.observe_bytes(b"\x1b[?1000h\x1b[?1002h\x1b[?1006h");
        assert_eq!(state.event, MouseEventMode::Button);
        assert_eq!(
            state.restore_sequence(),
            "\x1b[?1000h\x1b[?1002h\x1b[?1006h"
        );
        assert!(!state.restore_sequence().contains("1003"));
    }

    #[test]
    fn disable_clears_event() {
        let mut state = MouseModeState::default();
        state.observe_bytes(b"\x1b[?1003h\x1b[?1006h");
        assert!(state.is_active());
        state.observe_bytes(b"\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l");
        assert!(!state.is_active());
        assert_eq!(state.format, MouseFormat::Default);
        assert_eq!(state.encode_persist(), "none");
    }

    #[test]
    fn later_1002_downgrades_from_any() {
        // Mirrors xterm exclusive protocol: ENABLE without 1003 would clobber hover.
        let mut state = MouseModeState::default();
        state.observe_bytes(b"\x1b[?1003h\x1b[?1006h");
        assert_eq!(state.event, MouseEventMode::Any);
        state.observe_bytes(b"\x1b[?1000h\x1b[?1002h\x1b[?1006h");
        assert_eq!(state.event, MouseEventMode::Button);
    }

    #[test]
    fn persist_roundtrip() {
        let state = MouseModeState {
            event: MouseEventMode::Any,
            format: MouseFormat::Sgr,
            focus_event: true,
        };
        let encoded = state.encode_persist();
        assert_eq!(encoded, "any+sgr+focus");
        assert_eq!(MouseModeState::decode_persist(&encoded), Some(state));
        assert_eq!(MouseModeState::decode_persist("none"), Some(MouseModeState::default()));
        assert_eq!(MouseModeState::decode_persist(""), None);
        assert_eq!(MouseModeState::decode_persist("bogus"), None);
    }

    #[test]
    fn resolve_prefers_observed_exact_sequence() {
        let observed = MouseModeState {
            event: MouseEventMode::Button,
            format: MouseFormat::Sgr,
            focus_event: false,
        };
        let (restore, seq) = resolve_mouse_tracking_restore(Some(observed), true, "claude");
        assert!(restore);
        assert_eq!(seq.as_deref(), Some("\x1b[?1000h\x1b[?1002h\x1b[?1006h"));
    }

    #[test]
    fn resolve_observed_none_skips_even_on_alternate() {
        let (restore, seq) =
            resolve_mouse_tracking_restore(Some(MouseModeState::default()), true, "vim");
        assert!(!restore);
        assert!(seq.is_none());
    }

    #[test]
    fn resolve_unobserved_uses_heuristic_with_hover() {
        let (restore, seq) = resolve_mouse_tracking_restore(None, true, "claude");
        assert!(restore);
        assert_eq!(seq.as_deref(), Some(DEFAULT_TUI_MOUSE_RESTORE));
        assert!(seq.unwrap().contains("1003"));

        let (restore, seq) = resolve_mouse_tracking_restore(None, false, "zsh");
        assert!(!restore);
        assert!(seq.is_none());

        let (restore, seq) = resolve_mouse_tracking_restore(None, false, "grok-0.2.103-ma");
        assert!(restore);
        assert_eq!(seq.as_deref(), Some(DEFAULT_TUI_MOUSE_RESTORE));
    }

    #[test]
    fn ignores_unrelated_csi() {
        let mut state = MouseModeState::default();
        let changed = state.observe_bytes(b"hello\x1b[31mred\x1b[0m\x1b[?2004h");
        assert!(!changed);
        assert!(!state.is_active());
    }
}
