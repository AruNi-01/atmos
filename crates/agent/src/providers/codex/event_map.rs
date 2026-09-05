//! Codex notifications → Atmos event envelopes. Envelope `turn_id` is the Atmos epoch.

use std::collections::{HashMap, VecDeque};

use serde_json::Value;

use crate::contract::AgentPersistenceHandle;
use crate::contract::AgentTool;
use crate::contract::{AgentCurrentConfig, AgentIdentity, AgentSupportedOptions};
use crate::contract::{AgentDescriptor, TurnStop};
use crate::contract::{AgentEvent, AgentEventEnvelope};
use crate::policy::{capabilities_for_provider, option_support_for_provider};

use super::tool_map::{
    apply_diff_stats, apply_output_delta, map_item, parse_unified_diff_stats, ItemMapOut, ItemPhase,
};

pub struct EventMapState {
    pub persistence: Option<AgentPersistenceHandle>,
    pub pending: VecDeque<AgentEventEnvelope>,
    pub assistant_message_id: Option<String>,
    pub thinking_message_id: Option<String>,
    pub tools: HashMap<String, AgentTool>,
    pub path_to_tool: HashMap<String, String>,
    pub last_error: Option<String>,
    pub turn_failed_emitted: bool,
    pub identity: AgentIdentity,
    pub capabilities: crate::contract::AgentCapabilities,
    pub supported_options: AgentSupportedOptions,
    pub current_config: AgentCurrentConfig,
}

impl EventMapState {
    pub fn new(current_config: AgentCurrentConfig) -> Self {
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
            tools: HashMap::new(),
            path_to_tool: HashMap::new(),
            last_error: None,
            turn_failed_emitted: false,
            identity: AgentIdentity {
                id: "codex".into(),
                name: "codex".into(),
                version: None,
            },
            capabilities: capabilities_for_provider("codex"),
            supported_options,
            current_config,
        }
    }

    pub fn descriptor(&self) -> AgentDescriptor {
        AgentDescriptor {
            identity: self.identity.clone(),
            capabilities: self.capabilities.clone(),
            support: option_support_for_provider(&self.identity.id),
            supported_options: self.supported_options.clone(),
            current_config: self.current_config.clone(),
        }
    }
}

pub fn map_notification(
    state: &mut EventMapState,
    turn_id: Option<String>,
    method: &str,
    params: &Value,
) -> Vec<AgentEventEnvelope> {
    let first = map_one(state, turn_id, method, params);
    let mut out = Vec::new();
    if let Some(event) = first {
        out.push(event);
    }
    while let Some(event) = state.pending.pop_front() {
        out.push(event);
    }
    out
}

