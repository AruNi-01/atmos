use std::path::{Path, PathBuf};
use std::time::Duration;

use async_trait::async_trait;
use tokio::process::Command;
use tokio::time::timeout;

use crate::catalog::{AgentModelCatalog, CatalogStatus, CatalogStrategyKind};
use crate::contract::{AgentAvailableCommand, AgentThinkingSupport};
use crate::policy::canonicalize_chat_provider_id;

use super::merge::{merge_catalogs, CatalogFragment};
use super::parse::{
    apply_grok_thinking_overlay, commands_from_value, dedupe_models, looks_like_auth_required,
    parse_droid_help, parse_grok, parse_json_models, parse_line_list,
};
use super::spec::{AgentCatalogSpec, CatalogParserKind};

#[derive(Debug, Clone)]
pub struct CommandOutput {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

#[async_trait]
pub trait CommandRunner: Send + Sync {
    async fn run(&self, argv: &[String], timeout: Duration) -> Result<CommandOutput, String>;
}

pub struct ProcessCommandRunner;

#[async_trait]
impl CommandRunner for ProcessCommandRunner {
    async fn run(&self, argv: &[String], max: Duration) -> Result<CommandOutput, String> {
        if argv.is_empty() {
            return Err("empty command".into());
        }
        let mut cmd = Command::new(&argv[0]);
        if argv.len() > 1 {
            cmd.args(&argv[1..]);
        }
        let output = timeout(max, cmd.output())
            .await
            .map_err(|_| "model list timed out".to_string())?
            .map_err(|e| e.to_string())?;
        Ok(CommandOutput {
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        })
    }
}

#[derive(Debug, Clone)]
pub struct AcpProbeResult {
    pub models: Vec<crate::contract::AgentModel>,
    pub modes: Vec<crate::contract::AgentMode>,
    pub permission_modes: Vec<crate::contract::AgentMode>,
    pub thinking: AgentThinkingSupport,
    pub commands: Vec<AgentAvailableCommand>,
    pub cwd: PathBuf,
    pub closed: bool,
}

#[async_trait]
pub trait AcpCatalogProbe: Send + Sync {
    async fn probe(&self, agent_id: &str, isolated_cwd: &Path) -> Result<AcpProbeResult, String>;
}

pub struct NoopAcpProbe;

#[async_trait]
impl AcpCatalogProbe for NoopAcpProbe {
    async fn probe(&self, _agent_id: &str, _isolated_cwd: &Path) -> Result<AcpProbeResult, String> {
        Err("acp probe unavailable".into())
    }
}

#[derive(Debug, Clone)]
pub struct NativeProbeResult {
    pub models: Vec<crate::contract::AgentModel>,
    pub modes: Vec<crate::contract::AgentMode>,
    pub permission_modes: Vec<crate::contract::AgentMode>,
    pub thinking: AgentThinkingSupport,
    pub commands: Vec<AgentAvailableCommand>,
    pub cwd: PathBuf,
    pub closed: bool,
}

#[async_trait]
pub trait NativeCatalogProbe: Send + Sync {
    async fn probe(&self, agent_id: &str, isolated_cwd: &Path)
        -> Result<NativeProbeResult, String>;
}

pub struct NoopNativeProbe;

#[async_trait]
impl NativeCatalogProbe for NoopNativeProbe {
    async fn probe(
        &self,
        _agent_id: &str,
        _isolated_cwd: &Path,
    ) -> Result<NativeProbeResult, String> {
        Err("native probe unavailable".into())
    }
}

pub struct CatalogEngine {
    pub command_runner: Box<dyn CommandRunner>,
    pub acp_probe: Box<dyn AcpCatalogProbe>,
    pub native_probe: Box<dyn NativeCatalogProbe>,
    pub probe_root: PathBuf,
}

impl CatalogEngine {
    pub fn with_acp_probe(probe_root: PathBuf, acp_probe: Box<dyn AcpCatalogProbe>) -> Self {
        Self {
            command_runner: Box::new(ProcessCommandRunner),
            acp_probe,
            native_probe: Box::new(crate::catalog::native::DispatchNativeCatalogProbe),
            probe_root,
        }
    }

