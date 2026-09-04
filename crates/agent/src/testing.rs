//! In-memory AgentProvider used by crate tests and `core-service` scenario tests.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::{mpsc, Mutex};

use crate::contract::AgentEventEnvelope;
use crate::contract::{AgentAction, AgentActionError, AgentActionKind, AgentActionResult};
use crate::contract::{
    AgentCurrentConfig, AgentDescriptor, AgentIdentity, AgentSupportedOptions, Capability,
};
use crate::contract::{
    AgentEvent, AgentOptionsContext, AgentPersistenceHandle, AgentPrompt, AgentProvider,
    AgentProviderError, AgentResult, AgentRuntime, AgentRuntimeCommands, AgentRuntimeConfig,
    AgentRuntimeConfigUpdate, AgentRuntimeControl, AgentTurnHandle, TurnStop,
};
use crate::policy::{capabilities_for_provider, option_support_for_provider};

#[derive(Default)]
pub struct FakeProviderCounters {
    pub create: AtomicUsize,
    pub resume: AtomicUsize,
    pub prompt: AtomicUsize,
    pub steer: AtomicUsize,
    pub cancel: AtomicUsize,
    pub close: AtomicUsize,
    pub permission: AtomicUsize,
    pub set_config: AtomicUsize,
}

#[derive(Clone)]
pub struct FakeAgentProvider {
    pub id: String,
    pub counters: Arc<FakeProviderCounters>,
    pub supports_steer: bool,
    pub auto_complete: Arc<AtomicBool>,
    pub emit_permission_on_prompt: bool,
    last_resume: Arc<Mutex<Option<String>>>,
    last_config: Arc<Mutex<Option<AgentRuntimeConfigUpdate>>>,
    last_runtime_config: Arc<Mutex<Option<AgentRuntimeConfig>>>,
    fail_set_config: Arc<AtomicBool>,
    fail_thinking_config: Arc<AtomicBool>,
    applied_fork_session_id: Arc<std::sync::Mutex<Option<String>>>,
    applied_rewind: Arc<AtomicBool>,
    prepare_has_file_changes: Arc<std::sync::Mutex<Option<bool>>>,
    prepare_options: Arc<std::sync::Mutex<Vec<crate::contract::AgentPermissionOption>>>,
    running_turn: Arc<Mutex<Option<String>>>,
    events_tx: Arc<Mutex<Option<mpsc::UnboundedSender<AgentEventEnvelope>>>>,
}

