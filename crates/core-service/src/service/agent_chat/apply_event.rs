//! Apply inbound `AgentEvent`s onto `transcript.jsonl` and live `AgentChatEvent`s.
//! This is the chat ingest path — not Atmos Project.

use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};

use agent::{AgentEvent, TurnStop};
use chrono::Utc;
use tokio::sync::{broadcast, Mutex};

use crate::error::Result;

use super::store::AgentChatStore;
use super::types::{
    parse_session_usage, parse_turn_usage, AgentChatEvent, AgentChatPayload, PendingPermission,
    RuntimeStatus, TranscriptRecord, TurnStatus,
};

pub(super) const ASSISTANT_SNAPSHOT_INTERVAL: Duration = Duration::from_millis(100);
pub(super) const RECENT_EVENT_CAP: usize = 2048;

pub(super) struct RuntimeState {
    pub(super) current_turn_id: Option<String>,
    pub(super) pending_permission: Option<PendingPermission>,
    pub(super) assistant_text: HashMap<String, (String, String)>,
    pub(super) thinking_text: HashMap<String, (String, String)>,
    pub(super) last_snapshot: Instant,
    pub(super) last_activity: Instant,
    pub(super) turn_started_at: Option<chrono::DateTime<Utc>>,
    pub(super) thinking_started_at: Option<chrono::DateTime<Utc>>,
    pub(super) thinking_ms: u64,
    pub(super) turn_usage: Option<super::types::TurnUsage>,
}

impl RuntimeState {
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

    fn close_thinking(&mut self) {
        if let Some(start) = self.thinking_started_at.take() {
            self.thinking_ms +=
                u64::try_from((Utc::now() - start).num_milliseconds().max(0)).unwrap_or(0);
        }
    }

