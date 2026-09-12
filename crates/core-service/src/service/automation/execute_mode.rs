use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::{Result, ServiceError};

use super::agents::{validate_agent_run_config, AutomationAgentRunConfig};
use super::artifacts;
use super::terminal_agent_manifest::BUILTIN_TERMINAL_AGENTS_JSON;

pub const STANDALONE_GROUP_ID: &str = "automation:standalone";
pub const STANDALONE_SCOPE_PREFIX: &str = "automation:";
pub const AUTOMATION_ORIGIN: &str = "automation";
pub const AUTOMATION_CHAT_PERMISSION_MODE: &str = "yolo";
pub const SKILL_RELATIVE_PATH: &str = "skills/.system/atmos-automation/SKILL.md";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AutomationExecuteMode {
    #[default]
    Headless,
    Terminal,
    Chat,
}

impl AutomationExecuteMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Headless => "headless",
            Self::Terminal => "terminal",
            Self::Chat => "chat",
        }
    }

    pub fn parse(raw: &str) -> Result<Self> {
        match raw.trim() {
            "" | "headless" => Ok(Self::Headless),
            "terminal" => Ok(Self::Terminal),
            "chat" => Ok(Self::Chat),
            other => Err(ServiceError::Validation(format!(
                "Unsupported execute_mode: {other}"
            ))),
        }
    }

    pub fn parse_optional(raw: Option<&str>) -> Result<Self> {
        match raw {
            None => Ok(Self::Headless),
            Some(value) => Self::parse(value),
        }
    }

    pub fn is_interactive(self) -> bool {
        matches!(self, Self::Terminal | Self::Chat)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AutomationSurfaceKind {
    #[default]
    None,
    Terminal,
    Chat,
}

impl AutomationSurfaceKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Terminal => "terminal",
            Self::Chat => "chat",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationRunPaths {
    pub run_guid: String,
    pub automation_guid: String,
    pub definition_dir: String,
    pub instructions_path: String,
    pub memory_path: String,
    pub run_dir: String,
    pub prompt_path: String,
    pub result_path: String,
    pub run_json_path: String,
    pub skill_path: String,
    pub cwd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationChatAgentConfig {
    pub kind: String,
    pub provider_id: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub thinking: Option<String>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub permission_mode: Option<String>,
    #[serde(default)]
    pub fast: Option<String>,
    #[serde(default)]
    pub context: Option<String>,
}

pub fn standalone_definition_dir(automation_guid: &str) -> Result<PathBuf> {
    artifacts::definition_dir(automation_guid)
}

pub fn standalone_scope_id(automation_guid: &str) -> String {
    format!("{STANDALONE_SCOPE_PREFIX}{automation_guid}")
}

pub fn parse_standalone_scope(scope: &str) -> Option<&str> {
    scope
        .strip_prefix(STANDALONE_SCOPE_PREFIX)
        .filter(|guid| !guid.is_empty() && !guid.contains(':') && guid != &"standalone")
}

pub fn skill_path() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| ServiceError::Validation("Home directory not found".to_string()))?;
    Ok(home.join(".atmos").join(SKILL_RELATIVE_PATH))
}

pub fn build_interactive_prompt(
    display_name: &str,
    automation_guid: &str,
    run_guid: &str,
    cwd: &str,
) -> String {
    let skill = skill_path()
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_else(|_| format!("~/.atmos/{SKILL_RELATIVE_PATH}"));
    format!(
        r#"Read and follow the Atmos automation skill before doing anything else:
{skill}

You are running Atmos automation "{display_name}" (id {automation_guid}), run {run_guid}.

1. Call: atmos automation paths --run {run_guid}
2. Read instructions.md at the returned instructions_path.
3. Do the job in cwd {cwd}.
4. Write the final result to result_path (final.md). Update memory.md only for a durable fact a later run would miss.
5. Mark the run finished:
   atmos automation complete --run {run_guid}
   On failure:
   atmos automation complete --run {run_guid} --failed --message "<short reason>"

Do not guess file paths. Process or TTY exit does not finish this run.
"#
    )
}

pub fn is_known_chat_provider_id(agent_id: &str) -> bool {
    let id = agent_id.trim();
    if id.is_empty() {
        return false;
    }
    let folded = agent::canonicalize_chat_provider_id(id);
    if agent::is_native_chat_agent_id(folded)
        || agent::is_droid_chat_provider(id)
        || agent::native_chat_sibling_id(id).is_some()
        || folded == "cursor"
    {
        return true;
    }
    !is_terminal_only_builtin_agent(id)
}

fn is_terminal_only_builtin_agent(agent_id: &str) -> bool {
    if !is_builtin_terminal_agent_id(agent_id) {
        return false;
    }
    let folded = agent::canonicalize_chat_provider_id(agent_id);
    !(agent::is_native_chat_agent_id(folded)
        || agent::is_droid_chat_provider(agent_id)
        || agent::native_chat_sibling_id(agent_id).is_some()
        || folded == "cursor")
}

fn is_builtin_terminal_agent_id(agent_id: &str) -> bool {
    #[derive(Deserialize)]
    struct Row {
        id: String,
    }
    serde_json::from_str::<Vec<Row>>(BUILTIN_TERMINAL_AGENTS_JSON)
        .ok()
        .is_some_and(|rows| rows.iter().any(|row| row.id == agent_id))
}

