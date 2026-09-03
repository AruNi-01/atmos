use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use agent::acp_client::AcpToolHandler;
use agent::providers::chat_provider_kind;
use agent::providers::claude::ClaudeNativeProvider;
use agent::providers::codex::CodexNativeProvider;
use agent::providers::grok::GrokNativeProvider;
use agent::providers::opencode::OpenCodeNativeProvider;
use agent::providers::pi::PiNativeProvider;
use agent::providers::ChatProviderKind;
use agent::{
    capabilities_for_provider, option_support_for_provider, AcpAgentProvider, AcpLaunchResolved,
    AcpLaunchResolver, AcpProviderParams, AgentCatalogContext, AgentCurrentConfig, AgentDescriptor,
    AgentIdentity, AgentLaunchSpec, AgentPersistenceHandle, AgentProvider, AgentProviderError,
    AgentProviderFactory, AgentResult, AgentRuntime, AgentRuntimeConfig, AgentSupportedOptions,
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
            .get_chat_agent_launch_spec(agent_id)
            .await
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
        #[cfg(test)]
        if let Some(spec) = test_launch_override(provider_id) {
            return Ok((spec, None, None));
        }
        let launch_spec = self
            .agent_service
            .get_chat_agent_launch_spec(provider_id)
            .await
            .map_err(|e| AgentProviderError::message(e.to_string()))?;
        let env_overrides = self
            .agent_service
            .get_registry_agent_env_overrides(provider_id);
        let default_config = self.agent_service.get_agent_default_config(provider_id);
        Ok((launch_spec, env_overrides, default_config))
    }

    fn route_provider(&self, provider_id: &str, program: Option<String>) -> Arc<dyn AgentProvider> {
        match chat_provider_kind(provider_id) {
            ChatProviderKind::NativeClaude => {
                mark_constructed("ClaudeNativeProvider");
                Arc::new(match program {
                    Some(program) => ClaudeNativeProvider::with_program(program),
                    None => ClaudeNativeProvider::new(),
                })
            }
            ChatProviderKind::NativeCodex => {
                mark_constructed("CodexNativeProvider");
                Arc::new(match program {
                    Some(program) => CodexNativeProvider::with_program(program),
                    None => CodexNativeProvider::new(),
                })
            }
            ChatProviderKind::NativeOpenCode => {
                mark_constructed("OpenCodeNativeProvider");
                Arc::new(match program {
                    Some(program) => OpenCodeNativeProvider::with_cmd(program),
                    None => OpenCodeNativeProvider::new(),
                })
            }
            ChatProviderKind::NativePi => {
                mark_constructed("PiNativeProvider");
                let provider = Arc::new(match program {
                    Some(program) => PiNativeProvider::with_program(program),
                    None => PiNativeProvider::new(),
                });
                #[cfg(test)]
                store_pi_native(Arc::clone(&provider));
                provider
            }
            ChatProviderKind::NativeGrok => {
                mark_constructed("GrokNativeProvider");
                let provider = Arc::new(match program {
                    Some(program) => GrokNativeProvider::with_program(program),
                    None => GrokNativeProvider::new(),
                });
                #[cfg(test)]
                store_grok_native(Arc::clone(&provider));
                provider
            }
            ChatProviderKind::Acp => {
                mark_constructed("LazyAcpProvider");
                Arc::new(LazyAcpProvider {
                    id: provider_id.to_string(),
                    factory: Arc::new(Self {
                        agent_service: Arc::clone(&self.agent_service),
                    }),
                })
            }
        }
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

    async fn descriptor(&self, _ctx: &AgentCatalogContext) -> AgentResult<AgentDescriptor> {
        Ok(AgentDescriptor {
            identity: AgentIdentity {
                id: self.id.clone(),
                name: self.id.clone(),
                version: None,
            },
            capabilities: capabilities_for_provider(&self.id),
            support: option_support_for_provider(&self.id),
            supported_options: AgentSupportedOptions::default(),
            current_config: AgentCurrentConfig::default(),
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

fn native_catalog_id(kind: ChatProviderKind) -> Option<&'static str> {
    match kind {
        ChatProviderKind::NativeClaude => Some("claude"),
        ChatProviderKind::NativeCodex => Some("codex"),
        ChatProviderKind::NativeOpenCode => Some("opencode"),
        ChatProviderKind::NativePi => Some("pi"),
        ChatProviderKind::NativeGrok => Some("grok"),
        ChatProviderKind::Acp => None,
    }
}

#[async_trait]
impl AgentProviderFactory for DefaultAgentProviderFactory {
    async fn provider_for(&self, provider_id: &str) -> AgentResult<Arc<dyn AgentProvider>> {
        let program = match native_catalog_id(chat_provider_kind(provider_id)) {
            Some(catalog_id) => self
                .resolve_launch(catalog_id)
                .await
                .ok()
                .map(|(spec, _, _)| spec.program),
            None => None,
        };
        Ok(self.route_provider(provider_id, program))
    }
}

#[cfg(test)]
fn mark_constructed(name: &'static str) {
    LAST_CONSTRUCTED.with(|cell| cell.set(Some(name)));
}

#[cfg(not(test))]
fn mark_constructed(_name: &'static str) {}

#[cfg(test)]
fn store_pi_native(provider: Arc<PiNativeProvider>) {
    LAST_PI_NATIVE.with(|cell| *cell.borrow_mut() = Some(provider));
}

#[cfg(test)]
fn store_grok_native(provider: Arc<GrokNativeProvider>) {
    LAST_GROK_NATIVE.with(|cell| *cell.borrow_mut() = Some(provider));
}

#[cfg(test)]
fn test_launch_override(provider_id: &str) -> Option<AgentLaunchSpec> {
    LAST_RESOLVE_ID.with(|cell| {
        *cell.borrow_mut() = Some(provider_id.to_string());
    });
    TEST_LAUNCH.with(|cell| {
        cell.borrow().as_ref().and_then(|(id, program)| {
            (*id == provider_id).then(|| AgentLaunchSpec {
                program: program.clone(),
                args: Vec::new(),
                env: None,
            })
        })
    })
}

#[cfg(test)]
thread_local! {
    static LAST_CONSTRUCTED: std::cell::Cell<Option<&'static str>> =
        const { std::cell::Cell::new(None) };
    static LAST_PI_NATIVE: std::cell::RefCell<Option<Arc<PiNativeProvider>>> =
        const { std::cell::RefCell::new(None) };
    static LAST_GROK_NATIVE: std::cell::RefCell<Option<Arc<GrokNativeProvider>>> =
        const { std::cell::RefCell::new(None) };
    static LAST_RESOLVE_ID: std::cell::RefCell<Option<String>> =
        const { std::cell::RefCell::new(None) };
    static TEST_LAUNCH: std::cell::RefCell<Option<(String, String)>> =
        const { std::cell::RefCell::new(None) };
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::agent::AgentService;

    fn factory() -> DefaultAgentProviderFactory {
        DefaultAgentProviderFactory::new(Arc::new(AgentService::new()))
    }

    fn last_constructed() -> Option<&'static str> {
        LAST_CONSTRUCTED.with(|cell| cell.get())
    }

    fn last_pi_native() -> Option<Arc<PiNativeProvider>> {
        LAST_PI_NATIVE.with(|cell| cell.borrow().clone())
    }

    fn last_grok_native() -> Option<Arc<GrokNativeProvider>> {
        LAST_GROK_NATIVE.with(|cell| cell.borrow().clone())
    }

    fn last_resolve_id() -> Option<String> {
        LAST_RESOLVE_ID.with(|cell| cell.borrow().clone())
    }

    struct TestLaunchGuard;

    impl Drop for TestLaunchGuard {
        fn drop(&mut self) {
            TEST_LAUNCH.with(|cell| *cell.borrow_mut() = None);
        }
    }

    fn override_launch(id: &str, program: &str) -> TestLaunchGuard {
        TEST_LAUNCH.with(|cell| {
            *cell.borrow_mut() = Some((id.to_string(), program.to_string()));
        });
        TestLaunchGuard
    }

    #[test]
    fn s24_claude_route_is_native_not_lazy_acp() {
        let factory = factory();
        let provider = factory.route_provider("claude", None);
        assert_eq!(provider.id(), "claude");
        assert_eq!(last_constructed(), Some("ClaudeNativeProvider"));
        assert_ne!(last_constructed(), Some("LazyAcpProvider"));
    }

    #[test]
    fn s24_native_synonyms_construct_natives() {
        let factory = factory();
        let provider = factory.route_provider("claude-code", None);
        assert_eq!(
            provider.id(),
            "claude",
            "ClaudeNativeProvider id is canonical"
        );
        assert_eq!(last_constructed(), Some("ClaudeNativeProvider"));

        let provider = factory.route_provider("claude_code", None);
        assert_eq!(provider.id(), "claude");
        assert_eq!(last_constructed(), Some("ClaudeNativeProvider"));

        let provider = factory.route_provider("opencode", None);
        assert_eq!(provider.id(), "opencode");
        assert_eq!(last_constructed(), Some("OpenCodeNativeProvider"));
    }

    #[test]
    fn s24_acp_registry_ids_stay_lazy_acp() {
        let factory = factory();
        for id in [
            "claude-acp",
            "codex-acp",
            "pi-acp",
            "grok-build",
            "grok-acp",
        ] {
            let provider = factory.route_provider(id, None);
            assert_eq!(provider.id(), id, "{id}");
            assert_eq!(last_constructed(), Some("LazyAcpProvider"), "{id}");
        }
    }

    #[test]
    fn s24_grok_is_native_acp_registry_stays_lazy_acp() {
        let factory = factory();
        let grok = factory.route_provider("grok", None);
        assert_eq!(grok.id(), "grok");
        assert_eq!(last_constructed(), Some("GrokNativeProvider"));

        let custom = factory.route_provider("my-claude", None);
        assert_eq!(custom.id(), "my-claude");
        assert_eq!(last_constructed(), Some("LazyAcpProvider"));

        let grok_build = factory.route_provider("grok-build", None);
        assert_eq!(grok_build.id(), "grok-build");
        assert_eq!(last_constructed(), Some("LazyAcpProvider"));
    }

    #[test]
    fn s24_natives_use_with_program_when_catalog_program_present() {
        let factory = factory();
        let _ = factory.route_provider("claude", Some("/opt/claude".into()));
        assert_eq!(last_constructed(), Some("ClaudeNativeProvider"));
        let _ = factory.route_provider("codex", Some("/opt/codex".into()));
        assert_eq!(last_constructed(), Some("CodexNativeProvider"));
        let _ = factory.route_provider("opencode", Some("/opt/opencode".into()));
        assert_eq!(last_constructed(), Some("OpenCodeNativeProvider"));
        let _ = factory.route_provider("pi", Some("/opt/pi".into()));
        assert_eq!(last_constructed(), Some("PiNativeProvider"));
        let _ = factory.route_provider("grok", Some("/opt/grok".into()));
        assert_eq!(last_constructed(), Some("GrokNativeProvider"));
    }

    #[tokio::test]
    async fn s24_provider_for_claude_is_not_lazy_acp() {
        let factory = factory();
        let provider = factory.provider_for("claude").await.expect("provider_for");
        assert_eq!(provider.id(), "claude");
        assert_eq!(last_constructed(), Some("ClaudeNativeProvider"));
        assert_ne!(last_constructed(), Some("LazyAcpProvider"));
    }

    #[tokio::test]
    async fn s24_provider_for_grok_is_native_acp_registry_stays_acp() {
        let factory = factory();
        let grok = factory.provider_for("grok").await.expect("grok");
        assert_eq!(grok.id(), "grok");
        assert_eq!(last_constructed(), Some("GrokNativeProvider"));

        let custom = factory.provider_for("my-claude").await.expect("my-claude");
        assert_eq!(custom.id(), "my-claude");
        assert_eq!(last_constructed(), Some("LazyAcpProvider"));

        let grok_build = factory
            .provider_for("grok-build")
            .await
            .expect("grok-build");
        assert_eq!(grok_build.id(), "grok-build");
        assert_eq!(last_constructed(), Some("LazyAcpProvider"));
    }

    #[tokio::test]
    async fn s24_provider_for_passes_canonical_catalog_program_into_native() {
        let factory = factory();

        let _claude = override_launch("claude", "/opt/catalog-claude");
        let claude = factory
            .provider_for("claude-code")
            .await
            .expect("provider_for claude-code");
        assert_eq!(claude.id(), "claude");
        assert_eq!(last_constructed(), Some("ClaudeNativeProvider"));
        assert_eq!(
            last_resolve_id().as_deref(),
            Some("claude"),
            "claude-code must resolve catalog as canonical claude"
        );
        drop(_claude);

        let _pi = override_launch("pi", "/opt/catalog-pi");
        let pi = factory.provider_for("pi").await.expect("provider_for pi");
        assert_eq!(pi.id(), "pi");
        assert_eq!(last_resolve_id().as_deref(), Some("pi"));
        assert_eq!(
            last_pi_native()
                .expect("PiNativeProvider captured")
                .program(),
            "/opt/catalog-pi"
        );
        drop(_pi);

        let _grok = override_launch("grok", "/opt/catalog-grok");
        let grok = factory
            .provider_for("grok")
            .await
            .expect("provider_for grok");
        assert_eq!(grok.id(), "grok");
        assert_eq!(last_resolve_id().as_deref(), Some("grok"));
        assert_eq!(
            last_grok_native()
                .expect("GrokNativeProvider captured")
                .program(),
            "/opt/catalog-grok"
        );
    }

    #[tokio::test]
    async fn s24_provider_for_acp_registry_does_not_construct_native() {
        let factory = factory();
        let provider = factory
            .provider_for("codex-acp")
            .await
            .expect("provider_for codex-acp");
        assert_eq!(provider.id(), "codex-acp");
        assert_eq!(last_constructed(), Some("LazyAcpProvider"));
    }
}
