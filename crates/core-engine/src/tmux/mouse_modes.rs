//! Track DEC mouse-reporting modes from pane output.
//!
//! `capture-pane` restores cells only. Full-screen TUIs enable mouse via DECSET
//! (`1000`/`1002`/`1003`/`1006`/…). Atmos observes those sequences on the live
//! `pipe-pane` byte stream (APP-062), persists the effective mode on the tmux
//! pane, and reattaches with an exact restore sequence instead of a fixed guess.
//!
//! Event modes follow xterm.js exclusivity (last enable wins among
//! 9/1000/1002/1003). Format modes are independent (1005/1006/1015/1016).
//!
//! Pipe chunks can split CSI private-mode sequences; incomplete trailing
//! prefixes are retained and completed on the next chunk (APP-054).

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

/// Cap residual incomplete CSI so a hostile/corrupt stream cannot grow unbounded.
const PRIVATE_MODE_RESIDUAL_LIMIT: usize = 4096;

/// Effective mouse-reporting state observed from the application stream.
///
/// Equality ignores the residual CSI buffer (only event/format/focus matter for
/// persist and restore decisions).
#[derive(Debug, Clone, Default)]
pub struct MouseModeState {
    pub event: MouseEventMode,
    pub format: MouseFormat,
    pub focus_event: bool,
    /// Incomplete trailing `ESC[?…` / C1 CSI private-mode prefix from a prior chunk.
    residual: Vec<u8>,
}

impl PartialEq for MouseModeState {
    fn eq(&self, other: &Self) -> bool {
        self.event == other.event
            && self.format == other.format
            && self.focus_event == other.focus_event
    }
}

impl Eq for MouseModeState {}

/// tmux pane user-option key for persisted mouse tracking state.
pub const ATMOS_MOUSE_TRACKING_OPTION: &str = "@atmos_mouse_tracking";

