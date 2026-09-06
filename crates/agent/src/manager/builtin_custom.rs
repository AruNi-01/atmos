//! Built-in custom ACP agents that are not in the public ACP registry.
//!
//! These always appear in `list_custom_agents`. Chat spawn and catalog probe
//! only run after the Custom tab switch is on (`enabled`). User overlays (env,
//! argv, default_config, enabled) live in the install manifest under the same id.
//! DeepSeek's API token is stored in `~/.atmos/data/quota-usage/provider_config.json`
//! and injected as `DEEPSEEK_API_KEY` at spawn; overlay env is only a fallback.

use std::collections::HashMap;
use std::process::Stdio;
use std::time::Duration;

use tokio::io::copy;
use tokio::process::Command;
use tokio::time::timeout;

use super::manifest::CustomAgentEntry;
use super::{AgentError, Result};
use crate::models::{AgentLaunchSpec, CustomAgent};

pub const DEEPSEEK_HARNESS_ID: &str = "deepseek-harness";
pub const DEEPSEEK_API_KEY_ENV: &str = "DEEPSEEK_API_KEY";

const DEEPSEEK_HARNESS_PACKAGE: &str = "@deepseek-ai/dsh@0.1.2-alpha.5";
const PRELOAD_TIMEOUT: Duration = Duration::from_secs(180);

struct BuiltinCustomSpec {
    id: &'static str,
    display_name: &'static str,
    description: &'static str,
    command: &'static str,
    args: &'static [&'static str],
}

const BUILTINS: &[BuiltinCustomSpec] = &[BuiltinCustomSpec {
    id: DEEPSEEK_HARNESS_ID,
    display_name: "DeepSeek Harness",
    description: "DeepSeek coding agent over ACP stdio (`dsh --profile acp`).",
    command: "npx",
    args: &["-y", DEEPSEEK_HARNESS_PACKAGE, "--profile", "acp"],
}];

pub fn is_builtin_custom_agent_id(id: &str) -> bool {
    BUILTINS.iter().any(|spec| spec.id == id)
}

pub fn builtin_custom_entry(id: &str) -> Option<CustomAgentEntry> {
    BUILTINS
        .iter()
        .find(|spec| spec.id == id)
        .map(|spec| spec.entry())
}

/// Built-ins are off until the Custom overlay records `enabled: true`.
pub fn is_builtin_custom_enabled(overlay: Option<&CustomAgentEntry>) -> bool {
    overlay.and_then(|entry| entry.enabled).unwrap_or(false)
}

pub fn merge_builtin_custom_agents(stored: &HashMap<String, CustomAgentEntry>) -> Vec<CustomAgent> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for spec in BUILTINS {
        seen.insert(spec.id.to_string());
        out.push(spec.to_custom_agent(stored.get(spec.id)));
    }
    let mut rest: Vec<CustomAgent> = stored
        .iter()
        .filter(|(name, _)| !seen.contains(*name))
        .map(|(name, entry)| custom_from_stored(name, entry))
        .collect();
    rest.sort_by_key(|agent| agent.name.to_lowercase());
    out.extend(rest);
    out
}

pub fn builtin_custom_launch_spec(
    id: &str,
    overlay: Option<&CustomAgentEntry>,
) -> Option<AgentLaunchSpec> {
    let spec = BUILTINS.iter().find(|item| item.id == id)?;
    let default_args = spec.args_vec();
    let command = overlay
        .map(|entry| entry.command.as_str())
        .filter(|command| !command.trim().is_empty())
        .unwrap_or(spec.command);
    let args = overlay
        .map(|entry| entry.args.as_slice())
        .filter(|args| !args.is_empty())
        .unwrap_or(default_args.as_slice());
    Some(launch_spec_from_parts(
        command,
        args,
        overlay
            .map(|entry| entry.env.clone())
            .filter(|env| !env.is_empty()),
    ))
}

/// Warm the npx cache (`--help` exits after download). Do not leave ACP running.
pub fn builtin_custom_preload_spec(id: &str) -> Option<AgentLaunchSpec> {
    let spec = BUILTINS.iter().find(|item| item.id == id)?;
    Some(launch_spec_from_parts(
        spec.command,
        &spec.preload_args_vec(),
        None,
    ))
}

