//! Vendor stream-json frames → Atmos `AgentEventEnvelope`.

use std::collections::{HashMap, VecDeque};

use serde_json::{json, Value};

use crate::contract::AgentPersistenceHandle;
use crate::contract::{AgentCurrentConfig, AgentIdentity, AgentSupportedOptions};
use crate::contract::{AgentDescriptor, TurnStop};
use crate::contract::{AgentEvent, AgentEventEnvelope};
use crate::contract::{AgentTool, AgentToolStatus};
use crate::policy::{capabilities_for_provider, option_support_for_provider};

use super::codec::{frame_kind, ClaudeFrameKind};
use super::rpc::{pending_from_can_use_tool, permission_request_event};
use super::tool_map::{map_tool_result, map_tool_use, ToolMapOut};

pub(crate) struct EventMapState {
    pub persistence: Option<AgentPersistenceHandle>,
    pub pending: VecDeque<AgentEventEnvelope>,
    pub assistant_message_id: Option<String>,
    pub thinking_message_id: Option<String>,
    pub streamed_assistant: bool,
    pub streamed_thinking: bool,
    pub tools: HashMap<String, AgentTool>,
    pub identity: AgentIdentity,
    pub capabilities: crate::contract::AgentCapabilities,
    pub supported_options: AgentSupportedOptions,
    pub current_config: AgentCurrentConfig,
    pub cancel_requested: bool,
}

