use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};

use agent::{
    AgentEvent, AgentPersistenceHandle, AgentPrompt, AgentProviderFactory, AgentSession,
    AgentSessionConfig, AgentSessionControl, TurnStop, UserMessageKind,
};
use chrono::Utc;
use tokio::sync::{broadcast, Mutex};
use tracing::warn;

use crate::error::{Result, ServiceError};

use super::store::ConversationStore;
use super::types::{
    ConversationClientEvent, ConversationClientPayload, ConversationMeta, ConversationSnapshot,
    CreateConversationRequest, PendingPermission, QueueItem, QueueItemStatus, RuntimeStatus,
    TranscriptRecord, TurnStatus,
};

const ASSISTANT_SNAPSHOT_INTERVAL: Duration = Duration::from_millis(100);

struct RuntimeState {
    current_turn_id: Option<String>,
    pending_permission: Option<PendingPermission>,
    assistant_text: HashMap<String, (String, String)>,
    thinking_text: HashMap<String, (String, String)>,
    last_snapshot: Instant,
}

struct LiveRuntime {
    control: AgentSessionControl,
    state: Arc<Mutex<RuntimeState>>,
}

pub struct ConversationService {
    store: Arc<ConversationStore>,
    factory: Arc<dyn AgentProviderFactory>,
    runtimes: Arc<Mutex<HashMap<String, LiveRuntime>>>,
    spawning: Mutex<HashSet<String>>,
    events: broadcast::Sender<ConversationClientEvent>,
}

impl ConversationService {
    pub fn new(store: Arc<ConversationStore>, factory: Arc<dyn AgentProviderFactory>) -> Self {
        let (events, _) = broadcast::channel(512);
        Self {
            store,
            factory,
            runtimes: Arc::new(Mutex::new(HashMap::new())),
            spawning: Mutex::new(HashSet::new()),
            events,
        }
    }

