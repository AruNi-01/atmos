use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};

use agent::{AgentEvent, TurnStop};
use chrono::Utc;
use tokio::sync::{broadcast, Mutex};

use crate::error::Result;

use super::store::ConversationStore;
use super::types::{
    ConversationClientEvent, ConversationClientPayload, PendingPermission, RuntimeStatus,
    TranscriptRecord, TurnStatus,
};

pub(super) const ASSISTANT_SNAPSHOT_INTERVAL: Duration = Duration::from_millis(100);
pub(super) const RECENT_EVENT_CAP: usize = 2048;

pub(super) struct RuntimeState {
    pub(super) current_turn_id: Option<String>,
    pub(super) pending_permission: Option<PendingPermission>,
    pub(super) assistant_text: HashMap<String, (String, String)>,
    pub(super) thinking_text: HashMap<String, (String, String)>,
    pub(super) last_snapshot: Instant,
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn apply_event(
    conversation_id: &str,
    event: AgentEvent,
    store: &ConversationStore,
    state: &Mutex<RuntimeState>,
    events: &broadcast::Sender<ConversationClientEvent>,
    recent_events: &std::sync::Mutex<HashMap<String, VecDeque<ConversationClientEvent>>>,
) -> Result<()> {
    let emit = |payload: ConversationClientPayload| -> Result<()> {
        emit_live(conversation_id, payload, store, events, recent_events)
    };
    match event {
        AgentEvent::SessionStarted { persistence_handle } => {
            store.update_meta(conversation_id, |meta| {
                if let Some(handle) = persistence_handle.clone() {
                    if meta.id == handle {
                        tracing::warn!(
                            "refusing to store persistence handle equal to conversation id"
                        );
                    } else {
                        meta.persistence_handle = Some(handle);
                    }
                }
                if meta.runtime_status == RuntimeStatus::Starting {
                    meta.runtime_status = RuntimeStatus::Ready;
                }
            })?;
            emit(ConversationClientPayload::RuntimeStatus {
                status: RuntimeStatus::Ready,
                persistence_handle,
            })?;
        }
        AgentEvent::AssistantMessageDelta { message_id, delta } => {
            {
                let snapshot = {
                    let mut state = state.lock().await;
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
                        conversation_id,
                        &TranscriptRecord::AssistantSnapshot {
                            turn_id,
                            message_id: message_id.clone(),
                            text,
                            created_at: Utc::now(),
                        },
                    )?;
                }
            }
            emit(ConversationClientPayload::AssistantMessageDelta { message_id, delta })?;
        }
        AgentEvent::AssistantMessageCompleted { message_id } => {
            if let Some((turn_id, text)) = state.lock().await.assistant_text.remove(&message_id) {
                store.append_record(
                    conversation_id,
                    &TranscriptRecord::AssistantSnapshot {
                        turn_id,
                        message_id: message_id.clone(),
                        text,
                        created_at: Utc::now(),
                    },
                )?;
            }
            emit(ConversationClientPayload::AssistantMessageCompleted { message_id })?;
        }
        AgentEvent::ThinkingDelta { message_id, delta } => {
            {
                let mut state = state.lock().await;
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
            emit(ConversationClientPayload::ThinkingDelta { message_id, delta })?;
        }
        AgentEvent::ThinkingCompleted { message_id } => {
            if let Some((turn_id, text)) = state.lock().await.thinking_text.remove(&message_id) {
                store.append_record(
                    conversation_id,
                    &TranscriptRecord::ThinkingSnapshot {
                        turn_id,
                        message_id: message_id.clone(),
                        text,
                        created_at: Utc::now(),
                    },
                )?;
            }
            emit(ConversationClientPayload::ThinkingCompleted { message_id })?;
        }
        AgentEvent::ToolCallStarted { tool_call } => {
            persist_tool(store, state, conversation_id, tool_call.clone()).await?;
            emit(ConversationClientPayload::ToolCallStarted { tool_call })?;
        }
        AgentEvent::ToolCallUpdated { tool_call } => {
            persist_tool(store, state, conversation_id, tool_call.clone()).await?;
            emit(ConversationClientPayload::ToolCallUpdated { tool_call })?;
        }
        AgentEvent::ToolCallCompleted { tool_call } => {
            persist_tool(store, state, conversation_id, tool_call.clone()).await?;
            emit(ConversationClientPayload::ToolCallCompleted { tool_call })?;
        }
        AgentEvent::ToolCallFailed { tool_call, error } => {
            persist_tool(store, state, conversation_id, tool_call.clone()).await?;
            emit(ConversationClientPayload::ToolCallFailed { tool_call, error })?;
        }
        AgentEvent::PlanUpdated { plan } => {
            let turn_id = state
                .lock()
                .await
                .current_turn_id
                .clone()
                .unwrap_or_else(|| "unknown".into());
            store.append_record(
                conversation_id,
                &TranscriptRecord::Plan {
                    turn_id,
                    plan: plan.clone(),
                    created_at: Utc::now(),
                },
            )?;
            emit(ConversationClientPayload::PlanUpdated { plan })?;
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
                conversation_id,
                &TranscriptRecord::Permission {
                    turn_id,
                    request: pending.clone(),
                    created_at: Utc::now(),
                },
            )?;
            store.update_meta(conversation_id, |meta| {
                meta.runtime_status = RuntimeStatus::WaitingPermission;
            })?;
            emit(ConversationClientPayload::PermissionRequested { request: pending })?;
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
                conversation_id,
                &TranscriptRecord::Permission {
                    turn_id,
                    request: resolved,
                    created_at: Utc::now(),
                },
            )?;
            emit(ConversationClientPayload::PermissionResolved {
                request_id,
                option_id,
            })?;
        }
        AgentEvent::TurnCompleted { turn_id, stop } => {
            finish_turn(
                conversation_id,
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
                conversation_id,
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
                conversation_id,
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
            store.update_meta(conversation_id, |meta| {
                meta.runtime_status = RuntimeStatus::Closed;
            })?;
            state.lock().await.pending_permission = None;
        }
        AgentEvent::TurnStarted { .. } | AgentEvent::UserMessage { .. } => {}
        AgentEvent::UsageUpdated { .. } | AgentEvent::ConfigChanged { .. } => {}
    }
    Ok(())
}