impl EventMapState {
    pub(crate) fn new(current_config: AgentCurrentConfig) -> Self {
        Self {
            persistence: None,
            pending: VecDeque::new(),
            assistant_message_id: None,
            thinking_message_id: None,
            streamed_assistant: false,
            streamed_thinking: false,
            tools: HashMap::new(),
            identity: AgentIdentity {
                id: "claude".into(),
                name: "claude".into(),
                version: None,
            },
            capabilities: capabilities_for_provider("claude"),
            supported_options: AgentSupportedOptions::default(),
            current_config,
            cancel_requested: false,
        }
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

#[derive(Debug)]
pub(crate) enum MappedFrame {
    Envelope(AgentEventEnvelope),
    UnmappedControl { request_id: String, subtype: String },
    Omit,
}

pub(crate) fn map_frame(
    state: &mut EventMapState,
    turn_id: Option<String>,
    frame: &Value,
) -> MappedFrame {
    match frame_kind(frame) {
        ClaudeFrameKind::ControlResponse
        | ClaudeFrameKind::KeepAlive
        | ClaudeFrameKind::RateLimitEvent
        | ClaudeFrameKind::ToolProgress
        | ClaudeFrameKind::CommandLifecycle => MappedFrame::Omit,
        ClaudeFrameKind::ControlRequest => map_control_request(state, turn_id, frame),
        ClaudeFrameKind::System => map_system(state, turn_id, frame),
        ClaudeFrameKind::StreamEvent => map_stream_event(state, turn_id, frame),
        ClaudeFrameKind::Assistant => map_assistant(state, turn_id, frame),
        ClaudeFrameKind::User => map_user(state, turn_id, frame),
        ClaudeFrameKind::Result => map_result(state, turn_id, frame),
        ClaudeFrameKind::Unknown(event_type) => {
            if event_type.is_empty() {
                MappedFrame::Omit
            } else {
                MappedFrame::Envelope(wrap(
                    turn_id,
                    AgentEvent::Unknown {
                        event_type,
                        payload: frame
                            .get("payload")
                            .cloned()
                            .unwrap_or_else(|| frame.clone()),
                    },
                ))
            }
        }
    }
}

fn map_control_request(
    state: &mut EventMapState,
    turn_id: Option<String>,
    frame: &Value,
) -> MappedFrame {
    if let Some(pending) = pending_from_can_use_tool(frame) {
        let request = permission_request_event(&pending);
        return MappedFrame::Envelope(complete_before_thinking(
            state,
            turn_id.clone(),
            wrap(turn_id, AgentEvent::PermissionRequested { request }),
        ));
    }
    let request_id = frame
        .get("request_id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let subtype = frame
        .get("request")
        .and_then(|request| request.get("subtype"))
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    MappedFrame::UnmappedControl {
        request_id,
        subtype,
    }
}

fn map_system(state: &mut EventMapState, turn_id: Option<String>, frame: &Value) -> MappedFrame {
    let subtype = frame.get("subtype").and_then(Value::as_str).unwrap_or("");
    if subtype != "init" {
        return MappedFrame::Omit;
    }
    if let Some(session_id) = frame.get("session_id").and_then(Value::as_str) {
        if !session_id.is_empty() {
            state.persistence = Some(AgentPersistenceHandle::new(session_id));
        }
    }
    if let Some(model) = frame.get("model").and_then(Value::as_str) {
        if !model.is_empty() {
            state.current_config.model = Some(model.to_string());
        }
    }
    let handle = state.persistence.as_ref().map(|handle| handle.0.clone());
    MappedFrame::Envelope(wrap(
        turn_id,
        AgentEvent::SessionStarted {
            persistence_handle: handle,
        },
    ))
}

fn map_stream_event(
    state: &mut EventMapState,
    turn_id: Option<String>,
    frame: &Value,
) -> MappedFrame {
    let event = frame.get("event").unwrap_or(frame);
    if event.get("type").and_then(Value::as_str) != Some("content_block_delta") {
        return MappedFrame::Omit;
    }
    let delta = event.get("delta").cloned().unwrap_or(Value::Null);
    match delta.get("type").and_then(Value::as_str) {
        Some("text_delta") => {
            let text = delta.get("text").and_then(Value::as_str).unwrap_or("");
            if text.is_empty() {
                return MappedFrame::Omit;
            }
            state.streamed_assistant = true;
            let message_id = assistant_id(state);
            MappedFrame::Envelope(complete_before_thinking(
                state,
                turn_id.clone(),
                wrap(
                    turn_id,
                    AgentEvent::AssistantMessageDelta {
                        message_id,
                        delta: text.to_string(),
                    },
                ),
            ))
        }
        Some("thinking_delta") => {
            let text = delta
                .get("thinking")
                .or_else(|| delta.get("text"))
                .and_then(Value::as_str)
                .unwrap_or("");
            if text.is_empty() {
                return MappedFrame::Omit;
            }
            state.streamed_thinking = true;
            let message_id = thinking_id(state);
            MappedFrame::Envelope(complete_before_assistant(
                state,
                turn_id.clone(),
                wrap(
                    turn_id,
                    AgentEvent::ThinkingDelta {
                        message_id,
                        delta: text.to_string(),
                    },
                ),
            ))
        }
        _ => MappedFrame::Omit,
    }
}

fn map_assistant(state: &mut EventMapState, turn_id: Option<String>, frame: &Value) -> MappedFrame {
    let message = frame.get("message").unwrap_or(frame);
    if let Some(id) = message.get("id").and_then(Value::as_str) {
        if state.assistant_message_id.is_none() {
            state.assistant_message_id = Some(id.to_string());
        }
    }
    let content = message
        .get("content")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut first: Option<AgentEventEnvelope> = None;
    let push = |state: &mut EventMapState,
                first: &mut Option<AgentEventEnvelope>,
                event: AgentEventEnvelope| {
        if first.is_none() {
            *first = Some(event);
        } else {
            state.pending.push_back(event);
        }
    };

    for block in &content {
        let block_type = block.get("type").and_then(Value::as_str).unwrap_or("");
        match block_type {
            "thinking" | "redacted_thinking" => {
                if block_type == "redacted_thinking" {
                    continue;
                }
                let text = block
                    .get("thinking")
                    .or_else(|| block.get("text"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if !state.streamed_thinking && !text.is_empty() {
                    let message_id = thinking_id(state);
                    let event = complete_before_assistant(
                        state,
                        turn_id.clone(),
                        wrap(
                            turn_id.clone(),
                            AgentEvent::ThinkingDelta {
                                message_id,
                                delta: text.to_string(),
                            },
                        ),
                    );
                    push(state, &mut first, event);
                }
                if state.thinking_message_id.is_some() || state.streamed_thinking {
                    let event = wrap(
                        turn_id.clone(),
                        AgentEvent::ThinkingCompleted {
                            message_id: thinking_id(state),
                        },
                    );
                    state.thinking_message_id = None;
                    state.streamed_thinking = false;
                    push(state, &mut first, event);
                }
            }
            "text" => {
                let text = block.get("text").and_then(Value::as_str).unwrap_or("");
                if !state.streamed_assistant && !text.is_empty() {
                    let message_id = assistant_id(state);
                    let event = complete_before_thinking(
                        state,
                        turn_id.clone(),
                        wrap(
                            turn_id.clone(),
                            AgentEvent::AssistantMessageDelta {
                                message_id,
                                delta: text.to_string(),
                            },
                        ),
                    );
                    push(state, &mut first, event);
                }
            }
            "tool_use" => {
                let name = block
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown");
                let id = block.get("id").and_then(Value::as_str).unwrap_or("");
                let input = block.get("input").cloned().unwrap_or(json!({}));
                match map_tool_use(name, id, &input, &mut state.tools) {
                    ToolMapOut::FoldThinking { text } => {
                        let message_id = thinking_id(state);
                        let event = complete_before_assistant(
                            state,
                            turn_id.clone(),
                            wrap(
                                turn_id.clone(),
                                AgentEvent::ThinkingDelta {
                                    message_id,
                                    delta: text,
                                },
                            ),
                        );
                        push(state, &mut first, event);
                    }
                    ToolMapOut::FoldPlan { plan } => {
                        let event = complete_open_streams(
                            state,
                            turn_id.clone(),
                            wrap(turn_id.clone(), AgentEvent::PlanUpdated { plan }),
                        );
                        push(state, &mut first, event);
                    }
                    ToolMapOut::Hide => {}
                    ToolMapOut::Merge { tool } => {
                        let status = tool.status;
                        let event = complete_open_streams(
                            state,
                            turn_id.clone(),
                            wrap(turn_id.clone(), merge_tool_event(tool, status)),
                        );
                        push(state, &mut first, event);
                    }
                    ToolMapOut::Tool(tool) => {
                        let event = complete_open_streams(
                            state,
                            turn_id.clone(),
                            wrap(turn_id.clone(), tool_event(tool, AgentToolStatus::Running)),
                        );
                        push(state, &mut first, event);
                    }
                }
            }
            _ => {}
        }
    }

    if state.assistant_message_id.is_some() || state.streamed_assistant {
        let event = wrap(
            turn_id.clone(),
            AgentEvent::AssistantMessageCompleted {
                message_id: assistant_id(state),
            },
        );
        state.assistant_message_id = None;
        state.streamed_assistant = false;
        push(state, &mut first, event);
    }

    match first {
        Some(event) => MappedFrame::Envelope(event),
        None => MappedFrame::Omit,
    }
}

fn map_user(state: &mut EventMapState, turn_id: Option<String>, frame: &Value) -> MappedFrame {
    let message = frame.get("message").unwrap_or(frame);
    let content = message
        .get("content")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut first: Option<AgentEventEnvelope> = None;
    for block in content {
        if block.get("type").and_then(Value::as_str) != Some("tool_result") {
            continue;
        }
        let tool_use_id = block
            .get("tool_use_id")
            .and_then(Value::as_str)
            .unwrap_or("");
        let is_error = block
            .get("is_error")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let content = block.get("content").cloned().unwrap_or(Value::Null);
        let mapped = map_tool_result(tool_use_id, &content, is_error, &mut state.tools);
        let tool = match mapped {
            ToolMapOut::Tool(tool) | ToolMapOut::Merge { tool } => tool,
            _ => continue,
        };
        let status = tool.status;
        let event = complete_open_streams(
            state,
            turn_id.clone(),
            wrap(turn_id.clone(), merge_tool_event(tool, status)),
        );
        if first.is_none() {
            first = Some(event);
        } else {
            state.pending.push_back(event);
        }
    }
    match first {
        Some(event) => MappedFrame::Envelope(event),
        None => MappedFrame::Omit,
    }
}

fn map_result(state: &mut EventMapState, turn_id: Option<String>, frame: &Value) -> MappedFrame {
    let Some(turn_id) = turn_id else {
        return MappedFrame::Omit;
    };
    let mut first: Option<AgentEventEnvelope> = None;
    let mut push = |state: &mut EventMapState, event: AgentEventEnvelope| {
        if first.is_none() {
            first = Some(event);
        } else {
            state.pending.push_back(event);
        }
    };

    if let Some(message_id) = state.thinking_message_id.take() {
        push(
            state,
            wrap(
                Some(turn_id.clone()),
                AgentEvent::ThinkingCompleted { message_id },
            ),
        );
    }
    if let Some(message_id) = state.assistant_message_id.take() {
        push(
            state,
            wrap(
                Some(turn_id.clone()),
                AgentEvent::AssistantMessageCompleted { message_id },
            ),
        );
    }
    state.streamed_assistant = false;
    state.streamed_thinking = false;
    state.tools.clear();

    if frame.get("usage").is_some() || frame.get("total_cost_usd").is_some() {
        let mut usage = frame.get("usage").cloned().unwrap_or_else(|| json!({}));
        if let Some(cost) = frame.get("total_cost_usd") {
            if let Some(object) = usage.as_object_mut() {
                object.insert("total_cost_usd".into(), cost.clone());
            }
        }
        push(
            state,
            wrap(Some(turn_id.clone()), AgentEvent::UsageUpdated { usage }),
        );
    }

    let is_error = frame
        .get("is_error")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let subtype = frame.get("subtype").and_then(Value::as_str).unwrap_or("");
    let stop = if state.cancel_requested {
        AgentEvent::TurnCanceled {
            turn_id: turn_id.clone(),
        }
    } else if is_error || subtype == "error" || subtype.starts_with("error") {
        AgentEvent::TurnFailed {
            turn_id: turn_id.clone(),
            error: frame
                .get("errors")
                .and_then(|value| value.as_str())
                .or_else(|| frame.get("result").and_then(Value::as_str))
                .unwrap_or("turn failed")
                .to_string(),
        }
    } else {
        AgentEvent::TurnCompleted {
            turn_id: turn_id.clone(),
            stop: TurnStop::Completed,
        }
    };
    state.cancel_requested = false;
    push(state, wrap(Some(turn_id), stop));
    match first {
        Some(event) => MappedFrame::Envelope(event),
        None => MappedFrame::Omit,
    }
}

fn tool_event(tool: AgentTool, status: AgentToolStatus) -> AgentEvent {
    match status {
        AgentToolStatus::Pending | AgentToolStatus::Running => {
            AgentEvent::ToolCallStarted { tool_call: tool }
        }
        AgentToolStatus::Completed => AgentEvent::ToolCallCompleted { tool_call: tool },
        AgentToolStatus::Failed => AgentEvent::ToolCallFailed {
            error: None,
            tool_call: tool,
        },
    }
}

fn merge_tool_event(tool: AgentTool, status: AgentToolStatus) -> AgentEvent {
    match status {
        AgentToolStatus::Completed => AgentEvent::ToolCallCompleted { tool_call: tool },
        AgentToolStatus::Failed => AgentEvent::ToolCallFailed {
            error: None,
            tool_call: tool,
        },
        AgentToolStatus::Pending | AgentToolStatus::Running => {
            AgentEvent::ToolCallUpdated { tool_call: tool }
        }
    }
}

fn assistant_id(state: &mut EventMapState) -> String {
    state
        .assistant_message_id
        .get_or_insert_with(|| uuid::Uuid::new_v4().to_string())
        .clone()
}

fn thinking_id(state: &mut EventMapState) -> String {
    state
        .thinking_message_id
        .get_or_insert_with(|| uuid::Uuid::new_v4().to_string())
        .clone()
}

fn complete_open_streams(
    state: &mut EventMapState,
    turn_id: Option<String>,
    next: AgentEventEnvelope,
) -> AgentEventEnvelope {
    let thinking = state.thinking_message_id.take();
    let assistant = state.assistant_message_id.take();
    if thinking.is_some() {
        state.streamed_thinking = false;
    }
    if assistant.is_some() {
        state.streamed_assistant = false;
    }
    match (thinking, assistant) {
        (Some(thinking_id), Some(assistant_id)) => {
            state.pending.push_back(wrap(
                turn_id.clone(),
                AgentEvent::AssistantMessageCompleted {
                    message_id: assistant_id,
                },
            ));
            state.pending.push_back(next);
            wrap(
                turn_id,
                AgentEvent::ThinkingCompleted {
                    message_id: thinking_id,
                },
            )
        }
        (Some(thinking_id), None) => {
            state.pending.push_back(next);
            wrap(
                turn_id,
                AgentEvent::ThinkingCompleted {
                    message_id: thinking_id,
                },
            )
        }
        (None, Some(assistant_id)) => {
            state.pending.push_back(next);
            wrap(
                turn_id,
                AgentEvent::AssistantMessageCompleted {
                    message_id: assistant_id,
                },
            )
        }
        (None, None) => next,
    }
}

fn complete_before_thinking(
    state: &mut EventMapState,
    turn_id: Option<String>,
    next: AgentEventEnvelope,
) -> AgentEventEnvelope {
    if state.thinking_message_id.is_some() {
        state.streamed_thinking = false;
    }
    complete_stream_before(
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
    if state.assistant_message_id.is_some() {
        state.streamed_assistant = false;
    }
    complete_stream_before(
        &mut state.assistant_message_id,
        &mut state.pending,
        turn_id,
        |message_id| AgentEvent::AssistantMessageCompleted { message_id },
        next,
    )
}

fn complete_stream_before(
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

fn wrap(turn_id: Option<String>, payload: AgentEvent) -> AgentEventEnvelope {
    AgentEventEnvelope::new(turn_id, payload)
}

#[cfg(test)]
pub(crate) fn drain_mapped(
    state: &mut EventMapState,
    turn_id: Option<String>,
    frame: &Value,
) -> (Vec<AgentEventEnvelope>, Option<(String, String)>) {
    let mut events = Vec::new();
    let mut unmapped = None;
    match map_frame(state, turn_id, frame) {
        MappedFrame::Envelope(event) => events.push(event),
        MappedFrame::UnmappedControl {
            request_id,
            subtype,
        } => unmapped = Some((request_id, subtype)),
        MappedFrame::Omit => {}
    }
    while let Some(event) = state.pending.pop_front() {
        events.push(event);
    }
    (events, unmapped)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentToolKind;
    use crate::contract::Capability;
    use crate::contract::{AgentToolParams, AgentToolResult};

    fn testdata_jsonl(name: &str) -> Vec<Value> {
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("src/providers/claude/testdata")
            .join(name);
        std::fs::read_to_string(path)
            .expect("fixture")
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| serde_json::from_str(line).expect("jsonl"))
            .collect()
    }

    fn replay(name: &str) -> (EventMapState, Vec<AgentEvent>) {
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let mut events = Vec::new();
        for frame in testdata_jsonl(name) {
            let (mapped, _) = drain_mapped(&mut state, Some("turn-atmos".into()), &frame);
            events.extend(mapped.into_iter().map(|envelope| envelope.payload));
        }
        (state, events)
    }

    #[test]
    fn turn_bash_web_maps_kinds_permission_and_plan() {
        let (state, events) = replay("turn_bash_web.jsonl");
        assert_eq!(state.capabilities.steer, Capability::Supported);
        assert_eq!(
            state.persistence.as_ref().map(|handle| handle.as_str()),
            Some("ses_abc123")
        );
        assert!(events.iter().any(|event| matches!(
            event,
            AgentEvent::SessionStarted {
                persistence_handle: Some(id)
            } if id == "ses_abc123"
        )));
        assert!(events
            .iter()
            .any(|event| matches!(event, AgentEvent::ThinkingDelta { .. })));
        assert!(events.iter().any(|event| matches!(
            event,
            AgentEvent::PermissionRequested { request } if request.request_id == "req_p"
                && request.options.iter().any(|option| option.option_id == "allow_once")
        )));
        assert!(events
            .iter()
            .any(|event| matches!(event, AgentEvent::PlanUpdated { .. })));

        let tools: Vec<&AgentTool> = events
            .iter()
            .filter_map(|event| match event {
                AgentEvent::ToolCallStarted { tool_call }
                | AgentEvent::ToolCallUpdated { tool_call }
                | AgentEvent::ToolCallCompleted { tool_call }
                | AgentEvent::ToolCallFailed { tool_call, .. } => Some(tool_call),
                _ => None,
            })
            .collect();
        assert!(tools.iter().any(|tool| {
            tool.name == "Bash"
                && tool.kind == AgentToolKind::Execute
                && matches!(tool.params, AgentToolParams::Execute { ref command, .. } if command == "ls -la")
        }));
        assert!(tools.iter().any(|tool| {
            tool.name == "Read"
                && tool.kind == AgentToolKind::Read
                && matches!(tool.params, AgentToolParams::Read { ref path, .. } if path == "README.md")
        }));
        assert!(tools.iter().any(|tool| {
            tool.name == "WebSearch"
                && tool.kind == AgentToolKind::WebSearch
                && matches!(tool.params, AgentToolParams::WebSearch { ref query } if query == "atmos acp")
        }));
        assert!(tools.iter().any(|tool| {
            tool.name == "WebFetch"
                && tool.kind == AgentToolKind::Fetch
                && matches!(tool.params, AgentToolParams::Fetch { ref url } if url == "https://example.com/page")
        }));
        assert!(tools.iter().any(|tool| {
            tool.name == "WebSearch"
                && matches!(
                    tool.result,
                    Some(AgentToolResult::WebSearch { ref links, .. }) if !links.is_empty()
                )
        }));
        assert!(!tools.iter().any(|tool| tool.name == "TodoWrite"));
        assert!(events.iter().any(|event| matches!(
            event,
            AgentEvent::TurnCompleted { turn_id, stop: TurnStop::Completed } if turn_id == "turn-atmos"
        )));
        for event in &events {
            let json = serde_json::to_value(event).expect("serialize");
            assert!(json.get("source").is_none());
            assert!(json.get("native").is_none());
        }
    }

    #[test]
    fn mixed_control_unknown_and_error_do_not_abort() {
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let mut saw_unknown = false;
        let mut saw_permission = false;
        let mut saw_turn = false;
        for frame in testdata_jsonl("mixed_control.jsonl") {
            let (mapped, _) = drain_mapped(&mut state, Some("turn-atmos".into()), &frame);
            for envelope in mapped {
                assert_eq!(envelope.turn_id.as_deref(), Some("turn-atmos"));
                match envelope.payload {
                    AgentEvent::Unknown { ref event_type, .. } => {
                        assert_ne!(event_type, "command_lifecycle");
                        saw_unknown = true;
                    }
                    AgentEvent::PermissionRequested { .. } => saw_permission = true,
                    AgentEvent::TurnCompleted { .. } | AgentEvent::TurnFailed { .. } => {
                        saw_turn = true
                    }
                    _ => {}
                }
            }
        }
        assert!(saw_permission);
        assert!(saw_unknown);
        assert!(saw_turn);
    }

    #[test]
    fn envelope_turn_id_is_atmos_epoch() {
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let init: Value = serde_json::from_str(
            &std::fs::read_to_string(
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("src/providers/claude/testdata/init.jsonl"),
            )
            .unwrap(),
        )
        .unwrap();
        let (events, _) = drain_mapped(&mut state, Some("epoch-1".into()), &init);
        assert_eq!(events[0].turn_id.as_deref(), Some("epoch-1"));
        let json = serde_json::to_value(&events[0]).unwrap();
        assert!(json.get("sequence").is_none());
    }
}
