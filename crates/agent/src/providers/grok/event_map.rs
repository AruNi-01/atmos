use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;

use crate::acp_client::client::{AcpSessionEvent, AcpTurnStop};
use crate::acp_client::types::{AgentConfigOption, StreamDelta, ToolCallUpdate};
use crate::contract::AgentPersistenceHandle;
use crate::contract::AgentTool;
use crate::contract::AgentToolKind;
use crate::contract::TextKind;
use crate::contract::{AgentCurrentConfig, AgentIdentity, AgentSupportedOptions, Capability};
use crate::contract::{AgentDescriptor, TurnStop};
use crate::contract::{
    AgentEvent, AgentEventEnvelope, AgentPermissionOption, AgentPermissionRequest,
};
use crate::options::{
    is_mode_config_id, is_permission_mode_config_id, probe_result_from_config_options,
};
use crate::policy::{capabilities_for_provider, option_support_for_provider};
use crate::providers::text_parts::{close_open_parts, TextParts};

use super::chrome::{append_grok_child_prompt, map_xai_ext_events};
use crate::contract::{GrokGoal, GrokWorkflow};

use super::tool_map::{map_tool_call, merge_tool_call_patch, ToolEventKind, ToolMapOut};

pub(crate) struct EventMapState {
    pub provider_id: String,
    pub persistence: Option<AgentPersistenceHandle>,
    pub pending: VecDeque<AgentEventEnvelope>,
    pub assistant_message_id: Option<String>,
    pub thinking_message_id: Option<String>,
    /// Grok's ACP-shaped stream exposes no part index, so part ids are
    /// `{message_id}:{ordinal}`.
    pub parts: TextParts,
    pub replaying: bool,
    pub grok_tasks: HashMap<String, AgentTool>,
    pub tools: HashMap<String, ToolCallUpdate>,
    pub identity: AgentIdentity,
    pub capabilities: crate::contract::AgentCapabilities,
    pub supported_options: AgentSupportedOptions,
    pub current_config: AgentCurrentConfig,
    /// `modelId` → `_meta.totalContextTokens` from session/new / models/update.
    pub model_context_windows: HashMap<String, u64>,
    pub grok_goal: Option<GrokGoal>,
    pub grok_workflow: Option<GrokWorkflow>,
}

impl EventMapState {
    pub(crate) fn new(
        provider_id: String,
        current_config: AgentCurrentConfig,
        replaying: bool,
    ) -> Self {
        let capabilities = capabilities_for_provider(&provider_id);
        Self {
            identity: AgentIdentity {
                id: provider_id.clone(),
                name: provider_id.clone(),
                version: None,
            },
            provider_id,
            persistence: None,
            pending: VecDeque::new(),
            assistant_message_id: None,
            thinking_message_id: None,
            parts: TextParts::default(),
            replaying,
            grok_tasks: HashMap::new(),
            tools: HashMap::new(),
            capabilities,
            supported_options: AgentSupportedOptions::default(),
            current_config,
            model_context_windows: HashMap::new(),
            grok_goal: None,
            grok_workflow: None,
        }
    }

    pub(crate) fn load_model_context_windows(&mut self, catalog: &serde_json::Value) {
        for (id, window) in crate::map::grok_model_context_windows_from_catalog(catalog) {
            self.model_context_windows.insert(id, window);
        }
    }

    pub(crate) fn known_context_window(&self) -> Option<u64> {
        let model = self.current_config.model.as_deref()?;
        // Model labels may include effort suffixes ("grok-4.6 · Extra high").
        if let Some(window) = self.model_context_windows.get(model) {
            return Some(*window);
        }
        let base = model.split(['·', ' ']).next()?.trim();
        self.model_context_windows.get(base).copied().or_else(|| {
            self.model_context_windows.iter().find_map(|(id, window)| {
                (model.starts_with(id.as_str()) || id.as_str() == base).then_some(*window)
            })
        })
    }

    pub(crate) fn descriptor(&self) -> AgentDescriptor {
        AgentDescriptor {
            identity: self.identity.clone(),
            capabilities: self.capabilities.clone(),
            support: option_support_for_provider(&self.provider_id),
            supported_options: self.supported_options.clone(),
            current_config: self.current_config.clone(),
        }
    }
}