fn map_one(
    state: &mut EventMapState,
    turn_id: Option<String>,
    method: &str,
    params: &Value,
) -> Option<AgentEventEnvelope> {
    match method {
        "thread/started" => {
            if state.persistence.is_some() {
                return None;
            }
            let thread_id = params
                .get("thread")
                .and_then(|thread| thread.get("id"))
                .and_then(Value::as_str)
                .map(str::to_string)?;
            state.persistence = Some(AgentPersistenceHandle::new(thread_id.clone()));
            Some(wrap(
                turn_id,
                AgentEvent::SessionStarted {
                    persistence_handle: Some(thread_id),
                },
            ))
        }
        "thread/name/updated" => {
            let title = params
                .get("threadName")
                .or_else(|| params.get("name"))
                .or_else(|| params.get("title"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|title| !title.is_empty())?
                .to_string();
            Some(wrap(turn_id, AgentEvent::SessionTitleUpdated { title }))
        }
        "thread/tokenUsage/updated" => Some(wrap(
            turn_id,
            AgentEvent::UsageUpdated {
                usage: params.clone(),
            },
        )),
        "turn/started" => None,
        "turn/completed" => map_turn_completed(state, turn_id, params),
        "turn/plan/updated" => {
            let plan = params
                .get("plan")
                .cloned()
                .unwrap_or_else(|| params.clone());
            Some(complete_before_thinking(
                state,
                turn_id.clone(),
                wrap(turn_id, AgentEvent::PlanUpdated { plan }),
            ))
        }
        "turn/diff/updated" => map_diff_updated(state, turn_id, params),
        "error" => map_error(state, turn_id, params),
        "item/started" => map_item_lifecycle(state, turn_id, params, ItemPhase::Started),
        "item/completed" => map_item_lifecycle(state, turn_id, params, ItemPhase::Completed),
        "item/agentMessage/delta" => map_assistant_delta(state, turn_id, params),
        "item/reasoning/summaryTextDelta" | "item/reasoning/textDelta" => {
            map_thinking_delta(state, turn_id, params)
        }
        "item/reasoning/summaryPartAdded" => None,
        "item/plan/delta" => {
            let delta = params
                .get("delta")
                .cloned()
                .unwrap_or_else(|| params.clone());
            Some(complete_before_thinking(
                state,
                turn_id.clone(),
                wrap(turn_id, AgentEvent::PlanUpdated { plan: delta }),
            ))
        }
        "item/commandExecution/outputDelta" => map_output_delta(state, turn_id, params),
        "item/fileChange/patchUpdated" => map_patch_updated(state, turn_id, params),
        "serverRequest/resolved" => None,
        _ => None,
    }
}

fn map_item_lifecycle(
    state: &mut EventMapState,
    turn_id: Option<String>,
    params: &Value,
    phase: ItemPhase,
) -> Option<AgentEventEnvelope> {
    let item = params.get("item")?;
    let item_type = item.get("type").and_then(Value::as_str).unwrap_or("");
    match item_type {
        "userMessage" | "contextCompaction" | "enteredReviewMode" | "exitedReviewMode"
        | "compacted" => None,
        "agentMessage" => map_agent_message_item(state, turn_id, item, phase),
        "reasoning" => map_reasoning_item(state, turn_id, item, phase),
        "plan" => {
            let plan = item.get("text").cloned().unwrap_or_else(|| item.clone());
            Some(complete_before_thinking(
                state,
                turn_id.clone(),
                wrap(turn_id, AgentEvent::PlanUpdated { plan }),
            ))
        }
        _ => map_tool_item(state, turn_id, item, phase),
    }
}

fn map_agent_message_item(
    state: &mut EventMapState,
    turn_id: Option<String>,
    item: &Value,
    phase: ItemPhase,
) -> Option<AgentEventEnvelope> {
    let message_id = item
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    match phase {
        ItemPhase::Started => {
            state.assistant_message_id = Some(message_id.clone());
            let text = item.get("text").and_then(Value::as_str).unwrap_or("");
            if text.is_empty() {
                return None;
            }
            Some(complete_before_thinking(
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
        ItemPhase::Completed => {
            let streamed = state.assistant_message_id.take().is_some();
            let text = item.get("text").and_then(Value::as_str).unwrap_or("");
            if !streamed && !text.is_empty() {
                state.pending.push_back(wrap(
                    turn_id.clone(),
                    AgentEvent::AssistantMessageCompleted {
                        message_id: message_id.clone(),
                    },
                ));
                Some(complete_before_thinking(
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
            } else {
                Some(complete_before_thinking(
                    state,
                    turn_id.clone(),
                    wrap(
                        turn_id,
                        AgentEvent::AssistantMessageCompleted { message_id },
                    ),
                ))
            }
        }
        ItemPhase::Updated => None,
    }
}

fn map_reasoning_item(
    state: &mut EventMapState,
    turn_id: Option<String>,
    item: &Value,
    phase: ItemPhase,
) -> Option<AgentEventEnvelope> {
    let message_id = item
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    match phase {
        ItemPhase::Started => {
            state.thinking_message_id = Some(message_id.clone());
            let text = reasoning_text(item);
            if text.is_empty() {
                return None;
            }
            Some(complete_before_assistant(
                state,
                turn_id.clone(),
                wrap(
                    turn_id,
                    AgentEvent::ThinkingDelta {
                        message_id,
                        delta: text,
                    },
                ),
            ))
        }
        ItemPhase::Completed => {
            state.thinking_message_id = None;
            Some(complete_before_assistant(
                state,
                turn_id.clone(),
                wrap(turn_id, AgentEvent::ThinkingCompleted { message_id }),
            ))
        }
        ItemPhase::Updated => None,
    }
}

fn map_assistant_delta(
    state: &mut EventMapState,
    turn_id: Option<String>,
    params: &Value,
) -> Option<AgentEventEnvelope> {
    let message_id = params
        .get("itemId")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| state.assistant_message_id.clone())?;
    state.assistant_message_id = Some(message_id.clone());
    let delta = params
        .get("delta")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    Some(complete_before_thinking(
        state,
        turn_id.clone(),
        wrap(
            turn_id,
            AgentEvent::AssistantMessageDelta { message_id, delta },
        ),
    ))
}

fn map_thinking_delta(
    state: &mut EventMapState,
    turn_id: Option<String>,
    params: &Value,
) -> Option<AgentEventEnvelope> {
    let message_id = params
        .get("itemId")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| state.thinking_message_id.clone())?;
    state.thinking_message_id = Some(message_id.clone());
    let delta = params
        .get("delta")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    Some(complete_before_assistant(
        state,
        turn_id.clone(),
        wrap(turn_id, AgentEvent::ThinkingDelta { message_id, delta }),
    ))
}

fn map_tool_item(
    state: &mut EventMapState,
    turn_id: Option<String>,
    item: &Value,
    phase: ItemPhase,
) -> Option<AgentEventEnvelope> {
    match map_item(item, phase) {
        ItemMapOut::Hide => None,
        ItemMapOut::Tools(tools) => {
            let mut events = Vec::new();
            for tool in tools {
                remember_tool(state, &tool);
                let event = match phase {
                    ItemPhase::Started => AgentEvent::ToolCallStarted { tool_call: tool },
                    ItemPhase::Updated => AgentEvent::ToolCallUpdated { tool_call: tool },
                    ItemPhase::Completed => {
                        if tool.status == crate::contract::AgentToolStatus::Failed {
                            AgentEvent::ToolCallFailed {
                                error: match &tool.result {
                                    Some(crate::contract::AgentToolResult::Error { message }) => {
                                        Some(message.clone())
                                    }
                                    _ => None,
                                },
                                tool_call: tool,
                            }
                        } else {
                            AgentEvent::ToolCallCompleted { tool_call: tool }
                        }
                    }
                };
                events.push(wrap(turn_id.clone(), event));
            }
            let mut iter = events.into_iter();
            let first = iter.next()?;
            for extra in iter {
                state.pending.push_back(extra);
            }
            Some(complete_before_thinking(state, turn_id, first))
        }
    }
}

fn map_output_delta(
    state: &mut EventMapState,
    turn_id: Option<String>,
    params: &Value,
) -> Option<AgentEventEnvelope> {
    let item_id = params.get("itemId").and_then(Value::as_str)?;
    let delta = params.get("delta").and_then(Value::as_str).unwrap_or("");
    let mut tool = state.tools.get(item_id).cloned()?;
    apply_output_delta(&mut tool, delta);
    state.tools.insert(item_id.to_string(), tool.clone());
    Some(complete_before_thinking(
        state,
        turn_id.clone(),
        wrap(turn_id, AgentEvent::ToolCallUpdated { tool_call: tool }),
    ))
}

fn map_patch_updated(
    state: &mut EventMapState,
    turn_id: Option<String>,
    params: &Value,
) -> Option<AgentEventEnvelope> {
    let item_id = params.get("itemId").and_then(Value::as_str)?;
    let item = serde_json::json!({
        "type": "fileChange",
        "id": item_id,
        "status": "inProgress",
        "changes": params.get("changes").cloned().unwrap_or(Value::Null),
    });
    map_tool_item(state, turn_id, &item, ItemPhase::Updated)
}

fn map_diff_updated(
    state: &mut EventMapState,
    turn_id: Option<String>,
    params: &Value,
) -> Option<AgentEventEnvelope> {
    let diff = params.get("diff").and_then(Value::as_str)?;
    let stats = parse_unified_diff_stats(diff);
    let mut events = Vec::new();
    for (path, additions, deletions) in stats {
        let Some(tool_id) = state.path_to_tool.get(&path).cloned() else {
            continue;
        };
        let Some(mut tool) = state.tools.get(&tool_id).cloned() else {
            continue;
        };
        apply_diff_stats(&mut tool, &path, additions, deletions);
        state.tools.insert(tool_id, tool.clone());
        events.push(wrap(
            turn_id.clone(),
            AgentEvent::ToolCallUpdated { tool_call: tool },
        ));
    }
    let mut iter = events.into_iter();
    let first = iter.next()?;
    for extra in iter {
        state.pending.push_back(extra);
    }
    Some(first)
}

fn map_turn_completed(
    state: &mut EventMapState,
    turn_id: Option<String>,
    params: &Value,
) -> Option<AgentEventEnvelope> {
    let turn = params.get("turn").unwrap_or(params);
    let vendor_status = turn
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("completed");
    let atmos_turn = turn_id.clone()?;
    state.tools.clear();
    state.path_to_tool.clear();
    let event = match vendor_status {
        "interrupted" => AgentEvent::TurnCanceled {
            turn_id: atmos_turn.clone(),
        },
        "failed" => {
            if state.turn_failed_emitted {
                return None;
            }
            state.turn_failed_emitted = true;
            let error = turn
                .get("error")
                .and_then(|error| error.get("message"))
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| state.last_error.clone())
                .unwrap_or_else(|| "turn failed".into());
            AgentEvent::TurnFailed {
                turn_id: atmos_turn.clone(),
                error,
            }
        }
        _ => AgentEvent::TurnCompleted {
            turn_id: atmos_turn.clone(),
            stop: TurnStop::Completed,
        },
    };
    let event = wrap(Some(atmos_turn), event);
    let event = complete_before_assistant(state, turn_id.clone(), event);
    Some(complete_before_thinking(state, turn_id, event))
}

fn map_error(
    state: &mut EventMapState,
    turn_id: Option<String>,
    params: &Value,
) -> Option<AgentEventEnvelope> {
    let message = params
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .or_else(|| params.get("message").and_then(Value::as_str))
        .unwrap_or("turn failed")
        .to_string();
    state.last_error = Some(message.clone());
    if params.get("willRetry") == Some(&Value::Bool(true)) {
        return None;
    }
    if state.turn_failed_emitted {
        return None;
    }
    let atmos_turn = turn_id.clone()?;
    state.turn_failed_emitted = true;
    Some(wrap(
        turn_id,
        AgentEvent::TurnFailed {
            turn_id: atmos_turn,
            error: message,
        },
    ))
}

fn remember_tool(state: &mut EventMapState, tool: &AgentTool) {
    state.tools.insert(tool.tool_call_id.clone(), tool.clone());
    match &tool.params {
        crate::contract::AgentToolParams::Edit { path }
        | crate::contract::AgentToolParams::Delete { path }
        | crate::contract::AgentToolParams::Read { path, .. } => {
            state
                .path_to_tool
                .insert(path.clone(), tool.tool_call_id.clone());
        }
        _ => {}
    }
}

fn reasoning_text(item: &Value) -> String {
    match item.get("summary") {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

fn wrap(turn_id: Option<String>, payload: AgentEvent) -> AgentEventEnvelope {
    AgentEventEnvelope::new(turn_id, payload)
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

fn complete_before_thinking(
    state: &mut EventMapState,
    turn_id: Option<String>,
    next: AgentEventEnvelope,
) -> AgentEventEnvelope {
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
    complete_stream_before(
        &mut state.assistant_message_id,
        &mut state.pending,
        turn_id,
        |message_id| AgentEvent::AssistantMessageCompleted { message_id },
        next,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentToolKind;
    use crate::contract::AgentToolParams;
    use crate::providers::codex::codec::{classify, InboundFrame};

    fn replay(turn_id: &str) -> Vec<AgentEvent> {
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let mut events = Vec::new();
        for line in include_str!("testdata/turn-tools.jsonl").lines() {
            if line.trim().is_empty() {
                continue;
            }
            let value: Value = serde_json::from_str(line).expect("json");
            let InboundFrame::Notification { method, params } = classify(&value) else {
                continue;
            };
            for envelope in map_notification(&mut state, Some(turn_id.into()), &method, &params) {
                assert_eq!(envelope.turn_id.as_deref(), Some(turn_id));
                events.push(envelope.payload);
            }
        }
        events
    }

    #[test]
    fn fixture_maps_tools_thinking_plan_and_omits_unknown() {
        let events = replay("atmos-turn-1");
        assert!(events.iter().any(|event| matches!(
            event,
            AgentEvent::ThinkingDelta { .. } | AgentEvent::ThinkingCompleted { .. }
        )));
        assert!(events
            .iter()
            .any(|event| matches!(event, AgentEvent::PlanUpdated { .. })));
        let kinds: Vec<AgentToolKind> = events
            .iter()
            .filter_map(|event| match event {
                AgentEvent::ToolCallCompleted { tool_call }
                | AgentEvent::ToolCallStarted { tool_call } => Some(tool_call.kind),
                _ => None,
            })
            .collect();
        assert!(kinds.contains(&AgentToolKind::Execute));
        assert!(kinds.contains(&AgentToolKind::Edit));
        assert!(kinds.contains(&AgentToolKind::WebSearch));
        assert!(kinds.contains(&AgentToolKind::Fetch));
        assert!(kinds.contains(&AgentToolKind::McpCall));
        assert!(!events.iter().any(|event| matches!(
            event,
            AgentEvent::UserMessage { .. } | AgentEvent::TurnStarted { .. }
        )));
        assert!(!events
            .iter()
            .any(|event| matches!(event, AgentEvent::Unknown { .. })));
        assert!(
            events
                .iter()
                .any(|event| matches!(event, AgentEvent::TurnCompleted { turn_id, .. } if turn_id == "atmos-turn-1"))
        );
        let execute = events.iter().find_map(|event| match event {
            AgentEvent::ToolCallCompleted { tool_call }
                if tool_call.kind == AgentToolKind::Execute =>
            {
                Some(tool_call)
            }
            _ => None,
        });
        assert!(matches!(
            execute.map(|tool| &tool.params),
            Some(AgentToolParams::Execute { .. })
        ));
    }

    #[test]
    fn retryable_error_does_not_fail_the_turn() {
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let events = map_notification(
            &mut state,
            Some("atmos-turn-1".into()),
            "error",
            &serde_json::json!({
                "error": {"message": "Reconnecting... 2/5"},
                "willRetry": true,
                "threadId": "thr_123",
                "turnId": "turn_456"
            }),
        );
        assert!(events.is_empty());
        assert!(!state.turn_failed_emitted);
    }

    #[test]
    fn remote_control_status_changed_is_dropped() {
        // Live 0.144.5 emits this after initialize; it is telemetry, not a chat event.
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let events = map_notification(
            &mut state,
            None,
            "remoteControl/status/changed",
            &serde_json::json!({ "status": "idle" }),
        );
        assert!(events.is_empty());
    }

    #[test]
    fn capabilities_steer_is_supported() {
        let state = EventMapState::new(AgentCurrentConfig::default());
        assert_eq!(
            state.descriptor().capabilities.steer,
            crate::contract::Capability::Supported
        );
        assert_eq!(
            state.descriptor().capabilities.resume,
            crate::contract::Capability::Supported
        );
        assert_eq!(
            state.descriptor().capabilities.permission,
            crate::contract::Capability::Supported
        );
        assert_eq!(
            state.descriptor().capabilities.configure,
            crate::contract::Capability::Supported
        );
    }
}
