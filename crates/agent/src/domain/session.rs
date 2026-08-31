use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use async_trait::async_trait;

use super::error::AgentResult;
use super::event::{AgentEvent, UserMessageKind};
use super::model::AgentThinkingSupport;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentPersistenceHandle(pub String);

impl AgentPersistenceHandle {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentTurnHandle {
    pub turn_id: String,
}

#[derive(Debug, Clone, Default)]
pub struct AgentPrompt {
    pub text: String,
    pub attachments: Vec<String>,
    pub kind: UserMessageKind,
    pub turn_id: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct AgentRuntimeConfig {
    pub cwd: PathBuf,
    pub model: Option<String>,
    pub thinking: Option<String>,
    pub mode: Option<String>,
    pub extra_config: HashMap<String, String>,
    pub env_overrides: Option<HashMap<String, String>>,
    pub auth_method_id: Option<String>,
    pub allow_file_access: bool,
}

#[derive(Debug, Clone, Default)]
pub struct AgentRuntimeConfigUpdate {
    pub model: Option<String>,
    pub thinking: Option<String>,
    pub mode: Option<String>,
    pub extra_config: HashMap<String, String>,
    pub previous_model: Option<String>,
    pub previous_thinking: Option<String>,
    pub previous_mode: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct AgentCapabilities {
    pub supports_steer: bool,
    pub supports_resume: bool,
    pub thinking: AgentThinkingSupport,
}

#[derive(Debug, Clone, Default)]
pub struct AgentCatalogContext {
    pub cwd: Option<PathBuf>,
}

#[async_trait]
pub trait AgentRuntimeCommands: Send + Sync {
    async fn prompt(&self, input: AgentPrompt) -> AgentResult<AgentTurnHandle>;
    async fn steer(&self, input: AgentPrompt) -> AgentResult<()>;
    async fn cancel(&self) -> AgentResult<()>;
    async fn close(&self) -> AgentResult<()>;
    async fn set_config(&self, update: AgentRuntimeConfigUpdate) -> AgentResult<()>;
    async fn respond_permission(&self, request_id: &str, option_id: &str) -> AgentResult<()>;
}

#[derive(Clone)]
pub struct AgentRuntimeControl {
    inner: Arc<dyn AgentRuntimeCommands>,
}

impl AgentRuntimeControl {
    pub fn new(inner: Arc<dyn AgentRuntimeCommands>) -> Self {
        Self { inner }
    }

    pub async fn prompt(&self, input: AgentPrompt) -> AgentResult<AgentTurnHandle> {
        self.inner.prompt(input).await
    }

    pub async fn steer(&self, input: AgentPrompt) -> AgentResult<()> {
        self.inner.steer(input).await
    }

    pub async fn cancel(&self) -> AgentResult<()> {
        self.inner.cancel().await
    }

    pub async fn close(&self) -> AgentResult<()> {
        self.inner.close().await
    }

    pub async fn set_config(&self, update: AgentRuntimeConfigUpdate) -> AgentResult<()> {
        self.inner.set_config(update).await
    }

    pub async fn respond_permission(&self, request_id: &str, option_id: &str) -> AgentResult<()> {
        self.inner.respond_permission(request_id, option_id).await
    }
}

#[async_trait]
pub trait AgentRuntime: Send {
    fn control(&self) -> AgentRuntimeControl;
    fn persistence_handle(&self) -> Option<AgentPersistenceHandle>;
    fn capabilities(&self) -> AgentCapabilities;
    async fn next_event(&mut self) -> Option<AgentEvent>;
}

#[async_trait]
pub trait AgentProvider: Send + Sync {
    fn id(&self) -> &str;
    async fn capabilities(&self, ctx: &AgentCatalogContext) -> AgentResult<AgentCapabilities>;
    async fn create_runtime(&self, cfg: AgentRuntimeConfig) -> AgentResult<Box<dyn AgentRuntime>>;
    async fn resume_runtime(
        &self,
        handle: AgentPersistenceHandle,
        cfg: AgentRuntimeConfig,
    ) -> AgentResult<Box<dyn AgentRuntime>>;
}

#[async_trait]
pub trait AgentProviderFactory: Send + Sync {
    async fn provider_for(&self, provider_id: &str) -> AgentResult<Arc<dyn AgentProvider>>;
}