pub(crate) fn map_event(
    state: &mut EventMapState,
    turn_id: Option<String>,
    event: AcpSessionEvent,
) -> Option<AgentEventEnvelope> {
    if should_drop_replay(state.replaying, &event) {
        return None;
    }
    match event {
        AcpSessionEvent::SessionReady { acp_session_id } => {
            state.persistence = Some(AgentPersistenceHandle::new(acp_session_id.clone()));
            Some(wrap(
                turn_id,
                AgentEvent::SessionStarted {
                    persistence_handle: Some(acp_session_id),
                },
            ))
        }
        AcpSessionEvent::Stream(delta) => map_stream(state, turn_id, delta),
        AcpSessionEvent::ToolCall(update) => {
            let seen = state.tools.contains_key(&update.tool_call_id);
            let mut update = merge_stored_tool(state, update);
            if update.parent_tool_call_id.is_none() {
                update.parent_tool_call_id =
                    parent_tool_call_for_session(state, update.session_id.as_deref());
            }
            let close_answer = !seen && update.parent_tool_call_id.is_none();
            match map_tool_call(&update, &mut state.grok_tasks) {
                ToolMapOut::FoldThinking { text, done } => {
                    let event = fold_thinking(state, turn_id.clone(), text, done);
                    Some(complete_before_assistant(state, turn_id, event))
                }
                ToolMapOut::FoldPlan { plan } => Some(complete_before_thinking(
                    state,
                    turn_id.clone(),
                    wrap(turn_id, AgentEvent::PlanUpdated { plan }),
                )),
                ToolMapOut::Hide => None,
                ToolMapOut::CompleteWait { wait, parent } => {
                    let wait_kind = tool_status_kind(wait.status);
                    let parent_kind = match parent.status {
                        crate::contract::AgentToolStatus::Completed => ToolEventKind::Completed,
                        crate::contract::AgentToolStatus::Failed => ToolEventKind::Failed,
                        _ => ToolEventKind::Updated,
                    };
                    let first = complete_before_thinking(
                        state,
                        turn_id.clone(),
                        wrap(turn_id.clone(), tool_event(wait, wait_kind)),
                    );
                    state
                        .pending
                        .push_back(wrap(turn_id, tool_event(parent, parent_kind)));
                    Some(first)
                }
                ToolMapOut::Tool(tool) => {
                    let kind = tool_status_kind(tool.status);
                    Some(seal_around_new_tool(
                        state,
                        turn_id,
                        tool_event(tool, kind),
                        close_answer,
                    ))
                }
                ToolMapOut::Replace { tool_call_id, tool } => {
                    debug_assert_eq!(tool_call_id, tool.tool_call_id);
                    let kind = match tool.status {
                        crate::contract::AgentToolStatus::Completed => ToolEventKind::Completed,
                        crate::contract::AgentToolStatus::Failed => ToolEventKind::Failed,
                        _ => ToolEventKind::Updated,
                    };
                    Some(seal_around_new_tool(
                        state,
                        turn_id,
                        tool_event(tool, kind),
                        close_answer,
                    ))
                }
            }
        }
        AcpSessionEvent::PermissionRequest(request) => Some(complete_before_thinking(
            state,
            turn_id.clone(),
            wrap(
                turn_id,
                AgentEvent::PermissionRequested {
                    request: AgentPermissionRequest {
                        request_id: request.request_id,
                        tool: request.tool,
                        description: request.description,
                        content_markdown: request.content_markdown,
                        options: request
                            .options
                            .into_iter()
                            .map(|option| AgentPermissionOption {
                                option_id: option.option_id,
                                name: option.name,
                                kind: option.kind,
                            })
                            .collect(),
                        questions: request.questions,
                        plan_todos: request.plan_todos,
                    },
                },
            ),
        )),
        AcpSessionEvent::TurnEnd(stop) => {
            // Background subagents (and background bash) keep completing after
            // session/prompt returns. Clearing grok_tasks here drops
            // subagent_finished and child sessionId updates.
            let turn_id = turn_id?;
            let event = match stop {
                AcpTurnStop::Canceled => AgentEvent::TurnCanceled {
                    turn_id: turn_id.clone(),
                },
                AcpTurnStop::Failed => AgentEvent::TurnFailed {
                    turn_id: turn_id.clone(),
                    error: "turn failed".into(),
                },
                AcpTurnStop::Completed => AgentEvent::TurnCompleted {
                    turn_id: turn_id.clone(),
                    stop: TurnStop::Completed,
                },
            };
            Some(complete_before_thinking(
                state,
                Some(turn_id.clone()),
                wrap(Some(turn_id), event),
            ))
        }
        AcpSessionEvent::Error { message, .. } => turn_id.map(|turn_id| {
            wrap(
                Some(turn_id.clone()),
                AgentEvent::TurnFailed {
                    turn_id,
                    error: message,
                },
            )
        }),
        AcpSessionEvent::Plan(plan) => Some(complete_before_thinking(
            state,
            turn_id.clone(),
            wrap(
                turn_id,
                AgentEvent::PlanUpdated {
                    plan: serde_json::to_value(plan).unwrap_or(serde_json::Value::Null),
                },
            ),
        )),
        AcpSessionEvent::Usage(usage) => {
            let value = serde_json::to_value(&usage).unwrap_or(serde_json::Value::Null);
            if let Some(context) =
                crate::map::grok_context_usage(&value, state.known_context_window())
            {
                state.pending.push_back(wrap(
                    turn_id.clone(),
                    AgentEvent::UsageUpdated { usage: value },
                ));
                Some(wrap(
                    turn_id,
                    AgentEvent::ContextUsageUpdated { usage: context },
                ))
            } else {
                Some(wrap(turn_id, AgentEvent::UsageUpdated { usage: value }))
            }
        }
        AcpSessionEvent::TurnUsage(usage) => Some(wrap(
            turn_id,
            AgentEvent::UsageUpdated {
                usage: serde_json::to_value(usage).unwrap_or(serde_json::Value::Null),
            },
        )),
        AcpSessionEvent::ConfigOptionsUpdate(options) => {
            merge_config_options(state, &options);
            Some(wrap(
                turn_id,
                AgentEvent::ConfigChanged {
                    config: serde_json::to_value(&state.current_config)
                        .unwrap_or(serde_json::Value::Null),
                },
            ))
        }
        AcpSessionEvent::LoadCompleted => {
            state.replaying = false;
            None
        }
        AcpSessionEvent::SessionClosed { .. } | AcpSessionEvent::SessionEnded => {
            state.grok_tasks.clear();
            state.tools.clear();
            Some(complete_before_thinking(
                state,
                turn_id.clone(),
                wrap(turn_id, AgentEvent::SessionClosed),
            ))
        }
        AcpSessionEvent::SessionInfoUpdate(update) => match update.title {
            Some(Some(title)) => {
                let title = title.trim().to_string();
                if title.is_empty() {
                    None
                } else {
                    Some(wrap(turn_id, AgentEvent::SessionTitleUpdated { title }))
                }
            }
            _ => None,
        },
        AcpSessionEvent::AvailableCommandsUpdate(commands) => Some(wrap(
            turn_id,
            AgentEvent::AvailableCommandsUpdated { commands },
        )),
        AcpSessionEvent::AgentInfoUpdate(info) => {
            if let Some(info) = info {
                state.identity.name = info
                    .title
                    .filter(|title| !title.trim().is_empty())
                    .unwrap_or(info.name);
                if !info.version.is_empty() {
                    state.identity.version = Some(info.version);
                }
            }
            None
        }
        AcpSessionEvent::CapabilitiesUpdate(snapshot) => {
            if snapshot.session_resume.supported || snapshot.load_session.supported {
                state.capabilities.resume = Capability::Supported;
            }
            None
        }
    }
}

fn map_stream(
    state: &mut EventMapState,
    turn_id: Option<String>,
    delta: StreamDelta,
) -> Option<AgentEventEnvelope> {
    if delta.kind == "thinking" {
        let event = map_thinking_stream(state, turn_id.clone(), delta);
        Some(complete_before_assistant(state, turn_id, event))
    } else if delta.role == "assistant" {
        let event = map_assistant_stream(state, turn_id.clone(), delta);
        Some(complete_before_thinking(state, turn_id, event))
    } else if delta.role == "user" {
        let tool = append_grok_child_prompt(
            &mut state.grok_tasks,
            state.persistence.as_ref().map(|handle| handle.as_str()),
            delta.session_id.as_deref(),
            &delta.delta,
        )?;
        Some(wrap(
            turn_id,
            AgentEvent::ToolCallUpdated { tool_call: tool },
        ))
    } else {
        None
    }
}

fn parent_tool_call_for_session(state: &EventMapState, session_id: Option<&str>) -> Option<String> {
    let sid = session_id?.trim();
    if sid.is_empty() {
        return None;
    }
    if state
        .persistence
        .as_ref()
        .is_some_and(|handle| handle.as_str() == sid)
    {
        return None;
    }
    state
        .grok_tasks
        .get(sid)
        .filter(|tool| tool.kind == AgentToolKind::Subagent)
        .map(|tool| tool.tool_call_id.clone())
}

pub(crate) fn map_xai_subagent(
    state: &mut EventMapState,
    turn_id: Option<String>,
    method: &str,
    params: serde_json::Value,
) -> Option<AgentEventEnvelope> {
    let mut events = map_xai_ext_events(
        &mut state.grok_tasks,
        &mut state.grok_goal,
        &mut state.grok_workflow,
        method,
        &params,
    );
    if events.is_empty() {
        return None;
    }
    let first = events.remove(0);
    for extra in events {
        state.pending.push_back(wrap(turn_id.clone(), extra));
    }
    Some(complete_before_thinking(
        state,
        turn_id.clone(),
        wrap(turn_id, first),
    ))
}

fn fold_thinking(
    state: &mut EventMapState,
    turn_id: Option<String>,
    text: String,
    done: bool,
) -> AgentEventEnvelope {
    let message_id = state
        .thinking_message_id
        .get_or_insert_with(|| uuid::Uuid::new_v4().to_string())
        .clone();
    let part_id = state.parts.synthesized_id(&message_id, TextKind::Thinking);
    if done {
        state.thinking_message_id = None;
        if !text.is_empty() {
            let chunk = state
                .parts
                .chunk(&part_id, &message_id, None, TextKind::Thinking, text);
            let closed = state.parts.close(part_id, None);
            state.pending.push_back(wrap(turn_id.clone(), closed));
            return wrap(turn_id, chunk);
        }
        return wrap(turn_id, state.parts.close(part_id, None));
    }
    let chunk = state
        .parts
        .chunk(&part_id, &message_id, None, TextKind::Thinking, text);
    wrap(turn_id, chunk)
}

fn map_thinking_stream(
    state: &mut EventMapState,
    turn_id: Option<String>,
    delta: StreamDelta,
) -> AgentEventEnvelope {
    let parent = parent_tool_call_for_session(state, delta.session_id.as_deref());
    fold_thinking_parented(state, turn_id, delta.delta, delta.done, parent)
}

fn fold_thinking_parented(
    state: &mut EventMapState,
    turn_id: Option<String>,
    text: String,
    done: bool,
    parent_tool_call_id: Option<String>,
) -> AgentEventEnvelope {
    if let Some(parent) = parent_tool_call_id {
        let message_id = format!("subagent-think:{parent}");
        if done && text.is_empty() {
            let part_id = state.parts.synthesized_id(&message_id, TextKind::Thinking);
            return wrap(turn_id, state.parts.close(part_id, None));
        }
        let chunk = state
            .parts
            .nested_chunk(&message_id, parent, TextKind::Thinking, text);
        return wrap(turn_id, chunk);
    }
    fold_thinking(state, turn_id, text, done)
}

