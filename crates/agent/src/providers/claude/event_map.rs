//! Vendor stream-json frames → Atmos `AgentEventEnvelope`.

use std::collections::{HashMap, HashSet, VecDeque};

use serde_json::{json, Value};

use crate::contract::AgentPersistenceHandle;
use crate::contract::{AgentCurrentConfig, AgentIdentity, AgentSupportedOptions};
use crate::contract::{AgentDescriptor, TurnStop};
use crate::contract::{AgentEvent, AgentEventEnvelope};
use crate::contract::{AgentTool, AgentToolKind, AgentToolStatus};
use crate::policy::{capabilities_for_provider, option_support_for_provider};

use super::codec::{frame_kind, ClaudeFrameKind};
use super::rpc::{pending_from_can_use_tool, permission_request_event};
use super::tool_map::{map_tool_result, map_tool_use_nested, ToolMapOut};

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
    /// Last complete main-loop assistant `message.usage` this turn.
    /// Zero stubs and nested subagent usage do not overwrite.
    pub last_assistant_usage: Option<Value>,
    /// Host `result` arrived while a Task/Agent spawn is still running.
    /// Keep `running_turn` so a later host `result` (background wakeup) can settle.
    deferred_host_stop: Option<(String, TurnStop)>,
}

impl EventMapState {
    pub(crate) fn new(current_config: AgentCurrentConfig) -> Self {
        let supported_options = AgentSupportedOptions {
            fast: crate::policy::boolean_fast_modes(crate::policy::is_fast_on(
                current_config.fast.as_deref(),
            )),
            ..AgentSupportedOptions::default()
        };
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
            supported_options,
            current_config,
            cancel_requested: false,
            last_assistant_usage: None,
            deferred_host_stop: None,
        }
    }

    pub(crate) fn has_running_subagent(&self) -> bool {
        unique_subagents(&self.tools).iter().any(|tool| {
            matches!(
                tool.status,
                AgentToolStatus::Running | AgentToolStatus::Pending
            )
        })
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
#[allow(clippy::large_enum_variant)]
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
    let event_type = event.get("type").and_then(Value::as_str);
    // `--include-partial-messages`: occupancy often lands on message_start
    // (`message.usage` with input + cache) rather than the later assistant frame.
    if event_type == Some("message_start") {
        if let Some(usage) = event
            .get("message")
            .and_then(|message| message.get("usage"))
            .or_else(|| event.get("usage"))
        {
            remember_claude_usage(state, frame, usage);
        }
    }
    if event_type != Some("content_block_delta") {
        return MappedFrame::Omit;
    }
    let delta = event.get("delta").cloned().unwrap_or(Value::Null);
    let parent_tool_call_id = parent_tool_use_id(frame);
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
                        parent_tool_call_id,
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
                        parent_tool_call_id,
                    },
                ),
            ))
        }
        _ => MappedFrame::Omit,
    }
}

