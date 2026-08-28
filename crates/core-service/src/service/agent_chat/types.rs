use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use agent::{deserialize_tool_kind, UserMessageKind};

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
pub struct AgentChatMeta {
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
    #[serde(default)]
    pub session_usage: Option<SessionUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionUsage {
    #[serde(default)]
    pub used: Option<u64>,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub cost: Option<SessionCost>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionCost {
    #[serde(default)]
    pub amount: Option<f64>,
    #[serde(default)]
    pub currency: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TurnUsage {
    #[serde(default)]
    pub total_tokens: Option<u64>,
    #[serde(default)]
    pub input_tokens: Option<u64>,
    #[serde(default)]
    pub output_tokens: Option<u64>,
    #[serde(default)]
    pub thought_tokens: Option<u64>,
    #[serde(default)]
    pub cached_read_tokens: Option<u64>,
    #[serde(default)]
    pub cached_write_tokens: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatIndexEntry {
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

impl From<&AgentChatMeta> for AgentChatIndexEntry {
    fn from(meta: &AgentChatMeta) -> Self {
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
        #[serde(default)]
        tool_call_id: Option<String>,
    },
    ToolCall {
        tool_call_id: String,
        name: String,
        #[serde(default)]
        title: Option<String>,
        #[serde(default, deserialize_with = "deserialize_tool_kind")]
        kind: agent::AgentToolKind,
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
    #[serde(default)]
    pub streaming: bool,
    #[serde(default)]
    pub worked_ms: Option<u64>,
    #[serde(default)]
    pub thinking_ms: Option<u64>,
    #[serde(default)]
    pub completed_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub usage: Option<TurnUsage>,
}

impl Default for FoldedMessage {
    fn default() -> Self {
        Self {
            id: String::new(),
            role: String::new(),
            kind: UserMessageKind::Normal,
            parts: Vec::new(),
            created_at: DateTime::<Utc>::UNIX_EPOCH,
            streaming: false,
            worked_ms: None,
            thinking_ms: None,
            completed_at: None,
            usage: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FoldedTurn {
    pub id: String,
    pub status: TurnStatus,
    pub messages: Vec<FoldedMessage>,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub thinking_started_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub thinking_ended_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub completed_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub worked_ms: Option<u64>,
    #[serde(default)]
    pub thinking_ms: Option<u64>,
    #[serde(default)]
    pub usage: Option<TurnUsage>,
}

impl Default for FoldedTurn {
    fn default() -> Self {
        Self {
            id: String::new(),
            status: TurnStatus::Idle,
            messages: Vec::new(),
            created_at: DateTime::<Utc>::UNIX_EPOCH,
            thinking_started_at: None,
            thinking_ended_at: None,
            completed_at: None,
            worked_ms: None,
            thinking_ms: None,
            usage: None,
        }
    }
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
pub struct AgentChatSnapshot {
    pub meta: AgentChatMeta,
    pub messages: Vec<FoldedMessage>,
    pub queue: Vec<QueueItem>,
    #[serde(default)]
    pub pending_permission: Option<PendingPermission>,
    #[serde(default)]
    pub running_turn_id: Option<String>,
    #[serde(default)]
    pub running_turn_started_at: Option<DateTime<Utc>>,
}

pub fn flatten_messages(
    turns: Vec<FoldedTurn>,
) -> (Vec<FoldedMessage>, Option<String>, Option<DateTime<Utc>>) {
    let mut messages: Vec<FoldedMessage> = Vec::new();
    let mut running_turn_id = None;
    let mut running_turn_started_at = None;
    let mut running = false;
    for turn in turns {
        if matches!(
            turn.status,
            TurnStatus::Running | TurnStatus::WaitingPermission
        ) {
            running_turn_id = Some(turn.id.clone());
            running_turn_started_at = Some(turn.created_at);
            running = true;
        }
        let timing = turn_timing(&turn);
        let mut assistant_index = None;
        for message in turn.messages {
            if message.role == "assistant" {
                if let Some(last) = messages.last_mut() {
                    if last.role == "assistant" {
                        last.parts.extend(message.parts);
                        apply_turn_timing(last, &timing);
                        assistant_index = Some(messages.len() - 1);
                        continue;
                    }
                }
            }
            messages.push(message);
            if messages.last().is_some_and(|item| item.role == "assistant") {
                assistant_index = Some(messages.len() - 1);
            }
        }
        if let Some(index) = assistant_index {
            if let Some(message) = messages.get_mut(index) {
                apply_turn_timing(message, &timing);
                message.parts = order_assistant_parts(std::mem::take(&mut message.parts));
            }
        }
    }
    if running {
        if let Some(last) = messages.last_mut() {
            if last.role == "assistant" {
                last.streaming = true;
            }
        }
    }
    (messages, running_turn_id, running_turn_started_at)
}

/// Keep thinking/tools/plan first and the final answer last so restore matches live collapse.
pub fn order_assistant_parts(parts: Vec<MessagePart>) -> Vec<MessagePart> {
    let mut process = Vec::new();
    let mut answer = Vec::new();
    for part in parts {
        if matches!(part, MessagePart::Text { .. }) {
            answer.push(part);
        } else {
            process.push(part);
        }
    }
    process.extend(answer);
    process
}

struct TurnTiming {
    worked_ms: Option<u64>,
    thinking_ms: Option<u64>,
    completed_at: Option<DateTime<Utc>>,
    usage: Option<TurnUsage>,
}

fn turn_timing(turn: &FoldedTurn) -> TurnTiming {
    let completed_at = turn.completed_at;
    let worked_ms = turn.worked_ms.or_else(|| {
        completed_at.map(|end| {
            u64::try_from((end - turn.created_at).num_milliseconds().max(0)).unwrap_or(0)
        })
    });
    let thinking_ms =
        turn.thinking_ms.or_else(
            || match (turn.thinking_started_at, turn.thinking_ended_at) {
                (Some(start), Some(end)) => {
                    Some(u64::try_from((end - start).num_milliseconds().max(0)).unwrap_or(0))
                }
                _ => None,
            },
        );
    TurnTiming {
        worked_ms,
        thinking_ms,
        completed_at,
        usage: turn.usage.clone(),
    }
}

pub fn parse_session_usage(value: &serde_json::Value) -> Option<SessionUsage> {
    let used = json_u64(value, &["used"]);
    let size = json_u64(value, &["size"]);
    let cost_value = value.get("cost");
    let amount = cost_value.and_then(|cost| json_f64(cost, &["amount"]));
    let currency = cost_value.and_then(|cost| {
        cost.get("currency")
            .and_then(|item| item.as_str())
            .map(ToOwned::to_owned)
    });
    if used.is_none() && size.is_none() && amount.is_none() {
        return None;
    }
    Some(SessionUsage {
        used,
        size,
        cost: if amount.is_some() || currency.is_some() {
            Some(SessionCost { amount, currency })
        } else {
            None
        },
    })
}

pub fn parse_turn_usage(value: &serde_json::Value) -> Option<TurnUsage> {
    let usage = TurnUsage {
        total_tokens: json_u64(value, &["total_tokens", "totalTokens"]),
        input_tokens: json_u64(value, &["input_tokens", "inputTokens"]),
        output_tokens: json_u64(value, &["output_tokens", "outputTokens"]),
        thought_tokens: json_u64(value, &["thought_tokens", "thoughtTokens"]),
        cached_read_tokens: json_u64(value, &["cached_read_tokens", "cachedReadTokens"]),
        cached_write_tokens: json_u64(value, &["cached_write_tokens", "cachedWriteTokens"]),
    };
    if usage.total_tokens.is_none()
        && usage.input_tokens.is_none()
        && usage.output_tokens.is_none()
        && usage.thought_tokens.is_none()
        && usage.cached_read_tokens.is_none()
        && usage.cached_write_tokens.is_none()
    {
        return None;
    }
    Some(usage)
}

fn json_u64(value: &serde_json::Value, keys: &[&str]) -> Option<u64> {
    for key in keys {
        if let Some(item) = value.get(*key) {
            if let Some(number) = item.as_u64() {
                return Some(number);
            }
            if let Some(number) = item.as_f64() {
                return Some(number.max(0.0) as u64);
            }
        }
    }
    None
}

fn json_f64(value: &serde_json::Value, keys: &[&str]) -> Option<f64> {
    for key in keys {
        if let Some(number) = value.get(*key).and_then(|item| item.as_f64()) {
            return Some(number);
        }
    }
    None
}

fn apply_turn_timing(message: &mut FoldedMessage, timing: &TurnTiming) {
    if message.role != "assistant" {
        return;
    }
    message.worked_ms = timing.worked_ms;
    message.thinking_ms = timing.thinking_ms;
    message.completed_at = timing.completed_at;
    if timing.usage.is_some() {
        message.usage = timing.usage.clone();
    }
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
        #[serde(default)]
        started_at: Option<DateTime<Utc>>,
        #[serde(default)]
        duration_ms: Option<u64>,
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
        #[serde(default)]
        worked_ms: Option<u64>,
        #[serde(default)]
        thinking_ms: Option<u64>,
        #[serde(default)]
        usage: Option<TurnUsage>,
        created_at: DateTime<Utc>,
    },
    Usage {
        #[serde(default)]
        turn_id: Option<String>,
        usage: serde_json::Value,
        created_at: DateTime<Utc>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatEvent {
    pub chat_id: String,
    pub event_id: String,
    pub sequence: u64,
    pub payload: AgentChatPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentChatPayload {
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
        #[serde(default)]
        thinking_ms: Option<u64>,
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
        #[serde(default)]
        worked_ms: Option<u64>,
        #[serde(default)]
        thinking_ms: Option<u64>,
        #[serde(default)]
        completed_at: Option<DateTime<Utc>>,
        #[serde(default)]
        usage: Option<TurnUsage>,
    },
    UsageUpdated {
        session: Option<SessionUsage>,
        turn: Option<TurnUsage>,
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
pub struct CreateAgentChatRequest {
    pub workspace_id: Option<String>,
    pub project_id: Option<String>,
    pub cwd: String,
    pub provider_id: String,
    pub model: Option<String>,
    pub thinking: Option<String>,
    pub mode: Option<String>,
    pub title: Option<String>,
}