    pub async fn probe(&self, spec: &AgentCatalogSpec) -> AgentModelCatalog {
        let mut fragments = Vec::new();
        for kind in spec.default_strategies() {
            match kind {
                CatalogStrategyKind::Config => fragments.push(self.config_fragment(spec)),
                CatalogStrategyKind::Cli => {
                    if let Some(fragment) = self.cli_fragment(spec).await {
                        fragments.push(fragment);
                    }
                }
                CatalogStrategyKind::Acp => {
                    if spec.acp {
                        if let Some(fragment) = self.acp_fragment(spec).await {
                            fragments.push(fragment);
                        }
                    }
                }
                CatalogStrategyKind::Native => {
                    if let Some(fragment) = self.native_fragment(spec).await {
                        fragments.push(fragment);
                    }
                }
            }
        }
        if canonicalize_chat_provider_id(&spec.agent_id) == "amp" {
            if let Some(fragment) = self.amp_commands_fragment().await {
                fragments.push(fragment);
            }
        }
        if fragments.is_empty() {
            return AgentModelCatalog::unsupported(
                &spec.agent_id,
                "No catalog strategy produced models",
            );
        }
        let mut catalog = merge_catalogs(&spec.agent_id, &fragments);
        if canonicalize_chat_provider_id(&spec.agent_id) == "grok" {
            apply_grok_thinking_overlay(&mut catalog);
        }
        catalog
    }

    fn config_fragment(&self, spec: &AgentCatalogSpec) -> CatalogFragment {
        CatalogFragment {
            models: spec.static_models.clone(),
            thinking: spec.thinking.clone(),
            strategy: Some(CatalogStrategyKind::Config),
            status: Some(
                if spec.static_models.is_empty() && spec.thinking.is_none() {
                    CatalogStatus::Unsupported
                } else {
                    CatalogStatus::Ok
                },
            ),
            ..Default::default()
        }
    }

    async fn cli_fragment(&self, spec: &AgentCatalogSpec) -> Option<CatalogFragment> {
        if spec.cli_command.is_empty() {
            return None;
        }
        let timeout = match spec.parser {
            CatalogParserKind::DroidHelp => Duration::from_secs(20),
            _ => Duration::from_secs(8),
        };
        match self.command_runner.run(&spec.cli_command, timeout).await {
            Ok(output) => {
                let combined = format!("{}\n{}", output.stdout, output.stderr);
                let parsed = match spec.parser {
                    CatalogParserKind::GrokLineList => parse_grok(&output.stdout),
                    CatalogParserKind::KiroJson | CatalogParserKind::Json => {
                        parse_json_models(&output.stdout).unwrap_or_default()
                    }
                    CatalogParserKind::DroidHelp => parse_droid_help(&combined),
                    CatalogParserKind::LineList => parse_line_list(&output.stdout),
                };
                if parsed.is_empty() && !output.success {
                    let status = if looks_like_auth_required(&combined) {
                        CatalogStatus::AuthRequired
                    } else {
                        CatalogStatus::Error
                    };
                    return Some(CatalogFragment {
                        status: Some(status),
                        message: Some(combined.trim().to_string()),
                        strategy: Some(CatalogStrategyKind::Cli),
                        ..Default::default()
                    });
                }
                Some(CatalogFragment {
                    models: dedupe_models(parsed),
                    status: Some(CatalogStatus::Ok),
                    strategy: Some(CatalogStrategyKind::Cli),
                    ..Default::default()
                })
            }
            Err(error) => Some(CatalogFragment {
                status: Some(CatalogStatus::Error),
                message: Some(error),
                strategy: Some(CatalogStrategyKind::Cli),
                ..Default::default()
            }),
        }
    }

    async fn acp_fragment(&self, spec: &AgentCatalogSpec) -> Option<CatalogFragment> {
        let isolated = self.probe_root.join(&spec.agent_id);
        if let Err(error) = std::fs::create_dir_all(&isolated) {
            return Some(CatalogFragment {
                status: Some(CatalogStatus::Error),
                message: Some(error.to_string()),
                strategy: Some(CatalogStrategyKind::Acp),
                ..Default::default()
            });
        }
        match self.acp_probe.probe(&spec.agent_id, &isolated).await {
            Ok(result) => {
                let under_probe = result.cwd.starts_with(&self.probe_root);
                if !under_probe || !result.closed {
                    return Some(CatalogFragment {
                        status: Some(CatalogStatus::Error),
                        message: Some("temp ACP probe leaked outside catalog-probe/".into()),
                        strategy: Some(CatalogStrategyKind::Acp),
                        ..Default::default()
                    });
                }
                Some(CatalogFragment {
                    models: result.models,
                    modes: result.modes,
                    permission_modes: result.permission_modes,
                    thinking: result.thinking,
                    commands: result.commands,
                    status: Some(CatalogStatus::Ok),
                    strategy: Some(CatalogStrategyKind::Acp),
                    ..Default::default()
                })
            }
            Err(error) => Some(CatalogFragment {
                status: Some(CatalogStatus::Error),
                message: Some(error),
                strategy: Some(CatalogStrategyKind::Acp),
                ..Default::default()
            }),
        }
    }

