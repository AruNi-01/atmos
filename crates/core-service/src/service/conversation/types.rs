use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use agent::UserMessageKind;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeStatus {
    #[default]
    Detached,
    Starting,
    Ready,
    RunningTurn,
    WaitingPermission,
    Closed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TurnStatus {
    #[default]
    Idle,
    Running,
    WaitingPermission,
    Completed,
    Canceled,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QueueItemStatus {
    Pending,
    Paused,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMeta {
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub deleted: bool,
    #[serde(default)]
    pub title: Option<String>,
    pub cwd: String,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    pub provider_id: String,
    #[serde(default)]
    pub last_message_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub last_event_seq: u64,
    #[serde(default)]
    pub persistence_handle: Option<String>,
    #[serde(default)]
    pub runtime_status: RuntimeStatus,
    #[serde(default)]
    pub selected_model: Option<String>,
    #[serde(default)]
    pub selected_thinking: Option<String>,
    #[serde(default)]
    pub selected_mode: Option<String>,
    #[serde(default)]
    pub supports_steer: bool,
    #[serde(default)]
    pub available_commands: Vec<agent::AgentAvailableCommand>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationIndexEntry {
    pub id: String,
    #[serde(default)]
    pub title: Option<String>,
    pub cwd: String,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    pub provider_id: String,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub last_message_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub deleted: bool,
}

impl From<&ConversationMeta> for ConversationIndexEntry {
    fn from(meta: &ConversationMeta) -> Self {
        Self {
            id: meta.id.clone(),
            title: meta.title.clone(),
            cwd: meta.cwd.clone(),
            workspace_id: meta.workspace_id.clone(),
            project_id: meta.project_id.clone(),
            provider_id: meta.provider_id.clone(),
            updated_at: meta.updated_at,
            last_message_at: meta.last_message_at,
            deleted: meta.deleted,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(clippy::large_enum_variant)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MessagePart {
    Text {
        text: String,
    },
    Thinking {
        text: String,
    },
    ToolCall {
        tool_call_id: String,
        name: String,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        kind: Option<String>,
        #[serde(default)]
        status: Option<String>,
        #[serde(default)]
        input: Option<serde_json::Value>,
        #[serde(default)]
        output: Option<serde_json::Value>,
        #[serde(default)]
        content: Option<serde_json::Value>,
    },
    Plan {
        plan: serde_json::Value,
    },
    Attachment {
        path: String,
        #[serde(default)]
        name: Option<String>,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FoldedMessage {
    pub id: String,
    pub role: String,
    #[serde(default)]
    pub kind: UserMessageKind,
    pub parts: Vec<MessagePart>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FoldedTurn {
    pub id: String,
    pub status: TurnStatus,
    pub messages: Vec<FoldedMessage>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueItem {
    pub id: String,
    pub seq: u64,
    pub status: QueueItemStatus,
    pub prompt: String,
    #[serde(default)]
    pub display_prompt: Option<String>,
    #[serde(default)]
    pub attachments: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingPermission {
    pub request_id: String,
    pub tool: String,
    pub description: String,
    #[serde(default)]
    pub content_markdown: Option<String>,
    #[serde(default)]
    pub options: Vec<agent::AgentPermissionOption>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationSnapshot {
    pub meta: ConversationMeta,
    pub turns: Vec<FoldedTurn>,
    pub queue: Vec<QueueItem>,
    #[serde(default)]
    pub pending_permission: Option<PendingPermission>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TranscriptRecord {
    TurnStarted {
        turn_id: String,
        created_at: DateTime<Utc>,
    },
    UserMessage {
        turn_id: String,
        message_id: String,
        kind: UserMessageKind,
        text: String,
        #[serde(default)]
        attachments: Vec<String>,
        created_at: DateTime<Utc>,
    },
    AssistantSnapshot {
        turn_id: String,
        message_id: String,
        text: String,
        created_at: DateTime<Utc>,
    },
    ThinkingSnapshot {
        turn_id: String,
        message_id: String,
        text: String,
        created_at: DateTime<Utc>,
    },
    ToolCall {
        turn_id: String,
        tool_call: agent::AgentToolCall,
        created_at: DateTime<Utc>,
    },
    Plan {
        turn_id: String,
        plan: serde_json::Value,
        created_at: DateTime<Utc>,
    },
    Permission {
        turn_id: String,
        request: PendingPermission,
        created_at: DateTime<Utc>,
    },
    TurnCompleted {
        turn_id: String,
        status: TurnStatus,
        #[serde(default)]
        error: Option<String>,
        created_at: DateTime<Utc>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationClientEvent {
    pub conversation_id: String,
    pub event_id: String,
    pub sequence: u64,
    pub payload: ConversationClientPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ConversationClientPayload {
    TurnStarted {
        turn_id: String,
    },
    UserMessage {
        turn_id: String,
        message_id: String,
        kind: UserMessageKind,
        text: String,
        #[serde(default)]
        attachments: Vec<String>,
    },
    AssistantMessageDelta {
        message_id: String,
        delta: String,
    },
    AssistantMessageCompleted {
        message_id: String,
    },
    ThinkingDelta {
        message_id: String,
        delta: String,
    },
    ThinkingCompleted {
        message_id: String,
    },
    ToolCallStarted {
        tool_call: agent::AgentToolCall,
    },
    ToolCallUpdated {
        tool_call: agent::AgentToolCall,
    },
    ToolCallCompleted {
        tool_call: agent::AgentToolCall,
    },
    ToolCallFailed {
        tool_call: agent::AgentToolCall,
        #[serde(default)]
        error: Option<String>,
    },
    PlanUpdated {
        plan: serde_json::Value,
    },
    PermissionRequested {
        request: PendingPermission,
    },
    PermissionResolved {
        request_id: String,
        option_id: String,
    },
    TurnCompleted {
        turn_id: String,
        status: TurnStatus,
    },
    QueueUpdated {
        items: Vec<QueueItem>,
    },
    RuntimeStatus {
        status: RuntimeStatus,
        #[serde(default)]
        persistence_handle: Option<String>,
    },
    TitleUpdated {
        title: Option<String>,
    },
    AvailableCommandsUpdated {
        commands: Vec<agent::AgentAvailableCommand>,
    },
}

#[derive(Debug, Clone)]
pub struct CreateConversationRequest {
    pub workspace_id: Option<String>,
    pub project_id: Option<String>,
    pub cwd: String,
    pub provider_id: String,
    pub model: Option<String>,
    pub thinking: Option<String>,
    pub title: Option<String>,
}
