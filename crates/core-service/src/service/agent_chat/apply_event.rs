//! Apply inbound `AgentEvent`s onto `transcript.jsonl` and live `AgentChatEvent`s.
//! This is the chat ingest path — not Atmos Project.

use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};

use agent::providers::{chat_provider_kind, ChatProviderKind};
use agent::{
    AgentAvailableCommand, AgentEvent, AgentEventEnvelope, AgentMode, AgentModel,
    AgentRuntimeConfigUpdate, AgentRuntimeControl, AgentThinkingSupport, AgentTool, Capability,
    SessionOpOutcome, TurnStop,
};
use chrono::Utc;
use serde::Deserialize;
use tokio::sync::{broadcast, Mutex};

use crate::error::Result;

use super::store::AgentChatStore;
use super::types::{
    advertised_option_for_kind, config_kind_matches, config_values_equal, elapsed_ms,
    keep_pending_session_selection, map_advertised_select_value, merge_session_usage,
    order_assistant_parts, parse_session_usage, parse_turn_usage, pending_fast_change,
    pending_permission_mode_change, pending_session_config_change, pending_thinking_change,
    resolve_session_config_select, AgentChatEvent, AgentChatMeta, AgentChatPayload,
    AgentChatSessionOpOutcome, AgentChatSnapshot, FoldedMessage, MessagePart, PendingPermission,
    PendingSessionOp, ResolvedSessionConfig, RuntimeStatus, SessionAdvertisedOption,
    SessionAdvertisedOptionValue, SessionConfigChange, SessionHintTone, TranscriptEnvelope,
    TranscriptEvent, TurnStatus, SESSION_HINT_MODEL_SWITCH_FAILED, SESSION_HINT_MODE_SWITCH_FAILED,
};

pub(super) const ASSISTANT_SNAPSHOT_INTERVAL: Duration = Duration::from_millis(100);
pub(super) const RECENT_EVENT_CAP: usize = 2048;

pub(super) struct RuntimeState {
    pub(super) current_turn_id: Option<String>,
    pub(super) pending_permission: Option<PendingPermission>,
    pub(super) pending_session_op: Option<PendingSessionOp>,
    pub(super) assistant_text: HashMap<String, (String, String)>,
    pub(super) thinking_text: HashMap<String, (String, String)>,
    pub(super) last_snapshot: Instant,
    pub(super) last_activity: Instant,
    pub(super) turn_started_at: Option<chrono::DateTime<Utc>>,
    pub(super) thinking_started_at: Option<chrono::DateTime<Utc>>,
    pub(super) thinking_ms: u64,
    pub(super) last_thinking_segment_ms: u64,
    pub(super) turn_usage: Option<super::types::TurnUsage>,
}

impl RuntimeState {
    pub(super) fn begin_turn(&mut self, turn_id: String, started_at: chrono::DateTime<Utc>) {
        self.current_turn_id = Some(turn_id);
        self.turn_started_at = Some(started_at);
        self.thinking_started_at = None;
        self.thinking_ms = 0;
        self.last_thinking_segment_ms = 0;
        self.turn_usage = None;
    }

    fn ensure_turn_clock(&mut self) {
        if self.current_turn_id.is_some() && self.turn_started_at.is_none() {
            self.turn_started_at = Some(Utc::now());
        }
    }

    fn mark_thinking(&mut self) {
        if self.thinking_started_at.is_none() {
            self.thinking_started_at = Some(Utc::now());
        }
    }

    fn close_thinking(&mut self) -> u64 {
        if let Some(start) = self.thinking_started_at.take() {
            let ms = u64::try_from((Utc::now() - start).num_milliseconds().max(0)).unwrap_or(0);
            self.thinking_ms = self.thinking_ms.saturating_add(ms);
            if ms > 0 {
                self.last_thinking_segment_ms = ms;
            }
            ms
        } else {
            0
        }
    }

    fn take_last_thinking_segment_ms(&mut self) -> Option<u64> {
        let ms = self.last_thinking_segment_ms;
        self.last_thinking_segment_ms = 0;
        (ms > 0).then_some(ms)
    }