/// Default restore when we know the pane needs mouse but never observed modes
/// (first attach to an already-running alt-screen / inline TUI), or when a
/// persisted inactive observation is treated as stale under alt/inline policy.
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
            residual: Vec::new(),
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
    /// Returns `true` when effective mode state changed.
    ///
    /// Incomplete trailing private CSI prefixes are retained and completed on
    /// subsequent calls (control-mode chunks may split mid-sequence).
    pub fn observe_bytes(&mut self, data: &[u8]) -> bool {
        if data.is_empty() && self.residual.is_empty() {
            return false;
        }

        let before = (self.event, self.format, self.focus_event);

        let input: Vec<u8> = if self.residual.is_empty() {
            data.to_vec()
        } else {
            let mut combined = std::mem::take(&mut self.residual);
            combined.extend_from_slice(data);
            combined
        };

        let mut i = 0;
        while i < input.len() {
            // Full reset (RIS) clears mouse modes and residual.
            if input[i] == 0x1b && i + 1 < input.len() && input[i + 1] == b'c' {
                self.event = MouseEventMode::None;
                self.format = MouseFormat::Default;
                self.focus_event = false;
                self.residual.clear();
                i += 2;
                continue;
            }

            // CSI: ESC [  or  0x9B
            let csi_start = if input[i] == 0x1b {
                if i + 1 < input.len() && input[i + 1] == b'[' {
                    i + 2
                } else if i + 1 >= input.len() {
                    // Lone ESC at end — keep residual.
                    self.store_residual(&input[i..]);
                    break;
                } else {
                    i += 1;
                    continue;
                }
            } else if input[i] == 0x9b {
                i + 1
            } else {
                i += 1;
                continue;
            };

            // Incomplete after CSI introducer.
            if csi_start >= input.len() {
                self.store_residual(&input[i..]);
                break;
            }

            // Private DEC modes use '?' after CSI.
            if input[csi_start] != b'?' {
                i = csi_start;
                continue;
            }

            let mut j = csi_start + 1;
            let mut terminated = false;
            while j < input.len() {
                let b = input[j];
                if b == b'h' || b == b'l' {
                    let params = &input[csi_start + 1..j];
                    let enable = b == b'h';
                    self.apply_private_params(params, enable);
                    j += 1;
                    terminated = true;
                    break;
                }
                // Parameter bytes: digits and semicolon (private params).
                if !(b.is_ascii_digit() || b == b';') {
                    // Invalid / unrelated private CSI — drop residual and skip.
                    j += 1;
                    terminated = true;
                    break;
                }
                j += 1;
            }

            if !terminated {
                // Incomplete private mode CSI — retain from introducer.
                self.store_residual(&input[i..]);
                break;
            }
            i = j;
        }

        let after = (self.event, self.format, self.focus_event);
        before != after
    }

    fn store_residual(&mut self, bytes: &[u8]) {
        if bytes.is_empty() {
            self.residual.clear();
            return;
        }
        if bytes.len() > PRIVATE_MODE_RESIDUAL_LIMIT {
            self.residual.clear();
            return;
        }
        self.residual = bytes.to_vec();
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
/// - Observed inactive (`none`) → still restore when alt-screen or known
///   inline mouse TUI (stale/incomplete observation must not steal the wheel
///   from an active TUI); otherwise no restore
/// - Never observed → alt-screen / inline-TUI heuristic with full default
pub fn resolve_mouse_tracking_restore(
    observed: Option<MouseModeState>,
    alternate: bool,
    current_command: &str,
) -> (bool, Option<String>) {
    match observed {
        Some(state) if state.is_active() => (true, Some(state.restore_sequence())),
        Some(_) | None => {
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
            residual: Vec::new(),
        };
        let encoded = state.encode_persist();
        assert_eq!(encoded, "any+sgr+focus");
        assert_eq!(MouseModeState::decode_persist(&encoded), Some(state));
        assert_eq!(
            MouseModeState::decode_persist("none"),
            Some(MouseModeState::default())
        );
        assert_eq!(MouseModeState::decode_persist(""), None);
        assert_eq!(MouseModeState::decode_persist("bogus"), None);
    }

    #[test]
    fn resolve_prefers_observed_exact_sequence() {
        let observed = MouseModeState {
            event: MouseEventMode::Button,
            format: MouseFormat::Sgr,
            focus_event: false,
            residual: Vec::new(),
        };
        let (restore, seq) = resolve_mouse_tracking_restore(Some(observed), true, "claude");
        assert!(restore);
        assert_eq!(seq.as_deref(), Some("\x1b[?1000h\x1b[?1002h\x1b[?1006h"));
    }

    #[test]
    fn resolve_observed_none_still_restores_on_alternate() {
        // APP-054: bare inactive must not suppress alt-screen TUI restore.
        let (restore, seq) =
            resolve_mouse_tracking_restore(Some(MouseModeState::default()), true, "vim");
        assert!(restore);
        assert_eq!(seq.as_deref(), Some(DEFAULT_TUI_MOUSE_RESTORE));
        assert!(seq.unwrap().contains("1003"));
    }

    #[test]
    fn resolve_observed_none_still_restores_inline_mouse_tui() {
        let (restore, seq) = resolve_mouse_tracking_restore(
            Some(MouseModeState::default()),
            false,
            "grok-0.2.103-ma",
        );
        assert!(restore);
        assert_eq!(seq.as_deref(), Some(DEFAULT_TUI_MOUSE_RESTORE));
    }

    #[test]
    fn resolve_observed_none_skips_idle_shell() {
        let (restore, seq) =
            resolve_mouse_tracking_restore(Some(MouseModeState::default()), false, "zsh");
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

    #[test]
    fn multi_chunk_enable_completes_private_csi() {
        let mut state = MouseModeState::default();
        let changed1 = state.observe_bytes(b"\x1b[?1000;1002");
        assert!(!changed1);
        assert!(!state.is_active());
        let changed2 = state.observe_bytes(b";1003;1006h");
        assert!(changed2);
        assert_eq!(state.event, MouseEventMode::Any);
        assert_eq!(state.format, MouseFormat::Sgr);
    }

    #[test]
    fn multi_chunk_disable_completes_private_csi() {
        let mut state = MouseModeState::default();
        state.observe_bytes(b"\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h");
        assert!(state.is_active());
        let changed1 = state.observe_bytes(b"\x1b[?1000;1002;1003");
        assert!(!changed1);
        assert!(state.is_active());
        let changed2 = state.observe_bytes(b";1006l");
        assert!(changed2);
        assert!(!state.is_active());
        assert_eq!(state.format, MouseFormat::Default);
    }

    #[test]
    fn multi_chunk_split_after_question_mark() {
        let mut state = MouseModeState::default();
        assert!(!state.observe_bytes(b"\x1b[?"));
        assert!(state.observe_bytes(b"1003h\x1b[?1006h"));
        assert_eq!(state.event, MouseEventMode::Any);
        assert_eq!(state.format, MouseFormat::Sgr);
    }
}
