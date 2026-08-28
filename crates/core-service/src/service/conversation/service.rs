use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use agent::{
    AgentEvent, AgentPersistenceHandle, AgentPrompt, AgentProviderFactory, AgentSession,
    AgentSessionConfig, AgentSessionControl, UserMessageKind,
};
use chrono::Utc;
use tokio::sync::{broadcast, Mutex};
use tracing::warn;

use crate::error::{Result, ServiceError};

use super::projector::{
    apply_event, emit_live, finish_turn, nonempty_opt, push_recent, RuntimeState,
};
use super::queue::maybe_dispatch_queue;
use super::store::ConversationStore;
use super::types::{
    ConversationClientEvent, ConversationClientPayload, ConversationMeta, ConversationSnapshot,
    CreateConversationRequest, PendingPermission, QueueItem, QueueItemStatus, RuntimeStatus,
    TranscriptRecord, TurnStatus,
};

struct LiveRuntime {
    control: AgentSessionControl,
    state: Arc<Mutex<RuntimeState>>,
    alive: Arc<AtomicBool>,
}

pub struct ConversationService {
    store: Arc<ConversationStore>,
    factory: Arc<dyn AgentProviderFactory>,
    runtimes: Arc<Mutex<HashMap<String, LiveRuntime>>>,
    spawning: Mutex<HashSet<String>>,
    turn_gates: Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>,
    recent_events: Arc<std::sync::Mutex<HashMap<String, VecDeque<ConversationClientEvent>>>>,
    events: broadcast::Sender<ConversationClientEvent>,
}

impl ConversationService {
    pub fn new(store: Arc<ConversationStore>, factory: Arc<dyn AgentProviderFactory>) -> Self {
        let (events, _) = broadcast::channel(4096);
        Self {
            store,
            factory,
            runtimes: Arc::new(Mutex::new(HashMap::new())),
            spawning: Mutex::new(HashSet::new()),
            turn_gates: Arc::new(Mutex::new(HashMap::new())),
            recent_events: Arc::new(std::sync::Mutex::new(HashMap::new())),
            events,
        }
    }

