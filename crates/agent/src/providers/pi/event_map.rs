//! Pi stdout events → Atmos envelopes. Host turn completes on `agent_settled`.

use std::collections::{HashMap, VecDeque};

use serde_json::Value;

use crate::contract::TurnStop;
use crate::contract::{
    AgentEvent, AgentEventEnvelope, AgentPermissionOption, AgentPermissionRequest,
};
use crate::contract::{AgentTool, AgentToolStatus};

use super::tool_map::{map_tool_execution, ToolMapOut};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExtensionUiKind {
    Confirm,
    Select,
    Input,
    Editor,
}

#[derive(Debug, Default)]
pub struct EventMapState {
    pub pending: VecDeque<AgentEventEnvelope>,
    assistant_message_id: Option<String>,
    thinking_message_id: Option<String>,
    text_by_index: HashMap<i64, String>,
    tools: HashMap<String, AgentTool>,
    toolcall_args: HashMap<String, Value>,
    turn_outcome: Option<TurnOutcome>,
}

#[derive(Debug, Clone)]
enum TurnOutcome {
    Aborted,
    Error(String),
}

impl EventMapState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn queue_session_started(&mut self, persistence_handle: Option<String>) {
        self.pending.push_back(wrap(
            None,
            AgentEvent::SessionStarted { persistence_handle },
        ));
    }
}

pub fn map_event(
    state: &mut EventMapState,
    turn_id: Option<String>,
    frame: &Value,
    pending_ui: &mut HashMap<String, ExtensionUiKind>,
) -> Option<AgentEventEnvelope> {
    let ty = frame.get("type").and_then(Value::as_str).unwrap_or("");
    match ty {
        "turn_end" => {
            record_turn_outcome(state, frame.get("message"));
            None
        }
        "response"
        | "turn_start"
        | "agent_start"
        | "agent_end"
        | "bash_execution_update"
        | "compaction_start"
        | "compaction_end"
        | "auto_retry_start"
        | "auto_retry_end"
        | "summarization_retry_scheduled"
        | "summarization_retry_attempt_start"
        | "summarization_retry_finished"
        | "entry_appended"
        | "session_info_changed"
        | "thinking_level_changed" => None,
        "queue_update" => {
            let _ = frame.get("steering");
            let _ = frame.get("followUp");
            None
        }
        "agent_settled" => turn_id.clone().map(|id| map_settled(state, id)),
        "message_start" => map_message_start(state, turn_id, frame),
        "message_update" => map_message_update(state, turn_id, frame),
        "message_end" => map_message_end(state, turn_id, frame),
        "tool_execution_start" => map_tool(state, turn_id, frame, AgentToolStatus::Running, false),
        "tool_execution_update" => map_tool(state, turn_id, frame, AgentToolStatus::Running, false),
        "tool_execution_end" => {
            let is_error = frame
                .get("isError")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let status = if is_error {
                AgentToolStatus::Failed
            } else {
                AgentToolStatus::Completed
            };
            map_tool(state, turn_id, frame, status, is_error)
        }
        "extension_ui_request" => map_ui_request(turn_id, frame, pending_ui),
        "extension_error" => Some(wrap(
            turn_id,
            AgentEvent::Unknown {
                event_type: "extension_error".into(),
                payload: frame.clone(),
            },
        )),
        "" => None,
        other => {
            tracing::debug!(target: "pi_rpc", event_type = other, "skip unknown pi frame");
            None
        }
    }
}

fn map_settled(state: &mut EventMapState, turn_id: String) -> AgentEventEnvelope {
    complete_open_streams(state, Some(turn_id.clone()));
    state.tools.clear();
    let payload = match state.turn_outcome.take() {
        Some(TurnOutcome::Aborted) => AgentEvent::TurnCanceled {
            turn_id: turn_id.clone(),
        },
        Some(TurnOutcome::Error(error)) => AgentEvent::TurnFailed {
            turn_id: turn_id.clone(),
            error,
        },
        None => AgentEvent::TurnCompleted {
            turn_id: turn_id.clone(),
            stop: TurnStop::Completed,
        },
    };
    wrap(Some(turn_id), payload)
}