pub async fn preload_builtin_custom_agent(id: &str) -> Result<()> {
    let spec = builtin_custom_preload_spec(id)
        .ok_or_else(|| AgentError::NotFound(format!("builtin custom agent: {id}")))?;
    let mut cmd = Command::new(&spec.program);
    cmd.args(&spec.args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = cmd
        .spawn()
        .map_err(|error| AgentError::Command(format!("failed to preload {id}: {error}")))?;

    if let Some(mut stdout) = child.stdout.take() {
        tokio::spawn(async move {
            let mut sink = tokio::io::sink();
            let _ = copy(&mut stdout, &mut sink).await;
        });
    }
    if let Some(mut stderr) = child.stderr.take() {
        tokio::spawn(async move {
            let mut sink = tokio::io::sink();
            let _ = copy(&mut stderr, &mut sink).await;
        });
    }

    match timeout(PRELOAD_TIMEOUT, child.wait()).await {
        Ok(Ok(_)) => Ok(()),
        Ok(Err(error)) => Err(AgentError::Command(format!("preload failed: {error}"))),
        Err(_) => {
            let _ = child.kill().await;
            Err(AgentError::Command(format!(
                "preload timed out after {}s",
                PRELOAD_TIMEOUT.as_secs()
            )))
        }
    }
}

pub fn looks_like_missing_llm_api_key(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("deepseek_api_key")
        || lower.contains("no api key for provider route")
        || (lower.contains("api key") && lower.contains("deepseek"))
}

impl BuiltinCustomSpec {
    fn args_vec(&self) -> Vec<String> {
        self.args.iter().map(|item| (*item).to_string()).collect()
    }

    fn preload_args_vec(&self) -> Vec<String> {
        // Same launch as ACP, plus --help so dsh downloads then exits (no ACP stdio).
        let mut args = self.args_vec();
        args.push("--help".to_string());
        args
    }

    fn entry(&self) -> CustomAgentEntry {
        CustomAgentEntry {
            agent_type: "custom".to_string(),
            command: self.command.to_string(),
            args: self.args_vec(),
            env: HashMap::new(),
            default_config: None,
            enabled: None,
        }
    }

    fn to_custom_agent(&self, overlay: Option<&CustomAgentEntry>) -> CustomAgent {
        let command = overlay
            .map(|entry| entry.command.clone())
            .filter(|command| !command.trim().is_empty())
            .unwrap_or_else(|| self.command.to_string());
        let args = overlay
            .map(|entry| entry.args.clone())
            .filter(|args| !args.is_empty())
            .unwrap_or_else(|| self.args_vec());
        let env = overlay.map(|entry| entry.env.clone()).unwrap_or_default();
        CustomAgent {
            name: self.id.to_string(),
            agent_type: overlay
                .map(|entry| entry.agent_type.clone())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "custom".to_string()),
            command,
            args,
            env,
            default_config: overlay.and_then(|entry| entry.default_config.clone()),
            display_name: Some(self.display_name.to_string()),
            description: Some(self.description.to_string()),
            builtin: true,
            has_overlay: overlay.is_some(),
            enabled: is_builtin_custom_enabled(overlay),
        }
    }
}

fn custom_from_stored(name: &str, entry: &CustomAgentEntry) -> CustomAgent {
    CustomAgent {
        name: name.to_string(),
        agent_type: entry.agent_type.clone(),
        command: entry.command.clone(),
        args: entry.args.clone(),
        env: entry.env.clone(),
        default_config: entry.default_config.clone(),
        display_name: None,
        description: None,
        builtin: false,
        has_overlay: true,
        enabled: entry.enabled.unwrap_or(true),
    }
}

