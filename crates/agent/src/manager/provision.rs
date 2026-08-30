//! How Atmos provisions ACP agents: bind an official CLI, or download an adapter.
//!
//! Two kinds exist in the ACP ecosystem:
//!
//! - **Native** — the official agent binary already speaks ACP when launched with
//!   extra args (`gemini --acp`, `cursor-agent acp`). Reuse PATH. Never overwrite.
//! - **Adapter** — a separate ACP package/binary (Zed's `claude-agent-acp`,
//!   `codex-acp`, `pi-acp`, Google's `agy_acp_server`). Safe to download.

use std::path::Path;

use super::binary;
use super::manifest::{upsert_manifest_entry, with_manifest, InstallManifest, ManifestEntry};
use super::npm::normalize_npm_package_name;
use super::registry::RegistryEntry;
use super::{AgentError, Result};
use crate::models::{AgentLaunchSpec, RegistryAgent, RegistryInstallResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AcpProvisionKind {
    Native,
    Adapter,
}

impl AcpProvisionKind {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Native => "native",
            Self::Adapter => "adapter",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct TerminalAcpBinding {
    pub terminal_id: &'static str,
    pub registry_id: &'static str,
    pub kind: AcpProvisionKind,
    pub native_executable: Option<&'static str>,
}

/// Built-in terminal agent id → ACP registry id.
///
/// Registry-backed agents only. Native ACP CLIs that are not in the ACP
/// registry live in [`LOCAL_NATIVE_ACP_AGENTS`].
pub(crate) const TERMINAL_ACP_BINDINGS: &[TerminalAcpBinding] = &[
    TerminalAcpBinding {
        terminal_id: "claude",
        registry_id: "claude-acp",
        kind: AcpProvisionKind::Adapter,
        native_executable: None,
    },
    TerminalAcpBinding {
        terminal_id: "codex",
        registry_id: "codex-acp",
        kind: AcpProvisionKind::Adapter,
        native_executable: None,
    },
    TerminalAcpBinding {
        terminal_id: "gemini",
        registry_id: "gemini",
        kind: AcpProvisionKind::Native,
        native_executable: Some("gemini"),
    },
    TerminalAcpBinding {
        terminal_id: "antigravity",
        registry_id: "antigravity-acp",
        kind: AcpProvisionKind::Adapter,
        native_executable: None,
    },
    TerminalAcpBinding {
        terminal_id: "cursor",
        registry_id: "cursor",
        kind: AcpProvisionKind::Native,
        native_executable: Some("cursor-agent"),
    },
    TerminalAcpBinding {
        terminal_id: "opencode",
        registry_id: "opencode",
        kind: AcpProvisionKind::Native,
        native_executable: Some("opencode"),
    },
    TerminalAcpBinding {
        terminal_id: "kimi",
        registry_id: "kimi",
        kind: AcpProvisionKind::Native,
        native_executable: Some("kimi"),
    },
    TerminalAcpBinding {
        terminal_id: "kilocode",
        registry_id: "kilo",
        kind: AcpProvisionKind::Native,
        native_executable: Some("kilo"),
    },
    TerminalAcpBinding {
        terminal_id: "grok-build",
        registry_id: "grok-build",
        kind: AcpProvisionKind::Native,
        native_executable: Some("grok"),
    },
    TerminalAcpBinding {
        terminal_id: "droid",
        registry_id: "factory-droid",
        kind: AcpProvisionKind::Native,
        native_executable: Some("droid"),
    },
    TerminalAcpBinding {
        terminal_id: "devin",
        registry_id: "devin",
        kind: AcpProvisionKind::Native,
        native_executable: Some("devin"),
    },
    TerminalAcpBinding {
        terminal_id: "amp",
        registry_id: "amp-acp",
        kind: AcpProvisionKind::Adapter,
        native_executable: None,
    },
    TerminalAcpBinding {
        terminal_id: "pi",
        registry_id: "pi-acp",
        kind: AcpProvisionKind::Adapter,
        native_executable: None,
    },
];

/// Official ACP launch that is not (yet) in the ACP registry.
///
/// Bind the user's PATH binary. Never download a replacement package.
/// CommandCode has no public ACP mode, so it is omitted.
#[derive(Debug, Clone, Copy)]
pub(crate) struct LocalNativeLaunch {
    pub executable: &'static str,
    pub args: &'static [&'static str],
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct LocalNativeAcpAgent {
    pub id: &'static str,
    pub terminal_id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub repository: Option<&'static str>,
    pub launches: &'static [LocalNativeLaunch],
}

pub(crate) const LOCAL_NATIVE_ACP_AGENTS: &[LocalNativeAcpAgent] = &[
    LocalNativeAcpAgent {
        id: "kiro",
        terminal_id: "kiro",
        name: "Kiro",
        description: "Amazon Kiro CLI in official ACP mode.",
        repository: Some("https://kiro.dev/docs/cli/acp/"),
        // kiro-cli wraps kiro-cli-chat; prefer the real ACP server so the
        // wrapper cannot leave an orphaned child after Atmos stops the process.
        launches: &[
            LocalNativeLaunch {
                executable: "kiro-cli-chat",
                args: &["acp"],
            },
            LocalNativeLaunch {
                executable: "kiro-cli",
                args: &["acp"],
            },
        ],
    },
    LocalNativeAcpAgent {
        id: "openclaw",
        terminal_id: "openclaw",
        name: "OpenClaw",
        description: "OpenClaw Gateway ACP bridge over stdio.",
        repository: Some("https://github.com/openclaw/openclaw"),
        launches: &[LocalNativeLaunch {
            executable: "openclaw",
            args: &["acp"],
        }],
    },
    LocalNativeAcpAgent {
        id: "hermes",
        terminal_id: "hermes",
        name: "Hermes Agent",
        description: "Nous Research Hermes Agent in official ACP mode.",
        repository: Some("https://hermes-agent.nousresearch.com/docs/user-guide/features/acp"),
        launches: &[
            LocalNativeLaunch {
                executable: "hermes-acp",
                args: &[],
            },
            LocalNativeLaunch {
                executable: "hermes",
                args: &["acp"],
            },
        ],
    },
];

pub(crate) fn local_native_by_id(id: &str) -> Option<&'static LocalNativeAcpAgent> {
    LOCAL_NATIVE_ACP_AGENTS.iter().find(|agent| agent.id == id)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ResolvedNativeLaunch {
    pub executable_name: String,
    pub path: String,
    pub args: Vec<String>,
}

pub(crate) fn resolve_local_native(agent: &LocalNativeAcpAgent) -> Option<ResolvedNativeLaunch> {
    for launch in agent.launches {
        if let Some(path) = which_executable(launch.executable) {
            return Some(ResolvedNativeLaunch {
                executable_name: launch.executable.to_string(),
                path,
                args: launch.args.iter().map(|arg| arg.to_string()).collect(),
            });
        }
    }
    None
}

pub(crate) fn install_local_native_agent(
    agent: &LocalNativeAcpAgent,
) -> Result<RegistryInstallResult> {
    let resolved = resolve_local_native(agent).ok_or_else(|| {
        AgentError::Command(format!(
            "{} CLI was not found on PATH. Install {}, then try again.",
            agent.name,
            agent
                .launches
                .first()
                .map(|launch| launch.executable)
                .unwrap_or(agent.id)
        ))
    })?;
    bind_native_agent(agent.id, &resolved.path)
}

pub(crate) fn launch_local_native_agent(agent: &LocalNativeAcpAgent) -> Result<AgentLaunchSpec> {
    if let Some(resolved) = resolve_local_native(agent) {
        return Ok(AgentLaunchSpec {
            program: resolved.path,
            args: resolved.args,
            env: None,
        });
    }

    let manifest = super::manifest::load_install_manifest()?;
    if let Some(entry) = manifest
        .registry
        .iter()
        .find(|entry| entry.registry_id == agent.id && entry.install_method == "native")
    {
        if let Some(path) = entry
            .binary_path
            .as_ref()
            .filter(|path| Path::new(path).exists())
        {
            let args = args_for_local_path(agent, path);
            return Ok(AgentLaunchSpec {
                program: path.clone(),
                args,
                env: None,
            });
        }
    }

    Err(AgentError::NotFound(format!(
        "{} CLI is not installed",
        agent.name
    )))
}

pub(crate) fn overlay_registry_agent(
    agent: &LocalNativeAcpAgent,
    manifest: &InstallManifest,
) -> RegistryAgent {
    let resolved = resolve_local_native(agent);
    let native_bound = manifest.registry.iter().any(|entry| {
        entry.registry_id == agent.id
            && entry.install_method == "native"
            && entry
                .binary_path
                .as_ref()
                .map(|path| Path::new(path).exists())
                .unwrap_or(false)
    });
    let installed = resolved.is_some() || native_bound;
    let default_config = manifest
        .registry
        .iter()
        .find(|entry| entry.registry_id == agent.id)
        .and_then(|entry| entry.default_config.clone());
    let fallback = agent.launches.first();
    let executable_name = resolved
        .as_ref()
        .map(|launch| launch.executable_name.as_str())
        .or_else(|| fallback.map(|launch| launch.executable))
        .unwrap_or(agent.id);
    let args = resolved
        .as_ref()
        .map(|launch| launch.args.clone())
        .or_else(|| fallback.map(|launch| launch.args.iter().map(|arg| arg.to_string()).collect()))
        .unwrap_or_default();

    RegistryAgent {
        id: agent.id.to_string(),
        name: agent.name.to_string(),
        version: "local".to_string(),
        description: agent.description.to_string(),
        repository: agent.repository.map(str::to_string),
        icon: None,
        cli_command: native_cli_command(executable_name, &args),
        install_method: "native".to_string(),
        package: None,
        installed,
        installed_version: None,
        default_config,
        provision_kind: AcpProvisionKind::Native.as_str().to_string(),
        native_executable: Some(executable_name.to_string()),
        terminal_agent_id: Some(agent.terminal_id.to_string()),
        can_remove: false,
    }
}

fn args_for_local_path(agent: &LocalNativeAcpAgent, path: &str) -> Vec<String> {
    let file_name = Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(path);
    agent
        .launches
        .iter()
        .find(|launch| launch.executable == file_name)
        .or_else(|| agent.launches.first())
        .map(|launch| launch.args.iter().map(|arg| arg.to_string()).collect())
        .unwrap_or_default()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ClassifiedProvision {
    pub kind: AcpProvisionKind,
    pub native_executable: Option<String>,
    pub terminal_agent_id: Option<String>,
    pub args: Vec<String>,
}

pub(crate) fn binding_for_registry_id(registry_id: &str) -> Option<&'static TerminalAcpBinding> {
    TERMINAL_ACP_BINDINGS
        .iter()
        .find(|binding| binding.registry_id == registry_id)
}

pub(crate) fn classify_registry_agent(entry: &RegistryEntry) -> ClassifiedProvision {
    let args = registry_acp_args(entry);
    if let Some(binding) = binding_for_registry_id(&entry.id) {
        return ClassifiedProvision {
            kind: binding.kind,
            native_executable: binding.native_executable.map(str::to_string),
            terminal_agent_id: Some(binding.terminal_id.to_string()),
            args,
        };
    }

    let package = entry
        .distribution
        .npx
        .as_ref()
        .map(|npx| npx.package.as_str());
    let (cmd_hint, inferred_args) = inferred_launch_hints(entry);
    let args = if args.is_empty() { inferred_args } else { args };

    if looks_like_adapter_artifact(&entry.id, package, cmd_hint.as_deref()) {
        return ClassifiedProvision {
            kind: AcpProvisionKind::Adapter,
            native_executable: None,
            terminal_agent_id: None,
            args,
        };
    }

    if args_look_like_acp(&args) {
        let native_executable =
            cmd_hint.or_else(|| package.map(guess_npx_bin).filter(|name| !name.is_empty()));
        if native_executable.is_some() {
            return ClassifiedProvision {
                kind: AcpProvisionKind::Native,
                native_executable,
                terminal_agent_id: None,
                args,
            };
        }
    }

    ClassifiedProvision {
        kind: AcpProvisionKind::Adapter,
        native_executable: None,
        terminal_agent_id: None,
        args,
    }
}

pub(crate) fn registry_acp_args(entry: &RegistryEntry) -> Vec<String> {
    if let Some(npx) = &entry.distribution.npx {
        if let Some(args) = &npx.args {
            return args.clone();
        }
    }
    binary::resolve_binary_args(&entry.distribution).unwrap_or_default()
}

pub(crate) fn registry_launch_env(
    entry: &RegistryEntry,
) -> Option<std::collections::HashMap<String, String>> {
    entry
        .distribution
        .npx
        .as_ref()
        .and_then(|npx| npx.env.clone())
}

pub(crate) fn which_executable(name: &str) -> Option<String> {
    which::which(name)
        .ok()
        .map(|path| path.to_string_lossy().to_string())
}

pub(crate) fn native_cli_command(executable: &str, args: &[String]) -> String {
    if args.is_empty() {
        executable.to_string()
    } else {
        format!("{} {}", executable, args.join(" "))
    }
}

pub(crate) fn bind_native_agent(
    registry_id: &str,
    executable_path: &str,
) -> Result<RegistryInstallResult> {
    let reg_id = registry_id.to_string();
    let path = executable_path.to_string();
    with_manifest(|manifest| {
        let existing_default = manifest
            .registry
            .iter()
            .find(|entry| entry.registry_id == reg_id)
            .and_then(|entry| entry.default_config.clone());
        upsert_manifest_entry(
            manifest,
            ManifestEntry {
                registry_id: reg_id.clone(),
                install_method: "native".to_string(),
                binary_path: Some(path.clone()),
                npm_package: None,
                installed_version: None,
                default_config: existing_default,
            },
        );
        Ok(())
    })?;

    Ok(RegistryInstallResult {
        registry_id: registry_id.to_string(),
        installed: true,
        install_method: "native".to_string(),
        message: format!("Using existing CLI at {}", executable_path),
        needs_confirmation: None,
        overwrite_message: None,
    })
}

pub(crate) fn unbind_native_agent(registry_id: &str) -> Result<RegistryInstallResult> {
    let reg_id = registry_id.to_string();
    with_manifest(|manifest| {
        let before = manifest.registry.len();
        manifest
            .registry
            .retain(|entry| entry.registry_id != reg_id);
        if manifest.registry.len() == before {
            return Err(AgentError::NotFound(format!(
                "no native bind found for: {}",
                registry_id
            )));
        }
        Ok(())
    })?;

    Ok(RegistryInstallResult {
        registry_id: registry_id.to_string(),
        installed: false,
        install_method: "native".to_string(),
        message: format!("Stopped using existing CLI for '{}'", registry_id),
        needs_confirmation: None,
        overwrite_message: None,
    })
}

fn inferred_launch_hints(entry: &RegistryEntry) -> (Option<String>, Vec<String>) {
    if let Some(npx) = &entry.distribution.npx {
        return (
            Some(guess_npx_bin(&npx.package)),
            npx.args.clone().unwrap_or_default(),
        );
    }
    if let Some((cmd, args)) = binary::resolve_binary_cmd_and_args(&entry.distribution) {
        return (Some(cmd), args);
    }
    (None, Vec::new())
}

fn guess_npx_bin(package: &str) -> String {
    let name = normalize_npm_package_name(package);
    let last = name.rsplit('/').next().unwrap_or(name.as_str());
    if let Some(stripped) = last.strip_suffix("-cli") {
        if !stripped.is_empty() {
            return stripped.to_string();
        }
    }
    last.to_string()
}

fn looks_like_adapter_artifact(id: &str, package: Option<&str>, cmd: Option<&str>) -> bool {
    [Some(id), package, cmd]
        .into_iter()
        .flatten()
        .any(name_looks_like_adapter)
}

fn name_looks_like_adapter(raw: &str) -> bool {
    let lower = raw.to_ascii_lowercase();
    if lower.contains("@agentclientprotocol/") {
        return true;
    }
    let base = Path::new(&lower)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&lower);
    if base.contains("-acp")
        || base.contains("_acp")
        || base.contains("acp-server")
        || base.contains("acp_server")
        || base.contains("agent-acp")
    {
        return true;
    }
    base.ends_with("acp") && base != "acp" && (base.contains('-') || base.contains('_'))
}

fn args_look_like_acp(args: &[String]) -> bool {
    if args.iter().any(|arg| {
        let lower = arg.to_ascii_lowercase();
        lower == "acp"
            || lower == "--acp"
            || lower.starts_with("--acp=")
            || lower.contains("acp-daemon")
    }) {
        return true;
    }
    let joined = args.join(" ").to_ascii_lowercase();
    joined.contains("agent stdio") || joined.contains("--output-format acp")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manager::registry::{RegistryDistribution, RegistryPackageDistribution};

    fn npx_entry(id: &str, package: &str, args: &[&str]) -> RegistryEntry {
        RegistryEntry {
            id: id.to_string(),
            name: id.to_string(),
            version: "1.0.0".to_string(),
            description: String::new(),
            repository: None,
            icon: None,
            distribution: RegistryDistribution {
                npx: Some(RegistryPackageDistribution {
                    package: package.to_string(),
                    args: Some(args.iter().map(|arg| arg.to_string()).collect()),
                    env: None,
                }),
                binary: None,
            },
        }
    }

    fn binary_entry(id: &str, cmd: &str, args: &[&str]) -> RegistryEntry {
        RegistryEntry {
            id: id.to_string(),
            name: id.to_string(),
            version: "1.0.0".to_string(),
            description: String::new(),
            repository: None,
            icon: None,
            distribution: RegistryDistribution {
                npx: None,
                binary: Some(serde_json::json!({
                    "darwin-aarch64": {
                        "archive": "https://example.invalid/agent.tar.gz",
                        "cmd": cmd,
                        "args": args,
                    },
                    "darwin-x86_64": {
                        "archive": "https://example.invalid/agent.tar.gz",
                        "cmd": cmd,
                        "args": args,
                    },
                    "linux-x86_64": {
                        "archive": "https://example.invalid/agent.tar.gz",
                        "cmd": cmd,
                        "args": args,
                    },
                    "linux-aarch64": {
                        "archive": "https://example.invalid/agent.tar.gz",
                        "cmd": cmd,
                        "args": args,
                    },
                    "windows-x86_64": {
                        "archive": "https://example.invalid/agent.tar.gz",
                        "cmd": cmd,
                        "args": args,
                    },
                })),
            },
        }
    }

    #[test]
    fn terminal_bindings_are_unique() {
        let mut terminal_ids = std::collections::HashSet::new();
        let mut registry_ids = std::collections::HashSet::new();
        for binding in TERMINAL_ACP_BINDINGS {
            assert!(
                terminal_ids.insert(binding.terminal_id),
                "duplicate terminal id {}",
                binding.terminal_id
            );
            assert!(
                registry_ids.insert(binding.registry_id),
                "duplicate registry id {}",
                binding.registry_id
            );
            if binding.kind == AcpProvisionKind::Native {
                assert!(binding.native_executable.is_some());
            } else {
                assert!(binding.native_executable.is_none());
            }
        }
    }

    #[test]
    fn local_native_overlay_covers_unregistered_official_acp() {
        let mut ids = std::collections::HashSet::new();
        let registry_ids: std::collections::HashSet<_> = TERMINAL_ACP_BINDINGS
            .iter()
            .map(|binding| binding.registry_id)
            .collect();
        for agent in LOCAL_NATIVE_ACP_AGENTS {
            assert!(ids.insert(agent.id), "duplicate overlay id {}", agent.id);
            assert!(
                !registry_ids.contains(agent.id),
                "overlay id {} collides with a registry binding",
                agent.id
            );
            assert!(!agent.launches.is_empty());
        }

        let kiro = local_native_by_id("kiro").expect("kiro overlay");
        assert_eq!(kiro.launches[0].executable, "kiro-cli-chat");
        assert_eq!(kiro.launches[0].args, &["acp"]);
        assert_eq!(kiro.launches[1].executable, "kiro-cli");

        let openclaw = local_native_by_id("openclaw").expect("openclaw overlay");
        assert_eq!(openclaw.launches[0].executable, "openclaw");
        assert_eq!(openclaw.launches[0].args, &["acp"]);

        let hermes = local_native_by_id("hermes").expect("hermes overlay");
        assert_eq!(hermes.launches[0].executable, "hermes-acp");
        assert!(hermes.launches[0].args.is_empty());
        assert_eq!(hermes.launches[1].executable, "hermes");
        assert_eq!(hermes.launches[1].args, &["acp"]);
    }

    #[test]
    fn overlay_registry_agent_is_native_and_not_removable() {
        let kiro = local_native_by_id("kiro").expect("kiro overlay");
        let listed = overlay_registry_agent(kiro, &InstallManifest::default());
        assert_eq!(listed.id, "kiro");
        assert_eq!(listed.provision_kind, "native");
        assert_eq!(listed.terminal_agent_id.as_deref(), Some("kiro"));
        assert!(!listed.can_remove);
        assert_eq!(listed.install_method, "native");
        assert!(listed.cli_command.contains("acp"));
    }

    #[test]
    fn classifies_adapter_packages_from_explicit_table() {
        let claude = classify_registry_agent(&npx_entry(
            "claude-acp",
            "@agentclientprotocol/claude-agent-acp@0.70.0",
            &[],
        ));
        assert_eq!(claude.kind, AcpProvisionKind::Adapter);
        assert_eq!(claude.terminal_agent_id.as_deref(), Some("claude"));

        let codex = classify_registry_agent(&npx_entry(
            "codex-acp",
            "@agentclientprotocol/codex-acp@1.7.0",
            &[],
        ));
        assert_eq!(codex.kind, AcpProvisionKind::Adapter);
        assert_eq!(codex.terminal_agent_id.as_deref(), Some("codex"));

        let pi = classify_registry_agent(&npx_entry("pi-acp", "pi-acp@0.0.33", &[]));
        assert_eq!(pi.kind, AcpProvisionKind::Adapter);
        assert_eq!(pi.terminal_agent_id.as_deref(), Some("pi"));
    }

    #[test]
    fn classifies_native_official_clis_from_explicit_table() {
        let gemini = classify_registry_agent(&npx_entry(
            "gemini",
            "@google/gemini-cli@0.57.0",
            &["--acp"],
        ));
        assert_eq!(gemini.kind, AcpProvisionKind::Native);
        assert_eq!(gemini.native_executable.as_deref(), Some("gemini"));
        assert_eq!(gemini.args, vec!["--acp".to_string()]);
        assert_eq!(gemini.terminal_agent_id.as_deref(), Some("gemini"));

        let grok = classify_registry_agent(&npx_entry(
            "grok-build",
            "@xai-official/grok@1.0.13",
            &["agent", "stdio"],
        ));
        assert_eq!(grok.kind, AcpProvisionKind::Native);
        assert_eq!(grok.native_executable.as_deref(), Some("grok"));
        assert_eq!(grok.args, vec!["agent".to_string(), "stdio".to_string()]);

        let droid = classify_registry_agent(&npx_entry(
            "factory-droid",
            "droid@0.208.0",
            &["exec", "--output-format", "acp-daemon"],
        ));
        assert_eq!(droid.kind, AcpProvisionKind::Native);
        assert_eq!(droid.native_executable.as_deref(), Some("droid"));
    }

    #[test]
    fn classifies_native_binary_agents_from_explicit_table() {
        let cursor = classify_registry_agent(&binary_entry(
            "cursor",
            "./dist-package/cursor-agent",
            &["acp"],
        ));
        assert_eq!(cursor.kind, AcpProvisionKind::Native);
        assert_eq!(cursor.native_executable.as_deref(), Some("cursor-agent"));

        let opencode = classify_registry_agent(&binary_entry("opencode", "./opencode", &["acp"]));
        assert_eq!(opencode.kind, AcpProvisionKind::Native);
        assert_eq!(opencode.native_executable.as_deref(), Some("opencode"));
    }

    #[test]
    fn classifies_antigravity_and_amp_as_adapters() {
        let antigravity = classify_registry_agent(&binary_entry(
            "antigravity-acp",
            "./agy_acp_server.par",
            &[],
        ));
        assert_eq!(antigravity.kind, AcpProvisionKind::Adapter);
        assert_eq!(
            antigravity.terminal_agent_id.as_deref(),
            Some("antigravity")
        );

        let amp = classify_registry_agent(&binary_entry("amp-acp", "./amp-acp", &[]));
        assert_eq!(amp.kind, AcpProvisionKind::Adapter);
        assert_eq!(amp.terminal_agent_id.as_deref(), Some("amp"));
    }

    #[test]
    fn heuristic_treats_official_acp_flag_as_native() {
        let cline = classify_registry_agent(&npx_entry("cline", "cline@3.0.60", &["--acp"]));
        assert_eq!(cline.kind, AcpProvisionKind::Native);
        assert_eq!(cline.native_executable.as_deref(), Some("cline"));

        let goose = classify_registry_agent(&binary_entry("goose", "./goose", &["acp"]));
        assert_eq!(goose.kind, AcpProvisionKind::Native);
        assert_eq!(goose.native_executable.as_deref(), Some("goose"));
    }

    #[test]
    fn heuristic_treats_acp_named_packages_as_adapters() {
        let glm = classify_registry_agent(&npx_entry("glm-acp-agent", "glm-acp-agent@1.7.0", &[]));
        assert_eq!(glm.kind, AcpProvisionKind::Adapter);

        let vibe = classify_registry_agent(&binary_entry("mistral-vibe", "./vibe-acp", &[]));
        assert_eq!(vibe.kind, AcpProvisionKind::Adapter);
    }

    #[test]
    fn guess_npx_bin_strips_cli_suffix() {
        assert_eq!(guess_npx_bin("@google/gemini-cli@0.57.0"), "gemini");
        assert_eq!(guess_npx_bin("@github/copilot@1.0.81"), "copilot");
        assert_eq!(guess_npx_bin("cline@3.0.60"), "cline");
    }

    #[test]
    fn native_cli_command_formats_args() {
        assert_eq!(
            native_cli_command("gemini", &["--acp".into()]),
            "gemini --acp"
        );
        assert_eq!(
            native_cli_command("grok", &["agent".into(), "stdio".into()]),
            "grok agent stdio"
        );
    }

    #[test]
    fn adapter_name_detection() {
        assert!(name_looks_like_adapter(
            "@agentclientprotocol/claude-agent-acp"
        ));
        assert!(name_looks_like_adapter("pi-acp"));
        assert!(name_looks_like_adapter("./agy_acp_server.par"));
        assert!(name_looks_like_adapter("amp-acp"));
        assert!(!name_looks_like_adapter("gemini"));
        assert!(!name_looks_like_adapter("cursor-agent"));
        assert!(!name_looks_like_adapter("opencode"));
    }
}