    async fn native_fragment(&self, spec: &AgentCatalogSpec) -> Option<CatalogFragment> {
        let isolated = self.probe_root.join(&spec.agent_id);
        if let Err(error) = std::fs::create_dir_all(&isolated) {
            return Some(CatalogFragment {
                status: Some(CatalogStatus::Error),
                message: Some(error.to_string()),
                strategy: Some(CatalogStrategyKind::Native),
                ..Default::default()
            });
        }
        match self.native_probe.probe(&spec.agent_id, &isolated).await {
            Ok(result) => {
                let under_probe = result.cwd.starts_with(&self.probe_root);
                if !under_probe || !result.closed {
                    return Some(CatalogFragment {
                        status: Some(CatalogStatus::Error),
                        message: Some("temp native probe leaked outside catalog-probe/".into()),
                        strategy: Some(CatalogStrategyKind::Native),
                        ..Default::default()
                    });
                }
                Some(CatalogFragment {
                    models: result.models,
                    modes: result.modes,
                    permission_modes: result.permission_modes,
                    thinking: result.thinking,
                    commands: result.commands,
                    status: Some(CatalogStatus::Ok),
                    strategy: Some(CatalogStrategyKind::Native),
                    ..Default::default()
                })
            }
            Err(error) => Some(CatalogFragment {
                status: Some(CatalogStatus::Error),
                message: Some(error),
                strategy: Some(CatalogStrategyKind::Native),
                ..Default::default()
            }),
        }
    }

