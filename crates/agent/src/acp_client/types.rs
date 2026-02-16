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

/// Permission request from agent (forwarded to frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRequest {
    pub request_id: String,
    pub tool: String,
    pub description: String,
    pub risk_level: RiskLevel,
}

/// User response to permission request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionResponse {
    pub request_id: String,
    pub allowed: bool,
    pub remember_for_session: bool,
}

/// Streaming text delta from agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamDelta {
    /// "assistant" or "user" (history replay from load_session may include user chunks)
    pub role: String,
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
pub struct ToolCallUpdate {
    /// Unique ID to match running -> completed/failed updates
    pub tool_call_id: String,
    pub tool: String,
    pub description: String,
    pub status: ToolCallStatus,
    /// Raw input params (e.g. {"path": "src/lib.rs"} for Read)
    pub raw_input: Option<serde_json::Value>,
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