impl FakeAgentProvider {
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            counters: Arc::new(FakeProviderCounters::default()),
            supports_steer: true,
            auto_complete: Arc::new(AtomicBool::new(true)),
            emit_permission_on_prompt: false,
            last_resume: Arc::new(Mutex::new(None)),
            last_config: Arc::new(Mutex::new(None)),
            last_runtime_config: Arc::new(Mutex::new(None)),
            fail_set_config: Arc::new(AtomicBool::new(false)),
            fail_thinking_config: Arc::new(AtomicBool::new(false)),
            applied_fork_session_id: Arc::new(std::sync::Mutex::new(None)),
            applied_rewind: Arc::new(AtomicBool::new(false)),
            prepare_has_file_changes: Arc::new(std::sync::Mutex::new(None)),
            prepare_options: Arc::new(std::sync::Mutex::new(Vec::new())),
            running_turn: Arc::new(Mutex::new(None)),
            events_tx: Arc::new(Mutex::new(None)),
        }
    }

    pub fn create_count(&self) -> usize {
        self.counters.create.load(Ordering::SeqCst)
    }

    pub fn resume_count(&self) -> usize {
        self.counters.resume.load(Ordering::SeqCst)
    }

    pub fn cancel_count(&self) -> usize {
        self.counters.cancel.load(Ordering::SeqCst)
    }

    pub fn close_count(&self) -> usize {
        self.counters.close.load(Ordering::SeqCst)
    }

    pub fn steer_count(&self) -> usize {
        self.counters.steer.load(Ordering::SeqCst)
    }

    pub fn send_count(&self) -> usize {
        self.counters.prompt.load(Ordering::SeqCst)
    }

    pub async fn last_resume_handle(&self) -> Option<String> {
        self.last_resume.lock().await.clone()
    }

    pub fn config_count(&self) -> usize {
        self.counters.set_config.load(Ordering::SeqCst)
    }

    pub async fn last_config(&self) -> Option<AgentRuntimeConfigUpdate> {
        self.last_config.lock().await.clone()
    }

    pub async fn last_runtime_config(&self) -> Option<AgentRuntimeConfig> {
        self.last_runtime_config.lock().await.clone()
    }

    pub fn set_fail_set_config(&self, value: bool) {
        self.fail_set_config.store(value, Ordering::SeqCst);
    }

    pub fn set_fail_thinking_config(&self, value: bool) {
        self.fail_thinking_config.store(value, Ordering::SeqCst);
    }

    pub fn set_auto_complete(&self, value: bool) {
        self.auto_complete.store(value, Ordering::SeqCst);
    }

    pub fn set_applied_fork_session_id(&self, session_id: impl Into<String>) {
        *self
            .applied_fork_session_id
            .lock()
            .expect("applied fork session id") = Some(session_id.into());
    }

    pub fn set_applied_rewind(&self, value: bool) {
        self.applied_rewind.store(value, Ordering::SeqCst);
    }

    pub fn set_prepare_has_file_changes(&self, value: Option<bool>) {
        *self
            .prepare_has_file_changes
            .lock()
            .expect("prepare has file changes") = value;
    }

    pub fn set_prepare_options(&self, options: Vec<crate::contract::AgentPermissionOption>) {
        *self.prepare_options.lock().expect("prepare options") = options;
    }

    pub async fn events_ready(&self) -> bool {
        self.events_tx.lock().await.is_some()
    }

    pub async fn push_event(&self, event: AgentEvent) {
        let turn_id = self.running_turn.lock().await.clone();
        if let Some(tx) = self.events_tx.lock().await.clone() {
            let _ = tx.send(AgentEventEnvelope::new(turn_id, event));
        }
    }

    pub async fn complete_current(&self) {
        if let Some(turn_id) = self.running_turn.lock().await.take() {
            if let Some(tx) = self.events_tx.lock().await.clone() {
                let _ = tx.send(AgentEventEnvelope::new(
                    Some(turn_id.clone()),
                    AgentEvent::TurnCompleted {
                        turn_id,
                        stop: TurnStop::Completed,
                    },
                ));
            }
        }
    }
}

struct FakeSessionInner {
    counters: Arc<FakeProviderCounters>,
    supports_steer: bool,
    auto_complete: Arc<AtomicBool>,
    emit_permission_on_prompt: bool,
    events_tx: mpsc::UnboundedSender<AgentEventEnvelope>,
    running_turn: Arc<Mutex<Option<String>>>,
    last_config: Arc<Mutex<Option<AgentRuntimeConfigUpdate>>>,
    fail_set_config: Arc<AtomicBool>,
    fail_thinking_config: Arc<AtomicBool>,
    applied_fork_session_id: Arc<std::sync::Mutex<Option<String>>>,
    applied_rewind: Arc<AtomicBool>,
    prepare_has_file_changes: Arc<std::sync::Mutex<Option<bool>>>,
    prepare_options: Arc<std::sync::Mutex<Vec<crate::contract::AgentPermissionOption>>>,
}

