//! Chat argv override for `provider_id = "claude"`. Ignores Terminal catalog params.

use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};
use tokio::time::timeout;

use crate::contract::{AgentProviderError, AgentResult, AgentRuntimeConfig};

const EFFORT_LEVELS: &[&str] = &["low", "medium", "high", "xhigh", "max"];

pub(crate) struct SpawnedClaude {
    pub child: Child,
    pub stdin: ChildStdin,
    pub stdout: ChildStdout,
    pub stderr: ChildStderr,
}

pub(crate) fn chat_args(
    cfg: &AgentRuntimeConfig,
    resume: Option<&str>,
    fork_session: bool,
) -> Vec<String> {
    // Piped stdout is already non-TTY, so duplex stream-json works without `--print`
    // even though `--help` says those flags "only work with --print". Live 2.1.252
    // confirmed both argv shapes emit NDJSON. `--replay-user-messages` is required
    // to echo the user transcript `uuid` used as rewind checkpoint_id.
    let mut args = vec![
        "--output-format".into(),
        "stream-json".into(),
        "--verbose".into(),
        "--input-format".into(),
        "stream-json".into(),
        "--include-partial-messages".into(),
        "--replay-user-messages".into(),
        "--permission-prompt-tool".into(),
        "stdio".into(),
    ];
    if let Some(model) = cfg.model.as_deref().filter(|model| !model.is_empty()) {
        args.push("--model".into());
        args.push(model.to_string());
    }
    if let Some(effort) = cfg
        .thinking
        .as_deref()
        .filter(|value| EFFORT_LEVELS.contains(value))
    {
        args.push("--effort".into());
        args.push(effort.to_string());
    }
    if let Some(mode) = crate::policy::vendor_permission_for_spawn(
        "claude",
        cfg.mode.as_deref(),
        cfg.permission_mode.as_deref(),
    ) {
        args.push("--permission-mode".into());
        args.push(mode);
    }
    // SDK Fast requires opt-in via settings; without it initialize reports
    // `fast_mode_disabled_reason: sdk_opt_in_required` and toggles stay inert.
    args.push("--settings".into());
    args.push(r#"{"fastMode":true}"#.into());
    if let Some(session_id) = resume.filter(|id| !id.is_empty()) {
        args.push(format!("--resume={session_id}"));
    }
    if fork_session {
        args.push("--fork-session".into());
    }
    args
}

pub(crate) fn help_supports_input_format(help: &str) -> bool {
    help.contains("--input-format")
}

pub(crate) fn too_old_error() -> AgentProviderError {
    AgentProviderError::message(
        "Claude Code too old: --help lacks --input-format; Chat requires stream-json duplex",
    )
}

pub(crate) async fn probe_input_format_support(
    program: &Path,
    env_overrides: Option<&HashMap<String, String>>,
) -> AgentResult<()> {
    let mut cmd = Command::new(program);
    cmd.arg("--help")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if let Some(env) = env_overrides {
        apply_env(&mut cmd, env);
    }
    let output = timeout(Duration::from_secs(15), cmd.output())
        .await
        .map_err(|_| AgentProviderError::message("Claude Code --help timed out"))?
        .map_err(|error| {
            AgentProviderError::message(format!("failed to run claude --help: {error}"))
        })?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    if help_supports_input_format(&text) {
        Ok(())
    } else {
        Err(too_old_error())
    }
}

pub(crate) async fn spawn_claude(
    program: &Path,
    cfg: &AgentRuntimeConfig,
    resume: Option<&str>,
    fork_session: bool,
) -> AgentResult<SpawnedClaude> {
    probe_input_format_support(program, cfg.env_overrides.as_ref()).await?;
    let args = chat_args(cfg, resume, fork_session);
    debug_assert!(
        !args.iter().any(|arg| arg == "--print" || arg == "-p"),
        "Chat spawn must not use --print"
    );
    debug_assert!(
        !args
            .iter()
            .any(|arg| arg == "--dangerously-skip-permissions"),
        "Chat spawn must not copy Terminal yoloParams"
    );

    let mut cmd = Command::new(program);
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if cfg.cwd.exists() {
        cmd.current_dir(&cfg.cwd);
    }
    if let Some(overrides) = &cfg.env_overrides {
        apply_env(&mut cmd, overrides);
    }
    cmd.env("CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING", "1");

    let mut child = cmd
        .spawn()
        .map_err(|error| AgentProviderError::message(format!("failed to spawn claude: {error}")))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| AgentProviderError::message("claude stdin not available"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AgentProviderError::message("claude stdout not available"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AgentProviderError::message("claude stderr not available"))?;
    Ok(SpawnedClaude {
        child,
        stdin,
        stdout,
        stderr,
    })
}

fn apply_env(cmd: &mut Command, env: &HashMap<String, String>) {
    for (key, value) in env {
        cmd.env(key, value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn cfg() -> AgentRuntimeConfig {
        AgentRuntimeConfig {
            cwd: PathBuf::from("/tmp"),
            ..AgentRuntimeConfig::default()
        }
    }

    #[test]
    fn chat_args_are_duplex_stream_json_without_print() {
        let args = chat_args(&cfg(), None, false);
        assert_eq!(
            args,
            vec![
                "--output-format",
                "stream-json",
                "--verbose",
                "--input-format",
                "stream-json",
                "--include-partial-messages",
                "--replay-user-messages",
                "--permission-prompt-tool",
                "stdio",
                "--settings",
                r#"{"fastMode":true}"#,
            ]
        );
        assert!(!args.iter().any(|arg| arg == "--print" || arg == "-p"));
        assert!(!args
            .iter()
            .any(|arg| arg == "--dangerously-skip-permissions"));
        assert!(!args.iter().any(|arg| {
            !arg.starts_with('-')
                && arg != "stream-json"
                && arg != "stdio"
                && arg != r#"{"fastMode":true}"#
        }));
    }

    #[test]
    fn resume_uses_equals_form() {
        let args = chat_args(&cfg(), Some("ses_abc123"), false);
        assert!(args.iter().any(|arg| arg == "--resume=ses_abc123"));
        assert!(!args.iter().any(|arg| arg == "--resume"));
    }

    #[test]
    fn model_effort_and_permission_mode_from_current_config() {
        let mut cfg = cfg();
        cfg.model = Some("opus".into());
        cfg.thinking = Some("high".into());
        cfg.permission_mode = Some("ask_always".into());
        let args = chat_args(&cfg, None, false);
        assert!(args.windows(2).any(|pair| pair == ["--model", "opus"]));
        assert!(args.windows(2).any(|pair| pair == ["--effort", "high"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--permission-mode", "default"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--settings", r#"{"fastMode":true}"#]));
    }

    #[test]
    fn permission_mode_wins_over_mode_alias() {
        let mut cfg = cfg();
        cfg.mode = Some("acceptEdits".into());
        cfg.permission_mode = Some("ask_always".into());
        let args = chat_args(&cfg, None, false);
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--permission-mode", "default"]));
        assert!(!args
            .windows(2)
            .any(|pair| pair == ["--permission-mode", "acceptEdits"]));
    }

    #[test]
    fn plan_mode_overrides_atmos_permission_on_spawn() {
        let mut cfg = cfg();
        cfg.mode = Some("plan".into());
        cfg.permission_mode = Some("yolo".into());
        let args = chat_args(&cfg, None, false);
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--permission-mode", "plan"]));
    }

    #[test]
    fn fork_session_flag_and_resume() {
        let args = chat_args(&cfg(), Some("ses_parent"), true);
        assert!(args.iter().any(|arg| arg == "--resume=ses_parent"));
        assert!(args.iter().any(|arg| arg == "--fork-session"));
        let no_fork = chat_args(&cfg(), Some("ses_parent"), false);
        assert!(!no_fork.iter().any(|arg| arg == "--fork-session"));
    }

    #[test]
    fn numeric_thinking_does_not_become_effort_or_token_flag_on_spawn() {
        let mut cfg = cfg();
        cfg.thinking = Some("8000".into());
        let args = chat_args(&cfg, None, false);
        assert!(!args.iter().any(|arg| arg == "--effort"));
        assert!(!args.iter().any(|arg| arg == "--max-thinking-tokens"));
    }

    #[test]
    fn help_without_input_format_is_too_old() {
        assert!(help_supports_input_format(
            "Usage: claude\n  --input-format FORMAT\n"
        ));
        assert!(!help_supports_input_format(
            "Usage: claude -p --output-format"
        ));
        let error = too_old_error().to_string();
        assert!(error.contains("Claude Code too old"));
        assert!(!error.to_ascii_lowercase().contains("acp"));
        assert!(!error.contains("--print"));
    }
}
