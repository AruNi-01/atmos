use std::path::{Path, PathBuf};
use std::time::Duration;

use async_trait::async_trait;
use tokio::process::Command;
use tokio::time::timeout;

use crate::domain::{AgentModelCatalog, AgentThinkingSupport, CatalogStatus, CatalogStrategyKind};

use super::merge::{merge_catalogs, CatalogFragment};
use super::parse::{
    dedupe_models, looks_like_auth_required, parse_grok, parse_json_models, parse_line_list,
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
    pub models: Vec<crate::domain::AgentModel>,
    pub modes: Vec<crate::domain::AgentMode>,
    pub thinking: AgentThinkingSupport,
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

pub struct CatalogEngine {
    pub command_runner: Box<dyn CommandRunner>,
    pub acp_probe: Box<dyn AcpCatalogProbe>,
    pub probe_root: PathBuf,
}

impl CatalogEngine {
    pub fn with_acp_probe(probe_root: PathBuf, acp_probe: Box<dyn AcpCatalogProbe>) -> Self {
        Self {
            command_runner: Box::new(ProcessCommandRunner),
            acp_probe,
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
            }
        }
        if fragments.is_empty() {
            return AgentModelCatalog::unsupported(
                &spec.agent_id,
                "No catalog strategy produced models",
            );
        }
        merge_catalogs(&spec.agent_id, &fragments)
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
        match self
            .command_runner
            .run(&spec.cli_command, Duration::from_secs(8))
            .await
        {
            Ok(output) => {
                let combined = format!("{}\n{}", output.stdout, output.stderr);
                if !output.success {
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
                let parsed = match spec.parser {
                    CatalogParserKind::GrokLineList => parse_grok(&output.stdout),
                    CatalogParserKind::KiroJson | CatalogParserKind::Json => {
                        parse_json_models(&output.stdout).unwrap_or_default()
                    }
                    CatalogParserKind::LineList => parse_line_list(&output.stdout),
                };
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
                    thinking: result.thinking,
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::AgentModel;
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
                thinking: AgentThinkingSupport::None,
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
}
