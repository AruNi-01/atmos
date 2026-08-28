use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

use agent::{AgentPrompt, AgentSessionControl, UserMessageKind};
use chrono::Utc;
use tokio::sync::{broadcast, Mutex};

use crate::error::{Result, ServiceError};

use super::projector::{emit_live, RuntimeState};
use super::store::ConversationStore;
use super::types::{
    ConversationClientEvent, ConversationClientPayload, QueueItemStatus, RuntimeStatus,
    TranscriptRecord, TurnStatus,
};

#[allow(clippy::too_many_arguments)]
pub(super) async fn maybe_dispatch_queue(
    conversation_id: &str,
    store: &ConversationStore,
    state: &Mutex<RuntimeState>,
    events: &broadcast::Sender<ConversationClientEvent>,
    control: &AgentSessionControl,
    recent_events: &std::sync::Mutex<HashMap<String, VecDeque<ConversationClientEvent>>>,
    turn_gates: &Mutex<HashMap<String, Arc<Mutex<()>>>>,
) -> Result<()> {
    let gate = {
        let mut gates = turn_gates.lock().await;
        gates
            .entry(conversation_id.to_string())
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
    let mut items = store.read_queue(conversation_id)?;
    let Some(index) = items
        .iter()
        .position(|item| item.status == QueueItemStatus::Pending)
    else {
        return Ok(());
    };
    let item = items.remove(index);
    store.write_queue(conversation_id, &items)?;
    let turn_id = uuid::Uuid::new_v4().to_string();
    state.lock().await.current_turn_id = Some(turn_id.clone());
    store.append_record(
        conversation_id,
        &TranscriptRecord::TurnStarted {
            turn_id: turn_id.clone(),
            created_at: Utc::now(),
        },
    )?;
    store.append_record(
        conversation_id,
        &TranscriptRecord::UserMessage {
            turn_id: turn_id.clone(),
            message_id: uuid::Uuid::new_v4().to_string(),
            kind: UserMessageKind::Normal,
            text: item.prompt.clone(),
            attachments: item.attachments.clone(),
            created_at: Utc::now(),
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
        let mut restored = store.read_queue(conversation_id)?;
        restored.insert(0, item);
        let _ = store.write_queue(conversation_id, &restored);
        let _ = store.append_record(
            conversation_id,
            &TranscriptRecord::TurnCompleted {
                turn_id: turn_id.clone(),
                status: TurnStatus::Failed,
                error: Some(error.to_string()),
                created_at: Utc::now(),
            },
        );
        let _ = store.update_meta(conversation_id, |meta| {
            meta.runtime_status = RuntimeStatus::Ready;
        });
        return Err(ServiceError::Processing(error.to_string()));
    }
    store.update_meta(conversation_id, |meta| {
        meta.runtime_status = RuntimeStatus::RunningTurn;
        meta.last_message_at = Some(Utc::now());
    })?;
    emit_live(
        conversation_id,
        ConversationClientPayload::TurnStarted { turn_id },
        store,
        events,
        recent_events,
    )?;
    emit_live(
        conversation_id,
        ConversationClientPayload::QueueUpdated { items },
        store,
        events,
        recent_events,
    )?;
    Ok(())
}
