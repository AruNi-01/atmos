//! Options probe orchestration across Config / Cli / Acp / Native strategies.

use std::path::PathBuf;
use std::time::Duration;

use crate::options::{AgentOptionsSnapshot, OptionsProbeStrategy, OptionsStatus};
use crate::policy::canonicalize_chat_provider_id;

use super::cli::parse::{
    apply_grok_thinking_overlay, commands_from_value, dedupe_models, looks_like_auth_required,
    parse_droid_help, parse_grok, parse_json_models, parse_line_list,
};
use super::cli::{CommandRunner, ProcessCommandRunner};
use super::plan::{OptionsParserKind, ProbePlan};
use super::{AcpOptionsProbe, NativeOptionsProbe};
use crate::options::merge::{merge_options_snapshots, OptionsFragment};

pub struct OptionsProbe {
    pub command_runner: Box<dyn CommandRunner>,
    pub acp_probe: Box<dyn AcpOptionsProbe>,
    pub native_probe: Box<dyn NativeOptionsProbe>,
    pub probe_root: PathBuf,
}

impl OptionsProbe {
    pub fn with_acp_probe(probe_root: PathBuf, acp_probe: Box<dyn AcpOptionsProbe>) -> Self {
        Self {
            command_runner: Box::new(ProcessCommandRunner),
            acp_probe,
            native_probe: Box::new(super::native::DispatchNativeOptionsProbe),
            probe_root,
        }
    }

