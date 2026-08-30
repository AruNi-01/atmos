use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use agent::{
    AcpAgentProvider, AcpLaunchResolved, AcpLaunchResolver, AcpProviderParams, AcpToolHandler,
    AgentCatalogContext, AgentLaunchSpec, AgentPersistenceHandle, AgentProvider,
    AgentProviderError, AgentProviderFactory, AgentResult, AgentRuntime, AgentRuntimeConfig,
};
use async_trait::async_trait;
use core_engine::FsEngine;

use crate::service::agent::AgentService;
use crate::utils::path_boundary::{path_or_existing_parent_within_root, path_within_root};

struct AgentChatToolHandler {
    fs_engine: FsEngine,
    allow_file_access: bool,
    session_root: PathBuf,
}

#[async_trait]
impl AcpToolHandler for AgentChatToolHandler {
    fn resolve_path(&self, session_cwd: &Path, path: &str) -> PathBuf {
        let path_buf = PathBuf::from(path);
        if path_buf.is_absolute() {
            path_buf
        } else {
            session_cwd.join(path)
        }
    }

    async fn read_text_file(&self, path: &Path) -> std::result::Result<String, String> {
        if !self.allow_file_access {
            return Err("File access disabled.".to_string());
        }
        if !path_within_root(path, &self.session_root) {
            return Err("File access outside the active workspace is disabled.".to_string());
        }
        self.fs_engine
            .read_file(path)
            .map(|(content, _, _)| content)
            .map_err(|e| e.to_string())
    }

    async fn write_text_file(&self, path: &Path, content: &str) -> std::result::Result<(), String> {
        if !self.allow_file_access {
            return Err("File access disabled.".to_string());
        }
        if !path_or_existing_parent_within_root(path, &self.session_root) {
            return Err("File access outside the active workspace is disabled.".to_string());
        }
        self.fs_engine
            .write_file(path, content)
            .map_err(|e| e.to_string())
    }
}

pub struct DefaultAgentProviderFactory {
    agent_service: Arc<AgentService>,
}

pub struct AgentServiceCatalogResolver {
    agent_service: Arc<AgentService>,
}

impl AgentServiceCatalogResolver {
    pub fn new(agent_service: Arc<AgentService>) -> Self {
        Self { agent_service }
    }
}

#[async_trait]
impl AcpLaunchResolver for AgentServiceCatalogResolver {
    async fn resolve(&self, agent_id: &str) -> std::result::Result<AcpLaunchResolved, String> {
        let launch_spec = self
            .agent_service
            .get_registry_agent_launch_spec(agent_id)
            .await
            .or_else(|_| self.agent_service.get_custom_agent_launch_spec(agent_id))
            .map_err(|error| error.to_string())?;
        Ok(AcpLaunchResolved {
            launch_spec,
            env_overrides: self
                .agent_service
                .get_registry_agent_env_overrides(agent_id),
        })
    }
}

impl DefaultAgentProviderFactory {
    pub fn new(agent_service: Arc<AgentService>) -> Self {
        Self { agent_service }
    }

    async fn resolve_launch(
        &self,
        provider_id: &str,
    ) -> AgentResult<(
        AgentLaunchSpec,
        Option<HashMap<String, String>>,
        Option<HashMap<String, String>>,
    )> {
        let launch_spec = self
            .agent_service
            .get_registry_agent_launch_spec(provider_id)
            .await
            .or_else(|_| self.agent_service.get_custom_agent_launch_spec(provider_id))
            .map_err(|e| AgentProviderError::message(e.to_string()))?;
        let env_overrides = self
            .agent_service
            .get_registry_agent_env_overrides(provider_id);
        let default_config = self.agent_service.get_agent_default_config(provider_id);
        Ok((launch_spec, env_overrides, default_config))
    }
}

struct LazyAcpProvider {
    id: String,
    factory: Arc<DefaultAgentProviderFactory>,
}

#[async_trait]
impl AgentProvider for LazyAcpProvider {
    fn id(&self) -> &str {
        &self.id
    }

    async fn capabilities(
        &self,
        _ctx: &AgentCatalogContext,
    ) -> AgentResult<agent::AgentCapabilities> {
        Ok(agent::AgentCapabilities {
            supports_steer: false,
            supports_resume: true,
            thinking: agent::AgentThinkingSupport::None,
        })
    }

    async fn create_runtime(&self, cfg: AgentRuntimeConfig) -> AgentResult<Box<dyn AgentRuntime>> {
        self.open(cfg, None).await
    }

    async fn resume_runtime(
        &self,
        handle: AgentPersistenceHandle,
        cfg: AgentRuntimeConfig,
    ) -> AgentResult<Box<dyn AgentRuntime>> {
        self.open(cfg, Some(handle.as_str().to_string())).await
    }
}

impl LazyAcpProvider {
    async fn open(
        &self,
        cfg: AgentRuntimeConfig,
        resume: Option<String>,
    ) -> AgentResult<Box<dyn AgentRuntime>> {
        let (launch_spec, env_overrides, default_config) =
            self.factory.resolve_launch(&self.id).await?;
        let tool_handler = Arc::new(AgentChatToolHandler {
            fs_engine: FsEngine::new(),
            allow_file_access: cfg.allow_file_access,
            session_root: cfg.cwd.clone(),
        });
        let provider = AcpAgentProvider::new(AcpProviderParams {
            provider_id: self.id.clone(),
            launch_spec,
            env_overrides,
            default_config,
            tool_handler,
            supports_steer: false,
        });
        if let Some(handle) = resume {
            provider
                .resume_runtime(AgentPersistenceHandle::new(handle), cfg)
                .await
        } else {
            provider.create_runtime(cfg).await
        }
    }
}

#[async_trait]
impl AgentProviderFactory for DefaultAgentProviderFactory {
    async fn provider_for(&self, provider_id: &str) -> AgentResult<Arc<dyn AgentProvider>> {
        Ok(Arc::new(LazyAcpProvider {
            id: provider_id.to_string(),
            factory: Arc::new(Self {
                agent_service: Arc::clone(&self.agent_service),
            }),
        }))
    }
}