fn map_message_start(
    state: &mut EventMapState,
    turn_id: Option<String>,
    frame: &Value,
) -> Option<AgentEventEnvelope> {
    let message = frame.get("message")?;
    if message_role(message) != "assistant" {
        let _ = turn_id;
        return None;
    }
    if message_has_thinking(message) {
        let _ = ensure_thinking_id(state);
    }
    if message_has_text(message) {
        let _ = ensure_assistant_id(state);
    }
    let _ = turn_id;
    None
}

fn map_message_end(
    state: &mut EventMapState,
    turn_id: Option<String>,
    frame: &Value,
) -> Option<AgentEventEnvelope> {
    let message = frame.get("message");
    record_turn_outcome(state, message);
    if message.map(message_role) != Some("assistant") {
        return state.pending.pop_front();
    }
    let text = message.map(message_text).unwrap_or_default();
    let thinking = message.map(message_thinking).unwrap_or_default();
    if !thinking.is_empty() {
        let id = ensure_thinking_id(state);
        if !thinking.is_empty() {
            push(
                state,
                wrap(
                    turn_id.clone(),
                    AgentEvent::ThinkingDelta {
                        message_id: id.clone(),
                        delta: thinking,
                    },
                ),
            );
        }
        state.thinking_message_id = None;
        push(
            state,
            wrap(
                turn_id.clone(),
                AgentEvent::ThinkingCompleted { message_id: id },
            ),
        );
    }
    if text.is_empty() && state.assistant_message_id.is_none() {
        return state.pending.pop_front();
    }
    let message_id = ensure_assistant_id(state);
    let assembled: String = state.text_by_index.values().cloned().collect();
    if assembled.is_empty() && !text.is_empty() {
        push(
            state,
            wrap(
                turn_id.clone(),
                AgentEvent::AssistantMessageDelta {
                    message_id: message_id.clone(),
                    delta: text,
                },
            ),
        );
    }
    state.assistant_message_id = None;
    state.text_by_index.clear();
    Some(complete_before_thinking(
        state,
        turn_id.clone(),
        wrap(
            turn_id,
            AgentEvent::AssistantMessageCompleted { message_id },
        ),
    ))
}

fn map_message_update(
    state: &mut EventMapState,
    turn_id: Option<String>,
    frame: &Value,
) -> Option<AgentEventEnvelope> {
    if let Some(usage) = frame.get("usage") {
        if usage_nonzero(usage) {
            push(
                state,
                wrap(
                    turn_id.clone(),
                    AgentEvent::UsageUpdated {
                        usage: usage.clone(),
                    },
                ),
            );
        }
    }
    let event = frame.get("assistantMessageEvent")?;
    let ty = event.get("type").and_then(Value::as_str).unwrap_or("");
    let content_index = event
        .get("contentIndex")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    match ty {
        "text_start" => {
            let _ = ensure_assistant_id(state);
            state.pending.pop_front()
        }
        "text_delta" => {
            let delta = event.get("delta").and_then(Value::as_str).unwrap_or("");
            state
                .text_by_index
                .entry(content_index)
                .or_default()
                .push_str(delta);
            let message_id = ensure_assistant_id(state);
            Some(complete_before_thinking(
                state,
                turn_id.clone(),
                wrap(
                    turn_id,
                    AgentEvent::AssistantMessageDelta {
                        message_id,
                        delta: delta.to_string(),
                    },
                ),
            ))
        }
        "text_end" => {
            if let Some(content) = event.get("content").and_then(Value::as_str) {
                state
                    .text_by_index
                    .insert(content_index, content.to_string());
            }
            state.pending.pop_front()
        }
        "thinking_start" => {
            let _ = ensure_thinking_id(state);
            state.pending.pop_front()
        }
        "thinking_delta" => {
            let delta = event.get("delta").and_then(Value::as_str).unwrap_or("");
            let message_id = ensure_thinking_id(state);
            Some(complete_before_assistant(
                state,
                turn_id.clone(),
                wrap(
                    turn_id,
                    AgentEvent::ThinkingDelta {
                        message_id,
                        delta: delta.to_string(),
                    },
                ),
            ))
        }
        "thinking_end" => {
            let message_id = state
                .thinking_message_id
                .take()
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            Some(wrap(turn_id, AgentEvent::ThinkingCompleted { message_id }))
        }
        "toolcall_start" => {
            if let (Some(id), Some(name)) = (
                event.get("id").and_then(Value::as_str),
                event.get("toolName").and_then(Value::as_str),
            ) {
                state
                    .toolcall_args
                    .insert(id.to_string(), serde_json::json!({"toolName": name}));
            }
            None
        }
        "toolcall_delta" => None,
        "toolcall_end" => {
            if let Some(tool_call) = event.get("toolCall") {
                if let Some(id) = tool_call.get("id").and_then(Value::as_str) {
                    let args = tool_call.get("arguments").cloned().unwrap_or(Value::Null);
                    state.toolcall_args.insert(id.to_string(), args);
                }
            }
            None
        }
        _ => None,
    }
}

