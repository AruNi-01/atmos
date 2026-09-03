//! OpenCode bus envelope `{id, type, properties}` → Atmos events.

use std::collections::{HashMap, HashSet, VecDeque};

use serde_json::Value;

use crate::contract::AgentPersistenceHandle;
use crate::contract::AgentTool;
use crate::contract::{AgentCurrentConfig, AgentIdentity, AgentSupportedOptions};
use crate::contract::{AgentDescriptor, TurnStop};
use crate::contract::{
    AgentEvent, AgentEventEnvelope, AgentPermissionOption, AgentPermissionRequest,
};
use crate::policy::{capabilities_for_provider, option_support_for_provider};

use super::codec::{is_heartbeat, BusEvent};
use super::tool_map::{map_tool_part, ToolEventKind, ToolMapOut};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PendingAsk {
    Permission,
    Question,
}

pub(crate) enum MapOut {
    Skip,
    Ready,
    Event(AgentEventEnvelope),
    AutoRejectQuestion { request_id: String },
}

pub(crate) struct EventMapState {
    pub session_id: String,
    pub persistence: Option<AgentPersistenceHandle>,
    pub pending: VecDeque<AgentEventEnvelope>,
    pub pending_asks: HashMap<String, PendingAsk>,
    pub assistant_message_id: Option<String>,
    pub thinking_message_id: Option<String>,
    pub assistant_text: HashMap<String, String>,
    pub thinking_text: HashMap<String, String>,
    /// OpenCode `message.part.delta.field` is the JSON field name (`text`), not the
    /// part type. Reasoning vs answer is `part.type` keyed by `partID`.
    pub part_kinds: HashMap<String, String>,
    pub ignored_parts: HashSet<String>,
    pub pending_part_deltas: HashMap<String, Vec<(String, String)>>,
    pub started_tools: HashSet<String>,
    pub seen_parts: HashSet<String>,
    pub closed_turn: Option<String>,
    pub last_assistant: Option<Value>,
    pub user_message_ids: HashSet<String>,
    pub identity: AgentIdentity,
    pub capabilities: crate::contract::AgentCapabilities,
    pub supported_options: AgentSupportedOptions,
    pub current_config: AgentCurrentConfig,
    pub cancel_requested: bool,
    /// True only after `prompt_async` has been accepted. Create-time `session.idle`
    /// must not close a turn that has not started yet.
    pub idle_armed: bool,
    pub turn_seen_work: bool,
    pub active_turn: Option<String>,
}

impl EventMapState {
    pub(crate) fn new(session_id: String, current_config: AgentCurrentConfig) -> Self {
        Self {
            persistence: Some(AgentPersistenceHandle::new(session_id.clone())),
            session_id,
            pending: VecDeque::new(),
            pending_asks: HashMap::new(),
            assistant_message_id: None,
            thinking_message_id: None,
            assistant_text: HashMap::new(),
            thinking_text: HashMap::new(),
            part_kinds: HashMap::new(),
            ignored_parts: HashSet::new(),
            pending_part_deltas: HashMap::new(),
            started_tools: HashSet::new(),
            seen_parts: HashSet::new(),
            closed_turn: None,
            last_assistant: None,
            user_message_ids: HashSet::new(),
            identity: AgentIdentity {
                id: "opencode".into(),
                name: "OpenCode".into(),
                version: None,
            },
            capabilities: capabilities_for_provider("opencode"),
            supported_options: AgentSupportedOptions::default(),
            current_config,
            cancel_requested: false,
            idle_armed: false,
            turn_seen_work: false,
            active_turn: None,
        }
    }

    pub(crate) fn sync_turn(&mut self, turn_id: Option<String>, idle_armed: bool) {
        if turn_id != self.active_turn {
            self.active_turn = turn_id;
            self.turn_seen_work = false;
        }
        self.idle_armed = idle_armed;
    }

    pub(crate) fn descriptor(&self) -> AgentDescriptor {
        AgentDescriptor {
            identity: self.identity.clone(),
            capabilities: self.capabilities.clone(),
            support: option_support_for_provider(&self.identity.id),
            supported_options: self.supported_options.clone(),
            current_config: self.current_config.clone(),
        }
    }
}

pub(crate) fn map_event(
    state: &mut EventMapState,
    turn_id: Option<String>,
    event: BusEvent,
) -> MapOut {
    if is_heartbeat(&event) {
        return MapOut::Skip;
    }
    if event.event_type == "server.connected" {
        return MapOut::Ready;
    }

    let session_id = session_id_of(&event.properties);
    if let Some(sid) = session_id {
        if sid != state.session_id.as_str() {
            return MapOut::Skip;
        }
    } else if event.event_type != "session.error" {
        return MapOut::Skip;
    }

    match event.event_type.as_str() {
        "message.part.delta" => map_part_delta(state, turn_id, &event.properties),
        "message.part.updated" => map_part_updated(state, turn_id, &event.properties),
        "message.part.removed" => map_part_removed(state, turn_id, &event.properties),
        "message.updated" => map_message_updated(state, turn_id, &event.properties),
        "permission.asked" | "permission.updated" => {
            map_permission_asked(state, turn_id, &event.properties)
        }
        "permission.replied" => map_permission_replied(state, turn_id, &event.properties),
        "question.asked" => map_question_asked(state, turn_id, &event.properties),
        "session.idle" => map_idle(state, turn_id),
        "session.error" => map_session_error(state, turn_id, &event.properties),
        "todo.updated" => map_todo(state, turn_id, &event.properties),
        "session.status" => map_session_status(state, turn_id, &event.properties),
        "session.updated" | "session.diff" | "session.created" | "session.deleted"
        | "session.compacted" => MapOut::Skip,
        other if other.starts_with("session.next.") => MapOut::Skip,
        _ => MapOut::Skip,
    }
}

