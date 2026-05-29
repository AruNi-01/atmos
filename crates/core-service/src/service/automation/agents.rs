use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use std::env;
use std::fmt::Write as _;
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
    pub final_path: PathBuf,
    pub output_path: PathBuf,
    pub run_json_path: PathBuf,
    pub run_guid: String,
    pub automation_guid: String,
    pub started_at: NaiveDateTime,
    pub run_dir: PathBuf,
    pub tmux_session_name: String,
    pub tmux_window_name: String,
    pub tmux_window_index: u32,
}

#[derive(Debug, Clone)]
pub struct AutomationAgentCommandSpec {
    pub executable: String,
    pub args: Vec<String>,
    pub prompt_strategy: PromptStrategy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PromptStrategy {
    Arg,
    Stdin,
    PromptFlag,
    FileFlag,
}

impl PromptStrategy {
    fn needs_prompt_content(self) -> bool {
        matches!(self, Self::Arg | Self::PromptFlag)
    }
}

impl AutomationAgentCommandSpec {
    pub fn build_command(&self, input: &AutomationCommandInput) -> String {
        build_runner_command(self, input)
    }
}

#[derive(Debug, Clone, Deserialize)]
struct TerminalAgentDefinition {
    id: String,
    label: String,
    cmd: String,
    #[serde(default)]
    params: String,
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
        resolved.push(ResolvedTerminalAgent {
            id: definition.id,
            label: definition.label,
            cmd: override_entry
                .and_then(|entry| non_empty(&entry.cmd))
                .unwrap_or(definition.cmd),
            flags: override_entry
                .and_then(|entry| non_empty(&entry.flags))
                .unwrap_or(definition.params),
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
            flags: entry.flags,
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

fn build_runner_command(
    agent: &AutomationAgentCommandSpec,
    input: &AutomationCommandInput,
) -> String {
    RunnerScriptBuilder::new(agent, input).build()
}

struct RunnerScriptBuilder<'a> {
    agent: &'a AutomationAgentCommandSpec,
    input: &'a AutomationCommandInput,
}

impl<'a> RunnerScriptBuilder<'a> {
    fn new(agent: &'a AutomationAgentCommandSpec, input: &'a AutomationCommandInput) -> Self {
        Self { agent, input }
    }

    fn build(&self) -> String {
        render_runner_script(self.agent, self.input)
    }
}

fn render_runner_script(
    agent: &AutomationAgentCommandSpec,
    input: &AutomationCommandInput,
) -> String {
    let run_guid_json = json_string(&input.run_guid);
    let automation_guid_json = json_string(&input.automation_guid);
    let started_at_json = json_string(&input.started_at.to_string());
    let run_dir_json = json_string(&input.run_dir.to_string_lossy());
    let prompt_path_json = json_string(&input.prompt_path.to_string_lossy());
    let output_path_json = json_string(&input.output_path.to_string_lossy());
    let final_path_json = json_string(&input.final_path.to_string_lossy());
    let run_json_path_json = json_string(&input.run_json_path.to_string_lossy());
    let tmux_session_json = json_string(&input.tmux_session_name);
    let tmux_window_json = json_string(&input.tmux_window_name);

    let mut script = String::new();
    writeln!(script, "bash <<'ATMOS_AUTOMATION_RUNNER'").ok();
    writeln!(script, "set -o pipefail").ok();
    writeln!(script).ok();
    writeln!(script, "PROMPT_FILE={}", shell_quote(&input.prompt_path)).ok();
    writeln!(script, "OUTPUT_FILE={}", shell_quote(&input.output_path)).ok();
    writeln!(script, "FINAL_FILE={}", shell_quote(&input.final_path)).ok();
    writeln!(
        script,
        "RUN_JSON_FILE={}",
        shell_quote(&input.run_json_path)
    )
    .ok();
    writeln!(script).ok();
    writeln!(script, "write_run_json() {{").ok();
    writeln!(script, "  status=\"$1\"").ok();
    writeln!(script, "  exit_code=\"$2\"").ok();
    writeln!(script, "  completed_at=\"$3\"").ok();
    writeln!(script, "  exit_json=\"null\"").ok();
    writeln!(
        script,
        "  if [ -n \"$exit_code\" ]; then exit_json=\"$exit_code\"; fi"
    )
    .ok();
    writeln!(script, "  completed_json=\"null\"").ok();
    writeln!(
        script,
        "  if [ -n \"$completed_at\" ]; then completed_json=\"\\\"$completed_at\\\"\"; fi"
    )
    .ok();
    writeln!(script, "  tmp=\"${{RUN_JSON_FILE}}.tmp\"").ok();
    script.push_str("  printf '{\"run_guid\":%s,\"automation_guid\":%s,\"status\":\"%s\",\"started_at\":%s,\"completed_at\":%s,\"exit_code\":%s,\"run_dir\":%s,\"prompt_path\":%s,\"output_path\":%s,\"result_path\":%s,\"run_json_path\":%s,\"tmux_session_name\":%s,\"tmux_window_name\":%s,\"tmux_window_index\":%s}\\n' \\\n");
    writeln!(
        script,
        "    {} {} \"$status\" {} \"$completed_json\" \"$exit_json\" {} {} {} {} {} {} {} '{}' > \"$tmp\"",
        shell_quote_str(&run_guid_json),
        shell_quote_str(&automation_guid_json),
        shell_quote_str(&started_at_json),
        shell_quote_str(&run_dir_json),
        shell_quote_str(&prompt_path_json),
        shell_quote_str(&output_path_json),
        shell_quote_str(&final_path_json),
        shell_quote_str(&run_json_path_json),
        shell_quote_str(&tmux_session_json),
        shell_quote_str(&tmux_window_json),
        input.tmux_window_index
    )
    .ok();
    writeln!(script, "  mv \"$tmp\" \"$RUN_JSON_FILE\"").ok();
    writeln!(script, "}}").ok();
    writeln!(script).ok();
    writeln!(
        script,
        "trap 'completed_at=$(date -u +\"%Y-%m-%dT%H:%M:%SZ\"); write_run_json cancelled 130 \"$completed_at\"; exit 130' INT TERM"
    )
    .ok();
    writeln!(script).ok();
    writeln!(script, ": > \"$OUTPUT_FILE\"").ok();
    writeln!(script, ": > \"$FINAL_FILE\"").ok();
    writeln!(script, "write_run_json running \"\" \"\"").ok();
    writeln!(
        script,
        "echo \"Atmos automation run started: {}\"",
        input.run_guid
    )
    .ok();
    if agent.prompt_strategy.needs_prompt_content() {
        writeln!(script, "prompt_content=\"\"").ok();
        writeln!(
            script,
            "IFS= read -r -d '' prompt_content < \"$PROMPT_FILE\" || true"
        )
        .ok();
    }
    writeln!(script, "(").ok();
    writeln!(script, "  {}", agent_invocation(agent)).ok();
    writeln!(
        script,
        ") 2>&1 | tee \"$OUTPUT_FILE\" | tee \"$FINAL_FILE\""
    )
    .ok();
    writeln!(script, "exit_code=${{PIPESTATUS[0]}}").ok();
    writeln!(script, "completed_at=$(date -u +\"%Y-%m-%dT%H:%M:%SZ\")").ok();
    writeln!(script, "if [ \"$exit_code\" -eq 0 ]; then").ok();
    writeln!(
        script,
        "  write_run_json completed \"$exit_code\" \"$completed_at\""
    )
    .ok();
    writeln!(script, "else").ok();
    writeln!(
        script,
        "  write_run_json failed \"$exit_code\" \"$completed_at\""
    )
    .ok();
    writeln!(script, "fi").ok();
    writeln!(script, "exit \"$exit_code\"").ok();
    writeln!(script, "ATMOS_AUTOMATION_RUNNER").ok();
    script
}

fn agent_invocation(agent: &AutomationAgentCommandSpec) -> String {
    let mut parts = Vec::with_capacity(agent.args.len() + 3);
    parts.push(shell_quote_str(agent.executable.trim()));
    parts.extend(agent.args.iter().map(|arg| shell_quote_str(arg)));

    match agent.prompt_strategy {
        PromptStrategy::Arg | PromptStrategy::PromptFlag => {
            parts.push("\"$prompt_content\"".to_string());
        }
        PromptStrategy::Stdin => {
            parts.push("< \"$PROMPT_FILE\"".to_string());
        }
        PromptStrategy::FileFlag => {
            parts.push("\"$PROMPT_FILE\"".to_string());
        }
    }

    parts.join(" ")
}

fn shell_quote(path: &Path) -> String {
    shell_quote_str(&path.to_string_lossy())
}

fn shell_quote_str(raw: &str) -> String {
    format!("'{}'", raw.replace('\'', "'\\''"))
}

fn json_string(value: impl AsRef<str>) -> String {
    serde_json::to_string(value.as_ref()).unwrap_or_else(|_| "\"\"".to_string())
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;

    use super::*;

    fn command_input() -> AutomationCommandInput {
        AutomationCommandInput {
            prompt_path: PathBuf::from("/tmp/atmos automation/prompt.md"),
            final_path: PathBuf::from("/tmp/atmos automation/final.md"),
            output_path: PathBuf::from("/tmp/atmos automation/output.log"),
            run_json_path: PathBuf::from("/tmp/atmos automation/run.json"),
            run_guid: "run-123".to_string(),
            automation_guid: "automation-123".to_string(),
            started_at: NaiveDate::from_ymd_opt(2026, 5, 26)
                .unwrap()
                .and_hms_opt(8, 0, 0)
                .unwrap(),
            run_dir: PathBuf::from("/tmp/atmos automation"),
            tmux_session_name: "automations".to_string(),
            tmux_window_name: "automation-run-123".to_string(),
            tmux_window_index: 3,
        }
    }

    #[test]
    fn s11_runner_wrapper_declares_minimal_required_artifacts() {
        let command = codex_spec().build_command(&command_input());

        assert!(command.contains("PROMPT_FILE="));
        assert!(command.contains("OUTPUT_FILE="));
        assert!(command.contains("FINAL_FILE="));
        assert!(command.contains("RUN_JSON_FILE="));
        assert!(command.contains("write_run_json completed"));
        assert!(command.contains("write_run_json failed"));
    }

    #[test]
    fn s11_runner_wrapper_quotes_paths_with_spaces() {
        let command = codex_spec().build_command(&command_input());

        assert!(command.contains("'/tmp/atmos automation/prompt.md'"));
        assert!(command.contains("'/tmp/atmos automation/output.log'"));
        assert!(command.contains("'/tmp/atmos automation/final.md'"));
    }

    #[test]
    fn s5_built_in_agents_load_from_shared_definition_file() {
        let agents = load_builtin_terminal_agents().unwrap();

        assert!(agents.iter().any(|agent| agent.id == "codex"
            && agent.cmd == "codex"
            && agent.params == "--dangerously-bypass-approvals-and-sandbox"
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
        assert!(!codex.enabled);

        let custom = agents
            .iter()
            .find(|agent| agent.id == "custom-agent")
            .unwrap();
        assert_eq!(custom.label, "Custom Agent");
        assert_eq!(custom.flags, "--non-interactive");
        assert_eq!(custom.prompt_strategy, PromptStrategy::Stdin);
    }

    #[test]
    fn s11_fake_supported_agent_uses_structured_args_and_prompt_content_loader() {
        let command = AutomationAgentCommandSpec {
            executable: "fake-agent".to_string(),
            args: vec![
                "--mode".to_string(),
                "safe mode".to_string(),
                "--literal=$(not-run)".to_string(),
            ],
            prompt_strategy: PromptStrategy::Arg,
        }
        .build_command(&command_input());

        assert!(command.contains("IFS= read -r -d '' prompt_content < \"$PROMPT_FILE\" || true"));
        assert!(command.contains(
            "'fake-agent' '--mode' 'safe mode' '--literal=$(not-run)' \"$prompt_content\""
        ));
        assert!(!command.contains("$(cat \"$PROMPT_FILE\")"));
        assert!(!command.contains("cat \"$PROMPT_FILE\" |"));
    }

    #[test]
    fn s11_supported_builtin_agent_commands_use_declared_prompt_strategies() {
        let cases = [
            (
                "claude",
                PromptStrategy::Arg,
                "'claude' '--dangerously-skip-permissions' \"$prompt_content\"",
            ),
            (
                "codex",
                PromptStrategy::Arg,
                "'codex' '--dangerously-bypass-approvals-and-sandbox' \"$prompt_content\"",
            ),
            (
                "gemini",
                PromptStrategy::Arg,
                "'gemini' '--yolo' \"$prompt_content\"",
            ),
            (
                "devin",
                PromptStrategy::Arg,
                "'devin' '--permission-mode' 'bypass' '--' \"$prompt_content\"",
            ),
            (
                "amp",
                PromptStrategy::Stdin,
                "'amp' '--dangerously-allow-all' < \"$PROMPT_FILE\"",
            ),
            (
                "droid",
                PromptStrategy::Arg,
                "'droid' 'exec' '--skip-permissions-unsafe' \"$prompt_content\"",
            ),
            (
                "opencode",
                PromptStrategy::PromptFlag,
                "'opencode' '--prompt' \"$prompt_content\"",
            ),
            (
                "kimi",
                PromptStrategy::PromptFlag,
                "'kimi' '--print' '-p' \"$prompt_content\"",
            ),
            (
                "cursor",
                PromptStrategy::Arg,
                "'agent' '--force' \"$prompt_content\"",
            ),
            (
                "kilocode",
                PromptStrategy::Arg,
                "'kilo' 'run' '--auto' '--dangerously-skip-permissions' \"$prompt_content\"",
            ),
            (
                "kiro",
                PromptStrategy::Arg,
                "'kiro-cli' 'chat' '--agent' 'atmos' '--trust-all-tools' \"$prompt_content\"",
            ),
            (
                "commandcode",
                PromptStrategy::Arg,
                "'cmd' '--trust' '--yolo' \"$prompt_content\"",
            ),
        ];
        let definitions = load_builtin_terminal_agents().unwrap();
        let supported_count = definitions
            .iter()
            .filter(|definition| !definition.params.trim().is_empty())
            .count();
        assert_eq!(cases.len(), supported_count);

        for (agent_id, expected_strategy, expected_invocation) in cases {
            let spec = command_spec_for_builtin(&definitions, agent_id);
            let command = spec.build_command(&command_input());

            assert_eq!(spec.prompt_strategy, expected_strategy, "{agent_id}");
            assert!(
                command.contains(expected_invocation),
                "missing expected invocation for {agent_id}:\n{command}"
            );
            assert!(
                !command.contains("$(cat \"$PROMPT_FILE\")"),
                "{agent_id} still uses command substitution"
            );
            assert!(
                !command.contains("cat \"$PROMPT_FILE\" |"),
                "{agent_id} still uses a raw cat pipe"
            );
        }
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
            args: vec!["--dangerously-bypass-approvals-and-sandbox".to_string()],
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
