use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

use agent::{AgentPrompt, AgentRuntimeControl, UserMessageKind};
use chrono::Utc;
use tokio::sync::{broadcast, Mutex};

use crate::error::{Result, ServiceError};

use super::apply_event::{apply_pending_session_config, emit_live, RuntimeState};
use super::store::AgentChatStore;
use super::types::{
    AgentChatEvent, AgentChatPayload, QueueItemStatus, RuntimeStatus, TranscriptEnvelope,
    TranscriptEvent, TurnStatus,
};

#[allow(clippy::too_many_arguments)]
pub(super) async fn maybe_dispatch_queue(
    chat_id: &str,
    store: &AgentChatStore,
    state: &Mutex<RuntimeState>,
    events: &broadcast::Sender<AgentChatEvent>,
    control: &AgentRuntimeControl,
    recent_events: &std::sync::Mutex<HashMap<String, VecDeque<AgentChatEvent>>>,
    turn_gates: &Mutex<HashMap<String, Arc<Mutex<()>>>>,
) -> Result<()> {
    let gate = {
        let mut gates = turn_gates.lock().await;
        gates
            .entry(chat_id.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    };
    let _turn = gate.lock().await;
    if state.lock().await.pending_permission.is_some() {
        return Ok(());
    }
    if state.lock().await.pending_session_op.is_some() {
        return Ok(());
    }
    if state.lock().await.current_turn_id.is_some() {
        return Ok(());
    }
    let (item, items) = match store.mutate_queue(chat_id, |items| {
        let Some(index) = items
            .iter()
            .position(|row| row.status == QueueItemStatus::Pending)
        else {
            return Ok(None);
        };
        let item = items.remove(index);
        Ok(Some((item, items.clone())))
    })? {
        Some(pair) => pair,
        None => return Ok(()),
    };
    let turn_id = uuid::Uuid::new_v4().to_string();
    let message_id = uuid::Uuid::new_v4().to_string();
    let created_at = Utc::now();
    state.lock().await.begin_turn(turn_id.clone(), created_at);
    store.append_record(
        chat_id,
        &TranscriptEnvelope::at(turn_id.clone(), created_at, TranscriptEvent::TurnStarted),
    )?;
    store.append_record(
        chat_id,
        &TranscriptEnvelope::at(
            turn_id.clone(),
            created_at,
            TranscriptEvent::UserMessage {
                message_id: message_id.clone(),
                kind: UserMessageKind::Normal,
                text: item.prompt.clone(),
                attachments: item.attachments.clone(),
            },
        ),
    )?;
    emit_live(
        chat_id,
        AgentChatPayload::TurnStarted {
            turn_id: turn_id.clone(),
            created_at: Some(created_at),
        },
        store,
        events,
        recent_events,
    )?;
    emit_live(
        chat_id,
        AgentChatPayload::UserMessage {
            turn_id: turn_id.clone(),
            message_id: message_id.clone(),
            kind: UserMessageKind::Normal,
            text: item.prompt.clone(),
            attachments: item.attachments.clone(),
            created_at: Some(created_at),
        },
        store,
        events,
        recent_events,
    )?;
    apply_pending_session_config(chat_id, &turn_id, store, control, events, recent_events).await?;
    if let Err(error) = control
        .send(AgentPrompt {
            text: item.prompt.clone(),
            attachments: item.attachments.clone(),
            kind: UserMessageKind::Normal,
            turn_id: Some(turn_id.clone()),
        })
        .await
    {
        state.lock().await.current_turn_id = None;
        let _ = store.mutate_queue(chat_id, |restored| {
            restored.insert(0, item.clone());
            Ok(())
        });
        let _ = store.append_record(
            chat_id,
            &TranscriptEnvelope::new(
                turn_id.clone(),
                TranscriptEvent::TurnCompleted {
                    status: TurnStatus::Failed,
                    error: Some(error.to_string()),
                    worked_ms: None,
                    thinking_ms: None,
                    usage: None,
                },
            ),
        );
        let _ = store.update_meta(chat_id, |meta| {
            meta.runtime_status = RuntimeStatus::Ready;
        });
        return Err(ServiceError::Processing(error.to_string()));
    }
    store.update_meta(chat_id, |meta| {
        meta.runtime_status = RuntimeStatus::RunningTurn;
        meta.last_message_at = Some(Utc::now());
    })?;
    emit_live(
        chat_id,
        AgentChatPayload::QueueUpdated { items },
        store,
        events,
        recent_events,
    )?;
    Ok(())
}
