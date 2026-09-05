use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use agent::{
    AgentEvent, AgentPersistenceHandle, AgentPrompt, AgentProviderFactory, AgentRuntime,
    AgentRuntimeConfig, AgentRuntimeControl, UserMessageKind,
};
use chrono::Utc;
use tokio::sync::{broadcast, Mutex};
use tracing::warn;

use crate::error::{Result, ServiceError};

use super::apply_event::{
    apply_event, apply_pending_session_config, emit_live, finish_turn, nonempty_opt,
    overlay_live_state, RuntimeState,
};
use super::queue::maybe_dispatch_queue;
use super::store::AgentChatStore;
use super::types::{
    resolve_session_config_select, AgentChatEvent, AgentChatMeta, AgentChatPayload,
    AgentChatSnapshot, CreateAgentChatRequest, PendingPermission, QueueItem, QueueItemStatus,
    ResolvedSessionConfig, RuntimeStatus, SessionLifecycleAction, SessionLifecycleStatus,
    TranscriptRecord, TurnStatus,
};
use crate::service::agent_status::{self, AgentStatusService};

struct LiveRuntime {
    control: AgentRuntimeControl,
    state: Arc<Mutex<RuntimeState>>,
    alive: Arc<AtomicBool>,
    generation: u64,
}

pub struct AgentChatService {
    store: Arc<AgentChatStore>,
    factory: Arc<dyn AgentProviderFactory>,
    runtimes: Arc<Mutex<HashMap<String, LiveRuntime>>>,
    spawning: Mutex<HashSet<String>>,
    turn_gates: Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>,
    recent_events: Arc<std::sync::Mutex<HashMap<String, VecDeque<AgentChatEvent>>>>,
    events: broadcast::Sender<AgentChatEvent>,
    generations: AtomicU64,
    status: OnceLock<Arc<AgentStatusService>>,
}

impl AgentChatService {
    pub fn new(store: Arc<AgentChatStore>, factory: Arc<dyn AgentProviderFactory>) -> Self {
        let (events, _) = broadcast::channel(4096);
        Self {
            store,
            factory,
            runtimes: Arc::new(Mutex::new(HashMap::new())),
            spawning: Mutex::new(HashSet::new()),
            turn_gates: Arc::new(Mutex::new(HashMap::new())),
            recent_events: Arc::new(std::sync::Mutex::new(HashMap::new())),
            events,
            generations: AtomicU64::new(1),
            status: OnceLock::new(),
        }
    }

    pub fn set_status_service(&self, status: Arc<AgentStatusService>) {
        let _ = self.status.set(status);
    }