fn session_id_of(properties: &Value) -> Option<&str> {
    properties
        .get("sessionID")
        .or_else(|| properties.get("sessionId"))
        .and_then(Value::as_str)
        .or_else(|| {
            properties
                .get("part")
                .and_then(|part| part.get("sessionID"))
                .and_then(Value::as_str)
        })
        .or_else(|| {
            properties
                .get("info")
                .and_then(|info| info.get("sessionID"))
                .and_then(Value::as_str)
        })
}

fn map_part_delta(
    state: &mut EventMapState,
    turn_id: Option<String>,
    properties: &Value,
) -> MapOut {
    let field = properties
        .get("field")
        .and_then(Value::as_str)
        .unwrap_or("text");
    let delta = properties
        .get("delta")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if delta.is_empty() {
        return MapOut::Skip;
    }
    let part_id = properties.get("partID").and_then(Value::as_str);
    let message_id = properties
        .get("messageID")
        .or_else(|| properties.get("partID"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| "opencode-assistant".into());
    if is_user_message(state, &message_id) {
        return MapOut::Skip;
    }
    if let Some(part_id) = part_id {
        if state.ignored_parts.contains(part_id) {
            return MapOut::Skip;
        }
        if let Some(kind) = state.part_kinds.get(part_id).cloned() {
            return emit_content_delta(state, turn_id, &message_id, &kind, delta);
        }
        mark_work(state);
        state
            .pending_part_deltas
            .entry(part_id.to_string())
            .or_default()
            .push((message_id, delta));
        return MapOut::Skip;
    }
    let kind = if field == "reasoning" || field == "thinking" {
        "reasoning"
    } else {
        "text"
    };
    emit_content_delta(state, turn_id, &message_id, kind, delta)
}

fn map_part_updated(
    state: &mut EventMapState,
    turn_id: Option<String>,
    properties: &Value,
) -> MapOut {
    let Some(part) = properties.get("part") else {
        return MapOut::Skip;
    };
    let part_id = part.get("id").and_then(Value::as_str);
    let part_type = part.get("type").and_then(Value::as_str).unwrap_or("");
    let ignored = part
        .get("ignored")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if let Some(part_id) = part_id {
        state.seen_parts.insert(part_id.to_string());
        if !part_type.is_empty() {
            state
                .part_kinds
                .insert(part_id.to_string(), part_type.to_string());
        }
        if ignored {
            state.ignored_parts.insert(part_id.to_string());
            state.pending_part_deltas.remove(part_id);
        }
    }
    if ignored && part_type == "text" {
        return MapOut::Skip;
    }

    let mut first = None;
    if let Some(part_id) = part_id {
        if let Some(deltas) = state.pending_part_deltas.remove(part_id) {
            for (message_id, delta) in deltas {
                enqueue_content_delta(
                    state,
                    turn_id.clone(),
                    &message_id,
                    part_type,
                    delta,
                    &mut first,
                );
            }
        }
    }

    if let Some(delta) = properties.get("delta").and_then(Value::as_str) {
        if !delta.is_empty() {
            let message_id = part
                .get("messageID")
                .and_then(Value::as_str)
                .unwrap_or("opencode-assistant")
                .to_string();
            enqueue_content_delta(
                state,
                turn_id.clone(),
                &message_id,
                part_type,
                delta.to_string(),
                &mut first,
            );
            return first_mapped(first);
        }
    }
    match part_type {
        "text" => {
            enqueue_snapshot(state, turn_id, part, "text", &mut first);
            first_mapped(first)
        }
        "reasoning" | "thinking" => {
            enqueue_snapshot(state, turn_id, part, "reasoning", &mut first);
            first_mapped(first)
        }
        "tool" => {
            if let Some(event) = first {
                state.pending.push_back(event);
            }
            map_tool(state, turn_id, part)
        }
        "step-start" | "step-finish" | "file" | "patch" | "snapshot" => first_mapped(first),
        _ => first_mapped(first),
    }
}

fn enqueue_snapshot(
    state: &mut EventMapState,
    turn_id: Option<String>,
    part: &Value,
    kind: &str,
    first: &mut Option<AgentEventEnvelope>,
) {
    let message_id = part
        .get("messageID")
        .and_then(Value::as_str)
        .unwrap_or(if is_reasoning_type(kind) {
            "opencode-thinking"
        } else {
            "opencode-assistant"
        })
        .to_string();
    if is_user_message(state, &message_id) {
        return;
    }
    let text = part.get("text").and_then(Value::as_str).unwrap_or("");
    let current = if is_reasoning_type(kind) {
        state
            .thinking_text
            .get(&message_id)
            .cloned()
            .unwrap_or_default()
    } else {
        state
            .assistant_text
            .get(&message_id)
            .cloned()
            .unwrap_or_default()
    };
    if text.len() <= current.len() {
        return;
    }
    let suffix = text[current.len()..].to_string();
    enqueue_content_delta(state, turn_id, &message_id, kind, suffix, first);
}

fn enqueue_content_delta(
    state: &mut EventMapState,
    turn_id: Option<String>,
    message_id: &str,
    kind: &str,
    delta: String,
    first: &mut Option<AgentEventEnvelope>,
) {
    let Some(payload) = content_delta(state, message_id, kind, delta) else {
        return;
    };
    let event = complete_before_opposite(state, turn_id, kind, payload);
    if first.is_none() {
        *first = Some(event);
    } else {
        state.pending.push_back(event);
    }
}

fn emit_content_delta(
    state: &mut EventMapState,
    turn_id: Option<String>,
    message_id: &str,
    kind: &str,
    delta: String,
) -> MapOut {
    let Some(payload) = content_delta(state, message_id, kind, delta) else {
        return MapOut::Skip;
    };
    emit(complete_before_opposite(state, turn_id, kind, payload))
}

fn content_delta(
    state: &mut EventMapState,
    message_id: &str,
    kind: &str,
    delta: String,
) -> Option<AgentEvent> {
    if delta.is_empty() || is_user_message(state, message_id) {
        return None;
    }
    if is_reasoning_type(kind) {
        mark_work(state);
        return Some(push_thinking(state, message_id.to_string(), delta));
    }
    if kind == "text" || kind.is_empty() {
        mark_work(state);
        return Some(assistant_delta(state, message_id.to_string(), delta));
    }
    None
}

fn first_mapped(first: Option<AgentEventEnvelope>) -> MapOut {
    match first {
        Some(event) => MapOut::Event(event),
        None => MapOut::Skip,
    }
}

fn is_reasoning_type(part_type: &str) -> bool {
    matches!(part_type, "reasoning" | "thinking")
}

fn complete_before_opposite(
    state: &mut EventMapState,
    turn_id: Option<String>,
    part_type: &str,
    payload: AgentEvent,
) -> AgentEventEnvelope {
    if is_reasoning_type(part_type) {
        complete_before_assistant(state, turn_id.clone(), wrap(turn_id, payload))
    } else {
        complete_before_thinking(state, turn_id.clone(), wrap(turn_id, payload))
    }
}

fn map_tool(state: &mut EventMapState, turn_id: Option<String>, part: &Value) -> MapOut {
    match map_tool_part(part) {
        Some(ToolMapOut::FoldThinking { text, done }) => {
            mark_work(state);
            let message_id = part
                .get("messageID")
                .and_then(Value::as_str)
                .unwrap_or("opencode-thinking")
                .to_string();
            let event = thinking_delta(state, message_id.clone(), text);
            if done {
                state.thinking_message_id = None;
                state.pending.push_back(wrap(
                    turn_id.clone(),
                    AgentEvent::ThinkingCompleted {
                        message_id: message_id.clone(),
                    },
                ));
            }
            emit(complete_before_assistant(
                state,
                turn_id.clone(),
                wrap(turn_id, event),
            ))
        }
        Some(ToolMapOut::FoldPlan { plan }) => {
            mark_work(state);
            emit(complete_before_thinking(
                state,
                turn_id.clone(),
                wrap(turn_id, AgentEvent::PlanUpdated { plan }),
            ))
        }
        Some(ToolMapOut::Hide) => MapOut::Skip,
        Some(ToolMapOut::Tool { tool, mut kind }) => {
            mark_work(state);
            if kind == ToolEventKind::Started && state.started_tools.contains(&tool.tool_call_id) {
                kind = ToolEventKind::Updated;
            }
            if matches!(kind, ToolEventKind::Started | ToolEventKind::Updated) {
                state.started_tools.insert(tool.tool_call_id.clone());
            }
            if matches!(kind, ToolEventKind::Completed | ToolEventKind::Failed) {
                state.started_tools.remove(&tool.tool_call_id);
            }
            emit(complete_before_thinking(
                state,
                turn_id.clone(),
                wrap(turn_id, tool_event(tool, kind)),
            ))
        }
        None => MapOut::Skip,
    }
}

fn map_part_removed(
    state: &mut EventMapState,
    turn_id: Option<String>,
    properties: &Value,
) -> MapOut {
    let Some(part_id) = properties.get("partID").and_then(Value::as_str) else {
        return MapOut::Skip;
    };
    if state.started_tools.remove(part_id) {
        let tool = AgentTool {
            tool_call_id: part_id.to_string(),
            name: "tool".into(),
            title: None,
            kind: crate::contract::AgentToolKind::Other,
            status: crate::contract::AgentToolStatus::Failed,
            params: crate::contract::AgentToolParams::Other { value: Value::Null },
            result: Some(crate::contract::AgentToolResult::Error {
                message: "removed".into(),
            }),
        };
        return emit(wrap(
            turn_id,
            AgentEvent::ToolCallFailed {
                tool_call: tool,
                error: Some("removed".into()),
            },
        ));
    }
    MapOut::Skip
}

fn note_user_message(state: &mut EventMapState, message_id: &str) {
    let id = message_id.trim();
    if id.is_empty() {
        return;
    }
    state.user_message_ids.insert(id.to_string());
}

fn is_user_message(state: &EventMapState, message_id: &str) -> bool {
    state.user_message_ids.contains(message_id)
}

fn map_message_updated(
    state: &mut EventMapState,
    turn_id: Option<String>,
    properties: &Value,
) -> MapOut {
    let Some(info) = properties.get("info") else {
        return MapOut::Skip;
    };
    let message_id = info
        .get("id")
        .or_else(|| info.get("messageID"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let role = info.get("role").and_then(Value::as_str).unwrap_or("");
    if role == "user" || role == "system" {
        note_user_message(state, message_id);
        return MapOut::Skip;
    }
    if role != "assistant" {
        return MapOut::Skip;
    }
    mark_work(state);
    state.last_assistant = Some(info.clone());
    if let Some(error) = info.get("error").filter(|error| !error.is_null()) {
        let mut properties = serde_json::Map::new();
        properties.insert("error".into(), error.clone());
        return map_session_error(state, turn_id, &Value::Object(properties));
    }
    let mut usage = serde_json::Map::new();
    if let Some(tokens) = info.get("tokens") {
        usage.insert("tokens".into(), tokens.clone());
    }
    if let Some(cost) = info.get("cost") {
        usage.insert("cost".into(), cost.clone());
    }
    if usage.is_empty() {
        return MapOut::Skip;
    }
    emit(wrap(
        turn_id,
        AgentEvent::UsageUpdated {
            usage: Value::Object(usage),
        },
    ))
}

fn map_permission_asked(
    state: &mut EventMapState,
    turn_id: Option<String>,
    properties: &Value,
) -> MapOut {
    let Some(request_id) = properties
        .get("id")
        .or_else(|| properties.get("requestID"))
        .or_else(|| properties.get("permissionID"))
        .and_then(Value::as_str)
        .map(str::to_string)
    else {
        return MapOut::Skip;
    };
    if state.pending_asks.contains_key(&request_id) {
        return MapOut::Skip;
    }
    state
        .pending_asks
        .insert(request_id.clone(), PendingAsk::Permission);
    mark_work(state);
    let tool = properties
        .get("permission")
        .or_else(|| properties.get("type"))
        .and_then(Value::as_str)
        .unwrap_or("tool")
        .to_string();
    let description = properties
        .get("title")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            properties
                .get("patterns")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join(", ")
                })
        })
        .unwrap_or_else(|| tool.clone());
    emit(complete_before_thinking(
        state,
        turn_id.clone(),
        wrap(
            turn_id,
            AgentEvent::PermissionRequested {
                request: AgentPermissionRequest {
                    request_id,
                    tool,
                    description,
                    content_markdown: None,
                    options: vec![
                        option("once", "Allow once", "allow_once"),
                        option("always", "Always allow", "allow_always"),
                        option("reject", "Reject", "reject"),
                    ],
                },
            },
        ),
    ))
}