    fn finish_timing(&mut self) -> (u64, u64, u64) {
        let closed = self.close_thinking();
        let last_segment_ms = if closed > 0 {
            closed
        } else {
            self.last_thinking_segment_ms
        };
        let worked_ms = self
            .turn_started_at
            .take()
            .map(|start| u64::try_from((Utc::now() - start).num_milliseconds().max(0)).unwrap_or(0))
            .unwrap_or(0);
        let thinking_ms = self.thinking_ms;
        self.thinking_ms = 0;
        self.last_thinking_segment_ms = 0;
        (worked_ms, thinking_ms, last_segment_ms)
    }
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn apply_event(
    chat_id: &str,
    envelope: AgentEventEnvelope,
    store: &AgentChatStore,
    state: &Mutex<RuntimeState>,
    events: &broadcast::Sender<AgentChatEvent>,
    recent_events: &std::sync::Mutex<HashMap<String, VecDeque<AgentChatEvent>>>,
) -> Result<()> {
    let adapter_event_id = envelope.event_id.clone();
    let adapter_turn_id = envelope.turn_id.clone();
    let emit = |payload: AgentChatPayload| -> Result<()> {
        emit_live_ids(
            chat_id,
            payload,
            store,
            events,
            recent_events,
            Some(adapter_event_id.clone()),
            adapter_turn_id.clone(),
        )
    };
    let emit_host = |payload: AgentChatPayload| -> Result<()> {
        emit_live(chat_id, payload, store, events, recent_events)
    };
    {
        let mut state = state.lock().await;
        state.last_activity = Instant::now();
        state.ensure_turn_clock();
    }
    match envelope.payload {
        AgentEvent::SessionStarted { persistence_handle } => {
            store.update_meta(chat_id, |meta| {
                if let Some(handle) = persistence_handle.clone() {
                    if meta.id == handle {
                        tracing::warn!("refusing to store persistence handle equal to chat id");
                    } else {
                        meta.persistence_handle = Some(handle);
                    }
                }
                if meta.runtime_status == RuntimeStatus::Starting {
                    meta.runtime_status = RuntimeStatus::Ready;
                }
                inject_session_op_commands(&meta.provider_id, &mut meta.available_commands);
            })?;
            let injected = store.get_meta(chat_id)?.available_commands;
            emit(AgentChatPayload::RuntimeStatus {
                status: RuntimeStatus::Ready,
                persistence_handle,
            })?;
            if !injected.is_empty() {
                emit(AgentChatPayload::AvailableCommandsUpdated { commands: injected })?;
            }
        }
        AgentEvent::AssistantMessageDelta { message_id, delta } => {
            flush_open_thinking(store, state, chat_id, &emit_host).await?;
            {
                let snapshot = {
                    let mut state = state.lock().await;
                    state.close_thinking();
                    let turn_id = state
                        .current_turn_id
                        .clone()
                        .unwrap_or_else(|| "unknown".into());
                    {
                        let entry = state
                            .assistant_text
                            .entry(message_id.clone())
                            .or_insert_with(|| (turn_id, String::new()));
                        entry.1.push_str(&delta);
                    }
                    if state.last_snapshot.elapsed() >= ASSISTANT_SNAPSHOT_INTERVAL {
                        let snapshot = state.assistant_text.get(&message_id).cloned();
                        state.last_snapshot = Instant::now();
                        snapshot
                    } else {
                        None
                    }
                };
                if let Some((turn_id, text)) = snapshot {
                    store.append_record(
                        chat_id,
                        &TranscriptEnvelope::new(
                            turn_id,
                            TranscriptEvent::AssistantSnapshot {
                                message_id: message_id.clone(),
                                text,
                            },
                        ),
                    )?;
                }
            }
            emit(AgentChatPayload::AssistantMessageDelta { message_id, delta })?;
        }
        AgentEvent::AssistantMessageCompleted { message_id } => {
            if let Some((turn_id, text)) = state.lock().await.assistant_text.remove(&message_id) {
                store.append_record(
                    chat_id,
                    &TranscriptEnvelope::with_id(
                        adapter_event_id.clone(),
                        turn_id,
                        TranscriptEvent::AssistantSnapshot {
                            message_id: message_id.clone(),
                            text,
                        },
                    ),
                )?;
            }
            emit(AgentChatPayload::AssistantMessageCompleted { message_id })?;
        }
        AgentEvent::ThinkingDelta { message_id, delta } => {
            {
                let mut state = state.lock().await;
                state.mark_thinking();
                let turn_id = state
                    .current_turn_id
                    .clone()
                    .unwrap_or_else(|| "unknown".into());
                state
                    .thinking_text
                    .entry(message_id.clone())
                    .or_insert_with(|| (turn_id, String::new()))
                    .1
                    .push_str(&delta);
            }
            emit(AgentChatPayload::ThinkingDelta { message_id, delta })?;
        }
        AgentEvent::ThinkingCompleted { message_id } => {
            let snapshot = {
                let mut state = state.lock().await;
                let (turn_id, text) = match state.thinking_text.remove(&message_id) {
                    Some(entry) => entry,
                    None => (
                        state
                            .current_turn_id
                            .clone()
                            .unwrap_or_else(|| "unknown".into()),
                        String::new(),
                    ),
                };
                let started_at = state.thinking_started_at;
                state.close_thinking();
                let duration_ms = state.take_last_thinking_segment_ms();
                Some((turn_id, text, started_at, duration_ms))
            };
            let thinking_ms = snapshot.as_ref().and_then(|item| item.3);
            if let Some((turn_id, text, started_at, duration_ms)) = snapshot {
                if !text.is_empty() || duration_ms.is_some() {
                    store.append_record(
                        chat_id,
                        &TranscriptEnvelope::with_id(
                            adapter_event_id.clone(),
                            turn_id,
                            TranscriptEvent::ThinkingSnapshot {
                                message_id: message_id.clone(),
                                text,
                                started_at,
                                duration_ms,
                            },
                        ),
                    )?;
                }
            }
            emit(AgentChatPayload::ThinkingCompleted {
                message_id,
                thinking_ms,
            })?;
        }
        AgentEvent::ToolCallStarted { tool_call } => {
            persist_tool(
                store,
                state,
                chat_id,
                tool_call.clone(),
                &emit_host,
                Some(adapter_event_id.clone()),
            )
            .await?;
            emit(AgentChatPayload::ToolCallStarted { tool_call })?;
        }
        AgentEvent::ToolCallUpdated { tool_call } => {
            persist_tool(
                store,
                state,
                chat_id,
                tool_call.clone(),
                &emit_host,
                Some(adapter_event_id.clone()),
            )
            .await?;
            emit(AgentChatPayload::ToolCallUpdated { tool_call })?;
        }
        AgentEvent::ToolCallCompleted { tool_call } => {
            persist_tool(
                store,
                state,
                chat_id,
                tool_call.clone(),
                &emit_host,
                Some(adapter_event_id.clone()),
            )
            .await?;
            emit(AgentChatPayload::ToolCallCompleted { tool_call })?;
        }
        AgentEvent::ToolCallFailed { tool_call, error } => {
            persist_tool(
                store,
                state,
                chat_id,
                tool_call.clone(),
                &emit_host,
                Some(adapter_event_id.clone()),
            )
            .await?;
            emit(AgentChatPayload::ToolCallFailed { tool_call, error })?;
        }
        AgentEvent::PlanUpdated { plan } => {
            flush_open_thinking(store, state, chat_id, &emit_host).await?;
            let turn_id = state
                .lock()
                .await
                .current_turn_id
                .clone()
                .unwrap_or_else(|| "unknown".into());
            store.append_record(
                chat_id,
                &TranscriptEnvelope::with_id(
                    adapter_event_id.clone(),
                    turn_id,
                    TranscriptEvent::Plan { plan: plan.clone() },
                ),
            )?;
            emit(AgentChatPayload::PlanUpdated { plan })?;
        }
        AgentEvent::PermissionRequested { request } => {
            flush_open_thinking(store, state, chat_id, &emit_host).await?;
            let turn_id = state
                .lock()
                .await
                .current_turn_id
                .clone()
                .unwrap_or_else(|| "unknown".into());
            let pending = PendingPermission {
                request_id: request.request_id,
                tool: request.tool,
                description: request.description,
                content_markdown: request.content_markdown,
                options: request.options,
                questions: request.questions,
                status: "pending".into(),
            };
            state.lock().await.pending_permission = Some(pending.clone());
            store.append_record(
                chat_id,
                &TranscriptEnvelope::with_id(
                    adapter_event_id.clone(),
                    turn_id,
                    TranscriptEvent::Permission {
                        request: pending.clone(),
                    },
                ),
            )?;
            store.update_meta(chat_id, |meta| {
                meta.runtime_status = RuntimeStatus::WaitingPermission;
            })?;
            emit(AgentChatPayload::PermissionRequested { request: pending })?;
        }
        AgentEvent::PermissionResolved {
            request_id,
            option_id,
        } => {
            let turn_id = state
                .lock()
                .await
                .current_turn_id
                .clone()
                .unwrap_or_else(|| "unknown".into());
            let mut resolved = state.lock().await.pending_permission.clone().unwrap_or(
                super::types::PendingPermission {
                    request_id: request_id.clone(),
                    tool: String::new(),
                    description: String::new(),
                    content_markdown: None,
                    options: Vec::new(),
                    questions: Vec::new(),
                    status: "resolved".into(),
                },
            );
            resolved.status = "resolved".into();
            state.lock().await.pending_permission = None;
            store.append_record(
                chat_id,
                &TranscriptEnvelope::with_id(
                    adapter_event_id.clone(),
                    turn_id,
                    TranscriptEvent::Permission { request: resolved },
                ),
            )?;
            store.update_meta(chat_id, |meta| {
                if !matches!(meta.runtime_status, RuntimeStatus::Closed) {
                    meta.runtime_status = RuntimeStatus::RunningTurn;
                }
            })?;
            emit(AgentChatPayload::PermissionResolved {
                request_id,
                option_id,
            })?;
        }
        AgentEvent::SessionOpRequested { request } => {
            let pending = PendingSessionOp {
                request: request.clone(),
                selected_turn_id: None,
            };
            state.lock().await.pending_session_op = Some(pending.clone());
            store.update_meta(chat_id, |meta| {
                meta.pending_session_op = Some(pending);
            })?;
            emit(AgentChatPayload::SessionOpRequested { request })?;
        }
        AgentEvent::SessionOpResolved {
            request_id,
            option_id,
            outcome,
        } => {
            state.lock().await.pending_session_op = None;
            store.update_meta(chat_id, |meta| {
                meta.pending_session_op = None;
            })?;
            emit(AgentChatPayload::SessionOpResolved {
                request_id,
                option_id,
                outcome: session_op_outcome_wire(&outcome),
                error: match &outcome {
                    SessionOpOutcome::Failed { message } => Some(message.clone()),
                    _ => None,
                },
            })?;
        }
        AgentEvent::TurnCompleted { turn_id, stop } => {
            finish_turn(
                chat_id,
                turn_id,
                match stop {
                    TurnStop::Canceled => TurnStatus::Canceled,
                    TurnStop::Failed => TurnStatus::Failed,
                    TurnStop::Completed => TurnStatus::Completed,
                },
                None,
                store,
                state,
                &emit,
                Some(adapter_event_id.clone()),
            )
            .await?;
        }
        AgentEvent::TurnCanceled { turn_id } => {
            finish_turn(
                chat_id,
                turn_id,
                TurnStatus::Canceled,
                None,
                store,
                state,
                &emit,
                Some(adapter_event_id.clone()),
            )
            .await?;
        }
        AgentEvent::TurnFailed { turn_id, error } => {
            finish_turn(
                chat_id,
                turn_id,
                TurnStatus::Failed,
                Some(error),
                store,
                state,
                &emit,
                Some(adapter_event_id.clone()),
            )
            .await?;
        }
        AgentEvent::SessionClosed => {
            store.update_meta(chat_id, |meta| {
                meta.runtime_status = RuntimeStatus::Closed;
                meta.pending_session_op = None;
            })?;
            state.lock().await.pending_permission = None;
            state.lock().await.pending_session_op = None;
            emit(AgentChatPayload::RuntimeStatus {
                status: RuntimeStatus::Closed,
                persistence_handle: None,
            })?;
        }
        AgentEvent::SessionTitleUpdated { title } => {
            store.update_meta(chat_id, |meta| {
                meta.title = Some(title.clone());
            })?;
            emit(AgentChatPayload::TitleUpdated { title: Some(title) })?;
        }
        AgentEvent::AvailableCommandsUpdated { commands } => {
            let provider_id = store.get_meta(chat_id)?.provider_id;
            let mut commands = commands;
            inject_session_op_commands(&provider_id, &mut commands);
            store.update_meta(chat_id, |meta| {
                meta.available_commands = commands.clone();
            })?;
            emit(AgentChatPayload::AvailableCommandsUpdated { commands })?;
        }
        AgentEvent::TurnStarted { .. } | AgentEvent::UserMessage { .. } => {}
        AgentEvent::UsageUpdated { usage } => {
            let incoming_session = parse_session_usage(&usage);
            let turn = parse_turn_usage(&usage);
            let session = if let Some(incoming) = incoming_session {
                let meta = store.update_meta(chat_id, |meta| {
                    meta.session_usage =
                        Some(merge_session_usage(meta.session_usage.clone(), incoming));
                })?;
                meta.session_usage
            } else {
                None
            };
            if let Some(turn) = turn.clone() {
                let mut state = state.lock().await;
                state.turn_usage = Some(turn.clone());
                let turn_id = state.current_turn_id.clone();
                drop(state);
                store.append_record(
                    chat_id,
                    &TranscriptEnvelope::with_id(
                        adapter_event_id.clone(),
                        turn_id.unwrap_or_else(|| "unknown".into()),
                        TranscriptEvent::Usage {
                            usage: serde_json::to_value(&turn).unwrap_or(usage.clone()),
                        },
                    ),
                )?;
            }
            if session.is_some() || turn.is_some() {
                emit(AgentChatPayload::UsageUpdated { session, turn })?;
            }
        }
        AgentEvent::ConfigChanged { config } => {
            let advertised = parse_advertised_options(&config);
            let (model, thinking, mode, permission_mode, fast) = selected_session_config(&config);
            if advertised.is_empty()
                && model.is_none()
                && thinking.is_none()
                && mode.is_none()
                && permission_mode.is_none()
                && fast.is_none()
            {
                return Ok(());
            }
            let mut emitted = None;
            store.update_meta(chat_id, |meta| {
                apply_config_changed(
                    meta,
                    advertised,
                    model.as_ref(),
                    thinking.as_ref(),
                    mode.as_ref(),
                    permission_mode.as_ref(),
                    fast.as_ref(),
                );
                emitted = Some(meta.descriptor.clone());
            })?;
            if let Some(descriptor) = emitted {
                emit(AgentChatPayload::ConfigUpdated { descriptor })?;
            }
        }
        AgentEvent::Unknown {
            event_type,
            payload,
        } => {
            emit(AgentChatPayload::Unknown {
                event_type,
                payload,
            })?;
        }
        AgentEvent::UserCheckpoint {
            turn_id,
            checkpoint_id,
        } => {
            store.append_record(
                chat_id,
                &TranscriptEnvelope::new(
                    turn_id,
                    TranscriptEvent::UserCheckpoint { checkpoint_id },
                ),
            )?;
        }
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
struct ConfigOptionValueWire {
    value: String,
    #[serde(default)]
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ConfigOptionWire {
    #[serde(alias = "configId")]
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    category: Option<String>,
    #[serde(default, rename = "type", alias = "type")]
    option_type: Option<String>,
    #[serde(default, alias = "currentValue")]
    current_value: Option<String>,
    #[serde(default)]
    options: Vec<ConfigOptionValueWire>,
}

fn preserve_user_selection_over_host_advertised(
    selected: Option<&String>,
    advertised: &str,
    option: Option<&SessionAdvertisedOption>,
    provider_id: &str,
) -> bool {
    let Some(selected) = selected
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
    else {
        return false;
    };
    if config_values_equal(selected, advertised) {
        return false;
    }
    match option {
        Some(option) if !option.options.is_empty() => {
            map_advertised_select_value(option, selected, provider_id).is_some()
        }
        _ => true,
    }
}

fn stamp_advertised_selection(
    options: &[SessionAdvertisedOption],
    kind: &str,
    advertised_current: Option<&String>,
    applied: &mut Option<String>,
    selected: &mut Option<String>,
    provider_id: &str,
) -> Option<String> {
    let value = advertised_current
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())?;
    let option = advertised_option_for_kind(options, kind);
    let had_applied = applied.as_ref().is_some_and(|item| !item.trim().is_empty());
    let keep = keep_pending_session_selection(
        selected.as_ref(),
        applied.as_ref(),
        value,
        option,
        provider_id,
    );
    *applied = Some(value.to_string());
    if keep {
        if let Some(mapped) = option.and_then(|item| {
            selected
                .as_deref()
                .and_then(|requested| map_advertised_select_value(item, requested, provider_id))
        }) {
            *selected = Some(mapped.clone());
            Some(mapped)
        } else {
            selected.clone()
        }
    } else if !had_applied
        && preserve_user_selection_over_host_advertised(
            selected.as_ref(),
            value,
            option,
            provider_id,
        )
    {
        if let Some(mapped) = option.and_then(|item| {
            selected
                .as_deref()
                .and_then(|requested| map_advertised_select_value(item, requested, provider_id))
        }) {
            *selected = Some(mapped.clone());
            Some(mapped)
        } else {
            selected.clone()
        }
    } else {
        *selected = Some(value.to_string());
        Some(value.to_string())
    }
}

fn apply_config_changed(
    meta: &mut AgentChatMeta,
    advertised: Vec<SessionAdvertisedOption>,
    model: Option<&String>,
    thinking: Option<&String>,
    mode: Option<&String>,
    permission_mode: Option<&String>,
    fast: Option<&String>,
) {
    let complete = advertised
        .iter()
        .any(|item| !item.options.is_empty() || item.option_type.eq_ignore_ascii_case("boolean"));
    if complete {
        if let Some(option) = advertised_option_for_kind(&advertised, "model") {
            if !option.options.is_empty() {
                let previous_thinking: HashMap<String, AgentThinkingSupport> = meta
                    .descriptor
                    .supported_options
                    .models
                    .iter()
                    .filter_map(|item| {
                        item.thinking
                            .clone()
                            .map(|thinking| (item.id.clone(), thinking))
                    })
                    .collect();
                let mut models = models_from_option(option, &meta.provider_id);
                for model in &mut models {
                    if model.thinking.is_some() {
                        continue;
                    }
                    if let Some(thinking) = previous_thinking.get(&model.id) {
                        model.thinking = Some(thinking.clone());
                    }
                }
                meta.descriptor.supported_options.models = models;
            }
        }
        if let Some(option) = advertised_option_for_kind(&advertised, "mode") {
            if !option.options.is_empty() {
                meta.descriptor.supported_options.modes = modes_from_option(option);
            }
        }
        if let Some(option) = advertised_option_for_kind(&advertised, "permission_mode") {
            if !option.options.is_empty() {
                meta.descriptor.supported_options.permission_modes = modes_from_option(option);
            }
        }
        // ACP effort/reasoning is session-scoped to the selected model. Keep the
        // agent-level enum for the current model, and stamp it onto that model so
        // other models do not inherit a stale shared ladder.
        match advertised_option_for_kind(&advertised, "thinking") {
            Some(option) if !option.options.is_empty() => {
                meta.descriptor.supported_options.thinking = AgentThinkingSupport::Enum {
                    arg: Some(option.id.clone()),
                    options: option
                        .options
                        .iter()
                        .map(|item| item.value.clone())
                        .collect(),
                };
            }
            _ => {
                meta.descriptor.supported_options.thinking = AgentThinkingSupport::None;
                meta.descriptor.current_config.thinking = None;
                meta.applied_thinking = None;
            }
        }
        match advertised_option_for_kind(&advertised, "fast") {
            Some(option) if !option.options.is_empty() => {
                meta.descriptor.supported_options.fast = modes_from_option(option);
            }
            Some(option) if option.option_type.eq_ignore_ascii_case("boolean") => {
                let on = option.current_value.as_deref().is_some_and(|value| {
                    value.eq_ignore_ascii_case("true")
                        || value.eq_ignore_ascii_case("on")
                        || value == "1"
                });
                meta.descriptor.supported_options.fast = vec![
                    AgentMode {
                        id: "false".into(),
                        label: "Off".into(),
                        is_default: !on,
                    },
                    AgentMode {
                        id: "true".into(),
                        label: "On".into(),
                        is_default: on,
                    },
                ];
            }
            _ => {
                meta.descriptor.supported_options.fast.clear();
                meta.descriptor.current_config.fast = None;
                meta.applied_fast = None;
            }
        }
    }
    stamp_advertised_selection(
        &advertised,
        "model",
        model,
        &mut meta.applied_model,
        &mut meta.descriptor.current_config.model,
        &meta.provider_id,
    );
    stamp_advertised_selection(
        &advertised,
        "thinking",
        thinking,
        &mut meta.applied_thinking,
        &mut meta.descriptor.current_config.thinking,
        &meta.provider_id,
    );
    stamp_advertised_selection(
        &advertised,
        "mode",
        mode,
        &mut meta.applied_mode,
        &mut meta.descriptor.current_config.mode,
        &meta.provider_id,
    );
    stamp_advertised_selection(
        &advertised,
        "permission_mode",
        permission_mode,
        &mut meta.applied_permission_mode,
        &mut meta.descriptor.current_config.permission_mode,
        &meta.provider_id,
    );
    if advertised_option_for_kind(&advertised, "fast").is_some()
        || !meta.descriptor.supported_options.fast.is_empty()
    {
        stamp_advertised_selection(
            &advertised,
            "fast",
            fast,
            &mut meta.applied_fast,
            &mut meta.descriptor.current_config.fast,
            &meta.provider_id,
        );
    }
    if complete {
        stamp_session_thinking_on_current_model(meta);
    }
}

/// ACP `effort` / `reasoning_*` options describe the *selected* model only.
fn stamp_session_thinking_on_current_model(meta: &mut AgentChatMeta) {
    let current_id = meta.descriptor.current_config.model.clone().or_else(|| {
        meta.descriptor
            .supported_options
            .models
            .iter()
            .find(|model| model.is_default)
            .map(|model| model.id.clone())
    });
    let Some(current_id) = current_id else {
        return;
    };
    let thinking = meta.descriptor.supported_options.thinking.clone();
    if let Some(model) = meta
        .descriptor
        .supported_options
        .models
        .iter_mut()
        .find(|model| model.id == current_id)
    {
        model.thinking = Some(thinking);
    }
}

fn models_from_option(option: &SessionAdvertisedOption, provider_id: &str) -> Vec<AgentModel> {
    let decorate_cursor = agent::canonicalize_chat_provider_id(provider_id) == "cursor";
    option
        .options
        .iter()
        .map(|item| {
            let label = if decorate_cursor && agent::cursor_model_has_brackets(&item.value) {
                agent::cursor_model_display_label(&item.value, item.name.as_deref())
            } else {
                item.name.clone().unwrap_or_else(|| item.value.clone())
            };
            AgentModel {
                id: item.value.clone(),
                label,
                group: None,
                is_default: option.current_value.as_deref() == Some(item.value.as_str()),
                thinking: None,
            }
        })
        .collect()
}

fn modes_from_option(option: &SessionAdvertisedOption) -> Vec<AgentMode> {
    option
        .options
        .iter()
        .map(|item| AgentMode {
            id: item.value.clone(),
            label: item.name.clone().unwrap_or_else(|| item.value.clone()),
            is_default: option.current_value.as_deref() == Some(item.value.as_str()),
        })
        .collect()
}

fn parse_advertised_options(config: &serde_json::Value) -> Vec<SessionAdvertisedOption> {
    let options: Vec<ConfigOptionWire> = match serde_json::from_value(config.clone()) {
        Ok(options) => options,
        Err(_) => return Vec::new(),
    };
    options
        .into_iter()
        .map(|option| SessionAdvertisedOption {
            id: option.id,
            name: option.name,
            category: option.category,
            option_type: option.option_type.unwrap_or_else(|| "select".into()),
            current_value: option.current_value,
            options: option
                .options
                .into_iter()
                .map(|item| SessionAdvertisedOptionValue {
                    value: item.value,
                    name: item.name,
                })
                .collect(),
        })
        .collect()
}

#[allow(clippy::type_complexity)]
pub(super) fn selected_session_config(
    config: &serde_json::Value,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    if let Ok(options) = serde_json::from_value::<Vec<ConfigOptionWire>>(config.clone()) {
        let mut model = None;
        let mut thinking = None;
        let mut thinking_preferred = None;
        let mut mode = None;
        let mut permission_mode = None;
        let mut fast = None;
        for option in options {
            let Some(value) = option.current_value.clone().and_then(nonempty_opt) else {
                continue;
            };
            if model.is_none()
                && config_kind_matches(&option.id, option.category.as_deref(), "model")
            {
                model = Some(value);
            } else if permission_mode.is_none()
                && config_kind_matches(&option.id, option.category.as_deref(), "permission_mode")
            {
                permission_mode = Some(value);
            } else if mode.is_none()
                && config_kind_matches(&option.id, option.category.as_deref(), "mode")
            {
                mode = Some(value);
            } else if config_kind_matches(&option.id, option.category.as_deref(), "thinking") {
                let id = option.id.to_ascii_lowercase();
                let preferred = id == "effort" || id == "thought_level" || id.contains("reason");
                if preferred {
                    thinking_preferred = Some(value);
                } else if thinking.is_none() {
                    thinking = Some(value);
                }
            } else if fast.is_none()
                && config_kind_matches(&option.id, option.category.as_deref(), "fast")
            {
                fast = Some(value);
            }
        }
        return (
            model,
            thinking_preferred.or(thinking),
            mode,
            permission_mode,
            fast,
        );
    }
    if let Some(obj) = config.as_object() {
        let pick = |key: &str| {
            obj.get(key)
                .and_then(|value| value.as_str())
                .map(str::to_string)
                .and_then(nonempty_opt)
        };
        return (
            pick("model"),
            pick("thinking"),
            pick("mode"),
            pick("permission_mode"),
            pick("fast"),
        );
    }
    (None, None, None, None, None)
}

async fn persist_tool(
    store: &AgentChatStore,
    state: &Mutex<RuntimeState>,
    chat_id: &str,
    tool: AgentTool,
    emit: &impl Fn(AgentChatPayload) -> Result<()>,
    persist_event_id: Option<String>,
) -> Result<()> {
    flush_open_thinking(store, state, chat_id, emit).await?;
    let turn_id = state
        .lock()
        .await
        .current_turn_id
        .clone()
        .unwrap_or_else(|| "unknown".into());
    let envelope = match persist_event_id {
        Some(event_id) => {
            TranscriptEnvelope::with_id(event_id, turn_id, TranscriptEvent::ToolCall { tool })
        }
        None => TranscriptEnvelope::new(turn_id, TranscriptEvent::ToolCall { tool }),
    };
    store.append_record(chat_id, &envelope)
}

/// Persist in-memory thinking as its own transcript segment when a tool, plan,
/// or assistant answer interrupts it. ACP thought chunks never send `done`, so
/// without this the whole turn collapses to one thinking snapshot after tools.
async fn flush_open_thinking(
    store: &AgentChatStore,
    state: &Mutex<RuntimeState>,
    chat_id: &str,
    emit: &impl Fn(AgentChatPayload) -> Result<()>,
) -> Result<()> {
    let snapshots = {
        let mut state = state.lock().await;
        if state.thinking_text.is_empty() {
            state.close_thinking();
            return Ok(());
        }
        let started_at = state.thinking_started_at;
        state.close_thinking();
        let duration_ms = state.take_last_thinking_segment_ms();
        let entries: Vec<_> = state.thinking_text.drain().collect();
        entries
            .into_iter()
            .map(|(message_id, (turn_id, text))| {
                (message_id, turn_id, text, started_at, duration_ms)
            })
            .collect::<Vec<_>>()
    };
    for (message_id, turn_id, text, started_at, duration_ms) in snapshots {
        if !text.is_empty() || duration_ms.is_some() {
            store.append_record(
                chat_id,
                &TranscriptEnvelope::new(
                    turn_id,
                    TranscriptEvent::ThinkingSnapshot {
                        message_id: message_id.clone(),
                        text,
                        started_at,
                        duration_ms,
                    },
                ),
            )?;
        }
        emit(AgentChatPayload::ThinkingCompleted {
            message_id,
            thinking_ms: duration_ms,
        })?;
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn finish_turn(
    chat_id: &str,
    turn_id: String,
    status: TurnStatus,
    error: Option<String>,
    store: &AgentChatStore,
    state: &Mutex<RuntimeState>,
    emit: &impl Fn(AgentChatPayload) -> Result<()>,
    persist_event_id: Option<String>,
) -> Result<()> {
    let (
        assistant,
        thinking,
        worked_ms,
        thinking_ms,
        last_thinking_segment_ms,
        usage,
        completed_at,
    ) = {
        let mut state = state.lock().await;
        if state.current_turn_id.as_deref() == Some(turn_id.as_str()) {
            state.current_turn_id = None;
        }
        let (worked_ms, thinking_ms, last_thinking_segment_ms) = state.finish_timing();
        let usage = state.turn_usage.take();
        let completed_at = Utc::now();
        let mut assistant = HashMap::new();
        state.assistant_text.retain(|id, (snap_turn, text)| {
            if snap_turn == &turn_id {
                assistant.insert(id.clone(), (snap_turn.clone(), text.clone()));
                false
            } else {
                true
            }
        });
        let mut thinking = HashMap::new();
        state.thinking_text.retain(|id, (snap_turn, text)| {
            if snap_turn == &turn_id {
                thinking.insert(id.clone(), (snap_turn.clone(), text.clone()));
                false
            } else {
                true
            }
        });
        (
            assistant,
            thinking,
            worked_ms,
            thinking_ms,
            last_thinking_segment_ms,
            usage,
            completed_at,
        )
    };
    for (message_id, (snap_turn, text)) in assistant {
        store.append_record(
            chat_id,
            &TranscriptEnvelope::new(
                snap_turn,
                TranscriptEvent::AssistantSnapshot { message_id, text },
            ),
        )?;
    }
    for (message_id, (snap_turn, text)) in thinking {
        store.append_record(
            chat_id,
            &TranscriptEnvelope::new(
                snap_turn,
                TranscriptEvent::ThinkingSnapshot {
                    message_id,
                    text,
                    started_at: None,
                    duration_ms: (last_thinking_segment_ms > 0).then_some(last_thinking_segment_ms),
                },
            ),
        )?;
    }
    let completed = TranscriptEvent::TurnCompleted {
        status,
        error: error.clone(),
        worked_ms: Some(worked_ms),
        thinking_ms: Some(thinking_ms),
        usage: usage.clone(),
    };
    let completed_envelope = match persist_event_id {
        Some(event_id) => TranscriptEnvelope::with_id(event_id, turn_id.clone(), completed),
        None => TranscriptEnvelope::new(turn_id.clone(), completed),
    };
    store.append_record(chat_id, &completed_envelope)?;
    store.update_meta(chat_id, |meta| {
        meta.runtime_status = RuntimeStatus::Ready;
    })?;
    emit(AgentChatPayload::TurnCompleted {
        turn_id,
        status,
        worked_ms: Some(worked_ms),
        thinking_ms: Some(thinking_ms),
        completed_at: Some(completed_at),
        usage,
        error,
    })
}

enum LiveOverlay {
    Text(String),
    Thinking(String),
}

/// Splice in-memory assistant/thinking text that has not been flushed to jsonl
/// onto a disk snapshot. Same `message_id` updates in place; a live id that is
/// not on disk lands on the current-turn assistant instead of a second row.
pub(super) fn overlay_live_state(snapshot: &mut AgentChatSnapshot, state: &RuntimeState) {
    for (message_id, (_turn, text)) in &state.thinking_text {
        overlay_live_part(
            &mut snapshot.messages,
            message_id,
            LiveOverlay::Thinking(text.clone()),
        );
    }
    for (message_id, (_turn, text)) in &state.assistant_text {
        overlay_live_part(
            &mut snapshot.messages,
            message_id,
            LiveOverlay::Text(text.clone()),
        );
    }
    overlay_live_timing(snapshot, state, Utc::now());
    if snapshot.pending_permission.is_none() {
        snapshot.pending_permission = state.pending_permission.clone();
    }
    if snapshot.pending_session_op.is_none() {
        snapshot.pending_session_op = state
            .pending_session_op
            .as_ref()
            .map(|pending| pending.request.clone());
    }
}

fn overlay_live_timing(
    snapshot: &mut AgentChatSnapshot,
    state: &RuntimeState,
    now: chrono::DateTime<Utc>,
) {
    if state.current_turn_id.is_none() && state.turn_started_at.is_none() {
        return;
    }
    if snapshot.running_turn_id.is_none() {
        snapshot.running_turn_id = state.current_turn_id.clone();
    }
    if let Some(start) = state.turn_started_at {
        snapshot.running_turn_started_at = Some(start);
    }
    let worked_ms = state
        .turn_started_at
        .or(snapshot.running_turn_started_at)
        .map(|start| elapsed_ms(start, now));
    let open_thinking_ms = state
        .thinking_started_at
        .map(|start| elapsed_ms(start, now));
    let thinking_ms = Some(
        state
            .thinking_ms
            .saturating_add(open_thinking_ms.unwrap_or(0)),
    )
    .filter(|ms| *ms > 0 || open_thinking_ms.is_some());
    if let Some(last) = snapshot.messages.last_mut() {
        if last.role == "assistant" {
            last.streaming = true;
            if let Some(ms) = worked_ms {
                last.worked_ms = Some(ms);
            }
            if thinking_ms.is_some() {
                last.thinking_ms = thinking_ms;
            }
            if let Some(ms) = open_thinking_ms.filter(|ms| *ms > 0) {
                stamp_open_thinking_duration(&mut last.parts, ms);
            }
        }
    }
}

fn stamp_open_thinking_duration(parts: &mut [MessagePart], duration_ms: u64) {
    for part in parts.iter_mut().rev() {
        if let MessagePart::Thinking {
            tool_call_id: None,
            duration_ms: existing,
            ..
        } = part
        {
            if existing.is_none() {
                *existing = Some(duration_ms);
            }
            return;
        }
    }
}

fn overlay_target(messages: &[FoldedMessage], message_id: &str) -> Option<usize> {
    if let Some(index) = messages.iter().rposition(|item| item.id == message_id) {
        return Some(index);
    }
    let start = messages
        .iter()
        .rposition(|item| item.role == "user")
        .map(|index| index + 1)
        .unwrap_or(0);
    messages
        .iter()
        .enumerate()
        .skip(start)
        .rposition(|(_, item)| item.role == "assistant")
        .map(|rel| start + rel)
}

fn overlay_live_part(messages: &mut Vec<FoldedMessage>, message_id: &str, part: LiveOverlay) {
    if let Some(index) = overlay_target(messages, message_id) {
        apply_overlay_part(&mut messages[index], part);
        return;
    }
    let parts = match &part {
        LiveOverlay::Text(text) => vec![MessagePart::Text { text: text.clone() }],
        LiveOverlay::Thinking(text) => vec![MessagePart::Thinking {
            text: text.clone(),
            tool_call_id: None,
            duration_ms: None,
        }],
    };
    messages.push(FoldedMessage {
        id: message_id.to_string(),
        role: "assistant".into(),
        kind: agent::UserMessageKind::Normal,
        parts,
        created_at: Utc::now(),
        streaming: true,
        ..Default::default()
    });
}

fn apply_overlay_part(message: &mut FoldedMessage, part: LiveOverlay) {
    match part {
        LiveOverlay::Text(text) => {
            if let Some(MessagePart::Text { text: existing }) = message
                .parts
                .iter_mut()
                .rev()
                .find(|item| matches!(item, MessagePart::Text { .. }))
            {
                *existing = text;
            } else {
                message.parts.push(MessagePart::Text { text });
            }
        }
        LiveOverlay::Thinking(text) => {
            let open = message.parts.iter_mut().rev().find_map(|item| match item {
                MessagePart::Thinking {
                    tool_call_id: None,
                    duration_ms,
                    text: existing,
                } if duration_ms.is_none() => Some(existing),
                _ => None,
            });
            if let Some(existing) = open {
                *existing = text;
            } else {
                message.parts.push(MessagePart::Thinking {
                    text,
                    tool_call_id: None,
                    duration_ms: None,
                });
            }
        }
    }
    message.streaming = true;
    message.parts = order_assistant_parts(std::mem::take(&mut message.parts));
}

pub(super) fn emit_live(
    chat_id: &str,
    payload: AgentChatPayload,
    store: &AgentChatStore,
    events: &broadcast::Sender<AgentChatEvent>,
    recent_events: &std::sync::Mutex<HashMap<String, VecDeque<AgentChatEvent>>>,
) -> Result<()> {
    emit_live_ids(chat_id, payload, store, events, recent_events, None, None)
}

pub(super) fn emit_live_ids(
    chat_id: &str,
    payload: AgentChatPayload,
    store: &AgentChatStore,
    events: &broadcast::Sender<AgentChatEvent>,
    recent_events: &std::sync::Mutex<HashMap<String, VecDeque<AgentChatEvent>>>,
    event_id: Option<String>,
    turn_id: Option<String>,
) -> Result<()> {
    let sequence = store.next_seq(chat_id)?;
    let persist = !matches!(
        payload,
        AgentChatPayload::AssistantMessageDelta { .. } | AgentChatPayload::ThinkingDelta { .. }
    );
    let event = AgentChatEvent {
        chat_id: chat_id.to_string(),
        event_id: event_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        sequence,
        turn_id,
        payload,
    };
    push_recent(recent_events, &event);
    let _ = events.send(event);
    if persist {
        store.persist_seq(chat_id)?;
    }
    Ok(())
}

pub(super) fn latest_turn_id(
    store: &AgentChatStore,
    chat_id: &str,
    live_turn: Option<&str>,
) -> Option<String> {
    if let Some(id) = live_turn.map(str::trim).filter(|item| !item.is_empty()) {
        return Some(id.to_string());
    }
    store
        .folded_turns(chat_id)
        .ok()?
        .last()
        .map(|turn| turn.id.clone())
}

pub(super) fn persist_session_hint(
    chat_id: &str,
    turn_id: &str,
    tone: SessionHintTone,
    kind: &str,
    store: &AgentChatStore,
    events: &broadcast::Sender<AgentChatEvent>,
    recent_events: &std::sync::Mutex<HashMap<String, VecDeque<AgentChatEvent>>>,
) -> Result<()> {
    let message_id = format!("hint-{turn_id}-{kind}");
    store.append_record(
        chat_id,
        &TranscriptEnvelope::new(
            turn_id,
            TranscriptEvent::SessionHint {
                message_id: message_id.clone(),
                tone,
                kind: kind.to_string(),
            },
        ),
    )?;
    emit_live(
        chat_id,
        AgentChatPayload::SessionHint {
            turn_id: turn_id.to_string(),
            message_id,
            tone,
            kind: kind.to_string(),
        },
        store,
        events,
        recent_events,
    )
}

pub(super) fn persist_switch_failed_hints(
    chat_id: &str,
    live_turn: Option<String>,
    model: bool,
    mode: bool,
    store: &AgentChatStore,
    events: &broadcast::Sender<AgentChatEvent>,
    recent_events: &std::sync::Mutex<HashMap<String, VecDeque<AgentChatEvent>>>,
) -> Result<()> {
    let Some(turn_id) = latest_turn_id(store, chat_id, live_turn.as_deref()) else {
        return Ok(());
    };
    if model {
        persist_session_hint(
            chat_id,
            &turn_id,
            SessionHintTone::Warning,
            SESSION_HINT_MODEL_SWITCH_FAILED,
            store,
            events,
            recent_events,
        )?;
    }
    if mode {
        persist_session_hint(
            chat_id,
            &turn_id,
            SessionHintTone::Warning,
            SESSION_HINT_MODE_SWITCH_FAILED,
            store,
            events,
            recent_events,
        )?;
    }
    Ok(())
}

pub(super) fn persist_session_config_change(
    chat_id: &str,
    turn_id: &str,
    change: &SessionConfigChange,
    store: &AgentChatStore,
    events: &broadcast::Sender<AgentChatEvent>,
    recent_events: &std::sync::Mutex<HashMap<String, VecDeque<AgentChatEvent>>>,
) -> Result<()> {
    let message_id = format!("config-{turn_id}");
    store.append_record(
        chat_id,
        &TranscriptEnvelope::new(
            turn_id,
            TranscriptEvent::SessionConfigChange {
                message_id: message_id.clone(),
                model: change.model.clone(),
                mode: change.mode.clone(),
            },
        ),
    )?;
    emit_live(
        chat_id,
        AgentChatPayload::SessionConfigChange {
            turn_id: turn_id.to_string(),
            message_id,
            model: change.model.clone(),
            mode: change.mode.clone(),
        },
        store,
        events,
        recent_events,
    )
}

pub(super) async fn apply_pending_session_config(
    chat_id: &str,
    turn_id: &str,
    store: &AgentChatStore,
    control: &AgentRuntimeControl,
    events: &broadcast::Sender<AgentChatEvent>,
    recent_events: &std::sync::Mutex<HashMap<String, VecDeque<AgentChatEvent>>>,
) -> Result<()> {
    let meta = store.get_meta(chat_id)?;
    let mut change = pending_session_config_change(&meta);
    if let Some(ref mut pending) = change {
        if let Some(value) = resolve_pending_select(
            &meta,
            "model",
            pending.model.as_ref().map(|item| item.to.as_str()),
        ) {
            if let Some(item) = pending.model.as_mut() {
                item.to = value;
            }
        }
        if let Some(value) = resolve_pending_select(
            &meta,
            "mode",
            pending.mode.as_ref().map(|item| item.to.as_str()),
        ) {
            if let Some(item) = pending.mode.as_mut() {
                item.to = value;
            }
        }
        if pending.is_empty() {
            change = None;
        }
    }
    let thinking = pending_thinking_change(&store.get_meta(chat_id)?);
    let permission_mode = pending_permission_mode_change(&store.get_meta(chat_id)?);
    let fast = pending_fast_change(&store.get_meta(chat_id)?);
    if change.is_none() && thinking.is_none() && permission_mode.is_none() && fast.is_none() {
        return stamp_applied_session_config(store, chat_id);
    }
    let outcome = apply_live_session_config(chat_id, store, control, change.as_ref()).await?;
    revert_session_config(
        store,
        chat_id,
        outcome.failed_model,
        outcome.failed_mode,
        outcome.failed_thinking,
        outcome.failed_permission_mode,
        outcome.failed_fast,
    )?;
    if outcome.failed_model
        || outcome.failed_mode
        || outcome.failed_thinking
        || outcome.failed_permission_mode
        || outcome.failed_fast
    {
        let meta = store.get_meta(chat_id)?;
        emit_live(
            chat_id,
            AgentChatPayload::ConfigUpdated {
                descriptor: meta.descriptor.clone(),
            },
            store,
            events,
            recent_events,
        )?;
    }
    persist_switch_failed_hints(
        chat_id,
        Some(turn_id.to_string()),
        outcome.failed_model,
        outcome.failed_mode,
        store,
        events,
        recent_events,
    )?;
    if let Some(mut recorded) = change {
        if outcome.failed_model {
            recorded.model = None;
        }
        if outcome.failed_mode {
            recorded.mode = None;
        }
        if !recorded.is_empty() {
            persist_session_config_change(
                chat_id,
                turn_id,
                &recorded,
                store,
                events,
                recent_events,
            )?;
        }
    }
    stamp_applied_session_config(store, chat_id)
}

/// Push pending picker values to a live runtime when idle (after host advertisements).
pub(super) async fn sync_pending_session_config_if_needed(
    chat_id: &str,
    store: &AgentChatStore,
    control: &AgentRuntimeControl,
    state: &Mutex<RuntimeState>,
    events: &broadcast::Sender<AgentChatEvent>,
    recent_events: &std::sync::Mutex<HashMap<String, VecDeque<AgentChatEvent>>>,
) -> Result<()> {
    if state.lock().await.current_turn_id.is_some() {
        return Ok(());
    }
    let meta = store.get_meta(chat_id)?;
    if pending_session_config_change(&meta).is_none()
        && pending_thinking_change(&meta).is_none()
        && pending_permission_mode_change(&meta).is_none()
        && pending_fast_change(&meta).is_none()
    {
        return Ok(());
    }
    apply_pending_session_config(
        chat_id,
        "config-sync",
        store,
        control,
        events,
        recent_events,
    )
    .await
}

fn revert_session_config(
    store: &AgentChatStore,
    chat_id: &str,
    revert_model: bool,
    revert_mode: bool,
    revert_thinking: bool,
    revert_permission_mode: bool,
    revert_fast: bool,
) -> Result<()> {
    store.update_meta(chat_id, |meta| {
        if revert_model {
            meta.descriptor.current_config.model = meta.applied_model.clone();
        }
        if revert_mode {
            meta.descriptor.current_config.mode = meta.applied_mode.clone();
        }
        if revert_thinking {
            meta.descriptor.current_config.thinking = meta.applied_thinking.clone();
        }
        if revert_permission_mode {
            meta.descriptor.current_config.permission_mode = meta.applied_permission_mode.clone();
        }
        if revert_fast {
            meta.descriptor.current_config.fast = meta.applied_fast.clone();
        }
    })?;
    Ok(())
}

pub(super) struct ConfigWriteOutcome {
    failed_model: bool,
    failed_mode: bool,
    failed_thinking: bool,
    failed_permission_mode: bool,
    failed_fast: bool,
}

pub(super) async fn apply_live_session_config(
    chat_id: &str,
    store: &AgentChatStore,
    control: &AgentRuntimeControl,
    change: Option<&SessionConfigChange>,
) -> Result<ConfigWriteOutcome> {
    let meta = store.get_meta(chat_id)?;
    let thinking = pending_thinking_change(&meta)
        .and_then(|value| resolve_pending_select(&meta, "thinking", Some(value.as_str())));
    let permission_mode = pending_permission_mode_change(&meta)
        .and_then(|value| resolve_pending_select(&meta, "permission_mode", Some(value.as_str())));
    let fast = pending_fast_change(&meta)
        .and_then(|value| resolve_pending_select(&meta, "fast", Some(value.as_str())));
    let model = change.and_then(|item| item.model.as_ref().map(|value| value.to.clone()));
    let mode = change.and_then(|item| item.mode.as_ref().map(|value| value.to.clone()));
    let mut outcome = ConfigWriteOutcome {
        failed_model: false,
        failed_mode: false,
        failed_thinking: false,
        failed_permission_mode: false,
        failed_fast: false,
    };
    if let Some(update) = config_write(
        &meta,
        "model",
        model,
        change
            .and_then(|item| item.model.as_ref())
            .and_then(|value| value.from.clone()),
    ) {
        if control.set_config(update).await.is_err() {
            outcome.failed_model = true;
        }
    }
    if let Some(update) = config_write(&meta, "thinking", thinking, meta.applied_thinking.clone()) {
        if control.set_config(update).await.is_err() {
            outcome.failed_thinking = true;
        }
    }
    if let Some(update) = config_write(
        &meta,
        "mode",
        mode,
        change
            .and_then(|item| item.mode.as_ref())
            .and_then(|value| value.from.clone()),
    ) {
        if control.set_config(update).await.is_err() {
            outcome.failed_mode = true;
        }
    }
    if let Some(update) = config_write(
        &meta,
        "permission_mode",
        permission_mode,
        meta.applied_permission_mode.clone(),
    ) {
        if control.set_config(update).await.is_err() {
            outcome.failed_permission_mode = true;
        }
    }
    if let Some(update) = config_write(&meta, "fast", fast, meta.applied_fast.clone()) {
        if control.set_config(update).await.is_err() {
            outcome.failed_fast = true;
        }
    }
    Ok(outcome)
}

pub(super) fn stamp_applied_session_config(store: &AgentChatStore, chat_id: &str) -> Result<()> {
    store.update_meta(chat_id, |meta| {
        meta.applied_model = meta.descriptor.current_config.model.clone();
        meta.applied_thinking = meta.descriptor.current_config.thinking.clone();
        meta.applied_mode = meta.descriptor.current_config.mode.clone();
        meta.applied_permission_mode = meta.descriptor.current_config.permission_mode.clone();
        meta.applied_fast = meta.descriptor.current_config.fast.clone();
    })?;
    Ok(())
}

pub(super) fn push_recent(
    recent_events: &std::sync::Mutex<HashMap<String, VecDeque<AgentChatEvent>>>,
    event: &AgentChatEvent,
) {
    if let Ok(mut map) = recent_events.lock() {
        let queue = map
            .entry(event.chat_id.clone())
            .or_insert_with(VecDeque::new);
        queue.push_back(event.clone());
        while queue.len() > RECENT_EVENT_CAP {
            queue.pop_front();
        }
    }
}

fn resolve_pending_select(
    meta: &AgentChatMeta,
    kind: &str,
    requested: Option<&str>,
) -> Option<String> {
    let requested = requested.map(str::trim).filter(|item| !item.is_empty())?;
    match resolve_session_config_select(meta, kind, requested) {
        ResolvedSessionConfig::Advertised { value, .. }
        | ResolvedSessionConfig::PassThrough(value) => Some(value),
        ResolvedSessionConfig::Invalid => None,
    }
}

fn config_write(
    meta: &AgentChatMeta,
    kind: &str,
    requested: Option<String>,
    previous: Option<String>,
) -> Option<AgentRuntimeConfigUpdate> {
    let requested = requested?;
    match resolve_session_config_select(meta, kind, &requested) {
        ResolvedSessionConfig::Advertised { config_id, value } => {
            let mut extra_config = HashMap::new();
            extra_config.insert(config_id, value);
            Some(AgentRuntimeConfigUpdate {
                extra_config,
                previous_model: if kind == "model" {
                    previous.clone()
                } else {
                    None
                },
                previous_thinking: if kind == "thinking" {
                    previous.clone()
                } else {
                    None
                },
                previous_mode: if kind == "mode" {
                    previous.clone()
                } else {
                    None
                },
                previous_permission_mode: if kind == "permission_mode" {
                    previous.clone()
                } else {
                    None
                },
                previous_fast: if kind == "fast" { previous } else { None },
                ..AgentRuntimeConfigUpdate::default()
            })
        }
        ResolvedSessionConfig::PassThrough(value) => {
            let mut update = AgentRuntimeConfigUpdate::default();
            match kind {
                "model" => {
                    update.model = Some(value);
                    update.previous_model = previous;
                }
                "thinking" => {
                    update.thinking = Some(value);
                    update.previous_thinking = previous;
                }
                "mode" => {
                    update.mode = Some(value);
                    update.previous_mode = previous;
                }
                "permission_mode" => {
                    update.permission_mode = Some(value);
                    update.previous_permission_mode = previous;
                }
                "fast" => {
                    update.fast = Some(value);
                    update.previous_fast = previous;
                }
                _ => return None,
            }
            Some(update)
        }
        ResolvedSessionConfig::Invalid => None,
    }
}

pub(super) fn nonempty_opt(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub(super) fn inject_session_op_commands(
    provider_id: &str,
    commands: &mut Vec<AgentAvailableCommand>,
) {
    if chat_provider_kind(provider_id) == ChatProviderKind::Acp {
        return;
    }
    let caps = agent::capabilities_for_provider(provider_id);
    if caps.fork == Capability::Supported {
        push_command_if_missing(commands, "fork", "Fork this session into a new chat");
    }
    if caps.rewind == Capability::Supported {
        push_command_if_missing(commands, "rewind", "Rewind this conversation");
    }
}

pub(super) fn seed_available_commands(
    provider_id: &str,
    commands: &mut Vec<AgentAvailableCommand>,
    catalog: Option<&agent::AgentOptionsSnapshot>,
) {
    if commands.is_empty() {
        if let Some(catalog) = catalog {
            *commands = catalog.commands.clone();
        }
    }
    inject_session_op_commands(provider_id, commands);
}

fn push_command_if_missing(
    commands: &mut Vec<AgentAvailableCommand>,
    name: &str,
    description: &str,
) {
    let needle = name.trim_start_matches('/');
    if commands
        .iter()
        .any(|command| command.name == name || command.name.trim_start_matches('/') == needle)
    {
        return;
    }
    commands.push(AgentAvailableCommand {
        name: name.to_string(),
        description: description.to_string(),
        hint: None,
    });
}

fn session_op_outcome_wire(outcome: &SessionOpOutcome) -> AgentChatSessionOpOutcome {
    match outcome {
        SessionOpOutcome::Applied => AgentChatSessionOpOutcome::Applied,
        SessionOpOutcome::Canceled => AgentChatSessionOpOutcome::Canceled,
        SessionOpOutcome::Failed { .. } => AgentChatSessionOpOutcome::Failed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::agent_chat::store::AgentChatStore;
    use crate::service::agent_chat::types::{
        AgentChatMeta, AgentChatOrigin, AgentChatPayload, CreateAgentChatRequest,
        SessionAdvertisedOption, SessionAdvertisedOptionValue,
    };
    use agent::{AgentEvent, AgentEventEnvelope};
    use chrono::{Duration, Utc};
    use std::collections::HashMap;
    use std::time::Instant;

    fn meta() -> AgentChatMeta {
        AgentChatMeta {
            id: "chat-1".into(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            deleted: false,
            title: None,
            cwd: "/tmp".into(),
            workspace_id: None,
            project_id: None,
            space_id: None,
            origin: AgentChatOrigin::Normal,
            provider_id: "claude".into(),
            last_message_at: None,
            last_event_seq: 0,
            persistence_handle: None,
            runtime_status: RuntimeStatus::RunningTurn,
            applied_model: None,
            applied_thinking: None,
            applied_mode: None,
            applied_permission_mode: None,
            applied_fast: None,
            available_commands: Vec::new(),
            session_usage: None,
            descriptor: crate::service::agent_chat::types::chat_descriptor(
                "claude",
                agent::AgentCurrentConfig::default(),
            ),
            parent_chat_id: None,
            rewind_view: None,
            pending_session_op: None,
        }
    }

    fn runtime() -> RuntimeState {
        RuntimeState {
            current_turn_id: Some("t1".into()),
            pending_permission: None,
            pending_session_op: None,
            assistant_text: HashMap::new(),
            thinking_text: HashMap::new(),
            last_snapshot: Instant::now(),
            last_activity: Instant::now(),
            turn_started_at: None,
            thinking_started_at: None,
            thinking_ms: 0,
            last_thinking_segment_ms: 0,
            turn_usage: None,
        }
    }

    fn snapshot_with_assistant() -> AgentChatSnapshot {
        AgentChatSnapshot {
            meta: meta(),
            messages: vec![FoldedMessage {
                id: "a1".into(),
                role: "assistant".into(),
                parts: vec![MessagePart::Thinking {
                    text: "hmm".into(),
                    tool_call_id: None,
                    duration_ms: None,
                }],
                created_at: Utc::now(),
                streaming: true,
                ..Default::default()
            }],
            queue: Vec::new(),
            pending_permission: None,
            pending_session_op: None,
            running_turn_id: Some("t1".into()),
            running_turn_started_at: None,
        }
    }

    #[test]
    fn overlay_projects_live_turn_and_thinking_durations() {
        let started = Utc::now() - Duration::seconds(14);
        let thinking_started = Utc::now() - Duration::seconds(3);
        let mut state = runtime();
        state.turn_started_at = Some(started);
        state.thinking_started_at = Some(thinking_started);
        state.thinking_ms = 4_000;
        state
            .thinking_text
            .insert("a1".into(), ("t1".into(), "hmm live".into()));
        let mut snapshot = snapshot_with_assistant();
        overlay_live_state(&mut snapshot, &state);
        assert_eq!(snapshot.running_turn_started_at, Some(started));
        let assistant = &snapshot.messages[0];
        assert!(assistant.streaming);
        let worked = assistant.worked_ms.expect("worked_ms");
        assert!((14_000..16_000).contains(&worked), "worked_ms={worked}");
        let thinking = assistant.thinking_ms.expect("thinking_ms");
        assert!(thinking >= 7_000, "thinking_ms={thinking}");
        match &assistant.parts[0] {
            MessagePart::Thinking {
                text, duration_ms, ..
            } => {
                assert_eq!(text, "hmm live");
                let duration = duration_ms.expect("open thinking duration");
                assert!(
                    (3_000..5_000).contains(&duration),
                    "open thinking duration={duration}"
                );
            }
            other => panic!("expected thinking part, got {other:?}"),
        }
    }

    #[test]
    fn overlay_does_not_overwrite_completed_thinking_blocks() {
        let mut snapshot = snapshot_with_assistant();
        snapshot.messages[0].parts = vec![
            MessagePart::Thinking {
                text: "first".into(),
                tool_call_id: None,
                duration_ms: Some(5_000),
            },
            MessagePart::Thinking {
                text: "second".into(),
                tool_call_id: None,
                duration_ms: None,
            },
        ];
        let mut state = runtime();
        state
            .thinking_text
            .insert("a1".into(), ("t1".into(), "second live".into()));
        overlay_live_state(&mut snapshot, &state);
        match &snapshot.messages[0].parts[..] {
            [MessagePart::Thinking {
                text: first,
                duration_ms: Some(5_000),
                ..
            }, MessagePart::Thinking {
                text: second,
                duration_ms: None,
                ..
            }] => {
                assert_eq!(first, "first");
                assert_eq!(second, "second live");
            }
            other => panic!("unexpected parts: {other:?}"),
        }
    }

    #[test]
    fn selected_session_config_reads_camel_case_model() {
        let config = serde_json::json!([
            { "id": "model", "currentValue": "grok-4" },
            { "id": "mode", "current_value": "agent" },
            { "id": "thought_level", "currentValue": "high" }
        ]);
        assert_eq!(
            selected_session_config(&config),
            (
                Some("grok-4".into()),
                Some("high".into()),
                Some("agent".into()),
                None,
                None
            )
        );
        let permission = serde_json::json!([
            { "id": "permissionMode", "currentValue": "plan" }
        ]);
        assert_eq!(
            selected_session_config(&permission),
            (None, None, None, Some("plan".into()), None)
        );
        let current = serde_json::json!({ "permission_mode": "auto", "model": "opus" });
        assert_eq!(
            selected_session_config(&current),
            (Some("opus".into()), None, None, Some("auto".into()), None)
        );
    }

    #[test]
    fn selected_session_config_prefers_effort_over_boolean_thinking() {
        let config = serde_json::json!([
            { "id": "thinking", "type": "boolean", "currentValue": "false" },
            { "id": "effort", "type": "select", "currentValue": "xhigh" },
            { "id": "model", "currentValue": "gpt-5.3-codex" }
        ]);
        assert_eq!(
            selected_session_config(&config),
            (
                Some("gpt-5.3-codex".into()),
                Some("xhigh".into()),
                None,
                None,
                None
            )
        );
    }

    #[test]
    fn config_changed_stamps_effort_on_current_model_only() {
        let mut row = meta();
        row.provider_id = "cursor".into();
        row.descriptor = crate::service::agent_chat::types::chat_descriptor(
            "cursor",
            agent::AgentCurrentConfig::default(),
        );
        let advertised = vec![
            SessionAdvertisedOption {
                id: "model".into(),
                name: Some("Model".into()),
                category: None,
                option_type: "select".into(),
                current_value: Some("claude-opus-5".into()),
                options: vec![
                    SessionAdvertisedOptionValue {
                        value: "claude-opus-5".into(),
                        name: Some("Claude Opus 5".into()),
                    },
                    SessionAdvertisedOptionValue {
                        value: "composer-2.5".into(),
                        name: Some("Composer 2.5".into()),
                    },
                ],
            },
            SessionAdvertisedOption {
                id: "effort".into(),
                name: Some("Effort".into()),
                category: None,
                option_type: "select".into(),
                current_value: Some("high".into()),
                options: vec![
                    SessionAdvertisedOptionValue {
                        value: "low".into(),
                        name: Some("Low".into()),
                    },
                    SessionAdvertisedOptionValue {
                        value: "high".into(),
                        name: Some("High".into()),
                    },
                    SessionAdvertisedOptionValue {
                        value: "max".into(),
                        name: Some("Max".into()),
                    },
                ],
            },
        ];
        apply_config_changed(
            &mut row,
            advertised,
            Some(&"claude-opus-5".into()),
            Some(&"high".into()),
            None,
            None,
            None,
        );
        let opus = row
            .descriptor
            .supported_options
            .models
            .iter()
            .find(|model| model.id == "claude-opus-5")
            .expect("opus");
        match &opus.thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "high", "max"]);
            }
            other => panic!("expected opus effort, got {other:?}"),
        }
        let composer = row
            .descriptor
            .supported_options
            .models
            .iter()
            .find(|model| model.id == "composer-2.5")
            .expect("composer");
        assert!(composer.thinking.is_none());

        // Simulate a host-driven model switch (current already moved to composer).
        row.descriptor.current_config.model = Some("composer-2.5".into());
        row.applied_model = Some("composer-2.5".into());
        apply_config_changed(
            &mut row,
            vec![
                SessionAdvertisedOption {
                    id: "model".into(),
                    name: Some("Model".into()),
                    category: None,
                    option_type: "select".into(),
                    current_value: Some("composer-2.5".into()),
                    options: vec![
                        SessionAdvertisedOptionValue {
                            value: "claude-opus-5".into(),
                            name: Some("Claude Opus 5".into()),
                        },
                        SessionAdvertisedOptionValue {
                            value: "composer-2.5".into(),
                            name: Some("Composer 2.5".into()),
                        },
                    ],
                },
                SessionAdvertisedOption {
                    id: "fast".into(),
                    name: Some("Fast".into()),
                    category: None,
                    option_type: "boolean".into(),
                    current_value: Some("false".into()),
                    options: vec![],
                },
            ],
            Some(&"composer-2.5".into()),
            None,
            None,
            None,
            Some(&"false".into()),
        );
        assert!(row.descriptor.supported_options.thinking.is_none());
        let composer = row
            .descriptor
            .supported_options
            .models
            .iter()
            .find(|model| model.id == "composer-2.5")
            .expect("composer");
        assert!(matches!(
            composer.thinking,
            Some(AgentThinkingSupport::None)
        ));
        let opus = row
            .descriptor
            .supported_options
            .models
            .iter()
            .find(|model| model.id == "claude-opus-5")
            .expect("opus");
        match &opus.thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "high", "max"]);
            }
            other => panic!("expected preserved opus effort, got {other:?}"),
        }
    }