#[async_trait]
impl AgentRuntimeCommands for FakeSessionInner {
    async fn send(&self, input: AgentPrompt) -> AgentResult<AgentTurnHandle> {
        self.counters.prompt.fetch_add(1, Ordering::SeqCst);
        let turn_id = input
            .turn_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        *self.running_turn.lock().await = Some(turn_id.clone());
        if self.emit_permission_on_prompt {
            let _ = self.events_tx.send(AgentEventEnvelope::new(
                Some(turn_id.clone()),
                AgentEvent::PermissionRequested {
                    request: crate::contract::AgentPermissionRequest {
                        request_id: format!("perm_{turn_id}"),
                        tool: "edit".into(),
                        description: "edit file".into(),
                        content_markdown: None,
                        options: vec![crate::contract::AgentPermissionOption {
                            option_id: "allow".into(),
                            name: "Allow".into(),
                            kind: "allow_once".into(),
                        }],
                    },
                },
            ));
        } else if self.auto_complete.load(Ordering::SeqCst) {
            let tx = self.events_tx.clone();
            let completed_turn = turn_id.clone();
            tokio::spawn(async move {
                tokio::task::yield_now().await;
                let assistant_id = uuid::Uuid::new_v4().to_string();
                let _ = tx.send(AgentEventEnvelope::new(
                    Some(completed_turn.clone()),
                    AgentEvent::AssistantMessageDelta {
                        message_id: assistant_id.clone(),
                        delta: "ok".into(),
                    },
                ));
                let _ = tx.send(AgentEventEnvelope::new(
                    Some(completed_turn.clone()),
                    AgentEvent::AssistantMessageCompleted {
                        message_id: assistant_id,
                    },
                ));
                let _ = tx.send(AgentEventEnvelope::new(
                    Some(completed_turn.clone()),
                    AgentEvent::TurnCompleted {
                        turn_id: completed_turn,
                        stop: TurnStop::Completed,
                    },
                ));
            });
        }
        Ok(AgentTurnHandle { turn_id })
    }

    async fn cancel(&self) -> AgentResult<()> {
        self.counters.cancel.fetch_add(1, Ordering::SeqCst);
        if let Some(turn_id) = self.running_turn.lock().await.take() {
            let _ = self.events_tx.send(AgentEventEnvelope::new(
                Some(turn_id.clone()),
                AgentEvent::TurnCanceled { turn_id },
            ));
        }
        Ok(())
    }

    async fn close(&self) -> AgentResult<()> {
        self.counters.close.fetch_add(1, Ordering::SeqCst);
        let _ = self
            .events_tx
            .send(AgentEventEnvelope::new(None, AgentEvent::SessionClosed));
        Ok(())
    }

    async fn action(&self, action: AgentAction) -> Result<AgentActionResult, AgentActionError> {
        match action {
            AgentAction::Steer { input } => {
                self.counters.steer.fetch_add(1, Ordering::SeqCst);
                if !self.supports_steer {
                    return Err(AgentActionError::Unsupported {
                        action: AgentActionKind::Steer,
                    });
                }
                if self.running_turn.lock().await.is_none() {
                    return Err(AgentActionError::SteerTurnMismatch);
                }
                let _ = input;
                Ok(AgentActionResult::unit())
            }
            AgentAction::SetConfig { update } => {
                self.counters.set_config.fetch_add(1, Ordering::SeqCst);
                if self.fail_set_config.load(Ordering::SeqCst) {
                    return Err(AgentActionError::Unsupported {
                        action: AgentActionKind::SetConfig,
                    });
                }
                if self.fail_thinking_config.load(Ordering::SeqCst)
                    && config_update_sets_thinking(&update)
                {
                    return Err(AgentActionError::Unsupported {
                        action: AgentActionKind::SetConfig,
                    });
                }
                *self.last_config.lock().await = Some(*update);
                Ok(AgentActionResult::unit())
            }
            AgentAction::RespondPermission {
                request_id,
                option_id,
            } => {
                self.counters.permission.fetch_add(1, Ordering::SeqCst);
                let _ = self.events_tx.send(AgentEventEnvelope::new(
                    self.running_turn.lock().await.clone(),
                    AgentEvent::PermissionResolved {
                        request_id,
                        option_id,
                    },
                ));
                if self.auto_complete.load(Ordering::SeqCst) {
                    if let Some(turn_id) = self.running_turn.lock().await.take() {
                        let _ = self.events_tx.send(AgentEventEnvelope::new(
                            Some(turn_id.clone()),
                            AgentEvent::TurnCompleted {
                                turn_id,
                                stop: TurnStop::Completed,
                            },
                        ));
                    }
                }
                Ok(AgentActionResult::unit())
            }
            AgentAction::PrepareSessionOp { .. } => {
                let options = self
                    .prepare_options
                    .lock()
                    .expect("prepare options")
                    .clone();
                if !options.is_empty() {
                    return Ok(AgentActionResult::prepared_options(options));
                }
                if let Some(has_file_changes) = *self
                    .prepare_has_file_changes
                    .lock()
                    .expect("prepare has file changes")
                {
                    return Ok(AgentActionResult::rewind_preview(has_file_changes));
                }
                Err(AgentActionError::Unsupported {
                    action: AgentActionKind::PrepareSessionOp,
                })
            }
            AgentAction::RespondSessionOp { .. } => {
                let session_id = self
                    .applied_fork_session_id
                    .lock()
                    .expect("applied fork session id")
                    .clone();
                if let Some(session_id) = session_id {
                    return Ok(AgentActionResult::forked(session_id, None));
                }
                if self.applied_rewind.load(Ordering::SeqCst) {
                    return Ok(AgentActionResult::unit());
                }
                Err(AgentActionError::Unsupported {
                    action: AgentActionKind::RespondSessionOp,
                })
            }
        }
    }
}

