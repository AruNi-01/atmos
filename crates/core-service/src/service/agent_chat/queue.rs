use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

use agent::{AgentPrompt, AgentRuntimeControl, UserMessageKind};
use chrono::Utc;
use tokio::sync::{broadcast, Mutex};

use crate::error::{Result, ServiceError};

use super::apply_event::{emit_live, RuntimeState};
use super::store::AgentChatStore;
use super::types::{
    AgentChatEvent, AgentChatPayload, QueueItemStatus, RuntimeStatus, TranscriptRecord, TurnStatus,
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
    state.lock().await.current_turn_id = Some(turn_id.clone());
    store.append_record(
        chat_id,
        &TranscriptRecord::TurnStarted {
            turn_id: turn_id.clone(),
            created_at,
        },
    )?;
    store.append_record(
        chat_id,
        &TranscriptRecord::UserMessage {
            turn_id: turn_id.clone(),
            message_id: message_id.clone(),
            kind: UserMessageKind::Normal,
            text: item.prompt.clone(),
            attachments: item.attachments.clone(),
            created_at,
        },
    )?;
    if let Err(error) = control
        .prompt(AgentPrompt {
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
            &TranscriptRecord::TurnCompleted {
                turn_id: turn_id.clone(),
                status: TurnStatus::Failed,
                error: Some(error.to_string()),
                worked_ms: None,
                thinking_ms: None,
                usage: None,
                created_at: Utc::now(),
            },
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
        AgentChatPayload::TurnStarted {
            turn_id: turn_id.clone(),
        },
        store,
        events,
        recent_events,
    )?;
    emit_live(
        chat_id,
        AgentChatPayload::UserMessage {
            turn_id,
            message_id,
            kind: UserMessageKind::Normal,
            text: item.prompt,
            attachments: item.attachments,
            created_at: Some(created_at),
        },
        store,
        events,
        recent_events,
    )?;
    emit_live(
        chat_id,
        AgentChatPayload::QueueUpdated { items },
        store,
        events,
        recent_events,
    )?;
    Ok(())
}
