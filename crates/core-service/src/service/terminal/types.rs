use chrono::NaiveDateTime;
use core_engine::TmuxPaneSnapshot;
use std::path::PathBuf;
use std::time::Instant;
use tokio::sync::mpsc;

/// Commands that can be sent to a terminal session thread
#[derive(Debug)]
pub(super) enum SessionCommand {
    Write(Vec<u8>),
    Enter,
    Report(Vec<u8>),
    Resize {
        cols: u16,
        rows: u16,
    },
    /// Close the terminal session. Control-mode sessions already know their
    /// client session/socket; fields are kept so simple and tmux sessions share
    /// one command shape.
    Close {
        client_session: Option<String>,
        socket_path: Option<PathBuf>,
    },
}

/// Type of terminal session
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionType {
    /// Tmux-backed persistent terminal
    Tmux,
    /// Simple PTY without tmux (e.g., Run Script)
    Simple,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TerminalKind {
    #[default]
    Standard,
    SideChat,
}

impl TerminalKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            TerminalKind::Standard => "standard",
            TerminalKind::SideChat => "side_chat",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TerminalSideChatStatus {
    Open,
    Hidden,
    Closing,
}

impl TerminalSideChatStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TerminalSideChatStatus::Open => "open",
            TerminalSideChatStatus::Hidden => "hidden",
            TerminalSideChatStatus::Closing => "closing",
        }
    }
}

impl TryFrom<&str> for TerminalSideChatStatus {
    type Error = String;

    fn try_from(value: &str) -> std::result::Result<Self, Self::Error> {
        match value {
            "open" | "visible" => Ok(Self::Open),
            "hidden" => Ok(Self::Hidden),
            "closing" | "closed" => Ok(Self::Closing),
            other => Err(format!("invalid side chat status: {other}")),
        }
    }
}

/// Terminal session handle - thread-safe wrapper for PTY session
pub(super) struct SessionHandle {
    pub(super) command_tx: mpsc::UnboundedSender<SessionCommand>,
    pub(super) workspace_id: String,
    pub(super) tmux_session: Option<String>,
    pub(super) tmux_window_index: Option<u32>,
    pub(super) client_session: Option<String>,
    pub(super) session_type: SessionType,
    pub(super) project_name: Option<String>,
    pub(super) workspace_name: Option<String>,
    pub(super) terminal_name: Option<String>,
    pub(super) cwd: Option<String>,
    pub(super) terminal_kind: TerminalKind,
    pub(super) side_chat_id: Option<String>,
    pub(super) source_pane_id: Option<String>,
    pub(super) source_tmux_window_name: Option<String>,
    pub(super) created_at: Instant,
}

/// Detailed session information for the terminal manager UI
#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionDetail {
    pub session_id: String,
    pub workspace_id: String,
    pub session_type: SessionType,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
    pub terminal_name: Option<String>,
    pub tmux_session: Option<String>,
    pub tmux_window_index: Option<u32>,
    pub cwd: Option<String>,
    pub terminal_kind: TerminalKind,
    pub side_chat_id: Option<String>,
    pub source_pane_id: Option<String>,
    pub source_tmux_window_name: Option<String>,
    /// Seconds since the session was created
    pub uptime_secs: u64,
}

impl SessionHandle {
    pub(super) fn to_detail(&self, session_id: &str) -> SessionDetail {
        SessionDetail {
            session_id: session_id.to_string(),
            workspace_id: self.workspace_id.clone(),
            session_type: self.session_type.clone(),
            project_name: self.project_name.clone(),
            workspace_name: self.workspace_name.clone(),
            terminal_name: self.terminal_name.clone(),
            tmux_session: self.tmux_session.clone(),
            tmux_window_index: self.tmux_window_index,
            cwd: self.cwd.clone(),
            terminal_kind: self.terminal_kind.clone(),
            side_chat_id: self.side_chat_id.clone(),
            source_pane_id: self.source_pane_id.clone(),
            source_tmux_window_name: self.source_tmux_window_name.clone(),
            uptime_secs: self.created_at.elapsed().as_secs(),
        }
    }
}

/// Message types for terminal communication
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TerminalMessage {
    /// Create a new terminal session
    TerminalCreate {
        workspace_id: String,
        _shell: Option<String>,
    },
    /// Attach to an existing terminal session (reconnection)
    TerminalAttach {
        session_id: String,
        workspace_id: String,
    },
    /// Send input to terminal
    TerminalInput { session_id: String, data: String },
    /// Send an Enter keypress to terminal
    TerminalEnter { session_id: String },
    /// Send a terminal emulator report back to tmux control mode
    TerminalReport { session_id: String, data: String },
    /// Resize terminal
    TerminalResize {
        session_id: String,
        cols: u16,
        rows: u16,
    },
    /// Close terminal session (detach only, keeps tmux window)
    TerminalClose { session_id: String },
    /// Destroy terminal session (kills tmux window)
    TerminalDestroy { session_id: String },
}

/// Response messages from terminal service
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TerminalResponse {
    /// Terminal session created successfully
    TerminalCreated {
        session_id: String,
        workspace_id: String,
        snapshot: Option<TmuxPaneSnapshot>,
    },
    /// Terminal session attached (reconnected)
    TerminalAttached {
        session_id: String,
        workspace_id: String,
        snapshot: Option<TmuxPaneSnapshot>,
    },
    /// Terminal output data
    TerminalOutput { session_id: String, data: String },
    /// Terminal session closed (detached)
    TerminalClosed { session_id: String },
    /// Terminal session destroyed (killed)
    TerminalDestroyed { session_id: String },
    /// Error occurred
    TerminalError {
        session_id: Option<String>,
        error: String,
    },
}