fn map_tool(
    state: &mut EventMapState,
    turn_id: Option<String>,
    frame: &Value,
    status: AgentToolStatus,
    is_error: bool,
) -> Option<AgentEventEnvelope> {
    let tool_call_id = frame
        .get("toolCallId")
        .and_then(Value::as_str)
        .unwrap_or("");
    if tool_call_id.is_empty() {
        return None;
    }
    let tool_name = frame
        .get("toolName")
        .and_then(Value::as_str)
        .unwrap_or("tool");
    let mut args = frame
        .get("args")
        .cloned()
        .unwrap_or(Value::Object(Default::default()));
    if args.is_null() || args.as_object().is_some_and(serde_json::Map::is_empty) {
        if let Some(buffered) = state.toolcall_args.get(tool_call_id) {
            args = buffered.clone();
        }
    }
    let result = frame.get("partialResult").or_else(|| frame.get("result"));
    match map_tool_execution(tool_call_id, tool_name, &args, status, result, is_error) {
        ToolMapOut::Hide => None,
        ToolMapOut::FoldPlan { plan } => Some(complete_before_thinking(
            state,
            turn_id.clone(),
            wrap(turn_id, AgentEvent::PlanUpdated { plan }),
        )),
        ToolMapOut::FoldThinking { text, done } => Some(fold_thinking(state, turn_id, text, done)),
        ToolMapOut::Tool(tool) => {
            let event = tool_event(&tool, status, is_error);
            state.tools.insert(tool.tool_call_id.clone(), tool);
            Some(complete_before_thinking(
                state,
                turn_id.clone(),
                wrap(turn_id, event),
            ))
        }
    }
}

fn tool_event(tool: &AgentTool, status: AgentToolStatus, is_error: bool) -> AgentEvent {
    match status {
        AgentToolStatus::Pending | AgentToolStatus::Running => {
            if tool.result.is_some() {
                AgentEvent::ToolCallUpdated {
                    tool_call: tool.clone(),
                }
            } else {
                AgentEvent::ToolCallStarted {
                    tool_call: tool.clone(),
                }
            }
        }
        AgentToolStatus::Completed => AgentEvent::ToolCallCompleted {
            tool_call: tool.clone(),
        },
        AgentToolStatus::Failed => AgentEvent::ToolCallFailed {
            error: is_error.then(|| "tool failed".into()),
            tool_call: tool.clone(),
        },
    }
}

fn map_ui_request(
    turn_id: Option<String>,
    frame: &Value,
    pending_ui: &mut HashMap<String, ExtensionUiKind>,
) -> Option<AgentEventEnvelope> {
    let method = frame.get("method").and_then(Value::as_str).unwrap_or("");
    let id = frame.get("id").and_then(Value::as_str).unwrap_or("");
    match method {
        "notify" | "setStatus" | "setWidget" | "setTitle" | "set_editor_text" => None,
        "confirm" => {
            pending_ui.insert(id.to_string(), ExtensionUiKind::Confirm);
            let title = frame
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("Permission");
            let message = frame.get("message").and_then(Value::as_str).unwrap_or("");
            Some(wrap(
                turn_id,
                AgentEvent::PermissionRequested {
                    request: AgentPermissionRequest {
                        request_id: id.to_string(),
                        tool: "confirm".into(),
                        description: title.to_string(),
                        content_markdown: Some(message.to_string()),
                        options: vec![
                            AgentPermissionOption {
                                option_id: "allow".into(),
                                name: "Allow".into(),
                                kind: "allow".into(),
                            },
                            AgentPermissionOption {
                                option_id: "deny".into(),
                                name: "Deny".into(),
                                kind: "reject".into(),
                            },
                        ],
                        questions: Vec::new(),
                    },
                },
            ))
        }
        "select" => {
            pending_ui.insert(id.to_string(), ExtensionUiKind::Select);
            let title = frame
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("Permission");
            let options = frame
                .get("options")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let choice_labels: Vec<String> = options
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect();
            let questions = crate::map::ask_question_from_choices(title, &choice_labels);
            Some(wrap(
                turn_id,
                AgentEvent::PermissionRequested {
                    request: AgentPermissionRequest {
                        request_id: id.to_string(),
                        tool: "select".into(),
                        description: title.to_string(),
                        content_markdown: None,
                        options: choice_labels
                            .iter()
                            .map(|option| AgentPermissionOption {
                                option_id: option.clone(),
                                name: option.clone(),
                                kind: "allow".into(),
                            })
                            .collect(),
                        questions,
                    },
                },
            ))
        }
        "input" | "editor" => {
            let kind = if method == "input" {
                ExtensionUiKind::Input
            } else {
                ExtensionUiKind::Editor
            };
            pending_ui.insert(id.to_string(), kind);
            Some(wrap(
                turn_id,
                AgentEvent::Unknown {
                    event_type: method.to_string(),
                    payload: frame.clone(),
                },
            ))
        }
        _ => None,
    }
}