    async fn amp_commands_fragment(&self) -> Option<CatalogFragment> {
        let output = self
            .command_runner
            .run(
                &[
                    "amp".to_string(),
                    "skill".to_string(),
                    "list".to_string(),
                    "--json".to_string(),
                ],
                Duration::from_secs(15),
            )
            .await
            .ok()?;
        let value: serde_json::Value = serde_json::from_str(output.stdout.trim()).ok()?;
        let commands = commands_from_value(&value);
        if commands.is_empty() {
            return None;
        }
        Some(CatalogFragment {
            commands,
            strategy: Some(CatalogStrategyKind::Cli),
            ..Default::default()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::{AgentMode, AgentModel};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    struct FakeCli {
        calls: Arc<AtomicUsize>,
        output: CommandOutput,
    }

    #[async_trait]
    impl CommandRunner for FakeCli {
        async fn run(&self, _argv: &[String], _timeout: Duration) -> Result<CommandOutput, String> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(self.output.clone())
        }
    }

    struct IsolatedAcp;

    #[async_trait]
    impl AcpCatalogProbe for IsolatedAcp {
        async fn probe(
            &self,
            _agent_id: &str,
            isolated_cwd: &Path,
        ) -> Result<AcpProbeResult, String> {
            Ok(AcpProbeResult {
                models: vec![AgentModel {
                    id: "acp-model".into(),
                    label: "ACP".into(),
                    group: None,
                    is_default: true,
                    thinking: None,
                }],
                modes: Vec::new(),
                permission_modes: vec![AgentMode {
                    id: "default".into(),
                    label: "Default".into(),
                    is_default: true,
                }],
                thinking: AgentThinkingSupport::None,
                commands: Vec::new(),
                cwd: isolated_cwd.to_path_buf(),
                closed: true,
            })
        }
    }

    #[tokio::test]
    async fn temp_acp_uses_catalog_probe_dir_and_closes() {
        let root = tempfile::tempdir().unwrap();
        let engine = CatalogEngine {
            command_runner: Box::new(FakeCli {
                calls: Arc::new(AtomicUsize::new(0)),
                output: CommandOutput {
                    success: true,
                    stdout: String::new(),
                    stderr: String::new(),
                },
            }),
            acp_probe: Box::new(IsolatedAcp),
            native_probe: Box::new(NoopNativeProbe),
            probe_root: root.path().to_path_buf(),
        };
        let spec = AgentCatalogSpec {
            agent_id: "claude".into(),
            strategies: vec![CatalogStrategyKind::Acp],
            acp: true,
            ..Default::default()
        };
        let catalog = engine.probe(&spec).await;
        assert_eq!(catalog.status, CatalogStatus::Ok);
        assert_eq!(catalog.models[0].id, "acp-model");
        assert!(catalog.modes.is_empty());
        assert_eq!(catalog.permission_modes.len(), 1);
        assert_eq!(catalog.permission_modes[0].id, "default");
        assert!(root.path().join("claude").exists());
    }

    #[tokio::test]
    async fn with_acp_probe_uses_the_provided_probe_not_noop() {
        let root = tempfile::tempdir().unwrap();
        let engine =
            CatalogEngine::with_acp_probe(root.path().to_path_buf(), Box::new(IsolatedAcp));
        let spec = AgentCatalogSpec {
            agent_id: "claude".into(),
            strategies: vec![CatalogStrategyKind::Acp],
            acp: true,
            ..Default::default()
        };
        let catalog = engine.probe(&spec).await;
        assert_eq!(catalog.models[0].id, "acp-model");
    }

    struct CountingAcp(Arc<AtomicUsize>);

    #[async_trait]
    impl AcpCatalogProbe for CountingAcp {
        async fn probe(
            &self,
            _agent_id: &str,
            _isolated_cwd: &Path,
        ) -> Result<AcpProbeResult, String> {
            self.0.fetch_add(1, Ordering::SeqCst);
            Err("acp must not run for native".into())
        }
    }

    struct CountingNative(Arc<AtomicUsize>);

    #[async_trait]
    impl NativeCatalogProbe for CountingNative {
        async fn probe(
            &self,
            _agent_id: &str,
            isolated_cwd: &Path,
        ) -> Result<NativeProbeResult, String> {
            self.0.fetch_add(1, Ordering::SeqCst);
            Ok(NativeProbeResult {
                models: vec![AgentModel {
                    id: "native-model".into(),
                    label: "Native".into(),
                    group: None,
                    is_default: true,
                    thinking: None,
                }],
                modes: Vec::new(),
                permission_modes: vec![AgentMode {
                    id: "acceptEdits".into(),
                    label: "Accept edits".into(),
                    is_default: false,
                }],
                thinking: AgentThinkingSupport::None,
                commands: Vec::new(),
                cwd: isolated_cwd.to_path_buf(),
                closed: true,
            })
        }
    }

    #[tokio::test]
    async fn native_strategy_does_not_call_acp_probe() {
        let acp_calls = Arc::new(AtomicUsize::new(0));
        let native_calls = Arc::new(AtomicUsize::new(0));
        let root = tempfile::tempdir().unwrap();
        let engine = CatalogEngine {
            command_runner: Box::new(FakeCli {
                calls: Arc::new(AtomicUsize::new(0)),
                output: CommandOutput {
                    success: true,
                    stdout: String::new(),
                    stderr: String::new(),
                },
            }),
            acp_probe: Box::new(CountingAcp(acp_calls.clone())),
            native_probe: Box::new(CountingNative(native_calls.clone())),
            probe_root: root.path().to_path_buf(),
        };
        let spec = AgentCatalogSpec {
            agent_id: "claude".into(),
            strategies: vec![CatalogStrategyKind::Native],
            acp: true,
            ..Default::default()
        };
        let catalog = engine.probe(&spec).await;
        assert_eq!(acp_calls.load(Ordering::SeqCst), 0);
        assert_eq!(native_calls.load(Ordering::SeqCst), 1);
        assert_eq!(catalog.models[0].id, "native-model");
        assert!(catalog.modes.is_empty());
        assert_eq!(catalog.permission_modes[0].id, "acceptEdits");
        assert!(catalog
            .strategies_used
            .contains(&CatalogStrategyKind::Native));
        assert!(!catalog.strategies_used.contains(&CatalogStrategyKind::Acp));
    }

    #[tokio::test]
    async fn grok_cli_models_get_thinking_overlay_not_terminal_manual() {
        let root = tempfile::tempdir().unwrap();
        let engine = CatalogEngine {
            command_runner: Box::new(FakeCli {
                calls: Arc::new(AtomicUsize::new(0)),
                output: CommandOutput {
                    success: true,
                    stdout: "Available models:\n* grok-4.5 (default)\n* grok-composer-2.5-fast\n"
                        .into(),
                    stderr: String::new(),
                },
            }),
            acp_probe: Box::new(NoopAcpProbe),
            native_probe: Box::new(NoopNativeProbe),
            probe_root: root.path().to_path_buf(),
        };
        let spec = AgentCatalogSpec {
            agent_id: "grok".into(),
            strategies: vec![CatalogStrategyKind::Config, CatalogStrategyKind::Cli],
            cli_command: vec!["grok".into(), "models".into()],
            parser: CatalogParserKind::GrokLineList,
            thinking: AgentThinkingSupport::Manual {
                arg: "--reasoning-effort".into(),
                placeholder: Some("e.g. high".into()),
            },
            acp: false,
            ..Default::default()
        };
        let catalog = engine.probe(&spec).await;
        assert!(catalog.thinking.is_none());
        let grok45 = catalog
            .models
            .iter()
            .find(|model| model.id == "grok-4.5")
            .unwrap();
        match &grok45.thinking {
            Some(AgentThinkingSupport::Enum { options, arg }) => {
                assert_eq!(options, &["low", "medium", "high"]);
                assert_ne!(arg.as_deref(), Some("--reasoning-effort"));
            }
            other => panic!("expected overlay thinking, got {other:?}"),
        }
        let composer = catalog
            .models
            .iter()
            .find(|model| model.id == "grok-composer-2.5-fast")
            .unwrap();
        assert!(composer.thinking.is_none());
    }
}