fn map_assistant_stream(
    state: &mut EventMapState,
    turn_id: Option<String>,
    delta: StreamDelta,
) -> AgentEventEnvelope {
    if let Some(parent) = parent_tool_call_for_session(state, delta.session_id.as_deref()) {
        let message_id = format!("subagent-text:{parent}");
        let chunk = state
            .parts
            .nested_chunk(&message_id, parent, TextKind::Answer, delta.delta);
        return wrap(turn_id, chunk);
    }
    let message_id = state
        .assistant_message_id
        .get_or_insert_with(|| uuid::Uuid::new_v4().to_string())
        .clone();
    let part_id = state.parts.synthesized_id(&message_id, TextKind::Answer);
    if delta.done {
        state.assistant_message_id = None;
        if !delta.delta.is_empty() {
            let chunk =
                state
                    .parts
                    .chunk(&part_id, &message_id, None, TextKind::Answer, delta.delta);
            let closed = state.parts.close(part_id, None);
            state.pending.push_back(wrap(turn_id.clone(), closed));
            return wrap(turn_id, chunk);
        }
        return wrap(turn_id, state.parts.close(part_id, None));
    }
    let chunk = state
        .parts
        .chunk(&part_id, &message_id, None, TextKind::Answer, delta.delta);
    wrap(turn_id, chunk)
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

/// A new top-level tool closes the answer that was already streaming, so the
/// reply after the tool is a new part. Otherwise one answer part stays above
/// the tool (search results land under the text, and the text gets folded).
/// Updates of a tool already seen leave that later answer open.
fn seal_around_new_tool(
    state: &mut EventMapState,
    turn_id: Option<String>,
    tool: AgentEvent,
    close_answer: bool,
) -> AgentEventEnvelope {
    let next = wrap(turn_id.clone(), tool);
    let next = if close_answer {
        complete_before_assistant(state, turn_id.clone(), next)
    } else {
        next
    };
    complete_before_thinking(state, turn_id, next)
}

pub(crate) fn should_drop_replay(replaying: bool, event: &AcpSessionEvent) -> bool {
    replaying
        && !matches!(
            event,
            AcpSessionEvent::LoadCompleted
                | AcpSessionEvent::SessionReady { .. }
                | AcpSessionEvent::SessionClosed { .. }
                | AcpSessionEvent::SessionEnded
                | AcpSessionEvent::AvailableCommandsUpdate(_)
        )
}

fn wrap(turn_id: Option<String>, payload: AgentEvent) -> AgentEventEnvelope {
    AgentEventEnvelope::new(turn_id, payload)
}

fn merge_stored_tool(state: &mut EventMapState, update: ToolCallUpdate) -> ToolCallUpdate {
    let merged = match state.tools.get(&update.tool_call_id) {
        Some(prev) => merge_tool_call_patch(prev, update),
        None => update,
    };
    state
        .tools
        .insert(merged.tool_call_id.clone(), merged.clone());
    merged
}

fn tool_status_kind(status: crate::contract::AgentToolStatus) -> ToolEventKind {
    match status {
        crate::contract::AgentToolStatus::Completed => ToolEventKind::Completed,
        crate::contract::AgentToolStatus::Failed => ToolEventKind::Failed,
        _ => ToolEventKind::Started,
    }
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

fn merge_config_options(state: &mut EventMapState, options: &[AgentConfigOption]) {
    let probed = probe_result_from_config_options(options, PathBuf::from("."), false);
    if !probed.models.is_empty() {
        state.supported_options.models = probed.models;
    }
    if options.iter().any(|option| is_mode_config_id(&option.id)) && !probed.modes.is_empty() {
        state.supported_options.modes = probed.modes;
    }
    if !probed.thinking.is_none() {
        state.supported_options.thinking = probed.thinking;
    }
    if options
        .iter()
        .any(|option| is_permission_mode_config_id(&option.id))
    {
        state.supported_options.permission_modes =
            crate::policy::advertised_permission_modes("grok");
        if state.supported_options.modes.is_empty() {
            state.supported_options.modes = crate::policy::default_collaboration_modes();
        }
    }
    for option in options {
        let Some(current) = option
            .current_value
            .as_ref()
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let id = option.id.to_ascii_lowercase();
        if id == "model" || id == "models" {
            state.current_config.model = Some(current.clone());
        } else if is_thinking_config_id(&id) {
            state.current_config.thinking = Some(current.clone());
        } else if is_permission_mode_config_id(&option.id) {
            if crate::policy::is_plan_mode(Some(current)) {
                state.current_config.mode = Some("plan".into());
            } else if let Some(normalized) = crate::policy::normalize_stored_permission(current) {
                state.current_config.permission_mode = Some(normalized);
            }
        } else if is_mode_config_id(&option.id) {
            state.current_config.mode = Some(current.clone());
        }
    }
}

fn is_thinking_config_id(id: &str) -> bool {
    id == "thinking"
        || id == "think"
        || id == "thought_level"
        || id == "effort"
        || id.contains("reason")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acp_client::types::{
        AgentCapabilityState, AgentConfigOptionValue, StreamDelta, ToolCallStatus, ToolCallUpdate,
    };
    use crate::contract::AgentAvailableCommand;
    use crate::contract::AgentToolKind;
    use crate::contract::AgentToolStatus;
    use crate::contract::{AgentToolParams, AgentToolResult};
    use crate::providers::text_parts::{reassemble, reassembled_text};

    fn state() -> EventMapState {
        EventMapState::new("grok".into(), AgentCurrentConfig::default(), false)
    }

    fn payloads(state: &mut EventMapState, event: AcpSessionEvent) -> Vec<AgentEvent> {
        let mut out = Vec::new();
        if let Some(first) = map_event(state, Some("turn-1".into()), event) {
            out.push(first.payload);
        }
        while let Some(next) = state.pending.pop_front() {
            out.push(next.payload);
        }
        out
    }

    fn stream_delta(kind: &str, delta: &str) -> AcpSessionEvent {
        AcpSessionEvent::Stream(StreamDelta {
            role: "assistant".into(),
            kind: kind.into(),
            delta: delta.into(),
            done: false,
            usage: None,
            session_id: None,
        })
    }

    #[test]
    fn s6_grok_reassembles_chunks_at_offsets() {
        let mut state = state();
        state.thinking_message_id = Some("think-msg".into());
        state.assistant_message_id = Some("ans-msg".into());
        let vendor_thinking = ["Think ", "café."];
        let vendor_answer = ["Hello ", "world."];
        let mut events = Vec::new();
        for text in vendor_thinking {
            events.extend(payloads(&mut state, stream_delta("thinking", text)));
        }
        for text in vendor_answer {
            events.extend(payloads(&mut state, stream_delta("message", text)));
        }

        for event in &events {
            if let AgentEvent::TextChunk {
                part_id,
                message_id,
                ordinal,
                ..
            } = event
            {
                assert_eq!(part_id, &format!("{message_id}:{ordinal}"));
            }
        }

        // Panics on a gap or an overlap in any part's offset sequence.
        let parts = reassemble(&events);
        assert_eq!(
            parts,
            vec![
                (
                    "think-msg:0".to_string(),
                    TextKind::Thinking,
                    vendor_thinking.concat()
                ),
                (
                    "ans-msg:0".to_string(),
                    TextKind::Answer,
                    vendor_answer.concat()
                ),
            ]
        );
        assert_eq!(
            reassembled_text(&events, TextKind::Thinking),
            vendor_thinking.concat()
        );
        assert_eq!(
            reassembled_text(&events, TextKind::Answer),
            vendor_answer.concat()
        );
    }

    #[test]
    fn new_web_search_closes_the_open_answer_so_later_text_is_a_new_part() {
        let mut state = state();
        let before = payloads(&mut state, stream_delta("message", "我先核对一下。"));
        let tool = payloads(
            &mut state,
            AcpSessionEvent::ToolCall(ToolCallUpdate {
                tool_call_id: "search-1".into(),
                parent_tool_call_id: None,
                session_id: None,
                tool: "web_search".into(),
                description: "Web search:".into(),
                acp_kind: Some("search".into()),
                status: ToolCallStatus::Running,
                raw_input: Some(serde_json::json!({ "query": "grok vs claude" })),
                content: Vec::new(),
                locations: Vec::new(),
                raw_output: None,
                detail: None,
            }),
        );
        let after = payloads(&mut state, stream_delta("message", "结论在搜索之后。"));
        let again = payloads(
            &mut state,
            AcpSessionEvent::ToolCall(ToolCallUpdate {
                tool_call_id: "search-1".into(),
                parent_tool_call_id: None,
                session_id: None,
                tool: "web_search".into(),
                description: "Web search:".into(),
                acp_kind: Some("search".into()),
                status: ToolCallStatus::Completed,
                raw_input: Some(serde_json::json!({ "query": "grok vs claude" })),
                content: Vec::new(),
                locations: Vec::new(),
                raw_output: Some(serde_json::json!({
                    "links": [{ "url": "https://example.com", "title": "Example" }]
                })),
                detail: None,
            }),
        );
        let tail = payloads(&mut state, stream_delta("message", "还是同一段。"));

        let answer_id = |events: &[AgentEvent]| -> Option<String> {
            events.iter().find_map(|event| match event {
                AgentEvent::TextChunk {
                    part_id,
                    kind: TextKind::Answer,
                    ..
                } => Some(part_id.clone()),
                _ => None,
            })
        };
        let before_id = answer_id(&before).expect("preamble");
        let after_id = answer_id(&after).expect("answer after search");
        assert_ne!(before_id, after_id);
        assert!(tool.iter().any(|event| matches!(
            event,
            AgentEvent::ToolCallStarted { tool_call } if tool_call.kind == AgentToolKind::WebSearch
        )));
        assert!(
            before.iter().any(|event| matches!(
                event,
                AgentEvent::PartClosed { part_id, .. } if part_id == &before_id
            )) || tool.iter().any(|event| matches!(
                event,
                AgentEvent::PartClosed { part_id, .. } if part_id == &before_id
            ))
        );
        assert_eq!(answer_id(&tail).as_deref(), Some(after_id.as_str()));
        assert!(again.iter().all(|event| !matches!(
            event,
            AgentEvent::PartClosed { part_id, .. } if part_id == &after_id
        )));
    }

    #[test]
    fn envelope_has_turn_id_and_no_sequence() {
        let mut state = state();
        let envelope = map_event(
            &mut state,
            Some("turn-1".into()),
            AcpSessionEvent::SessionReady {
                acp_session_id: "acp-1".into(),
            },
        )
        .expect("session started");
        assert_eq!(envelope.turn_id.as_deref(), Some("turn-1"));
        assert!(!envelope.event_id.is_empty());
        let json = serde_json::to_value(&envelope).expect("serialize");
        assert!(json.get("sequence").is_none());
    }

    #[test]
    fn tool_call_closes_open_thinking_stream() {
        let mut state = state();
        state.thinking_message_id = Some("think-1".into());
        let part_id = state.parts.synthesized_id("think-1", TextKind::Thinking);
        let events = payloads(&mut state, AcpSessionEvent::SessionClosed { reason: None });
        assert!(matches!(
            events.first(),
            Some(AgentEvent::PartClosed { part_id: closed, .. }) if *closed == part_id
        ));
        assert!(matches!(events.get(1), Some(AgentEvent::SessionClosed)));
        assert!(state.thinking_message_id.is_none());
        assert!(state.parts.open_of(TextKind::Thinking).is_empty());
    }

    #[test]
    fn session_ready_is_not_dropped_during_replay() {
        assert!(!should_drop_replay(
            true,
            &AcpSessionEvent::SessionReady {
                acp_session_id: "s".into(),
            }
        ));
        assert!(should_drop_replay(
            true,
            &AcpSessionEvent::Stream(StreamDelta {
                role: "assistant".into(),
                kind: "message".into(),
                delta: "x".into(),
                done: false,
                usage: None,
                session_id: None,
            })
        ));
        assert!(!should_drop_replay(false, &AcpSessionEvent::LoadCompleted));
        assert!(!should_drop_replay(
            true,
            &AcpSessionEvent::AvailableCommandsUpdate(vec![AgentAvailableCommand {
                name: "plan".into(),
                description: "Create a plan".into(),
                hint: None,
            }])
        ));
    }

    #[test]
    fn load_completed_clears_replay_and_emits_nothing() {
        let mut state = EventMapState::new("grok".into(), AgentCurrentConfig::default(), true);
        assert!(map_event(&mut state, None, AcpSessionEvent::LoadCompleted).is_none());
        assert!(!state.replaying);
    }

    #[test]
    fn unknown_session_update_does_not_panic() {
        let mut state = state();
        let events = payloads(&mut state, AcpSessionEvent::LoadCompleted);
        assert!(events.is_empty());
        let events = payloads(
            &mut state,
            AcpSessionEvent::Stream(StreamDelta {
                role: "user".into(),
                kind: "message".into(),
                delta: "replay".into(),
                done: false,
                usage: None,
                session_id: None,
            }),
        );
        assert!(events.is_empty());
    }

    #[test]
    fn permission_requested_stays() {
        let mut state = state();
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("testdata/request_permission.json"))
                .expect("fixture");
        let options = fixture["params"]["options"]
            .as_array()
            .expect("options")
            .iter()
            .map(|option| crate::acp_client::types::PermissionOption {
                option_id: option["optionId"].as_str().unwrap().into(),
                name: option["name"].as_str().unwrap().into(),
                kind: option["kind"].as_str().unwrap().into(),
            })
            .collect();
        let events = payloads(
            &mut state,
            AcpSessionEvent::PermissionRequest(crate::acp_client::types::PermissionRequest {
                request_id: "perm_1".into(),
                tool: "edit".into(),
                description: fixture["params"]["toolCall"]["title"]
                    .as_str()
                    .unwrap()
                    .into(),
                content_markdown: None,
                risk_level: crate::acp_client::types::RiskLevel::High,
                options,
                questions: Vec::new(),
                plan_todos: Vec::new(),
            }),
        );
        let Some(AgentEvent::PermissionRequested { request }) = events.first() else {
            panic!("expected PermissionRequested");
        };
        assert_eq!(request.request_id, "perm_1");
        assert_eq!(request.tool, "edit");
        let ids: Vec<_> = request
            .options
            .iter()
            .map(|option| option.option_id.as_str())
            .collect();
        assert_eq!(ids, ["allow-edits-session", "allow-once", "reject-once"]);
        assert_eq!(
            request
                .options
                .iter()
                .map(|option| option.kind.as_str())
                .collect::<Vec<_>>(),
            ["allow_always", "allow_once", "reject_once"]
        );
        assert!(!ids.contains(&"allow_once"));
        assert!(!ids.contains(&"allow_always"));
        assert!(!ids.contains(&"reject_always"));
        assert!(!ids.contains(&"accept"));
        assert!(!ids.contains(&"cancel"));
    }

    #[test]
    fn ask_user_question_permission_keeps_questions() {
        let mut state = state();
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("testdata/ask_user_question.json")).expect("fixture");
        let questions = crate::map::ask_questions_from_input(&fixture["params"]);
        assert!(!questions.is_empty());
        let events = payloads(
            &mut state,
            AcpSessionEvent::PermissionRequest(crate::acp_client::types::PermissionRequest {
                request_id: "ask_1".into(),
                tool: "ask_user_question".into(),
                description: questions[0].prompt.clone(),
                content_markdown: None,
                risk_level: crate::acp_client::types::RiskLevel::Low,
                options: Vec::new(),
                questions: questions.clone(),
                plan_todos: Vec::new(),
            }),
        );
        let Some(AgentEvent::PermissionRequested { request }) = events.first() else {
            panic!("expected PermissionRequested");
        };
        assert_eq!(request.tool, "ask_user_question");
        assert_eq!(request.questions.len(), questions.len());
        assert_eq!(request.questions[0].prompt, questions[0].prompt);
        assert_eq!(request.questions[0].options, questions[0].options);
    }

    #[test]
    fn usage_without_window_stays_none_until_catalog() {
        use crate::acp_client::types::AgentUsage;
        let mut state = state();
        state.current_config.model = Some("grok-4.6".into());
        let events = payloads(
            &mut state,
            AcpSessionEvent::Usage(AgentUsage {
                used: Some(39_810),
                size: None,
                cost: None,
            }),
        );
        let Some(AgentEvent::ContextUsageUpdated { usage }) = events.first() else {
            panic!("expected ContextUsageUpdated, got {events:?}");
        };
        assert_eq!(usage.used, 39_810);
        assert_eq!(usage.context_window, None);
    }

    #[test]
    fn usage_prefers_catalog_total_context_tokens() {
        use crate::acp_client::types::AgentUsage;
        let mut state = state();
        state.current_config.model = Some("grok-4.6".into());
        state.load_model_context_windows(&serde_json::json!({
            "availableModels": [{
                "modelId": "grok-4.6",
                "_meta": { "totalContextTokens": 250_000 }
            }]
        }));
        let events = payloads(
            &mut state,
            AcpSessionEvent::Usage(AgentUsage {
                used: Some(1_000),
                size: None,
                cost: None,
            }),
        );
        let Some(AgentEvent::ContextUsageUpdated { usage }) = events.first() else {
            panic!("expected ContextUsageUpdated, got {events:?}");
        };
        assert_eq!(usage.context_window, Some(250_000));
    }

    #[test]
    fn exit_plan_mode_fixture_maps_plan_markdown() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("testdata/exit_plan_mode.json")).expect("fixture");
        let params = &fixture["params"];
        let plan = crate::map::plan_markdown_from_input(params).expect("planContent");
        assert!(plan.contains("Optimize project"));
        let approved = crate::map::exit_plan_ext_response("allow_once");
        let fixture_result: serde_json::Value =
            serde_json::from_str(include_str!("testdata/exit_plan_mode_response.json"))
                .expect("response");
        assert_eq!(approved, fixture_result);
        assert_eq!(
            crate::map::exit_plan_ext_response("reject_once")["outcome"],
            "cancelled"
        );
    }

    #[test]
    fn live_write_frames_stay_edit_with_path() {
        let mut state = state();
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("testdata/tool_call_write_live.json"))
                .expect("live write");
        let started = payloads(
            &mut state,
            AcpSessionEvent::ToolCall(ToolCallUpdate {
                tool_call_id: fixture["started"]["toolCallId"].as_str().unwrap().into(),
                parent_tool_call_id: None,
                session_id: None,
                tool: "Tool".into(),
                description: fixture["started"]["title"].as_str().unwrap_or("").into(),
                acp_kind: fixture["started"]["kind"].as_str().map(str::to_string),
                status: ToolCallStatus::Running,
                raw_input: Some(fixture["started"]["rawInput"].clone()),
                content: Vec::new(),
                locations: Vec::new(),
                raw_output: None,
                detail: None,
            }),
        );
        let AgentEvent::ToolCallStarted { tool_call } = started.first().unwrap() else {
            panic!("expected started, got {started:?}");
        };
        assert_eq!(tool_call.kind, AgentToolKind::Edit);
        assert!(matches!(
            &tool_call.params,
            AgentToolParams::Edit { path } if path == "/tmp/atmos-grok-perm.txt"
        ));

        let _ = payloads(
            &mut state,
            AcpSessionEvent::ToolCall(ToolCallUpdate {
                tool_call_id: fixture["updated"]["toolCallId"].as_str().unwrap().into(),
                parent_tool_call_id: None,
                session_id: None,
                tool: "Edit".into(),
                description: fixture["updated"]["title"].as_str().unwrap_or("").into(),
                acp_kind: fixture["updated"]["kind"].as_str().map(str::to_string),
                status: ToolCallStatus::Running,
                raw_input: Some(fixture["updated"]["rawInput"].clone()),
                content: Vec::new(),
                locations: Vec::new(),
                raw_output: None,
                detail: None,
            }),
        );

        let completed = payloads(
            &mut state,
            AcpSessionEvent::ToolCall(ToolCallUpdate {
                tool_call_id: fixture["completed"]["toolCallId"].as_str().unwrap().into(),
                parent_tool_call_id: None,
                session_id: None,
                tool: "Tool".into(),
                description: String::new(),
                acp_kind: fixture["completed"]["kind"].as_str().map(str::to_string),
                status: ToolCallStatus::Completed,
                raw_input: Some(fixture["completed"]["rawInput"].clone()),
                content: Vec::new(),
                locations: Vec::new(),
                raw_output: Some(fixture["completed"]["rawOutput"].clone()),
                detail: None,
            }),
        );
        let AgentEvent::ToolCallCompleted { tool_call } = completed.first().unwrap() else {
            panic!("expected completed, got {completed:?}");
        };
        assert_eq!(tool_call.kind, AgentToolKind::Edit);
        assert!(matches!(
            &tool_call.params,
            AgentToolParams::Edit { path } if path == "/tmp/atmos-grok-perm.txt"
        ));
    }

    #[test]
    fn config_changed_emits_atmos_current_config() {
        let mut state = state();
        let events = payloads(
            &mut state,
            AcpSessionEvent::ConfigOptionsUpdate(vec![AgentConfigOption {
                id: "models".into(),
                name: Some("Model".into()),
                description: None,
                category: None,
                r#type: "select".into(),
                current_value: Some("opus".into()),
                options: vec![AgentConfigOptionValue {
                    value: "opus".into(),
                    name: Some("Opus".into()),
                    description: None,
                }],
            }]),
        );
        let Some(AgentEvent::ConfigChanged { config }) = events.first() else {
            panic!("expected config changed");
        };
        assert_eq!(config["model"], "opus");
        assert!(config.get("config_options").is_none());
        assert_eq!(state.current_config.model.as_deref(), Some("opus"));
        assert_eq!(state.supported_options.models.len(), 1);
    }

    #[test]
    fn permission_mode_config_option_updates_current_config() {
        let mut state = state();
        payloads(
            &mut state,
            AcpSessionEvent::ConfigOptionsUpdate(vec![AgentConfigOption {
                id: "permissionMode".into(),
                name: Some("Permission".into()),
                description: None,
                category: None,
                r#type: "select".into(),
                current_value: Some("auto".into()),
                options: vec![AgentConfigOptionValue {
                    value: "auto".into(),
                    name: Some("Auto".into()),
                    description: None,
                }],
            }]),
        );
        assert_eq!(
            state.current_config.permission_mode.as_deref(),
            Some("auto")
        );
        assert_eq!(state.supported_options.permission_modes.len(), 3);
        assert!(state
            .supported_options
            .permission_modes
            .iter()
            .any(|mode| mode.id == "auto"));
        assert_eq!(
            state
                .supported_options
                .modes
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>(),
            ["default", "plan"]
        );
    }

    #[test]
    fn capabilities_update_is_not_a_chat_event() {
        let mut state = state();
        let events = payloads(
            &mut state,
            AcpSessionEvent::CapabilitiesUpdate(
                crate::acp_client::types::AgentCapabilitiesSnapshot {
                    session_list: AgentCapabilityState::unsupported(None),
                    session_resume: AgentCapabilityState::supported(),
                    session_close: AgentCapabilityState::supported(),
                    logout: AgentCapabilityState::unsupported(None),
                    config_options: AgentCapabilityState::supported(),
                    session_info_update: AgentCapabilityState::unsupported(None),
                    load_session: AgentCapabilityState::supported(),
                },
            ),
        );
        assert!(events.is_empty());
        assert_eq!(state.capabilities.resume, Capability::Supported);
        assert_eq!(state.capabilities.steer, Capability::Supported);
        assert_eq!(state.capabilities.fork, Capability::Supported);
        assert_eq!(state.capabilities.rewind, Capability::Supported);
    }

    #[test]
    fn s8_tool_call_maps_to_agent_tool_envelope() {
        let mut state = state();
        let envelope = map_event(
            &mut state,
            Some("turn-1".into()),
            AcpSessionEvent::ToolCall(ToolCallUpdate {
                tool_call_id: "tc_1".into(),
                parent_tool_call_id: None,
                session_id: None,
                tool: "Bash".into(),
                description: String::new(),
                acp_kind: None,
                status: ToolCallStatus::Completed,
                raw_input: Some(serde_json::json!({"command": "ls -la"})),
                content: Vec::new(),
                locations: Vec::new(),
                raw_output: Some(serde_json::json!({"output": "ok", "exit_code": 0})),
                detail: None,
            }),
        )
        .expect("tool envelope");
        let json = serde_json::to_value(&envelope).expect("serialize");
        assert_eq!(json["payload"]["type"], "tool_call_completed");
        assert!(json.get("source").is_none());
        assert!(json["payload"].get("source").is_none());
        assert!(json["payload"]["tool_call"].get("native").is_none());
        assert!(json["payload"]["tool_call"].get("input").is_none());
        let AgentEvent::ToolCallCompleted { tool_call } = envelope.payload else {
            panic!("expected tool completed");
        };
        assert_eq!(tool_call.kind, AgentToolKind::Execute);
        assert!(matches!(
            tool_call.params,
            AgentToolParams::Execute { ref command, .. } if command == "ls -la"
        ));
        assert!(matches!(
            tool_call.result,
            Some(AgentToolResult::Execute { .. })
        ));
    }

    #[test]
    fn grok_taskoutput_replaces_background_execute() {
        let mut state = state();
        let started = map_event(
            &mut state,
            Some("turn-1".into()),
            AcpSessionEvent::ToolCall(ToolCallUpdate {
                tool_call_id: "tc_1".into(),
                parent_tool_call_id: None,
                session_id: None,
                tool: "Tool".into(),
                description: String::new(),
                acp_kind: None,
                status: ToolCallStatus::Running,
                raw_input: Some(serde_json::json!({
                    "type": "Bash",
                    "command": "count",
                    "is_background": true
                })),
                content: Vec::new(),
                locations: Vec::new(),
                raw_output: Some(serde_json::json!({
                    "type": "backgroundtaskstarted",
                    "Result": { "task_id": "t1", "status": "running" }
                })),
                detail: None,
            }),
        )
        .expect("started");
        assert!(matches!(
            started.payload,
            AgentEvent::ToolCallStarted { .. }
        ));

        let replaced = map_event(
            &mut state,
            Some("turn-1".into()),
            AcpSessionEvent::ToolCall(ToolCallUpdate {
                tool_call_id: "tc_poll".into(),
                parent_tool_call_id: None,
                session_id: None,
                tool: "taskoutput".into(),
                description: String::new(),
                acp_kind: None,
                status: ToolCallStatus::Completed,
                raw_input: Some(serde_json::json!({"type": "taskoutput"})),
                content: Vec::new(),
                locations: Vec::new(),
                raw_output: Some(serde_json::json!({
                    "type": "taskoutput",
                    "Result": {
                        "task_id": "t1",
                        "output": "hello",
                        "status": "completed"
                    }
                })),
                detail: None,
            }),
        )
        .expect("replace");
        let AgentEvent::ToolCallCompleted { tool_call } = replaced.payload else {
            panic!("expected completed replace, got {:?}", replaced.payload);
        };
        assert_eq!(tool_call.tool_call_id, "tc_1");
        match tool_call.result {
            Some(AgentToolResult::Execute { output, .. }) => assert_eq!(output, "hello"),
            other => panic!("expected execute result, got {other:?}"),
        }
    }

    #[test]
    fn subagent_dispatch_stays_started_until_taskoutput_is_terminal() {
        let mut state = state();
        let dispatch = map_event(
            &mut state,
            Some("turn-1".into()),
            AcpSessionEvent::ToolCall(ToolCallUpdate {
                tool_call_id: "tc_sub".into(),
                parent_tool_call_id: None,
                session_id: None,
                tool: "Tool".into(),
                description: "spawn_subagent".into(),
                acp_kind: None,
                status: ToolCallStatus::Completed,
                raw_input: Some(serde_json::json!({
                    "description": "Inspect test coverage",
                    "subagent_type": "explore"
                })),
                content: Vec::new(),
                locations: Vec::new(),
                raw_output: Some(serde_json::json!({
                    "task_id": "child-1",
                    "status": "running"
                })),
                detail: None,
            }),
        )
        .expect("subagent dispatch");
        let AgentEvent::ToolCallStarted { tool_call } = dispatch.payload else {
            panic!("expected started dispatch, got {:?}", dispatch.payload);
        };
        assert_eq!(tool_call.status, AgentToolStatus::Running);
    }

    #[test]
    fn grok_session_notification_and_child_session_text_stay_on_the_spawn() {
        let mut state = state();
        state.persistence = Some(crate::contract::AgentPersistenceHandle::new("sess_parent"));
        let notice = include_str!("testdata/subagent_started_background.txt");
        let dispatch = map_event(
            &mut state,
            Some("turn-1".into()),
            AcpSessionEvent::ToolCall(ToolCallUpdate {
                tool_call_id: "tc_sub".into(),
                parent_tool_call_id: None,
                session_id: Some("sess_parent".into()),
                tool: "Tool".into(),
                description: "spawn_subagent".into(),
                acp_kind: None,
                status: ToolCallStatus::Completed,
                raw_input: Some(serde_json::json!({
                    "description": "Read hello2.txt",
                    "prompt": "Read hello2.txt and return its contents.",
                    "subagent_type": "explore"
                })),
                content: vec![crate::acp_client::types::AgentToolCallContentItem::Text {
                    text: notice.to_string(),
                }],
                locations: Vec::new(),
                raw_output: Some(serde_json::json!(notice)),
                detail: None,
            }),
        )
        .expect("spawn");
        let AgentEvent::ToolCallStarted { tool_call } = dispatch.payload else {
            panic!("expected started spawn, got {:?}", dispatch.payload);
        };
        assert_eq!(tool_call.status, AgentToolStatus::Running);
        assert!(tool_call.result.is_none());

        let spawned: serde_json::Value =
            serde_json::from_str(include_str!("testdata/subagent_spawned.json")).unwrap();
        let progress: serde_json::Value =
            serde_json::from_str(include_str!("testdata/subagent_progress.json")).unwrap();
        let finished: serde_json::Value =
            serde_json::from_str(include_str!("testdata/subagent_finished.json")).unwrap();
        map_xai_subagent(
            &mut state,
            Some("turn-1".into()),
            "_x.ai/session_notification",
            spawned,
        )
        .expect("spawned notice");

        let turn_end = map_event(
            &mut state,
            Some("turn-1".into()),
            AcpSessionEvent::TurnEnd(AcpTurnStop::Completed),
        );
        assert!(matches!(
            turn_end.as_ref().map(|event| &event.payload),
            Some(AgentEvent::TurnCompleted { .. })
        ));
        assert!(state.grok_tasks.contains_key("sa-1"));
        assert!(state.grok_tasks.contains_key("tc_sub"));

        map_xai_subagent(
            &mut state,
            Some("turn-1".into()),
            "_x.ai/session_notification",
            progress,
        )
        .expect("progress notice after TurnEnd");

        let child_text = map_event(
            &mut state,
            Some("turn-1".into()),
            AcpSessionEvent::Stream(StreamDelta {
                role: "assistant".into(),
                kind: "message".into(),
                delta: "hello from child".into(),
                done: false,
                usage: None,
                session_id: Some("sa-1".into()),
            }),
        )
        .expect("child text");
        let AgentEvent::TextChunk {
            text,
            parent_part_id,
            kind: TextKind::Answer,
            ..
        } = child_text.payload
        else {
            panic!("expected parented child text, got {:?}", child_text.payload);
        };
        assert_eq!(text, "hello from child");
        assert_eq!(parent_part_id.as_deref(), Some("tc_sub"));

        let child_tool = map_event(
            &mut state,
            Some("turn-1".into()),
            AcpSessionEvent::ToolCall(ToolCallUpdate {
                tool_call_id: "child_read".into(),
                parent_tool_call_id: None,
                session_id: Some("sa-1".into()),
                tool: "Read".into(),
                description: "hello2.txt".into(),
                acp_kind: Some("read".into()),
                status: ToolCallStatus::Completed,
                raw_input: Some(serde_json::json!({ "path": "hello2.txt" })),
                content: Vec::new(),
                locations: Vec::new(),
                raw_output: None,
                detail: None,
            }),
        )
        .expect("child tool after TurnEnd");
        let child_call = match child_tool.payload {
            AgentEvent::ToolCallCompleted { tool_call }
            | AgentEvent::ToolCallStarted { tool_call }
            | AgentEvent::ToolCallUpdated { tool_call } => tool_call,
            other => panic!("expected child tool event, got {other:?}"),
        };
        assert_eq!(child_call.parent_tool_call_id.as_deref(), Some("tc_sub"));

        let done = map_xai_subagent(
            &mut state,
            Some("turn-1".into()),
            "x.ai/session_notification",
            finished,
        )
        .expect("finished notice");
        let AgentEvent::ToolCallCompleted { tool_call } = done.payload else {
            panic!("expected completed spawn, got {:?}", done.payload);
        };
        assert_eq!(tool_call.tool_call_id, "tc_sub");
        assert_eq!(tool_call.status, AgentToolStatus::Completed);
        match tool_call.result {
            Some(AgentToolResult::Text { text }) => assert_eq!(text, "hello from child"),
            other => panic!("expected child output on the spawn, got {other:?}"),
        }
    }

    #[test]
    fn live_goal_session_maps_orphans_and_does_not_mix_skeptics() {
        let mut state = state();
        state.persistence = Some(crate::contract::AgentPersistenceHandle::new(
            "01a0aa67-90b6-7f52-826d-a9947de25aef",
        ));
        let planning: serde_json::Value =
            serde_json::from_str(include_str!("testdata/goal_updated_planning.json")).unwrap();
        let goal = map_xai_subagent(
            &mut state,
            Some("turn-1".into()),
            "_x.ai/session/update",
            planning,
        )
        .expect("goal_updated");
        assert!(matches!(
            goal.payload,
            AgentEvent::GrokGoalUpdated { goal: Some(_) }
        ));

        let plan_spawn: serde_json::Value =
            serde_json::from_str(include_str!("testdata/subagent_spawned_plan_writer.json"))
                .unwrap();
        let plan = map_xai_subagent(
            &mut state,
            Some("turn-1".into()),
            "_x.ai/session/update",
            plan_spawn,
        )
        .expect("plan writer");
        let AgentEvent::ToolCallStarted { tool_call } = plan.payload else {
            panic!("expected synthesized plan writer, got {:?}", plan.payload);
        };
        assert_eq!(
            tool_call.tool_call_id,
            "01a0aa67-9404-7771-b043-b2101c138e4f"
        );
        assert_eq!(tool_call.name, crate::contract::GROK_CHROME_SUBAGENT_NAME);

        let a: serde_json::Value =
            serde_json::from_str(include_str!("testdata/subagent_spawned_skeptic_a.json")).unwrap();
        let b: serde_json::Value =
            serde_json::from_str(include_str!("testdata/subagent_spawned_skeptic_b.json")).unwrap();
        let started_a =
            map_xai_subagent(&mut state, Some("turn-1".into()), "_x.ai/session/update", a)
                .expect("skeptic a");
        let started_b =
            map_xai_subagent(&mut state, Some("turn-1".into()), "_x.ai/session/update", b)
                .expect("skeptic b");
        let id_a = match started_a.payload {
            AgentEvent::ToolCallStarted { tool_call } => tool_call.tool_call_id,
            other => panic!("{other:?}"),
        };
        let id_b = match started_b.payload {
            AgentEvent::ToolCallStarted { tool_call } => tool_call.tool_call_id,
            other => panic!("{other:?}"),
        };
        assert_ne!(id_a, id_b);

        let child_a = map_event(
            &mut state,
            Some("turn-1".into()),
            AcpSessionEvent::Stream(StreamDelta {
                role: "assistant".into(),
                kind: "message".into(),
                delta: "skeptic-a-only".into(),
                done: false,
                usage: None,
                session_id: Some(id_a.clone()),
            }),
        )
        .expect("child a text");
        let AgentEvent::TextChunk {
            parent_part_id,
            text,
            kind: TextKind::Answer,
            ..
        } = child_a.payload
        else {
            panic!("expected parented chunk");
        };
        assert_eq!(text, "skeptic-a-only");
        assert_eq!(parent_part_id.as_deref(), Some(id_a.as_str()));

        let parent_read = map_event(
            &mut state,
            Some("turn-1".into()),
            AcpSessionEvent::ToolCall(ToolCallUpdate {
                tool_call_id: "parent_read".into(),
                parent_tool_call_id: None,
                session_id: Some("01a0aa67-90b6-7f52-826d-a9947de25aef".into()),
                tool: "Read".into(),
                description: "crates/AGENTS.md".into(),
                acp_kind: Some("read".into()),
                status: ToolCallStatus::Completed,
                raw_input: Some(serde_json::json!({ "path": "crates/AGENTS.md" })),
                content: Vec::new(),
                locations: Vec::new(),
                raw_output: None,
                detail: None,
            }),
        )
        .expect("parent read");
        let parent_call = match parent_read.payload {
            AgentEvent::ToolCallCompleted { tool_call }
            | AgentEvent::ToolCallStarted { tool_call }
            | AgentEvent::ToolCallUpdated { tool_call } => tool_call,
            other => panic!("{other:?}"),
        };
        assert!(parent_call.parent_tool_call_id.is_none());

        let finished_a: serde_json::Value =
            serde_json::from_str(include_str!("testdata/subagent_finished_skeptic_a.json"))
                .unwrap();
        let done_a = map_xai_subagent(
            &mut state,
            Some("turn-1".into()),
            "_x.ai/session/update",
            finished_a,
        )
        .expect("finish a");
        let AgentEvent::ToolCallCompleted { tool_call } = done_a.payload else {
            panic!("expected completed skeptic a");
        };
        assert_eq!(tool_call.tool_call_id, id_a);
        assert_eq!(
            state.grok_tasks.get(&id_b).map(|tool| tool.status),
            Some(AgentToolStatus::Running)
        );

        let workflow: serde_json::Value =
            serde_json::from_str(include_str!("testdata/workflow_updated_deep_research.json"))
                .unwrap();
        let wf = map_xai_subagent(
            &mut state,
            Some("turn-1".into()),
            "_x.ai/session_notification",
            workflow,
        )
        .expect("workflow");
        let AgentEvent::GrokWorkflowUpdated {
            workflow: Some(workflow),
        } = wf.payload
        else {
            panic!("expected grok_workflow_updated, got {:?}", wf.payload);
        };
        assert_eq!(
            workflow
                .phases
                .iter()
                .map(|phase| phase.title.as_str())
                .collect::<Vec<_>>(),
            ["Plan", "Research", "Verify", "Report"]
        );
        assert!(
            state.grok_goal.is_some(),
            "workflow update must not wipe the live goal"
        );
    }

    #[test]
    fn child_user_message_chunk_updates_spawn_prompt() {
        let mut state = state();
        state.persistence = Some(crate::contract::AgentPersistenceHandle::new(
            "01a0aaff-523e-78e0-8e5d-0637d1aced60",
        ));
        let spawned: serde_json::Value =
            serde_json::from_str(include_str!("testdata/subagent_spawned_plan_writer.json"))
                .unwrap();
        map_xai_subagent(
            &mut state,
            Some("turn-1".into()),
            "_x.ai/session/update",
            spawned,
        )
        .expect("spawn");
        let event = map_event(
            &mut state,
            Some("turn-1".into()),
            AcpSessionEvent::Stream(StreamDelta {
                role: "user".into(),
                kind: "message".into(),
                delta: "You are the Goal Plan Writer for the xAI Grok Build harness.".into(),
                done: false,
                usage: None,
                session_id: Some("01a0aa67-9404-7771-b043-b2101c138e4f".into()),
            }),
        )
        .expect("prompt update");
        let AgentEvent::ToolCallUpdated { tool_call } = event.payload else {
            panic!("expected ToolCallUpdated, got {:?}", event.payload);
        };
        match tool_call.params {
            AgentToolParams::Subagent {
                prompt,
                description,
                ..
            } => {
                assert!(prompt.as_deref().unwrap().contains("Goal Plan Writer"));
                assert_eq!(description, "goal plan writer");
            }
            other => panic!("expected subagent params, got {other:?}"),
        }
    }

    #[test]
    fn grok_build_goal_cleared_empty_id_drops_snapshot() {
        let mut state = state();
        let planning: serde_json::Value =
            serde_json::from_str(include_str!("testdata/goal_updated_planning.json")).unwrap();
        map_xai_subagent(
            &mut state,
            Some("turn-1".into()),
            "_x.ai/session/update",
            planning,
        )
        .expect("planning");
        assert_eq!(
            state.grok_goal.as_ref().map(|goal| goal.status.as_str()),
            Some("active")
        );

        let cleared: serde_json::Value =
            serde_json::from_str(include_str!("testdata/goal_updated_cleared.json")).unwrap();
        let event = map_xai_subagent(
            &mut state,
            Some("turn-1".into()),
            "x.ai/session_notification",
            cleared,
        )
        .expect("cleared must emit, not Skip");
        assert!(matches!(
            event.payload,
            AgentEvent::GrokGoalUpdated { goal: None }
        ));
        assert!(state.grok_goal.is_none());
    }

    #[test]
    fn workflow_cleared_drops_snapshot() {
        let mut state = state();
        let workflow: serde_json::Value =
            serde_json::from_str(include_str!("testdata/workflow_updated_deep_research.json"))
                .unwrap();
        map_xai_subagent(
            &mut state,
            Some("turn-1".into()),
            "x.ai/session_notification",
            workflow,
        )
        .expect("workflow");
        assert!(state.grok_workflow.is_some());

        let cleared: serde_json::Value =
            serde_json::from_str(include_str!("testdata/workflow_updated_cleared.json")).unwrap();
        let event = map_xai_subagent(
            &mut state,
            Some("turn-1".into()),
            "x.ai/session_notification",
            cleared,
        )
        .expect("cleared must emit, not Skip");
        assert!(matches!(
            event.payload,
            AgentEvent::GrokWorkflowUpdated { workflow: None }
        ));
        assert!(state.grok_workflow.is_none());
    }

    #[test]
    fn grok_kill_command_completes_background_execute() {
        let mut state = state();
        map_event(
            &mut state,
            Some("turn-1".into()),
            AcpSessionEvent::ToolCall(ToolCallUpdate {
                tool_call_id: "tc_1".into(),
                parent_tool_call_id: None,
                session_id: None,
                tool: "Tool".into(),
                description: "Extract droid auth-related string windows".into(),
                acp_kind: None,
                status: ToolCallStatus::Running,
                raw_input: Some(serde_json::json!({
                    "type": "Bash",
                    "command": "python3 scan",
                    "is_background": true
                })),
                content: Vec::new(),
                locations: Vec::new(),
                raw_output: Some(serde_json::json!({
                    "type": "backgroundtaskstarted",
                    "Result": {
                        "task_id": "call-bb76629c-a3fc-492b-b531-e967afa44195-30",
                        "status": "running"
                    }
                })),
                detail: None,
            }),
        )
        .expect("started");

        let replaced = map_event(
            &mut state,
            Some("turn-1".into()),
            AcpSessionEvent::ToolCall(ToolCallUpdate {
                tool_call_id: "tc_kill".into(),
                parent_tool_call_id: None,
                session_id: None,
                tool: "Tool".into(),
                description: "kill_command_or_subagent".into(),
                acp_kind: None,
                status: ToolCallStatus::Completed,
                raw_input: Some(serde_json::json!({
                    "task_id": "call-bb76629c-a3fc-492b-b531-e967afa44195-30"
                })),
                content: Vec::new(),
                locations: Vec::new(),
                raw_output: Some(serde_json::json!({"success": true})),
                detail: None,
            }),
        )
        .expect("kill replace");
        let AgentEvent::ToolCallFailed { tool_call, .. } = replaced.payload else {
            panic!("expected failed replace, got {:?}", replaced.payload);
        };
        assert_eq!(tool_call.tool_call_id, "tc_1");
        assert_eq!(tool_call.status, AgentToolStatus::Failed);
        assert_eq!(tool_call.kind, AgentToolKind::Execute);
    }

    #[test]
    fn grok_background_handoff_patch_does_not_reopen_completed_tool() {
        let mut state = state();
        let completed = map_event(
            &mut state,
            Some("turn-1".into()),
            AcpSessionEvent::ToolCall(ToolCallUpdate {
                tool_call_id: "call-0c2".into(),
                parent_tool_call_id: None,
                session_id: None,
                tool: "Tool".into(),
                description: "[bg] find node_modules (call-0c2)".into(),
                acp_kind: None,
                status: ToolCallStatus::Completed,
                raw_input: Some(serde_json::json!({
                    "type": "Bash",
                    "command": "find node_modules"
                })),
                content: Vec::new(),
                locations: Vec::new(),
                raw_output: Some(serde_json::json!({
                    "output": "Command \"find\" exceeded the default timeout and was automatically moved to background. Process is still running."
                })),
                detail: None,
            }),
        )
        .expect("completed");
        assert!(matches!(
            completed.payload,
            AgentEvent::ToolCallCompleted { .. }
        ));

        let patched = map_event(
            &mut state,
            Some("turn-1".into()),
            AcpSessionEvent::ToolCall(ToolCallUpdate {
                tool_call_id: "call-0c2".into(),
                parent_tool_call_id: None,
                session_id: None,
                tool: "Tool".into(),
                description: "[bg] find node_modules (call-0c2)".into(),
                acp_kind: None,
                status: ToolCallStatus::Running,
                raw_input: None,
                content: Vec::new(),
                locations: Vec::new(),
                raw_output: None,
                detail: None,
            }),
        )
        .expect("patch");
        let tool = match patched.payload {
            AgentEvent::ToolCallCompleted { tool_call }
            | AgentEvent::ToolCallStarted { tool_call }
            | AgentEvent::ToolCallUpdated { tool_call } => tool_call,
            other => panic!("expected tool event, got {other:?}"),
        };
        assert_eq!(tool.status, crate::contract::AgentToolStatus::Completed);
        assert!(matches!(
            tool.params,
            AgentToolParams::Execute {
                background: true,
                ..
            }
        ));
    }
}