pub fn is_dialog_needing_immediate_cancel(frame: &Value) -> Option<String> {
    let method = frame.get("method").and_then(Value::as_str)?;
    if !matches!(method, "input" | "editor") {
        return None;
    }
    if frame.get("type").and_then(Value::as_str) != Some("extension_ui_request") {
        return None;
    }
    frame.get("id").and_then(Value::as_str).map(str::to_string)
}

fn fold_thinking(
    state: &mut EventMapState,
    turn_id: Option<String>,
    text: String,
    done: bool,
) -> AgentEventEnvelope {
    let message_id = ensure_thinking_id(state);
    if done {
        state.thinking_message_id = None;
        if !text.is_empty() {
            push(
                state,
                wrap(
                    turn_id.clone(),
                    AgentEvent::ThinkingCompleted {
                        message_id: message_id.clone(),
                    },
                ),
            );
            return wrap(
                turn_id,
                AgentEvent::ThinkingDelta {
                    message_id,
                    delta: text,
                },
            );
        }
        return wrap(turn_id, AgentEvent::ThinkingCompleted { message_id });
    }
    wrap(
        turn_id,
        AgentEvent::ThinkingDelta {
            message_id,
            delta: text,
        },
    )
}

fn complete_open_streams(state: &mut EventMapState, turn_id: Option<String>) {
    if let Some(message_id) = state.thinking_message_id.take() {
        push(
            state,
            wrap(
                turn_id.clone(),
                AgentEvent::ThinkingCompleted { message_id },
            ),
        );
    }
    if let Some(message_id) = state.assistant_message_id.take() {
        push(
            state,
            wrap(
                turn_id,
                AgentEvent::AssistantMessageCompleted { message_id },
            ),
        );
    }
}

fn complete_before_thinking(
    state: &mut EventMapState,
    turn_id: Option<String>,
    next: AgentEventEnvelope,
) -> AgentEventEnvelope {
    if let Some(message_id) = state.thinking_message_id.take() {
        push(state, next);
        wrap(turn_id, AgentEvent::ThinkingCompleted { message_id })
    } else {
        next
    }
}

fn complete_before_assistant(
    state: &mut EventMapState,
    turn_id: Option<String>,
    next: AgentEventEnvelope,
) -> AgentEventEnvelope {
    if let Some(message_id) = state.assistant_message_id.take() {
        push(state, next);
        wrap(
            turn_id,
            AgentEvent::AssistantMessageCompleted { message_id },
        )
    } else {
        next
    }
}

fn ensure_assistant_id(state: &mut EventMapState) -> String {
    state
        .assistant_message_id
        .get_or_insert_with(|| uuid::Uuid::new_v4().to_string())
        .clone()
}

fn ensure_thinking_id(state: &mut EventMapState) -> String {
    state
        .thinking_message_id
        .get_or_insert_with(|| uuid::Uuid::new_v4().to_string())
        .clone()
}

fn push(state: &mut EventMapState, event: AgentEventEnvelope) {
    state.pending.push_back(event);
}