pub fn normalize_stored_agent_config(
    mode: AutomationExecuteMode,
    agent_id: &str,
    config: Option<Value>,
) -> Result<Option<String>> {
    match mode {
        AutomationExecuteMode::Headless | AutomationExecuteMode::Terminal => {
            let parsed = config
                .map(serde_json::from_value::<AutomationAgentRunConfig>)
                .transpose()
                .map_err(|error| {
                    ServiceError::Validation(format!("Invalid terminal agent config: {error}"))
                })?;
            validate_agent_run_config(agent_id, parsed.as_ref())?;
            parsed
                .as_ref()
                .map(serde_json::to_string)
                .transpose()
                .map_err(|error| {
                    ServiceError::Validation(format!(
                        "Failed to serialize automation agent config: {error}"
                    ))
                })
        }
        AutomationExecuteMode::Chat => {
            let mut value = config.unwrap_or_else(|| json!({}));
            if let Some(object) = value.as_object_mut() {
                object.insert("kind".into(), json!("chat"));
                object
                    .entry("provider_id")
                    .or_insert_with(|| json!(agent_id));
                object.insert(
                    "permission_mode".into(),
                    json!(AUTOMATION_CHAT_PERMISSION_MODE),
                );
            }
            let provider_id = value
                .get("provider_id")
                .and_then(|item| item.as_str())
                .unwrap_or(agent_id);
            if !is_known_chat_provider_id(provider_id) {
                return Err(ServiceError::Validation(format!(
                    "Agent `{provider_id}` is not a chat provider."
                )));
            }
            serde_json::to_string(&value).map(Some).map_err(|error| {
                ServiceError::Validation(format!("Failed to serialize chat agent config: {error}"))
            })
        }
    }
}

pub fn run_paths_from_parts(
    run_guid: &str,
    automation_guid: &str,
    run_dir: &str,
    prompt_path: &str,
    result_path: &str,
    run_json_path: &str,
    cwd: &str,
) -> Result<AutomationRunPaths> {
    let definition_dir = artifacts::definition_dir(automation_guid)?;
    Ok(AutomationRunPaths {
        run_guid: run_guid.to_string(),
        automation_guid: automation_guid.to_string(),
        instructions_path: artifacts::instructions_path(automation_guid)?
            .to_string_lossy()
            .to_string(),
        memory_path: artifacts::memory_path(automation_guid)?
            .to_string_lossy()
            .to_string(),
        definition_dir: definition_dir.to_string_lossy().to_string(),
        run_dir: run_dir.to_string(),
        prompt_path: prompt_path.to_string(),
        result_path: result_path.to_string(),
        run_json_path: run_json_path.to_string(),
        skill_path: skill_path()?.to_string_lossy().to_string(),
        cwd: cwd.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_execute_mode_defaults_and_rejects_unknown() {
        assert_eq!(
            AutomationExecuteMode::parse_optional(None).unwrap(),
            AutomationExecuteMode::Headless
        );
        assert_eq!(
            AutomationExecuteMode::parse("terminal").unwrap(),
            AutomationExecuteMode::Terminal
        );
        assert_eq!(
            AutomationExecuteMode::parse("chat").unwrap(),
            AutomationExecuteMode::Chat
        );
        assert!(AutomationExecuteMode::parse("spawn").is_err());
    }

    #[test]
    fn standalone_scope_never_collides_with_group_id() {
        assert_eq!(standalone_scope_id("abc"), "automation:abc");
        assert_eq!(parse_standalone_scope("automation:abc"), Some("abc"));
        assert_eq!(parse_standalone_scope("automation:standalone"), None);
        assert_eq!(parse_standalone_scope("workspace-1"), None);
    }

    #[test]
    fn chat_provider_id_rejects_terminal_only_agents() {
        assert!(is_known_chat_provider_id("claude"));
        assert!(is_known_chat_provider_id("cursor"));
        assert!(is_known_chat_provider_id("grok-build"));
        assert!(is_known_chat_provider_id("droid"));
        assert!(!is_known_chat_provider_id(""));
        assert!(!is_known_chat_provider_id("gemini"));
        assert!(!is_known_chat_provider_id("hermes"));
        assert!(!is_known_chat_provider_id("amp"));
    }

    #[test]
    fn s8_chat_config_stores_kind_and_provider() {
        let stored = normalize_stored_agent_config(
            AutomationExecuteMode::Chat,
            "claude",
            Some(json!({"model": "opus"})),
        )
        .unwrap()
        .unwrap();
        let value: Value = serde_json::from_str(&stored).unwrap();
        assert_eq!(value["kind"], "chat");
        assert_eq!(value["provider_id"], "claude");
        assert_eq!(value["model"], "opus");
        assert_eq!(value["permission_mode"], "yolo");
        let asked = normalize_stored_agent_config(
            AutomationExecuteMode::Chat,
            "claude",
            Some(json!({"permission_mode": "ask_always"})),
        )
        .unwrap()
        .unwrap();
        let asked_value: Value = serde_json::from_str(&asked).unwrap();
        assert_eq!(asked_value["permission_mode"], "yolo");
        assert!(
            normalize_stored_agent_config(AutomationExecuteMode::Chat, "gemini", None,).is_err()
        );
    }

    #[test]
    fn interactive_prompt_points_at_skill_and_cli() {
        let prompt = build_interactive_prompt("Daily health", "auto-1", "run-1", "/tmp/cwd");
        assert!(prompt.contains("atmos-automation/SKILL.md"));
        assert!(prompt.contains("atmos automation paths --run run-1"));
        assert!(prompt.contains("atmos automation complete --run run-1"));
        assert!(prompt.contains("--failed --message"));
        assert!(prompt.contains("Daily health"));
    }
}