struct FakeSession {
    control: AgentRuntimeControl,
    events_rx: mpsc::UnboundedReceiver<AgentEventEnvelope>,
    persistence: Option<AgentPersistenceHandle>,
    descriptor: AgentDescriptor,
}

#[async_trait]
impl AgentRuntime for FakeSession {
    fn control(&self) -> AgentRuntimeControl {
        self.control.clone()
    }

    fn persistence_handle(&self) -> Option<AgentPersistenceHandle> {
        self.persistence.clone()
    }

    fn descriptor(&self) -> AgentDescriptor {
        self.descriptor.clone()
    }

    async fn next_event(&mut self) -> Option<AgentEventEnvelope> {
        self.events_rx.recv().await
    }
}

fn fake_descriptor(provider_id: &str, supports_steer: bool) -> AgentDescriptor {
    let mut capabilities = capabilities_for_provider(provider_id);
    capabilities.steer = if supports_steer {
        Capability::Supported
    } else {
        Capability::Unsupported
    };
    AgentDescriptor {
        identity: AgentIdentity {
            id: provider_id.to_string(),
            name: provider_id.to_string(),
            version: None,
        },
        capabilities,
        support: option_support_for_provider(provider_id),
        supported_options: AgentSupportedOptions::default(),
        current_config: AgentCurrentConfig::default(),
    }
}

fn config_update_sets_thinking(update: &AgentRuntimeConfigUpdate) -> bool {
    if update.thinking.is_some() {
        return true;
    }
    update.extra_config.keys().any(|id| {
        matches!(
            id.trim().to_ascii_lowercase().as_str(),
            "thinking"
                | "think"
                | "thought_level"
                | "effort"
                | "reasoning"
                | "reasoning_effort"
                | "reasoning-effort"
        )
    })
}

fn open_session(
    provider: &FakeAgentProvider,
    persistence: Option<AgentPersistenceHandle>,
) -> Box<dyn AgentRuntime> {
    let (tx, rx) = mpsc::unbounded_channel();
    let persistence = persistence.or_else(|| {
        Some(AgentPersistenceHandle::new(format!(
            "native-{}",
            uuid::Uuid::new_v4()
        )))
    });
    let _ = tx.send(AgentEventEnvelope::new(
        None,
        AgentEvent::SessionStarted {
            persistence_handle: persistence.as_ref().map(|h| h.as_str().to_string()),
        },
    ));
    let inner = Arc::new(FakeSessionInner {
        counters: Arc::clone(&provider.counters),
        supports_steer: provider.supports_steer,
        auto_complete: Arc::clone(&provider.auto_complete),
        emit_permission_on_prompt: provider.emit_permission_on_prompt,
        events_tx: tx.clone(),
        running_turn: Arc::clone(&provider.running_turn),
        last_config: Arc::clone(&provider.last_config),
        fail_set_config: Arc::clone(&provider.fail_set_config),
        fail_thinking_config: Arc::clone(&provider.fail_thinking_config),
        applied_fork_session_id: Arc::clone(&provider.applied_fork_session_id),
        applied_rewind: Arc::clone(&provider.applied_rewind),
        prepare_has_file_changes: Arc::clone(&provider.prepare_has_file_changes),
        prepare_options: Arc::clone(&provider.prepare_options),
    });
    if let Ok(mut slot) = provider.events_tx.try_lock() {
        *slot = Some(tx);
    }
    Box::new(FakeSession {
        control: AgentRuntimeControl::new(inner),
        events_rx: rx,
        persistence,
        descriptor: fake_descriptor(&provider.id, provider.supports_steer),
    })
}