fn wrap(turn_id: Option<String>, payload: AgentEvent) -> AgentEventEnvelope {
    AgentEventEnvelope::new(turn_id, payload)
}

fn usage_nonzero(usage: &Value) -> bool {
    for key in ["input", "output", "totalTokens", "cacheRead", "cacheWrite"] {
        if usage.get(key).and_then(Value::as_u64).unwrap_or(0) > 0 {
            return true;
        }
    }
    usage
        .pointer("/cost/total")
        .and_then(Value::as_f64)
        .is_some_and(|total| total > 0.0)
}

fn message_text(message: &Value) -> String {
    if let Some(text) = message.get("content").and_then(Value::as_str) {
        return text.to_string();
    }
    let Some(items) = message.get("content").and_then(Value::as_array) else {
        return String::new();
    };
    items
        .iter()
        .filter_map(|part| {
            if part.get("type").and_then(Value::as_str) == Some("text") {
                part.get("text").and_then(Value::as_str)
            } else {
                None
            }
        })
        .collect()
}

fn message_thinking(message: &Value) -> String {
    let Some(items) = message.get("content").and_then(Value::as_array) else {
        return String::new();
    };
    items
        .iter()
        .filter_map(|part| {
            if matches!(
                part.get("type").and_then(Value::as_str),
                Some("thinking" | "reasoning")
            ) {
                part.get("thinking")
                    .or_else(|| part.get("text"))
                    .and_then(Value::as_str)
            } else {
                None
            }
        })
        .collect()
}

fn message_role(message: &Value) -> &str {
    message.get("role").and_then(Value::as_str).unwrap_or("")
}

fn record_turn_outcome(state: &mut EventMapState, message: Option<&Value>) {
    let Some(message) = message else {
        return;
    };
    if message_role(message) != "assistant" {
        return;
    }
    match message.get("stopReason").and_then(Value::as_str) {
        Some("aborted") => state.turn_outcome = Some(TurnOutcome::Aborted),
        Some("error") => {
            let error = message
                .get("errorMessage")
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
                .unwrap_or("turn failed")
                .to_string();
            state.turn_outcome = Some(TurnOutcome::Error(error));
        }
        _ => {}
    }
}

fn message_has_text(message: &Value) -> bool {
    !message_text(message).is_empty()
}