    pub async fn probe(&self, spec: &ProbePlan) -> AgentOptionsSnapshot {
        let mut fragments = Vec::new();
        for kind in spec.default_strategies() {
            match kind {
                OptionsProbeStrategy::Config => fragments.push(self.config_fragment(spec)),
                OptionsProbeStrategy::Cli => {
                    if let Some(fragment) = self.cli_fragment(spec).await {
                        fragments.push(fragment);
                    }
                }
                OptionsProbeStrategy::Acp => {
                    if spec.acp {
                        if let Some(fragment) = self.acp_fragment(spec).await {
                            fragments.push(fragment);
                        }
                    }
                }
                OptionsProbeStrategy::Native => {
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
            return AgentOptionsSnapshot::unsupported(
                &spec.agent_id,
                "No options strategy produced models",
            );
        }
        let mut catalog = merge_options_snapshots(&spec.agent_id, &fragments);
        if canonicalize_chat_provider_id(&spec.agent_id) == "grok" {
            apply_grok_thinking_overlay(&mut catalog);
        }
        catalog
    }

    fn config_fragment(&self, spec: &ProbePlan) -> OptionsFragment {
        OptionsFragment {
            models: spec.static_models.clone(),
            thinking: spec.thinking.clone(),
            strategy: Some(OptionsProbeStrategy::Config),
            status: Some(
                if spec.static_models.is_empty() && spec.thinking.is_none() {
                    OptionsStatus::Unsupported
                } else {
                    OptionsStatus::Ok
                },
            ),
            ..Default::default()
        }
    }

    async fn cli_fragment(&self, spec: &ProbePlan) -> Option<OptionsFragment> {
        if spec.cli_command.is_empty() {
            return None;
        }
        let timeout = super::cli::cli_timeout(spec.parser);
        match self.command_runner.run(&spec.cli_command, timeout).await {
            Ok(output) => {
                let combined = format!("{}\n{}", output.stdout, output.stderr);
                let parsed = match spec.parser {
                    OptionsParserKind::GrokLineList => parse_grok(&output.stdout),
                    OptionsParserKind::KiroJson | OptionsParserKind::Json => {
                        parse_json_models(&output.stdout).unwrap_or_default()
                    }
                    OptionsParserKind::DroidHelp => parse_droid_help(&combined),
                    OptionsParserKind::LineList => parse_line_list(&output.stdout),
                };
                if parsed.is_empty() && !output.success {
                    let status = if looks_like_auth_required(&combined) {
                        OptionsStatus::AuthRequired
                    } else {
                        OptionsStatus::Error
                    };
                    return Some(OptionsFragment {
                        status: Some(status),
                        message: Some(combined.trim().to_string()),
                        strategy: Some(OptionsProbeStrategy::Cli),
                        ..Default::default()
                    });
                }
                let mut models = dedupe_models(parsed);
                if canonicalize_chat_provider_id(&spec.agent_id) == "cursor" {
                    models = super::cli::collapse_cursor_cli_models(models);
                }
                Some(OptionsFragment {
                    models,
                    status: Some(OptionsStatus::Ok),
                    strategy: Some(OptionsProbeStrategy::Cli),
                    ..Default::default()
                })
            }
            Err(error) => Some(OptionsFragment {
                status: Some(OptionsStatus::Error),
                message: Some(error),
                strategy: Some(OptionsProbeStrategy::Cli),
                ..Default::default()
            }),
        }
    }

    async fn acp_fragment(&self, spec: &ProbePlan) -> Option<OptionsFragment> {
        let digest = {
            use std::collections::hash_map::DefaultHasher;
            use std::hash::{Hash, Hasher};
            let mut hasher = DefaultHasher::new();
            spec.agent_id.hash(&mut hasher);
            format!("{:016x}", hasher.finish())
        };
        let safe: String = spec
            .agent_id
            .chars()
            .map(|ch| {
                if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                    ch
                } else {
                    '_'
                }
            })
            .collect();
        let agent_key = if safe.is_empty() || safe == "." || safe == ".." {
            digest.clone()
        } else {
            format!("{safe}-{digest}")
        };
        let isolated = self.probe_root.join(&agent_key);
        if let Err(error) = std::fs::create_dir_all(&isolated) {
            return Some(OptionsFragment {
                status: Some(OptionsStatus::Error),
                message: Some(error.to_string()),
                strategy: Some(OptionsProbeStrategy::Acp),
                ..Default::default()
            });
        }
        match self.acp_probe.probe(&spec.agent_id, &isolated).await {
            Ok(result) => {
                let under_probe = result.cwd.starts_with(&self.probe_root);
                if !under_probe || !result.closed {
                    return Some(OptionsFragment {
                        status: Some(OptionsStatus::Error),
                        message: Some("temp ACP probe leaked outside options-probe/".into()),
                        strategy: Some(OptionsProbeStrategy::Acp),
                        ..Default::default()
                    });
                }
                Some(OptionsFragment {
                    models: result.models,
                    modes: result.modes,
                    permission_modes: result.permission_modes,
                    thinking: result.thinking,
                    commands: result.commands,
                    status: Some(OptionsStatus::Ok),
                    strategy: Some(OptionsProbeStrategy::Acp),
                    ..Default::default()
                })
            }
            Err(error) => Some(OptionsFragment {
                status: Some(OptionsStatus::Error),
                message: Some(error),
                strategy: Some(OptionsProbeStrategy::Acp),
                ..Default::default()
            }),
        }
    }

    async fn native_fragment(&self, spec: &ProbePlan) -> Option<OptionsFragment> {
        let isolated = self.probe_root.join(&spec.agent_id);
        if let Err(error) = std::fs::create_dir_all(&isolated) {
            return Some(OptionsFragment {
                status: Some(OptionsStatus::Error),
                message: Some(error.to_string()),
                strategy: Some(OptionsProbeStrategy::Native),
                ..Default::default()
            });
        }
        match self.native_probe.probe(&spec.agent_id, &isolated).await {
            Ok(result) => {
                let under_probe = result.cwd.starts_with(&self.probe_root);
                if !under_probe || !result.closed {
                    return Some(OptionsFragment {
                        status: Some(OptionsStatus::Error),
                        message: Some("temp native probe leaked outside options-probe/".into()),
                        strategy: Some(OptionsProbeStrategy::Native),
                        ..Default::default()
                    });
                }
                Some(OptionsFragment {
                    models: result.models,
                    modes: result.modes,
                    permission_modes: result.permission_modes,
                    thinking: result.thinking,
                    commands: result.commands,
                    status: Some(OptionsStatus::Ok),
                    strategy: Some(OptionsProbeStrategy::Native),
                    ..Default::default()
                })
            }
            Err(error) => Some(OptionsFragment {
                status: Some(OptionsStatus::Error),
                message: Some(error),
                strategy: Some(OptionsProbeStrategy::Native),
                ..Default::default()
            }),
        }
    }

    async fn amp_commands_fragment(&self) -> Option<OptionsFragment> {
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
        Some(OptionsFragment {
            commands,
            strategy: Some(OptionsProbeStrategy::Cli),
            ..Default::default()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::{AgentMode, AgentModel, AgentThinkingSupport};
    use async_trait::async_trait;
    use std::path::Path;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use super::super::cli::CommandOutput;
    use super::super::{
        AcpOptionsProbeResult, NativeOptionsProbeResult, NoopAcpOptionsProbe,
        NoopNativeOptionsProbe,
    };

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
    impl AcpOptionsProbe for IsolatedAcp {
        async fn probe(
            &self,
            _agent_id: &str,
            isolated_cwd: &Path,
        ) -> Result<AcpOptionsProbeResult, String> {
            Ok(AcpOptionsProbeResult {
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
    async fn temp_acp_uses_options_probe_dir_and_closes() {
        let root = tempfile::tempdir().unwrap();
        let engine = OptionsProbe {
            command_runner: Box::new(FakeCli {
                calls: Arc::new(AtomicUsize::new(0)),
                output: CommandOutput {
                    success: true,
                    stdout: String::new(),
                    stderr: String::new(),
                },
            }),
            acp_probe: Box::new(IsolatedAcp),
            native_probe: Box::new(NoopNativeOptionsProbe),
            probe_root: root.path().to_path_buf(),
        };
        let spec = ProbePlan {
            agent_id: "claude".into(),
            strategies: vec![OptionsProbeStrategy::Acp],
            acp: true,
            ..Default::default()
        };
        let catalog = engine.probe(&spec).await;
        assert_eq!(catalog.status, OptionsStatus::Ok);
        assert_eq!(catalog.models[0].id, "acp-model");
        assert!(catalog.modes.is_empty());
        assert_eq!(catalog.permission_modes.len(), 1);
        assert_eq!(catalog.permission_modes[0].id, "default");
        assert!(root.path().join("claude").exists());
    }

    #[tokio::test]
    async fn with_acp_probe_uses_the_provided_probe_not_noop() {
        let root = tempfile::tempdir().unwrap();
        let engine = OptionsProbe::with_acp_probe(root.path().to_path_buf(), Box::new(IsolatedAcp));
        let spec = ProbePlan {
            agent_id: "claude".into(),
            strategies: vec![OptionsProbeStrategy::Acp],
            acp: true,
            ..Default::default()
        };
        let catalog = engine.probe(&spec).await;
        assert_eq!(catalog.models[0].id, "acp-model");
    }

    struct CountingAcp(Arc<AtomicUsize>);

    #[async_trait]
    impl AcpOptionsProbe for CountingAcp {
        async fn probe(
            &self,
            _agent_id: &str,
            _isolated_cwd: &Path,
        ) -> Result<AcpOptionsProbeResult, String> {
            self.0.fetch_add(1, Ordering::SeqCst);
            Err("acp must not run for native".into())
        }
    }

    struct CountingNative(Arc<AtomicUsize>);

    #[async_trait]
    impl NativeOptionsProbe for CountingNative {
        async fn probe(
            &self,
            _agent_id: &str,
            isolated_cwd: &Path,
        ) -> Result<NativeOptionsProbeResult, String> {
            self.0.fetch_add(1, Ordering::SeqCst);
            Ok(NativeOptionsProbeResult {
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
        let engine = OptionsProbe {
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
        let spec = ProbePlan {
            agent_id: "claude".into(),
            strategies: vec![OptionsProbeStrategy::Native],
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
            .contains(&OptionsProbeStrategy::Native));
        assert!(!catalog.strategies_used.contains(&OptionsProbeStrategy::Acp));
    }

    #[tokio::test]
    async fn grok_cli_models_get_thinking_overlay_not_terminal_manual() {
        let root = tempfile::tempdir().unwrap();
        let engine = OptionsProbe {
            command_runner: Box::new(FakeCli {
                calls: Arc::new(AtomicUsize::new(0)),
                output: CommandOutput {
                    success: true,
                    stdout: "Available models:\n* grok-4.5 (default)\n* grok-composer-2.5-fast\n"
                        .into(),
                    stderr: String::new(),
                },
            }),
            acp_probe: Box::new(NoopAcpOptionsProbe),
            native_probe: Box::new(NoopNativeOptionsProbe),
            probe_root: root.path().to_path_buf(),
        };
        let spec = ProbePlan {
            agent_id: "grok".into(),
            strategies: vec![OptionsProbeStrategy::Config, OptionsProbeStrategy::Cli],
            cli_command: vec!["grok".into(), "models".into()],
            parser: OptionsParserKind::GrokLineList,
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

    #[tokio::test]
    async fn cursor_live_options_probe_fills_effort_against_acp_ids() {
        use crate::contract::{AgentMode, AgentModel, AgentThinkingSupport};
        use crate::options::probe::{AcpOptionsProbeResult, NoopNativeOptionsProbe};
        use std::process::Command;

        let cli = Command::new("cursor-agent").arg("--list-models").output();
        let Ok(cli) = cli else {
            eprintln!("skip: cursor-agent missing");
            return;
        };
        if !cli.status.success() {
            eprintln!("skip: cursor-agent failed");
            return;
        }
        let stdout = String::from_utf8_lossy(&cli.stdout).to_string();

        struct LiveCli(String);
        #[async_trait]
        impl CommandRunner for LiveCli {
            async fn run(
                &self,
                _argv: &[String],
                _timeout: Duration,
            ) -> Result<CommandOutput, String> {
                Ok(CommandOutput {
                    success: true,
                    stdout: self.0.clone(),
                    stderr: String::new(),
                })
            }
        }

        // Bare ACP ids observed in Atmos cache (Chat PMP).
        let acp_ids = [
            "default",
            "grok-4.6",
            "composer-2.5",
            "claude-opus-5",
            "claude-opus-4-8",
            "gpt-5.6-sol",
            "gpt-5.5",
            "claude-fable-5-1",
            "claude-fable-5",
            "grok-4.5",
            "gemini-3.8-flash",
            "gemini-3.7-flash",
            "gpt-5.6-terra",
            "claude-sonnet-5",
            "claude-sonnet-4-6",
            "gpt-5.3-codex",
            "claude-opus-4-7",
            "gpt-5.4",
            "claude-opus-4-6",
            "claude-opus-4-5",
            "gpt-5.2",
            "gpt-5.6-luna",
            "gemini-3.6-flash",
            "gemini-3.1-pro",
            "gpt-5.4-mini",
            "gpt-5.4-nano",
            "claude-haiku-4-5",
            "claude-sonnet-4-5",
            "gpt-5.1",
            "gemini-3-flash",
            "gemini-3.5-flash",
            "claude-sonnet-4",
            "gpt-5-mini",
            "gemini-2.5-flash",
            "kimi-k3",
            "kimi-k2.7-code",
            "glm-5.2",
        ];

        struct FakeAcp {
            models: Vec<&'static str>,
        }
        #[async_trait]
        impl AcpOptionsProbe for FakeAcp {
            async fn probe(
                &self,
                _agent_id: &str,
                isolated_cwd: &Path,
            ) -> Result<AcpOptionsProbeResult, String> {
                Ok(AcpOptionsProbeResult {
                    models: self
                        .models
                        .iter()
                        .map(|id| AgentModel {
                            id: (*id).into(),
                            label: (*id).into(),
                            group: None,
                            is_default: *id == "default",
                            thinking: None,
                        })
                        .collect(),
                    modes: Vec::new(),
                    permission_modes: vec![AgentMode {
                        id: "default".into(),
                        label: "Default".into(),
                        is_default: true,
                    }],
                    thinking: AgentThinkingSupport::Enum {
                        arg: Some("effort".into()),
                        options: vec![
                            "low".into(),
                            "medium".into(),
                            "high".into(),
                            "xhigh".into(),
                            "max".into(),
                        ],
                    },
                    commands: Vec::new(),
                    cwd: isolated_cwd.to_path_buf(),
                    closed: true,
                })
            }
        }

        let root = tempfile::tempdir().unwrap();
        let probe = OptionsProbe {
            command_runner: Box::new(LiveCli(stdout)),
            acp_probe: Box::new(FakeAcp {
                models: acp_ids.to_vec(),
            }),
            native_probe: Box::new(NoopNativeOptionsProbe),
            probe_root: root.path().to_path_buf(),
        };
        let plan = ProbePlan {
            agent_id: "cursor".into(),
            strategies: vec![
                OptionsProbeStrategy::Config,
                OptionsProbeStrategy::Cli,
                OptionsProbeStrategy::Acp,
            ],
            cli_command: vec!["cursor-agent".into(), "--list-models".into()],
            parser: OptionsParserKind::LineList,
            thinking: AgentThinkingSupport::EncodedInModel,
            acp: true,
            ..Default::default()
        };
        let catalog = probe.probe(&plan).await;
        assert_eq!(catalog.status, OptionsStatus::Ok);
        assert!(catalog.thinking.is_none(), "agent-level must be cleared");
        let with_effort = catalog
            .models
            .iter()
            .filter(|m| m.thinking.as_ref().is_some_and(|t| !t.is_none()))
            .count();
        let without = catalog.models.len() - with_effort;
        eprintln!(
            "cursor probe: {} models, {} with effort, {} without",
            catalog.models.len(),
            with_effort,
            without
        );
        for model in &catalog.models {
            let kind = match &model.thinking {
                Some(AgentThinkingSupport::Enum { options, .. }) => {
                    format!("enum:{:?}", options)
                }
                Some(AgentThinkingSupport::None) => "none".into(),
                None => "null".into(),
                other => format!("{other:?}"),
            };
            eprintln!("  {} -> {}", model.id, kind);
        }
        assert!(
            with_effort >= 20,
            "expected most ACP ids to inherit CLI ladders, got {with_effort}"
        );
        let grok = catalog.models.iter().find(|m| m.id == "grok-4.6").unwrap();
        assert!(grok.thinking.as_ref().is_some_and(|t| !t.is_none()));
        let sonnet = catalog
            .models
            .iter()
            .find(|m| m.id == "claude-sonnet-4-6")
            .unwrap();
        assert!(sonnet.thinking.as_ref().is_some_and(|t| !t.is_none()));

        if std::env::var_os("ATMOS_WRITE_CURSOR_OPTIONS").is_some() {
            let home = std::env::var("HOME").expect("HOME");
            let dir = std::path::PathBuf::from(home).join(".atmos/data/agent/options");
            std::fs::create_dir_all(&dir).unwrap();
            let path = dir.join("cursor.json");
            let body = serde_json::to_vec_pretty(&catalog).unwrap();
            std::fs::write(&path, body).unwrap();
            eprintln!("wrote {}", path.display());
        }
    }

    #[tokio::test]
    async fn live_cli_vs_atmos_options_probe_compare() {
        if std::env::var_os("ATMOS_LIVE_OPTIONS_COMPARE").is_none() {
            eprintln!("skip: set ATMOS_LIVE_OPTIONS_COMPARE=1 to run");
            return;
        }
        use crate::contract::AgentThinkingSupport;
        use crate::options::probe::cli::parse::{
            parse_droid_help, parse_grok, parse_json_models, parse_line_list,
        };
        use crate::options::probe::{DispatchNativeOptionsProbe, NoopAcpOptionsProbe};
        use std::collections::BTreeSet;
        use std::process::Command;
        use std::time::Instant;

        #[derive(Clone)]
        struct Case {
            agent_id: &'static str,
            argv: &'static [&'static str],
            parser: OptionsParserKind,
            native: bool,
            thinking: AgentThinkingSupport,
        }

        let cases = [
            Case {
                agent_id: "codex",
                argv: &["codex", "debug", "models"],
                parser: OptionsParserKind::Json,
                native: true,
                thinking: AgentThinkingSupport::None,
            },
            Case {
                agent_id: "antigravity",
                argv: &["agy", "models"],
                parser: OptionsParserKind::LineList,
                native: false,
                thinking: AgentThinkingSupport::None,
            },
            Case {
                agent_id: "droid",
                argv: &["droid", "exec", "--help"],
                parser: OptionsParserKind::DroidHelp,
                native: false,
                thinking: AgentThinkingSupport::Manual {
                    arg: "--reasoning-effort".into(),
                    placeholder: Some("e.g. high".into()),
                },
            },
            Case {
                agent_id: "opencode",
                argv: &["opencode", "models"],
                parser: OptionsParserKind::LineList,
                native: true,
                thinking: AgentThinkingSupport::None,
            },
            Case {
                agent_id: "cursor",
                argv: &["cursor-agent", "--list-models"],
                parser: OptionsParserKind::LineList,
                native: false,
                thinking: AgentThinkingSupport::EncodedInModel,
            },
            Case {
                agent_id: "grok",
                argv: &["grok", "models"],
                parser: OptionsParserKind::GrokLineList,
                native: true,
                thinking: AgentThinkingSupport::Manual {
                    arg: "--reasoning-effort".into(),
                    placeholder: Some("e.g. high".into()),
                },
            },
            Case {
                agent_id: "kilocode",
                argv: &["kilo", "models"],
                parser: OptionsParserKind::LineList,
                native: false,
                thinking: AgentThinkingSupport::None,
            },
            Case {
                agent_id: "commandcode",
                argv: &["cmd", "--list-models"],
                parser: OptionsParserKind::LineList,
                native: false,
                thinking: AgentThinkingSupport::None,
            },
            Case {
                agent_id: "pi",
                argv: &["pi", "--list-models"],
                parser: OptionsParserKind::LineList,
                native: true,
                thinking: AgentThinkingSupport::Enum {
                    arg: Some("--thinking".into()),
                    options: vec![
                        "off".into(),
                        "minimal".into(),
                        "low".into(),
                        "medium".into(),
                        "high".into(),
                        "xhigh".into(),
                    ],
                },
            },
        ];

        let mut failures = Vec::new();
        for case in cases {
            if Command::new(case.argv[0])
                .arg("--version")
                .output()
                .is_err()
                && Command::new("which")
                    .arg(case.argv[0])
                    .output()
                    .ok()
                    .is_none_or(|o| !o.status.success())
            {
                // which check
            }
            let which = Command::new("which").arg(case.argv[0]).output();
            let Ok(which) = which else {
                eprintln!("skip {}: binary missing", case.agent_id);
                continue;
            };
            if !which.status.success() {
                eprintln!("skip {}: binary missing", case.agent_id);
                continue;
            }

            let started = Instant::now();
            let output = Command::new(case.argv[0]).args(&case.argv[1..]).output();
            let Ok(output) = output else {
                failures.push(format!("{}: failed to spawn CLI", case.agent_id));
                continue;
            };
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let combined = format!("{stdout}\n{stderr}");
            let cli_models = match case.parser {
                OptionsParserKind::GrokLineList => parse_grok(&stdout),
                OptionsParserKind::Json | OptionsParserKind::KiroJson => {
                    parse_json_models(&stdout).unwrap_or_default()
                }
                OptionsParserKind::DroidHelp => parse_droid_help(&combined),
                OptionsParserKind::LineList => parse_line_list(&stdout),
            };
            let cli_models = if case.agent_id == "cursor" {
                crate::options::probe::cli::collapse_cursor_cli_models(cli_models)
            } else {
                cli_models
            };
            let cli_ids: BTreeSet<_> = cli_models.iter().map(|m| m.id.clone()).collect();

            struct LiveCli {
                stdout: String,
                stderr: String,
                success: bool,
            }
            #[async_trait]
            impl CommandRunner for LiveCli {
                async fn run(
                    &self,
                    _argv: &[String],
                    _timeout: Duration,
                ) -> Result<CommandOutput, String> {
                    Ok(CommandOutput {
                        success: self.success,
                        stdout: self.stdout.clone(),
                        stderr: self.stderr.clone(),
                    })
                }
            }

            let root = tempfile::tempdir().unwrap();
            let mut strategies = vec![OptionsProbeStrategy::Config, OptionsProbeStrategy::Cli];
            if case.native {
                strategies.push(OptionsProbeStrategy::Native);
            }
            let probe = OptionsProbe {
                command_runner: Box::new(LiveCli {
                    stdout: stdout.clone(),
                    stderr: stderr.clone(),
                    success: output.status.success(),
                }),
                acp_probe: Box::new(NoopAcpOptionsProbe),
                native_probe: Box::new(DispatchNativeOptionsProbe),
                probe_root: root.path().to_path_buf(),
            };
            let plan = ProbePlan {
                agent_id: case.agent_id.into(),
                strategies: strategies.clone(),
                cli_command: case.argv.iter().map(|s| (*s).to_string()).collect(),
                parser: case.parser,
                thinking: case.thinking.clone(),
                acp: false,
                ..Default::default()
            };
            let catalog = probe.probe(&plan).await;
            let atmos_ids: BTreeSet<_> = catalog.models.iter().map(|m| m.id.clone()).collect();

            let only_cli: Vec<_> = cli_ids.difference(&atmos_ids).cloned().collect();
            let only_atmos: Vec<_> = atmos_ids.difference(&cli_ids).cloned().collect();
            let cli_with_think = cli_models
                .iter()
                .filter(|m| m.thinking.as_ref().is_some_and(|t| !t.is_none()))
                .count();
            let atmos_with_think = catalog
                .models
                .iter()
                .filter(|m| m.thinking.as_ref().is_some_and(|t| !t.is_none()))
                .count();

            eprintln!(
                "=== {} ({:.1}s) status={:?} strategies={:?} ===",
                case.agent_id,
                started.elapsed().as_secs_f32(),
                catalog.status,
                catalog.strategies_used
            );
            eprintln!(
                "  CLI {} models ({} think) | Atmos {} models ({} think)",
                cli_ids.len(),
                cli_with_think,
                atmos_ids.len(),
                atmos_with_think
            );
            if !only_cli.is_empty() {
                eprintln!(
                    "  only_cli ({}): {:?}",
                    only_cli.len(),
                    only_cli.iter().take(8).collect::<Vec<_>>()
                );
            }
            if !only_atmos.is_empty() {
                eprintln!(
                    "  only_atmos ({}): {:?}",
                    only_atmos.len(),
                    only_atmos.iter().take(8).collect::<Vec<_>>()
                );
            }

            if cli_ids.is_empty() {
                failures.push(format!("{}: CLI parse empty", case.agent_id));
                continue;
            }
            // Same CLI bytes → Atmos Config+Cli must keep the full CLI id set.
            // Native/ACP may add more ids; that is fine.
            if !only_cli.is_empty() {
                failures.push(format!(
                    "{}: Atmos missing {} CLI ids (e.g. {:?})",
                    case.agent_id,
                    only_cli.len(),
                    only_cli.iter().take(5).collect::<Vec<_>>()
                ));
            }
            if atmos_ids.is_empty() {
                failures.push(format!("{}: Atmos returned no models", case.agent_id));
            }
            // Droid / codex: CLI thinking should survive into Atmos.
            if matches!(case.agent_id, "droid" | "codex")
                && cli_with_think > 0
                && atmos_with_think == 0
            {
                failures.push(format!(
                    "{}: CLI had {cli_with_think} thinking models but Atmos has 0",
                    case.agent_id
                ));
            }
            if std::env::var_os("ATMOS_WRITE_OPTIONS_CACHE").is_some()
                && catalog.status == OptionsStatus::Ok
                && !catalog.models.is_empty()
            {
                let home = std::env::var("HOME").expect("HOME");
                let dir = std::path::PathBuf::from(home).join(".atmos/data/agent/options");
                std::fs::create_dir_all(&dir).unwrap();
                let path = dir.join(format!("{}.json", case.agent_id));
                let body = serde_json::to_vec_pretty(&catalog).unwrap();
                std::fs::write(&path, body).unwrap();
                eprintln!("  wrote {}", path.display());
                // Builtin terminal id aliases used by registry lookups.
                for alias in match case.agent_id {
                    "antigravity" => &["antigravity-acp"][..],
                    "droid" => &["factory-droid"][..],
                    "kilocode" => &["kilo"][..],
                    "commandcode" => &[][..],
                    other => {
                        let _ = other;
                        &[][..]
                    }
                } {
                    let mut aliased = catalog.clone();
                    aliased.agent_id = alias.to_string();
                    let path = dir.join(format!("{alias}.json"));
                    std::fs::write(&path, serde_json::to_vec_pretty(&aliased).unwrap()).unwrap();
                    eprintln!("  wrote {}", path.display());
                }
            }
        }

        // ACP overlay: Config+Cli+Acp for agents with a local ACP entrypoint.
        {
            use crate::models::AgentLaunchSpec;
            use crate::options::probe::{
                AcpLaunchResolved, AcpLaunchResolver, StdioAcpOptionsProbe,
            };

            struct FixedResolver {
                program: String,
                args: Vec<String>,
            }
            #[async_trait]
            impl AcpLaunchResolver for FixedResolver {
                async fn resolve(&self, _agent_id: &str) -> Result<AcpLaunchResolved, String> {
                    Ok(AcpLaunchResolved {
                        launch_spec: AgentLaunchSpec {
                            program: self.program.clone(),
                            args: self.args.clone(),
                            env: None,
                        },
                        env_overrides: None,
                    })
                }
            }

            #[allow(clippy::type_complexity)]
            let acp_cases: &[(&str, &str, &[&str], OptionsParserKind, &[&str])] = &[
                (
                    "cursor",
                    "cursor-agent",
                    &["acp"],
                    OptionsParserKind::LineList,
                    &["cursor-agent", "--list-models"],
                ),
                (
                    "factory-droid",
                    "droid",
                    &["exec", "--output-format", "acp-daemon"],
                    OptionsParserKind::DroidHelp,
                    &["droid", "exec", "--help"],
                ),
                (
                    "kilo",
                    "kilo",
                    &["acp"],
                    OptionsParserKind::LineList,
                    &["kilo", "models"],
                ),
            ];

            for (agent_id, program, acp_args, parser, cli_argv) in acp_cases {
                let which = Command::new("which").arg(program).output();
                if !which.map(|o| o.status.success()).unwrap_or(false) {
                    eprintln!("skip ACP {agent_id}: {program} missing");
                    continue;
                }
                let cli = Command::new(cli_argv[0]).args(&cli_argv[1..]).output();
                let Ok(cli) = cli else {
                    failures.push(format!("{agent_id}: ACP compare failed to spawn CLI"));
                    continue;
                };
                let stdout = String::from_utf8_lossy(&cli.stdout).to_string();
                let stderr = String::from_utf8_lossy(&cli.stderr).to_string();
                let combined = format!("{stdout}\n{stderr}");
                let mut cli_models = match parser {
                    OptionsParserKind::DroidHelp => parse_droid_help(&combined),
                    OptionsParserKind::LineList => parse_line_list(&stdout),
                    _ => Vec::new(),
                };
                if *agent_id == "cursor" {
                    cli_models = crate::options::probe::cli::collapse_cursor_cli_models(cli_models);
                }
                let cli_ids: BTreeSet<_> = cli_models.iter().map(|m| m.id.clone()).collect();

                struct LiveCli {
                    stdout: String,
                    stderr: String,
                    success: bool,
                }
                #[async_trait]
                impl CommandRunner for LiveCli {
                    async fn run(
                        &self,
                        _argv: &[String],
                        _timeout: Duration,
                    ) -> Result<CommandOutput, String> {
                        Ok(CommandOutput {
                            success: self.success,
                            stdout: self.stdout.clone(),
                            stderr: self.stderr.clone(),
                        })
                    }
                }

                let root = tempfile::tempdir().unwrap();
                let probe = OptionsProbe {
                    command_runner: Box::new(LiveCli {
                        stdout,
                        stderr,
                        success: cli.status.success(),
                    }),
                    acp_probe: Box::new(StdioAcpOptionsProbe::new(std::sync::Arc::new(
                        FixedResolver {
                            program: (*program).into(),
                            args: acp_args.iter().map(|s| (*s).to_string()).collect(),
                        },
                    ))),
                    native_probe: Box::new(NoopNativeOptionsProbe),
                    probe_root: root.path().to_path_buf(),
                };
                let plan = ProbePlan {
                    agent_id: (*agent_id).into(),
                    strategies: vec![
                        OptionsProbeStrategy::Config,
                        OptionsProbeStrategy::Cli,
                        OptionsProbeStrategy::Acp,
                    ],
                    cli_command: cli_argv.iter().map(|s| (*s).to_string()).collect(),
                    parser: *parser,
                    thinking: if *agent_id == "cursor" {
                        AgentThinkingSupport::EncodedInModel
                    } else {
                        AgentThinkingSupport::None
                    },
                    acp: true,
                    ..Default::default()
                };
                let started = Instant::now();
                let catalog = probe.probe(&plan).await;
                let atmos_ids: BTreeSet<_> = catalog.models.iter().map(|m| m.id.clone()).collect();
                let atmos_with_think = catalog
                    .models
                    .iter()
                    .filter(|m| m.thinking.as_ref().is_some_and(|t| !t.is_none()))
                    .count();
                eprintln!(
                    "=== ACP {} ({:.1}s) status={:?} strategies={:?} ===",
                    agent_id,
                    started.elapsed().as_secs_f32(),
                    catalog.status,
                    catalog.strategies_used
                );
                eprintln!(
                    "  CLI {} | Atmos {} ({} think) message={:?}",
                    cli_ids.len(),
                    atmos_ids.len(),
                    atmos_with_think,
                    catalog.message.as_deref().map(|m| {
                        let t = m.trim();
                        if t.len() > 120 {
                            format!("{}…", &t[..120])
                        } else {
                            t.to_string()
                        }
                    })
                );
                if catalog.status != OptionsStatus::Ok || catalog.models.is_empty() {
                    failures.push(format!(
                        "{agent_id}: ACP Atmos probe failed status={:?} msg={:?}",
                        catalog.status, catalog.message
                    ));
                    continue;
                }
                if *agent_id == "cursor" {
                    // ACP bare ids replace CLI; effort fill must remain.
                    if atmos_with_think < 20 {
                        failures.push(format!(
                            "cursor ACP: expected effort fill on most models, got {atmos_with_think}"
                        ));
                    }
                } else if atmos_ids.is_disjoint(&cli_ids) && !cli_ids.is_empty() {
                    // Non-cursor: ACP overlay should not wipe CLI catalog entirely
                    // unless ACP alone supplies a full list (ok if non-empty).
                    eprintln!("  note: ACP model ids disjoint from CLI (ACP-shaped catalog)");
                }
                if std::env::var_os("ATMOS_WRITE_OPTIONS_CACHE").is_some() {
                    let home = std::env::var("HOME").expect("HOME");
                    let dir = std::path::PathBuf::from(home).join(".atmos/data/agent/options");
                    std::fs::create_dir_all(&dir).unwrap();
                    let path = dir.join(format!("{agent_id}.json"));
                    std::fs::write(&path, serde_json::to_vec_pretty(&catalog).unwrap()).unwrap();
                    eprintln!("  wrote {}", path.display());
                    if *agent_id == "factory-droid" {
                        let mut droid = catalog.clone();
                        droid.agent_id = "droid".into();
                        std::fs::write(
                            dir.join("droid.json"),
                            serde_json::to_vec_pretty(&droid).unwrap(),
                        )
                        .unwrap();
                    }
                }
            }
        }

        // Native-only host without modelList CLI (claude).
        {
            let which = Command::new("which").arg("claude").output();
            if which.map(|o| o.status.success()).unwrap_or(false) {
                let root = tempfile::tempdir().unwrap();
                let probe = OptionsProbe {
                    command_runner: Box::new(FakeCli {
                        calls: Arc::new(AtomicUsize::new(0)),
                        output: CommandOutput {
                            success: true,
                            stdout: String::new(),
                            stderr: String::new(),
                        },
                    }),
                    acp_probe: Box::new(NoopAcpOptionsProbe),
                    native_probe: Box::new(DispatchNativeOptionsProbe),
                    probe_root: root.path().to_path_buf(),
                };
                let plan = ProbePlan {
                    agent_id: "claude".into(),
                    strategies: vec![OptionsProbeStrategy::Config, OptionsProbeStrategy::Native],
                    thinking: AgentThinkingSupport::Enum {
                        arg: Some("--effort".into()),
                        options: vec![
                            "low".into(),
                            "medium".into(),
                            "high".into(),
                            "xhigh".into(),
                            "max".into(),
                        ],
                    },
                    acp: false,
                    ..Default::default()
                };
                let catalog = probe.probe(&plan).await;
                eprintln!(
                    "=== claude native status={:?} models={} think_agent={:?} ===",
                    catalog.status,
                    catalog.models.len(),
                    catalog.thinking
                );
                if catalog.models.is_empty() {
                    failures.push("claude: native probe returned no models".into());
                }
                if std::env::var_os("ATMOS_WRITE_OPTIONS_CACHE").is_some()
                    && catalog.status == OptionsStatus::Ok
                {
                    let home = std::env::var("HOME").expect("HOME");
                    let dir = std::path::PathBuf::from(home).join(".atmos/data/agent/options");
                    std::fs::create_dir_all(&dir).unwrap();
                    for id in ["claude", "claude-code", "claude_code"] {
                        let mut snap = catalog.clone();
                        snap.agent_id = id.into();
                        std::fs::write(
                            dir.join(format!("{id}.json")),
                            serde_json::to_vec_pretty(&snap).unwrap(),
                        )
                        .unwrap();
                    }
                }
            }
        }

        assert!(
            failures.is_empty(),
            "live CLI vs Atmos mismatches:\n{}",
            failures.join("\n")
        );
    }
}