fn option(id: &str, name: &str, kind: &str) -> AgentPermissionOption {
    AgentPermissionOption {
        option_id: id.into(),
        name: name.into(),
        kind: kind.into(),
    }
}

fn map_permission_replied(
    state: &mut EventMapState,
    turn_id: Option<String>,
    properties: &Value,
) -> MapOut {
    let Some(request_id) = properties
        .get("permissionID")
        .or_else(|| properties.get("requestID"))
        .or_else(|| properties.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string)
    else {
        return MapOut::Skip;
    };
    state.pending_asks.remove(&request_id);
    let option_id = properties
        .get("response")
        .or_else(|| properties.get("reply"))
        .and_then(Value::as_str)
        .unwrap_or("once")
        .to_string();
    emit(wrap(
        turn_id,
        AgentEvent::PermissionResolved {
            request_id,
            option_id,
        },
    ))
}

fn map_question_asked(
    state: &mut EventMapState,
    turn_id: Option<String>,
    properties: &Value,
) -> MapOut {
    let Some(request_id) = properties
        .get("id")
        .or_else(|| properties.get("requestID"))
        .and_then(Value::as_str)
        .map(str::to_string)
    else {
        return MapOut::Skip;
    };
    let questions = properties
        .get("questions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let multiple = questions.iter().any(|question| {
        question
            .get("multiple")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    });
    let options: Vec<AgentPermissionOption> = questions
        .first()
        .and_then(|question| question.get("options"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let label = item.get("label").and_then(Value::as_str)?;
                    Some(option(label, label, "allow_once"))
                })
                .collect()
        })
        .unwrap_or_default();

    if questions.len() != 1 || multiple || options.is_empty() {
        mark_work(state);
        state
            .pending_asks
            .insert(request_id.clone(), PendingAsk::Question);
        let unknown = wrap(
            turn_id,
            AgentEvent::Unknown {
                event_type: "question.asked".into(),
                payload: properties.clone(),
            },
        );
        if options.is_empty() {
            state.pending.push_back(unknown);
            return MapOut::AutoRejectQuestion { request_id };
        }
        return emit(unknown);
    }

    state
        .pending_asks
        .insert(request_id.clone(), PendingAsk::Question);
    mark_work(state);
    let description = questions
        .first()
        .and_then(|question| {
            question
                .get("question")
                .or_else(|| question.get("header"))
                .and_then(Value::as_str)
        })
        .unwrap_or("question")
        .to_string();
    emit(complete_before_thinking(
        state,
        turn_id.clone(),
        wrap(
            turn_id,
            AgentEvent::PermissionRequested {
                request: AgentPermissionRequest {
                    request_id,
                    tool: "question".into(),
                    description,
                    content_markdown: None,
                    options,
                },
            },
        ),
    ))
}