    pub fn store(&self) -> &ConversationStore {
        &self.store
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
        let meta = self.store.get_meta(conversation_id)?;
        if let Some(runtime) = self.runtimes.lock().await.get(conversation_id) {
            if runtime.state.lock().await.current_turn_id.is_some() {
                return Err(ServiceError::Validation(
                    "turn already running; queue or steer instead".into(),
                ));
            }
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
        let control = match self.ensure_runtime(conversation_id).await {
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
        if let Some(runtime) = self.runtimes.lock().await.get(conversation_id) {
            runtime.state.lock().await.current_turn_id = Some(turn_id.clone());
        }
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
            self.store.update_meta(conversation_id, |meta| {
                if !matches!(
                    meta.runtime_status,
                    RuntimeStatus::Closed | RuntimeStatus::Detached
                ) {
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
        let mut items = self.store.read_queue(conversation_id)?;
        let seq = items.iter().map(|item| item.seq).max().unwrap_or(0) + 1;
        let item = QueueItem {
            id: uuid::Uuid::new_v4().to_string(),
            seq,
            status: QueueItemStatus::Pending,
            prompt: text.to_string(),
            display_prompt: None,
            attachments,
        };
        items.push(item.clone());
        self.store.write_queue(conversation_id, &items)?;
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
        let mut items = self.store.read_queue(conversation_id)?;
        let item = items
            .iter_mut()
            .find(|item| item.id == item_id)
            .ok_or_else(|| ServiceError::NotFound(format!("queue item {item_id}")))?;
        if let Some(text) = text {
            item.prompt = text;
        }
        if let Some(status) = status {
            item.status = status;
        }
        let cloned = item.clone();
        self.store.write_queue(conversation_id, &items)?;
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
        let current = self.store.read_queue(conversation_id)?;
        let mut next = Vec::new();
        for id in item_ids {
            if let Some(item) = current.iter().find(|item| item.id == *id) {
                next.push(item.clone());
            }
        }
        for item in current {
            if !next.iter().any(|existing| existing.id == item.id) {
                next.push(item);
            }
        }
        for (index, item) in next.iter_mut().enumerate() {
            item.seq = (index as u64) + 1;
        }
        self.store.write_queue(conversation_id, &next)?;
        self.emit(
            conversation_id,
            ConversationClientPayload::QueueUpdated {
                items: next.clone(),
            },
        )?;
        Ok(next)
    }

    pub fn queue_delete(&self, conversation_id: &str, item_id: &str) -> Result<()> {
        let mut items = self.store.read_queue(conversation_id)?;
        items.retain(|item| item.id != item_id);
        self.store.write_queue(conversation_id, &items)?;
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
        if let Some(runtime) = self.runtimes.lock().await.get(conversation_id) {
            runtime.state.lock().await.pending_permission = None;
        }
        self.emit(
            conversation_id,
            ConversationClientPayload::PermissionResolved {
                request_id: request_id.to_string(),
                option_id: option_id.to_string(),
            },
        )?;
        Ok(())
    }

    async fn ensure_runtime(&self, conversation_id: &str) -> Result<AgentSessionControl> {
        loop {
            {
                let map = self.runtimes.lock().await;
                if let Some(runtime) = map.get(conversation_id) {
                    return Ok(runtime.control.clone());
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
        let result = self.spawn_runtime(conversation_id).await;
        self.spawning.lock().await.remove(conversation_id);
        result
    }

    async fn spawn_runtime(&self, conversation_id: &str) -> Result<AgentSessionControl> {
        if let Some(runtime) = self.runtimes.lock().await.get(conversation_id) {
            return Ok(runtime.control.clone());
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
        let state = Arc::new(Mutex::new(RuntimeState {
            current_turn_id: None,
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
            },
        );
        let store = Arc::clone(&self.store);
        let events = self.events.clone();
        let conversation_id_owned = conversation_id.to_string();
        let pump_control = control.clone();
        let runtimes = Arc::clone(&self.runtimes);
        tokio::spawn(async move {
            pump_session(
                conversation_id_owned.clone(),
                session,
                store.clone(),
                state,
                events.clone(),
                pump_control,
            )
            .await;
            let _ = store.update_meta(&conversation_id_owned, |meta| {
                if !matches!(
                    meta.runtime_status,
                    RuntimeStatus::Closed | RuntimeStatus::Detached
                ) {
                    meta.runtime_status = RuntimeStatus::Detached;
                }
            });
            let sequence = store.next_seq(&conversation_id_owned).unwrap_or(0);
            let _ = events.send(ConversationClientEvent {
                conversation_id: conversation_id_owned.clone(),
                event_id: uuid::Uuid::new_v4().to_string(),
                sequence,
                payload: ConversationClientPayload::RuntimeStatus {
                    status: RuntimeStatus::Detached,
                    persistence_handle: None,
                },
            });
            runtimes.lock().await.remove(&conversation_id_owned);
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
        let _ = self.events.send(event);
        Ok(())
    }
}

async fn pump_session(
    conversation_id: String,
    mut session: Box<dyn AgentSession>,
    store: Arc<ConversationStore>,
    state: Arc<Mutex<RuntimeState>>,
    events: broadcast::Sender<ConversationClientEvent>,
    control: AgentSessionControl,
) {
    while let Some(event) = session.next_event().await {
        let completed = matches!(
            event,
            AgentEvent::TurnCompleted { .. }
                | AgentEvent::TurnCanceled { .. }
                | AgentEvent::TurnFailed { .. }
        );
        if let Err(error) = apply_event(&conversation_id, event, &store, &state, &events).await {
            warn!("conversation pump error: {error}");
        }
        if completed {
            if let Err(error) =
                maybe_dispatch_queue(&conversation_id, &store, &state, &events, &control).await
            {
                warn!("queue dispatch error: {error}");
            }
        }
    }
}

async fn apply_event(
    conversation_id: &str,
    event: AgentEvent,
    store: &ConversationStore,
    state: &Mutex<RuntimeState>,
    events: &broadcast::Sender<ConversationClientEvent>,
) -> Result<()> {
    let emit = |payload: ConversationClientPayload| -> Result<()> {
        let sequence = store.next_seq(conversation_id)?;
        let _ = events.send(ConversationClientEvent {
            conversation_id: conversation_id.to_string(),
            event_id: uuid::Uuid::new_v4().to_string(),
            sequence,
            payload,
        });
        Ok(())
    };
    match event {
        AgentEvent::SessionStarted { persistence_handle } => {
            store.update_meta(conversation_id, |meta| {
                if let Some(handle) = persistence_handle.clone() {
                    if meta.id == handle {
                        warn!("refusing to store persistence handle equal to conversation id");
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
                meta.runtime_status = RuntimeStatus::Detached;
            })?;
            state.lock().await.current_turn_id = None;
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

async fn finish_turn(
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

async fn maybe_dispatch_queue(
    conversation_id: &str,
    store: &ConversationStore,
    state: &Mutex<RuntimeState>,
    events: &broadcast::Sender<ConversationClientEvent>,
    control: &AgentSessionControl,
) -> Result<()> {
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
    control
        .prompt(AgentPrompt {
            text: item.prompt.clone(),
            attachments: item.attachments.clone(),
            kind: UserMessageKind::Normal,
            turn_id: Some(turn_id.clone()),
        })
        .await
        .map_err(|e| ServiceError::Processing(e.to_string()))?;
    store.update_meta(conversation_id, |meta| {
        meta.runtime_status = RuntimeStatus::RunningTurn;
        meta.last_message_at = Some(Utc::now());
    })?;
    let sequence = store.next_seq(conversation_id)?;
    let _ = events.send(ConversationClientEvent {
        conversation_id: conversation_id.to_string(),
        event_id: uuid::Uuid::new_v4().to_string(),
        sequence,
        payload: ConversationClientPayload::TurnStarted { turn_id },
    });
    let sequence = store.next_seq(conversation_id)?;
    let _ = events.send(ConversationClientEvent {
        conversation_id: conversation_id.to_string(),
        event_id: uuid::Uuid::new_v4().to_string(),
        sequence,
        payload: ConversationClientPayload::QueueUpdated { items },
    });
    Ok(())
}

fn nonempty_opt(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}
