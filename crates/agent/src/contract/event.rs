use serde::{Deserialize, Serialize};

use super::action::SessionOpKind;
use super::tool::AgentTool;

pub use super::tool::AgentTool as AgentToolCall;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UserMessageKind {
    #[default]
    Normal,
    Steer,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TurnStop {
    Completed,
    Canceled,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentEventEnvelope {
    pub event_id: String,
    pub turn_id: Option<String>,
    pub payload: AgentEvent,
}

impl AgentEventEnvelope {
    pub fn new(turn_id: Option<String>, payload: AgentEvent) -> Self {
        Self {
            event_id: uuid::Uuid::new_v4().to_string(),
            turn_id,
            payload,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub struct AgentAskQuestion {
    pub id: String,
    pub prompt: String,
    #[serde(default)]
    pub options: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AgentPermissionRequest {
    pub request_id: String,
    pub tool: String,
    pub description: String,
    #[serde(default)]
    pub content_markdown: Option<String>,
    #[serde(default)]
    pub options: Vec<AgentPermissionOption>,
    /// Multi-question AskUser cards (ApprovalCard `questions` variant).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub questions: Vec<AgentAskQuestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct AgentPermissionOption {
    pub option_id: String,
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSessionOpRequest {
    pub request_id: String,
    pub kind: SessionOpKind,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub options: Vec<AgentPermissionOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionOpOutcome {
    Applied,
    Canceled,
    Failed { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct AgentAvailableCommand {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentEvent {
    SessionStarted {
        persistence_handle: Option<String>,
    },
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
        tool_call: AgentTool,
    },
    ToolCallUpdated {
        tool_call: AgentTool,
    },
    ToolCallCompleted {
        tool_call: AgentTool,
    },
    ToolCallFailed {
        tool_call: AgentTool,
        #[serde(default)]
        error: Option<String>,
    },
    PlanUpdated {
        plan: serde_json::Value,
    },
    PermissionRequested {
        request: AgentPermissionRequest,
    },
    PermissionResolved {
        request_id: String,
        option_id: String,
    },
    SessionOpRequested {
        request: AgentSessionOpRequest,
    },
    SessionOpResolved {
        request_id: String,
        option_id: String,
        outcome: SessionOpOutcome,
    },
    /// Claude user-frame uuid bound to an Atmos turn (persist as `checkpoint_id`).
    UserCheckpoint {
        turn_id: String,
        checkpoint_id: String,
    },
    UsageUpdated {
        usage: serde_json::Value,
    },
    ConfigChanged {
        config: serde_json::Value,
    },
    TurnCompleted {
        turn_id: String,
        stop: TurnStop,
    },
    TurnFailed {
        turn_id: String,
        error: String,
    },
    TurnCanceled {
        turn_id: String,
    },
    SessionClosed,
    SessionTitleUpdated {
        title: String,
    },
    AvailableCommandsUpdated {
        commands: Vec<AgentAvailableCommand>,
    },
    Unknown {
        event_type: String,
        payload: serde_json::Value,
    },
}