fn message_has_thinking(message: &Value) -> bool {
    !message_thinking(message).is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentEvent;
    use crate::contract::AgentToolKind;
    use crate::contract::AgentToolParams;

    fn map_jsonl(text: &str, turn: &str) -> Vec<AgentEvent> {
        let mut state = EventMapState::new();
        let mut ui = HashMap::new();
        let mut out = Vec::new();
        for frame in super::super::codec::parse_jsonl(text) {
            if let Some(event) = map_event(&mut state, Some(turn.to_string()), &frame, &mut ui) {
                out.push(event.payload);
            }
            while let Some(event) = state.pending.pop_front() {
                out.push(event.payload);
            }
        }
        out
    }

    #[test]
    fn prompt_turn_completes_on_agent_settled_not_turn_end() {
        let events = map_jsonl(include_str!("testdata/prompt-turn.jsonl"), "atmos-turn");
        let completed: Vec<_> = events
            .iter()
            .filter(|event| {
                matches!(
                    event,
                    AgentEvent::TurnCompleted { turn_id, .. } if turn_id == "atmos-turn"
                )
            })
            .collect();
        assert_eq!(completed.len(), 1);
        assert!(events.iter().any(|event| matches!(
            event,
            AgentEvent::AssistantMessageDelta { delta, .. } if delta == "Hello"
        )));
        assert_eq!(
            events
                .iter()
                .filter(|event| matches!(event, AgentEvent::AssistantMessageDelta { .. }))
                .count(),
            1
        );
        assert!(events
            .iter()
            .any(|event| matches!(event, AgentEvent::UsageUpdated { .. })));
        assert!(!events
            .iter()
            .any(|event| matches!(event, AgentEvent::TurnStarted { .. })));
        assert!(!events
            .iter()
            .any(|event| matches!(event, AgentEvent::UserMessage { .. })));
    }

    #[test]
    fn bash_execute_comes_from_tool_execution() {
        let events = map_jsonl(include_str!("testdata/tool-bash.jsonl"), "t1");
        let started = events.iter().find_map(|event| match event {
            AgentEvent::ToolCallStarted { tool_call } => Some(tool_call),
            _ => None,
        });
        let started = started.expect("started");
        assert_eq!(started.kind, AgentToolKind::Execute);
        assert_eq!(
            started.params,
            AgentToolParams::Execute {
                command: "ls -la".into(),
                cwd: None,
                background: false,
                task_id: None,
            }
        );
        assert!(events
            .iter()
            .any(|event| matches!(event, AgentEvent::ToolCallUpdated { .. })));
        assert!(events
            .iter()
            .any(|event| matches!(event, AgentEvent::ToolCallCompleted { .. })));
    }

    #[test]
    fn unknown_and_queue_update_do_not_kill_session() {
        let events = map_jsonl(include_str!("testdata/unknown-event.jsonl"), "t1");
        assert_eq!(
            events
                .iter()
                .filter(|event| matches!(event, AgentEvent::TurnCompleted { .. }))
                .count(),
            1
        );
        assert!(!events
            .iter()
            .any(|event| matches!(event, AgentEvent::UserMessage { .. })));
    }

    #[test]
    fn write_tool_does_not_emit_permission() {
        let events = map_jsonl(include_str!("testdata/tool-write.jsonl"), "t1");
        let started = events.iter().find_map(|event| match event {
            AgentEvent::ToolCallStarted { tool_call } => Some(tool_call),
            _ => None,
        });
        let started = started.expect("started");
        assert_eq!(started.name, "write");
        assert_eq!(started.kind, AgentToolKind::Edit);
        assert_eq!(
            started.params,
            AgentToolParams::Edit {
                path: "atmos-pi-write-probe.txt".into(),
            }
        );
        assert!(events.iter().any(|event| matches!(
            event,
            AgentEvent::TurnCompleted { turn_id, .. } if turn_id == "t1"
        )));
        assert!(!events
            .iter()
            .any(|event| matches!(event, AgentEvent::PermissionRequested { .. })));
    }

    #[test]
    fn confirm_request_is_permission() {
        let events = map_jsonl(include_str!("testdata/extension-ui-confirm.jsonl"), "t1");
        assert!(matches!(
            &events[0],
            AgentEvent::PermissionRequested { request } if request.request_id == "uuid-2"
        ));
    }

    #[test]
    fn select_request_is_ask_user_permission_with_questions() {
        let events = map_jsonl(include_str!("testdata/extension-ui-select.jsonl"), "t1");
        let Some(AgentEvent::PermissionRequested { request }) = events.first() else {
            panic!("expected PermissionRequested");
        };
        assert_eq!(request.request_id, "uuid-select");
        assert_eq!(request.tool, "select");
        assert_eq!(request.questions.len(), 1);
        assert_eq!(request.questions[0].prompt, "Pick a probe color?");
        assert_eq!(request.questions[0].options, ["Blue", "Red"]);
        assert!(request.options.iter().any(|o| o.option_id == "Blue"));
    }

    #[test]
    fn abort_settled_is_turn_canceled() {
        let events = map_jsonl(include_str!("testdata/abort.jsonl"), "t1");
        assert!(events.iter().any(
            |event| matches!(event, AgentEvent::TurnCanceled { turn_id, .. } if turn_id == "t1")
        ));
        assert!(!events
            .iter()
            .any(|event| matches!(event, AgentEvent::TurnCompleted { .. })));
        assert!(!events
            .iter()
            .any(|event| matches!(event, AgentEvent::UserMessage { .. })));
    }

    #[test]
    fn error_settled_is_turn_failed() {
        let events = map_jsonl(include_str!("testdata/turn-error.jsonl"), "t1");
        assert!(events.iter().any(|event| matches!(
            event,
            AgentEvent::TurnFailed { turn_id, error } if turn_id == "t1" && error.contains("Insufficient Balance")
        )));
        assert!(!events
            .iter()
            .any(|event| matches!(event, AgentEvent::TurnCompleted { .. })));
    }

    #[test]
    fn steer_fixture_ignores_queue_update() {
        let events = map_jsonl(include_str!("testdata/steer.jsonl"), "t1");
        assert!(events
            .iter()
            .any(|event| matches!(event, AgentEvent::TurnCompleted { .. })));
        assert_eq!(events.len(), 1);
    }
}
