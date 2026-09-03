use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
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
pub struct TerminalAgentModelOption {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub is_default: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking: Option<agent::AgentThinkingSupport>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TerminalAgentModelCatalogStatus {
    Ok,
    Unsupported,
    AuthRequired,
    Error,
    Probing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TerminalAgentModelCatalogSource {
    Live,
    Cache,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalAgentModelCatalog {
    pub agent_id: String,
    pub status: TerminalAgentModelCatalogStatus,
    pub models: Vec<TerminalAgentModelOption>,
    pub message: Option<String>,
    pub source: TerminalAgentModelCatalogSource,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AutomationAgentRunConfig {
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub reasoning: Option<AutomationAgentReasoningSelection>,
    #[serde(default)]
    pub extra_args: Vec<String>,
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

const MODEL_CATALOG_TTL: Duration = Duration::from_secs(300);
const MODEL_CATALOG_ERROR_TTL: Duration = Duration::from_secs(30);

static MODEL_CATALOG_CACHE: OnceLock<Mutex<HashMap<String, CachedModelCatalog>>> = OnceLock::new();

#[derive(Debug, Clone)]
struct CachedModelCatalog {
    stored_at: Instant,
    catalog: TerminalAgentModelCatalog,
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

pub fn terminal_agent_model_catalog(
    agent_id: &str,
    refresh: bool,
) -> Result<TerminalAgentModelCatalog> {
    let cache = MODEL_CATALOG_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if !refresh {
        if let Some(cached) = cache
            .lock()
            .map_err(|_| {
                ServiceError::Processing("Terminal agent model cache is poisoned.".to_string())
            })?
            .get(agent_id)
            .cloned()
        {
            let ttl = if matches!(cached.catalog.status, TerminalAgentModelCatalogStatus::Ok) {
                MODEL_CATALOG_TTL
            } else {
                MODEL_CATALOG_ERROR_TTL
            };
            if cached.stored_at.elapsed() <= ttl {
                let mut catalog = cached.catalog.clone();
                catalog.source = TerminalAgentModelCatalogSource::Cache;
                return Ok(catalog);
            }
        }
    }

    let catalog = probe_terminal_agent_model_catalog(agent_id)?;
    cache
        .lock()
        .map_err(|_| {
            ServiceError::Processing("Terminal agent model cache is poisoned.".to_string())
        })?
        .insert(
            agent_id.to_string(),
            CachedModelCatalog {
                stored_at: Instant::now(),
                catalog: catalog.clone(),
            },
        );
    Ok(catalog)
}

fn agent_yolo_mode_enabled() -> bool {
    let path = dirs::home_dir()
        .map(|home| {
            home.join(".atmos")
                .join("config")
                .join("function_settings.json")
        })
        .unwrap_or_else(|| PathBuf::from("function_settings.json"));
    let Ok(raw) = std::fs::read_to_string(path) else {
        return true;
    };
    let Ok(value) = serde_json::from_str::<Value>(&raw) else {
        return true;
    };
    value
        .get("agent_cli")
        .and_then(|agent_cli| agent_cli.get("yolo_mode"))
        .and_then(|mode| mode.as_bool())
        .unwrap_or(true)
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
    let yolo = agent_yolo_mode_enabled();

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

fn probe_terminal_agent_model_catalog(agent_id: &str) -> Result<TerminalAgentModelCatalog> {
    let Some(agent) = resolved_terminal_agents()?
        .into_iter()
        .find(|agent| agent.id == agent_id)
    else {
        return Ok(build_model_catalog(
            agent_id,
            TerminalAgentModelCatalogStatus::Unsupported,
            Vec::new(),
            Some(format!("Agent `{agent_id}` is not configured.")),
            TerminalAgentModelCatalogSource::Live,
        ));
    };

    let Some(model_list) = agent.model_list.clone().filter(|spec| spec.supported) else {
        return Ok(build_model_catalog(
            &agent.id,
            TerminalAgentModelCatalogStatus::Unsupported,
            Vec::new(),
            Some(format!(
                "Agent `{}` does not expose a live model list.",
                agent.id
            )),
            TerminalAgentModelCatalogSource::Live,
        ));
    };

    let support = automation_support(&agent);
    let Some(executable_path) = support.executable_path else {
        return Ok(build_model_catalog(
            &agent.id,
            TerminalAgentModelCatalogStatus::Error,
            Vec::new(),
            Some(support.unavailable_reason.unwrap_or_else(|| {
                format!("{} is not installed or is not executable.", agent.cmd)
            })),
            TerminalAgentModelCatalogSource::Live,
        ));
    };

    let args = if model_list.command.len() > 1 {
        model_list.command[1..].to_vec()
    } else {
        Vec::new()
    };

    let output = match Command::new(&executable_path).args(&args).output() {
        Ok(output) => output,
        Err(error) => {
            return Ok(build_model_catalog(
                &agent.id,
                TerminalAgentModelCatalogStatus::Error,
                Vec::new(),
                Some(format!("Failed to run model list command: {error}")),
                TerminalAgentModelCatalogSource::Live,
            ));
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{}\n{}", stdout, stderr).trim().to_string();

    if !output.status.success() {
        let status = if looks_like_auth_required(&combined) {
            TerminalAgentModelCatalogStatus::AuthRequired
        } else {
            TerminalAgentModelCatalogStatus::Error
        };
        let fallback = if matches!(status, TerminalAgentModelCatalogStatus::AuthRequired) {
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
        return Ok(build_model_catalog(
            &agent.id,
            status,
            Vec::new(),
            Some(non_empty(&combined).unwrap_or(fallback)),
            TerminalAgentModelCatalogSource::Live,
        ));
    }

    let models = match parse_model_catalog_output(&stdout, model_list.parser) {
        Ok(models) if !models.is_empty() => models,
        Ok(_) => {
            return Ok(build_model_catalog(
                &agent.id,
                TerminalAgentModelCatalogStatus::Error,
                Vec::new(),
                Some("Model list command returned no models.".to_string()),
                TerminalAgentModelCatalogSource::Live,
            ));
        }
        Err(error) => {
            return Ok(build_model_catalog(
                &agent.id,
                TerminalAgentModelCatalogStatus::Error,
                Vec::new(),
                Some(error),
                TerminalAgentModelCatalogSource::Live,
            ));
        }
    };

    Ok(build_model_catalog(
        &agent.id,
        TerminalAgentModelCatalogStatus::Ok,
        models,
        None,
        TerminalAgentModelCatalogSource::Live,
    ))
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

fn build_model_catalog(
    agent_id: &str,
    status: TerminalAgentModelCatalogStatus,
    models: Vec<TerminalAgentModelOption>,
    message: Option<String>,
    source: TerminalAgentModelCatalogSource,
) -> TerminalAgentModelCatalog {
    TerminalAgentModelCatalog {
        agent_id: agent_id.to_string(),
        status,
        models,
        message,
        source,
    }
}

fn parse_model_catalog_output(
    output: &str,
    parser: TerminalAgentModelListParser,
) -> std::result::Result<Vec<TerminalAgentModelOption>, String> {
    let models = match parser {
        TerminalAgentModelListParser::LineList => parse_line_model_catalog(output),
        TerminalAgentModelListParser::GrokLineList => parse_grok_model_catalog(output),
        TerminalAgentModelListParser::KiroJson | TerminalAgentModelListParser::Json => {
            parse_json_model_catalog(output)?
        }
        TerminalAgentModelListParser::DroidHelp => parse_droid_help_model_catalog(output),
    };
    Ok(dedupe_model_options(models))
}

fn option_from_agent_model(model: agent::AgentModel) -> TerminalAgentModelOption {
    TerminalAgentModelOption {
        id: model.id,
        label: model.label,
        group: model.group,
        is_default: model.is_default,
        thinking: model.thinking,
    }
}

fn parse_line_model_catalog(output: &str) -> Vec<TerminalAgentModelOption> {
    agent::parse_line_list(output)
        .into_iter()
        .map(option_from_agent_model)
        .collect()
}

fn parse_droid_help_model_catalog(output: &str) -> Vec<TerminalAgentModelOption> {
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

fn parse_grok_model_catalog(output: &str) -> Vec<TerminalAgentModelOption> {
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
            (!id.is_empty()).then_some(TerminalAgentModelOption {
                label: id.clone(),
                id,
                group: None,
                is_default,
                thinking: None,
            })
        })
        .collect()
}

fn parse_json_model_catalog(
    output: &str,
) -> std::result::Result<Vec<TerminalAgentModelOption>, String> {
    let value: Value = serde_json::from_str(output)
        .map_err(|error| format!("Failed to parse model catalog JSON: {error}"))?;
    Ok(parse_json_model_catalog_value(&value))
}

fn parse_json_model_catalog_value(value: &Value) -> Vec<TerminalAgentModelOption> {
    match value {
        Value::Array(items) => items.iter().filter_map(model_option_from_json).collect(),
        Value::Object(map) => ["models", "items", "data"]
            .iter()
            .find_map(|key| map.get(*key))
            .map(parse_json_model_catalog_value)
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn model_option_from_json(value: &Value) -> Option<TerminalAgentModelOption> {
    match value {
        Value::String(model) => non_empty(model).map(|id| TerminalAgentModelOption {
            label: id.clone(),
            id,
            group: None,
            is_default: false,
            thinking: None,
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
            Some(TerminalAgentModelOption {
                id,
                label,
                group,
                is_default,
                thinking: None,
            })
        }
        _ => None,
    }
}

fn dedupe_model_options(models: Vec<TerminalAgentModelOption>) -> Vec<TerminalAgentModelOption> {
    let mut deduped: Vec<TerminalAgentModelOption> = Vec::with_capacity(models.len());
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

fn build_run_config_args(
    agent: &ResolvedTerminalAgent,
    run_config: Option<&AutomationAgentRunConfig>,
) -> Result<Vec<String>> {
    let Some(run_config) = run_config else {
        return Ok(Vec::new());
    };
    let mut args = Vec::new();
    let model = run_config
        .model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let reasoning = run_config
        .reasoning
        .as_ref()
        .filter(|value| !value.value.trim().is_empty());

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

    if let Some(reasoning) = reasoning {
        if reasoning.mode != agent.reasoning_support.mode {
            return Err(ServiceError::Validation(format!(
                "Agent `{}` does not support structured reasoning mode `{}`.",
                agent.id,
                serde_json::to_string(&reasoning.mode)
                    .unwrap_or_else(|_| "\"unknown\"".to_string())
            )));
        }
        if let Some(reasoning_flag) = reasoning_arg_for_agent(agent) {
            if extra_args.iter().any(|item| item == reasoning_flag) {
                return Err(ServiceError::Validation(format!(
                    "Extra args already include {reasoning_flag} for agent `{}`.",
                    agent.id
                )));
            }
        }
    }

    if let Some(model) = model {
        match model_flag_for_agent(&agent.id) {
            Some(flag) => {
                args.push(flag.to_string());
                args.push(model.to_string());
            }
            None => {
                return Err(ServiceError::Validation(format!(
                    "Agent `{}` does not support structured model selection.",
                    agent.id
                )));
            }
        }
    }

    if let Some(reasoning) = reasoning {
        match agent.reasoning_support.mode {
            AutomationAgentReasoningMode::None | AutomationAgentReasoningMode::EncodedInModel => {
                return Err(ServiceError::Validation(format!(
                    "Agent `{}` does not support separate structured reasoning controls.",
                    agent.id
                )));
            }
            AutomationAgentReasoningMode::Enum | AutomationAgentReasoningMode::Manual => {
                let flag = reasoning_arg_for_agent(agent).ok_or_else(|| {
                    ServiceError::Validation(format!(
                        "Agent `{}` is missing a structured reasoning flag definition.",
                        agent.id
                    ))
                })?;
                args.push(flag.to_string());
                if agent.reasoning_support.value_style
                    != AutomationAgentReasoningValueStyle::FlagOnly
                {
                    args.push(reasoning.value.trim().to_string());
                }
            }
        }
    }

    args.extend(extra_args);
    Ok(args)
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
            && agent
                .yolo_params
                .as_deref()
                .is_some_and(|p| p.contains("--force --print"))
            && agent.yolo_interactive_params.as_deref() == Some("--yolo")));
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
    fn line_model_catalog_strips_default_suffix() {
        let models = parse_line_model_catalog(
            "Available models:\n* grok-4.5 (default)\n- grok-composer-2.5-fast\n\n",
        );
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "grok-4.5");
        assert!(models[0].is_default);
        assert_eq!(models[1].id, "grok-composer-2.5-fast");
        assert!(!models[1].is_default);
    }

    #[test]
    fn line_model_catalog_parses_cursor_labels_and_current() {
        let models = parse_line_model_catalog(
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
    fn grok_model_catalog_ignores_status_preamble() {
        let models = parse_grok_model_catalog(
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