    async fn turn_gate(&self, conversation_id: &str) -> Arc<Mutex<()>> {
        let mut gates = self.turn_gates.lock().await;
        gates
            .entry(conversation_id.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    pub fn events_after(
        &self,
        conversation_id: &str,
        after_sequence: u64,
    ) -> Vec<ConversationClientEvent> {
        self.recent_events
            .lock()
            .map(|map| {
                map.get(conversation_id)
                    .into_iter()
                    .flatten()
                    .filter(|event| event.sequence > after_sequence)
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn store(&self) -> &ConversationStore {
        &self.store
    }

    pub fn save_attachment(
        &self,
        conversation_id: &str,
        filename: &str,
        data: &[u8],
    ) -> Result<std::path::PathBuf> {
        self.store.save_attachment(conversation_id, filename, data)
    }

    pub fn subscribe(&self) -> broadcast::Receiver<ConversationClientEvent> {
        self.events.subscribe()
    }

    pub fn create(&self, req: CreateConversationRequest) -> Result<ConversationMeta> {
        self.store.create(req)
    }

    pub fn list(
        &self,
        cwd: Option<&str>,
        workspace_id: Option<&str>,
        project_id: Option<&str>,
    ) -> Result<Vec<super::types::ConversationIndexEntry>> {
        self.store.list(cwd, workspace_id, project_id, false)
    }

    pub fn get(&self, id: &str) -> Result<ConversationSnapshot> {
        self.store.get_snapshot(id)
    }

    pub fn rename(&self, id: &str, title: &str) -> Result<ConversationMeta> {
        self.store.rename(id, title)
    }

    pub async fn configure(
        &self,
        id: &str,
        provider_id: Option<String>,
        model: Option<String>,
        thinking: Option<String>,
    ) -> Result<ConversationMeta> {
        if self.runtimes.lock().await.contains_key(id) {
            return Err(ServiceError::Validation(
                "cannot change model while the agent is running".into(),
            ));
        }
        self.store.update_meta(id, |meta| {
            if let Some(provider) = provider_id {
                if !provider.trim().is_empty() {
                    meta.provider_id = provider;
                }
            }
            if let Some(value) = model {
                meta.selected_model = nonempty_opt(value);
            }
            if let Some(value) = thinking {
                meta.selected_thinking = nonempty_opt(value);
            }
        })
    }

    pub async fn delete(&self, id: &str) -> Result<ConversationMeta> {
        let runtime = self.runtimes.lock().await.remove(id);
        if let Some(runtime) = runtime {
            let control = runtime.control;
            tokio::spawn(async move {
                let _ = control.close().await;
            });
        }
        self.store.delete(id)
    }

    pub async fn send(
        &self,
        conversation_id: &str,
        text: &str,
        attachments: Vec<String>,
    ) -> Result<String> {
        if text.trim().is_empty() {
            return Err(ServiceError::Validation("text is required".into()));
        }
        self.store
            .validate_attachment_paths(conversation_id, &attachments)?;
        let gate = self.turn_gate(conversation_id).await;
        let _turn = gate.lock().await;
        let meta = self.store.get_meta(conversation_id)?;
        if let Some(runtime) = self.runtimes.lock().await.get(conversation_id) {
            if !runtime.alive.load(Ordering::SeqCst) {
                // Pump is gone; fall through to a fresh spawn after the stale map entry is dropped.
            } else if runtime.state.lock().await.current_turn_id.is_some() {
                return Err(ServiceError::Validation(
                    "turn already running; queue or steer instead".into(),
                ));
            }
        }
        let snapshot = self.store.get_snapshot(conversation_id)?;
        if let Some(turn) = snapshot.turns.iter().rev().find(|turn| {
            matches!(
                turn.status,
                TurnStatus::Running | TurnStatus::WaitingPermission
            )
        }) {
            let runtime_busy =
                if let Some(runtime) = self.runtimes.lock().await.get(conversation_id) {
                    runtime.alive.load(Ordering::SeqCst)
                        && runtime.state.lock().await.current_turn_id.is_some()
                } else {
                    false
                };
            if runtime_busy {
                return Err(ServiceError::Validation(
                    "turn already running; queue or steer instead".into(),
                ));
            }
            self.store.append_record(
                conversation_id,
                &TranscriptRecord::TurnCompleted {
                    turn_id: turn.id.clone(),
                    status: TurnStatus::Failed,
                    error: Some("previous turn did not complete".into()),
                    created_at: Utc::now(),
                },
            )?;
            self.store.update_meta(conversation_id, |meta| {
                meta.runtime_status = RuntimeStatus::Ready;
            })?;
            self.emit(
                conversation_id,
                ConversationClientPayload::TurnCompleted {
                    turn_id: turn.id.clone(),
                    status: TurnStatus::Failed,
                },
            )?;
        }
        let turn_id = uuid::Uuid::new_v4().to_string();
        self.store.append_record(
            conversation_id,
            &TranscriptRecord::TurnStarted {
                turn_id: turn_id.clone(),
                created_at: Utc::now(),
            },
        )?;
        let message_id = uuid::Uuid::new_v4().to_string();
        self.store.append_record(
            conversation_id,
            &TranscriptRecord::UserMessage {
                turn_id: turn_id.clone(),
                message_id: message_id.clone(),
                kind: UserMessageKind::Normal,
                text: text.to_string(),
                attachments: attachments.clone(),
                created_at: Utc::now(),
            },
        )?;
        self.store.update_meta(conversation_id, |meta| {
            meta.runtime_status = RuntimeStatus::RunningTurn;
            meta.last_message_at = Some(Utc::now());
            if meta.title.is_none() {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    meta.title = Some(trimmed.chars().take(60).collect());
                }
            }
        })?;
        self.emit(
            conversation_id,
            ConversationClientPayload::TurnStarted {
                turn_id: turn_id.clone(),
            },
        )?;
        self.emit(
            conversation_id,
            ConversationClientPayload::UserMessage {
                turn_id: turn_id.clone(),
                message_id,
                kind: UserMessageKind::Normal,
                text: text.to_string(),
                attachments: attachments.clone(),
            },
        )?;
        let _ = meta;
        let control = match self
            .ensure_runtime(conversation_id, Some(turn_id.clone()))
            .await
        {
            Ok(control) => control,
            Err(error) => {
                let _ = self.store.append_record(
                    conversation_id,
                    &TranscriptRecord::TurnCompleted {
                        turn_id: turn_id.clone(),
                        status: TurnStatus::Failed,
                        error: Some(error.to_string()),
                        created_at: Utc::now(),
                    },
                );
                let _ = self.store.update_meta(conversation_id, |meta| {
                    meta.runtime_status = RuntimeStatus::Detached;
                });
                let _ = self.emit(
                    conversation_id,
                    ConversationClientPayload::TurnCompleted {
                        turn_id: turn_id.clone(),
                        status: TurnStatus::Failed,
                    },
                );
                return Err(error);
            }
        };
        if let Err(error) = control
            .prompt(AgentPrompt {
                text: text.to_string(),
                attachments,
                kind: UserMessageKind::Normal,
                turn_id: Some(turn_id.clone()),
            })
            .await
        {
            if let Some(runtime) = self.runtimes.lock().await.get(conversation_id) {
                let mut state = runtime.state.lock().await;
                if state.current_turn_id.as_deref() == Some(turn_id.as_str()) {
                    state.current_turn_id = None;
                }
            }
            let _ = self.store.append_record(
                conversation_id,
                &TranscriptRecord::TurnCompleted {
                    turn_id: turn_id.clone(),
                    status: TurnStatus::Failed,
                    error: Some(error.to_string()),
                    created_at: Utc::now(),
                },
            );
            let _ = self.store.update_meta(conversation_id, |meta| {
                meta.runtime_status = RuntimeStatus::Detached;
            });
            let _ = self.emit(
                conversation_id,
                ConversationClientPayload::TurnCompleted {
                    turn_id: turn_id.clone(),
                    status: TurnStatus::Failed,
                },
            );
            return Err(ServiceError::Processing(error.to_string()));
        }
        Ok(turn_id)
    }

    pub async fn steer(
        &self,
        conversation_id: &str,
        expected_turn_id: &str,
        text: &str,
    ) -> Result<String> {
        let meta = self.store.get_meta(conversation_id)?;
        if text.trim().is_empty() {
            return Err(ServiceError::Validation("text is required".into()));
        }
        if !meta.supports_steer {
            return Err(ServiceError::Validation(
                "steer is not supported by this agent".into(),
            ));
        }
        let (control, current) = {
            let map = self.runtimes.lock().await;
            let runtime = map
                .get(conversation_id)
                .ok_or_else(|| ServiceError::Validation("no running turn".into()))?;
            let control = runtime.control.clone();
            let current = runtime.state.lock().await.current_turn_id.clone();
            (control, current)
        };
        if current.as_deref() != Some(expected_turn_id) {
            return Err(ServiceError::Validation(
                "expected_turn_id does not match the running turn".into(),
            ));
        }
        control
            .steer(AgentPrompt {
                text: text.to_string(),
                attachments: Vec::new(),
                kind: UserMessageKind::Steer,
                turn_id: Some(expected_turn_id.to_string()),
            })
            .await
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        let message_id = uuid::Uuid::new_v4().to_string();
        self.store.append_record(
            conversation_id,
            &TranscriptRecord::UserMessage {
                turn_id: expected_turn_id.to_string(),
                message_id: message_id.clone(),
                kind: UserMessageKind::Steer,
                text: text.to_string(),
                attachments: Vec::new(),
                created_at: Utc::now(),
            },
        )?;
        self.emit(
            conversation_id,
            ConversationClientPayload::UserMessage {
                turn_id: expected_turn_id.to_string(),
                message_id,
                kind: UserMessageKind::Steer,
                text: text.to_string(),
                attachments: Vec::new(),
            },
        )?;
        Ok(expected_turn_id.to_string())
    }

    pub async fn cancel(&self, conversation_id: &str) -> Result<()> {
        let control = self
            .runtimes
            .lock()
            .await
            .get(conversation_id)
            .map(|runtime| runtime.control.clone());
        if let Some(control) = control {
            control
                .cancel()
                .await
                .map_err(|e| ServiceError::Processing(e.to_string()))?;
        } else {
            let snapshot = self.store.get_snapshot(conversation_id)?;
            if let Some(turn) = snapshot.turns.iter().rev().find(|turn| {
                matches!(
                    turn.status,
                    TurnStatus::Running | TurnStatus::WaitingPermission
                )
            }) {
                self.store.append_record(
                    conversation_id,
                    &TranscriptRecord::TurnCompleted {
                        turn_id: turn.id.clone(),
                        status: TurnStatus::Canceled,
                        error: None,
                        created_at: Utc::now(),
                    },
                )?;
                self.emit(
                    conversation_id,
                    ConversationClientPayload::TurnCompleted {
                        turn_id: turn.id.clone(),
                        status: TurnStatus::Canceled,
                    },
                )?;
            }
            self.store.update_meta(conversation_id, |meta| {
                if !matches!(meta.runtime_status, RuntimeStatus::Closed) {
                    meta.runtime_status = RuntimeStatus::Detached;
                }
            })?;
        }
        Ok(())
    }

    pub fn queue_add(
        &self,
        conversation_id: &str,
        text: &str,
        attachments: Vec<String>,
    ) -> Result<QueueItem> {
        if text.trim().is_empty() {
            return Err(ServiceError::Validation("text is required".into()));
        }
        self.store
            .validate_attachment_paths(conversation_id, &attachments)?;
        let (item, items) = self.store.mutate_queue(conversation_id, |items| {
            let seq = items.iter().map(|item| item.seq).max().unwrap_or(0) + 1;
            let item = QueueItem {
                id: uuid::Uuid::new_v4().to_string(),
                seq,
                status: QueueItemStatus::Pending,
                prompt: text.to_string(),
                display_prompt: None,
                attachments: attachments.clone(),
            };
            items.push(item.clone());
            Ok((item, items.clone()))
        })?;
        self.emit(
            conversation_id,
            ConversationClientPayload::QueueUpdated { items },
        )?;
        Ok(item)
    }

    pub fn queue_update(
        &self,
        conversation_id: &str,
        item_id: &str,
        text: Option<String>,
        status: Option<QueueItemStatus>,
    ) -> Result<QueueItem> {
        let (cloned, items) = self.store.mutate_queue(conversation_id, |items| {
            let item = items
                .iter_mut()
                .find(|item| item.id == item_id)
                .ok_or_else(|| ServiceError::NotFound(format!("queue item {item_id}")))?;
            if let Some(text) = text {
                if text.trim().is_empty() {
                    return Err(ServiceError::Validation("text is required".into()));
                }
                item.prompt = text;
            }
            if let Some(status) = status {
                item.status = status;
            }
            Ok((item.clone(), items.clone()))
        })?;
        self.emit(
            conversation_id,
            ConversationClientPayload::QueueUpdated { items },
        )?;
        Ok(cloned)
    }

    pub fn queue_reorder(
        &self,
        conversation_id: &str,
        item_ids: &[String],
    ) -> Result<Vec<QueueItem>> {
        let next = self.store.mutate_queue(conversation_id, |current| {
            let mut next = Vec::new();
            for id in item_ids {
                if let Some(item) = current.iter().find(|item| item.id == *id) {
                    next.push(item.clone());
                }
            }
            for item in current.iter() {
                if !next.iter().any(|existing| existing.id == item.id) {
                    next.push(item.clone());
                }
            }
            for (index, item) in next.iter_mut().enumerate() {
                item.seq = (index as u64) + 1;
            }
            *current = next.clone();
            Ok(next)
        })?;
        self.emit(
            conversation_id,
            ConversationClientPayload::QueueUpdated {
                items: next.clone(),
            },
        )?;
        Ok(next)
    }

    pub fn queue_delete(&self, conversation_id: &str, item_id: &str) -> Result<()> {
        let items = self.store.mutate_queue(conversation_id, |items| {
            items.retain(|item| item.id != item_id);
            Ok(items.clone())
        })?;
        self.emit(
            conversation_id,
            ConversationClientPayload::QueueUpdated { items },
        )?;
        Ok(())
    }

    pub async fn permission_respond(
        &self,
        conversation_id: &str,
        request_id: &str,
        option_id: &str,
    ) -> Result<()> {
        let control = self
            .runtimes
            .lock()
            .await
            .get(conversation_id)
            .map(|runtime| runtime.control.clone())
            .ok_or_else(|| ServiceError::Validation("no live runtime".into()))?;
        control
            .respond_permission(request_id, option_id)
            .await
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        let turn_id = if let Some(runtime) = self.runtimes.lock().await.get(conversation_id) {
            let mut state = runtime.state.lock().await;
            state.pending_permission = None;
            state
                .current_turn_id
                .clone()
                .unwrap_or_else(|| "unknown".into())
        } else {
            "unknown".into()
        };
        let _ = self.store.append_record(
            conversation_id,
            &TranscriptRecord::Permission {
                turn_id,
                request: PendingPermission {
                    request_id: request_id.to_string(),
                    tool: String::new(),
                    description: String::new(),
                    content_markdown: None,
                    options: Vec::new(),
                    status: "resolved".into(),
                },
                created_at: Utc::now(),
            },
        );
        self.emit(
            conversation_id,
            ConversationClientPayload::PermissionResolved {
                request_id: request_id.to_string(),
                option_id: option_id.to_string(),
            },
        )?;
        Ok(())
    }

    async fn ensure_runtime(
        &self,
        conversation_id: &str,
        initial_turn_id: Option<String>,
    ) -> Result<AgentSessionControl> {
        loop {
            {
                let map = self.runtimes.lock().await;
                if let Some(runtime) = map.get(conversation_id) {
                    if runtime.alive.load(Ordering::SeqCst) {
                        if let Some(turn_id) = &initial_turn_id {
                            runtime.state.lock().await.current_turn_id = Some(turn_id.clone());
                        }
                        return Ok(runtime.control.clone());
                    }
                }
            }
            let mut spawning = self.spawning.lock().await;
            if spawning.contains(conversation_id) {
                drop(spawning);
                tokio::time::sleep(Duration::from_millis(20)).await;
                continue;
            }
            spawning.insert(conversation_id.to_string());
            drop(spawning);
            break;
        }
        let result = self.spawn_runtime(conversation_id, initial_turn_id).await;
        self.spawning.lock().await.remove(conversation_id);
        result
    }

    async fn spawn_runtime(
        &self,
        conversation_id: &str,
        initial_turn_id: Option<String>,
    ) -> Result<AgentSessionControl> {
        if let Some(runtime) = self.runtimes.lock().await.get(conversation_id) {
            if runtime.alive.load(Ordering::SeqCst) {
                if let Some(turn_id) = &initial_turn_id {
                    runtime.state.lock().await.current_turn_id = Some(turn_id.clone());
                }
                return Ok(runtime.control.clone());
            }
        }
        let meta = self.store.get_meta(conversation_id)?;
        let provider = self
            .factory
            .provider_for(&meta.provider_id)
            .await
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        let cfg = AgentSessionConfig {
            cwd: std::path::PathBuf::from(&meta.cwd),
            model: meta.selected_model.clone(),
            thinking: meta.selected_thinking.clone(),
            mode: meta.selected_mode.clone(),
            extra_config: HashMap::new(),
            env_overrides: None,
            auth_method_id: None,
            allow_file_access: meta.workspace_id.is_some() || meta.project_id.is_some(),
        };
        let session = if let Some(handle) = meta.persistence_handle.clone() {
            provider
                .resume_session(AgentPersistenceHandle::new(handle), cfg)
                .await
        } else {
            provider.create_session(cfg).await
        }
        .map_err(|e| ServiceError::Processing(e.to_string()))?;
        let capabilities = session.capabilities();
        self.store.update_meta(conversation_id, |meta| {
            meta.runtime_status = RuntimeStatus::Starting;
            meta.supports_steer = capabilities.supports_steer;
            if let Some(handle) = session.persistence_handle() {
                meta.persistence_handle = Some(handle.as_str().to_string());
            }
        })?;
        let control = session.control();
        let alive = Arc::new(AtomicBool::new(true));
        let state = Arc::new(Mutex::new(RuntimeState {
            current_turn_id: initial_turn_id,
            pending_permission: None,
            assistant_text: HashMap::new(),
            thinking_text: HashMap::new(),
            last_snapshot: Instant::now(),
        }));
        self.runtimes.lock().await.insert(
            conversation_id.to_string(),
            LiveRuntime {
                control: control.clone(),
                state: Arc::clone(&state),
                alive: Arc::clone(&alive),
            },
        );
        let store = Arc::clone(&self.store);
        let events = self.events.clone();
        let conversation_id_owned = conversation_id.to_string();
        let pump_control = control.clone();
        let runtimes = Arc::clone(&self.runtimes);
        let recent_events = Arc::clone(&self.recent_events);
        let turn_gates = Arc::clone(&self.turn_gates);
        tokio::spawn(async move {
            pump_session(
                conversation_id_owned.clone(),
                session,
                store.clone(),
                state,
                events.clone(),
                pump_control,
                Arc::clone(&recent_events),
                turn_gates,
            )
            .await;
            alive.store(false, Ordering::SeqCst);
            runtimes.lock().await.remove(&conversation_id_owned);
            let status = store
                .get_meta(&conversation_id_owned)
                .map(|meta| meta.runtime_status)
                .unwrap_or(RuntimeStatus::Detached);
            if !matches!(status, RuntimeStatus::Closed | RuntimeStatus::Detached) {
                let _ = store.update_meta(&conversation_id_owned, |meta| {
                    meta.runtime_status = RuntimeStatus::Detached;
                });
            }
            let sequence = store.next_seq(&conversation_id_owned).unwrap_or(0);
            let event = ConversationClientEvent {
                conversation_id: conversation_id_owned.clone(),
                event_id: uuid::Uuid::new_v4().to_string(),
                sequence,
                payload: ConversationClientPayload::RuntimeStatus {
                    status: if matches!(status, RuntimeStatus::Closed) {
                        RuntimeStatus::Closed
                    } else {
                        RuntimeStatus::Detached
                    },
                    persistence_handle: None,
                },
            };
            push_recent(&recent_events, &event);
            let _ = events.send(event);
        });
        Ok(control)
    }

    fn emit(&self, conversation_id: &str, payload: ConversationClientPayload) -> Result<()> {
        let sequence = self.store.next_seq(conversation_id)?;
        let event = ConversationClientEvent {
            conversation_id: conversation_id.to_string(),
            event_id: uuid::Uuid::new_v4().to_string(),
            sequence,
            payload,
        };
        push_recent(&self.recent_events, &event);
        let _ = self.events.send(event);
        Ok(())
    }
}

#[allow(clippy::too_many_arguments)]
async fn pump_session(
    conversation_id: String,
    mut session: Box<dyn AgentSession>,
    store: Arc<ConversationStore>,
    state: Arc<Mutex<RuntimeState>>,
    events: broadcast::Sender<ConversationClientEvent>,
    control: AgentSessionControl,
    recent_events: Arc<std::sync::Mutex<HashMap<String, VecDeque<ConversationClientEvent>>>>,
    turn_gates: Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>,
) {
    let mut closed_cleanly = false;
    while let Some(event) = session.next_event().await {
        if matches!(event, AgentEvent::SessionClosed) {
            closed_cleanly = true;
        }
        let should_dispatch = matches!(
            &event,
            AgentEvent::TurnCompleted {
                stop: agent::TurnStop::Completed,
                ..
            }
        );
        if let Err(error) = apply_event(
            &conversation_id,
            event,
            &store,
            &state,
            &events,
            &recent_events,
        )
        .await
        {
            warn!("conversation pump error: {error}");
        }
        if should_dispatch {
            if let Err(error) = maybe_dispatch_queue(
                &conversation_id,
                &store,
                &state,
                &events,
                &control,
                &recent_events,
                &turn_gates,
            )
            .await
            {
                warn!("queue dispatch error: {error}");
            }
        }
    }
    if let Some(turn_id) = state.lock().await.current_turn_id.clone() {
        let emit = |payload: ConversationClientPayload| -> Result<()> {
            emit_live(&conversation_id, payload, &store, &events, &recent_events)
        };
        let _ = finish_turn(
            &conversation_id,
            turn_id,
            TurnStatus::Failed,
            Some("agent session ended".into()),
            &store,
            &state,
            &emit,
        )
        .await;
    }
    let status = if closed_cleanly {
        RuntimeStatus::Closed
    } else {
        RuntimeStatus::Detached
    };
    let _ = store.update_meta(&conversation_id, |meta| {
        meta.runtime_status = status;
    });
}
