use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::error::{Result, ServiceError};

use super::terminal_agent_manifest;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationAgentCapability {
    pub agent_id: String,
    pub label: String,
    pub installed: bool,
    pub automation_supported: bool,
    pub model_input_mode: AutomationAgentModelInputMode,
    pub reasoning_mode: AutomationAgentReasoningMode,
    pub supports_extra_args: bool,
    pub unavailable_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalAgentOption {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub is_default: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking: Option<agent::AgentThinkingSupport>,
    /// Droid / Cursor / Grok catalog rows that advertise a CLI fast parameter.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub fast: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TerminalAgentOptionsStatus {
    Ok,
    Unsupported,
    AuthRequired,
    Error,
    Probing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TerminalAgentOptionsSource {
    Live,
    Cache,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalAgentOptions {
    pub agent_id: String,
    pub status: TerminalAgentOptionsStatus,
    pub models: Vec<TerminalAgentOption>,
    pub message: Option<String>,
    pub source: TerminalAgentOptionsSource,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AutomationAgentRunConfig {
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub reasoning: Option<AutomationAgentReasoningSelection>,
    #[serde(default)]
    pub extra_args: Vec<String>,
    /// Amp `--fast`, or a model-id fast parameter the Terminal picker turned on.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fast: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationAgentReasoningSelection {
    pub mode: AutomationAgentReasoningMode,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AutomationAgentReasoningSupport {
    #[serde(default)]
    pub mode: AutomationAgentReasoningMode,
    #[serde(default)]
    pub arg: Option<String>,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default)]
    pub placeholder: Option<String>,
    #[serde(default, rename = "valueStyle")]
    pub value_style: AutomationAgentReasoningValueStyle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AutomationAgentModelInputMode {
    #[default]
    None,
    Manual,
    Catalog,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AutomationAgentReasoningMode {
    #[default]
    None,
    Enum,
    Manual,
    EncodedInModel,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AutomationAgentReasoningValueStyle {
    #[default]
    Value,
    FlagOnly,
    Config,
}

#[derive(Debug, Clone)]
pub struct AutomationCommandInput {
    pub prompt_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct AutomationAgentCommandSpec {
    pub agent_id: String,
    pub label: String,
    pub executable: String,
    pub args: Vec<String>,
    pub prompt_strategy: PromptStrategy,
    pub stdout_parser: StdoutParser,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromptDelivery {
    Arg,
    Stdin,
    None,
}

#[derive(Debug, Clone)]
pub struct AutomationAgentInvocation {
    pub executable: String,
    pub args: Vec<String>,
    pub prompt_path: PathBuf,
    pub prompt_delivery: PromptDelivery,
    pub stdout_parser: StdoutParser,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PromptStrategy {
    Arg,
    Stdin,
    PromptFlag,
    FileFlag,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum StdoutParser {
    #[default]
    Plain,
    ClaudeStreamJson,
    CodexJsonl,
    CursorStreamJson,
    OpencodeJson,
    GrokStreamingJson,
}

impl AutomationAgentCommandSpec {
    pub fn build_invocation(&self, input: AutomationCommandInput) -> AutomationAgentInvocation {
        let mut args = self.args.clone();
        let prompt_delivery = match self.prompt_strategy {
            PromptStrategy::Arg | PromptStrategy::PromptFlag => PromptDelivery::Arg,
            PromptStrategy::Stdin => PromptDelivery::Stdin,
            PromptStrategy::FileFlag => {
                args.push(input.prompt_path.to_string_lossy().to_string());
                PromptDelivery::None
            }
        };

        AutomationAgentInvocation {
            executable: self.executable.clone(),
            args,
            prompt_path: input.prompt_path,
            prompt_delivery,
            stdout_parser: self.stdout_parser,
        }
    }

    #[cfg(test)]
    pub fn build_terminal_command(&self, input: &AutomationCommandInput) -> String {
        terminal_agent_invocation(self, &input.prompt_path)
    }

    pub fn build_terminal_launch_command(&self) -> String {
        terminal_agent_launch_command(self)
    }
}

#[derive(Debug, Clone, Deserialize)]
struct TerminalAgentDefinition {
    id: String,
    label: String,
    cmd: String,
    #[serde(default)]
    params: String,
    #[serde(default, rename = "interactiveParams")]
    interactive_params: Option<String>,
    /// Full headless flags when YOLO mode is on.
    #[serde(default, rename = "yoloParams")]
    yolo_params: Option<String>,
    /// Full interactive flags when YOLO mode is on.
    #[serde(default, rename = "yoloInteractiveParams")]
    yolo_interactive_params: Option<String>,
    #[serde(default, rename = "promptStrategy")]
    prompt_strategy: Option<PromptStrategy>,
    #[serde(default, rename = "stdoutParser")]
    stdout_parser: StdoutParser,
    #[serde(default, rename = "useEcho")]
    use_echo: bool,
    #[serde(default, rename = "modelSupport")]
    model_support: AutomationAgentModelInputMode,
    #[serde(default, rename = "reasoningSupport")]
    reasoning_support: AutomationAgentReasoningSupport,
    #[serde(default, rename = "modelList")]
    model_list: Option<TerminalAgentModelListSpec>,
}

#[derive(Debug, Clone, Deserialize)]
struct TerminalAgentModelListSpec {
    #[serde(default)]
    supported: bool,
    #[serde(default)]
    command: Vec<String>,
    #[serde(default)]
    parser: TerminalAgentModelListParser,
}

#[derive(Debug, Clone, Copy, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
enum TerminalAgentModelListParser {
    #[default]
    LineList,
    GrokLineList,
    KiroJson,
    Json,
    DroidHelp,
}

#[derive(Debug, Clone, Deserialize)]
struct TerminalCodeAgentFile {
    #[serde(default)]
    agents: Vec<TerminalCodeAgentEntry>,
}

#[derive(Debug, Clone, Deserialize)]
struct TerminalCodeAgentEntry {
    id: String,
    #[serde(default)]
    label: String,
    #[serde(default)]
    cmd: String,
    #[serde(default)]
    flags: String,
    #[serde(default, rename = "interactiveFlags")]
    interactive_flags: Option<String>,
    #[serde(default, rename = "promptStrategy")]
    prompt_strategy: Option<PromptStrategy>,
    #[serde(default, rename = "stdoutParser")]
    stdout_parser: Option<StdoutParser>,
    #[serde(default)]
    enabled: Option<bool>,
}

#[derive(Debug, Clone)]
struct ResolvedTerminalAgent {
    id: String,
    label: String,
    cmd: String,
    flags: String,
    interactive_flags: String,
    prompt_strategy: PromptStrategy,
    stdout_parser: StdoutParser,
    model_support: AutomationAgentModelInputMode,
    reasoning_support: AutomationAgentReasoningSupport,
    model_list: Option<TerminalAgentModelListSpec>,
    enabled: bool,
}

const TERMINAL_OPTIONS_TTL: Duration = Duration::from_secs(300);
const TERMINAL_OPTIONS_ERROR_TTL: Duration = Duration::from_secs(30);

static TERMINAL_OPTIONS_CACHE: OnceLock<Mutex<HashMap<String, CachedTerminalAgentOptions>>> =
    OnceLock::new();

#[derive(Debug, Clone)]
struct CachedTerminalAgentOptions {
    stored_at: Instant,
    /// Worker catalog timestamp. Launch accepts this for the worker's ok TTL.
    fetched_at: DateTime<Utc>,
    options: TerminalAgentOptions,
}

/// Copy an ok worker catalog into the store `build_run_config_args` reads.
/// Does not spawn a CLI. Empty and non-ok catalogs leave the previous entry.
pub(crate) fn remember_probed_terminal_catalog(catalog: &agent::AgentOptionsSnapshot) {
    if catalog.status != agent::OptionsStatus::Ok || catalog.models.is_empty() {
        return;
    }
    let options = crate::terminal_options_from(catalog);
    let cache = TERMINAL_OPTIONS_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let Ok(mut guard) = cache.lock() else {
        return;
    };
    guard.insert(
        catalog.agent_id.clone(),
        CachedTerminalAgentOptions {
            stored_at: Instant::now(),
            fetched_at: catalog.fetched_at,
            options,
        },
    );
}

pub fn automation_agent_capabilities() -> Result<Vec<AutomationAgentCapability>> {
    Ok(resolved_terminal_agents()?
        .into_iter()
        .map(|agent| {
            let support = automation_support(&agent);
            AutomationAgentCapability {
                agent_id: agent.id,
                label: agent.label,
                installed: support.installed,
                automation_supported: support.supported,
                model_input_mode: agent.model_support,
                reasoning_mode: agent.reasoning_support.mode,
                supports_extra_args: true,
                unavailable_reason: support.unavailable_reason,
            }
        })
        .collect())
}

/// CLI presence for each built-in terminal agent, independent of enabled/disabled settings.
///
/// Used by first-run onboarding so detection is not affected by prior visibility prefs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalAgentCliStatus {
    pub agent_id: String,
    pub label: String,
    pub cmd: String,
    pub installed: bool,
}

pub fn terminal_agent_cli_status() -> Result<Vec<TerminalAgentCliStatus>> {
    Ok(load_builtin_terminal_agents()?
        .into_iter()
        .map(|definition| {
            let installed = resolve_executable_path(&definition.cmd).is_some();
            TerminalAgentCliStatus {
                agent_id: definition.id,
                label: definition.label,
                cmd: definition.cmd,
                installed,
            }
        })
        .collect())
}

pub fn resolve_automation_agent(agent_id: &str) -> Result<AutomationAgentCommandSpec> {
    resolve_automation_agent_with_config(agent_id, None)
}

pub fn resolve_automation_agent_with_config(
    agent_id: &str,
    run_config: Option<&AutomationAgentRunConfig>,
) -> Result<AutomationAgentCommandSpec> {
    let agent = resolved_terminal_agents()?
        .into_iter()
        .find(|agent| agent.id == agent_id)
        .ok_or_else(|| {
            ServiceError::Validation(format!("Agent `{agent_id}` is not configured."))
        })?;
    let support = automation_support(&agent);
    if !support.supported {
        return Err(ServiceError::Validation(format!(
            "Agent `{agent_id}` cannot run automations: {}",
            support
                .unavailable_reason
                .unwrap_or_else(|| "unsupported automation command".to_string())
        )));
    }
    let run_config_args = build_run_config_args(&agent, run_config)?;
    let args = merge_automation_args(&agent.flags, agent.prompt_strategy, run_config_args)?;
    Ok(AutomationAgentCommandSpec {
        agent_id: agent.id,
        label: agent.label,
        executable: support
            .executable_path
            .unwrap_or_else(|| PathBuf::from(&agent.cmd))
            .to_string_lossy()
            .to_string(),
        args,
        prompt_strategy: agent.prompt_strategy,
        stdout_parser: agent.stdout_parser,
    })
}

pub fn resolve_interactive_automation_agent_with_config(
    agent_id: &str,
    run_config: Option<&AutomationAgentRunConfig>,
) -> Result<AutomationAgentCommandSpec> {
    let agent = resolved_terminal_agents()?
        .into_iter()
        .find(|agent| agent.id == agent_id)
        .ok_or_else(|| {
            ServiceError::Validation(format!("Agent `{agent_id}` is not configured."))
        })?;
    let support = automation_support(&agent);
    if !support.installed {
        return Err(ServiceError::Validation(format!(
            "Agent `{agent_id}` cannot continue in terminal: {}",
            support
                .unavailable_reason
                .unwrap_or_else(|| "agent executable is unavailable".to_string())
        )));
    }
    let mut args = parse_flag_args(&agent.interactive_flags)?;
    args.extend(build_run_config_args(&agent, run_config)?);
    Ok(AutomationAgentCommandSpec {
        agent_id: agent.id,
        label: agent.label,
        executable: terminal_executable_for_agent(&agent.cmd, support.executable_path.as_deref()),
        args,
        prompt_strategy: agent.prompt_strategy,
        stdout_parser: StdoutParser::Plain,
    })
}

pub fn validate_agent_run_config(
    agent_id: &str,
    run_config: Option<&AutomationAgentRunConfig>,
) -> Result<()> {
    resolve_automation_agent_with_config(agent_id, run_config).map(|_| ())
}

pub fn terminal_agent_options(agent_id: &str, refresh: bool) -> Result<TerminalAgentOptions> {
    let cache = TERMINAL_OPTIONS_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if !refresh {
        if let Some(cached) = cache
            .lock()
            .map_err(|_| {
                ServiceError::Processing("Terminal agent model cache is poisoned.".to_string())
            })?
            .get(agent_id)
            .cloned()
        {
            let ttl = if matches!(cached.options.status, TerminalAgentOptionsStatus::Ok) {
                TERMINAL_OPTIONS_TTL
            } else {
                TERMINAL_OPTIONS_ERROR_TTL
            };
            if cached.stored_at.elapsed() <= ttl {
                let mut catalog = cached.options.clone();
                catalog.source = TerminalAgentOptionsSource::Cache;
                return Ok(catalog);
            }
        }
    }

    let catalog = probe_terminal_agent_options(agent_id)?;
    cache
        .lock()
        .map_err(|_| {
            ServiceError::Processing("Terminal agent model cache is poisoned.".to_string())
        })?
        .insert(
            agent_id.to_string(),
            CachedTerminalAgentOptions {
                stored_at: Instant::now(),
                fetched_at: Utc::now(),
                options: catalog.clone(),
            },
        );
    Ok(catalog)
}

fn definition_launch_flags(definition: &TerminalAgentDefinition, yolo: bool) -> (String, String) {
    if yolo && (definition.yolo_params.is_some() || definition.yolo_interactive_params.is_some()) {
        let params = definition
            .yolo_params
            .clone()
            .unwrap_or_else(|| definition.params.clone());
        let interactive = definition
            .yolo_interactive_params
            .clone()
            .or_else(|| definition.interactive_params.clone())
            .unwrap_or_default();
        (params, interactive)
    } else {
        (
            definition.params.clone(),
            definition.interactive_params.clone().unwrap_or_default(),
        )
    }
}

/// Public view of built-in agent defaults for smart upgrade (see `builtin_agent_upgrade`).
#[derive(Debug, Clone)]
pub struct TerminalAgentDefinitionPublic {
    pub id: String,
    pub label: String,
    pub cmd: String,
    pub params: String,
    pub interactive_params: Option<String>,
    pub yolo_params: Option<String>,
    pub yolo_interactive_params: Option<String>,
}

impl From<TerminalAgentDefinition> for TerminalAgentDefinitionPublic {
    fn from(value: TerminalAgentDefinition) -> Self {
        Self {
            id: value.id,
            label: value.label,
            cmd: value.cmd,
            params: value.params,
            interactive_params: value.interactive_params,
            yolo_params: value.yolo_params,
            yolo_interactive_params: value.yolo_interactive_params,
        }
    }
}

pub fn load_builtin_terminal_agents_for_upgrade() -> Result<Vec<TerminalAgentDefinitionPublic>> {
    Ok(load_builtin_terminal_agents()?
        .into_iter()
        .map(TerminalAgentDefinitionPublic::from)
        .collect())
}

pub fn definition_launch_flags_for_upgrade(
    definition: &TerminalAgentDefinitionPublic,
    yolo: bool,
) -> (String, String) {
    // Mirror private `definition_launch_flags` for the public upgrade DTO.
    if yolo && (definition.yolo_params.is_some() || definition.yolo_interactive_params.is_some()) {
        let params = definition
            .yolo_params
            .clone()
            .unwrap_or_else(|| definition.params.clone());
        let interactive = definition
            .yolo_interactive_params
            .clone()
            .or_else(|| definition.interactive_params.clone())
            .unwrap_or_default();
        (params, interactive)
    } else {
        (
            definition.params.clone(),
            definition.interactive_params.clone().unwrap_or_default(),
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionAgentOption {
    pub id: String,
    pub label: String,
}

pub fn enabled_session_agents() -> Result<Vec<SessionAgentOption>> {
    Ok(enabled_session_agent_rows(
        resolved_terminal_agents()?
            .into_iter()
            .map(|agent| (agent.id, agent.label, agent.enabled)),
    ))
}

pub fn enabled_session_agent_rows(
    rows: impl IntoIterator<Item = (String, String, bool)>,
) -> Vec<SessionAgentOption> {
    let mut agents: Vec<SessionAgentOption> = rows
        .into_iter()
        .filter(|(_, _, enabled)| *enabled)
        .map(|(id, label, _)| SessionAgentOption { id, label })
        .collect();
    agents.sort_by(|left, right| {
        left.label
            .to_lowercase()
            .cmp(&right.label.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });
    agents
}

fn resolved_terminal_agents() -> Result<Vec<ResolvedTerminalAgent>> {
    let built_ins = load_builtin_terminal_agents()?;
    let settings = load_terminal_code_agent_file()?;
    Ok(resolve_terminal_agents_with_settings(built_ins, settings))
}

fn resolve_terminal_agents_with_settings(
    built_ins: Vec<TerminalAgentDefinition>,
    settings: TerminalCodeAgentFile,
) -> Vec<ResolvedTerminalAgent> {
    let mut resolved = Vec::with_capacity(built_ins.len() + settings.agents.len());
    // Automations run unattended, so launch flags always skip confirmation.
    let yolo = true;

    for definition in built_ins {
        let (default_params, default_interactive) = definition_launch_flags(&definition, yolo);
        let override_entry = settings
            .agents
            .iter()
            .find(|entry| entry.id == definition.id);
        let prompt_strategy = override_entry
            .and_then(|entry| entry.prompt_strategy)
            .or(definition.prompt_strategy)
            .unwrap_or_else(|| legacy_prompt_strategy(definition.use_echo));
        let stdout_parser = override_entry
            .and_then(|entry| entry.stdout_parser)
            .unwrap_or(definition.stdout_parser);
        let override_flags = override_entry.and_then(|entry| non_empty(&entry.flags));
        let flags = override_flags
            .clone()
            .unwrap_or_else(|| default_params.clone());
        let override_interactive_flags = override_entry
            .and_then(|entry| entry.interactive_flags.as_ref())
            .and_then(|flags| non_empty(flags));
        let interactive_flags =
            override_interactive_flags.unwrap_or_else(|| match override_flags {
                Some(value) if value.trim() != default_params.trim() => value,
                _ => {
                    if default_interactive.is_empty() {
                        default_params.clone()
                    } else {
                        default_interactive.clone()
                    }
                }
            });
        resolved.push(ResolvedTerminalAgent {
            id: definition.id,
            label: definition.label,
            cmd: override_entry
                .and_then(|entry| non_empty(&entry.cmd))
                .unwrap_or(definition.cmd),
            flags,
            interactive_flags,
            prompt_strategy,
            stdout_parser,
            model_support: definition.model_support,
            reasoning_support: definition.reasoning_support,
            model_list: definition.model_list,
            enabled: override_entry
                .and_then(|entry| entry.enabled)
                .unwrap_or(true),
        });
    }

    for entry in settings.agents {
        if resolved.iter().any(|agent| agent.id == entry.id) {
            continue;
        }
        let Some(label) = non_empty(&entry.label) else {
            continue;
        };
        let Some(cmd) = non_empty(&entry.cmd) else {
            continue;
        };
        resolved.push(ResolvedTerminalAgent {
            id: entry.id,
            label,
            cmd,
            flags: entry.flags.clone(),
            interactive_flags: entry
                .interactive_flags
                .clone()
                .and_then(|flags| non_empty(&flags))
                .unwrap_or_else(|| entry.flags.clone()),
            prompt_strategy: entry.prompt_strategy.unwrap_or(PromptStrategy::Arg),
            stdout_parser: entry.stdout_parser.unwrap_or_default(),
            model_support: AutomationAgentModelInputMode::None,
            reasoning_support: AutomationAgentReasoningSupport::default(),
            model_list: None,
            enabled: entry.enabled.unwrap_or(true),
        });
    }

    resolved
}

fn catalog_executable(agent: &ResolvedTerminalAgent) -> Option<std::path::PathBuf> {
    automation_support(agent).executable_path
}

fn missing_catalog_binary_options(agent: &ResolvedTerminalAgent) -> TerminalAgentOptions {
    let support = automation_support(agent);
    build_terminal_agent_options(
        &agent.id,
        TerminalAgentOptionsStatus::Error,
        Vec::new(),
        Some(
            support
                .unavailable_reason
                .unwrap_or_else(|| format!("{} is not installed or is not executable.", agent.cmd)),
        ),
        TerminalAgentOptionsSource::Live,
    )
}

fn probe_terminal_agent_options(agent_id: &str) -> Result<TerminalAgentOptions> {
    let Some(agent) = resolved_terminal_agents()?
        .into_iter()
        .find(|agent| agent.id == agent_id)
    else {
        return Ok(build_terminal_agent_options(
            agent_id,
            TerminalAgentOptionsStatus::Unsupported,
            Vec::new(),
            Some(format!("Agent `{agent_id}` is not configured.")),
            TerminalAgentOptionsSource::Live,
        ));
    };

    let Some(model_list) = agent.model_list.clone().filter(|spec| spec.supported) else {
        return Ok(build_terminal_agent_options(
            &agent.id,
            TerminalAgentOptionsStatus::Unsupported,
            Vec::new(),
            Some(format!(
                "Agent `{}` does not expose a live model list.",
                agent.id
            )),
            TerminalAgentOptionsSource::Live,
        ));
    };

    let Some(executable_path) = catalog_executable(&agent) else {
        return Ok(missing_catalog_binary_options(&agent));
    };

    let args = if model_list.command.len() > 1 {
        model_list.command[1..].to_vec()
    } else {
        Vec::new()
    };

    let output = match Command::new(&executable_path).args(&args).output() {
        Ok(output) => output,
        Err(error) => {
            return Ok(build_terminal_agent_options(
                &agent.id,
                TerminalAgentOptionsStatus::Error,
                Vec::new(),
                Some(format!("Failed to run model list command: {error}")),
                TerminalAgentOptionsSource::Live,
            ));
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{}\n{}", stdout, stderr).trim().to_string();

    if !output.status.success() {
        let status = if looks_like_auth_required(&combined) {
            TerminalAgentOptionsStatus::AuthRequired
        } else {
            TerminalAgentOptionsStatus::Error
        };
        let fallback = if matches!(status, TerminalAgentOptionsStatus::AuthRequired) {
            "Authentication is required before models can be listed.".to_string()
        } else {
            format!(
                "Model listing exited with status {}.",
                output
                    .status
                    .code()
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "unknown".to_string())
            )
        };
        return Ok(build_terminal_agent_options(
            &agent.id,
            status,
            Vec::new(),
            Some(non_empty(&combined).unwrap_or(fallback)),
            TerminalAgentOptionsSource::Live,
        ));
    }

    let models = match parse_terminal_agent_options_output(&stdout, model_list.parser) {
        Ok(models) if !models.is_empty() => models,
        Ok(_) => {
            return Ok(build_terminal_agent_options(
                &agent.id,
                TerminalAgentOptionsStatus::Error,
                Vec::new(),
                Some("Model list command returned no models.".to_string()),
                TerminalAgentOptionsSource::Live,
            ));
        }
        Err(error) => {
            return Ok(build_terminal_agent_options(
                &agent.id,
                TerminalAgentOptionsStatus::Error,
                Vec::new(),
                Some(error),
                TerminalAgentOptionsSource::Live,
            ));
        }
    };

    Ok(build_terminal_agent_options(
        &agent.id,
        TerminalAgentOptionsStatus::Ok,
        models,
        None,
        TerminalAgentOptionsSource::Live,
    ))
}

/// Command names the shell dynamic title uses to mean “an agent is in the foreground”.
/// Includes built-ins and any custom `cmd` in the user terminal-agent file.
pub fn terminal_agent_command_names() -> HashSet<String> {
    let mut names = HashSet::new();
    if let Ok(built_ins) = load_builtin_terminal_agents() {
        for agent in built_ins {
            insert_command_name(&mut names, &agent.cmd);
        }
    }
    if let Ok(file) = load_terminal_code_agent_file() {
        for entry in file.agents {
            if let Some(cmd) = non_empty(&entry.cmd) {
                insert_command_name(&mut names, &cmd);
            }
        }
    }
    names
}

fn insert_command_name(names: &mut HashSet<String>, cmd: &str) {
    let Some(token) = cmd.split_whitespace().next() else {
        return;
    };
    let base = token
        .trim_matches(|ch| ch == '"' || ch == '\'')
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if !base.is_empty() {
        names.insert(base);
    }
}

fn load_builtin_terminal_agents() -> Result<Vec<TerminalAgentDefinition>> {
    serde_json::from_str(terminal_agent_manifest::BUILTIN_TERMINAL_AGENTS_JSON).map_err(|error| {
        ServiceError::Validation(format!(
            "Failed to parse terminal agent definitions at {}: {error}",
            terminal_agent_manifest::BUILTIN_TERMINAL_AGENTS_PATH
        ))
    })
}

fn legacy_prompt_strategy(use_echo: bool) -> PromptStrategy {
    if use_echo {
        PromptStrategy::Stdin
    } else {
        PromptStrategy::Arg
    }
}

fn load_terminal_code_agent_file() -> Result<TerminalCodeAgentFile> {
    let path = terminal_code_agent_path();
    if !path.exists() {
        return Ok(TerminalCodeAgentFile { agents: Vec::new() });
    }
    let content = std::fs::read_to_string(&path).map_err(|error| {
        ServiceError::Validation(format!("Failed to read terminal_code_agent.json: {error}"))
    })?;
    serde_json::from_str(&content).map_err(|error| {
        ServiceError::Validation(format!("Failed to parse terminal_code_agent.json: {error}"))
    })
}

fn terminal_code_agent_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".atmos")
        .join("config")
        .join("agent")
        .join("terminal_code_agent.json")
}

fn non_empty(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn build_terminal_agent_options(
    agent_id: &str,
    status: TerminalAgentOptionsStatus,
    models: Vec<TerminalAgentOption>,
    message: Option<String>,
    source: TerminalAgentOptionsSource,
) -> TerminalAgentOptions {
    TerminalAgentOptions {
        agent_id: agent_id.to_string(),
        status,
        models,
        message,
        source,
    }
}

fn parse_terminal_agent_options_output(
    output: &str,
    parser: TerminalAgentModelListParser,
) -> std::result::Result<Vec<TerminalAgentOption>, String> {
    let models = match parser {
        TerminalAgentModelListParser::LineList => parse_line_terminal_agent_options(output),
        TerminalAgentModelListParser::GrokLineList => parse_grok_terminal_agent_options(output),
        TerminalAgentModelListParser::KiroJson | TerminalAgentModelListParser::Json => {
            parse_json_terminal_agent_options(output)?
        }
        TerminalAgentModelListParser::DroidHelp => parse_droid_help_terminal_agent_options(output),
    };
    Ok(dedupe_model_options(models))
}

fn option_from_agent_model(model: agent::AgentModel) -> TerminalAgentOption {
    TerminalAgentOption {
        id: model.id,
        label: model.label,
        group: model.group,
        is_default: model.is_default,
        thinking: model.thinking,
        fast: model.fast,
    }
}

fn parse_line_terminal_agent_options(output: &str) -> Vec<TerminalAgentOption> {
    agent::parse_line_list(output)
        .into_iter()
        .map(option_from_agent_model)
        .collect()
}

fn parse_droid_help_terminal_agent_options(output: &str) -> Vec<TerminalAgentOption> {
    agent::parse_droid_help(output)
        .into_iter()
        .map(option_from_agent_model)
        .collect()
}

/// Strip trailing ` (default)` from model catalog lines (e.g. Grok `* grok-4.5 (default)`).
fn strip_default_model_suffix(value: &str) -> (String, bool) {
    let trimmed = value.trim();
    let lower = trimmed.to_ascii_lowercase();
    if let Some(prefix) = lower.strip_suffix(" (default)") {
        let end = prefix.len();
        return (trimmed[..end].trim_end().to_string(), true);
    }
    (trimmed.to_string(), false)
}

fn parse_grok_terminal_agent_options(output: &str) -> Vec<TerminalAgentOption> {
    output
        .lines()
        .skip_while(|line| !line.trim().eq_ignore_ascii_case("available models:"))
        .skip(1)
        .filter_map(|line| {
            let trimmed = line.trim();
            if !trimmed.starts_with(['-', '*', '•']) {
                return None;
            }
            let normalized = trimmed.trim_start_matches(['-', '*', '•', ' ']).trim();
            let (id, is_default) = strip_default_model_suffix(normalized);
            (!id.is_empty()).then_some(TerminalAgentOption {
                label: id.clone(),
                id,
                group: None,
                is_default,
                thinking: None,
                fast: false,
            })
        })
        .collect()
}

fn parse_json_terminal_agent_options(
    output: &str,
) -> std::result::Result<Vec<TerminalAgentOption>, String> {
    let value: Value = serde_json::from_str(output)
        .map_err(|error| format!("Failed to parse model catalog JSON: {error}"))?;
    Ok(parse_json_terminal_agent_options_value(&value))
}

fn parse_json_terminal_agent_options_value(value: &Value) -> Vec<TerminalAgentOption> {
    match value {
        Value::Array(items) => items.iter().filter_map(model_option_from_json).collect(),
        Value::Object(map) => ["models", "items", "data"]
            .iter()
            .find_map(|key| map.get(*key))
            .map(parse_json_terminal_agent_options_value)
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn model_option_from_json(value: &Value) -> Option<TerminalAgentOption> {
    match value {
        Value::String(model) => non_empty(model).map(|id| TerminalAgentOption {
            label: id.clone(),
            id,
            group: None,
            is_default: false,
            thinking: None,
            fast: false,
        }),
        Value::Object(map) => {
            let id = ["id", "name", "model", "value"]
                .iter()
                .find_map(|key| map.get(*key)?.as_str())
                .and_then(non_empty)?;
            let label = ["display_name", "label", "name", "id", "model"]
                .iter()
                .find_map(|key| map.get(*key)?.as_str())
                .and_then(non_empty)
                .unwrap_or_else(|| id.clone());
            let group = ["group", "provider"]
                .iter()
                .find_map(|key| map.get(*key)?.as_str())
                .and_then(non_empty);
            let is_default = ["is_default", "default"]
                .iter()
                .find_map(|key| map.get(*key)?.as_bool())
                .unwrap_or(false);
            Some(TerminalAgentOption {
                id,
                label,
                group,
                is_default,
                thinking: None,
                fast: false,
            })
        }
        _ => None,
    }
}

fn dedupe_model_options(models: Vec<TerminalAgentOption>) -> Vec<TerminalAgentOption> {
    let mut deduped: Vec<TerminalAgentOption> = Vec::with_capacity(models.len());
    for model in models {
        if !deduped.iter().any(|existing| existing.id == model.id) {
            deduped.push(model);
        }
    }
    deduped
}

fn looks_like_auth_required(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    [
        "auth",
        "login",
        "sign in",
        "sign-in",
        "unauthorized",
        "forbidden",
        "api key",
    ]
    .iter()
    .any(|pattern| lower.contains(pattern))
}

struct AutomationSupport {
    installed: bool,
    supported: bool,
    executable_path: Option<PathBuf>,
    unavailable_reason: Option<String>,
}

fn automation_support(agent: &ResolvedTerminalAgent) -> AutomationSupport {
    if !agent.enabled {
        return AutomationSupport {
            installed: false,
            supported: false,
            executable_path: None,
            unavailable_reason: Some(
                "This agent is disabled in terminal agent settings.".to_string(),
            ),
        };
    }

    if agent.cmd.trim().is_empty() {
        return AutomationSupport {
            installed: false,
            supported: false,
            executable_path: None,
            unavailable_reason: Some("No command is configured for this agent.".to_string()),
        };
    }

    if agent.flags.trim().is_empty() {
        let executable_path = resolve_executable_path(&agent.cmd);
        return AutomationSupport {
            installed: executable_path.is_some(),
            supported: false,
            executable_path,
            unavailable_reason: Some(
                "No non-interactive automation flags are configured for this agent.".to_string(),
            ),
        };
    }

    let executable_path = resolve_executable_path(&agent.cmd);
    let installed = executable_path.is_some();
    if let Err(error) = parse_flag_args(&agent.flags) {
        return AutomationSupport {
            installed,
            supported: false,
            executable_path,
            unavailable_reason: Some(format!("Automation flags are not parseable: {error}")),
        };
    }

    AutomationSupport {
        installed,
        supported: installed,
        executable_path,
        unavailable_reason: (!installed).then(|| {
            format!(
                "{} is not installed or is not executable on PATH or a supported user bin directory.",
                agent.cmd
            )
        }),
    }
}

fn resolve_executable_path(executable: &str) -> Option<PathBuf> {
    let executable = executable.trim();
    if executable.is_empty() {
        return None;
    }
    if executable.contains(std::path::MAIN_SEPARATOR) {
        return expand_home_path(executable).filter(|path| is_executable(path));
    }
    resolve_executable_path_with_search_paths(executable, executable_search_paths())
}

fn terminal_executable_for_agent(cmd: &str, resolved_path: Option<&Path>) -> String {
    let cmd = cmd.trim();
    if cmd.contains(std::path::MAIN_SEPARATOR) || cmd == "~" || cmd.starts_with("~/") {
        return resolved_path
            .unwrap_or_else(|| Path::new(cmd))
            .to_string_lossy()
            .to_string();
    }
    cmd.to_string()
}

fn resolve_executable_path_with_search_paths(
    executable: &str,
    search_paths: impl IntoIterator<Item = PathBuf>,
) -> Option<PathBuf> {
    search_paths
        .into_iter()
        .map(|path| path.join(executable))
        .find(|path| is_executable(path))
}

fn executable_search_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(path_env) = env::var_os("PATH") {
        paths.extend(env::split_paths(&path_env));
    }
    paths.extend(common_user_bin_paths());
    dedupe_paths(paths)
}

fn common_user_bin_paths() -> Vec<PathBuf> {
    let mut paths = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/opt/homebrew/sbin"),
        PathBuf::from("/usr/local/bin"),
    ];
    if let Some(home) = dirs::home_dir() {
        paths.extend(user_bin_paths_for_home(&home));
    }
    paths
}

fn user_bin_paths_for_home(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join(".local").join("bin"),
        home.join(".npm-global").join("bin"),
        home.join(".bun").join("bin"),
        home.join(".cargo").join("bin"),
        home.join(".deno").join("bin"),
        home.join(".yarn").join("bin"),
        home.join(".local").join("share").join("pnpm"),
        home.join("Library").join("pnpm"),
        home.join(".atmos").join("bin"),
        home.join(".grok").join("bin"),
    ]
}

fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut deduped = Vec::with_capacity(paths.len());
    for path in paths {
        if !deduped.iter().any(|existing| existing == &path) {
            deduped.push(path);
        }
    }
    deduped
}

fn expand_home_path(value: &str) -> Option<PathBuf> {
    if value == "~" {
        return dirs::home_dir();
    }
    if let Some(rest) = value.strip_prefix("~/") {
        return dirs::home_dir().map(|home| home.join(rest));
    }
    Some(PathBuf::from(value))
}

fn is_executable(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        path.metadata()
            .map(|metadata| metadata.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }

    #[cfg(not(unix))]
    {
        true
    }
}

fn merge_automation_args(
    flags: &str,
    prompt_strategy: PromptStrategy,
    run_config_args: Vec<String>,
) -> Result<Vec<String>> {
    let mut args = parse_flag_args(flags)?;
    let prompt_flag = if prompt_strategy == PromptStrategy::PromptFlag {
        Some(args.pop().ok_or_else(|| {
            ServiceError::Validation(
                "Prompt-flag agent is missing its trailing prompt flag.".to_string(),
            )
        })?)
    } else {
        None
    };
    args.extend(run_config_args);
    if let Some(prompt_flag) = prompt_flag {
        args.push(prompt_flag);
    }
    Ok(args)
}

/// Run config shared by attention-summary validation and the agent-cli launch.
/// A model equal to `agent_id` is a placeholder and is not passed through.
/// Returns `None` when model, effort, and extra args are all empty.
pub(crate) fn agent_cli_run_config(
    agent_id: &str,
    model: Option<&str>,
    effort: Option<&str>,
    extra_args: &[String],
) -> Option<AutomationAgentRunConfig> {
    let agent = agent_id.trim();
    let model = model
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != agent)
        .map(str::to_string);
    let effort = effort
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let extra_args: Vec<String> = extra_args
        .iter()
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .map(str::to_string)
        .collect();
    if model.is_none() && effort.is_none() && extra_args.is_empty() {
        return None;
    }
    Some(AutomationAgentRunConfig {
        model,
        reasoning: effort.map(|value| AutomationAgentReasoningSelection {
            mode: AutomationAgentReasoningMode::Enum,
            value,
        }),
        extra_args,
        fast: None,
    })
}

/// Model, effort, and extra-arg argv for a shipped terminal agent.
/// Uses the builtin manifest, does not read the user's agent file, does not
/// check that the binary is installed, and does not spawn a CLI.
#[cfg(test)]
pub(crate) fn terminal_agent_run_config_args(
    agent_id: &str,
    run_config: Option<&AutomationAgentRunConfig>,
) -> Result<Vec<String>> {
    let agent = resolve_terminal_agents_with_settings(
        load_builtin_terminal_agents()?,
        TerminalCodeAgentFile { agents: Vec::new() },
    )
    .into_iter()
    .find(|agent| agent.id == agent_id)
    .ok_or_else(|| ServiceError::Validation(format!("Agent `{agent_id}` is not configured.")))?;
    build_run_config_args(&agent, run_config)
}

fn build_run_config_args(
    agent: &ResolvedTerminalAgent,
    run_config: Option<&AutomationAgentRunConfig>,
) -> Result<Vec<String>> {
    let probed = cached_model_effort(agent, run_config);
    build_run_config_args_with_model_effort(agent, run_config, probed.as_deref())
}

/// Effort list from a catalog row that was already probed. Does not spawn a CLI.
/// `Some([])` means the row is known and carries no effort list.
fn cached_model_effort(
    agent: &ResolvedTerminalAgent,
    run_config: Option<&AutomationAgentRunConfig>,
) -> Option<Vec<String>> {
    let model = run_config?
        .model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let direct = match memory_model_effort(&agent.id, model) {
        MemoryEffort::Row(list) => Some(list),
        MemoryEffort::KnownCatalogMissingRow => None,
        MemoryEffort::Miss => disk_model_effort(&agent.id, model),
    };
    if agent.id == "grok-build" && direct.as_ref().is_none_or(|list| list.is_empty()) {
        if let Some(native) = native_grok_effort_for_model(model) {
            return Some(native);
        }
    }
    direct
}

/// Last native `grok` ladder for this model id, including `*-build-fast` siblings.
/// Used when the Terminal `grok-build` row has not been joined yet.
fn native_grok_effort_for_model(model: &str) -> Option<Vec<String>> {
    let path = agent::options_cache_dir(&crate::default_agent_data_dir()).join("grok.json");
    let text = std::fs::read_to_string(path).ok()?;
    let native: agent::AgentOptionsSnapshot = serde_json::from_str(&text).ok()?;
    if native.status != agent::OptionsStatus::Ok || native.agent_id != "grok" {
        return None;
    }
    let mut row = agent::AgentModel {
        id: model.to_string(),
        label: model.to_string(),
        ..agent::AgentModel::default()
    };
    agent::fill_grok_thinking_from_native(std::slice::from_mut(&mut row), &native.models);
    let list = effort_list_from_model_thinking(row.thinking.as_ref());
    (!list.is_empty()).then_some(list)
}

enum MemoryEffort {
    Miss,
    /// A fresh ok catalog is loaded and does not list this model.
    KnownCatalogMissingRow,
    Row(Vec<String>),
}

fn memory_model_effort(agent_id: &str, model: &str) -> MemoryEffort {
    let Some(cache) = TERMINAL_OPTIONS_CACHE.get() else {
        return MemoryEffort::Miss;
    };
    let Ok(guard) = cache.lock() else {
        return MemoryEffort::Miss;
    };
    let Some(cached) = guard.get(agent_id) else {
        return MemoryEffort::Miss;
    };
    if !catalog_fetched_fresh(cached.fetched_at)
        || !matches!(cached.options.status, TerminalAgentOptionsStatus::Ok)
    {
        return MemoryEffort::Miss;
    }
    let Some(row) = cached.options.models.iter().find(|item| item.id == model) else {
        return MemoryEffort::KnownCatalogMissingRow;
    };
    MemoryEffort::Row(effort_list_from_model_thinking(row.thinking.as_ref()))
}

fn disk_model_effort(agent_id: &str, model: &str) -> Option<Vec<String>> {
    let path =
        agent::options_cache_dir(&crate::default_agent_data_dir()).join(format!("{agent_id}.json"));
    model_effort_from_catalog_file(&path, model)
}

fn model_effort_from_catalog_file(path: &Path, model: &str) -> Option<Vec<String>> {
    let text = std::fs::read_to_string(path).ok()?;
    let catalog: agent::AgentOptionsSnapshot = serde_json::from_str(&text).ok()?;
    model_effort_from_snapshot(&catalog, model)
}

fn model_effort_from_snapshot(
    catalog: &agent::AgentOptionsSnapshot,
    model: &str,
) -> Option<Vec<String>> {
    if catalog.status != agent::OptionsStatus::Ok || !catalog_fetched_fresh(catalog.fetched_at) {
        return None;
    }
    let row = catalog.models.iter().find(|item| item.id == model)?;
    Some(effort_list_from_model_thinking(row.thinking.as_ref()))
}

fn catalog_fetched_fresh(fetched_at: DateTime<Utc>) -> bool {
    Utc::now()
        .signed_duration_since(fetched_at)
        .to_std()
        .is_ok_and(|age| age <= agent::OK_CACHE_TTL)
}

fn effort_list_from_model_thinking(thinking: Option<&agent::AgentThinkingSupport>) -> Vec<String> {
    match thinking {
        Some(agent::AgentThinkingSupport::Enum { options, .. }) => options
            .iter()
            .map(|item| item.trim())
            .filter(|item| !item.is_empty())
            .map(ToOwned::to_owned)
            .collect(),
        _ => Vec::new(),
    }
}

/// `probed_effort` is the selected model row's effort list.
/// `None` means the catalog was not consulted. `Some([])` means the row has no list.
fn build_run_config_args_with_model_effort(
    agent: &ResolvedTerminalAgent,
    run_config: Option<&AutomationAgentRunConfig>,
    probed_effort: Option<&[String]>,
) -> Result<Vec<String>> {
    let Some(run_config) = run_config else {
        return Ok(Vec::new());
    };
    let mut args = Vec::new();
    let model = run_config
        .model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let effort = accepted_effort_value(agent, run_config, probed_effort)?;

    let extra_args = run_config
        .extra_args
        .iter()
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();

    let reserved_flags = reserved_flags_for_agent(agent)?;
    if let Some(conflict) = extra_args
        .iter()
        .find(|item| reserved_flags.iter().any(|reserved| reserved == *item))
    {
        return Err(ServiceError::Validation(format!(
            "Extra args cannot override reserved Atmos flags such as {conflict} for agent `{}`.",
            agent.id
        )));
    }

    if let Some(model_flag) = model_flag_for_agent(&agent.id) {
        if model.is_some() && extra_args.iter().any(|item| item == model_flag) {
            return Err(ServiceError::Validation(format!(
                "Extra args already include {model_flag} for agent `{}`.",
                agent.id
            )));
        }
    }

    if let Some(reasoning_flag) = effort_flag_token(agent) {
        if effort.is_some() && extra_args.iter().any(|item| item == reasoning_flag) {
            return Err(ServiceError::Validation(format!(
                "Extra args already include {reasoning_flag} for agent `{}`.",
                agent.id
            )));
        }
    }

    let mut model = match (model, effort.as_deref(), agent.reasoning_support.mode) {
        (Some(model), Some(effort), AutomationAgentReasoningMode::EncodedInModel) => {
            Some(encode_effort_in_model_id(&model, effort))
        }
        (None, Some(_), AutomationAgentReasoningMode::EncodedInModel) => {
            return Err(ServiceError::Validation(format!(
                "Agent `{}` encodes effort in the model id, but no model was selected.",
                agent.id
            )));
        }
        (model, _, _) => model,
    };
    if run_config.fast == Some(true) {
        if let Some(id) = model.as_mut() {
            apply_model_id_fast(&agent.id, id);
        }
    }

    if let Some(model) = model {
        match model_flag_for_agent(&agent.id) {
            Some(flag) => {
                args.push(flag.to_string());
                args.push(model);
            }
            None => {
                return Err(ServiceError::Validation(format!(
                    "Agent `{}` does not support structured model selection.",
                    agent.id
                )));
            }
        }
    }

    if let Some(effort) = effort.as_deref() {
        if agent.reasoning_support.mode != AutomationAgentReasoningMode::EncodedInModel {
            push_effort_args(agent, effort, &mut args)?;
        }
    }
    if let Some(variant) = opencode_variant_value(agent, run_config, probed_effort) {
        if extra_args.iter().any(|item| item == "--variant") {
            return Err(ServiceError::Validation(format!(
                "Extra args already include --variant for agent `{}`.",
                agent.id
            )));
        }
        args.push("--variant".to_string());
        args.push(variant);
    }
    if agent.id == "amp" && run_config.fast == Some(true) {
        if extra_args.iter().any(|item| item == "--fast") {
            return Err(ServiceError::Validation(format!(
                "Extra args already include --fast for agent `{}`.",
                agent.id
            )));
        }
        args.push("--fast".to_string());
    }

    args.extend(extra_args);
    Ok(args)
}

fn accepted_effort_value(
    agent: &ResolvedTerminalAgent,
    run_config: &AutomationAgentRunConfig,
    probed_effort: Option<&[String]>,
) -> Result<Option<String>> {
    if agent.reasoning_support.mode == AutomationAgentReasoningMode::None {
        return Ok(None);
    }
    let Some(value) = run_config
        .reasoning
        .as_ref()
        .map(|reasoning| reasoning.value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };
    let winning = winning_effort_options(agent, probed_effort, run_config.model.as_deref());
    if agent.reasoning_support.mode == AutomationAgentReasoningMode::EncodedInModel
        && winning.is_empty()
    {
        return Ok(None);
    }
    if !winning.is_empty() && !winning.iter().any(|item| item == &value) {
        return Err(ServiceError::Validation(format!(
            "Agent `{}` does not accept effort `{value}`.",
            agent.id
        )));
    }
    if winning.is_empty() && agent.reasoning_support.mode == AutomationAgentReasoningMode::Enum {
        return Err(ServiceError::Validation(format!(
            "Agent `{}` does not accept effort `{value}`.",
            agent.id
        )));
    }
    Ok(Some(value))
}

fn winning_effort_options(
    agent: &ResolvedTerminalAgent,
    probed_effort: Option<&[String]>,
    model_id: Option<&str>,
) -> Vec<String> {
    let ignore_probe = !trusts_probed_effort(&agent.id);
    if !ignore_probe {
        if let Some(list) = probed_effort {
            if !list.is_empty() {
                let filtered = filter_confirmed_effort(&agent.id, list);
                if !filtered.is_empty() {
                    return filtered;
                }
                if agent.reasoning_support.mode == AutomationAgentReasoningMode::EncodedInModel {
                    return Vec::new();
                }
            } else if agent.reasoning_support.mode == AutomationAgentReasoningMode::EncodedInModel {
                return Vec::new();
            }
        }
    } else if agent.reasoning_support.mode == AutomationAgentReasoningMode::EncodedInModel
        && probed_effort.is_some_and(|list| list.is_empty())
    {
        return Vec::new();
    }
    if agent.id == "grok-build" {
        return model_id
            .and_then(grok_build_line_list_effort)
            .unwrap_or_default();
    }
    agent.reasoning_support.options.clone()
}

/// Native `grok` ladders for `grok models` rows, which carry no thinking.
/// `grok-4.7-build-fast` uses the `grok-4.7` ladder. Unknown ids get nothing,
/// not the manifest enum.
pub(crate) fn grok_build_line_list_effort(model_id: &str) -> Option<Vec<String>> {
    let trimmed = model_id.trim();
    let base = trimmed
        .strip_suffix("-build-fast")
        .filter(|base| !base.is_empty())
        .unwrap_or(trimmed);
    let levels: &[&str] = match base {
        "grok-4.5" => &["low", "medium", "high"],
        "grok-4.6" | "grok-4.7" => &["low", "medium", "high", "xhigh"],
        _ => return None,
    };
    Some(levels.iter().map(|level| (*level).to_string()).collect())
}

pub(crate) fn fill_grok_build_line_list_effort(models: &mut [agent::AgentModel]) {
    for model in models {
        if effort_list_from_model_thinking(model.thinking.as_ref())
            .iter()
            .any(|item| !item.is_empty())
        {
            continue;
        }
        let Some(options) = grok_build_line_list_effort(&model.id) else {
            continue;
        };
        model.thinking = Some(agent::AgentThinkingSupport::Enum {
            arg: Some("--reasoning-effort".into()),
            options,
        });
    }
}

fn trusts_probed_effort(agent_id: &str) -> bool {
    matches!(
        agent_id,
        "claude" | "codex" | "opencode" | "pi" | "droid" | "cursor" | "grok-build"
    )
}

/// Effort words a trusted CLI probe may return. Same set as the web filter.
fn is_cli_effort_token(token: &str) -> bool {
    matches!(
        token,
        "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "thinking"
    )
}

fn filter_confirmed_effort(agent_id: &str, probed: &[String]) -> Vec<String> {
    if !trusts_probed_effort(agent_id) {
        return Vec::new();
    }
    let mut seen = HashSet::new();
    let mut kept = Vec::new();
    for raw in probed {
        let token = raw.trim().to_ascii_lowercase();
        if token.is_empty() || !seen.insert(token.clone()) {
            continue;
        }
        if is_cli_effort_token(&token) {
            kept.push(token);
        }
    }
    kept
}

fn opencode_variant_value(
    agent: &ResolvedTerminalAgent,
    run_config: &AutomationAgentRunConfig,
    probed_effort: Option<&[String]>,
) -> Option<String> {
    if agent.id != "opencode" {
        return None;
    }
    let value = run_config
        .reasoning
        .as_ref()
        .map(|reasoning| reasoning.value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())?;
    let levels = filter_confirmed_effort("opencode", probed_effort.unwrap_or(&[]));
    levels.into_iter().find(|item| item == &value)
}

fn apply_model_id_fast(agent_id: &str, model: &mut String) {
    match agent_id {
        "droid" if !model.ends_with("-fast") => *model = format!("{model}-fast"),
        "grok-build" if !model.ends_with("-build-fast") => {
            *model = format!("{model}-build-fast");
        }
        "cursor" => *model = set_bracket_param(model, "fast", "true"),
        _ => {}
    }
}

fn set_bracket_param(model: &str, key: &str, value: &str) -> String {
    let model = model.trim();
    if let Some(open) = model.rfind('[') {
        if model.ends_with(']') && open + 1 < model.len() {
            let base = &model[..open];
            let inner = &model[open + 1..model.len() - 1];
            let mut parts = Vec::new();
            let mut found = false;
            for part in inner.split(',') {
                let part = part.trim();
                if part.is_empty() {
                    continue;
                }
                if part
                    .split_once('=')
                    .is_some_and(|(item, _)| item.trim() == key)
                {
                    parts.push(format!("{key}={value}"));
                    found = true;
                } else {
                    parts.push(part.to_string());
                }
            }
            if !found {
                parts.push(format!("{key}={value}"));
            }
            return format!("{base}[{}]", parts.join(","));
        }
    }
    format!("{model}[{key}={value}]")
}

fn push_effort_args(
    agent: &ResolvedTerminalAgent,
    effort: &str,
    args: &mut Vec<String>,
) -> Result<()> {
    let arg = agent
        .reasoning_support
        .arg
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            ServiceError::Validation(format!(
                "Agent `{}` is missing a structured reasoning flag definition.",
                agent.id
            ))
        })?;
    match agent.reasoning_support.value_style {
        AutomationAgentReasoningValueStyle::FlagOnly => {
            args.push(arg.to_string());
        }
        AutomationAgentReasoningValueStyle::Config => {
            if effort.contains('"') || effort.contains('\n') {
                return Err(ServiceError::Validation(format!(
                    "Agent `{}` does not accept effort `{effort}`.",
                    agent.id
                )));
            }
            args.push("-c".to_string());
            args.push(format!("{arg}=\"{effort}\""));
        }
        AutomationAgentReasoningValueStyle::Value => {
            args.push(arg.to_string());
            args.push(effort.to_string());
        }
    }
    Ok(())
}

fn effort_flag_token(agent: &ResolvedTerminalAgent) -> Option<&str> {
    match agent.reasoning_support.value_style {
        AutomationAgentReasoningValueStyle::Config => Some("-c"),
        _ => reasoning_arg_for_agent(agent).filter(|flag| flag.starts_with('-')),
    }
}

fn encode_effort_in_model_id(model: &str, effort: &str) -> String {
    let model = model.trim();
    if let Some(open) = model.rfind('[') {
        if model.ends_with(']') && open + 1 < model.len() {
            let base = &model[..open];
            let inner = &model[open + 1..model.len() - 1];
            let mut parts = Vec::new();
            let mut found = false;
            for part in inner.split(',') {
                let part = part.trim();
                if part.is_empty() {
                    continue;
                }
                if part
                    .split_once('=')
                    .is_some_and(|(key, _)| key.trim() == "effort")
                {
                    parts.push(format!("effort={effort}"));
                    found = true;
                } else {
                    parts.push(part.to_string());
                }
            }
            if !found {
                parts.push(format!("effort={effort}"));
            }
            return format!("{base}[{}]", parts.join(","));
        }
    }
    format!("{model}[effort={effort}]")
}

fn model_flag_for_agent(agent_id: &str) -> Option<&'static str> {
    match agent_id {
        "claude" | "codex" | "gemini" | "antigravity" | "devin" | "droid" | "cursor"
        | "kilocode" | "kiro" | "commandcode" | "pi" | "opencode" | "kimi" | "grok-build" => {
            Some("--model")
        }
        _ => None,
    }
}

fn reasoning_arg_for_agent(agent: &ResolvedTerminalAgent) -> Option<&str> {
    match agent.reasoning_support.mode {
        AutomationAgentReasoningMode::Enum | AutomationAgentReasoningMode::Manual => agent
            .reasoning_support
            .arg
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty()),
        AutomationAgentReasoningMode::None | AutomationAgentReasoningMode::EncodedInModel => None,
    }
}

fn reserved_flags_for_agent(agent: &ResolvedTerminalAgent) -> Result<Vec<String>> {
    let mut reserved = Vec::new();
    for flags in [&agent.flags, &agent.interactive_flags] {
        for token in parse_flag_args(flags)?
            .into_iter()
            .filter(|token| token.starts_with('-'))
        {
            if !reserved.iter().any(|existing| existing == &token) {
                reserved.push(token);
            }
        }
    }
    Ok(reserved)
}

fn parse_flag_args(flags: &str) -> Result<Vec<String>> {
    split_shell_words(flags).map_err(ServiceError::Validation)
}

fn split_shell_words(value: &str) -> std::result::Result<Vec<String>, String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut escaped = false;
    let mut has_token = false;

    for ch in value.chars() {
        if escaped {
            current.push(ch);
            escaped = false;
            has_token = true;
            continue;
        }

        match quote {
            Some('\'') => {
                if ch == '\'' {
                    quote = None;
                } else {
                    current.push(ch);
                }
                has_token = true;
            }
            Some('"') => {
                if ch == '"' {
                    quote = None;
                } else if ch == '\\' {
                    escaped = true;
                } else {
                    current.push(ch);
                }
                has_token = true;
            }
            Some(_) => unreachable!("only single and double quotes are supported"),
            None => {
                if ch.is_whitespace() {
                    if has_token {
                        args.push(std::mem::take(&mut current));
                        has_token = false;
                    }
                } else if ch == '\'' || ch == '"' {
                    quote = Some(ch);
                    has_token = true;
                } else if ch == '\\' {
                    escaped = true;
                    has_token = true;
                } else {
                    current.push(ch);
                    has_token = true;
                }
            }
        }
    }

    if escaped {
        current.push('\\');
    }

    if let Some(quote) = quote {
        return Err(format!("Unterminated {quote} quote in automation flags."));
    }

    if has_token {
        args.push(current);
    }

    Ok(args)
}

#[cfg(test)]
fn terminal_agent_invocation(agent: &AutomationAgentCommandSpec, prompt_path: &Path) -> String {
    let mut parts = Vec::with_capacity(agent.args.len() + 3);
    parts.push(shell_quote_str(agent.executable.trim()));
    parts.extend(agent.args.iter().map(|arg| shell_quote_str(arg)));

    match agent.prompt_strategy {
        PromptStrategy::Arg | PromptStrategy::PromptFlag => {
            parts.push(format!("\"$(cat {})\"", shell_quote(prompt_path)));
            parts.join(" ")
        }
        PromptStrategy::Stdin => {
            format!("cat {} | {}", shell_quote(prompt_path), parts.join(" "))
        }
        PromptStrategy::FileFlag => {
            parts.push(shell_quote(prompt_path));
            parts.join(" ")
        }
    }
}

fn terminal_agent_launch_command(agent: &AutomationAgentCommandSpec) -> String {
    let mut parts = Vec::with_capacity(agent.args.len() + 1);
    parts.push(shell_quote_str(agent.executable.trim()));
    parts.extend(agent.args.iter().map(|arg| shell_quote_str(arg)));
    parts.join(" ")
}

#[cfg(test)]
fn shell_quote(path: &Path) -> String {
    shell_quote_str(&path.to_string_lossy())
}

fn shell_quote_str(raw: &str) -> String {
    format!("'{}'", raw.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn command_input() -> AutomationCommandInput {
        AutomationCommandInput {
            prompt_path: PathBuf::from("/tmp/atmos automation/prompt.xml"),
        }
    }

    #[test]
    fn s11_process_invocation_keeps_argv_structured() {
        let invocation = codex_spec().build_invocation(command_input());

        assert_eq!(invocation.executable, "codex");
        assert_eq!(
            invocation.args,
            vec![
                "exec".to_string(),
                "--json".to_string(),
                "--dangerously-bypass-approvals-and-sandbox".to_string()
            ]
        );
        assert_eq!(invocation.prompt_delivery, PromptDelivery::Arg);
        assert_eq!(invocation.stdout_parser, StdoutParser::CodexJsonl);
        assert_eq!(
            invocation.prompt_path,
            PathBuf::from("/tmp/atmos automation/prompt.xml")
        );
    }

    #[test]
    fn terminal_agent_cli_status_lists_every_built_in_agent() {
        let built_ins = load_builtin_terminal_agents().unwrap();
        let status = terminal_agent_cli_status().unwrap();

        assert_eq!(status.len(), built_ins.len());
        for definition in built_ins {
            let entry = status
                .iter()
                .find(|item| item.agent_id == definition.id)
                .expect("status entry for built-in agent");
            assert_eq!(entry.label, definition.label);
            assert_eq!(entry.cmd, definition.cmd);
        }
    }

    #[test]
    fn s5_built_in_agents_load_from_shared_definition_file() {
        let agents = load_builtin_terminal_agents().unwrap();

        assert!(agents.iter().any(|agent| agent.id == "codex"
            && agent.cmd == "codex"
            && agent.params == "exec --json"
            && agent.yolo_params.as_deref()
                == Some("exec --json --dangerously-bypass-approvals-and-sandbox")
            && agent.prompt_strategy == Some(PromptStrategy::Arg)
            && agent.stdout_parser == StdoutParser::CodexJsonl));
        assert!(agents.iter().any(|agent| agent.id == "cursor"
            && agent.cmd == "cursor-agent"
            && agent.interactive_params.as_deref() == Some("--trust")
            && agent
                .yolo_params
                .as_deref()
                .is_some_and(|p| p.contains("--force --print"))
            && agent.yolo_interactive_params.as_deref() == Some("--yolo --trust")));
        assert!(agents.iter().any(|agent| agent.id == "gemini"
            && agent.interactive_params.as_deref() == Some("--skip-trust")
            && agent.yolo_interactive_params.as_deref() == Some("--yolo --skip-trust")));
        assert!(agents.iter().any(|agent| agent.id == "commandcode"
            && agent.interactive_params.as_deref() == Some("--trust --skip-onboarding")));
        assert!(agents
            .iter()
            .any(|agent| agent.id == "pi"
                && agent.interactive_params.as_deref() == Some("--approve")));
        assert!(agents.iter().any(|agent| {
            agent.id == "antigravity"
                && agent.cmd == "agy"
                && agent.params == "--output-format stream-json -p"
                && agent.yolo_params.as_deref()
                    == Some("--dangerously-skip-permissions --output-format stream-json -p")
                && agent.yolo_interactive_params.as_deref()
                    == Some("--dangerously-skip-permissions")
                && agent.prompt_strategy == Some(PromptStrategy::PromptFlag)
                && agent.stdout_parser == StdoutParser::CursorStreamJson
                && agent.model_support == AutomationAgentModelInputMode::Catalog
                && agent
                    .model_list
                    .as_ref()
                    .is_some_and(|m| m.supported && m.command == vec!["agy", "models"])
        }));
        assert!(agents.iter().any(|agent| {
            agent.id == "grok-build"
                && agent.cmd == "grok"
                && agent.params == "--output-format streaming-json -p"
                && agent.yolo_params.as_deref()
                    == Some("--always-approve --output-format streaming-json -p")
                && agent.yolo_interactive_params.as_deref() == Some("--always-approve")
                && agent.prompt_strategy == Some(PromptStrategy::PromptFlag)
                && agent.stdout_parser == StdoutParser::GrokStreamingJson
                && agent.model_support == AutomationAgentModelInputMode::Catalog
                && agent
                    .model_list
                    .as_ref()
                    .is_some_and(|m| m.supported && m.command == vec!["grok", "models"])
        }));
    }

    #[test]
    fn s5_terminal_agent_settings_override_built_ins_and_add_custom_agents() {
        let agents = resolve_terminal_agents_with_settings(
            vec![TerminalAgentDefinition {
                id: "codex".to_string(),
                label: "Codex".to_string(),
                cmd: "codex".to_string(),
                params: "--dangerously-bypass-approvals-and-sandbox".to_string(),
                interactive_params: Some("--dangerously-bypass-approvals-and-sandbox".to_string()),
                yolo_params: None,
                yolo_interactive_params: None,
                prompt_strategy: Some(PromptStrategy::Arg),
                stdout_parser: StdoutParser::CodexJsonl,
                use_echo: false,
                model_support: AutomationAgentModelInputMode::Manual,
                reasoning_support: AutomationAgentReasoningSupport::default(),
                model_list: None,
            }],
            TerminalCodeAgentFile {
                agents: vec![
                    TerminalCodeAgentEntry {
                        id: "codex".to_string(),
                        label: "Codex".to_string(),
                        cmd: "custom-codex".to_string(),
                        flags: "--yolo".to_string(),
                        interactive_flags: None,
                        prompt_strategy: None,
                        stdout_parser: None,
                        enabled: Some(false),
                    },
                    TerminalCodeAgentEntry {
                        id: "custom-agent".to_string(),
                        label: "Custom Agent".to_string(),
                        cmd: "custom-agent".to_string(),
                        flags: "--non-interactive".to_string(),
                        interactive_flags: Some("--interactive-only-flag".to_string()),
                        prompt_strategy: Some(PromptStrategy::Stdin),
                        stdout_parser: Some(StdoutParser::Plain),
                        enabled: Some(true),
                    },
                ],
            },
        );

        let codex = agents.iter().find(|agent| agent.id == "codex").unwrap();
        assert_eq!(codex.cmd, "custom-codex");
        assert_eq!(codex.flags, "--yolo");
        assert_eq!(codex.interactive_flags, "--yolo");
        assert!(!codex.enabled);

        let custom = agents
            .iter()
            .find(|agent| agent.id == "custom-agent")
            .unwrap();
        assert_eq!(custom.label, "Custom Agent");
        assert_eq!(custom.flags, "--non-interactive");
        assert_eq!(custom.interactive_flags, "--interactive-only-flag");
        assert_eq!(custom.prompt_strategy, PromptStrategy::Stdin);
    }

    #[test]
    fn s11_fake_supported_agent_uses_structured_args_without_shell_rendering() {
        let invocation = AutomationAgentCommandSpec {
            agent_id: "fake-agent".to_string(),
            label: "Fake Agent".to_string(),
            executable: "fake-agent".to_string(),
            args: vec![
                "--mode".to_string(),
                "safe mode".to_string(),
                "--literal=$(not-run)".to_string(),
            ],
            prompt_strategy: PromptStrategy::Arg,
            stdout_parser: StdoutParser::Plain,
        }
        .build_invocation(command_input());

        assert_eq!(invocation.executable, "fake-agent");
        assert_eq!(
            invocation.args,
            vec![
                "--mode".to_string(),
                "safe mode".to_string(),
                "--literal=$(not-run)".to_string(),
            ]
        );
        assert_eq!(invocation.prompt_delivery, PromptDelivery::Arg);
    }

    #[test]
    fn s11_supported_builtin_agent_commands_use_declared_prompt_strategies() {
        let cases = [
            (
                "claude",
                PromptStrategy::Arg,
                vec![
                    "--print",
                    "--output-format",
                    "stream-json",
                    "--verbose",
                    "--include-partial-messages",
                ],
                PromptDelivery::Arg,
                StdoutParser::ClaudeStreamJson,
            ),
            (
                "codex",
                PromptStrategy::Arg,
                vec!["exec", "--json"],
                PromptDelivery::Arg,
                StdoutParser::CodexJsonl,
            ),
            (
                "gemini",
                PromptStrategy::PromptFlag,
                vec!["--output-format", "stream-json", "--prompt"],
                PromptDelivery::Arg,
                StdoutParser::CursorStreamJson,
            ),
            (
                "antigravity",
                PromptStrategy::PromptFlag,
                vec!["--output-format", "stream-json", "-p"],
                PromptDelivery::Arg,
                StdoutParser::CursorStreamJson,
            ),
            (
                "devin",
                PromptStrategy::Arg,
                vec!["--print"],
                PromptDelivery::Arg,
                StdoutParser::Plain,
            ),
            (
                "amp",
                PromptStrategy::Stdin,
                vec!["--execute"],
                PromptDelivery::Stdin,
                StdoutParser::Plain,
            ),
            (
                "droid",
                PromptStrategy::Arg,
                vec!["exec"],
                PromptDelivery::Arg,
                StdoutParser::Plain,
            ),
            (
                "opencode",
                PromptStrategy::Arg,
                vec!["run", "--format", "json"],
                PromptDelivery::Arg,
                StdoutParser::OpencodeJson,
            ),
            (
                "kimi",
                PromptStrategy::PromptFlag,
                vec!["--print", "-p"],
                PromptDelivery::Arg,
                StdoutParser::Plain,
            ),
            (
                "cursor",
                PromptStrategy::Arg,
                vec![
                    "--print",
                    "--output-format",
                    "stream-json",
                    "--stream-partial-output",
                ],
                PromptDelivery::Arg,
                StdoutParser::CursorStreamJson,
            ),
            (
                "kilocode",
                PromptStrategy::Arg,
                vec!["run", "--format", "json"],
                PromptDelivery::Arg,
                StdoutParser::OpencodeJson,
            ),
            (
                "kiro",
                PromptStrategy::Arg,
                vec!["chat", "--agent", "atmos"],
                PromptDelivery::Arg,
                StdoutParser::Plain,
            ),
            (
                "commandcode",
                PromptStrategy::Arg,
                vec!["--skip-onboarding", "--print"],
                PromptDelivery::Arg,
                StdoutParser::Plain,
            ),
            (
                "pi",
                PromptStrategy::PromptFlag,
                vec!["-p"],
                PromptDelivery::Arg,
                StdoutParser::Plain,
            ),
            (
                "openclaw",
                PromptStrategy::PromptFlag,
                vec!["agent", "--agent", "main", "--local", "--json", "--message"],
                PromptDelivery::Arg,
                StdoutParser::Plain,
            ),
            (
                "hermes",
                PromptStrategy::PromptFlag,
                vec!["chat", "-q"],
                PromptDelivery::Arg,
                StdoutParser::Plain,
            ),
            (
                "grok-build",
                PromptStrategy::PromptFlag,
                vec!["--output-format", "streaming-json", "-p"],
                PromptDelivery::Arg,
                StdoutParser::GrokStreamingJson,
            ),
        ];
        let definitions = load_builtin_terminal_agents().unwrap();
        let supported_count = definitions
            .iter()
            .filter(|definition| !definition.params.trim().is_empty())
            .count();
        assert_eq!(cases.len(), supported_count);

        for (agent_id, expected_strategy, expected_args, expected_delivery, expected_parser) in
            cases
        {
            let spec = command_spec_for_builtin(&definitions, agent_id);
            let invocation = spec.build_invocation(command_input());

            assert_eq!(spec.prompt_strategy, expected_strategy, "{agent_id}");
            assert_eq!(spec.stdout_parser, expected_parser, "{agent_id}");
            assert_eq!(invocation.prompt_delivery, expected_delivery, "{agent_id}");
            assert_eq!(invocation.stdout_parser, expected_parser, "{agent_id}");
            assert_eq!(
                invocation.args,
                expected_args
                    .into_iter()
                    .map(String::from)
                    .collect::<Vec<_>>(),
                "{agent_id}"
            );
        }
    }

    #[test]
    fn s11_terminal_continue_command_references_prompt_file() {
        let command = codex_spec().build_terminal_command(&command_input());

        assert!(command.contains("'codex'"));
        assert!(command.contains("'exec'"));
        assert!(command.contains("\"$(cat '/tmp/atmos automation/prompt.xml')\""));
    }

    #[test]
    fn s11_terminal_launch_command_does_not_inject_prompt() {
        let command = codex_spec().build_terminal_launch_command();

        assert_eq!(
            command,
            "'codex' 'exec' '--json' '--dangerously-bypass-approvals-and-sandbox'"
        );
    }

    #[test]
    fn s11_interactive_terminal_command_keeps_bare_executable_name() {
        let spec = AutomationAgentCommandSpec {
            agent_id: "commandcode".to_string(),
            label: "CommandCode".to_string(),
            executable: terminal_executable_for_agent(
                "cmd",
                Some(Path::new("/opt/homebrew/bin/cmd")),
            ),
            args: vec!["--trust".to_string(), "--yolo".to_string()],
            prompt_strategy: PromptStrategy::Arg,
            stdout_parser: StdoutParser::Plain,
        };

        let command = spec.build_terminal_launch_command();

        assert_eq!(command, "'cmd' '--trust' '--yolo'");
        assert!(!command.contains("/opt/homebrew/bin/cmd"));
    }

    #[test]
    fn s11_interactive_terminal_command_expands_explicit_executable_path() {
        assert_eq!(
            terminal_executable_for_agent("~/bin/cmd", Some(Path::new("/Users/aarynlu/bin/cmd"))),
            "/Users/aarynlu/bin/cmd"
        );
    }

    #[test]
    fn s11_flag_parser_keeps_quoted_args_structured() {
        let args = parse_flag_args("--mode \"safe mode\" --name 'Atmos Agent'").unwrap();

        assert_eq!(
            args,
            vec![
                "--mode".to_string(),
                "safe mode".to_string(),
                "--name".to_string(),
                "Atmos Agent".to_string()
            ]
        );
    }

    #[test]
    fn line_terminal_agent_options_strips_default_suffix() {
        let models = parse_line_terminal_agent_options(
            "Available models:\n* grok-4.5 (default)\n- grok-composer-2.5-fast\n\n",
        );
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "grok-4.5");
        assert!(models[0].is_default);
        assert_eq!(models[1].id, "grok-composer-2.5-fast");
        assert!(!models[1].is_default);
    }

    #[test]
    fn line_terminal_agent_options_parses_cursor_labels_and_current() {
        let models = parse_line_terminal_agent_options(
            "Available models\n\nauto - Auto (default)\ngemini-3.5-flash - Gemini 3.5 Flash (current)\n\nTip: use --model <id>\n",
        );
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "auto");
        assert_eq!(models[0].label, "Auto");
        assert!(!models[0].is_default);
        assert_eq!(models[1].id, "gemini-3.5-flash");
        assert_eq!(models[1].label, "Gemini 3.5 Flash");
        assert!(models[1].is_default);
    }

    #[test]
    fn grok_terminal_agent_options_ignores_status_preamble() {
        let models = parse_grok_terminal_agent_options(
            "You are logged in with grok.com.\n\nDefault model: grok-4.5\n\nAvailable models:\n  * grok-4.5 (default)\n  - grok-composer-2.5-fast\n",
        );
        assert_eq!(
            models
                .iter()
                .map(|model| model.id.as_str())
                .collect::<Vec<_>>(),
            vec!["grok-4.5", "grok-composer-2.5-fast"]
        );
        assert!(models[0].is_default);
        assert!(!models[1].is_default);
    }

    #[test]
    fn prompt_flag_stays_adjacent_to_prompt_after_run_config_args() {
        let args = merge_automation_args(
            "--always-approve --output-format streaming-json -p",
            PromptStrategy::PromptFlag,
            vec![
                "--model".to_string(),
                "grok-4.5".to_string(),
                "--reasoning-effort".to_string(),
                "high".to_string(),
            ],
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--always-approve",
                "--output-format",
                "streaming-json",
                "--model",
                "grok-4.5",
                "--reasoning-effort",
                "high",
                "-p",
            ]
        );
    }

    #[cfg(unix)]
    #[test]
    fn s5_executable_detection_requires_execute_bit() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent");
        std::fs::write(&path, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();

        assert!(!is_executable(&path));

        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();

        assert!(is_executable(&path));
    }

    #[cfg(unix)]
    #[test]
    fn s5_executable_resolution_uses_explicit_search_paths() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("custom-agent");
        std::fs::write(&path, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();

        let resolved = resolve_executable_path_with_search_paths(
            "custom-agent",
            vec![dir.path().to_path_buf()],
        )
        .unwrap();

        assert_eq!(resolved, path);
    }

    #[cfg(unix)]
    #[test]
    fn grok_default_bin_directory_is_a_supported_user_search_path() {
        use std::os::unix::fs::PermissionsExt;

        let home = tempfile::tempdir().unwrap();
        let bin = home.path().join(".grok").join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let executable = bin.join("grok");
        std::fs::write(&executable, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();

        assert_eq!(
            resolve_executable_path_with_search_paths("grok", user_bin_paths_for_home(home.path()),),
            Some(executable)
        );
    }

    fn shipped_agent(id: &str) -> ResolvedTerminalAgent {
        resolve_terminal_agents_with_settings(
            load_builtin_terminal_agents().unwrap(),
            TerminalCodeAgentFile { agents: Vec::new() },
        )
        .into_iter()
        .find(|agent| agent.id == id)
        .unwrap_or_else(|| panic!("missing builtin {id}"))
    }

    fn launch_args(
        agent_id: &str,
        model: Option<&str>,
        effort: Option<&str>,
        probed: Option<&[String]>,
    ) -> Result<Vec<String>> {
        let agent = shipped_agent(agent_id);
        let run_config = AutomationAgentRunConfig {
            model: model.map(str::to_string),
            reasoning: effort.map(|value| AutomationAgentReasoningSelection {
                mode: agent.reasoning_support.mode,
                value: value.to_string(),
            }),
            extra_args: Vec::new(),
            fast: None,
        };
        build_run_config_args_with_model_effort(&agent, Some(&run_config), probed)
    }

    #[test]
    fn app080_launch_argv_matches_closed_contracts() {
        assert_eq!(
            super::super::terminal_agent_manifest::builtin_terminal_agents_manifest_version(),
            2
        );
        assert_eq!(
            launch_args("claude", None, Some("max"), None).unwrap(),
            vec!["--effort".to_string(), "max".to_string()]
        );
        assert!(launch_args("claude", None, Some("ultracode"), None).is_err());
        assert_eq!(
            launch_args("codex", Some("gpt-5.4"), Some("high"), None).unwrap(),
            vec![
                "--model".to_string(),
                "gpt-5.4".to_string(),
                "-c".to_string(),
                "model_reasoning_effort=\"high\"".to_string(),
            ]
        );
        assert!(launch_args("codex", Some("gpt-5.4"), Some("max"), None).is_err());
        assert_eq!(
            launch_args("antigravity", Some("gemini"), Some("max"), None).unwrap(),
            vec![
                "--model".to_string(),
                "gemini".to_string(),
                "--effort".to_string(),
                "max".to_string(),
            ]
        );
        let droid_levels = vec!["low".to_string(), "high".to_string()];
        assert_eq!(
            launch_args("droid", Some("gpt"), Some("high"), Some(&droid_levels)).unwrap(),
            vec![
                "--model".to_string(),
                "gpt".to_string(),
                "--reasoning-effort".to_string(),
                "high".to_string(),
            ]
        );
        assert!(launch_args("droid", Some("gpt"), Some("max"), Some(&droid_levels)).is_err());
        assert!(launch_args("grok-build", Some("grok-4"), Some("xhigh"), None).is_err());
        assert_eq!(
            launch_args("grok-build", Some("grok-4.5"), Some("high"), None).unwrap(),
            vec![
                "--model".to_string(),
                "grok-4.5".to_string(),
                "--reasoning-effort".to_string(),
                "high".to_string(),
            ]
        );
        assert!(launch_args("grok-build", Some("grok-4.5"), Some("max"), None).is_err());
        assert!(launch_args("grok-build", Some("grok-4.5"), Some("none"), None).is_err());
        assert!(launch_args("grok-build", Some("grok-4.5"), Some("minimal"), None).is_err());
        let empty_row: Vec<String> = Vec::new();
        assert!(launch_args(
            "grok-build",
            Some("grok-4.5"),
            Some("max"),
            Some(&empty_row)
        )
        .is_err());
        assert!(launch_args(
            "grok-build",
            Some("grok-4.5"),
            Some("none"),
            Some(&empty_row)
        )
        .is_err());
        assert!(launch_args(
            "grok-build",
            Some("grok-4.5"),
            Some("minimal"),
            Some(&empty_row)
        )
        .is_err());
        assert_eq!(
            launch_args(
                "grok-build",
                Some("grok-4.5"),
                Some("high"),
                Some(&empty_row)
            )
            .unwrap(),
            vec![
                "--model".to_string(),
                "grok-4.5".to_string(),
                "--reasoning-effort".to_string(),
                "high".to_string(),
            ]
        );
        assert_eq!(
            launch_args(
                "grok-build",
                Some("grok-4.7"),
                Some("xhigh"),
                Some(&empty_row)
            )
            .unwrap(),
            vec![
                "--model".to_string(),
                "grok-4.7".to_string(),
                "--reasoning-effort".to_string(),
                "xhigh".to_string(),
            ]
        );
        assert!(launch_args(
            "grok-build",
            Some("grok-4.7"),
            Some("max"),
            Some(&empty_row)
        )
        .is_err());
        assert_eq!(
            launch_args("grok-build", Some("grok-4.7"), Some("xhigh"), None).unwrap(),
            vec![
                "--model".to_string(),
                "grok-4.7".to_string(),
                "--reasoning-effort".to_string(),
                "xhigh".to_string(),
            ]
        );
        assert!(launch_args("grok-build", Some("grok-4.7-build-fast"), Some("max"), None).is_err());
        let grok_levels = vec!["low".to_string()];
        assert!(launch_args(
            "grok-build",
            Some("grok-4"),
            Some("max"),
            Some(&grok_levels)
        )
        .is_err());
        let grok_45 = vec!["low".to_string(), "medium".to_string(), "high".to_string()];
        assert!(launch_args(
            "grok-build",
            Some("grok-4.5"),
            Some("xhigh"),
            Some(&grok_45)
        )
        .is_err());
        assert_eq!(
            launch_args("grok-build", Some("grok-4.5"), Some("high"), Some(&grok_45)).unwrap(),
            vec![
                "--model".to_string(),
                "grok-4.5".to_string(),
                "--reasoning-effort".to_string(),
                "high".to_string(),
            ]
        );
        let grok_47 = vec![
            "low".to_string(),
            "medium".to_string(),
            "high".to_string(),
            "xhigh".to_string(),
        ];
        assert_eq!(
            launch_args(
                "grok-build",
                Some("grok-4.7"),
                Some("xhigh"),
                Some(&grok_47)
            )
            .unwrap(),
            vec![
                "--model".to_string(),
                "grok-4.7".to_string(),
                "--reasoning-effort".to_string(),
                "xhigh".to_string(),
            ]
        );
        assert!(launch_args("grok-build", Some("grok-4.7"), Some("max"), Some(&grok_47)).is_err());
        let mut terminal = agent::AgentOptionsSnapshot::probing("grok-build");
        terminal.status = agent::OptionsStatus::Ok;
        terminal.models = vec![
            agent::AgentModel {
                id: "grok-4.7".into(),
                label: "grok-4.7".into(),
                ..agent::AgentModel::default()
            },
            agent::AgentModel {
                id: "grok-4.7-build-fast".into(),
                label: "grok-4.7-build-fast".into(),
                ..agent::AgentModel::default()
            },
            agent::AgentModel {
                id: "grok-4.5".into(),
                label: "grok-4.5".into(),
                ..agent::AgentModel::default()
            },
            agent::AgentModel {
                id: "grok-unknown".into(),
                label: "grok-unknown".into(),
                ..agent::AgentModel::default()
            },
        ];
        let mut native = agent::AgentOptionsSnapshot::probing("grok");
        native.status = agent::OptionsStatus::Ok;
        native.models = vec![
            agent::AgentModel {
                id: "grok-4.7".into(),
                label: "Grok 4.7".into(),
                fast: true,
                thinking: Some(agent::AgentThinkingSupport::Enum {
                    arg: Some("thinking".into()),
                    options: grok_47.clone(),
                }),
                ..agent::AgentModel::default()
            },
            agent::AgentModel {
                id: "grok-4.5".into(),
                label: "Grok 4.5".into(),
                thinking: Some(agent::AgentThinkingSupport::Enum {
                    arg: Some("thinking".into()),
                    options: grok_45.clone(),
                }),
                ..agent::AgentModel::default()
            },
        ];
        crate::service::agent_chat::options::attach_grok_native_effort(
            &mut terminal,
            Some(&native),
        );
        assert_eq!(
            effort_list_from_model_thinking(terminal.models[0].thinking.as_ref()),
            grok_47.clone()
        );
        assert_eq!(
            effort_list_from_model_thinking(terminal.models[1].thinking.as_ref()),
            grok_47
        );
        assert_eq!(
            effort_list_from_model_thinking(terminal.models[2].thinking.as_ref()),
            grok_45
        );
        assert!(terminal.models[3].thinking.is_none());
        assert!(!terminal.models[0].fast);
        let mut cold = agent::AgentOptionsSnapshot::probing("grok-build");
        cold.status = agent::OptionsStatus::Ok;
        cold.models = terminal
            .models
            .iter()
            .map(|model| agent::AgentModel {
                id: model.id.clone(),
                label: model.label.clone(),
                thinking: None,
                ..agent::AgentModel::default()
            })
            .collect();
        crate::service::agent_chat::options::attach_grok_native_effort(&mut cold, None);
        assert_eq!(
            effort_list_from_model_thinking(cold.models[0].thinking.as_ref()),
            vec![
                "low".to_string(),
                "medium".to_string(),
                "high".to_string(),
                "xhigh".to_string()
            ]
        );
        assert_eq!(
            effort_list_from_model_thinking(cold.models[1].thinking.as_ref()),
            vec![
                "low".to_string(),
                "medium".to_string(),
                "high".to_string(),
                "xhigh".to_string()
            ]
        );
        assert_eq!(
            effort_list_from_model_thinking(cold.models[2].thinking.as_ref()),
            vec!["low".to_string(), "medium".to_string(), "high".to_string()]
        );
        assert!(cold.models[3].thinking.is_none());
        assert_eq!(
            launch_args("pi", Some("pi-model"), Some("max"), None).unwrap(),
            vec![
                "--model".to_string(),
                "pi-model".to_string(),
                "--thinking".to_string(),
                "max".to_string(),
            ]
        );
        assert_eq!(
            launch_args("commandcode", Some("cmd-model"), Some("high"), None).unwrap(),
            vec![
                "--model".to_string(),
                "cmd-model".to_string(),
                "--effort".to_string(),
                "high".to_string(),
            ]
        );
        assert!(launch_args("commandcode", Some("cmd-model"), Some("max"), None).is_err());
        assert_eq!(
            launch_args("opencode", Some("provider/model"), None, None).unwrap(),
            vec!["--model".to_string(), "provider/model".to_string()]
        );
        assert_eq!(
            launch_args("kilocode", Some("provider/model"), None, None).unwrap(),
            vec!["--model".to_string(), "provider/model".to_string()]
        );
        assert_eq!(
            launch_args("opencode", Some("provider/model"), Some("high"), None).unwrap(),
            vec!["--model".to_string(), "provider/model".to_string()]
        );
        let opencode_levels = vec!["high".to_string(), "max".to_string()];
        assert_eq!(
            launch_args(
                "opencode",
                Some("provider/model"),
                Some("high"),
                Some(&opencode_levels)
            )
            .unwrap(),
            vec![
                "--model".to_string(),
                "provider/model".to_string(),
                "--variant".to_string(),
                "high".to_string(),
            ]
        );
        let opencode_variant = vec!["none".to_string(), "thinking".to_string()];
        assert_eq!(
            launch_args(
                "opencode",
                Some("opencode-go/minimax-m3"),
                Some("thinking"),
                Some(&opencode_variant)
            )
            .unwrap(),
            vec![
                "--model".to_string(),
                "opencode-go/minimax-m3".to_string(),
                "--variant".to_string(),
                "thinking".to_string(),
            ]
        );
        let droid_minimal = vec![
            "minimal".to_string(),
            "low".to_string(),
            "medium".to_string(),
            "high".to_string(),
        ];
        assert_eq!(
            launch_args(
                "droid",
                Some("gemini-3.5-flash"),
                Some("minimal"),
                Some(&droid_minimal)
            )
            .unwrap(),
            vec![
                "--model".to_string(),
                "gemini-3.5-flash".to_string(),
                "--reasoning-effort".to_string(),
                "minimal".to_string(),
            ]
        );
        let codex_levels = vec!["none".to_string(), "high".to_string()];
        assert_eq!(
            launch_args(
                "codex",
                Some("stealth/union-alpha"),
                Some("none"),
                Some(&codex_levels)
            )
            .unwrap(),
            vec![
                "--model".to_string(),
                "stealth/union-alpha".to_string(),
                "-c".to_string(),
                "model_reasoning_effort=\"none\"".to_string(),
            ]
        );
        assert!(launch_args("codex", Some("gpt-5.4"), Some("none"), None).is_err());
        let commandcode_dump: Vec<String> = (0..67)
            .map(|index| format!("vendor/model-{index}"))
            .collect();
        assert_eq!(
            launch_args(
                "commandcode",
                Some("cmd-model"),
                Some("high"),
                Some(&commandcode_dump)
            )
            .unwrap(),
            vec![
                "--model".to_string(),
                "cmd-model".to_string(),
                "--effort".to_string(),
                "high".to_string(),
            ]
        );
        assert_eq!(
            launch_args("kilocode", Some("provider/model"), Some("high"), None).unwrap(),
            vec!["--model".to_string(), "provider/model".to_string()]
        );
        assert_eq!(
            launch_args("gemini", Some("gemini-flash"), None, None).unwrap(),
            vec!["--model".to_string(), "gemini-flash".to_string()]
        );
        assert_eq!(
            launch_args("gemini", Some("gemini-flash"), Some("high"), None).unwrap(),
            vec!["--model".to_string(), "gemini-flash".to_string()]
        );

        let cursor_levels = vec!["high".to_string(), "low".to_string()];
        assert_eq!(
            launch_args(
                "cursor",
                Some("claude-opus"),
                Some("high"),
                Some(&cursor_levels)
            )
            .unwrap(),
            vec![
                "--model".to_string(),
                "claude-opus[effort=high]".to_string(),
            ]
        );
        assert_eq!(
            launch_args(
                "cursor",
                Some("claude-opus[context=1m,effort=low,fast=false]"),
                Some("high"),
                Some(&cursor_levels),
            )
            .unwrap(),
            vec![
                "--model".to_string(),
                "claude-opus[context=1m,effort=high,fast=false]".to_string(),
            ]
        );
        assert_eq!(
            launch_args(
                "cursor",
                Some("claude-opus[context=1m,fast=false]"),
                Some("high"),
                Some(&[]),
            )
            .unwrap(),
            vec![
                "--model".to_string(),
                "claude-opus[context=1m,fast=false]".to_string(),
            ]
        );
        assert_eq!(
            launch_args(
                "cursor",
                Some("claude-opus[context=1m,fast=false]"),
                Some("nope"),
                None,
            )
            .unwrap(),
            vec![
                "--model".to_string(),
                "claude-opus[context=1m,fast=false]".to_string(),
            ]
        );

        let amp = shipped_agent("amp");
        let stored_effort = AutomationAgentRunConfig {
            model: None,
            reasoning: Some(AutomationAgentReasoningSelection {
                mode: AutomationAgentReasoningMode::Manual,
                value: "high".to_string(),
            }),
            extra_args: Vec::new(),
            fast: None,
        };
        let amp_args =
            build_run_config_args_with_model_effort(&amp, Some(&stored_effort), None).unwrap();
        assert!(!amp_args
            .iter()
            .any(|arg| arg == "--effort" || arg == "high"));
        let amp_fast = AutomationAgentRunConfig {
            fast: Some(true),
            ..stored_effort
        };
        assert_eq!(
            build_run_config_args_with_model_effort(&amp, Some(&amp_fast), None).unwrap(),
            vec!["--fast".to_string()]
        );
        assert!(model_flag_for_agent("amp").is_none());
        assert!(model_flag_for_agent("hermes").is_none());
        assert!(model_flag_for_agent("openclaw").is_none());

        let custom = ResolvedTerminalAgent {
            id: "custom".to_string(),
            label: "Custom".to_string(),
            cmd: "custom".to_string(),
            flags: String::new(),
            interactive_flags: String::new(),
            prompt_strategy: PromptStrategy::Arg,
            stdout_parser: StdoutParser::Plain,
            model_support: AutomationAgentModelInputMode::None,
            reasoning_support: AutomationAgentReasoningSupport::default(),
            model_list: None,
            enabled: true,
        };
        let custom_config = AutomationAgentRunConfig {
            model: None,
            reasoning: None,
            extra_args: vec!["--foo".to_string(), "bar".to_string()],
            fast: None,
        };
        assert_eq!(
            build_run_config_args(&custom, Some(&custom_config)).unwrap(),
            vec!["--foo".to_string(), "bar".to_string()]
        );
        assert_eq!(
            launch_args("claude", Some("typed-id"), None, None).unwrap(),
            vec!["--model".to_string(), "typed-id".to_string()]
        );

        for id in ["devin", "kimi", "kiro", "hermes", "openclaw"] {
            let agent = shipped_agent(id);
            let raw = load_builtin_terminal_agents()
                .unwrap()
                .into_iter()
                .find(|item| item.id == id)
                .unwrap();
            assert_eq!(agent.reasoning_support.mode, raw.reasoning_support.mode);
            assert_eq!(agent.model_support, raw.model_support);
        }
        assert_eq!(
            shipped_agent("kimi").reasoning_support.value_style,
            AutomationAgentReasoningValueStyle::FlagOnly
        );

        let claude = shipped_agent("claude");
        assert!(claude.flags.contains("--dangerously-skip-permissions") || claude_yolo_unchanged());
    }

    fn claude_yolo_unchanged() -> bool {
        load_builtin_terminal_agents()
            .unwrap()
            .into_iter()
            .find(|item| item.id == "claude")
            .unwrap()
            .yolo_params
            .unwrap()
            .contains("--dangerously-skip-permissions")
    }

    #[test]
    fn app080_grok_build_empty_line_list_does_not_launch_manifest_effort() {
        struct RestoreCache {
            previous: Option<CachedTerminalAgentOptions>,
        }
        impl Drop for RestoreCache {
            fn drop(&mut self) {
                let Some(cache) = TERMINAL_OPTIONS_CACHE.get() else {
                    return;
                };
                let Ok(mut guard) = cache.lock() else {
                    return;
                };
                match self.previous.take() {
                    Some(previous) => {
                        guard.insert("grok-build".to_string(), previous);
                    }
                    None => {
                        guard.remove("grok-build");
                    }
                }
            }
        }

        let cache = TERMINAL_OPTIONS_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        let previous = cache
            .lock()
            .expect("catalog cache")
            .get("grok-build")
            .cloned();
        let _restore = RestoreCache { previous };

        let root = tempfile::tempdir().expect("temp options root");
        let worker = crate::OptionsPrefetchWorker::new(
            root.path().to_path_buf(),
            agent::OptionsProbe::with_acp_probe(
                root.path().join("options-probe"),
                Box::new(agent::NoopAcpOptionsProbe),
            ),
            std::time::Duration::from_secs(60),
        );
        let mut catalog = agent::AgentOptionsSnapshot::probing("grok-build");
        catalog.status = agent::OptionsStatus::Ok;
        catalog.fetched_at = Utc::now();
        catalog.models = [
            "grok-4.7",
            "grok-4.7-build-fast",
            "grok-4.6",
            "grok-4.5",
            "grok-unknown",
        ]
        .into_iter()
        .map(|id| agent::AgentModel {
            id: id.to_string(),
            label: id.to_string(),
            thinking: None,
            ..agent::AgentModel::default()
        })
        .collect();
        worker.put_options_for_test(&catalog);

        let agent = shipped_agent("grok-build");
        let config = |model: &str, effort: &str| AutomationAgentRunConfig {
            model: Some(model.to_string()),
            reasoning: Some(AutomationAgentReasoningSelection {
                mode: agent.reasoning_support.mode,
                value: effort.to_string(),
            }),
            extra_args: Vec::new(),
            fast: None,
        };
        assert_eq!(
            build_run_config_args(&agent, Some(&config("grok-4.5", "high"))).unwrap(),
            vec![
                "--model".to_string(),
                "grok-4.5".to_string(),
                "--reasoning-effort".to_string(),
                "high".to_string(),
            ]
        );
        assert!(build_run_config_args(&agent, Some(&config("grok-4.5", "max"))).is_err());
        assert!(build_run_config_args(&agent, Some(&config("grok-4.5", "none"))).is_err());
        assert!(build_run_config_args(&agent, Some(&config("grok-4.5", "minimal"))).is_err());
        assert_eq!(
            build_run_config_args(&agent, Some(&config("grok-4.7", "xhigh"))).unwrap(),
            vec![
                "--model".to_string(),
                "grok-4.7".to_string(),
                "--reasoning-effort".to_string(),
                "xhigh".to_string(),
            ]
        );
        assert!(build_run_config_args(&agent, Some(&config("grok-4.7", "max"))).is_err());
        assert!(build_run_config_args(&agent, Some(&config("grok-unknown", "high"))).is_err());
    }

    #[test]
    fn app080_cached_model_row_narrows_launch_effort() {
        struct RestoreCache {
            agent_id: String,
            previous: Option<CachedTerminalAgentOptions>,
        }
        impl Drop for RestoreCache {
            fn drop(&mut self) {
                let Some(cache) = TERMINAL_OPTIONS_CACHE.get() else {
                    return;
                };
                let Ok(mut guard) = cache.lock() else {
                    return;
                };
                match self.previous.take() {
                    Some(previous) => {
                        guard.insert(self.agent_id.clone(), previous);
                    }
                    None => {
                        guard.remove(&self.agent_id);
                    }
                }
            }
        }

        fn seed(
            agent_id: &str,
            model_id: &str,
            thinking: Option<agent::AgentThinkingSupport>,
        ) -> RestoreCache {
            let cache = TERMINAL_OPTIONS_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
            let mut guard = cache.lock().expect("catalog cache");
            let previous = guard.insert(
                agent_id.to_string(),
                CachedTerminalAgentOptions {
                    stored_at: Instant::now(),
                    fetched_at: Utc::now(),
                    options: TerminalAgentOptions {
                        agent_id: agent_id.to_string(),
                        status: TerminalAgentOptionsStatus::Ok,
                        models: vec![TerminalAgentOption {
                            id: model_id.to_string(),
                            label: model_id.to_string(),
                            group: None,
                            is_default: false,
                            thinking,
                            fast: false,
                        }],
                        message: None,
                        source: TerminalAgentOptionsSource::Cache,
                    },
                },
            );
            RestoreCache {
                agent_id: agent_id.to_string(),
                previous,
            }
        }

        let _droid_cache = seed(
            "droid",
            "gpt",
            Some(agent::AgentThinkingSupport::Enum {
                arg: Some("--reasoning-effort".to_string()),
                options: vec!["low".to_string(), "high".to_string()],
            }),
        );
        let droid = shipped_agent("droid");
        let rejected = AutomationAgentRunConfig {
            model: Some("gpt".to_string()),
            reasoning: Some(AutomationAgentReasoningSelection {
                mode: droid.reasoning_support.mode,
                value: "max".to_string(),
            }),
            extra_args: Vec::new(),
            fast: None,
        };
        assert!(build_run_config_args(&droid, Some(&rejected)).is_err());
        let accepted = AutomationAgentRunConfig {
            reasoning: Some(AutomationAgentReasoningSelection {
                mode: droid.reasoning_support.mode,
                value: "high".to_string(),
            }),
            ..rejected
        };
        assert_eq!(
            build_run_config_args(&droid, Some(&accepted)).unwrap(),
            vec![
                "--model".to_string(),
                "gpt".to_string(),
                "--reasoning-effort".to_string(),
                "high".to_string(),
            ]
        );

        let _cursor_cache = seed(
            "cursor",
            "claude-opus",
            Some(agent::AgentThinkingSupport::None),
        );
        let cursor = shipped_agent("cursor");
        let cursor_config = AutomationAgentRunConfig {
            model: Some("claude-opus".to_string()),
            reasoning: Some(AutomationAgentReasoningSelection {
                mode: cursor.reasoning_support.mode,
                value: "high".to_string(),
            }),
            extra_args: Vec::new(),
            fast: None,
        };
        assert_eq!(
            build_run_config_args(&cursor, Some(&cursor_config)).unwrap(),
            vec!["--model".to_string(), "claude-opus".to_string()]
        );
    }

    #[test]
    fn app080_worker_catalog_narrows_launch_effort() {
        struct RestoreCache {
            agent_ids: Vec<String>,
            previous: Vec<Option<CachedTerminalAgentOptions>>,
        }
        impl Drop for RestoreCache {
            fn drop(&mut self) {
                let Some(cache) = TERMINAL_OPTIONS_CACHE.get() else {
                    return;
                };
                let Ok(mut guard) = cache.lock() else {
                    return;
                };
                for (agent_id, previous) in self.agent_ids.iter().zip(self.previous.drain(..)) {
                    match previous {
                        Some(previous) => {
                            guard.insert(agent_id.clone(), previous);
                        }
                        None => {
                            guard.remove(agent_id);
                        }
                    }
                }
            }
        }

        fn snapshot(
            agent_id: &str,
            model_id: &str,
            thinking: Option<agent::AgentThinkingSupport>,
            status: agent::OptionsStatus,
        ) -> agent::AgentOptionsSnapshot {
            agent::AgentOptionsSnapshot {
                agent_id: agent_id.to_string(),
                status,
                models: if status == agent::OptionsStatus::Ok {
                    vec![agent::AgentModel {
                        id: model_id.to_string(),
                        label: model_id.to_string(),
                        group: None,
                        is_default: false,
                        thinking,
                        context: Vec::new(),
                        fast: false,
                        multiplier: None,
                        fast_multiplier: None,
                    }]
                } else {
                    Vec::new()
                },
                modes: Vec::new(),
                permission_modes: Vec::new(),
                commands: Vec::new(),
                thinking: agent::AgentThinkingSupport::None,
                strategies_used: Vec::new(),
                fetched_at: Utc::now(),
                source: agent::OptionsSource::Live,
                message: None,
            }
        }

        let root = tempfile::tempdir().expect("temp options root");
        let worker = std::sync::Arc::new(crate::OptionsPrefetchWorker::new(
            root.path().to_path_buf(),
            agent::OptionsProbe::with_acp_probe(
                root.path().join("options-probe"),
                Box::new(agent::NoopAcpOptionsProbe),
            ),
            std::time::Duration::from_secs(60),
        ));
        let cache = TERMINAL_OPTIONS_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        let previous = {
            let guard = cache.lock().expect("catalog cache");
            ["droid", "factory-droid", "cursor"]
                .into_iter()
                .map(|id| guard.get(id).cloned())
                .collect()
        };
        let _restore = RestoreCache {
            agent_ids: vec![
                "droid".to_string(),
                "factory-droid".to_string(),
                "cursor".to_string(),
            ],
            previous,
        };

        let mut droid_catalog = snapshot(
            "droid",
            "gpt",
            Some(agent::AgentThinkingSupport::Enum {
                arg: Some("--reasoning-effort".to_string()),
                options: vec!["low".to_string(), "high".to_string()],
            }),
            agent::OptionsStatus::Ok,
        );
        // A Droid catalog without Mode and Permission is treated as stale and
        // would schedule a live probe. These rows keep the cache hit quiet.
        droid_catalog.modes = vec![agent::AgentMode {
            id: "spec".to_string(),
            label: "Spec".to_string(),
            is_default: true,
        }];
        droid_catalog.permission_modes = ["yolo", "accept_edits", "auto", "ask_always"]
            .into_iter()
            .map(|id| agent::AgentMode {
                id: id.to_string(),
                label: id.to_string(),
                is_default: id == "ask_always",
            })
            .collect();
        worker.put_options_for_test(&droid_catalog);
        let droid = shipped_agent("droid");
        let rejected = AutomationAgentRunConfig {
            model: Some("gpt".to_string()),
            reasoning: Some(AutomationAgentReasoningSelection {
                mode: droid.reasoning_support.mode,
                value: "max".to_string(),
            }),
            extra_args: Vec::new(),
            fast: None,
        };
        assert!(build_run_config_args(&droid, Some(&rejected)).is_err());
        {
            let mut guard = cache.lock().expect("catalog cache");
            guard.remove("droid");
            guard.remove("factory-droid");
        }
        let loaded = worker.get_cached_or_probing(&crate::options_probe_plan_for("droid"), false);
        assert_eq!(loaded.status, agent::OptionsStatus::Ok);
        assert_eq!(
            worker.probe_count(),
            0,
            "reading the worker cache must not spawn"
        );
        assert!(
            build_run_config_args(&droid, Some(&rejected)).is_err(),
            "models_get cache hit must narrow launch"
        );
        let accepted = AutomationAgentRunConfig {
            reasoning: Some(AutomationAgentReasoningSelection {
                mode: droid.reasoning_support.mode,
                value: "high".to_string(),
            }),
            ..rejected.clone()
        };
        assert_eq!(
            build_run_config_args(&droid, Some(&accepted)).unwrap(),
            vec![
                "--model".to_string(),
                "gpt".to_string(),
                "--reasoning-effort".to_string(),
                "high".to_string(),
            ]
        );
        worker.put_options_for_test(&snapshot("droid", "gpt", None, agent::OptionsStatus::Error));
        assert!(
            build_run_config_args(&droid, Some(&rejected)).is_err(),
            "a failed probe must keep the last ok model row"
        );

        worker.put_options_for_test(&snapshot(
            "cursor",
            "claude-opus-listed",
            Some(agent::AgentThinkingSupport::Enum {
                arg: None,
                options: vec!["low".to_string(), "high".to_string()],
            }),
            agent::OptionsStatus::Ok,
        ));
        let cursor = shipped_agent("cursor");
        let cursor_config = AutomationAgentRunConfig {
            model: Some("claude-opus-listed".to_string()),
            reasoning: Some(AutomationAgentReasoningSelection {
                mode: cursor.reasoning_support.mode,
                value: "high".to_string(),
            }),
            extra_args: Vec::new(),
            fast: None,
        };
        assert_eq!(
            build_run_config_args(&cursor, Some(&cursor_config)).unwrap(),
            vec![
                "--model".to_string(),
                "claude-opus-listed[effort=high]".to_string(),
            ]
        );

        let file = root.path().join("cursor-row.json");
        std::fs::write(
            &file,
            serde_json::to_vec(&snapshot(
                "cursor",
                "claude-opus-listed",
                Some(agent::AgentThinkingSupport::Enum {
                    arg: None,
                    options: vec!["low".to_string(), "high".to_string()],
                }),
                agent::OptionsStatus::Ok,
            ))
            .unwrap(),
        )
        .unwrap();
        assert_eq!(
            model_effort_from_catalog_file(&file, "claude-opus-listed").unwrap(),
            vec!["low".to_string(), "high".to_string()]
        );
    }

    #[test]
    fn app080_missing_catalog_binary_does_not_spawn() {
        let agent = ResolvedTerminalAgent {
            id: "codex".to_string(),
            label: "Codex".to_string(),
            cmd: "app080-missing-bin-xyz".to_string(),
            flags: "exec".to_string(),
            interactive_flags: String::new(),
            prompt_strategy: PromptStrategy::Arg,
            stdout_parser: StdoutParser::Plain,
            model_support: AutomationAgentModelInputMode::Catalog,
            reasoning_support: AutomationAgentReasoningSupport::default(),
            model_list: Some(TerminalAgentModelListSpec {
                supported: true,
                command: vec![
                    "app080-missing-bin-xyz".to_string(),
                    "debug".to_string(),
                    "models".to_string(),
                ],
                parser: TerminalAgentModelListParser::LineList,
            }),
            enabled: true,
        };
        let options = missing_catalog_binary_options(&agent);
        let message = options.message.unwrap_or_default();
        assert!(message.contains("not installed"), "{message}");
        assert!(!message.contains("Failed to run"), "{message}");
        assert!(catalog_executable(&agent).is_none());
    }

    fn codex_spec() -> AutomationAgentCommandSpec {
        AutomationAgentCommandSpec {
            agent_id: "codex".to_string(),
            label: "Codex".to_string(),
            executable: "codex".to_string(),
            args: vec![
                "exec".to_string(),
                "--json".to_string(),
                "--dangerously-bypass-approvals-and-sandbox".to_string(),
            ],
            prompt_strategy: PromptStrategy::Arg,
            stdout_parser: StdoutParser::CodexJsonl,
        }
    }

    fn command_spec_for_builtin(
        definitions: &[TerminalAgentDefinition],
        agent_id: &str,
    ) -> AutomationAgentCommandSpec {
        let definition = definitions
            .iter()
            .find(|definition| definition.id == agent_id)
            .unwrap_or_else(|| panic!("missing builtin agent {agent_id}"));

        AutomationAgentCommandSpec {
            agent_id: definition.id.clone(),
            label: definition.label.clone(),
            executable: definition.cmd.clone(),
            args: parse_flag_args(&definition.params).unwrap(),
            prompt_strategy: definition
                .prompt_strategy
                .unwrap_or_else(|| legacy_prompt_strategy(definition.use_echo)),
            stdout_parser: definition.stdout_parser,
        }
    }
}

#[cfg(test)]
mod session_agent_option_tests {
    use super::enabled_session_agent_rows;

    #[test]
    fn drops_disabled_and_sorts_by_label() {
        let rows = enabled_session_agent_rows([
            ("codex".into(), "Codex".into(), true),
            ("claude".into(), "Claude Code".into(), true),
            ("off".into(), "Off".into(), false),
        ]);
        assert_eq!(
            rows.iter().map(|row| row.id.as_str()).collect::<Vec<_>>(),
            vec!["claude", "codex"]
        );
    }
}
