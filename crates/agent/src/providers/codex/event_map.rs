//! Codex notifications → Atmos event envelopes. Envelope `turn_id` is the Atmos epoch.

use std::collections::{HashMap, VecDeque};

use serde_json::Value;

use crate::contract::AgentPersistenceHandle;
use crate::contract::TextKind;
use crate::contract::{AgentCurrentConfig, AgentIdentity, AgentSupportedOptions};
use crate::contract::{AgentDescriptor, TurnStop};
use crate::contract::{AgentEvent, AgentEventEnvelope};
use crate::contract::{AgentTool, AgentToolKind, AgentToolParams, AgentToolStatus};
use crate::map::plan_from_tool_input;
use crate::policy::{capabilities_for_provider, option_support_for_provider};
use crate::providers::text_parts::{close_open_parts, Snapshot, TextParts};

use super::tool_map::{
    apply_diff_stats, apply_output_delta, map_item, parse_unified_diff_stats, ItemMapOut, ItemPhase,
};

pub struct EventMapState {
    pub persistence: Option<AgentPersistenceHandle>,
    pub pending: VecDeque<AgentEventEnvelope>,
    pub assistant_message_id: Option<String>,
    pub thinking_message_id: Option<String>,
    pub parts: TextParts,
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
            parts: TextParts::default(),
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
        "thread/tokenUsage/updated" => {
            if let Some(context) = crate::map::codex_context_usage(params) {
                state.pending.push_back(wrap(
                    turn_id.clone(),
                    AgentEvent::ContextUsageUpdated { usage: context },
                ));
            }
            Some(wrap(
                turn_id,
                AgentEvent::UsageUpdated {
                    usage: params.clone(),
                },
            ))
        }
        "turn/started" => None,
        "turn/completed" => map_turn_completed(state, turn_id, params),
        "turn/plan/updated" => {
            let plan = atmos_plan_payload(params);
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
            let delta = params.get("delta").unwrap_or(params);
            Some(complete_before_thinking(
                state,
                turn_id.clone(),
                wrap(
                    turn_id,
                    AgentEvent::PlanUpdated {
                        plan: atmos_plan_payload(delta),
                    },
                ),
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
            let plan = item
                .get("text")
                .and_then(|text| {
                    text.as_str()
                        .filter(|value| !value.trim().is_empty())
                        .map(|value| serde_json::json!({ "plan": value }))
                })
                .unwrap_or_else(|| item.clone());
            Some(complete_before_thinking(
                state,
                turn_id.clone(),
                wrap(
                    turn_id,
                    AgentEvent::PlanUpdated {
                        plan: atmos_plan_payload(&plan),
                    },
                ),
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
            let chunk = assistant_chunk(state, &message_id, text.to_string());
            Some(complete_before_thinking(
                state,
                turn_id.clone(),
                wrap(turn_id, chunk),
            ))
        }
        ItemPhase::Completed => {
            state.assistant_message_id = None;
            let text = item.get("text").and_then(Value::as_str).unwrap_or("");
            // `item/completed` carries the whole message: emit only what the
            // deltas have not already delivered.
            let mut events: Vec<AgentEvent> = Vec::new();
            let part_id = match state.parts.snapshot(&message_id, text) {
                Snapshot::Unchanged => message_id.clone(),
                Snapshot::Appends(suffix) => {
                    let suffix = suffix.to_string();
                    events.push(assistant_chunk(state, &message_id, suffix));
                    message_id.clone()
                }
                Snapshot::Revised => {
                    let text = text.to_string();
                    events.push(state.parts.close(message_id.clone(), None));
                    let revised = state.parts.revise(&message_id);
                    events.push(state.parts.chunk(
                        &revised,
                        &message_id,
                        None,
                        TextKind::Answer,
                        text,
                    ));
                    revised
                }
            };
            events.push(state.parts.close(part_id, None));
            let mut events = events.into_iter();
            let head = wrap(turn_id.clone(), events.next()?);
            let head = complete_before_thinking(state, turn_id.clone(), head);
            for event in events {
                state.pending.push_back(wrap(turn_id.clone(), event));
            }
            Some(head)
        }
        ItemPhase::Updated => None,
    }
}

/// Codex addresses the assistant message by `itemId`, so the part is the item.
fn assistant_chunk(state: &mut EventMapState, message_id: &str, text: String) -> AgentEvent {
    state
        .parts
        .chunk(message_id, message_id, None, TextKind::Answer, text)
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
            // Each `summary` entry is its own part, addressed by its summary index.
            let mut events: Vec<AgentEvent> = Vec::new();
            for (summary_index, summary) in reasoning_summaries(item).into_iter().enumerate() {
                match state.parts.snapshot(
                    &reasoning_part_id(&message_id, summary_index as i64),
                    &summary,
                ) {
                    Snapshot::Unchanged => {}
                    Snapshot::Appends(suffix) => {
                        let suffix = suffix.to_string();
                        events.push(thinking_chunk(
                            state,
                            &message_id,
                            summary_index as i64,
                            suffix,
                        ));
                    }
                    Snapshot::Revised => {
                        let part_id = reasoning_part_id(&message_id, summary_index as i64);
                        events.push(state.parts.close(part_id.clone(), None));
                        let revised = state.parts.revise(&part_id);
                        events.push(state.parts.chunk(
                            &revised,
                            &message_id,
                            None,
                            TextKind::Thinking,
                            summary,
                        ));
                    }
                }
            }
            let mut events = events.into_iter();
            let head = wrap(turn_id.clone(), events.next()?);
            let head = complete_before_assistant(state, turn_id.clone(), head);
            for event in events {
                state.pending.push_back(wrap(turn_id.clone(), event));
            }
            Some(head)
        }
        ItemPhase::Completed => {
            state.thinking_message_id = None;
            let prefix = format!("{message_id}:");
            let open: Vec<String> = state
                .parts
                .open_of(TextKind::Thinking)
                .into_iter()
                .filter(|part_id| part_id.starts_with(&prefix))
                .collect();
            let mut closed: Vec<AgentEvent> = open
                .into_iter()
                .map(|part_id| state.parts.close(part_id, None))
                .collect();
            if closed.is_empty() {
                closed.push(state.parts.close(reasoning_part_id(&message_id, 0), None));
            }
            let mut closed = closed.into_iter();
            let head = wrap(turn_id.clone(), closed.next()?);
            let head = complete_before_assistant(state, turn_id.clone(), head);
            for event in closed {
                state.pending.push_back(wrap(turn_id.clone(), event));
            }
            Some(head)
        }
        ItemPhase::Updated => None,
    }
}

/// Codex addresses reasoning by `{itemId}:{summaryIndex}`.
fn reasoning_part_id(message_id: &str, summary_index: i64) -> String {
    format!("{message_id}:{summary_index}")
}

fn thinking_chunk(
    state: &mut EventMapState,
    message_id: &str,
    summary_index: i64,
    text: String,
) -> AgentEvent {
    let part_id = reasoning_part_id(message_id, summary_index);
    state
        .parts
        .chunk(&part_id, message_id, None, TextKind::Thinking, text)
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
    let chunk = assistant_chunk(state, &message_id, delta);
    Some(complete_before_thinking(
        state,
        turn_id.clone(),
        wrap(turn_id, chunk),
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
    let summary_index = params
        .get("summaryIndex")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let delta = params
        .get("delta")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let chunk = thinking_chunk(state, &message_id, summary_index, delta);
    Some(complete_before_assistant(
        state,
        turn_id.clone(),
        wrap(turn_id, chunk),
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
                let Some(tool) = attach_subagent_activity(state, item, tool) else {
                    continue;
                };
                let was_seen = state.tools.contains_key(&tool.tool_call_id);
                remember_tool(state, &tool);
                let event = match tool.status {
                    AgentToolStatus::Pending | AgentToolStatus::Running => {
                        if was_seen {
                            AgentEvent::ToolCallUpdated { tool_call: tool }
                        } else {
                            AgentEvent::ToolCallStarted { tool_call: tool }
                        }
                    }
                    AgentToolStatus::Failed => AgentEvent::ToolCallFailed {
                        error: match &tool.result {
                            Some(crate::contract::AgentToolResult::Error { message }) => {
                                Some(message.clone())
                            }
                            _ => None,
                        },
                        tool_call: tool,
                    },
                    AgentToolStatus::Completed => AgentEvent::ToolCallCompleted { tool_call: tool },
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

/// `subAgentActivity` is a progress signal for the collaboration call. It is
/// not a separate subagent invocation. Reuse the dispatched call ID so the
/// frontend folds its status and output into the original card.
fn attach_subagent_activity(
    state: &EventMapState,
    item: &Value,
    mut tool: AgentTool,
) -> Option<AgentTool> {
    let item_type = item.get("type").and_then(Value::as_str).unwrap_or("");
    let collab_tool = item.get("tool").and_then(Value::as_str).unwrap_or("");
    let attach = item_type == "subAgentActivity"
        || (matches!(item_type, "collabAgentToolCall" | "collabToolCall")
            && matches!(collab_tool, "wait" | "close_agent" | "wait_agent"));
    if !attach {
        return Some(tool);
    }
    let AgentToolParams::Subagent {
        task_id: Some(task_id),
        ..
    } = &tool.params
    else {
        return if item_type == "subAgentActivity" {
            None
        } else {
            Some(tool)
        };
    };
    let original = match state.tools.get(task_id) {
        Some(original) if original.kind == AgentToolKind::Subagent => original,
        _ => {
            return if item_type == "subAgentActivity" {
                None
            } else {
                Some(tool)
            };
        }
    };
    tool.tool_call_id = original.tool_call_id.clone();
    tool.parent_tool_call_id = original.parent_tool_call_id.clone();
    if tool.title.is_none() {
        tool.title = original.title.clone();
    }
    if let (
        AgentToolParams::Subagent {
            description,
            agent_type,
            task_id,
            prompt,
        },
        AgentToolParams::Subagent {
            description: original_description,
            agent_type: original_agent_type,
            task_id: original_task_id,
            prompt: original_prompt,
        },
    ) = (&mut tool.params, &original.params)
    {
        if description.is_empty() || description == "subagent" {
            *description = original_description.clone();
        }
        if agent_type.is_none() {
            *agent_type = original_agent_type.clone();
        }
        if task_id.is_none() {
            *task_id = original_task_id.clone();
        }
        if prompt.is_none() {
            *prompt = original_prompt.clone();
        }
    }
    Some(tool)
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
        AgentToolParams::Subagent {
            task_id: Some(task_id),
            ..
        } => {
            state.tools.insert(task_id.clone(), tool.clone());
        }
        _ => {}
    }
}

fn reasoning_summaries(item: &Value) -> Vec<String> {
    match item.get("summary") {
        Some(Value::String(text)) => vec![text.clone()],
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

fn atmos_plan_payload(value: &Value) -> Value {
    plan_from_tool_input(Some(value)).unwrap_or_else(|| value.clone())
}

fn wrap(turn_id: Option<String>, payload: AgentEvent) -> AgentEventEnvelope {
    AgentEventEnvelope::new(turn_id, payload)
}

fn complete_before_thinking(
    state: &mut EventMapState,
    turn_id: Option<String>,
    next: AgentEventEnvelope,
) -> AgentEventEnvelope {
    if !state.parts.open_of(TextKind::Thinking).is_empty() {
        state.thinking_message_id = None;
    }
    close_open_parts(
        &mut state.parts,
        &mut state.pending,
        turn_id,
        TextKind::Thinking,
        next,
    )
}

fn complete_before_assistant(
    state: &mut EventMapState,
    turn_id: Option<String>,
    next: AgentEventEnvelope,
) -> AgentEventEnvelope {
    if !state.parts.open_of(TextKind::Answer).is_empty() {
        state.assistant_message_id = None;
    }
    close_open_parts(
        &mut state.parts,
        &mut state.pending,
        turn_id,
        TextKind::Answer,
        next,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentToolKind;
    use crate::contract::AgentToolParams;
    use crate::providers::codex::codec::{classify, InboundFrame};
    use crate::providers::text_parts::{reassemble, reassembled_text};

    fn replay(turn_id: &str) -> Vec<AgentEvent> {
        replay_lines(include_str!("testdata/turn-tools.jsonl"), turn_id)
    }

    fn replay_lines(jsonl: &str, turn_id: &str) -> Vec<AgentEvent> {
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let mut events = Vec::new();
        for line in jsonl.lines() {
            if line.trim().is_empty() {
                continue;
            }
            let Ok(value) = serde_json::from_str::<Value>(line) else {
                continue;
            };
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

    fn jsonl_fixtures() -> Vec<(String, String)> {
        let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("src/providers/codex/testdata");
        let mut fixtures: Vec<(String, String)> = std::fs::read_dir(dir)
            .expect("testdata dir")
            .map(|entry| entry.expect("dir entry").path())
            .filter(|path| path.extension().is_some_and(|ext| ext == "jsonl"))
            .map(|path| {
                (
                    path.file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or_default()
                        .to_string(),
                    std::fs::read_to_string(&path).expect("fixture"),
                )
            })
            .collect();
        fixtures.sort_by(|left, right| left.0.cmp(&right.0));
        assert!(!fixtures.is_empty(), "no jsonl fixtures found");
        fixtures
    }

    #[test]
    fn s6_turn_tools_reassembles_to_the_text_codex_sent() {
        let events = replay("atmos-turn-1");
        assert_eq!(reassembled_text(&events, TextKind::Answer), "Done.");
        assert_eq!(
            reassembled_text(&events, TextKind::Thinking),
            "I will run tests."
        );
        // Reasoning is addressed by `{itemId}:{summaryIndex}`, the answer by `itemId`.
        let part_ids: Vec<String> = reassemble(&events)
            .into_iter()
            .map(|(part_id, _, _)| part_id)
            .collect();
        assert_eq!(part_ids, vec!["r_1:0".to_string(), "am_1".to_string()]);
    }

    #[test]
    fn s6_every_jsonl_fixture_keeps_part_offsets_contiguous() {
        for (name, jsonl) in jsonl_fixtures() {
            let events = replay_lines(&jsonl, "atmos-turn-1");
            // Panics on a gap or an overlap in any part's offset sequence.
            for (part_id, _, text) in reassemble(&events) {
                assert!(
                    !text.is_empty(),
                    "{name}: part {part_id} emitted chunks but reassembled empty"
                );
            }
        }
    }

    #[test]
    fn s6_two_reasoning_summary_indexes_become_two_parts() {
        let jsonl = concat!(
            r#"{"method":"item/started","params":{"item":{"type":"reasoning","id":"r_9","summary":[]}}}"#,
            "\n",
            r#"{"method":"item/reasoning/summaryTextDelta","params":{"itemId":"r_9","delta":"first","summaryIndex":0}}"#,
            "\n",
            r#"{"method":"item/reasoning/summaryTextDelta","params":{"itemId":"r_9","delta":"second","summaryIndex":1}}"#,
            "\n",
        );
        let events = replay_lines(jsonl, "atmos-turn-1");
        assert_eq!(
            reassemble(&events),
            vec![
                ("r_9:0".to_string(), TextKind::Thinking, "first".to_string()),
                (
                    "r_9:1".to_string(),
                    TextKind::Thinking,
                    "second".to_string()
                ),
            ]
        );
    }

    #[test]
    fn fixture_maps_tools_thinking_plan_and_omits_unknown() {
        let events = replay("atmos-turn-1");
        assert!(events.iter().any(|event| matches!(
            event,
            AgentEvent::TextChunk {
                kind: TextKind::Thinking,
                ..
            }
        )));
        assert!(events.iter().any(|event| match event {
            AgentEvent::PlanUpdated { plan } =>
                plan.pointer("/entries/0/content")
                    .and_then(|item| item.as_str())
                    == Some("Run tests"),
            _ => false,
        }));
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

    #[test]
    fn token_usage_updated_uses_last_total_not_cumulative() {
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let events = map_notification(
            &mut state,
            Some("atmos-turn-1".into()),
            "thread/tokenUsage/updated",
            &serde_json::json!({
                "tokenUsage": {
                    "total": { "totalTokens": 9000 },
                    "last": { "totalTokens": 5168 },
                    "modelContextWindow": 258400
                }
            }),
        );
        let context = events.iter().find_map(|envelope| match &envelope.payload {
            AgentEvent::ContextUsageUpdated { usage } => Some(*usage),
            _ => None,
        });
        let usage = context.expect("context");
        assert_eq!(usage.used, 5168);
        assert_eq!(usage.context_window, Some(258_400));
    }

    #[test]
    fn subagent_activity_updates_the_dispatched_card() {
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let dispatch = map_notification(
            &mut state,
            Some("turn-1".into()),
            "item/completed",
            &serde_json::json!({
                "item": {
                    "type": "collabAgentToolCall",
                    "id": "collab_1",
                    "tool": "spawn_agent",
                    "prompt": "Inspect the tests",
                    "receiverThreadIds": ["child-1"],
                    "status": "completed",
                    "agentsStates": {}
                }
            }),
        );
        assert!(matches!(
            dispatch.as_slice(),
            [AgentEventEnvelope {
                payload: AgentEvent::ToolCallStarted { tool_call },
                ..
            }] if tool_call.tool_call_id == "collab_1"
                && tool_call.status == AgentToolStatus::Running
        ));

        let progress = map_notification(
            &mut state,
            Some("turn-1".into()),
            "item/completed",
            &serde_json::json!({
                "item": {
                    "type": "subAgentActivity",
                    "id": "activity_1",
                    "kind": "started",
                    "agentThreadId": "child-1",
                    "agentPath": "/root/inspect-tests"
                }
            }),
        );
        assert!(matches!(
            progress.as_slice(),
            [AgentEventEnvelope {
                payload: AgentEvent::ToolCallUpdated { tool_call },
                ..
            }] if tool_call.tool_call_id == "collab_1"
                && tool_call.status == AgentToolStatus::Running
        ));

        let complete = map_notification(
            &mut state,
            Some("turn-1".into()),
            "item/completed",
            &serde_json::json!({
                "item": {
                    "type": "subAgentActivity",
                    "id": "activity_2",
                    "kind": "completed",
                    "agentThreadId": "child-1",
                    "agentPath": "/root/inspect-tests",
                    "result": "All tests pass."
                }
            }),
        );
        assert!(matches!(
            complete.as_slice(),
            [AgentEventEnvelope {
                payload: AgentEvent::ToolCallCompleted { tool_call },
                ..
            }] if tool_call.tool_call_id == "collab_1"
                && matches!(
                    &tool_call.result,
                    Some(crate::contract::AgentToolResult::Text { text }) if text == "All tests pass."
                )
        ));
    }

    #[test]
    fn collab_fixture_spawn_progress_and_wait_share_one_card() {
        let mut state = EventMapState::new(AgentCurrentConfig::default());
        let lines = include_str!("testdata/subagent_collab.jsonl");
        let mut last_id = String::new();
        for line in lines.lines().filter(|line| !line.trim().is_empty()) {
            let item: serde_json::Value = serde_json::from_str(line).unwrap();
            let events = map_notification(
                &mut state,
                Some("turn-1".into()),
                "item/completed",
                &serde_json::json!({ "item": item }),
            );
            if let Some(AgentEventEnvelope {
                payload:
                    AgentEvent::ToolCallCompleted { tool_call }
                    | AgentEvent::ToolCallUpdated { tool_call }
                    | AgentEvent::ToolCallStarted { tool_call },
                ..
            }) = events.first()
            {
                last_id = tool_call.tool_call_id.clone();
            }
        }
        assert_eq!(last_id, "collab_1");
        let tool = state.tools.get("collab_1").expect("spawn card");
        assert_eq!(tool.kind, AgentToolKind::Subagent);
        assert_eq!(tool.status, AgentToolStatus::Completed);
    }
}
