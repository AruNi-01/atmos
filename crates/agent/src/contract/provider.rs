use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use async_trait::async_trait;

use super::action::{AgentAction, AgentActionError, AgentActionResult};
use super::descriptor::AgentDescriptor;
use super::error::AgentResult;
use super::event::{AgentEventEnvelope, UserMessageKind};

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

/// Atmos turn id bound to a vendor rewind checkpoint (Claude user `uuid`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentCheckpoint {
    pub turn_id: String,
    pub checkpoint_id: String,
}

#[derive(Debug, Clone, Default)]
pub struct AgentRuntimeConfig {
    pub cwd: PathBuf,
    pub model: Option<String>,
    pub thinking: Option<String>,
    pub mode: Option<String>,
    pub permission_mode: Option<String>,
    pub extra_config: HashMap<String, String>,
    pub env_overrides: Option<HashMap<String, String>>,
    pub auth_method_id: Option<String>,
    pub allow_file_access: bool,
    /// Persisted Claude (etc.) user checkpoints, transcript order, for resume.
    pub checkpoints: Vec<AgentCheckpoint>,
}

#[derive(Debug, Clone, Default)]
pub struct AgentRuntimeConfigUpdate {
    pub model: Option<String>,
    pub thinking: Option<String>,
    pub mode: Option<String>,
    pub permission_mode: Option<String>,
    pub extra_config: HashMap<String, String>,
    pub previous_model: Option<String>,
    pub previous_thinking: Option<String>,
    pub previous_mode: Option<String>,
    pub previous_permission_mode: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct AgentCatalogContext {
    pub cwd: Option<PathBuf>,
}

#[async_trait]
pub trait AgentRuntimeCommands: Send + Sync {
    async fn send(&self, input: AgentPrompt) -> AgentResult<AgentTurnHandle>;
    async fn cancel(&self) -> AgentResult<()>;
    async fn close(&self) -> AgentResult<()>;
    async fn action(&self, action: AgentAction) -> Result<AgentActionResult, AgentActionError>;
}

#[derive(Clone)]
pub struct AgentRuntimeControl {
    inner: Arc<dyn AgentRuntimeCommands>,
}

impl AgentRuntimeControl {
    pub fn new(inner: Arc<dyn AgentRuntimeCommands>) -> Self {
        Self { inner }
    }

    pub async fn send(&self, input: AgentPrompt) -> AgentResult<AgentTurnHandle> {
        self.inner.send(input).await
    }

    pub async fn cancel(&self) -> AgentResult<()> {
        self.inner.cancel().await
    }

    pub async fn close(&self) -> AgentResult<()> {
        self.inner.close().await
    }

    pub async fn action(&self, action: AgentAction) -> Result<AgentActionResult, AgentActionError> {
        self.inner.action(action).await
    }

    pub async fn steer(&self, input: AgentPrompt) -> AgentResult<()> {
        self.inner
            .action(AgentAction::Steer { input })
            .await
            .map(|_| ())
            .map_err(Into::into)
    }

    pub async fn set_config(&self, update: AgentRuntimeConfigUpdate) -> AgentResult<()> {
        self.inner
            .action(AgentAction::SetConfig { update })
            .await
            .map(|_| ())
            .map_err(Into::into)
    }

    pub async fn respond_permission(&self, request_id: &str, option_id: &str) -> AgentResult<()> {
        self.inner
            .action(AgentAction::RespondPermission {
                request_id: request_id.to_string(),
                option_id: option_id.to_string(),
            })
            .await
            .map(|_| ())
            .map_err(Into::into)
    }
}

#[async_trait]
pub trait AgentRuntime: Send {
    fn control(&self) -> AgentRuntimeControl;
    fn persistence_handle(&self) -> Option<AgentPersistenceHandle>;
    fn descriptor(&self) -> AgentDescriptor;
    async fn next_event(&mut self) -> Option<AgentEventEnvelope>;
}

#[async_trait]
pub trait AgentProvider: Send + Sync {
    fn id(&self) -> &str;
    async fn descriptor(&self, ctx: &AgentCatalogContext) -> AgentResult<AgentDescriptor>;
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