    #[test]
    fn inject_session_op_commands_stores_names_without_slash() {
        let mut commands = vec![agent::AgentAvailableCommand {
            name: "/fork".into(),
            description: "old".into(),
            hint: None,
        }];
        inject_session_op_commands("claude", &mut commands);
        assert_eq!(commands.len(), 2);
        assert_eq!(commands[0].name, "/fork");
        assert_eq!(commands[1].name, "rewind");
        let mut seeded = Vec::new();
        seed_available_commands("opencode", &mut seeded, None);
        assert_eq!(
            seeded
                .iter()
                .map(|command| command.name.as_str())
                .collect::<Vec<_>>(),
            ["fork", "rewind"]
        );
        let mut pi = Vec::new();
        seed_available_commands("pi", &mut pi, None);
        assert_eq!(
            pi.iter()
                .map(|command| command.name.as_str())
                .collect::<Vec<_>>(),
            ["fork"]
        );
    }

    #[test]
    fn selected_session_config_ignores_empty_and_unknown() {
        let config = serde_json::json!([
            { "id": "model", "currentValue": "  " },
            { "id": "fast-mode", "currentValue": "true" }
        ]);
        assert_eq!(
            selected_session_config(&config),
            (None, None, None, None, Some("true".into()))
        );
    }

    #[tokio::test]
    async fn config_changed_persists_model_without_clearing_mode() {
        let dir = tempfile::tempdir().unwrap();
        let store = AgentChatStore::new(dir.path().join("chats"));
        let meta = store
            .create(CreateAgentChatRequest {
                workspace_id: None,
                project_id: None,
                space_id: None,
                cwd: "/tmp".into(),
                origin: AgentChatOrigin::Normal,
                provider_id: "claude".into(),
                model: None,
                thinking: None,
                mode: Some("plan".into()),
                title: None,
            })
            .unwrap();
        let (tx, mut rx) = broadcast::channel(8);
        let recent = std::sync::Mutex::new(HashMap::new());
        let state = Mutex::new(runtime());
        apply_event(
            &meta.id,
            AgentEventEnvelope::new(
                None,
                AgentEvent::ConfigChanged {
                    config: serde_json::json!([{ "id": "model", "currentValue": "opus" }]),
                },
            ),
            &store,
            &state,
            &tx,
            &recent,
        )
        .await
        .unwrap();
        let updated = store.get_meta(&meta.id).unwrap();
        assert_eq!(
            updated.descriptor.current_config.model.as_deref(),
            Some("opus")
        );
        assert_eq!(
            updated.descriptor.current_config.mode.as_deref(),
            Some("plan")
        );
        let event = rx.try_recv().expect("config_updated event");
        match event.payload {
            AgentChatPayload::ConfigUpdated { descriptor } => {
                assert_eq!(descriptor.current_config.model.as_deref(), Some("opus"));
                assert_eq!(descriptor.current_config.mode.as_deref(), Some("plan"));
            }
            other => panic!("unexpected payload: {other:?}"),
        }
    }