async fn persist_tool(
    store: &ConversationStore,
    state: &Mutex<RuntimeState>,
    conversation_id: &str,
    tool_call: agent::AgentToolCall,
) -> Result<()> {
    let turn_id = state
        .lock()
        .await
        .current_turn_id
        .clone()
        .unwrap_or_else(|| "unknown".into());
    store.append_record(
        conversation_id,
        &TranscriptRecord::ToolCall {
            turn_id,
            tool_call,
            created_at: Utc::now(),
        },
    )
}

pub(super) async fn finish_turn(
    conversation_id: &str,
    turn_id: String,
    status: TurnStatus,
    error: Option<String>,
    store: &ConversationStore,
    state: &Mutex<RuntimeState>,
    emit: &impl Fn(ConversationClientPayload) -> Result<()>,
) -> Result<()> {
    state.lock().await.current_turn_id = None;
    store.append_record(
        conversation_id,
        &TranscriptRecord::TurnCompleted {
            turn_id: turn_id.clone(),
            status,
            error,
            created_at: Utc::now(),
        },
    )?;
    store.update_meta(conversation_id, |meta| {
        meta.runtime_status = RuntimeStatus::Ready;
    })?;
    emit(ConversationClientPayload::TurnCompleted { turn_id, status })
}

pub(super) fn emit_live(
    conversation_id: &str,
    payload: ConversationClientPayload,
    store: &ConversationStore,
    events: &broadcast::Sender<ConversationClientEvent>,
    recent_events: &std::sync::Mutex<HashMap<String, VecDeque<ConversationClientEvent>>>,
) -> Result<()> {
    let sequence = store.next_seq(conversation_id)?;
    let event = ConversationClientEvent {
        conversation_id: conversation_id.to_string(),
        event_id: uuid::Uuid::new_v4().to_string(),
        sequence,
        payload,
    };
    push_recent(recent_events, &event);
    let _ = events.send(event);
    Ok(())
}

pub(super) fn push_recent(
    recent_events: &std::sync::Mutex<HashMap<String, VecDeque<ConversationClientEvent>>>,
    event: &ConversationClientEvent,
) {
    if let Ok(mut map) = recent_events.lock() {
        let queue = map
            .entry(event.conversation_id.clone())
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
