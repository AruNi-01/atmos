//! Agent process manager - spawn ACP agent subprocess with stdio.

use std::collections::HashMap;
use std::path::PathBuf;

use tokio::process::Command;

use crate::manager::AgentError;
use crate::models::AgentLaunchSpec;

/// Spawn agent and return the full child handle (caller must keep it alive and drop to kill)
pub fn spawn_agent(
    spec: &AgentLaunchSpec,
    cwd: Option<PathBuf>,
    env_overrides: Option<HashMap<String, String>>,
) -> Result<
    (
        tokio::process::ChildStdin,
        tokio::process::ChildStdout,
        tokio::process::ChildStderr,
        tokio::process::Child,
    ),
    AgentError,
> {
    let mut cmd = Command::new(&spec.program);
    cmd.args(&spec.args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    if let Some(path) = cwd {
        if path.exists() {
            cmd.current_dir(&path);
        }
    }

    if let Some(env) = &spec.env {
        for (k, v) in env {
            cmd.env(k, v);
        }
    }
    if let Some(overrides) = env_overrides {
        for (k, v) in overrides {
            cmd.env(k, v);
        }
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| AgentError::Command(format!("failed to spawn agent: {}", e)))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| AgentError::Command("agent stdin not available".to_string()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AgentError::Command("agent stdout not available".to_string()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AgentError::Command("agent stderr not available".to_string()))?;

    Ok((stdin, stdout, stderr, child))
}