    #[tokio::test]
    async fn config_changed_keeps_pending_model_when_still_advertised() {
        let dir = tempfile::tempdir().unwrap();
        let store = AgentChatStore::new(dir.path().join("chats"));
        let meta = store
            .create(CreateAgentChatRequest {
                workspace_id: None,
                project_id: None,
                space_id: None,
                cwd: "/tmp".into(),
                origin: AgentChatOrigin::Normal,
                provider_id: "claude".into(),
                model: Some("opus".into()),
                thinking: None,
                mode: None,
                title: None,
            })
            .unwrap();
        store
            .update_meta(&meta.id, |row| {
                row.applied_model = Some("opus".into());
                row.descriptor.current_config.model = Some("grok-4".into());
            })
            .unwrap();
        let (tx, mut rx) = broadcast::channel(8);
        let recent = std::sync::Mutex::new(HashMap::new());
        let state = Mutex::new(runtime());
        apply_event(
            &meta.id,
            AgentEventEnvelope::new(
                None,
                AgentEvent::ConfigChanged {
                    config: serde_json::json!([{
                        "id": "model",
                        "category": "model",
                        "type": "select",
                        "currentValue": "opus",
                        "options": [
                            { "value": "opus", "name": "Opus" },
                            { "value": "grok-4", "name": "Grok" }
                        ]
                    }]),
                },
            ),
            &store,
            &state,
            &tx,
            &recent,
        )
        .await
        .unwrap();
        let updated = store.get_meta(&meta.id).unwrap();
        assert_eq!(
            updated.descriptor.current_config.model.as_deref(),
            Some("grok-4")
        );
        assert_eq!(updated.applied_model.as_deref(), Some("opus"));
        let mut saw_failed = false;
        while let Ok(event) = rx.try_recv() {
            if matches!(
                event.payload,
                AgentChatPayload::SessionHint { ref kind, .. } if kind == "model_switch_failed"
            ) {
                saw_failed = true;
            }
        }
        assert!(
            !saw_failed,
            "resume advertisements should not hint a failed switch"
        );
    }

