use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalWorkspaceCandidatesRequest {
    pub workspace_id: String,
    #[serde(default)]
    pub project_name: Option<String>,
    #[serde(default)]
    pub workspace_name: Option<String>,
}

/// APP-063: create a terminal session without requiring a browser PTY client.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSessionCreateRequest {
    pub workspace_id: String,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub shell: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub project_name: Option<String>,
    #[serde(default)]
    pub workspace_name: Option<String>,
    #[serde(default)]
    pub cols: Option<u16>,
    #[serde(default)]
    pub rows: Option<u16>,
    /// When true (default), detach the in-process PTY handle after create so the
    /// tmux window remains without holding a CLI-side reader.
    #[serde(default = "default_true")]
    pub detach_after_create: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSessionCreateResponse {
    pub session_id: String,
    pub workspace_id: String,
    pub detached: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSessionListRequest {
    #[serde(default)]
    pub workspace_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSessionCloseRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSessionDestroyRequest {
    pub session_id: String,
}

/// APP-055: start/rotate a project-local Run log for a Run terminal window.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunLogStartRequest {
    pub project_root: String,
    pub window_name: String,
    #[serde(default)]
    pub command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunLogStartResponse {
    pub latest_path: String,
}

/// APP-055: resolve the preferred latest Run log path under a project root.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunLogResolveLatestRequest {
    pub project_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunLogResolveLatestResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalWorkspaceCandidate {
    pub id: String,
    pub workspace_id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tmux_session: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tmux_window_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tmux_window_index: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side_chat_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_pane_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_tmux_window_name: Option<String>,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalWorkspaceCandidatesResponse {
    pub candidates: Vec<TerminalWorkspaceCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSideContextCaptureRequest {
    pub workspace_id: String,
    #[serde(default)]
    pub project_name: Option<String>,
    #[serde(default)]
    pub workspace_name: Option<String>,
    #[serde(default)]
    pub source_session_id: Option<String>,
    pub source_tmux_window_name: String,
    #[serde(default)]
    pub max_prompt_bytes: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSideContextCaptureResponse {
    pub workspace_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_name: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSideChatRecordDto {
    pub side_chat_id: String,
    pub workspace_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_name: Option<String>,
    pub source_pane_id: String,
    pub source_tmux_window_name: String,
    pub source_surface_kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_surface_ref_json: Option<String>,
    pub side_tmux_window_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_ref_json: Option<String>,
    pub color_hex: String,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSideChatListRequest {
    pub workspace_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSideChatListResponse {
    pub workspace_id: String,
    pub records: Vec<TerminalSideChatRecordDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSideChatUpsertRequest {
    pub record: TerminalSideChatRecordDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSideChatStatusRequest {
    pub workspace_id: String,
    pub side_chat_id: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSideChatCloseRequest {
    pub workspace_id: String,
    pub side_chat_id: String,
}