fn map_idle(state: &mut EventMapState, turn_id: Option<String>) -> MapOut {
    let Some(turn_id) = turn_id else {
        return MapOut::Skip;
    };
    if !state.idle_armed {
        return MapOut::Skip;
    }
    if state.closed_turn.as_deref() == Some(turn_id.as_str()) {
        return MapOut::Skip;
    }
    state.closed_turn = Some(turn_id.clone());
    state.idle_armed = false;
    let stop = if state.cancel_requested {
        AgentEvent::TurnCanceled {
            turn_id: turn_id.clone(),
        }
    } else {
        AgentEvent::TurnCompleted {
            turn_id: turn_id.clone(),
            stop: TurnStop::Completed,
        }
    };
    emit(complete_open_streams(state, Some(turn_id), stop))
}

fn map_session_error(
    state: &mut EventMapState,
    turn_id: Option<String>,
    properties: &Value,
) -> MapOut {
    let Some(turn_id) = turn_id else {
        return MapOut::Skip;
    };
    if state.closed_turn.as_deref() == Some(turn_id.as_str()) {
        return MapOut::Skip;
    }
    state.closed_turn = Some(turn_id.clone());
    let error = session_error_message(properties);
    emit(complete_open_streams(
        state,
        Some(turn_id.clone()),
        AgentEvent::TurnFailed { turn_id, error },
    ))
}