    #[tokio::test]
    async fn config_changed_preserves_create_time_model_when_host_differs() {
        let dir = tempfile::tempdir().unwrap();
        let store = AgentChatStore::new(dir.path().join("chats"));
        let meta = store
            .create(CreateAgentChatRequest {
                workspace_id: None,
                project_id: None,
                space_id: None,
                cwd: "/tmp".into(),
                origin: AgentChatOrigin::Normal,
                provider_id: "grok".into(),
                model: Some("grok-composer-2.5-fast".into()),
                thinking: None,
                mode: None,
                title: None,
            })
            .unwrap();
        let (tx, _rx) = broadcast::channel(8);
        let recent = std::sync::Mutex::new(HashMap::new());
        let state = Mutex::new(runtime());
        apply_event(
            &meta.id,
            AgentEventEnvelope::new(
                None,
                AgentEvent::ConfigChanged {
                    config: serde_json::json!([{
                        "id": "model",
                        "category": "model",
                        "type": "select",
                        "currentValue": "gemini-3.5-flash",
                        "options": [
                            { "value": "gemini-3.5-flash", "name": "Gemini 3.5 Flash" },
                            { "value": "grok-composer-2.5-fast", "name": "Composer 2.5 Fast" }
                        ]
                    }]),
                },
            ),
            &store,
            &state,
            &tx,
            &recent,
        )
        .await
        .unwrap();
        let updated = store.get_meta(&meta.id).unwrap();
        assert_eq!(
            updated.descriptor.current_config.model.as_deref(),
            Some("grok-composer-2.5-fast")
        );
        assert_eq!(updated.applied_model.as_deref(), Some("gemini-3.5-flash"));
        assert!(
            pending_session_config_change(&updated).is_some_and(|change| {
                change
                    .model
                    .as_ref()
                    .is_some_and(|item| item.to == "grok-composer-2.5-fast")
            })
        );
    }