    fn finish_timing(&mut self) -> (u64, u64) {
        self.close_thinking();
        let worked_ms = self
            .turn_started_at
            .take()
            .map(|start| u64::try_from((Utc::now() - start).num_milliseconds().max(0)).unwrap_or(0))
            .unwrap_or(0);
        let thinking_ms = self.thinking_ms;
        self.thinking_ms = 0;
        (worked_ms, thinking_ms)
    }
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn apply_event(
    chat_id: &str,
    event: AgentEvent,
    store: &AgentChatStore,
    state: &Mutex<RuntimeState>,
    events: &broadcast::Sender<AgentChatEvent>,
    recent_events: &std::sync::Mutex<HashMap<String, VecDeque<AgentChatEvent>>>,
) -> Result<()> {
    let emit = |payload: AgentChatPayload| -> Result<()> {
        emit_live(chat_id, payload, store, events, recent_events)
    };
    {
        let mut state = state.lock().await;
        state.last_activity = Instant::now();
        state.ensure_turn_clock();
    }
    match event {
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
            })?;
            emit(AgentChatPayload::RuntimeStatus {
                status: RuntimeStatus::Ready,
                persistence_handle,
            })?;
        }
        AgentEvent::AssistantMessageDelta { message_id, delta } => {
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
                        &TranscriptRecord::AssistantSnapshot {
                            turn_id,
                            message_id: message_id.clone(),
                            text,
                            created_at: Utc::now(),
                        },
                    )?;
                }
            }
            emit(AgentChatPayload::AssistantMessageDelta { message_id, delta })?;
        }
        AgentEvent::AssistantMessageCompleted { message_id } => {
            if let Some((turn_id, text)) = state.lock().await.assistant_text.remove(&message_id) {
                store.append_record(
                    chat_id,
                    &TranscriptRecord::AssistantSnapshot {
                        turn_id,
                        message_id: message_id.clone(),
                        text,
                        created_at: Utc::now(),
                    },
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
                let started_at = state.thinking_started_at;
                let duration_ms = started_at.map(|start| {
                    u64::try_from((Utc::now() - start).num_milliseconds().max(0)).unwrap_or(0)
                });
                state
                    .thinking_text
                    .remove(&message_id)
                    .map(|(turn_id, text)| (turn_id, text, started_at, duration_ms))
            };
            let thinking_ms = snapshot.as_ref().and_then(|item| item.3);
            if let Some((turn_id, text, started_at, duration_ms)) = snapshot {
                store.append_record(
                    chat_id,
                    &TranscriptRecord::ThinkingSnapshot {
                        turn_id,
                        message_id: message_id.clone(),
                        text,
                        started_at,
                        duration_ms,
                        created_at: Utc::now(),
                    },
                )?;
            }
            emit(AgentChatPayload::ThinkingCompleted {
                message_id,
                thinking_ms,
            })?;
        }
        AgentEvent::ToolCallStarted { tool_call } => {
            persist_tool(store, state, chat_id, tool_call.clone()).await?;
            emit(AgentChatPayload::ToolCallStarted { tool_call })?;
        }
        AgentEvent::ToolCallUpdated { tool_call } => {
            persist_tool(store, state, chat_id, tool_call.clone()).await?;
            emit(AgentChatPayload::ToolCallUpdated { tool_call })?;
        }
        AgentEvent::ToolCallCompleted { tool_call } => {
            persist_tool(store, state, chat_id, tool_call.clone()).await?;
            emit(AgentChatPayload::ToolCallCompleted { tool_call })?;
        }
        AgentEvent::ToolCallFailed { tool_call, error } => {
            persist_tool(store, state, chat_id, tool_call.clone()).await?;
            emit(AgentChatPayload::ToolCallFailed { tool_call, error })?;
        }
        AgentEvent::PlanUpdated { plan } => {
            let turn_id = state
                .lock()
                .await
                .current_turn_id
                .clone()
                .unwrap_or_else(|| "unknown".into());
            store.append_record(
                chat_id,
                &TranscriptRecord::Plan {
                    turn_id,
                    plan: plan.clone(),
                    created_at: Utc::now(),
                },
            )?;
            emit(AgentChatPayload::PlanUpdated { plan })?;
        }
        AgentEvent::PermissionRequested { request } => {
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
                status: "pending".into(),
            };
            state.lock().await.pending_permission = Some(pending.clone());
            store.append_record(
                chat_id,
                &TranscriptRecord::Permission {
                    turn_id,
                    request: pending.clone(),
                    created_at: Utc::now(),
                },
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
                    status: "resolved".into(),
                },
            );
            resolved.status = "resolved".into();
            state.lock().await.pending_permission = None;
            store.append_record(
                chat_id,
                &TranscriptRecord::Permission {
                    turn_id,
                    request: resolved,
                    created_at: Utc::now(),
                },
            )?;
            emit(AgentChatPayload::PermissionResolved {
                request_id,
                option_id,
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
            )
            .await?;
        }
        AgentEvent::SessionClosed => {
            store.update_meta(chat_id, |meta| {
                meta.runtime_status = RuntimeStatus::Closed;
            })?;
            state.lock().await.pending_permission = None;
        }
        AgentEvent::SessionTitleUpdated { title } => {
            store.update_meta(chat_id, |meta| {
                meta.title = Some(title.clone());
            })?;
            emit(AgentChatPayload::TitleUpdated { title: Some(title) })?;
        }
        AgentEvent::AvailableCommandsUpdated { commands } => {
            store.update_meta(chat_id, |meta| {
                meta.available_commands = commands.clone();
            })?;
            emit(AgentChatPayload::AvailableCommandsUpdated { commands })?;
        }
        AgentEvent::TurnStarted { .. } | AgentEvent::UserMessage { .. } => {}
        AgentEvent::UsageUpdated { usage } => {
            let session = parse_session_usage(&usage);
            let turn = parse_turn_usage(&usage);
            if let Some(session) = session.clone() {
                store.update_meta(chat_id, |meta| {
                    meta.session_usage = Some(session);
                })?;
            }
            if let Some(turn) = turn.clone() {
                let mut state = state.lock().await;
                state.turn_usage = Some(turn.clone());
                let turn_id = state.current_turn_id.clone();
                drop(state);
                store.append_record(
                    chat_id,
                    &TranscriptRecord::Usage {
                        turn_id,
                        usage: serde_json::to_value(&turn).unwrap_or(usage.clone()),
                        created_at: Utc::now(),
                    },
                )?;
            }
            emit(AgentChatPayload::UsageUpdated { session, turn })?;
        }
        AgentEvent::ConfigChanged { .. } => {}
    }
    Ok(())
}

