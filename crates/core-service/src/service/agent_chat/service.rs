use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use agent::providers::{chat_provider_kind, ChatProviderKind};
use agent::{
    canonicalize_chat_provider_id, AgentAction, AgentActionError, AgentActionResult,
    AgentCheckpoint, AgentEvent, AgentPermissionOption, AgentPersistenceHandle, AgentPrompt,
    AgentProviderFactory, AgentRuntime, AgentRuntimeConfig, AgentRuntimeControl,
    AgentSessionOpRequest, Capability, SessionOpKind, UserMessageKind,
};
use chrono::Utc;
use tokio::sync::{broadcast, Mutex};
use tracing::warn;

use crate::error::{Result, ServiceError};

use super::apply_event::{
    apply_event, apply_pending_session_config, emit_live, finish_turn, nonempty_opt,
    overlay_live_state, RuntimeState,
};
use super::options::OptionsPrefetchWorker;
use super::queue::maybe_dispatch_queue;
use super::store::AgentChatStore;
use super::types::{
    apply_rewind_view, resolve_session_config_select, AgentChatEvent, AgentChatMeta,
    AgentChatPayload, AgentChatSessionOpOutcome, AgentChatSnapshot, CreateAgentChatRequest,
    FoldedTurn, MessagePart, PendingPermission, PendingSessionOp, QueueItem, QueueItemStatus,
    ResolvedSessionConfig, RewindView, RuntimeStatus, SessionLifecycleAction,
    SessionLifecycleStatus, TranscriptEnvelope, TranscriptEvent, TurnStatus,
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
    options: OnceLock<Arc<OptionsPrefetchWorker>>,
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
            options: OnceLock::new(),
        }
    }

    pub fn set_status_service(&self, status: Arc<AgentStatusService>) {
        let _ = self.status.set(status);
    }

    fn apply_status_host_event(&self, chat_id: &str, event: &AgentEvent) {
        if let Some(status) = self.status.get() {
            if let Ok(meta) = self.store.get_meta(chat_id) {
                agent_status::apply_host_event(status, &meta, event);
            }
        }
    }

    pub fn set_options_worker(&self, worker: Arc<OptionsPrefetchWorker>) {
        let _ = self.options.set(worker);
    }

    fn ready_options(&self, provider_id: &str) -> Option<agent::AgentOptionsSnapshot> {
        let catalog = self.options.get()?.cache_get(provider_id)?;
        (catalog.status == agent::OptionsStatus::Ok).then_some(catalog)
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
        let catalog = self.ready_options(&req.provider_id);
        let meta = self.store.create(req)?;
        self.store.update_meta(&meta.id, |row| {
            if let Some(catalog) = catalog.as_ref() {
                agent::apply_options_to_descriptor(&mut row.descriptor, catalog);
            }
            super::apply_event::seed_available_commands(
                &row.provider_id,
                &mut row.available_commands,
                catalog.as_ref(),
            );
        })
    }

    /// Persist the New Chat composer snapshot for `provider_id`.
    /// Call from landing chrome (`prefs_set`), never from eager `agent_chat_create`.
    pub fn persist_last_new_chat_config(
        &self,
        provider_id: &str,
        model: Option<&str>,
        thinking: Option<&str>,
        mode: Option<&str>,
        permission_mode: Option<&str>,
        fast: Option<&str>,
    ) -> Result<()> {
        let snapshot = super::new_chat_configs::snapshot_from_create_fields(
            model,
            thinking,
            mode,
            permission_mode,
            fast,
        );
        super::new_chat_configs::upsert_agent_new_chat_config(provider_id, snapshot)?;
        Ok(())
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

    #[allow(clippy::too_many_arguments)]
    pub async fn configure(
        &self,
        id: &str,
        provider_id: Option<String>,
        model: Option<String>,
        thinking: Option<String>,
        mode: Option<String>,
        permission_mode: Option<String>,
        fast: Option<String>,
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
        let next_provider = provider_id
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .unwrap_or(current.provider_id.as_str());
        let provider_changed = next_provider != current.provider_id;
        let catalog = self.ready_options(next_provider);
        let mut resolve_meta = current.clone();
        if provider_changed {
            resolve_meta.provider_id = next_provider.to_string();
            resolve_meta.descriptor = agent::rebuild_descriptor_for_provider(
                next_provider,
                resolve_meta.descriptor.current_config.clone(),
                catalog.as_ref(),
            );
        } else if !live
            && resolve_meta.descriptor.supported_options.models.is_empty()
            && resolve_meta.descriptor.supported_options.modes.is_empty()
            && resolve_meta
                .descriptor
                .supported_options
                .permission_modes
                .is_empty()
        {
            if let Some(catalog) = catalog.as_ref() {
                agent::apply_options_to_descriptor(&mut resolve_meta.descriptor, catalog);
            }
        }
        let permission_is_plan = agent::is_plan_mode(permission_mode.as_deref());
        let mode_input = if mode.is_some() {
            mode.clone()
        } else if permission_is_plan {
            permission_mode.clone()
        } else {
            None
        };
        let claude_mode_alias = permission_mode.is_none()
            && provider_canonicalizes_to_claude(next_provider)
            && mode
                .as_deref()
                .is_some_and(|value| !agent::is_plan_mode(Some(value)));
        let permission_mode_input = if permission_mode.is_some() && !permission_is_plan {
            permission_mode.clone()
        } else if claude_mode_alias {
            mode.clone()
        } else {
            None
        };
        let permission_mode_input = permission_mode_input
            .and_then(|raw| agent::normalize_stored_permission(&raw).or(Some(raw)));
        let next_model = resolve_configure_select(&resolve_meta, "model", model.as_ref());
        let next_thinking = resolve_configure_select(&resolve_meta, "thinking", thinking.as_ref());
        let next_mode = resolve_configure_select(&resolve_meta, "mode", mode_input.as_ref());
        let next_permission_mode = resolve_configure_select(
            &resolve_meta,
            "permission_mode",
            permission_mode_input.as_ref(),
        );
        let next_fast = resolve_configure_select(&resolve_meta, "fast", fast.as_ref());
        let apply_model = model.is_some();
        let apply_thinking = thinking.is_some();
        let apply_mode = mode_input.is_some();
        let apply_permission_mode = permission_mode_input.is_some();
        let apply_fast = fast.is_some();
        let stamp_descriptor = provider_changed
            || resolve_meta.descriptor.identity.id != current.descriptor.identity.id
            || resolve_meta.descriptor.supported_options != current.descriptor.supported_options;
        let stamped = stamp_descriptor.then(|| resolve_meta.descriptor.clone());

        let meta = self.store.update_meta(id, |meta| {
            if let Some(descriptor) = stamped.clone() {
                meta.descriptor = descriptor;
            }
            if let Some(provider) = &provider_id {
                if !provider.trim().is_empty() {
                    meta.provider_id = provider.clone();
                }
            }
            if apply_model {
                meta.descriptor.current_config.model = next_model.clone();
            }
            if apply_thinking {
                meta.descriptor.current_config.thinking = next_thinking.clone();
            }
            if apply_mode {
                meta.descriptor.current_config.mode = next_mode.clone();
            }
            if apply_permission_mode {
                meta.descriptor.current_config.permission_mode = next_permission_mode.clone();
            }
            if apply_fast {
                meta.descriptor.current_config.fast = next_fast.clone();
            }
            if provider_changed {
                meta.available_commands = catalog
                    .as_ref()
                    .map(|catalog| catalog.commands.clone())
                    .unwrap_or_default();
                super::apply_event::seed_available_commands(
                    &meta.provider_id,
                    &mut meta.available_commands,
                    catalog.as_ref(),
                );
            }
        })?;

        if !live {
            return Ok(meta);
        }
        let gate = self.turn_gate(id).await;
        let Ok(_turn) = gate.try_lock() else {
            return self.store.get_meta(id);
        };
        let busy = self.live_turn_is_busy(id).await;
        if busy {
            return Ok(meta);
        }
        let runtimes = self.runtimes.lock().await;
        let Some(runtime) = runtimes.get(id) else {
            return Ok(meta);
        };
        if !runtime.alive.load(Ordering::SeqCst) {
            return Ok(meta);
        }
        let control = runtime.control.clone();
        let state = Arc::clone(&runtime.state);
        drop(runtimes);
        let store = Arc::clone(&self.store);
        let events = self.events.clone();
        let recent_events = Arc::clone(&self.recent_events);
        let chat_id = id.to_string();
        if let Err(error) = super::apply_event::sync_pending_session_config_if_needed(
            &chat_id,
            &store,
            &control,
            &state,
            &events,
            &recent_events,
        )
        .await
        {
            warn!("agent chat configure sync error: {error}");
        }
        self.store.get_meta(id)
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

    pub async fn evict_runtimes_for_provider(&self, provider_id: &str) {
        let ids: Vec<String> = self.runtimes.lock().await.keys().cloned().collect();
        for id in ids {
            let matches = self
                .store
                .get_meta(&id)
                .ok()
                .is_some_and(|meta| meta.provider_id == provider_id);
            if matches {
                self.close_runtime(&id).await;
            }
        }
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
        let busy = self.live_turn_is_busy(chat_id).await;
        if let Some(intercept) = parse_session_op_intercept(&meta, text) {
            if busy {
                return Err(ServiceError::Validation(
                    "session ops are only available when the agent is idle".into(),
                ));
            }
            return self.begin_session_op(chat_id, intercept).await;
        }
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
                &TranscriptEnvelope::new(
                    turn.id.clone(),
                    TranscriptEvent::TurnCompleted {
                        status: TurnStatus::Failed,
                        error: Some("previous turn did not complete".into()),
                        worked_ms: None,
                        thinking_ms: None,
                        usage: None,
                    },
                ),
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
                    error: Some("previous turn did not complete".into()),
                },
            )?;
        }
        let turn_id = uuid::Uuid::new_v4().to_string();
        let created_at = Utc::now();
        self.store.append_record(
            chat_id,
            &TranscriptEnvelope::at(turn_id.clone(), created_at, TranscriptEvent::TurnStarted),
        )?;
        let message_id = uuid::Uuid::new_v4().to_string();
        self.store.append_record(
            chat_id,
            &TranscriptEnvelope::at(
                turn_id.clone(),
                created_at,
                TranscriptEvent::UserMessage {
                    message_id: message_id.clone(),
                    kind: UserMessageKind::Normal,
                    text: text.to_string(),
                    attachments: attachments.clone(),
                },
            ),
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
                let error_message = error.to_string();
                let _ = self.store.append_record(
                    chat_id,
                    &TranscriptEnvelope::new(
                        turn_id.clone(),
                        TranscriptEvent::TurnCompleted {
                            status: TurnStatus::Failed,
                            error: Some(error_message.clone()),
                            worked_ms: None,
                            thinking_ms: None,
                            usage: None,
                        },
                    ),
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
                        error: Some(error_message.clone()),
                    },
                );
                self.apply_status_host_event(
                    chat_id,
                    &AgentEvent::TurnFailed {
                        turn_id,
                        error: error_message,
                    },
                );
                return Err(error);
            }
        };
        if let Err(error) = apply_pending_session_config(
            chat_id,
            &turn_id,
            &self.store,
            &control,
            &self.events,
            &self.recent_events,
        )
        .await
        {
            let error_message = error.to_string();
            if let Some(runtime) = self.runtimes.lock().await.get(chat_id) {
                let mut state = runtime.state.lock().await;
                if state.current_turn_id.as_deref() == Some(turn_id.as_str()) {
                    state.current_turn_id = None;
                }
            }
            let _ = self.store.append_record(
                chat_id,
                &TranscriptEnvelope::new(
                    turn_id.clone(),
                    TranscriptEvent::TurnCompleted {
                        status: TurnStatus::Failed,
                        error: Some(error_message.clone()),
                        worked_ms: None,
                        thinking_ms: None,
                        usage: None,
                    },
                ),
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
                    error: Some(error_message.clone()),
                },
            );
            self.apply_status_host_event(
                chat_id,
                &AgentEvent::TurnFailed {
                    turn_id: turn_id.clone(),
                    error: error_message,
                },
            );
            return Err(error);
        }
        if let Err(error) = control
            .send(AgentPrompt {
                text: text.to_string(),
                attachments,
                kind: UserMessageKind::Normal,
                turn_id: Some(turn_id.clone()),
            })
            .await
        {
            let error_message = error.to_string();
            if let Some(runtime) = self.runtimes.lock().await.get(chat_id) {
                let mut state = runtime.state.lock().await;
                if state.current_turn_id.as_deref() == Some(turn_id.as_str()) {
                    state.current_turn_id = None;
                }
            }
            let _ = self.store.append_record(
                chat_id,
                &TranscriptEnvelope::new(
                    turn_id.clone(),
                    TranscriptEvent::TurnCompleted {
                        status: TurnStatus::Failed,
                        error: Some(error_message.clone()),
                        worked_ms: None,
                        thinking_ms: None,
                        usage: None,
                    },
                ),
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
                    error: Some(error_message.clone()),
                },
            );
            self.apply_status_host_event(
                chat_id,
                &AgentEvent::TurnFailed {
                    turn_id,
                    error: error_message,
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
        if meta.descriptor.capabilities.steer != Capability::Supported {
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
            &TranscriptEnvelope::at(
                expected_turn_id.to_string(),
                created_at,
                TranscriptEvent::UserMessage {
                    message_id: message_id.clone(),
                    kind: UserMessageKind::Steer,
                    text: text.to_string(),
                    attachments: Vec::new(),
                },
            ),
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
            let mut canceled_turn_id = None;
            if let Some(turn) = self.store.folded_turns(chat_id)?.iter().rev().find(|turn| {
                matches!(
                    turn.status,
                    TurnStatus::Running | TurnStatus::WaitingPermission
                )
            }) {
                canceled_turn_id = Some(turn.id.clone());
                self.store.append_record(
                    chat_id,
                    &TranscriptEnvelope::new(
                        turn.id.clone(),
                        TranscriptEvent::TurnCompleted {
                            status: TurnStatus::Canceled,
                            error: None,
                            worked_ms: None,
                            thinking_ms: None,
                            usage: None,
                        },
                    ),
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
                        error: None,
                    },
                )?;
            }
            self.store.update_meta(chat_id, |meta| {
                if !matches!(meta.runtime_status, RuntimeStatus::Closed) {
                    meta.runtime_status = RuntimeStatus::Detached;
                }
            })?;
            if let Some(turn_id) = canceled_turn_id {
                self.apply_status_host_event(chat_id, &AgentEvent::TurnCanceled { turn_id });
            } else if let Some(status) = self.status.get() {
                status.force_session_idle(&agent_status::chat_status_session_id(chat_id));
            }
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
    ) -> Result<()> {
        let control = self
            .runtimes
            .lock()
            .await
            .get(chat_id)
            .map(|runtime| runtime.control.clone())
            .ok_or_else(|| ServiceError::Validation("no live runtime".into()))?;
        control
            .respond_permission(request_id, option_id)
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
            &TranscriptEnvelope::new(
                turn_id,
                TranscriptEvent::Permission {
                    request: PendingPermission {
                        request_id: request_id.to_string(),
                        tool: String::new(),
                        description: String::new(),
                        content_markdown: None,
                        options: Vec::new(),
                        questions: Vec::new(),
                        plan_todos: Vec::new(),
                        status: "resolved".into(),
                    },
                },
            ),
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

    pub async fn session_op_respond(
        &self,
        chat_id: &str,
        request_id: &str,
        option_id: &str,
    ) -> Result<()> {
        let meta = self.store.get_meta(chat_id)?;
        let pending = self.pending_session_op(chat_id).await;
        let Some(pending) = pending else {
            return Err(ServiceError::Validation("no pending session op".into()));
        };
        if pending.request.request_id != request_id {
            return Err(ServiceError::Validation(
                "session op request_id does not match".into(),
            ));
        }
        if option_id == SESSION_OP_CANCEL {
            self.clear_pending_session_op(chat_id).await?;
            self.emit(
                chat_id,
                AgentChatPayload::SessionOpResolved {
                    request_id: request_id.to_string(),
                    option_id: option_id.to_string(),
                    outcome: AgentChatSessionOpOutcome::Canceled,
                    error: None,
                },
            )?;
            return Ok(());
        }
        if is_two_phase_rewind(&meta.provider_id, pending.request.kind)
            && option_id.starts_with(TURN_OPTION_PREFIX)
            && pending.selected_turn_id.is_none()
        {
            return self
                .advance_rewind_phase_two(chat_id, pending, option_id)
                .await;
        }
        let control = self.ensure_runtime(chat_id, None).await?;
        let turns = apply_rewind_view(
            self.store.folded_turns(chat_id).unwrap_or_default(),
            meta.rewind_view.as_ref(),
        );
        let target = session_op_target(&pending, option_id, &turns);
        match control
            .action(AgentAction::RespondSessionOp {
                request_id: request_id.to_string(),
                option_id: option_id.to_string(),
                target,
            })
            .await
        {
            Ok(applied) => {
                self.finish_session_op_applied(chat_id, pending, option_id, applied)
                    .await
            }
            Err(AgentActionError::Unsupported { .. }) => {
                self.fail_session_op(
                    chat_id,
                    request_id,
                    option_id,
                    "session op is not supported",
                )
                .await
            }
            Err(error) => {
                self.fail_session_op(chat_id, request_id, option_id, &error.to_string())
                    .await
            }
        }
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
        let selected_model = if meta.persistence_handle.is_some() {
            meta.applied_model
                .clone()
                .or_else(|| meta.descriptor.current_config.model.clone())
        } else {
            meta.descriptor.current_config.model.clone()
        };
        let cfg = AgentRuntimeConfig {
            cwd: std::path::PathBuf::from(&meta.cwd),
            model: selected_model.and_then(nonempty_opt).or_else(|| {
                self.ready_options(&meta.provider_id).and_then(|catalog| {
                    catalog
                        .models
                        .iter()
                        .find(|model| model.is_default && model_id_usable(&model.id))
                        .or_else(|| {
                            catalog
                                .models
                                .iter()
                                .find(|model| model_id_usable(&model.id))
                        })
                        .map(|model| model.id.clone())
                })
            }),
            thinking: if meta.persistence_handle.is_some() {
                meta.applied_thinking
                    .clone()
                    .or_else(|| meta.descriptor.current_config.thinking.clone())
            } else {
                meta.descriptor.current_config.thinking.clone()
            },
            mode: if meta.persistence_handle.is_some() {
                meta.applied_mode
                    .clone()
                    .or_else(|| meta.descriptor.current_config.mode.clone())
            } else {
                meta.descriptor.current_config.mode.clone()
            },
            permission_mode: if meta.persistence_handle.is_some() {
                meta.applied_permission_mode
                    .clone()
                    .or_else(|| meta.descriptor.current_config.permission_mode.clone())
            } else {
                meta.descriptor.current_config.permission_mode.clone()
            },
            fast: if meta.persistence_handle.is_some() {
                meta.applied_fast
                    .clone()
                    .or_else(|| meta.descriptor.current_config.fast.clone())
            } else {
                meta.descriptor.current_config.fast.clone()
            },
            extra_config: HashMap::new(),
            env_overrides: None,
            auth_method_id: None,
            allow_file_access: meta.workspace_id.is_some() || meta.project_id.is_some(),
            checkpoints: checkpoints_from_turns(
                &self.store.folded_turns(chat_id).unwrap_or_default(),
            ),
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
        let live_descriptor = session.descriptor();
        self.store.update_meta(chat_id, |meta| {
            if !matches!(
                meta.runtime_status,
                RuntimeStatus::RunningTurn | RuntimeStatus::WaitingPermission
            ) {
                meta.runtime_status = RuntimeStatus::Starting;
            }
            let picker = meta.descriptor.current_config.clone();
            meta.descriptor = live_descriptor.clone();
            meta.descriptor.current_config = picker;
            if let Some(handle) = session.persistence_handle() {
                meta.persistence_handle = Some(handle.as_str().to_string());
            }
        })?;
        let control = session.control();
        let alive = Arc::new(AtomicBool::new(true));
        let pending_session_op = self
            .store
            .get_meta(chat_id)
            .ok()
            .and_then(|meta| meta.pending_session_op);
        let state = Arc::new(Mutex::new(RuntimeState {
            current_turn_id: initial_turn_id,
            pending_permission: None,
            pending_session_op,
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
            &TranscriptEnvelope::new(
                turn_id,
                TranscriptEvent::SessionLifecycle {
                    message_id: message_id.clone(),
                    action,
                    status,
                    duration_ms,
                    error: error.clone(),
                },
            ),
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
                    || state.pending_session_op.is_some()
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

    async fn live_turn_is_busy(&self, chat_id: &str) -> bool {
        if let Some(runtime) = self.runtimes.lock().await.get(chat_id) {
            if runtime.alive.load(Ordering::SeqCst)
                && runtime.state.lock().await.current_turn_id.is_some()
            {
                return true;
            }
        }
        false
    }

    async fn pending_session_op(&self, chat_id: &str) -> Option<PendingSessionOp> {
        if let Some(runtime) = self.runtimes.lock().await.get(chat_id) {
            if runtime.alive.load(Ordering::SeqCst) {
                if let Some(pending) = runtime.state.lock().await.pending_session_op.clone() {
                    return Some(pending);
                }
            }
        }
        self.store
            .get_meta(chat_id)
            .ok()
            .and_then(|meta| meta.pending_session_op)
    }

    async fn store_pending_session_op(
        &self,
        chat_id: &str,
        pending: PendingSessionOp,
    ) -> Result<()> {
        if let Some(runtime) = self.runtimes.lock().await.get(chat_id) {
            runtime.state.lock().await.pending_session_op = Some(pending.clone());
        }
        self.store.update_meta(chat_id, |meta| {
            meta.pending_session_op = Some(pending);
        })?;
        Ok(())
    }

    async fn clear_pending_session_op(&self, chat_id: &str) -> Result<()> {
        if let Some(runtime) = self.runtimes.lock().await.get(chat_id) {
            runtime.state.lock().await.pending_session_op = None;
        }
        self.store.update_meta(chat_id, |meta| {
            meta.pending_session_op = None;
        })?;
        Ok(())
    }

    async fn begin_session_op(
        &self,
        chat_id: &str,
        intercept: SessionOpIntercept,
    ) -> Result<String> {
        let control = self.ensure_runtime(chat_id, None).await?;
        let action = match &intercept {
            SessionOpIntercept::Fork { rest } => AgentAction::PrepareSessionOp {
                kind: SessionOpKind::Fork,
                rest: rest.clone(),
            },
            SessionOpIntercept::Rewind { rest } => AgentAction::PrepareSessionOp {
                kind: SessionOpKind::Rewind,
                rest: rest.clone(),
            },
            SessionOpIntercept::Redo => AgentAction::PrepareSessionOp {
                kind: SessionOpKind::Rewind,
                rest: "redo".into(),
            },
        };
        let prepared = control.action(action).await.ok();
        let mut request = self.build_session_op_chrome(chat_id, &intercept)?;
        if let Some(prepared) = prepared {
            if !prepared.options.is_empty() {
                request.options = with_cancel(prepared.options);
            }
        }
        let request_id = request.request_id.clone();
        self.store_pending_session_op(
            chat_id,
            PendingSessionOp {
                request: request.clone(),
                selected_turn_id: None,
            },
        )
        .await?;
        self.emit(chat_id, AgentChatPayload::SessionOpRequested { request })?;
        Ok(request_id)
    }

    fn build_session_op_chrome(
        &self,
        chat_id: &str,
        intercept: &SessionOpIntercept,
    ) -> Result<AgentSessionOpRequest> {
        let meta = self.store.get_meta(chat_id)?;
        let request_id = uuid::Uuid::new_v4().to_string();
        match intercept {
            SessionOpIntercept::Fork { .. } => Ok(AgentSessionOpRequest {
                request_id,
                kind: SessionOpKind::Fork,
                title: "Fork session".into(),
                description: None,
                options: fork_options(&meta.provider_id),
            }),
            SessionOpIntercept::Redo => Ok(AgentSessionOpRequest {
                request_id,
                kind: SessionOpKind::Rewind,
                title: "Redo".into(),
                description: None,
                options: vec![option("redo", "Redo", "rewind"), cancel_option()],
            }),
            SessionOpIntercept::Rewind { .. } => {
                let turns =
                    apply_rewind_view(self.store.folded_turns(chat_id)?, meta.rewind_view.as_ref());
                Ok(rewind_chrome(&meta.provider_id, request_id, &turns))
            }
        }
    }

    async fn advance_rewind_phase_two(
        &self,
        chat_id: &str,
        mut pending: PendingSessionOp,
        option_id: &str,
    ) -> Result<()> {
        let Some(token) = turn_id_from_option(option_id) else {
            return Err(ServiceError::Validation("invalid rewind target".into()));
        };
        let meta = self.store.get_meta(chat_id)?;
        let turns = apply_rewind_view(self.store.folded_turns(chat_id)?, meta.rewind_view.as_ref());
        let Some(turn_id) = resolve_turn_id(&turns, token) else {
            return Err(ServiceError::Validation("invalid rewind target".into()));
        };
        pending.selected_turn_id = Some(turn_id);
        let control = self.ensure_runtime(chat_id, None).await?;
        let target = session_op_target(&pending, option_id, &turns);
        let prepared = control
            .action(AgentAction::PrepareSessionOp {
                kind: SessionOpKind::Rewind,
                rest: target.unwrap_or_default(),
            })
            .await
            .ok();
        let has_file_changes = prepared.and_then(|result| result.has_file_changes);
        pending.request = AgentSessionOpRequest {
            request_id: pending.request.request_id.clone(),
            kind: SessionOpKind::Rewind,
            title: "Restore".into(),
            description: None,
            options: rewind_restore_options(&meta.provider_id, has_file_changes),
        };
        let request = pending.request.clone();
        self.store_pending_session_op(chat_id, pending).await?;
        self.emit(chat_id, AgentChatPayload::SessionOpRequested { request })?;
        Ok(())
    }

    async fn fail_session_op(
        &self,
        chat_id: &str,
        request_id: &str,
        option_id: &str,
        message: &str,
    ) -> Result<()> {
        self.clear_pending_session_op(chat_id).await?;
        self.emit(
            chat_id,
            AgentChatPayload::SessionOpResolved {
                request_id: request_id.to_string(),
                option_id: option_id.to_string(),
                outcome: AgentChatSessionOpOutcome::Failed,
                error: Some(message.to_string()),
            },
        )?;
        Ok(())
    }

    async fn finish_session_op_applied(
        &self,
        chat_id: &str,
        pending: PendingSessionOp,
        option_id: &str,
        applied: AgentActionResult,
    ) -> Result<()> {
        match pending.request.kind {
            SessionOpKind::Fork => {
                let Some(session_id) = applied.new_session_id.filter(|id| !id.is_empty()) else {
                    return self
                        .fail_session_op(
                            chat_id,
                            &pending.request.request_id,
                            option_id,
                            "fork did not return a vendor session id",
                        )
                        .await;
                };
                let child = self
                    .store
                    .create_fork_sibling(chat_id, session_id, applied.new_cwd)?;
                self.clear_pending_session_op(chat_id).await?;
                self.emit(
                    chat_id,
                    AgentChatPayload::SessionOpResolved {
                        request_id: pending.request.request_id.clone(),
                        option_id: option_id.to_string(),
                        outcome: AgentChatSessionOpOutcome::Applied,
                        error: None,
                    },
                )?;
                self.emit(
                    chat_id,
                    AgentChatPayload::SessionForked {
                        parent_chat_id: chat_id.to_string(),
                        chat_id: child.id,
                    },
                )?;
            }
            SessionOpKind::Rewind => {
                self.clear_pending_session_op(chat_id).await?;
                if option_id == "redo" {
                    self.store.update_meta(chat_id, |meta| {
                        meta.rewind_view = None;
                    })?;
                    self.emit(
                        chat_id,
                        AgentChatPayload::RewindViewUpdated {
                            until_turn_id: None,
                        },
                    )?;
                } else if is_conversation_restore(option_id) {
                    let until_turn_id = pending
                        .selected_turn_id
                        .clone()
                        .or_else(|| turn_id_from_option(option_id).map(str::to_string));
                    if let Some(until_turn_id) = until_turn_id {
                        self.store.update_meta(chat_id, |meta| {
                            meta.rewind_view = Some(RewindView {
                                until_turn_id: until_turn_id.clone(),
                            });
                        })?;
                        self.emit(
                            chat_id,
                            AgentChatPayload::RewindViewUpdated {
                                until_turn_id: Some(until_turn_id),
                            },
                        )?;
                    }
                }
                self.emit(
                    chat_id,
                    AgentChatPayload::SessionOpResolved {
                        request_id: pending.request.request_id.clone(),
                        option_id: option_id.to_string(),
                        outcome: AgentChatSessionOpOutcome::Applied,
                        error: None,
                    },
                )?;
            }
        }
        Ok(())
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
    while let Some(envelope) = session.next_event().await {
        if matches!(envelope.payload, AgentEvent::SessionClosed) {
            closed_cleanly = true;
        }
        let should_dispatch = matches!(
            &envelope.payload,
            AgentEvent::TurnCompleted {
                stop: agent::TurnStop::Completed,
                ..
            }
        );
        if let Some(status) = &status {
            if let Ok(meta) = store.get_meta(&chat_id) {
                agent_status::apply_host_event(status, &meta, &envelope.payload);
            }
        }
        let is_config_changed = matches!(envelope.payload, AgentEvent::ConfigChanged { .. });
        if let Err(error) =
            apply_event(&chat_id, envelope, &store, &state, &events, &recent_events).await
        {
            warn!("agent chat pump error: {error}");
        } else if is_config_changed {
            if let Err(error) = super::apply_event::sync_pending_session_config_if_needed(
                &chat_id,
                &store,
                &control,
                &state,
                &events,
                &recent_events,
            )
            .await
            {
                warn!("agent chat config sync error: {error}");
            }
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
        if let Some(status) = &status {
            if let Ok(meta) = store.get_meta(&chat_id) {
                agent_status::apply_host_event(
                    status,
                    &meta,
                    &AgentEvent::TurnFailed {
                        turn_id: turn_id.clone(),
                        error: "agent session ended".into(),
                    },
                );
            }
        }
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
            None,
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

fn model_id_usable(id: &str) -> bool {
    let trimmed = id.trim();
    !trimmed.is_empty() && !trimmed.contains(char::is_whitespace)
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

fn provider_canonicalizes_to_claude(provider_id: &str) -> bool {
    canonicalize_chat_provider_id(provider_id) == "claude"
}

const SESSION_OP_CANCEL: &str = "cancel";
const TURN_OPTION_PREFIX: &str = "turn:";

enum SessionOpIntercept {
    Fork { rest: String },
    Rewind { rest: String },
    Redo,
}

fn parse_session_op_intercept(meta: &AgentChatMeta, text: &str) -> Option<SessionOpIntercept> {
    if chat_provider_kind(&meta.provider_id) == ChatProviderKind::Acp {
        return None;
    }
    let trimmed = text.trim();
    let (command, rest) = split_slash(trimmed)?;
    let caps = agent::capabilities_for_provider(&meta.provider_id);
    match command {
        "/fork" if caps.fork == Capability::Supported => Some(SessionOpIntercept::Fork {
            rest: rest.to_string(),
        }),
        "/rewind" | "/undo" if caps.rewind == Capability::Supported => {
            Some(SessionOpIntercept::Rewind {
                rest: rest.to_string(),
            })
        }
        "/redo"
            if caps.rewind == Capability::Supported
                && chat_provider_kind(&meta.provider_id) == ChatProviderKind::NativeOpenCode
                && meta.rewind_view.is_some() =>
        {
            Some(SessionOpIntercept::Redo)
        }
        _ => None,
    }
}

fn split_slash(text: &str) -> Option<(&str, &str)> {
    if !text.starts_with('/') {
        return None;
    }
    match text.split_once(char::is_whitespace) {
        Some((command, rest)) => Some((command, rest.trim())),
        None => Some((text, "")),
    }
}

fn is_two_phase_rewind(provider_id: &str, kind: SessionOpKind) -> bool {
    kind == SessionOpKind::Rewind
        && matches!(
            chat_provider_kind(provider_id),
            ChatProviderKind::NativeClaude | ChatProviderKind::NativeGrok
        )
}

fn option(option_id: &str, name: &str, kind: &str) -> AgentPermissionOption {
    AgentPermissionOption {
        option_id: option_id.to_string(),
        name: name.to_string(),
        kind: kind.to_string(),
    }
}

fn cancel_option() -> AgentPermissionOption {
    option(SESSION_OP_CANCEL, "Never mind", "cancel")
}

fn with_cancel(mut options: Vec<AgentPermissionOption>) -> Vec<AgentPermissionOption> {
    if !options
        .iter()
        .any(|item| item.option_id == SESSION_OP_CANCEL)
    {
        options.push(cancel_option());
    }
    options
}

fn checkpoints_from_turns(turns: &[FoldedTurn]) -> Vec<AgentCheckpoint> {
    let mut checkpoints = Vec::new();
    for turn in turns {
        let Some(user) = turn.messages.iter().find(|message| message.role == "user") else {
            continue;
        };
        let Some(checkpoint_id) = user.checkpoint_id.clone() else {
            continue;
        };
        if checkpoint_id.is_empty() {
            continue;
        }
        checkpoints.push(AgentCheckpoint {
            turn_id: turn.id.clone(),
            checkpoint_id,
        });
    }
    checkpoints
}

fn fork_options(provider_id: &str) -> Vec<AgentPermissionOption> {
    let mut options = if chat_provider_kind(provider_id) == ChatProviderKind::NativeGrok {
        vec![
            option("fork_no_worktree", "Fork", "fork"),
            option("fork_worktree", "Fork with worktree", "fork"),
        ]
    } else {
        vec![option("fork", "Fork", "fork")]
    };
    options.push(cancel_option());
    options
}

fn rewind_chrome(
    provider_id: &str,
    request_id: String,
    turns: &[FoldedTurn],
) -> AgentSessionOpRequest {
    let mut options = Vec::new();
    for turn in turns {
        let Some(user) = turn.messages.iter().find(|message| message.role == "user") else {
            continue;
        };
        let id = user.checkpoint_id.as_deref().unwrap_or(turn.id.as_str());
        let name = user_turn_label(user);
        options.push(option(
            &format!("{TURN_OPTION_PREFIX}{id}"),
            &name,
            "rewind",
        ));
    }
    if !is_two_phase_rewind(provider_id, SessionOpKind::Rewind) && options.is_empty() {
        options.push(option("rewind", "Rewind conversation", "rewind"));
    }
    options.push(cancel_option());
    AgentSessionOpRequest {
        request_id,
        kind: SessionOpKind::Rewind,
        title: "Rewind".into(),
        description: None,
        options,
    }
}

fn rewind_restore_options(
    provider_id: &str,
    has_file_changes: Option<bool>,
) -> Vec<AgentPermissionOption> {
    let mut options = vec![option(
        "rewind_conversation",
        "Restore conversation",
        "rewind",
    )];
    let include_files = has_file_changes != Some(false)
        && matches!(
            chat_provider_kind(provider_id),
            ChatProviderKind::NativeClaude | ChatProviderKind::NativeGrok
        );
    if include_files {
        let files_label = if chat_provider_kind(provider_id) == ChatProviderKind::NativeGrok {
            "Restore files"
        } else {
            "Restore code"
        };
        options.push(option("rewind_code", files_label, "rewind"));
        options.push(option(
            "rewind_both",
            if chat_provider_kind(provider_id) == ChatProviderKind::NativeGrok {
                "Restore both"
            } else {
                "Restore code and conversation"
            },
            "rewind",
        ));
    }
    options.push(cancel_option());
    options
}

fn user_turn_label(message: &super::types::FoldedMessage) -> String {
    let text = message
        .parts
        .iter()
        .find_map(|part| match part {
            MessagePart::Text { text } => Some(text.as_str()),
            _ => None,
        })
        .unwrap_or("")
        .trim()
        .lines()
        .next()
        .unwrap_or("")
        .trim();
    if text.is_empty() {
        "User message".into()
    } else {
        text.chars().take(80).collect()
    }
}

fn turn_id_from_option(option_id: &str) -> Option<&str> {
    option_id.strip_prefix(TURN_OPTION_PREFIX)
}

fn session_op_target(
    pending: &PendingSessionOp,
    option_id: &str,
    turns: &[FoldedTurn],
) -> Option<String> {
    let token = pending
        .selected_turn_id
        .clone()
        .or_else(|| turn_id_from_option(option_id).map(str::to_string))?;
    for turn in turns {
        if turn.id == token {
            if let Some(user) = turn.messages.iter().find(|message| message.role == "user") {
                return user.checkpoint_id.clone().or(Some(turn.id.clone()));
            }
            return Some(turn.id.clone());
        }
        if turn
            .messages
            .iter()
            .any(|message| message.checkpoint_id.as_deref() == Some(token.as_str()))
        {
            return Some(token);
        }
    }
    Some(token)
}

fn resolve_turn_id(turns: &[FoldedTurn], token: &str) -> Option<String> {
    turns.iter().find_map(|turn| {
        if turn.id == token {
            return Some(turn.id.clone());
        }
        turn.messages.iter().find_map(|message| {
            (message.checkpoint_id.as_deref() == Some(token)).then(|| turn.id.clone())
        })
    })
}

fn is_conversation_restore(option_id: &str) -> bool {
    matches!(option_id, "rewind_conversation" | "rewind_both" | "rewind")
        || option_id.starts_with(TURN_OPTION_PREFIX)
}
