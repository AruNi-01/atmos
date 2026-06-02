use serde::{Deserialize, Serialize};
use std::env;
use std::path::{Path, PathBuf};

use crate::error::{Result, ServiceError};

use super::terminal_agent_manifest;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationAgentCapability {
    pub agent_id: String,
    pub label: String,
    pub installed: bool,
    pub automation_supported: bool,
    pub unavailable_reason: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AutomationCommandInput {
    pub prompt_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct AutomationAgentCommandSpec {
    pub executable: String,
    pub args: Vec<String>,
    pub prompt_strategy: PromptStrategy,
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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PromptStrategy {
    Arg,
    Stdin,
    PromptFlag,
    FileFlag,
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
        }
    }

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
    #[serde(default, rename = "promptStrategy")]
    prompt_strategy: Option<PromptStrategy>,
    #[serde(default, rename = "useEcho")]
    use_echo: bool,
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
    #[serde(default, rename = "promptStrategy")]
    prompt_strategy: Option<PromptStrategy>,
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
    enabled: bool,
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
                unavailable_reason: support.unavailable_reason,
            }
        })
        .collect())
}

pub fn resolve_automation_agent(agent_id: &str) -> Result<AutomationAgentCommandSpec> {
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
    Ok(AutomationAgentCommandSpec {
        executable: support
            .executable_path
            .unwrap_or_else(|| PathBuf::from(&agent.cmd))
            .to_string_lossy()
            .to_string(),
        args: parse_flag_args(&agent.flags)?,
        prompt_strategy: agent.prompt_strategy,
    })
}

pub fn resolve_interactive_automation_agent(agent_id: &str) -> Result<AutomationAgentCommandSpec> {
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
    Ok(AutomationAgentCommandSpec {
        executable: terminal_executable_for_agent(&agent.cmd, support.executable_path.as_deref()),
        args: parse_flag_args(&agent.interactive_flags)?,
        prompt_strategy: agent.prompt_strategy,
    })
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

    for definition in built_ins {
        let override_entry = settings
            .agents
            .iter()
            .find(|entry| entry.id == definition.id);
        let prompt_strategy = override_entry
            .and_then(|entry| entry.prompt_strategy)
            .or(definition.prompt_strategy)
            .unwrap_or_else(|| legacy_prompt_strategy(definition.use_echo));
        let override_flags = override_entry.and_then(|entry| non_empty(&entry.flags));
        let flags = override_flags
            .clone()
            .unwrap_or_else(|| definition.params.clone());
        let interactive_flags = match override_flags {
            Some(value) if value.trim() != definition.params.trim() => value,
            _ => definition
                .interactive_params
                .clone()
                .unwrap_or_else(|| definition.params.clone()),
        };
        resolved.push(ResolvedTerminalAgent {
            id: definition.id,
            label: definition.label,
            cmd: override_entry
                .and_then(|entry| non_empty(&entry.cmd))
                .unwrap_or(definition.cmd),
            flags,
            interactive_flags,
            prompt_strategy,
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
            interactive_flags: entry.flags,
            prompt_strategy: entry.prompt_strategy.unwrap_or(PromptStrategy::Arg),
            enabled: entry.enabled.unwrap_or(true),
        });
    }

    resolved
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
        .join("agent")
        .join("terminal_code_agent.json")
}

fn non_empty(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
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
        paths.extend([
            home.join(".local").join("bin"),
            home.join(".npm-global").join("bin"),
            home.join(".bun").join("bin"),
            home.join(".cargo").join("bin"),
            home.join(".deno").join("bin"),
            home.join(".yarn").join("bin"),
            home.join(".local").join("share").join("pnpm"),
            home.join("Library").join("pnpm"),
            home.join(".atmos").join("bin"),
        ]);
    }
    paths
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