fn map_assistant(state: &mut EventMapState, turn_id: Option<String>, frame: &Value) -> MappedFrame {
    let message = frame.get("message").unwrap_or(frame);
    if let Some(usage) = message.get("usage") {
        remember_claude_usage(state, frame, usage);
    }
    if let Some(id) = message.get("id").and_then(Value::as_str) {
        if state.assistant_message_id.is_none() {
            state.assistant_message_id = Some(id.to_string());
        }
    }
    let parent_tool_call_id = parent_tool_use_id(frame);
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
                                parent_tool_call_id: parent_tool_call_id.clone(),
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
                                parent_tool_call_id: parent_tool_call_id.clone(),
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
                match map_tool_use_nested(
                    name,
                    id,
                    &input,
                    &mut state.tools,
                    parent_tool_use_id(frame),
                ) {
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
                                    parent_tool_call_id: parent_tool_call_id.clone(),
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
                    ToolMapOut::SyncMode { mode, tool } => {
                        state.current_config.mode = Some(mode.clone());
                        if mode == "plan" {
                            state.current_config.permission_mode = Some("plan".into());
                        } else if state
                            .current_config
                            .permission_mode
                            .as_deref()
                            .is_some_and(|value| value == "plan")
                        {
                            state.current_config.permission_mode = None;
                        }
                        let config =
                            serde_json::to_value(&state.current_config).unwrap_or(Value::Null);
                        let config_event = complete_open_streams(
                            state,
                            turn_id.clone(),
                            wrap(turn_id.clone(), AgentEvent::ConfigChanged { config }),
                        );
                        push(state, &mut first, config_event);
                        let tool_event =
                            wrap(turn_id.clone(), tool_event(tool, AgentToolStatus::Running));
                        push(state, &mut first, tool_event);
                    }
                    ToolMapOut::Hide => {}
                    ToolMapOut::CompleteWait { wait, parent } => {
                        let wait_event = complete_open_streams(
                            state,
                            turn_id.clone(),
                            wrap(turn_id.clone(), tool_event(wait, AgentToolStatus::Running)),
                        );
                        push(state, &mut first, wait_event);
                        let status = parent.status;
                        let parent_event = complete_open_streams(
                            state,
                            turn_id.clone(),
                            wrap(turn_id.clone(), merge_tool_event(parent, status)),
                        );
                        push(state, &mut first, parent_event);
                    }
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
        match mapped {
            ToolMapOut::CompleteWait { wait, parent } => {
                let wait_status = wait.status;
                let parent_status = parent.status;
                let wait_event = complete_open_streams(
                    state,
                    turn_id.clone(),
                    wrap(turn_id.clone(), merge_tool_event(wait, wait_status)),
                );
                let parent_event = complete_open_streams(
                    state,
                    turn_id.clone(),
                    wrap(turn_id.clone(), merge_tool_event(parent, parent_status)),
                );
                if first.is_none() {
                    first = Some(wait_event);
                } else {
                    state.pending.push_back(wait_event);
                }
                state.pending.push_back(parent_event);
            }
            ToolMapOut::Tool(tool) | ToolMapOut::Merge { tool } => {
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
            _ => {}
        }
    }
    match first {
        Some(event) => MappedFrame::Envelope(event),
        None => MappedFrame::Omit,
    }
}

fn map_result(state: &mut EventMapState, turn_id: Option<String>, frame: &Value) -> MappedFrame {
    // Nested child `result` frames must not settle the host turn.
    if parent_tool_use_id(frame).is_some() {
        return MappedFrame::Omit;
    }
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

    let running_subagent = state.has_running_subagent();
    let already_deferred = state.deferred_host_stop.is_some();
    let hold_host_turn = running_subagent && !already_deferred && !state.cancel_requested;
    if hold_host_turn {
        // Claude emits a host `result` when the parent finishes the dispatch
        // ack. The child keeps streaming on the same stdout. Hold the turn
        // open so a later host `result` can settle.
        state.deferred_host_stop = Some((turn_id.clone(), TurnStop::Completed));
    } else {
        if running_subagent {
            for tool in complete_running_subagents(state) {
                let status = tool.status;
                push(
                    state,
                    wrap(Some(turn_id.clone()), merge_tool_event(tool, status)),
                );
            }
        }
        state.tools.clear();
        state.deferred_host_stop = None;
    }

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

    if let Some(context) = crate::map::claude_context_usage(
        state.last_assistant_usage.as_ref(),
        frame.get("usage"),
        frame.get("modelUsage").or_else(|| frame.get("model_usage")),
    ) {
        push(
            state,
            wrap(
                Some(turn_id.clone()),
                AgentEvent::ContextUsageUpdated { usage: context },
            ),
        );
    }
    state.last_assistant_usage = None;

    if hold_host_turn {
        state.cancel_requested = false;
        return match first {
            Some(event) => MappedFrame::Envelope(event),
            None => MappedFrame::Omit,
        };
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

/// Keep last *complete* main-loop occupancy. Skip `{input_tokens:0,output_tokens:0}`
/// stubs (Claude emits these for API-error assistants) and do not let nested
/// `parent_tool_use_id` subagent usage overwrite a main-loop fill.
fn remember_claude_usage(state: &mut EventMapState, frame: &Value, usage: &Value) {
    if crate::map::claude_context_occupancy(usage).is_none() {
        return;
    }
    if parent_tool_use_id(frame).is_some() && state.last_assistant_usage.is_some() {
        return;
    }
    state.last_assistant_usage = Some(usage.clone());
}

fn parent_tool_use_id(frame: &Value) -> Option<String> {
    frame
        .get("parent_tool_use_id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
}

fn unique_subagents(tools: &HashMap<String, AgentTool>) -> Vec<AgentTool> {
    let mut seen = HashSet::new();
    tools
        .values()
        .filter(|tool| {
            tool.kind == AgentToolKind::Subagent && seen.insert(tool.tool_call_id.clone())
        })
        .cloned()
        .collect()
}

fn complete_running_subagents(state: &mut EventMapState) -> Vec<AgentTool> {
    let running: Vec<AgentTool> = unique_subagents(&state.tools)
        .into_iter()
        .filter(|tool| {
            matches!(
                tool.status,
                AgentToolStatus::Running | AgentToolStatus::Pending
            )
        })
        .collect();
    let mut completed = Vec::new();
    for mut tool in running {
        tool.status = AgentToolStatus::Completed;
        state.tools.insert(tool.tool_call_id.clone(), tool.clone());
        if let crate::contract::AgentToolParams::Subagent {
            task_id: Some(task_id),
            ..
        } = &tool.params
        {
            state.tools.insert(task_id.clone(), tool.clone());
        }
        completed.push(tool);
    }
    completed
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
    use crate::contract::AgentToolStatus;
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

    #[test]
    fn nested_stream_text_stamps_parent_tool_use_id() {
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let stream = json!({
            "type": "stream_event",
            "parent_tool_use_id": "toolu_parent",
            "event": {
                "type": "content_block_delta",
                "index": 0,
                "delta": { "type": "text_delta", "text": "nested hello" }
            }
        });
        let (events, _) = drain_mapped(&mut state, Some("turn-1".into()), &stream);
        assert!(events.iter().any(|envelope| matches!(
            envelope.payload,
            AgentEvent::AssistantMessageDelta {
                ref delta,
                parent_tool_call_id: Some(ref parent),
                ..
            } if delta == "nested hello" && parent == "toolu_parent"
        )));

        let mut replay_state = EventMapState::new(AgentCurrentConfig::default());
        let assistant = json!({
            "type": "assistant",
            "parent_tool_use_id": "toolu_parent",
            "message": {
                "id": "msg_nested",
                "role": "assistant",
                "content": [{"type": "text", "text": "nested replay"}]
            }
        });
        let (events, _) = drain_mapped(&mut replay_state, Some("turn-1".into()), &assistant);
        assert!(events.iter().any(|envelope| matches!(
            envelope.payload,
            AgentEvent::AssistantMessageDelta {
                ref delta,
                parent_tool_call_id: Some(ref parent),
                ..
            } if delta == "nested replay" && parent == "toolu_parent"
        )));
    }

    #[test]
    fn result_emits_context_usage_from_last_assistant_and_model_usage() {
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let assistant = json!({
            "type": "assistant",
            "message": {
                "id": "msg_1",
                "role": "assistant",
                "content": [{"type": "text", "text": "hi"}],
                "usage": {
                    "input_tokens": 100,
                    "cache_read_input_tokens": 50,
                    "cache_creation_input_tokens": 10,
                    "output_tokens": 20
                }
            }
        });
        let _ = drain_mapped(&mut state, Some("turn-1".into()), &assistant);
        let assistant2 = json!({
            "type": "assistant",
            "message": {
                "id": "msg_2",
                "role": "assistant",
                "content": [{"type": "text", "text": "again"}],
                "usage": {
                    "input_tokens": 200,
                    "cache_read_input_tokens": 80,
                    "cache_creation_input_tokens": 0,
                    "output_tokens": 30
                }
            }
        });
        let _ = drain_mapped(&mut state, Some("turn-1".into()), &assistant2);
        let result = json!({
            "type": "result",
            "subtype": "success",
            "is_error": false,
            "usage": { "input_tokens": 1, "output_tokens": 1 },
            "modelUsage": {
                "claude-sonnet-4": { "contextWindow": 200000 },
                "claude-sonnet-4[1m]": { "contextWindow": 1000000 }
            }
        });
        let (mapped, _) = drain_mapped(&mut state, Some("turn-1".into()), &result);
        let context = mapped.iter().find_map(|envelope| match &envelope.payload {
            AgentEvent::ContextUsageUpdated { usage } => Some(*usage),
            _ => None,
        });
        let usage = context.expect("context usage");
        assert_eq!(usage.used, 310);
        assert_eq!(usage.context_window, Some(1_000_000));
    }

    #[test]
    fn zero_stub_assistant_does_not_zero_context_usage() {
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let real = json!({
            "type": "assistant",
            "message": {
                "id": "msg_real",
                "usage": {
                    "input_tokens": 5483,
                    "cache_read_input_tokens": 159872,
                    "output_tokens": 1373
                }
            }
        });
        let _ = drain_mapped(&mut state, Some("turn-1".into()), &real);
        let stub = json!({
            "type": "assistant",
            "isApiErrorMessage": true,
            "message": {
                "usage": { "input_tokens": 0, "output_tokens": 0 }
            }
        });
        let _ = drain_mapped(&mut state, Some("turn-1".into()), &stub);
        let result = json!({
            "type": "result",
            "subtype": "success",
            "usage": { "input_tokens": 80, "output_tokens": 40 },
            "modelUsage": { "claude-opus-4-8": { "contextWindow": 200000 } }
        });
        let (mapped, _) = drain_mapped(&mut state, Some("turn-1".into()), &result);
        let usage = mapped
            .iter()
            .find_map(|envelope| match &envelope.payload {
                AgentEvent::ContextUsageUpdated { usage } => Some(*usage),
                _ => None,
            })
            .expect("context usage");
        assert_eq!(usage.used, 166_728);
        assert_eq!(usage.context_window, Some(200_000));
    }

    #[test]
    fn message_start_usage_feeds_context_occupancy() {
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let stream = json!({
            "type": "stream_event",
            "event": {
                "type": "message_start",
                "message": {
                    "id": "msg_stream",
                    "usage": {
                        "input_tokens": 5336,
                        "cache_read_input_tokens": 66816,
                        "output_tokens": 1
                    }
                }
            }
        });
        let _ = drain_mapped(&mut state, Some("turn-1".into()), &stream);
        let result = json!({
            "type": "result",
            "subtype": "success",
            "usage": { "input_tokens": 10, "output_tokens": 4 },
            "modelUsage": { "claude-opus-4-8": { "contextWindow": 200000 } }
        });
        let (mapped, _) = drain_mapped(&mut state, Some("turn-1".into()), &result);
        let usage = mapped
            .iter()
            .find_map(|envelope| match &envelope.payload {
                AgentEvent::ContextUsageUpdated { usage } => Some(*usage),
                _ => None,
            })
            .expect("context usage");
        assert_eq!(usage.used, 72_153);
        assert_eq!(usage.context_window, Some(200_000));
    }

    #[test]
    fn nested_subagent_usage_does_not_overwrite_main_loop_occupancy() {
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let main = json!({
            "type": "assistant",
            "message": {
                "id": "msg_main",
                "usage": {
                    "input_tokens": 5000,
                    "cache_read_input_tokens": 100000,
                    "output_tokens": 200
                }
            }
        });
        let _ = drain_mapped(&mut state, Some("turn-1".into()), &main);
        let nested = json!({
            "type": "assistant",
            "parent_tool_use_id": "toolu_parent",
            "message": {
                "id": "msg_child",
                "usage": {
                    "input_tokens": 12,
                    "cache_read_input_tokens": 30,
                    "output_tokens": 4
                }
            }
        });
        let _ = drain_mapped(&mut state, Some("turn-1".into()), &nested);
        let result = json!({
            "type": "result",
            "subtype": "success",
            "usage": { "input_tokens": 1, "output_tokens": 1 },
            "modelUsage": { "claude-opus-4-8": { "contextWindow": 200000 } }
        });
        let (mapped, _) = drain_mapped(&mut state, Some("turn-1".into()), &result);
        let usage = mapped
            .iter()
            .find_map(|envelope| match &envelope.payload {
                AgentEvent::ContextUsageUpdated { usage } => Some(*usage),
                _ => None,
            })
            .expect("context usage");
        assert_eq!(usage.used, 105_200);
    }

    #[test]
    fn result_does_not_emit_turn_aggregate_as_context_fill() {
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let result = json!({
            "type": "result",
            "subtype": "success",
            "usage": {
                "input_tokens": 446386,
                "cache_read_input_tokens": 15792768,
                "output_tokens": 44408
            },
            "modelUsage": { "claude-opus-4-8": { "contextWindow": 200000 } }
        });
        let (mapped, _) = drain_mapped(&mut state, Some("turn-1".into()), &result);
        let context = mapped.iter().find_map(|envelope| match &envelope.payload {
            AgentEvent::ContextUsageUpdated { usage } => Some(*usage),
            _ => None,
        });
        assert_eq!(context, None);
    }

    #[test]
    fn task_agent_id_text_stays_running_until_taskoutput() {
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let dispatch = json!({
            "type": "assistant",
            "message": {
                "content": [{
                    "type": "tool_use",
                    "id": "tu_task",
                    "name": "Task",
                    "input": {
                        "description": "Inspect tests",
                        "subagent_type": "explore"
                    }
                }]
            }
        });
        let (started, _) = drain_mapped(&mut state, Some("turn-1".into()), &dispatch);
        let AgentEvent::ToolCallStarted { tool_call } = &started[0].payload else {
            panic!("expected started task, got {:?}", started[0].payload);
        };
        assert_eq!(tool_call.status, AgentToolStatus::Running);

        let ack = json!({
            "type": "user",
            "message": {
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": "tu_task",
                    "content": [{
                        "type": "text",
                        "text": "agentId: child1 (use SendMessage to resume)"
                    }]
                }]
            }
        });
        let (acked, _) = drain_mapped(&mut state, Some("turn-1".into()), &ack);
        let AgentEvent::ToolCallUpdated { tool_call } = &acked[0].payload else {
            panic!("expected running ack, got {:?}", acked[0].payload);
        };
        assert_eq!(tool_call.status, AgentToolStatus::Running);
        match &tool_call.params {
            AgentToolParams::Subagent {
                task_id: Some(task_id),
                ..
            } => assert_eq!(task_id, "child1"),
            other => panic!("expected stored agent id, got {other:?}"),
        }

        let poll = json!({
            "type": "assistant",
            "message": {
                "content": [{
                    "type": "tool_use",
                    "id": "tu_poll",
                    "name": "TaskOutput",
                    "input": { "task_id": "child1" }
                }]
            }
        });
        let (waited, _) = drain_mapped(&mut state, Some("turn-1".into()), &poll);
        let AgentEvent::ToolCallStarted { tool_call } = &waited[0].payload else {
            panic!("expected wait tool started, got {:?}", waited[0].payload);
        };
        assert_eq!(tool_call.tool_call_id, "tu_poll");
        assert_eq!(tool_call.name, "TaskOutput");
        assert_eq!(tool_call.kind, AgentToolKind::Other);
        assert_eq!(tool_call.status, AgentToolStatus::Running);

        let done = json!({
            "type": "user",
            "message": {
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": "tu_poll",
                    "content": [{ "type": "text", "text": "All tests pass." }]
                }]
            }
        });
        let (completed, _) = drain_mapped(&mut state, Some("turn-1".into()), &done);
        assert!(completed.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::ToolCallCompleted { tool_call }
                if tool_call.tool_call_id == "tu_poll" && tool_call.status == AgentToolStatus::Completed
        )));
        let AgentEvent::ToolCallCompleted { tool_call } = completed
            .iter()
            .map(|event| &event.payload)
            .find(|payload| matches!(
                payload,
                AgentEvent::ToolCallCompleted { tool_call } if tool_call.tool_call_id == "tu_task"
            ))
            .expect("expected completed parent task")
        else {
            unreachable!()
        };
        assert_eq!(tool_call.tool_call_id, "tu_task");
        assert_eq!(tool_call.status, AgentToolStatus::Completed);
        assert_eq!(
            tool_call.result,
            Some(AgentToolResult::Text {
                text: "All tests pass.".into()
            })
        );
    }

    #[test]
    fn async_launch_host_result_defers_until_a_later_host_result() {
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let spawn = json!({
            "type": "assistant",
            "message": {
                "content": [{
                    "type": "tool_use",
                    "id": "tu_agent",
                    "name": "Agent",
                    "input": {
                        "description": "Explore atmos monorepo",
                        "subagent_type": "Explore"
                    }
                }]
            }
        });
        let (started, _) = drain_mapped(&mut state, Some("turn-1".into()), &spawn);
        assert!(matches!(
            started[0].payload,
            AgentEvent::ToolCallStarted { ref tool_call }
                if tool_call.kind == AgentToolKind::Subagent
                    && tool_call.status == AgentToolStatus::Running
        ));

        let ack = json!({
            "type": "user",
            "message": {
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": "tu_agent",
                    "content": [{
                        "type": "text",
                        "text": "Async agent launched successfully. (This tool result is internal metadata — never quote.) agentId: child1 The agent is working in the background."
                    }]
                }]
            }
        });
        let (acked, _) = drain_mapped(&mut state, Some("turn-1".into()), &ack);
        assert!(matches!(
            acked[0].payload,
            AgentEvent::ToolCallUpdated { ref tool_call }
                if tool_call.status == AgentToolStatus::Running && tool_call.result.is_none()
        ));
        assert!(state.has_running_subagent());

        let nested = json!({
            "type": "assistant",
            "parent_tool_use_id": "tu_agent",
            "message": {
                "content": [{
                    "type": "tool_use",
                    "id": "tu_read",
                    "name": "Read",
                    "input": { "file_path": "AGENTS.md" }
                }]
            }
        });
        let (child, _) = drain_mapped(&mut state, Some("turn-1".into()), &nested);
        assert!(child.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::ToolCallStarted { tool_call }
                if tool_call.tool_call_id == "tu_read"
                    && tool_call.parent_tool_call_id.as_deref() == Some("tu_agent")
        )));

        let early_result = json!({
            "type": "result",
            "subtype": "success",
            "usage": { "input_tokens": 10, "output_tokens": 4 }
        });
        let (held, _) = drain_mapped(&mut state, Some("turn-1".into()), &early_result);
        assert!(
            !held
                .iter()
                .any(|event| matches!(event.payload, AgentEvent::TurnCompleted { .. })),
            "first host result while the spawn is running must not settle the turn: {held:?}"
        );
        assert!(state.has_running_subagent());

        let nested_result = json!({
            "type": "result",
            "subtype": "success",
            "parent_tool_use_id": "tu_agent"
        });
        let (ignored, _) = drain_mapped(&mut state, Some("turn-1".into()), &nested_result);
        assert!(ignored.is_empty());

        let done = json!({
            "type": "result",
            "subtype": "success",
            "usage": { "input_tokens": 20, "output_tokens": 8 }
        });
        let (settled, _) = drain_mapped(&mut state, Some("turn-1".into()), &done);
        assert!(settled.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::ToolCallCompleted { tool_call }
                if tool_call.tool_call_id == "tu_agent"
                    && tool_call.status == AgentToolStatus::Completed
        )));
        assert!(settled.iter().any(|event| matches!(
            event.payload,
            AgentEvent::TurnCompleted { turn_id: ref id, stop: TurnStop::Completed }
                if id == "turn-1"
        )));
        assert!(!state.has_running_subagent());
    }
}