fn session_error_message(properties: &Value) -> String {
    let Some(error) = properties.get("error") else {
        return "session error".into();
    };
    error
        .pointer("/data/message")
        .and_then(Value::as_str)
        .or_else(|| error.get("message").and_then(Value::as_str))
        .or_else(|| error.get("name").and_then(Value::as_str))
        .map(str::to_string)
        .unwrap_or_else(|| error.to_string())
}

fn map_todo(state: &mut EventMapState, turn_id: Option<String>, properties: &Value) -> MapOut {
    let Some(plan) = crate::map::plan_from_tool_input(Some(properties)) else {
        return MapOut::Skip;
    };
    mark_work(state);
    emit(complete_before_thinking(
        state,
        turn_id.clone(),
        wrap(turn_id, AgentEvent::PlanUpdated { plan }),
    ))
}

fn assistant_delta(state: &mut EventMapState, message_id: String, delta: String) -> AgentEvent {
    state.assistant_message_id = Some(message_id.clone());
    state
        .assistant_text
        .entry(message_id.clone())
        .or_default()
        .push_str(&delta);
    AgentEvent::AssistantMessageDelta { message_id, delta }
}

fn push_thinking(state: &mut EventMapState, message_id: String, delta: String) -> AgentEvent {
    state
        .thinking_text
        .entry(message_id.clone())
        .or_default()
        .push_str(&delta);
    thinking_delta(state, message_id, delta)
}

fn thinking_delta(state: &mut EventMapState, message_id: String, delta: String) -> AgentEvent {
    state.thinking_message_id = Some(message_id.clone());
    AgentEvent::ThinkingDelta { message_id, delta }
}

fn tool_event(tool: AgentTool, kind: ToolEventKind) -> AgentEvent {
    match kind {
        ToolEventKind::Started => AgentEvent::ToolCallStarted { tool_call: tool },
        ToolEventKind::Updated => AgentEvent::ToolCallUpdated { tool_call: tool },
        ToolEventKind::Completed => AgentEvent::ToolCallCompleted { tool_call: tool },
        ToolEventKind::Failed => AgentEvent::ToolCallFailed {
            error: None,
            tool_call: tool,
        },
    }
}

fn wrap(turn_id: Option<String>, payload: AgentEvent) -> AgentEventEnvelope {
    AgentEventEnvelope::new(turn_id, payload)
}

fn emit(event: AgentEventEnvelope) -> MapOut {
    MapOut::Event(event)
}

fn mark_work(state: &mut EventMapState) {
    state.turn_seen_work = true;
}

fn map_session_status(
    state: &mut EventMapState,
    turn_id: Option<String>,
    properties: &Value,
) -> MapOut {
    if status_is_retry(properties) {
        mark_work(state);
        if let Some(message) = retry_message(properties) {
            if retry_is_fatal(message) {
                let mut error = serde_json::Map::new();
                error.insert("message".into(), Value::String(message.to_string()));
                let mut wrapped = serde_json::Map::new();
                wrapped.insert("error".into(), Value::Object(error));
                return map_session_error(state, turn_id, &Value::Object(wrapped));
            }
        }
        return MapOut::Skip;
    }
    if status_is_busy(properties) {
        mark_work(state);
        return MapOut::Skip;
    }
    if status_is_idle(properties) {
        return map_idle(state, turn_id);
    }
    MapOut::Skip
}

fn status_type(properties: &Value) -> &str {
    properties
        .pointer("/status/type")
        .and_then(Value::as_str)
        .or_else(|| properties.get("type").and_then(Value::as_str))
        .unwrap_or("")
}

fn status_is_busy(properties: &Value) -> bool {
    matches!(status_type(properties), "busy" | "busy-generation")
}

fn status_is_retry(properties: &Value) -> bool {
    status_type(properties) == "retry"
}

fn retry_message(properties: &Value) -> Option<&str> {
    properties
        .pointer("/status/message")
        .and_then(Value::as_str)
        .filter(|message| !message.is_empty())
}

fn retry_is_fatal(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    message.contains("套餐已到期")
        || lower.contains("expired")
        || lower.contains("regionerror")
        || lower.contains("requires explicit opt in")
        || lower.contains("invalid api key")
        || lower.contains("unauthorized")
}

fn status_is_idle(properties: &Value) -> bool {
    status_type(properties) == "idle"
}

fn complete_before_thinking(
    state: &mut EventMapState,
    turn_id: Option<String>,
    next: AgentEventEnvelope,
) -> AgentEventEnvelope {
    complete_stream(
        &mut state.thinking_message_id,
        &mut state.pending,
        turn_id,
        |message_id| AgentEvent::ThinkingCompleted { message_id },
        next,
    )
}

fn complete_before_assistant(
    state: &mut EventMapState,
    turn_id: Option<String>,
    next: AgentEventEnvelope,
) -> AgentEventEnvelope {
    complete_stream(
        &mut state.assistant_message_id,
        &mut state.pending,
        turn_id,
        |message_id| AgentEvent::AssistantMessageCompleted { message_id },
        next,
    )
}

fn complete_open_streams(
    state: &mut EventMapState,
    turn_id: Option<String>,
    payload: AgentEvent,
) -> AgentEventEnvelope {
    let next = wrap(turn_id.clone(), payload);
    let next = complete_before_thinking(state, turn_id.clone(), next);
    complete_before_assistant(state, turn_id, next)
}