async fn persist_tool(
    store: &AgentChatStore,
    state: &Mutex<RuntimeState>,
    chat_id: &str,
    tool_call: agent::AgentToolCall,
) -> Result<()> {
    {
        let mut state = state.lock().await;
        if matches!(
            agent::classify_tool(
                &tool_call.name,
                tool_call.title.as_deref(),
                tool_call.input.as_ref(),
            ),
            agent::ClassifiedTool::Thinking
        ) {
            state.mark_thinking();
        } else {
            state.close_thinking();
        }
    }
    let turn_id = state
        .lock()
        .await
        .current_turn_id
        .clone()
        .unwrap_or_else(|| "unknown".into());
    store.append_record(
        chat_id,
        &TranscriptRecord::ToolCall {
            turn_id,
            tool_call,
            created_at: Utc::now(),
        },
    )
}

pub(super) async fn finish_turn(
    chat_id: &str,
    turn_id: String,
    status: TurnStatus,
    error: Option<String>,
    store: &AgentChatStore,
    state: &Mutex<RuntimeState>,
    emit: &impl Fn(AgentChatPayload) -> Result<()>,
) -> Result<()> {
    let (assistant, thinking, worked_ms, thinking_ms, usage, completed_at) = {
        let mut state = state.lock().await;
        if state.current_turn_id.as_deref() == Some(turn_id.as_str()) {
            state.current_turn_id = None;
        }
        let (worked_ms, thinking_ms) = state.finish_timing();
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
            usage,
            completed_at,
        )
    };
    for (message_id, (snap_turn, text)) in assistant {
        store.append_record(
            chat_id,
            &TranscriptRecord::AssistantSnapshot {
                turn_id: snap_turn,
                message_id,
                text,
                created_at: Utc::now(),
            },
        )?;
    }
    for (message_id, (snap_turn, text)) in thinking {
        store.append_record(
            chat_id,
            &TranscriptRecord::ThinkingSnapshot {
                turn_id: snap_turn,
                message_id,
                text,
                started_at: None,
                duration_ms: Some(thinking_ms),
                created_at: Utc::now(),
            },
        )?;
    }
    store.append_record(
        chat_id,
        &TranscriptRecord::TurnCompleted {
            turn_id: turn_id.clone(),
            status,
            error,
            worked_ms: Some(worked_ms),
            thinking_ms: Some(thinking_ms),
            usage: usage.clone(),
            created_at: completed_at,
        },
    )?;
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
    })
}

pub(super) fn emit_live(
    chat_id: &str,
    payload: AgentChatPayload,
    store: &AgentChatStore,
    events: &broadcast::Sender<AgentChatEvent>,
    recent_events: &std::sync::Mutex<HashMap<String, VecDeque<AgentChatEvent>>>,
) -> Result<()> {
    let sequence = store.next_seq(chat_id)?;
    let persist = !matches!(
        payload,
        AgentChatPayload::AssistantMessageDelta { .. } | AgentChatPayload::ThinkingDelta { .. }
    );
    let event = AgentChatEvent {
        chat_id: chat_id.to_string(),
        event_id: uuid::Uuid::new_v4().to_string(),
        sequence,
        payload,
    };
    push_recent(recent_events, &event);
    let _ = events.send(event);
    if persist {
        store.persist_seq(chat_id)?;
    }
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

pub(super) fn nonempty_opt(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}