fn launch_spec_from_parts(
    command: &str,
    args: &[String],
    env: Option<HashMap<String, String>>,
) -> AgentLaunchSpec {
    let program = if let Some(rest) = command.strip_prefix("~/") {
        dirs::home_dir()
            .map(|home| home.join(rest).to_string_lossy().to_string())
            .unwrap_or_else(|| command.to_string())
    } else {
        command.to_string()
    };
    AgentLaunchSpec {
        program,
        args: args.to_vec(),
        env,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn overlay_entry(enabled: Option<bool>) -> CustomAgentEntry {
        CustomAgentEntry {
            agent_type: "custom".into(),
            command: "npx".into(),
            args: vec![
                "-y".into(),
                DEEPSEEK_HARNESS_PACKAGE.into(),
                "--profile".into(),
                "acp".into(),
            ],
            env: HashMap::new(),
            default_config: None,
            enabled,
        }
    }

    #[test]
    fn lists_deepseek_harness_disabled_without_manifest_overlay() {
        let agents = merge_builtin_custom_agents(&HashMap::new());
        let harness = agents
            .iter()
            .find(|agent| agent.name == DEEPSEEK_HARNESS_ID)
            .expect("builtin");
        assert!(harness.builtin);
        assert!(!harness.has_overlay);
        assert!(!harness.enabled);
        assert_eq!(harness.display_name.as_deref(), Some("DeepSeek Harness"));
        assert_eq!(harness.command, "npx");
        assert!(harness
            .args
            .iter()
            .any(|arg| arg.contains("@deepseek-ai/dsh@")));
        assert!(harness.args.iter().any(|arg| arg == "--profile"));
        assert!(harness.args.iter().any(|arg| arg == "acp"));
    }

    #[test]
    fn overlay_enabled_true_turns_builtin_on() {
        let mut stored = HashMap::new();
        stored.insert(DEEPSEEK_HARNESS_ID.into(), overlay_entry(Some(true)));
        let harness = merge_builtin_custom_agents(&stored)
            .into_iter()
            .find(|agent| agent.name == DEEPSEEK_HARNESS_ID)
            .expect("builtin");
        assert!(harness.enabled);
        assert!(harness.has_overlay);
        assert!(is_builtin_custom_enabled(stored.get(DEEPSEEK_HARNESS_ID)));
    }

    #[test]
    fn overlay_enabled_false_keeps_builtin_off() {
        let overlay = overlay_entry(Some(false));
        assert!(!is_builtin_custom_enabled(Some(&overlay)));
        let mut stored = HashMap::new();
        stored.insert(DEEPSEEK_HARNESS_ID.into(), overlay);
        let harness = merge_builtin_custom_agents(&stored)
            .into_iter()
            .find(|agent| agent.name == DEEPSEEK_HARNESS_ID)
            .expect("builtin");
        assert!(!harness.enabled);
    }

    #[test]
    fn overlay_env_wins_on_launch_spec() {
        let mut env = HashMap::new();
        env.insert(DEEPSEEK_API_KEY_ENV.to_string(), "sk-test".to_string());
        let overlay = CustomAgentEntry {
            agent_type: "custom".into(),
            command: "npx".into(),
            args: vec![
                "-y".into(),
                DEEPSEEK_HARNESS_PACKAGE.into(),
                "--profile".into(),
                "acp".into(),
            ],
            env,
            default_config: None,
            enabled: Some(true),
        };
        let spec = builtin_custom_launch_spec(DEEPSEEK_HARNESS_ID, Some(&overlay)).unwrap();
        assert_eq!(
            spec.env
                .as_ref()
                .and_then(|map| map.get(DEEPSEEK_API_KEY_ENV))
                .map(String::as_str),
            Some("sk-test")
        );
    }

    #[test]
    fn missing_key_error_matches_dsh_prompt_failure() {
        let message = r#"Internal error: turn failed: llm-deepseek: no API key for provider route "deepseek-official"; store DEEPSEEK_API_KEY through the credentials service"#;
        assert!(looks_like_missing_llm_api_key(message));
        assert!(!looks_like_missing_llm_api_key("permission denied"));
    }

    #[test]
    fn user_custom_agents_stay_after_builtins() {
        let mut stored = HashMap::new();
        stored.insert(
            "my-kiro".into(),
            CustomAgentEntry {
                agent_type: "custom".into(),
                command: "kiro-cli".into(),
                args: vec!["acp".into()],
                env: HashMap::new(),
                default_config: None,
                enabled: None,
            },
        );
        let agents = merge_builtin_custom_agents(&stored);
        assert_eq!(agents[0].name, DEEPSEEK_HARNESS_ID);
        assert!(!agents[0].enabled);
        let kiro = agents
            .iter()
            .find(|agent| agent.name == "my-kiro")
            .expect("user custom");
        assert!(!kiro.builtin);
        assert!(kiro.enabled);
    }

    #[test]
    fn empty_overlay_command_falls_back_to_builtin_argv() {
        let spec = builtin_custom_launch_spec(
            DEEPSEEK_HARNESS_ID,
            Some(&CustomAgentEntry {
                agent_type: "custom".into(),
                command: String::new(),
                args: Vec::new(),
                env: HashMap::new(),
                default_config: None,
                enabled: None,
            }),
        )
        .unwrap();
        assert_eq!(spec.program, "npx");
        assert!(spec
            .args
            .iter()
            .any(|arg| arg.contains("@deepseek-ai/dsh@")));
    }

    #[test]
    fn preload_spec_downloads_then_exits() {
        let spec = builtin_custom_preload_spec(DEEPSEEK_HARNESS_ID).unwrap();
        assert_eq!(spec.program, "npx");
        assert_eq!(
            spec.args,
            vec![
                "-y".to_string(),
                DEEPSEEK_HARNESS_PACKAGE.to_string(),
                "--profile".to_string(),
                "acp".to_string(),
                "--help".to_string()
            ]
        );
        assert!(spec.args.iter().any(|arg| arg == "--profile"));
        assert_eq!(spec.args.last().map(String::as_str), Some("--help"));
    }
}