    #[tokio::test]
    async fn config_changed_maps_cursor_cli_model_to_acp_bracket() {
        let dir = tempfile::tempdir().unwrap();
        let store = AgentChatStore::new(dir.path().join("chats"));
        let meta = store
            .create(CreateAgentChatRequest {
                workspace_id: None,
                project_id: None,
                space_id: None,
                cwd: "/tmp".into(),
                origin: AgentChatOrigin::Normal,
                provider_id: "cursor".into(),
                model: Some("gpt-5.3-codex-fast".into()),
                thinking: None,
                mode: None,
                title: None,
            })
            .unwrap();
        let (tx, _rx) = broadcast::channel(8);
        let recent = std::sync::Mutex::new(HashMap::new());
        let state = Mutex::new(runtime());
        apply_event(
            &meta.id,
            AgentEventEnvelope::new(
                None,
                AgentEvent::ConfigChanged {
                    config: serde_json::json!([{
                        "id": "model",
                        "category": "model",
                        "type": "select",
                        "currentValue": "gemini-3.5-flash[]",
                        "options": [
                            { "value": "gemini-3.5-flash[]", "name": "gemini-3.5-flash" },
                            {
                                "value": "gpt-5.3-codex[reasoning=medium,fast=false]",
                                "name": "gpt-5.3-codex"
                            },
                            { "value": "composer-2.5[fast=true]", "name": "composer-2.5" }
                        ]
                    }]),
                },
            ),
            &store,
            &state,
            &tx,
            &recent,
        )
        .await
        .unwrap();
        let updated = store.get_meta(&meta.id).unwrap();
        assert_eq!(
            updated.descriptor.current_config.model.as_deref(),
            Some("gpt-5.3-codex[reasoning=medium,fast=false]")
        );
        assert_eq!(updated.applied_model.as_deref(), Some("gemini-3.5-flash[]"));
        assert!(updated
            .descriptor
            .supported_options
            .models
            .iter()
            .any(|model| model.id == "gpt-5.3-codex[reasoning=medium,fast=false]"));
        assert!(
            pending_session_config_change(&updated).is_some_and(|change| {
                change
                    .model
                    .as_ref()
                    .is_some_and(|item| item.to == "gpt-5.3-codex[reasoning=medium,fast=false]")
            })
        );
    }