fn parse_flag_args(flags: &str) -> Result<Vec<String>> {
    split_shell_words(flags).map_err(|message| ServiceError::Validation(message))
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
            prompt_path: PathBuf::from("/tmp/atmos automation/prompt.md"),
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
                "--dangerously-bypass-approvals-and-sandbox".to_string()
            ]
        );
        assert_eq!(invocation.prompt_delivery, PromptDelivery::Arg);
        assert_eq!(
            invocation.prompt_path,
            PathBuf::from("/tmp/atmos automation/prompt.md")
        );
    }

    #[test]
    fn s5_built_in_agents_load_from_shared_definition_file() {
        let agents = load_builtin_terminal_agents().unwrap();

        assert!(agents.iter().any(|agent| agent.id == "codex"
            && agent.cmd == "codex"
            && agent.params == "exec --dangerously-bypass-approvals-and-sandbox"
            && agent.prompt_strategy == Some(PromptStrategy::Arg)));
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
                prompt_strategy: Some(PromptStrategy::Arg),
                use_echo: false,
            }],
            TerminalCodeAgentFile {
                agents: vec![
                    TerminalCodeAgentEntry {
                        id: "codex".to_string(),
                        label: "Codex".to_string(),
                        cmd: "custom-codex".to_string(),
                        flags: "--yolo".to_string(),
                        prompt_strategy: None,
                        enabled: Some(false),
                    },
                    TerminalCodeAgentEntry {
                        id: "custom-agent".to_string(),
                        label: "Custom Agent".to_string(),
                        cmd: "custom-agent".to_string(),
                        flags: "--non-interactive".to_string(),
                        prompt_strategy: Some(PromptStrategy::Stdin),
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
        assert_eq!(custom.interactive_flags, "--non-interactive");
        assert_eq!(custom.prompt_strategy, PromptStrategy::Stdin);
    }

    #[test]
    fn s11_fake_supported_agent_uses_structured_args_without_shell_rendering() {
        let invocation = AutomationAgentCommandSpec {
            executable: "fake-agent".to_string(),
            args: vec![
                "--mode".to_string(),
                "safe mode".to_string(),
                "--literal=$(not-run)".to_string(),
            ],
            prompt_strategy: PromptStrategy::Arg,
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
                vec!["--dangerously-skip-permissions", "--print"],
                PromptDelivery::Arg,
            ),
            (
                "codex",
                PromptStrategy::Arg,
                vec!["exec", "--dangerously-bypass-approvals-and-sandbox"],
                PromptDelivery::Arg,
            ),
            (
                "gemini",
                PromptStrategy::PromptFlag,
                vec!["--yolo", "--prompt"],
                PromptDelivery::Arg,
            ),
            (
                "devin",
                PromptStrategy::Arg,
                vec!["--permission-mode", "dangerous", "--print"],
                PromptDelivery::Arg,
            ),
            (
                "amp",
                PromptStrategy::Arg,
                vec!["--dangerously-allow-all", "--execute"],
                PromptDelivery::Arg,
            ),
            (
                "droid",
                PromptStrategy::Arg,
                vec!["exec", "--skip-permissions-unsafe"],
                PromptDelivery::Arg,
            ),
            (
                "opencode",
                PromptStrategy::Arg,
                vec!["run", "--dangerously-skip-permissions"],
                PromptDelivery::Arg,
            ),
            (
                "kimi",
                PromptStrategy::PromptFlag,
                vec!["--print", "-p"],
                PromptDelivery::Arg,
            ),
            (
                "cursor",
                PromptStrategy::Arg,
                vec!["--force", "--print", "--trust"],
                PromptDelivery::Arg,
            ),
            (
                "kilocode",
                PromptStrategy::Arg,
                vec!["run", "--auto"],
                PromptDelivery::Arg,
            ),
            (
                "kiro",
                PromptStrategy::Arg,
                vec!["chat", "--agent", "atmos", "--trust-all-tools"],
                PromptDelivery::Arg,
            ),
            (
                "commandcode",
                PromptStrategy::Arg,
                vec!["--trust", "--yolo", "--skip-onboarding", "--print"],
                PromptDelivery::Arg,
            ),
            (
                "pi",
                PromptStrategy::PromptFlag,
                vec!["-p"],
                PromptDelivery::Arg,
            ),
            (
                "openclaw",
                PromptStrategy::PromptFlag,
                vec!["agent", "--agent", "main", "--local", "--json", "--message"],
                PromptDelivery::Arg,
            ),
            (
                "hermes",
                PromptStrategy::PromptFlag,
                vec!["--yolo", "--accept-hooks", "--oneshot"],
                PromptDelivery::Arg,
            ),
        ];
        let definitions = load_builtin_terminal_agents().unwrap();
        let supported_count = definitions
            .iter()
            .filter(|definition| !definition.params.trim().is_empty())
            .count();
        assert_eq!(cases.len(), supported_count);

        for (agent_id, expected_strategy, expected_args, expected_delivery) in cases {
            let spec = command_spec_for_builtin(&definitions, agent_id);
            let invocation = spec.build_invocation(command_input());

            assert_eq!(spec.prompt_strategy, expected_strategy, "{agent_id}");
            assert_eq!(invocation.prompt_delivery, expected_delivery, "{agent_id}");
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
        assert!(command.contains("\"$(cat '/tmp/atmos automation/prompt.md')\""));
    }

    #[test]
    fn s11_terminal_launch_command_does_not_inject_prompt() {
        let command = codex_spec().build_terminal_launch_command();

        assert_eq!(
            command,
            "'codex' 'exec' '--dangerously-bypass-approvals-and-sandbox'"
        );
    }

    #[test]
    fn s11_interactive_terminal_command_keeps_bare_executable_name() {
        let spec = AutomationAgentCommandSpec {
            executable: terminal_executable_for_agent(
                "cmd",
                Some(Path::new("/opt/homebrew/bin/cmd")),
            ),
            args: vec!["--trust".to_string(), "--yolo".to_string()],
            prompt_strategy: PromptStrategy::Arg,
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

    fn codex_spec() -> AutomationAgentCommandSpec {
        AutomationAgentCommandSpec {
            executable: "codex".to_string(),
            args: vec![
                "exec".to_string(),
                "--dangerously-bypass-approvals-and-sandbox".to_string(),
            ],
            prompt_strategy: PromptStrategy::Arg,
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
            executable: definition.cmd.clone(),
            args: parse_flag_args(&definition.params).unwrap(),
            prompt_strategy: definition
                .prompt_strategy
                .unwrap_or_else(|| legacy_prompt_strategy(definition.use_echo)),
        }
    }
}
