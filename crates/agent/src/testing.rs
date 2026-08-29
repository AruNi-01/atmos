//! In-memory AgentProvider used by crate tests and `core-service` scenario tests.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::{mpsc, Mutex};

use crate::domain::{
    AgentCapabilities, AgentCatalogContext, AgentEvent, AgentPersistenceHandle, AgentPrompt,
    AgentProvider, AgentProviderError, AgentResult, AgentRuntime, AgentRuntimeCommands,
    AgentRuntimeConfig, AgentRuntimeConfigUpdate, AgentRuntimeControl, AgentTurnHandle, TurnStop,
};

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
    running_turn: Arc<Mutex<Option<String>>>,
    events_tx: Arc<Mutex<Option<mpsc::UnboundedSender<AgentEvent>>>>,
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

    pub async fn last_resume_handle(&self) -> Option<String> {
        self.last_resume.lock().await.clone()
    }

    pub fn config_count(&self) -> usize {
        self.counters.set_config.load(Ordering::SeqCst)
    }

    pub async fn last_config(&self) -> Option<AgentRuntimeConfigUpdate> {
        self.last_config.lock().await.clone()
    }

    pub fn set_auto_complete(&self, value: bool) {
        self.auto_complete.store(value, Ordering::SeqCst);
    }

    pub async fn events_ready(&self) -> bool {
        self.events_tx.lock().await.is_some()
    }

    pub async fn push_event(&self, event: AgentEvent) {
        if let Some(tx) = self.events_tx.lock().await.clone() {
            let _ = tx.send(event);
        }
    }

    pub async fn complete_current(&self) {
        if let Some(turn_id) = self.running_turn.lock().await.take() {
            if let Some(tx) = self.events_tx.lock().await.clone() {
                let _ = tx.send(AgentEvent::TurnCompleted {
                    turn_id,
                    stop: TurnStop::Completed,
                });
            }
        }
    }
}

struct FakeSessionInner {
    counters: Arc<FakeProviderCounters>,
    supports_steer: bool,
    auto_complete: Arc<AtomicBool>,
    emit_permission_on_prompt: bool,
    events_tx: mpsc::UnboundedSender<AgentEvent>,
    running_turn: Arc<Mutex<Option<String>>>,
    last_config: Arc<Mutex<Option<AgentRuntimeConfigUpdate>>>,
}

#[async_trait]
impl AgentRuntimeCommands for FakeSessionInner {
    async fn prompt(&self, input: AgentPrompt) -> AgentResult<AgentTurnHandle> {
        self.counters.prompt.fetch_add(1, Ordering::SeqCst);
        let turn_id = input
            .turn_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        *self.running_turn.lock().await = Some(turn_id.clone());
        let _ = input;
        if self.emit_permission_on_prompt {
            let _ = self.events_tx.send(AgentEvent::PermissionRequested {
                request: crate::domain::AgentPermissionRequest {
                    request_id: format!("perm_{turn_id}"),
                    tool: "edit".into(),
                    description: "edit file".into(),
                    content_markdown: None,
                    options: vec![crate::domain::AgentPermissionOption {
                        option_id: "allow".into(),
                        name: "Allow".into(),
                        kind: "allow_once".into(),
                    }],
                },
            });
        } else if self.auto_complete.load(Ordering::SeqCst) {
            let tx = self.events_tx.clone();
            let completed_turn = turn_id.clone();
            tokio::spawn(async move {
                tokio::task::yield_now().await;
                let assistant_id = uuid::Uuid::new_v4().to_string();
                let _ = tx.send(AgentEvent::AssistantMessageDelta {
                    message_id: assistant_id.clone(),
                    delta: "ok".into(),
                });
                let _ = tx.send(AgentEvent::AssistantMessageCompleted {
                    message_id: assistant_id,
                });
                let _ = tx.send(AgentEvent::TurnCompleted {
                    turn_id: completed_turn,
                    stop: TurnStop::Completed,
                });
            });
        }
        Ok(AgentTurnHandle { turn_id })
    }

    async fn steer(&self, input: AgentPrompt) -> AgentResult<()> {
        self.counters.steer.fetch_add(1, Ordering::SeqCst);
        if !self.supports_steer {
            return Err(AgentProviderError::unsupported("steer not supported"));
        }
        if self.running_turn.lock().await.is_none() {
            return Err(AgentProviderError::message("no running turn"));
        }
        let _ = input;
        Ok(())
    }