    #[tokio::test]
    async fn config_changed_drops_pending_model_not_in_advertised_options() {
        let dir = tempfile::tempdir().unwrap();
        let store = AgentChatStore::new(dir.path().join("chats"));
        let meta = store
            .create(CreateAgentChatRequest {
                workspace_id: None,
                project_id: None,
                space_id: None,
                cwd: "/tmp".into(),
                origin: AgentChatOrigin::Normal,
                provider_id: "claude".into(),
                model: Some("opus".into()),
                thinking: None,
                mode: None,
                title: None,
            })
            .unwrap();
        store
            .update_meta(&meta.id, |row| {
                row.applied_model = Some("opus".into());
                row.descriptor.current_config.model = Some("grok-4".into());
            })
            .unwrap();
        let (tx, _rx) = broadcast::channel(8);
        let recent = std::sync::Mutex::new(HashMap::new());
        let state = Mutex::new(runtime());
        apply_event(
            &meta.id,
            AgentEventEnvelope::new(
                None,
                AgentEvent::ConfigChanged {
                    config: serde_json::json!([{
                        "id": "model",
                        "category": "model",
                        "type": "select",
                        "currentValue": "opus",
                        "options": [{ "value": "opus", "name": "Opus" }]
                    }]),
                },
            ),
            &store,
            &state,
            &tx,
            &recent,
        )
        .await
        .unwrap();
        let updated = store.get_meta(&meta.id).unwrap();
        assert_eq!(
            updated.descriptor.current_config.model.as_deref(),
            Some("opus")
        );
        assert_eq!(updated.applied_model.as_deref(), Some("opus"));
    }
}
