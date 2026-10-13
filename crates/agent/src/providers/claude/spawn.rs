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

const TRANSIENT_SPAWN_ATTEMPTS: u32 = 8;

fn is_transient_os_error(code: i32) -> bool {
    // Named libc errnos, not Linux numbers. Darwin EAGAIN is 35 (Linux 11);
    // Darwin EDEADLK is 11 (Linux 35) and must not retry.
    [
        libc::EINTR,
        libc::EAGAIN,
        libc::EWOULDBLOCK,
        libc::ENFILE,
        libc::EMFILE,
        libc::ETXTBSY,
    ]
    .contains(&code)
}

fn is_transient_spawn(error: &std::io::Error) -> bool {
    error.raw_os_error().is_some_and(is_transient_os_error)
}

async fn retry_transient_spawn<T, F, Fut>(mut op: F) -> std::io::Result<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = std::io::Result<T>>,
{
    let mut last = None;
    for attempt in 0..TRANSIENT_SPAWN_ATTEMPTS {
        match op().await {
            Ok(value) => return Ok(value),
            Err(error) if is_transient_spawn(&error) && attempt + 1 < TRANSIENT_SPAWN_ATTEMPTS => {
                last = Some(error);
                tokio::time::sleep(Duration::from_millis(10 * u64::from(attempt + 1))).await;
            }
            Err(error) => return Err(error),
        }
    }
    Err(last.expect("transient retry keeps last error"))
}

pub(crate) async fn probe_input_format_support(
    program: &Path,
    env_overrides: Option<&HashMap<String, String>>,
) -> AgentResult<()> {
    let output = timeout(
        Duration::from_secs(15),
        retry_transient_spawn(|| {
            let mut cmd = Command::new(program);
            cmd.arg("--help")
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .kill_on_drop(true);
            if let Some(env) = env_overrides {
                apply_env(&mut cmd, env);
            }
            cmd.output()
        }),
    )
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

    let mut child = retry_transient_spawn(|| {
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
        async move { cmd.spawn() }
    })
    .await
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
    use std::os::unix::fs::PermissionsExt;
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

    #[test]
    fn transient_spawn_uses_named_errnos_not_linux_numbers() {
        assert!(is_transient_os_error(libc::EINTR));
        assert!(is_transient_os_error(libc::EAGAIN));
        assert!(is_transient_os_error(libc::EWOULDBLOCK));
        assert!(is_transient_os_error(libc::ENFILE));
        assert!(is_transient_os_error(libc::EMFILE));
        assert!(is_transient_os_error(libc::ETXTBSY));
        assert!(!is_transient_os_error(libc::EDEADLK));
        assert!(!is_transient_os_error(libc::ENOENT));
        assert_ne!(libc::EAGAIN, libc::EDEADLK);
        assert!(is_transient_spawn(&std::io::Error::from_raw_os_error(
            libc::EAGAIN
        )));
        assert!(!is_transient_spawn(&std::io::Error::from_raw_os_error(
            libc::EDEADLK
        )));
        if cfg!(target_os = "macos") {
            assert_eq!(libc::EAGAIN, 35);
            assert_eq!(libc::EDEADLK, 11);
            assert!(is_transient_os_error(35));
            assert!(!is_transient_os_error(11));
        }
        if cfg!(target_os = "linux") {
            assert_eq!(libc::EAGAIN, 11);
            assert_eq!(libc::EDEADLK, 35);
            assert!(is_transient_os_error(11));
            assert!(!is_transient_os_error(35));
        }
    }

    #[tokio::test]
    async fn retry_transient_spawn_retries_eagain_then_succeeds() {
        let attempts = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0));
        let value = retry_transient_spawn({
            let attempts = attempts.clone();
            move || {
                let n = attempts.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                async move {
                    if n == 0 {
                        Err(std::io::Error::from_raw_os_error(libc::EAGAIN))
                    } else {
                        Ok("ok")
                    }
                }
            }
        })
        .await
        .expect("EAGAIN should retry");
        assert_eq!(value, "ok");
        assert_eq!(attempts.load(std::sync::atomic::Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn retry_transient_spawn_does_not_retry_edeadlk() {
        let attempts = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0));
        let error = retry_transient_spawn({
            let attempts = attempts.clone();
            move || {
                attempts.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                async { Err::<(), _>(std::io::Error::from_raw_os_error(libc::EDEADLK)) }
            }
        })
        .await
        .expect_err("EDEADLK must not retry");
        assert_eq!(error.raw_os_error(), Some(libc::EDEADLK));
        assert_eq!(attempts.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    fn write_help_script(contents: &str) -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().expect("tempdir");
        let program = dir.path().join("claude");
        std::fs::write(&program, contents).expect("write");
        let mut perms = std::fs::metadata(&program).unwrap().permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&program, perms).unwrap();
        (dir, program)
    }

    #[tokio::test]
    async fn old_help_script_probe_survives_parallel_write_exec() {
        let mut joins = Vec::new();
        for _ in 0..32 {
            joins.push(tokio::spawn(async {
                let (_dir, program) = write_help_script(
                    "#!/bin/sh\necho 'Usage: claude -p --output-format stream-json'\n",
                );
                probe_input_format_support(&program, None).await
            }));
        }
        for join in joins {
            let error = join
                .await
                .expect("join")
                .expect_err("old help must fail the probe");
            assert!(
                error.to_string().contains("Claude Code too old"),
                "unexpected probe error: {error}"
            );
        }
    }
}
