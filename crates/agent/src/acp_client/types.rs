//! ACP session types for M1.

use serde::{Deserialize, Serialize};

/// Risk level for permission requests
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

/// A single permission option presented to the user.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionOption {
    pub option_id: String,
    pub name: String,
    /// e.g. "allow_once", "allow_always", "reject_once", "reject_always"
    pub kind: String,
}

/// Permission request from agent (forwarded to frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRequest {
    pub request_id: String,
    pub tool: String,
    pub description: String,
    /// Optional markdown preview content from tool call payload.
    pub content_markdown: Option<String>,
    pub risk_level: RiskLevel,
    /// Permission options presented by the agent (may be empty for legacy agents)
    pub options: Vec<PermissionOption>,
}

/// User response to permission request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionResponse {
    pub request_id: String,
    pub allowed: bool,
    pub remember_for_session: bool,
}

/// Auth method metadata from ACP initialize response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthMethodSummary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

/// Authentication required payload for frontend popup
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthRequiredPayload {
    pub request_id: String,
    pub methods: Vec<AuthMethodSummary>,
    pub message: String,
}

/// ACP implementation metadata advertised by an agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AgentImplementationInfo {
    pub name: String,
    pub title: Option<String>,
    pub version: String,
}

/// Whether an ACP capability is currently usable.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AgentCapabilityState {
    pub supported: bool,
    pub reason: Option<String>,
}

impl AgentCapabilityState {
    pub fn supported() -> Self {
        Self {
            supported: true,
            reason: None,
        }
    }

    pub fn unsupported(reason: impl Into<Option<String>>) -> Self {
        Self {
            supported: false,
            reason: reason.into(),
        }
    }
}

/// Snapshot of ACP capabilities Atmos cares about.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AgentCapabilitiesSnapshot {
    pub session_list: AgentCapabilityState,
    pub session_resume: AgentCapabilityState,
    pub session_close: AgentCapabilityState,
    pub logout: AgentCapabilityState,
    pub config_options: AgentCapabilityState,
    pub session_info_update: AgentCapabilityState,
    pub load_session: AgentCapabilityState,
}

/// Native session row returned by ACP `session/list`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct NativeAgentSession {
    pub acp_session_id: String,
    pub cwd: String,
    pub title: Option<String>,
    pub updated_at: Option<String>,
}

/// Native ACP session list response returned to higher layers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct NativeAgentSessionList {
    pub agent_info: Option<AgentImplementationInfo>,
    pub capabilities: AgentCapabilitiesSnapshot,
    pub sessions: Vec<NativeAgentSession>,
    pub next_cursor: Option<String>,
    pub unsupported_reason: Option<String>,
}

/// Partial metadata update pushed by ACP `session_info_update`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AgentSessionInfoUpdate {
    pub acp_session_id: String,
    pub title: Option<Option<String>>,
    pub updated_at: Option<Option<String>>,
}

/// Result for ACP `logout`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AgentLogoutResult {
    pub agent_info: Option<AgentImplementationInfo>,
    pub capabilities: AgentCapabilitiesSnapshot,
    pub logged_out: bool,
    pub unsupported_reason: Option<String>,
}

/// Streaming text delta from agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamDelta {
    /// "assistant" or "user" (history replay from load_session may include user chunks)
    pub role: String,
    /// "message" (normal assistant/user text) or "thinking" (agent thought stream)
    pub kind: String,
    pub delta: String,
    pub done: bool,
    pub usage: Option<StreamUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
}

/// Tool call status update for frontend display
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentToolCallContentItem {
    Text {
        text: String,
    },
    Diff {
        path: Option<String>,
        old_content: Option<String>,
        new_content: String,
    },
    Terminal {
        terminal_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallUpdate {
    /// Unique ID to match running -> completed/failed updates
    pub tool_call_id: String,
    /// Parent tool call ID when this tool call belongs to a nested/subagent invocation.
    pub parent_tool_call_id: Option<String>,
    pub tool: String,
    pub description: String,
    pub status: ToolCallStatus,
    /// Raw input params (e.g. {"path": "src/lib.rs"} for Read)
    pub raw_input: Option<serde_json::Value>,
    /// Structured content emitted by the tool call.
    pub content: Vec<AgentToolCallContentItem>,
    /// Raw output or content from tool execution
    pub raw_output: Option<serde_json::Value>,
    pub detail: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolCallStatus {
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfigOptionValue {
    pub value: String,
    pub name: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfigOption {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub r#type: String,
    pub current_value: Option<String>,
    pub options: Vec<AgentConfigOptionValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigOptionsUpdate {
    pub config_options: Vec<AgentConfigOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentPlanEntry {
    pub content: String,
    pub priority: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentPlan {
    pub entries: Vec<AgentPlanEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCost {
    pub amount: Option<f64>,
    pub currency: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentUsage {
    pub used: Option<u64>,
    pub size: Option<u64>,
    pub cost: Option<AgentCost>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnUsage {
    pub total_tokens: Option<u64>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub thought_tokens: Option<u64>,
    pub cached_read_tokens: Option<u64>,
    pub cached_write_tokens: Option<u64>,
}