    async fn turn_gate(&self, chat_id: &str) -> Arc<Mutex<()>> {
        let mut gates = self.turn_gates.lock().await;
        gates
            .entry(chat_id.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    pub fn events_after(&self, chat_id: &str, after_sequence: u64) -> Vec<AgentChatEvent> {
        self.recent_events
            .lock()
            .map(|map| {
                map.get(chat_id)
                    .into_iter()
                    .flatten()
                    .filter(|event| event.sequence > after_sequence)
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn store(&self) -> &AgentChatStore {
        &self.store
    }

    pub fn save_attachment(
        &self,
        chat_id: &str,
        filename: &str,
        data: &[u8],
    ) -> Result<std::path::PathBuf> {
        self.store.save_attachment(chat_id, filename, data)
    }

    pub fn subscribe(&self) -> broadcast::Receiver<AgentChatEvent> {
        self.events.subscribe()
    }

    pub fn create(&self, req: CreateAgentChatRequest) -> Result<AgentChatMeta> {
        self.store.create(req)
    }

    pub fn list(
        &self,
        cwd: Option<&str>,
        workspace_id: Option<&str>,
        project_id: Option<&str>,
        all: bool,
        origin: Option<super::types::AgentChatOrigin>,
    ) -> Result<Vec<super::types::AgentChatIndexEntry>> {
        self.store
            .list(cwd, workspace_id, project_id, false, all, origin)
    }

    pub async fn get(&self, id: &str) -> Result<AgentChatSnapshot> {
        let mut snapshot = self.store.get_snapshot(id)?;
        let state = {
            let map = self.runtimes.lock().await;
            map.get(id).and_then(|runtime| {
                runtime
                    .alive
                    .load(Ordering::SeqCst)
                    .then(|| Arc::clone(&runtime.state))
            })
        };
        if let Some(state) = state {
            let state = state.lock().await;
            overlay_live_state(&mut snapshot, &state);
        }
        Ok(snapshot)
    }

    pub fn rename(&self, id: &str, title: &str) -> Result<AgentChatMeta> {
        self.store.rename(id, title)
    }

    pub async fn configure(
        &self,
        id: &str,
        provider_id: Option<String>,
        model: Option<String>,
        thinking: Option<String>,
        mode: Option<String>,
    ) -> Result<AgentChatMeta> {
        let live = {
            let map = self.runtimes.lock().await;
            map.get(id)
                .is_some_and(|runtime| runtime.alive.load(Ordering::SeqCst))
        };

        if let Some(provider) = provider_id.as_ref() {
            if !provider.trim().is_empty() && live {
                let current = self.store.get_meta(id)?;
                if current.provider_id != *provider {
                    return Err(ServiceError::Validation(
                        "cannot change agent while the agent is running".into(),
                    ));
                }
            }
        }

        let current = self.store.get_meta(id)?;
        let next_model = resolve_configure_select(&current, "model", model.as_ref());
        let next_thinking = resolve_configure_select(&current, "thinking", thinking.as_ref());
        let next_mode = resolve_configure_select(&current, "mode", mode.as_ref());
        let apply_model = model.is_some();
        let apply_thinking = thinking.is_some();
        let apply_mode = mode.is_some();

        let meta = self.store.update_meta(id, |meta| {
            if let Some(provider) = &provider_id {
                if !provider.trim().is_empty() {
                    meta.provider_id = provider.clone();
                }
            }
            if apply_model {
                meta.selected_model = next_model.clone();
            }
            if apply_thinking {
                meta.selected_thinking = next_thinking.clone();
            }
            if apply_mode {
                meta.selected_mode = next_mode.clone();
            }
        })?;

        Ok(meta)
    }

    pub async fn delete(&self, id: &str) -> Result<AgentChatMeta> {
        let runtime = self.runtimes.lock().await.remove(id);
        if let Some(runtime) = runtime {
            let control = runtime.control;
            tokio::spawn(async move {
                let _ = control.close().await;
            });
        }
        if let Some(status) = self.status.get() {
            status.remove_session(&agent_status::chat_status_session_id(id));
        }
        self.store.delete(id)
    }

    pub async fn send(
        &self,
        chat_id: &str,
        text: &str,
        attachments: Vec<String>,
    ) -> Result<String> {
        if text.trim().is_empty() && attachments.is_empty() {
            return Err(ServiceError::Validation("text is required".into()));
        }
        self.store
            .validate_attachment_paths(chat_id, &attachments)?;
        let gate = self.turn_gate(chat_id).await;
        let _turn = gate.lock().await;
        let meta = self.store.get_meta(chat_id)?;
        if let Some(runtime) = self.runtimes.lock().await.get(chat_id) {
            if !runtime.alive.load(Ordering::SeqCst) {
                // Pump is gone; fall through to a fresh spawn after the stale map entry is dropped.
            } else if runtime.state.lock().await.current_turn_id.is_some() {
                return Err(ServiceError::Validation(
                    "turn already running; queue or steer instead".into(),
                ));
            }
        }
        if let Some(turn) = self.store.folded_turns(chat_id)?.iter().rev().find(|turn| {
            matches!(
                turn.status,
                TurnStatus::Running | TurnStatus::WaitingPermission
            )
        }) {
            let runtime_busy = if let Some(runtime) = self.runtimes.lock().await.get(chat_id) {
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
                chat_id,
                &TranscriptRecord::TurnCompleted {
                    turn_id: turn.id.clone(),
                    status: TurnStatus::Failed,
                    error: Some("previous turn did not complete".into()),
                    worked_ms: None,
                    thinking_ms: None,
                    usage: None,
                    created_at: Utc::now(),
                },
            )?;
            self.store.update_meta(chat_id, |meta| {
                meta.runtime_status = RuntimeStatus::Ready;
            })?;
            self.emit(
                chat_id,
                AgentChatPayload::TurnCompleted {
                    turn_id: turn.id.clone(),
                    status: TurnStatus::Failed,
                    worked_ms: None,
                    thinking_ms: None,
                    completed_at: None,
                    usage: None,
                },
            )?;
        }
        let turn_id = uuid::Uuid::new_v4().to_string();
        let created_at = Utc::now();
        self.store.append_record(
            chat_id,
            &TranscriptRecord::TurnStarted {
                turn_id: turn_id.clone(),
                created_at,
            },
        )?;
        let message_id = uuid::Uuid::new_v4().to_string();
        self.store.append_record(
            chat_id,
            &TranscriptRecord::UserMessage {
                turn_id: turn_id.clone(),
                message_id: message_id.clone(),
                kind: UserMessageKind::Normal,
                text: text.to_string(),
                attachments: attachments.clone(),
                created_at,
            },
        )?;
        let mut seeded_title: Option<String> = None;
        self.store.update_meta(chat_id, |meta| {
            meta.runtime_status = RuntimeStatus::RunningTurn;
            meta.last_message_at = Some(Utc::now());
            if meta.title.is_none() {
                let line = text.trim().lines().next().unwrap_or("").trim();
                if !line.is_empty() {
                    let title: String = line.chars().take(60).collect();
                    meta.title = Some(title.clone());
                    seeded_title = Some(title);
                }
            }
        })?;
        if let Some(title) = seeded_title {
            self.emit(
                chat_id,
                AgentChatPayload::TitleUpdated { title: Some(title) },
            )?;
        }
        self.emit(
            chat_id,
            AgentChatPayload::TurnStarted {
                turn_id: turn_id.clone(),
                created_at: Some(created_at),
            },
        )?;
        if let Some(status) = self.status.get() {
            if let Ok(meta) = self.store.get_meta(chat_id) {
                agent_status::apply_host_event(
                    status,
                    &meta,
                    &AgentEvent::TurnStarted {
                        turn_id: turn_id.clone(),
                    },
                );
            }
        }
        self.emit(
            chat_id,
            AgentChatPayload::UserMessage {
                turn_id: turn_id.clone(),
                message_id,
                kind: UserMessageKind::Normal,
                text: text.to_string(),
                attachments: attachments.clone(),
                created_at: Some(created_at),
            },
        )?;
        let _ = meta;
        let control = match self.ensure_runtime(chat_id, Some(turn_id.clone())).await {
            Ok(control) => {
                self.stamp_turn_clock(chat_id, &turn_id, created_at).await;
                control
            }
            Err(error) => {
                let _ = self.store.append_record(
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
                let _ = self.store.update_meta(chat_id, |meta| {
                    meta.runtime_status = RuntimeStatus::Detached;
                });
                let _ = self.emit(
                    chat_id,
                    AgentChatPayload::TurnCompleted {
                        turn_id: turn_id.clone(),
                        status: TurnStatus::Failed,
                        worked_ms: None,
                        thinking_ms: None,
                        completed_at: None,
                        usage: None,
                    },
                );
                return Err(error);
            }
        };
        apply_pending_session_config(
            chat_id,
            &turn_id,
            &self.store,
            &control,
            &self.events,
            &self.recent_events,
        )
        .await?;
        if let Err(error) = control
            .prompt(AgentPrompt {
                text: text.to_string(),
                attachments,
                kind: UserMessageKind::Normal,
                turn_id: Some(turn_id.clone()),
            })
            .await
        {
            if let Some(runtime) = self.runtimes.lock().await.get(chat_id) {
                let mut state = runtime.state.lock().await;
                if state.current_turn_id.as_deref() == Some(turn_id.as_str()) {
                    state.current_turn_id = None;
                }
            }
            let _ = self.store.append_record(
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
            let _ = self.store.update_meta(chat_id, |meta| {
                meta.runtime_status = RuntimeStatus::Detached;
            });
            let _ = self.emit(
                chat_id,
                AgentChatPayload::TurnCompleted {
                    turn_id: turn_id.clone(),
                    status: TurnStatus::Failed,
                    worked_ms: None,
                    thinking_ms: None,
                    completed_at: None,
                    usage: None,
                },
            );
            return Err(ServiceError::Processing(error.to_string()));
        }
        Ok(turn_id)
    }

    pub async fn steer(&self, chat_id: &str, expected_turn_id: &str, text: &str) -> Result<String> {
        let meta = self.store.get_meta(chat_id)?;
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
                .get(chat_id)
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
        let created_at = Utc::now();
        self.store.append_record(
            chat_id,
            &TranscriptRecord::UserMessage {
                turn_id: expected_turn_id.to_string(),
                message_id: message_id.clone(),
                kind: UserMessageKind::Steer,
                text: text.to_string(),
                attachments: Vec::new(),
                created_at,
            },
        )?;
        self.emit(
            chat_id,
            AgentChatPayload::UserMessage {
                turn_id: expected_turn_id.to_string(),
                message_id,
                kind: UserMessageKind::Steer,
                text: text.to_string(),
                attachments: Vec::new(),
                created_at: Some(created_at),
            },
        )?;
        Ok(expected_turn_id.to_string())
    }

    pub async fn cancel(&self, chat_id: &str) -> Result<()> {
        let control = self
            .runtimes
            .lock()
            .await
            .get(chat_id)
            .map(|runtime| runtime.control.clone());
        if let Some(control) = control {
            control
                .cancel()
                .await
                .map_err(|e| ServiceError::Processing(e.to_string()))?;
        } else {
            if let Some(turn) = self.store.folded_turns(chat_id)?.iter().rev().find(|turn| {
                matches!(
                    turn.status,
                    TurnStatus::Running | TurnStatus::WaitingPermission
                )
            }) {
                self.store.append_record(
                    chat_id,
                    &TranscriptRecord::TurnCompleted {
                        turn_id: turn.id.clone(),
                        status: TurnStatus::Canceled,
                        error: None,
                        worked_ms: None,
                        thinking_ms: None,
                        usage: None,
                        created_at: Utc::now(),
                    },
                )?;
                self.emit(
                    chat_id,
                    AgentChatPayload::TurnCompleted {
                        turn_id: turn.id.clone(),
                        status: TurnStatus::Canceled,
                        worked_ms: None,
                        thinking_ms: None,
                        completed_at: None,
                        usage: None,
                    },
                )?;
            }
            self.store.update_meta(chat_id, |meta| {
                if !matches!(meta.runtime_status, RuntimeStatus::Closed) {
                    meta.runtime_status = RuntimeStatus::Detached;
                }
            })?;
        }
        Ok(())
    }

    pub fn queue_add(
        &self,
        chat_id: &str,
        text: &str,
        attachments: Vec<String>,
    ) -> Result<QueueItem> {
        if text.trim().is_empty() && attachments.is_empty() {
            return Err(ServiceError::Validation("text is required".into()));
        }
        self.store
            .validate_attachment_paths(chat_id, &attachments)?;
        let (item, items) = self.store.mutate_queue(chat_id, |items| {
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
        self.emit(chat_id, AgentChatPayload::QueueUpdated { items })?;
        Ok(item)
    }

    pub fn queue_update(
        &self,
        chat_id: &str,
        item_id: &str,
        text: Option<String>,
        status: Option<QueueItemStatus>,
    ) -> Result<QueueItem> {
        let (cloned, items) = self.store.mutate_queue(chat_id, |items| {
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
        self.emit(chat_id, AgentChatPayload::QueueUpdated { items })?;
        Ok(cloned)
    }

    pub fn queue_reorder(&self, chat_id: &str, item_ids: &[String]) -> Result<Vec<QueueItem>> {
        let next = self.store.mutate_queue(chat_id, |current| {
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
            chat_id,
            AgentChatPayload::QueueUpdated {
                items: next.clone(),
            },
        )?;
        Ok(next)
    }

    pub fn queue_delete(&self, chat_id: &str, item_id: &str) -> Result<()> {
        let items = self.store.mutate_queue(chat_id, |items| {
            items.retain(|item| item.id != item_id);
            Ok(items.clone())
        })?;
        self.emit(chat_id, AgentChatPayload::QueueUpdated { items })?;
        Ok(())
    }

    pub async fn permission_respond(
        &self,
        chat_id: &str,
        request_id: &str,
        option_id: &str,
        answers: Option<serde_json::Value>,
        updated_input: Option<serde_json::Value>,
    ) -> Result<()> {
        let (control, pending) = {
            let map = self.runtimes.lock().await;
            let runtime = map
                .get(chat_id)
                .ok_or_else(|| ServiceError::Validation("no live runtime".into()))?;
            let pending = runtime.state.lock().await.pending_permission.clone();
            (runtime.control.clone(), pending)
        };
        let updated_input = updated_input.or_else(|| {
            let pending = pending.as_ref()?;
            let answers = answers.as_ref()?;
            if !agent::is_ask_user_tool(&pending.tool)
                && agent::questions_from_tool_input(pending.raw_input.as_ref()).is_none()
            {
                return None;
            }
            let mut input = pending
                .raw_input
                .clone()
                .unwrap_or_else(|| serde_json::json!({}));
            if let Some(obj) = input.as_object_mut() {
                if let Some(questions) = pending
                    .questions
                    .clone()
                    .or_else(|| agent::questions_from_tool_input(pending.raw_input.as_ref()))
                {
                    obj.insert("questions".into(), questions);
                }
                obj.insert("answers".into(), answers.clone());
            }
            Some(input)
        });
        control
            .respond_permission(
                request_id,
                agent::PermissionDecision {
                    option_id: option_id.to_string(),
                    answers: answers.clone(),
                    updated_input,
                },
            )
            .await
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        let turn_id = if let Some(runtime) = self.runtimes.lock().await.get(chat_id) {
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
            chat_id,
            &TranscriptRecord::Permission {
                turn_id,
                request: PendingPermission {
                    request_id: request_id.to_string(),
                    tool: pending
                        .as_ref()
                        .map(|row| row.tool.clone())
                        .unwrap_or_default(),
                    description: pending
                        .as_ref()
                        .map(|row| row.description.clone())
                        .unwrap_or_default(),
                    content_markdown: pending
                        .as_ref()
                        .and_then(|row| row.content_markdown.clone()),
                    questions: pending.as_ref().and_then(|row| row.questions.clone()),
                    raw_input: pending.as_ref().and_then(|row| row.raw_input.clone()),
                    options: pending
                        .as_ref()
                        .map(|row| row.options.clone())
                        .unwrap_or_default(),
                    status: "resolved".into(),
                },
                created_at: Utc::now(),
            },
        );
        self.emit(
            chat_id,
            AgentChatPayload::PermissionResolved {
                request_id: request_id.to_string(),
                option_id: option_id.to_string(),
            },
        )?;
        Ok(())
    }

    async fn stamp_turn_clock(
        &self,
        chat_id: &str,
        turn_id: &str,
        started_at: chrono::DateTime<Utc>,
    ) {
        if let Some(runtime) = self.runtimes.lock().await.get(chat_id) {
            runtime
                .state
                .lock()
                .await
                .begin_turn(turn_id.to_string(), started_at);
        }
    }

    async fn ensure_runtime(
        &self,
        chat_id: &str,
        initial_turn_id: Option<String>,
    ) -> Result<AgentRuntimeControl> {
        loop {
            {
                let map = self.runtimes.lock().await;
                if let Some(runtime) = map.get(chat_id) {
                    if runtime.alive.load(Ordering::SeqCst) {
                        if let Some(turn_id) = &initial_turn_id {
                            runtime.state.lock().await.current_turn_id = Some(turn_id.clone());
                        }
                        return Ok(runtime.control.clone());
                    }
                }
            }
            let mut spawning = self.spawning.lock().await;
            if spawning.contains(chat_id) {
                drop(spawning);
                tokio::time::sleep(Duration::from_millis(20)).await;
                continue;
            }
            spawning.insert(chat_id.to_string());
            drop(spawning);
            break;
        }
        let result = self.spawn_runtime(chat_id, initial_turn_id).await;
        self.spawning.lock().await.remove(chat_id);
        result
    }

    async fn spawn_runtime(
        &self,
        chat_id: &str,
        initial_turn_id: Option<String>,
    ) -> Result<AgentRuntimeControl> {
        if let Some(runtime) = self.runtimes.lock().await.get(chat_id) {
            if runtime.alive.load(Ordering::SeqCst) {
                if let Some(turn_id) = &initial_turn_id {
                    runtime.state.lock().await.current_turn_id = Some(turn_id.clone());
                }
                return Ok(runtime.control.clone());
            }
        }
        let meta = self.store.get_meta(chat_id)?;
        let action = if meta.persistence_handle.is_some() {
            SessionLifecycleAction::Resume
        } else {
            SessionLifecycleAction::Create
        };
        let started = Instant::now();
        if let Some(turn_id) = &initial_turn_id {
            self.persist_session_lifecycle(
                chat_id,
                turn_id,
                action,
                SessionLifecycleStatus::Running,
                None,
                None,
            )?;
        }
        let provider = match self.factory.provider_for(&meta.provider_id).await {
            Ok(provider) => provider,
            Err(error) => {
                self.finish_session_lifecycle(
                    chat_id,
                    initial_turn_id.as_deref(),
                    action,
                    started,
                    SessionLifecycleStatus::Failed,
                    Some(error.to_string()),
                );
                return Err(ServiceError::Processing(error.to_string()));
            }
        };
        let cfg = AgentRuntimeConfig {
            cwd: std::path::PathBuf::from(&meta.cwd),
            model: if meta.persistence_handle.is_some() {
                meta.applied_model
                    .clone()
                    .or_else(|| meta.selected_model.clone())
            } else {
                meta.selected_model.clone()
            },
            thinking: if meta.persistence_handle.is_some() {
                meta.applied_thinking
                    .clone()
                    .or_else(|| meta.selected_thinking.clone())
            } else {
                meta.selected_thinking.clone()
            },
            mode: if meta.persistence_handle.is_some() {
                meta.applied_mode
                    .clone()
                    .or_else(|| meta.selected_mode.clone())
            } else {
                meta.selected_mode.clone()
            },
            extra_config: HashMap::new(),
            env_overrides: None,
            auth_method_id: None,
            allow_file_access: meta.workspace_id.is_some() || meta.project_id.is_some(),
        };
        let session = match if let Some(handle) = meta.persistence_handle.clone() {
            provider
                .resume_runtime(AgentPersistenceHandle::new(handle), cfg)
                .await
        } else {
            provider.create_runtime(cfg).await
        } {
            Ok(session) => {
                self.finish_session_lifecycle(
                    chat_id,
                    initial_turn_id.as_deref(),
                    action,
                    started,
                    SessionLifecycleStatus::Completed,
                    None,
                );
                session
            }
            Err(error) => {
                self.finish_session_lifecycle(
                    chat_id,
                    initial_turn_id.as_deref(),
                    action,
                    started,
                    SessionLifecycleStatus::Failed,
                    Some(error.to_string()),
                );
                return Err(ServiceError::Processing(error.to_string()));
            }
        };
        let capabilities = session.capabilities();
        self.store.update_meta(chat_id, |meta| {
            if !matches!(
                meta.runtime_status,
                RuntimeStatus::RunningTurn | RuntimeStatus::WaitingPermission
            ) {
                meta.runtime_status = RuntimeStatus::Starting;
            }
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
            last_activity: Instant::now(),
            turn_started_at: None,
            thinking_started_at: None,
            thinking_ms: 0,
            last_thinking_segment_ms: 0,
            turn_usage: None,
        }));
        let generation = self.generations.fetch_add(1, Ordering::SeqCst);
        self.runtimes.lock().await.insert(
            chat_id.to_string(),
            LiveRuntime {
                control: control.clone(),
                state: Arc::clone(&state),
                alive: Arc::clone(&alive),
                generation,
            },
        );
        let store = Arc::clone(&self.store);
        let events = self.events.clone();
        let chat_id_owned = chat_id.to_string();
        let pump_control = control.clone();
        let runtimes = Arc::clone(&self.runtimes);
        let recent_events = Arc::clone(&self.recent_events);
        let turn_gates = Arc::clone(&self.turn_gates);
        let status = self.status.get().cloned();
        tokio::spawn(async move {
            pump_session(
                chat_id_owned.clone(),
                session,
                store.clone(),
                state,
                events.clone(),
                pump_control,
                Arc::clone(&recent_events),
                turn_gates,
                status,
                generation,
                Arc::clone(&runtimes),
            )
            .await;
            alive.store(false, Ordering::SeqCst);
            let mut map = runtimes.lock().await;
            if map
                .get(&chat_id_owned)
                .is_some_and(|runtime| runtime.generation == generation)
            {
                map.remove(&chat_id_owned);
            }
            drop(map);
            let status = store
                .get_meta(&chat_id_owned)
                .map(|meta| meta.runtime_status)
                .unwrap_or(RuntimeStatus::Detached);
            if !matches!(status, RuntimeStatus::Closed | RuntimeStatus::Detached) {
                let _ = store.update_meta(&chat_id_owned, |meta| {
                    meta.runtime_status = RuntimeStatus::Detached;
                });
            }
            let _ = emit_live(
                &chat_id_owned,
                AgentChatPayload::RuntimeStatus {
                    status: if matches!(status, RuntimeStatus::Closed) {
                        RuntimeStatus::Closed
                    } else {
                        RuntimeStatus::Detached
                    },
                    persistence_handle: None,
                },
                &store,
                &events,
                &recent_events,
            );
        });
        Ok(control)
    }

    fn emit(&self, chat_id: &str, payload: AgentChatPayload) -> Result<()> {
        emit_live(
            chat_id,
            payload,
            &self.store,
            &self.events,
            &self.recent_events,
        )
    }

    fn persist_session_lifecycle(
        &self,
        chat_id: &str,
        turn_id: &str,
        action: SessionLifecycleAction,
        status: SessionLifecycleStatus,
        duration_ms: Option<u64>,
        error: Option<String>,
    ) -> Result<()> {
        let message_id = format!("session-{turn_id}");
        self.store.append_record(
            chat_id,
            &TranscriptRecord::SessionLifecycle {
                turn_id: turn_id.to_string(),
                message_id: message_id.clone(),
                action,
                status,
                duration_ms,
                error: error.clone(),
                created_at: Utc::now(),
            },
        )?;
        self.emit(
            chat_id,
            AgentChatPayload::SessionLifecycle {
                turn_id: turn_id.to_string(),
                message_id,
                action,
                status,
                duration_ms,
                error,
            },
        )
    }

    fn finish_session_lifecycle(
        &self,
        chat_id: &str,
        turn_id: Option<&str>,
        action: SessionLifecycleAction,
        started: Instant,
        status: SessionLifecycleStatus,
        error: Option<String>,
    ) {
        let Some(turn_id) = turn_id else {
            return;
        };
        let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
        let _ = self.persist_session_lifecycle(
            chat_id,
            turn_id,
            action,
            status,
            Some(duration_ms),
            error,
        );
    }

    pub async fn close_workspace(&self, workspace_id: &str) -> usize {
        let ids = self
            .store
            .list(None, Some(workspace_id), None, true, false, None)
            .unwrap_or_default()
            .into_iter()
            .map(|entry| entry.id)
            .collect::<Vec<_>>();
        let mut closed = 0;
        for id in ids {
            if self.close_runtime(&id).await {
                closed += 1;
            }
        }
        closed
    }

    pub async fn unload_idle(&self, timeout: Duration) -> Vec<String> {
        let now = Instant::now();
        let mut closing = Vec::new();
        {
            let map = self.runtimes.lock().await;
            for (id, runtime) in map.iter() {
                if !runtime.alive.load(Ordering::SeqCst) {
                    continue;
                }
                let state = runtime.state.lock().await;
                if state.current_turn_id.is_some()
                    || state.pending_permission.is_some()
                    || now.duration_since(state.last_activity) < timeout
                {
                    continue;
                }
                closing.push((id.clone(), runtime.control.clone()));
            }
        }
        let mut closed = Vec::new();
        for (id, control) in closing {
            let _ = control.close().await;
            closed.push(id);
        }
        closed
    }

    async fn close_runtime(&self, chat_id: &str) -> bool {
        let runtime = self.runtimes.lock().await.remove(chat_id);
        let Some(runtime) = runtime else {
            return false;
        };
        runtime.alive.store(false, Ordering::SeqCst);
        let _ = runtime.control.close().await;
        let _ = self.store.update_meta(chat_id, |meta| {
            if !matches!(meta.runtime_status, RuntimeStatus::Closed) {
                meta.runtime_status = RuntimeStatus::Detached;
            }
        });
        true
    }
}

#[allow(clippy::too_many_arguments)]
async fn pump_session(
    chat_id: String,
    mut session: Box<dyn AgentRuntime>,
    store: Arc<AgentChatStore>,
    state: Arc<Mutex<RuntimeState>>,
    events: broadcast::Sender<AgentChatEvent>,
    control: AgentRuntimeControl,
    recent_events: Arc<std::sync::Mutex<HashMap<String, VecDeque<AgentChatEvent>>>>,
    turn_gates: Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>,
    status: Option<Arc<AgentStatusService>>,
    generation: u64,
    runtimes: Arc<Mutex<HashMap<String, LiveRuntime>>>,
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
        if let Some(status) = &status {
            if let Ok(meta) = store.get_meta(&chat_id) {
                agent_status::apply_host_event(status, &meta, &event);
            }
        }
        if let Err(error) =
            apply_event(&chat_id, event, &store, &state, &events, &recent_events).await
        {
            warn!("agent chat pump error: {error}");
        }
        if should_dispatch {
            if let Err(error) = maybe_dispatch_queue(
                &chat_id,
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
    let replaced = runtimes
        .lock()
        .await
        .get(&chat_id)
        .is_some_and(|runtime| runtime.generation != generation);
    if replaced {
        return;
    }
    if let Some(turn_id) = state.lock().await.current_turn_id.clone() {
        let emit = |payload: AgentChatPayload| -> Result<()> {
            emit_live(&chat_id, payload, &store, &events, &recent_events)
        };
        let _ = finish_turn(
            &chat_id,
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
    let _ = store.update_meta(&chat_id, |meta| {
        meta.runtime_status = status;
    });
}

fn resolve_configure_select(
    meta: &AgentChatMeta,
    kind: &str,
    requested: Option<&String>,
) -> Option<String> {
    let requested = requested.and_then(|value| nonempty_opt(value.clone()))?;
    match resolve_session_config_select(meta, kind, &requested) {
        ResolvedSessionConfig::Advertised { value, .. }
        | ResolvedSessionConfig::PassThrough(value) => Some(value),
        ResolvedSessionConfig::Invalid => None,
    }
}