/// Parameters for creating a tmux-backed terminal session
pub struct CreateSessionParams {
    pub session_id: String,
    pub workspace_id: String,
    pub shell: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
    pub window_name: Option<String>,
    pub cwd: Option<String>,
    pub terminal_kind: TerminalKind,
    pub side_chat_id: Option<String>,
    pub source_pane_id: Option<String>,
    pub source_tmux_window_name: Option<String>,
}

/// Parameters for creating a simple (non-tmux) terminal session
pub struct CreateSimpleSessionParams {
    pub session_id: String,
    pub workspace_id: String,
    pub shell: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    pub cwd: Option<String>,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
    pub terminal_name: Option<String>,
}

/// Parameters for attaching to an existing tmux window
pub struct AttachSessionParams {
    pub session_id: String,
    pub workspace_id: String,
    pub tmux_window_index: Option<u32>,
    pub tmux_window_name: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
    /// Optional project root for APP-055 Run log tee on run-* windows.
    pub cwd: Option<String>,
}

/// Generic plain-text capture of a tmux pane (side chat, /spawn, attention summary, …).
pub struct CapturePanePlainTextParams {
    pub workspace_id: String,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
    /// Active browser/API terminal session id when known (preferred resolve path).
    pub source_session_id: Option<String>,
    /// Tmux window name fallback when no live session handle is available.
    pub source_tmux_window_name: String,
    /// Final selected text budget in bytes (after ANSI strip + head/tail window).
    pub max_text_bytes: Option<u32>,
    /// Optional scrollback line request for `capture-pane -S`.
    pub approx_lines: Option<i32>,
    /// Optional cap on raw capture bytes before selection.
    pub max_raw_bytes: Option<usize>,
    /// Bytes kept from the start of the transcript when mid is omitted.
    /// `None` uses the side-chat default head; `Some(0)` is tail-only.
    pub head_prefix_bytes: Option<usize>,
}

/// Result of a generic plain-text pane capture.
pub struct CapturedPanePlainText {
    pub workspace_id: String,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
    pub tmux_session: String,
    pub tmux_window_name: String,
    pub tmux_window_index: u32,
    pub captured_lines: u32,
    pub captured_bytes: u32,
    pub text_budget_bytes: u32,
    pub omitted_older_bytes: u32,
    pub omitted_middle_bytes: u32,
    pub truncated_bytes: bool,
    pub text: String,
}

/// Side-chat /spawn capture params (thin alias over the generic API defaults).
pub struct CaptureSideContextParams {
    pub workspace_id: String,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
    pub source_session_id: Option<String>,
    pub source_tmux_window_name: String,
    pub max_prompt_bytes: Option<u32>,
}

pub struct CapturedSideContext {
    pub workspace_id: String,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
    pub tmux_session: String,
    pub tmux_window_name: String,
    pub tmux_window_index: u32,
    pub captured_lines: u32,
    pub captured_bytes: u32,
    pub prompt_budget_bytes: u32,
    pub omitted_older_bytes: u32,
    pub omitted_middle_bytes: u32,
    pub truncated_bytes: bool,
    pub text: String,
}

impl From<CapturedPanePlainText> for CapturedSideContext {
    fn from(value: CapturedPanePlainText) -> Self {
        Self {
            workspace_id: value.workspace_id,
            project_name: value.project_name,
            workspace_name: value.workspace_name,
            tmux_session: value.tmux_session,
            tmux_window_name: value.tmux_window_name,
            tmux_window_index: value.tmux_window_index,
            captured_lines: value.captured_lines,
            captured_bytes: value.captured_bytes,
            prompt_budget_bytes: value.text_budget_bytes,
            omitted_older_bytes: value.omitted_older_bytes,
            omitted_middle_bytes: value.omitted_middle_bytes,
            truncated_bytes: value.truncated_bytes,
            text: value.text,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TerminalSideChatRecord {
    pub side_chat_id: String,
    pub workspace_id: String,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
    pub source_pane_id: String,
    pub source_tmux_window_name: String,
    pub source_surface_kind: String,
    pub source_surface_ref_json: Option<String>,
    pub side_tmux_window_name: String,
    pub agent_ref_json: Option<String>,
    pub color_hex: String,
    pub status: TerminalSideChatStatus,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

pub struct UpsertTerminalSideChatParams {
    pub side_chat_id: String,
    pub workspace_id: String,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
    pub source_pane_id: String,
    pub source_tmux_window_name: String,
    pub source_surface_kind: String,
    pub source_surface_ref_json: Option<String>,
    pub side_tmux_window_name: String,
    pub agent_ref_json: Option<String>,
    pub color_hex: String,
    pub status: TerminalSideChatStatus,
}

#[cfg(test)]
mod tests {
    use super::TerminalSideChatStatus;

    #[test]
    fn side_chat_status_accepts_canonical_and_legacy_values() {
        assert_eq!(
            TerminalSideChatStatus::try_from("open").unwrap(),
            TerminalSideChatStatus::Open
        );
        assert_eq!(
            TerminalSideChatStatus::try_from("visible").unwrap(),
            TerminalSideChatStatus::Open
        );
        assert_eq!(
            TerminalSideChatStatus::try_from("hidden").unwrap(),
            TerminalSideChatStatus::Hidden
        );
        assert_eq!(
            TerminalSideChatStatus::try_from("closing").unwrap(),
            TerminalSideChatStatus::Closing
        );
        assert_eq!(
            TerminalSideChatStatus::try_from("closed").unwrap(),
            TerminalSideChatStatus::Closing
        );
        assert!(TerminalSideChatStatus::try_from("bad").is_err());
    }
}