fn complete_stream(
    open_id: &mut Option<String>,
    pending: &mut VecDeque<AgentEventEnvelope>,
    turn_id: Option<String>,
    completed: impl FnOnce(String) -> AgentEvent,
    next: AgentEventEnvelope,
) -> AgentEventEnvelope {
    if let Some(message_id) = open_id.take() {
        pending.push_back(next);
        wrap(turn_id, completed(message_id))
    } else {
        next
    }
}

#[cfg(test)]
pub(crate) fn drain_mapped(
    state: &mut EventMapState,
    turn_id: Option<String>,
    event: BusEvent,
) -> (Vec<AgentEventEnvelope>, Option<String>) {
    let mut out = Vec::new();
    let mut auto_reject = None;
    match map_event(state, turn_id.clone(), event) {
        MapOut::Event(event) => out.push(event),
        MapOut::AutoRejectQuestion { request_id } => auto_reject = Some(request_id),
        MapOut::Skip | MapOut::Ready => {}
    }
    while let Some(event) = state.pending.pop_front() {
        out.push(event);
    }
    (out, auto_reject)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentToolKind;
    use crate::contract::Capability;
    use crate::contract::{AgentAction, AgentActionError, AgentActionKind};
    use crate::contract::{AgentPrompt, AgentRuntimeConfigUpdate};

    fn map_fixture() -> Vec<AgentEvent> {
        let raw = include_str!("testdata/sse-turn.sse");
        let events = super::super::codec::SseDecoder::decode_all(raw);
        let mut state = EventMapState::new("ses_test".into(), AgentCurrentConfig::default());
        state.idle_armed = true;
        let mut out = Vec::new();
        for sse in events {
            let Some(bus) = super::super::codec::bus_from_sse(&sse) else {
                continue;
            };
            let (mapped, _) = drain_mapped(&mut state, Some("turn-1".into()), bus);
            out.extend(mapped.into_iter().map(|event| event.payload));
        }
        out
    }

    #[test]
    fn s20_maps_text_tool_permission_and_idle() {
        let events = map_fixture();
        assert!(
            events
                .iter()
                .any(|event| matches!(event, AgentEvent::AssistantMessageDelta { delta, .. } if delta == "Hello"))
        );
        let tool = events.iter().find_map(|event| match event {
            AgentEvent::ToolCallCompleted { tool_call } => Some(tool_call),
            _ => None,
        });
        let tool = tool.expect("completed bash");
        assert_eq!(tool.kind, AgentToolKind::Execute);
        assert!(
            events
                .iter()
                .any(|event| matches!(event, AgentEvent::PermissionRequested { request } if request.request_id == "per_abc"))
        );
        assert!(
            events
                .iter()
                .any(|event| matches!(event, AgentEvent::TurnCompleted { turn_id, stop: TurnStop::Completed } if turn_id == "turn-1"))
        );
        assert!(
            events
                .iter()
                .all(|event| !matches!(event, AgentEvent::Unknown { event_type, .. } if event_type == "vendor.mystery"))
        );
        assert_eq!(
            capabilities_for_provider("opencode").steer,
            Capability::Supported
        );
    }

    #[test]
    fn s22_unknown_frame_does_not_kill_the_turn() {
        let events = map_fixture();
        let idle_at = events
            .iter()
            .position(|event| matches!(event, AgentEvent::TurnCompleted { .. }));
        assert!(idle_at.is_some());
    }

    #[test]
    fn steer_action_variant_exists_for_honesty() {
        let _ = AgentAction::Steer {
            input: AgentPrompt::default(),
        };
        let _ = AgentActionKind::Steer;
        let _ = AgentRuntimeConfigUpdate::default();
        let _ = AgentActionError::Unsupported {
            action: AgentActionKind::Steer,
        };
    }

    #[test]
    fn question_fixture_emits_permission_chrome() {
        let asked: Value =
            serde_json::from_str(include_str!("testdata/question-asked.json")).expect("json");
        let mut state = EventMapState::new("ses_x".into(), AgentCurrentConfig::default());
        let (events, reject) = drain_mapped(
            &mut state,
            Some("turn-1".into()),
            BusEvent {
                id: None,
                event_type: "question.asked".into(),
                properties: asked,
            },
        );
        assert!(reject.is_none());
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::PermissionRequested { request } if request.request_id == "que_1"
        )));
        assert_eq!(state.pending_asks.get("que_1"), Some(&PendingAsk::Question));
    }

    #[test]
    fn envelopes_use_atmos_turn_id() {
        let raw = include_str!("testdata/sse-turn.sse");
        let events = super::super::codec::SseDecoder::decode_all(raw);
        let mut state = EventMapState::new("ses_test".into(), AgentCurrentConfig::default());
        state.idle_armed = true;
        for sse in events {
            let Some(bus) = super::super::codec::bus_from_sse(&sse) else {
                continue;
            };
            let (mapped, _) = drain_mapped(&mut state, Some("atmos-turn".into()), bus);
            for event in mapped {
                if event.turn_id.is_some() {
                    assert_eq!(event.turn_id.as_deref(), Some("atmos-turn"));
                }
            }
        }
        assert_eq!(
            state.persistence.as_ref().map(|handle| handle.as_str()),
            Some("ses_test")
        );
    }

    #[test]
    fn skips_user_prompt_text_parts() {
        let mut state = EventMapState::new("ses_test".into(), AgentCurrentConfig::default());
        let user = BusEvent {
            id: None,
            event_type: "message.updated".into(),
            properties: serde_json::json!({
                "sessionID": "ses_test",
                "info": { "id": "msg_user", "role": "user" }
            }),
        };
        let prompt = BusEvent {
            id: None,
            event_type: "message.part.updated".into(),
            properties: serde_json::json!({
                "sessionID": "ses_test",
                "part": {
                    "id": "prt_user",
                    "sessionID": "ses_test",
                    "messageID": "msg_user",
                    "type": "text",
                    "text": "介绍一下项目"
                }
            }),
        };
        let assistant = BusEvent {
            id: None,
            event_type: "message.part.delta".into(),
            properties: serde_json::json!({
                "sessionID": "ses_test",
                "messageID": "msg_a",
                "field": "text",
                "delta": "Hello"
            }),
        };
        let (user_events, _) = drain_mapped(&mut state, Some("turn-1".into()), user);
        let (prompt_events, _) = drain_mapped(&mut state, Some("turn-1".into()), prompt);
        let (assistant_events, _) = drain_mapped(&mut state, Some("turn-1".into()), assistant);
        assert!(user_events.is_empty());
        assert!(prompt_events.is_empty());
        assert!(assistant_events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::AssistantMessageDelta { delta, .. } if delta == "Hello"
        )));
    }

    fn bus(event_type: &str, properties: Value) -> BusEvent {
        BusEvent {
            id: None,
            event_type: event_type.into(),
            properties,
        }
    }

    fn folded_text(events: &[AgentEventEnvelope]) -> (String, String) {
        let mut thinking = String::new();
        let mut assistant = String::new();
        for event in events {
            match &event.payload {
                AgentEvent::ThinkingDelta { delta, .. } => thinking.push_str(delta),
                AgentEvent::AssistantMessageDelta { delta, .. } => assistant.push_str(delta),
                _ => {}
            }
        }
        (thinking, assistant)
    }

    #[test]
    fn reasoning_deltas_with_field_text_stay_out_of_assistant_body() {
        let mut state = EventMapState::new("ses_test".into(), AgentCurrentConfig::default());
        let mut events = Vec::new();
        let frames = [
            bus(
                "message.part.updated",
                serde_json::json!({
                    "sessionID": "ses_test",
                    "part": {
                        "id": "prt_r",
                        "sessionID": "ses_test",
                        "messageID": "msg_a",
                        "type": "reasoning",
                        "text": ""
                    }
                }),
            ),
            bus(
                "message.part.delta",
                serde_json::json!({
                    "sessionID": "ses_test",
                    "messageID": "msg_a",
                    "partID": "prt_r",
                    "field": "text",
                    "delta": "The user is asking who I am."
                }),
            ),
            bus(
                "message.part.updated",
                serde_json::json!({
                    "sessionID": "ses_test",
                    "part": {
                        "id": "prt_r",
                        "sessionID": "ses_test",
                        "messageID": "msg_a",
                        "type": "reasoning",
                        "text": "The user is asking who I am."
                    }
                }),
            ),
            bus(
                "message.part.updated",
                serde_json::json!({
                    "sessionID": "ses_test",
                    "part": {
                        "id": "prt_t",
                        "sessionID": "ses_test",
                        "messageID": "msg_a",
                        "type": "text",
                        "text": "I am OpenCode."
                    }
                }),
            ),
        ];
        for frame in frames {
            let (mapped, _) = drain_mapped(&mut state, Some("turn-1".into()), frame);
            events.extend(mapped);
        }
        let (thinking, assistant) = folded_text(&events);
        assert_eq!(thinking, "The user is asking who I am.");
        assert_eq!(assistant, "I am OpenCode.");
        assert!(!assistant.contains("asking who I am"));
    }

    #[test]
    fn reasoning_delta_before_part_updated_is_not_assistant_text() {
        let mut state = EventMapState::new("ses_test".into(), AgentCurrentConfig::default());
        let mut events = Vec::new();
        let frames = [
            bus(
                "message.part.delta",
                serde_json::json!({
                    "sessionID": "ses_test",
                    "messageID": "msg_a",
                    "partID": "prt_r",
                    "field": "text",
                    "delta": "think first"
                }),
            ),
            bus(
                "message.part.updated",
                serde_json::json!({
                    "sessionID": "ses_test",
                    "part": {
                        "id": "prt_r",
                        "sessionID": "ses_test",
                        "messageID": "msg_a",
                        "type": "reasoning",
                        "text": "think first"
                    }
                }),
            ),
        ];
        for frame in frames {
            let (mapped, _) = drain_mapped(&mut state, Some("turn-1".into()), frame);
            events.extend(mapped);
        }
        let (thinking, assistant) = folded_text(&events);
        assert_eq!(thinking, "think first");
        assert!(assistant.is_empty());
    }

    #[test]
    fn ignored_text_parts_are_skipped() {
        let mut state = EventMapState::new("ses_test".into(), AgentCurrentConfig::default());
        let (events, _) = drain_mapped(
            &mut state,
            Some("turn-1".into()),
            bus(
                "message.part.updated",
                serde_json::json!({
                    "sessionID": "ses_test",
                    "part": {
                        "id": "prt_ignored",
                        "sessionID": "ses_test",
                        "messageID": "msg_a",
                        "type": "text",
                        "ignored": true,
                        "text": "The user is asking who I am."
                    }
                }),
            ),
        );
        let (_, assistant) = folded_text(&events);
        assert!(assistant.is_empty());
    }

    fn idle_event() -> BusEvent {
        BusEvent {
            id: None,
            event_type: "session.idle".into(),
            properties: serde_json::json!({ "sessionID": "ses_test" }),
        }
    }

    fn completed(events: &[AgentEventEnvelope]) -> bool {
        events.iter().any(|event| {
            matches!(
                event.payload,
                AgentEvent::TurnCompleted {
                    stop: TurnStop::Completed,
                    ..
                }
            )
        })
    }

    #[test]
    fn create_idle_before_prompt_does_not_complete_turn() {
        let mut state = EventMapState::new("ses_test".into(), AgentCurrentConfig::default());
        let (events, _) = drain_mapped(&mut state, Some("turn-1".into()), idle_event());
        assert!(!completed(&events));
        assert!(state.closed_turn.is_none());
    }

    #[test]
    fn idle_after_arm_completes_turn() {
        let mut state = EventMapState::new("ses_test".into(), AgentCurrentConfig::default());
        state.idle_armed = true;
        let (events, _) = drain_mapped(&mut state, Some("turn-1".into()), idle_event());
        assert!(completed(&events));
    }

    #[test]
    fn official_session_status_idle_completes_armed_turn() {
        let mut state = EventMapState::new("ses_test".into(), AgentCurrentConfig::default());
        state.idle_armed = true;
        let idle = BusEvent {
            id: None,
            event_type: "session.status".into(),
            properties: serde_json::json!({
                "sessionID": "ses_test",
                "status": { "type": "idle" }
            }),
        };
        let (events, _) = drain_mapped(&mut state, Some("turn-1".into()), idle);
        assert!(completed(&events));
    }

    #[test]
    fn idle_after_assistant_delta_completes_armed_turn() {
        let mut state = EventMapState::new("ses_test".into(), AgentCurrentConfig::default());
        state.idle_armed = true;
        let delta = BusEvent {
            id: None,
            event_type: "message.part.delta".into(),
            properties: serde_json::json!({
                "sessionID": "ses_test",
                "messageID": "msg_a",
                "field": "text",
                "delta": "Hi"
            }),
        };
        let (delta_events, _) = drain_mapped(&mut state, Some("turn-1".into()), delta);
        assert!(delta_events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::AssistantMessageDelta { delta, .. } if delta == "Hi"
        )));
        let (idle_events, _) = drain_mapped(&mut state, Some("turn-1".into()), idle_event());
        assert!(completed(&idle_events));
    }

    #[test]
    fn session_error_without_session_id_fails_armed_turn() {
        let mut state = EventMapState::new("ses_test".into(), AgentCurrentConfig::default());
        state.idle_armed = true;
        let error = BusEvent {
            id: None,
            event_type: "session.error".into(),
            properties: serde_json::json!({
                "error": { "name": "UnknownError", "data": { "message": "no model" } }
            }),
        };
        let (events, _) = drain_mapped(&mut state, Some("turn-1".into()), error);
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::TurnFailed { error, .. } if error == "no model"
        )));
    }

    #[test]
    fn session_error_with_session_id_uses_data_message() {
        let mut state = EventMapState::new("ses_test".into(), AgentCurrentConfig::default());
        state.idle_armed = true;
        let error = BusEvent {
            id: None,
            event_type: "session.error".into(),
            properties: serde_json::json!({
                "sessionID": "ses_test",
                "error": {
                    "name": "APIError",
                    "data": { "message": "RegionError: China opt in required" }
                }
            }),
        };
        let (events, _) = drain_mapped(&mut state, Some("turn-1".into()), error);
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::TurnFailed { error, .. } if error.contains("China opt in")
        )));
    }

    #[test]
    fn assistant_message_error_fails_armed_turn() {
        let mut state = EventMapState::new("ses_test".into(), AgentCurrentConfig::default());
        state.idle_armed = true;
        let updated = BusEvent {
            id: None,
            event_type: "message.updated".into(),
            properties: serde_json::json!({
                "sessionID": "ses_test",
                "info": {
                    "id": "msg_a",
                    "role": "assistant",
                    "sessionID": "ses_test",
                    "error": {
                        "name": "APIError",
                        "data": { "message": "RegionError: China opt in required" }
                    },
                    "tokens": { "input": 0, "output": 0 }
                }
            }),
        };
        let (events, _) = drain_mapped(&mut state, Some("turn-1".into()), updated);
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::TurnFailed { error, .. } if error.contains("China opt in")
        )));
    }

    #[test]
    fn fatal_retry_status_fails_armed_turn() {
        let mut state = EventMapState::new("ses_test".into(), AgentCurrentConfig::default());
        state.idle_armed = true;
        let retry = BusEvent {
            id: None,
            event_type: "session.status".into(),
            properties: serde_json::json!({
                "sessionID": "ses_test",
                "status": {
                    "type": "retry",
                    "attempt": 1,
                    "message": "您的GLM Coding Plan套餐已到期，暂无法使用"
                }
            }),
        };
        let (events, _) = drain_mapped(&mut state, Some("turn-1".into()), retry);
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::TurnFailed { error, .. } if error.contains("套餐已到期")
        )));
    }

    #[test]
    fn transient_retry_status_does_not_complete_turn() {
        let mut state = EventMapState::new("ses_test".into(), AgentCurrentConfig::default());
        state.idle_armed = true;
        let retry = BusEvent {
            id: None,
            event_type: "session.status".into(),
            properties: serde_json::json!({
                "sessionID": "ses_test",
                "status": {
                    "type": "retry",
                    "attempt": 1,
                    "message": "rate limited, retrying"
                }
            }),
        };
        let (events, _) = drain_mapped(&mut state, Some("turn-1".into()), retry);
        assert!(events.is_empty());
        assert!(state.closed_turn.is_none());
    }
}
