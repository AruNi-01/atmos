use core_engine::TmuxPaneSnapshot;
use std::path::PathBuf;
use std::time::Instant;
use tokio::sync::mpsc;

/// Commands that can be sent to a terminal session thread
#[derive(Debug)]
pub(super) enum SessionCommand {
    Write(Vec<u8>),
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
}
