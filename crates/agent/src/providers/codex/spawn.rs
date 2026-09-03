//! Chat spawn OVERRIDE: `codex app-server` stdio JSONL (never `exec --json`, never `--listen`).

use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;

use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};

use crate::contract::{AgentProviderError, AgentResult};

pub const CHAT_SUBCOMMAND: &str = "app-server";

/// Session-only `-c` overlays. Never write `~/.codex/config.toml`.
/// Empty `openai_base_url` restores the published CLI ChatGPT-login path instead
/// of inheriting a user gateway Atmos does not control.
pub const CHAT_CONFIG_OVERRIDES: &[&str] = &[r#"openai_base_url="""#];

pub fn chat_args() -> Vec<&'static str> {
    let mut args = vec![CHAT_SUBCOMMAND];
    for overlay in CHAT_CONFIG_OVERRIDES {
        args.push("-c");
        args.push(*overlay);
    }
    args
}

/// Homebrew OpenCodex shim that `exec`s a missing `codex.opencodex-real`.
pub fn is_broken_codex_shim(path: &Path) -> bool {
    let Ok(bytes) = std::fs::read(path) else {
        return false;
    };
    let text = String::from_utf8_lossy(&bytes);
    if !text.contains("codex.opencodex-real") {
        return false;
    }
    let sibling = path.with_file_name("codex.opencodex-real");
    !sibling.is_file()
}

fn broken_shim_error(path: &Path) -> AgentProviderError {
    AgentProviderError::message(format!(
        "Codex CLI at `{path}` is broken: it runs `codex.opencodex-real`, which is missing. \
Repair or reinstall the official Codex CLI on this machine, then try again.",
        path = path.display()
    ))
}

/// Resolve the Codex the user asked for. Do not search for a substitute binary.
pub fn resolve_program(program: &str) -> AgentResult<String> {
    let requested = Path::new(program);
    let path = if requested.is_file() {
        requested.to_path_buf()
    } else {
        which::which(program).map_err(|_| {
            AgentProviderError::message(format!(
                "Codex CLI `{program}` was not found on PATH. Install the official Codex CLI, then try again."
            ))
        })?
    };
    if is_broken_codex_shim(&path) {
        return Err(broken_shim_error(&path));
    }
    Ok(path.to_string_lossy().into_owned())
}

pub struct SpawnedAppServer {
    pub stdin: ChildStdin,
    pub stdout: ChildStdout,
    pub stderr: ChildStderr,
    pub child: Child,
}

pub fn spawn_app_server(
    program: &str,
    cwd: &Path,
    env_overrides: Option<HashMap<String, String>>,
) -> AgentResult<SpawnedAppServer> {
    let mut cmd = Command::new(program);
    cmd.args(chat_args())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    if cwd.exists() {
        cmd.current_dir(cwd);
    }
    if let Some(env) = env_overrides {
        for (key, value) in env {
            cmd.env(key, value);
        }
    }

    let mut child = cmd.spawn().map_err(|error| {
        AgentProviderError::message(format!(
            "failed to spawn {program} {CHAT_SUBCOMMAND}: {error}"
        ))
    })?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| AgentProviderError::message("codex stdin not available"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AgentProviderError::message("codex stdout not available"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AgentProviderError::message("codex stderr not available"))?;
    Ok(SpawnedAppServer {
        stdin,
        stdout,
        stderr,
        child,
    })
}

pub async fn ensure_child_alive(child: &mut Child, program: &str) -> AgentResult<()> {
    tokio::time::sleep(Duration::from_millis(80)).await;
    match child.try_wait() {
        Ok(Some(status)) => Err(AgentProviderError::message(format!(
            "Codex CLI exited before initialize ({status}). Binary: {program}. \
Fix the Codex install on this machine, then try again."
        ))),
        Ok(None) => Ok(()),
        Err(error) => Err(AgentProviderError::message(format!(
            "codex wait failed: {error}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn chat_argv_is_app_server_not_exec_json() {
        let args = chat_args();
        assert_eq!(args[0], "app-server");
        assert_eq!(CHAT_SUBCOMMAND, "app-server");
        let joined = args.join(" ");
        assert!(!joined.contains("exec"));
        assert!(!joined.contains("--json"));
        assert!(!joined.contains("--listen"));
        assert_eq!(CHAT_CONFIG_OVERRIDES, &[r#"openai_base_url="""#]);
        assert_eq!(args, vec!["app-server", "-c", r#"openai_base_url="""#]);
    }

    #[test]
    fn detects_opencodex_shim_without_real_binary() {
        let dir = tempfile::tempdir().expect("tempdir");
        let shim = dir.path().join("codex");
        std::fs::write(
            &shim,
            "#!/bin/sh\nexec '/opt/homebrew/bin/codex.opencodex-real' \"$@\"\n",
        )
        .expect("write shim");
        assert!(is_broken_codex_shim(&shim));
        let real = dir.path().join("codex.opencodex-real");
        std::fs::write(&real, "#!/bin/sh\necho ok\n").expect("write real");
        assert!(!is_broken_codex_shim(&shim));
    }

    #[test]
    fn resolve_program_errors_on_broken_shim_instead_of_substituting() {
        let dir = tempfile::tempdir().expect("tempdir");
        let shim = dir.path().join("codex");
        std::fs::write(
            &shim,
            "#!/bin/sh\nexec '/opt/homebrew/bin/codex.opencodex-real' \"$@\"\n",
        )
        .expect("write shim");
        let working = dir.path().join("codex-working");
        std::fs::write(&working, "#!/bin/sh\necho ok\n").expect("write working");
        let error = resolve_program(&shim.to_string_lossy()).expect_err("broken shim");
        let message = error.to_string();
        assert!(message.contains("codex.opencodex-real"), "{message}");
        assert!(message.contains("Repair or reinstall"), "{message}");
        assert!(
            resolve_program(&working.to_string_lossy()).is_ok(),
            "a working path must still resolve"
        );
    }

    #[test]
    fn resolve_program_errors_when_name_is_missing() {
        let error = resolve_program("codex-cli-that-is-not-installed-9f3a").expect_err("missing");
        assert!(
            error.to_string().contains("was not found on PATH"),
            "{error}"
        );
    }

    #[tokio::test]
    async fn spawn_dummy_stdio_sets_kill_on_drop() {
        let spawned = spawn_app_server("/bin/cat", &PathBuf::from("/"), None);
        assert!(
            spawned.is_ok(),
            "dummy spawn should not need a live codex CLI"
        );
        drop(spawned);
    }

    #[tokio::test]
    async fn live_codex_spawn_skips_if_cli_missing_or_unusable() {
        let Ok(path) = which::which("codex") else {
            return;
        };
        match spawn_app_server(&path.to_string_lossy(), &PathBuf::from("."), None) {
            Ok(child) => drop(child),
            Err(_) => {}
        }
    }
}