#[async_trait]
impl AgentProvider for FakeAgentProvider {
    fn id(&self) -> &str {
        &self.id
    }

    async fn descriptor(&self, _ctx: &AgentOptionsContext) -> AgentResult<AgentDescriptor> {
        Ok(fake_descriptor(&self.id, self.supports_steer))
    }

    async fn create_runtime(&self, cfg: AgentRuntimeConfig) -> AgentResult<Box<dyn AgentRuntime>> {
        self.counters.create.fetch_add(1, Ordering::SeqCst);
        *self.last_runtime_config.lock().await = Some(cfg);
        Ok(open_session(self, None))
    }

    async fn resume_runtime(
        &self,
        handle: AgentPersistenceHandle,
        cfg: AgentRuntimeConfig,
    ) -> AgentResult<Box<dyn AgentRuntime>> {
        self.counters.resume.fetch_add(1, Ordering::SeqCst);
        *self.last_resume.lock().await = Some(handle.as_str().to_string());
        *self.last_runtime_config.lock().await = Some(cfg);
        Ok(open_session(self, Some(handle)))
    }
}

pub struct StaticProviderFactory {
    providers: HashMap<String, Arc<dyn AgentProvider>>,
}

impl StaticProviderFactory {
    pub fn new(provider: Arc<dyn AgentProvider>) -> Self {
        let mut providers = HashMap::new();
        providers.insert(provider.id().to_string(), provider);
        Self { providers }
    }

    pub fn insert(&mut self, provider: Arc<dyn AgentProvider>) {
        self.providers.insert(provider.id().to_string(), provider);
    }
}

#[async_trait]
impl crate::contract::AgentProviderFactory for StaticProviderFactory {
    async fn provider_for(&self, provider_id: &str) -> AgentResult<Arc<dyn AgentProvider>> {
        self.providers
            .get(provider_id)
            .cloned()
            .ok_or_else(|| AgentProviderError::NotFound(provider_id.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentOptionsContext;

    #[tokio::test]
    async fn s3_s7_fake_send_and_cancel_without_steer_prompt() {
        let mut provider = FakeAgentProvider::new("claude");
        provider.supports_steer = false;
        let mut runtime = provider
            .create_runtime(AgentRuntimeConfig::default())
            .await
            .expect("runtime");
        assert_eq!(
            runtime.descriptor().capabilities.steer,
            Capability::Unsupported
        );
        let control = runtime.control();
        let handle = control
            .send(AgentPrompt {
                text: "hi".into(),
                turn_id: Some("turn-1".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("send");
        assert_eq!(handle.turn_id, "turn-1");
        let error = control
            .action(AgentAction::Steer {
                input: AgentPrompt {
                    text: "nudge".into(),
                    ..AgentPrompt::default()
                },
            })
            .await
            .expect_err("steer");
        assert!(matches!(
            error,
            AgentActionError::Unsupported {
                action: AgentActionKind::Steer
            }
        ));
        assert_eq!(provider.send_count(), 1);
        assert_eq!(provider.steer_count(), 1);
        control.cancel().await.expect("cancel");
        assert_eq!(provider.cancel_count(), 1);
        assert_eq!(provider.send_count(), 1);
        let started = runtime.next_event().await.expect("session started");
        assert!(matches!(started.payload, AgentEvent::SessionStarted { .. }));
        assert!(!started.event_id.is_empty());
        let _ = AgentOptionsContext::default();
    }

    #[tokio::test]
    async fn applied_fork_action_returns_vendor_session_id() {
        let provider = FakeAgentProvider::new("claude");
        provider.set_applied_fork_session_id("vendor-fork-1");
        let runtime = provider
            .create_runtime(AgentRuntimeConfig::default())
            .await
            .expect("runtime");
        let result = runtime
            .control()
            .action(AgentAction::RespondSessionOp {
                request_id: "req".into(),
                option_id: "fork".into(),
                target: None,
            })
            .await
            .expect("applied fork");
        assert_eq!(result.new_session_id.as_deref(), Some("vendor-fork-1"));
        assert_eq!(result.new_cwd, None);
    }
}