    async fn cancel(&self) -> AgentResult<()> {
        self.counters.cancel.fetch_add(1, Ordering::SeqCst);
        if let Some(turn_id) = self.running_turn.lock().await.take() {
            let _ = self.events_tx.send(AgentEvent::TurnCanceled { turn_id });
        }
        Ok(())
    }

    async fn close(&self) -> AgentResult<()> {
        self.counters.close.fetch_add(1, Ordering::SeqCst);
        let _ = self.events_tx.send(AgentEvent::SessionClosed);
        Ok(())
    }

    async fn set_config(&self, update: AgentRuntimeConfigUpdate) -> AgentResult<()> {
        self.counters.set_config.fetch_add(1, Ordering::SeqCst);
        *self.last_config.lock().await = Some(update);
        Ok(())
    }

    async fn respond_permission(&self, request_id: &str, option_id: &str) -> AgentResult<()> {
        self.counters.permission.fetch_add(1, Ordering::SeqCst);
        let _ = self.events_tx.send(AgentEvent::PermissionResolved {
            request_id: request_id.to_string(),
            option_id: option_id.to_string(),
        });
        if self.auto_complete.load(Ordering::SeqCst) {
            if let Some(turn_id) = self.running_turn.lock().await.take() {
                let _ = self.events_tx.send(AgentEvent::TurnCompleted {
                    turn_id,
                    stop: TurnStop::Completed,
                });
            }
        }
        Ok(())
    }
}

struct FakeSession {
    control: AgentRuntimeControl,
    events_rx: mpsc::UnboundedReceiver<AgentEvent>,
    persistence: Option<AgentPersistenceHandle>,
    capabilities: AgentCapabilities,
}

#[async_trait]
impl AgentRuntime for FakeSession {
    fn control(&self) -> AgentRuntimeControl {
        self.control.clone()
    }

    fn persistence_handle(&self) -> Option<AgentPersistenceHandle> {
        self.persistence.clone()
    }

    fn capabilities(&self) -> AgentCapabilities {
        self.capabilities.clone()
    }

    async fn next_event(&mut self) -> Option<AgentEvent> {
        self.events_rx.recv().await
    }
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
    let _ = tx.send(AgentEvent::SessionStarted {
        persistence_handle: persistence.as_ref().map(|h| h.as_str().to_string()),
    });
    let inner = Arc::new(FakeSessionInner {
        counters: Arc::clone(&provider.counters),
        supports_steer: provider.supports_steer,
        auto_complete: Arc::clone(&provider.auto_complete),
        emit_permission_on_prompt: provider.emit_permission_on_prompt,
        events_tx: tx.clone(),
        running_turn: Arc::clone(&provider.running_turn),
        last_config: Arc::clone(&provider.last_config),
    });
    if let Ok(mut slot) = provider.events_tx.try_lock() {
        *slot = Some(tx);
    }
    Box::new(FakeSession {
        control: AgentRuntimeControl::new(inner),
        events_rx: rx,
        persistence,
        capabilities: AgentCapabilities {
            supports_steer: provider.supports_steer,
            supports_resume: true,
            thinking: crate::domain::AgentThinkingSupport::None,
        },
    })
}

#[async_trait]
impl AgentProvider for FakeAgentProvider {
    fn id(&self) -> &str {
        &self.id
    }

    async fn capabilities(&self, _ctx: &AgentCatalogContext) -> AgentResult<AgentCapabilities> {
        Ok(AgentCapabilities {
            supports_steer: self.supports_steer,
            supports_resume: true,
            thinking: crate::domain::AgentThinkingSupport::None,
        })
    }

    async fn create_runtime(&self, _cfg: AgentRuntimeConfig) -> AgentResult<Box<dyn AgentRuntime>> {
        self.counters.create.fetch_add(1, Ordering::SeqCst);
        Ok(open_session(self, None))
    }

    async fn resume_runtime(
        &self,
        handle: AgentPersistenceHandle,
        _cfg: AgentRuntimeConfig,
    ) -> AgentResult<Box<dyn AgentRuntime>> {
        self.counters.resume.fetch_add(1, Ordering::SeqCst);
        *self.last_resume.lock().await = Some(handle.as_str().to_string());
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
impl crate::domain::AgentProviderFactory for StaticProviderFactory {
    async fn provider_for(&self, provider_id: &str) -> AgentResult<Arc<dyn AgentProvider>> {
        self.providers
            .get(provider_id)
            .cloned()
            .ok_or_else(|| AgentProviderError::NotFound(provider_id.to_string()))
    }
}
