//! Spawn one `opencode serve` per live Chat. Parse the listen URL from stdout.

use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::contract::{AgentProviderError, AgentResult};
use crate::policy::opencode_auto_locked;

pub const USERNAME: &str = "opencode";
pub const PASSWORD_ENV: &str = "OPENCODE_SERVER_PASSWORD";
pub const USERNAME_ENV: &str = "OPENCODE_SERVER_USERNAME";
pub const LISTEN_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServeSpawnSpec {
    pub program: String,
    pub args: Vec<String>,
    pub hostname: String,
    pub port: String,
    pub http1_only: bool,
    pub password_env: &'static str,
    pub username: &'static str,
}

pub fn serve_spawn_spec(program: &str, permission_mode: Option<&str>) -> ServeSpawnSpec {
    let mut args = Vec::new();
    if opencode_auto_locked(permission_mode) {
        // Official CLI: `--auto` auto-approves non-denied permissions (TUI / `run`).
        // `opencode serve` (1.18.x) does not accept `--auto`; Atmos locks Auto at
        // session create and auto-replies in the adapter instead.
        args.push("--auto".into());
    }
    args.extend([
        "serve".into(),
        "--hostname".into(),
        "127.0.0.1".into(),
        "--port".into(),
        "0".into(),
    ]);
    ServeSpawnSpec {
        program: program.to_string(),
        args,
        hostname: "127.0.0.1".into(),
        port: "0".into(),
        http1_only: true,
        password_env: PASSWORD_ENV,
        username: USERNAME,
    }
}

/// Whether the requested permission locks Auto for this serve process.
pub fn serve_auto_locked(permission_mode: Option<&str>) -> bool {
    opencode_auto_locked(permission_mode)
}

pub fn generate_server_password() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

/// Official SDK: line starts with `opencode server listening`, then `on\s+(https?:\/\/[^\s]+)`.
pub fn parse_listening_url(output: &str) -> Option<String> {
    for line in output.lines() {
        let line = line.trim();
        if !line.starts_with("opencode server listening") {
            continue;
        }
        let on = line.find(" on ")?;
        let rest = line[on + 4..].trim();
        let url = rest.split_whitespace().next().unwrap_or(rest);
        if url.starts_with("http://") || url.starts_with("https://") {
            return Some(url.trim_end_matches('/').to_string());
        }
    }
    None
}

pub struct ServeChild {
    pub child: Child,
    pub base_url: String,
    password: String,
    pub auto_locked: bool,
}

impl std::fmt::Debug for ServeChild {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ServeChild")
            .field("base_url", &self.base_url)
            .finish_non_exhaustive()
    }
}

impl ServeChild {
    pub fn password(&self) -> &str {
        &self.password
    }
}

pub async fn spawn_serve(
    program: &str,
    cwd: &Path,
    permission_mode: Option<&str>,
    env_overrides: Option<&std::collections::HashMap<String, String>>,
) -> AgentResult<ServeChild> {
    let auto_locked = serve_auto_locked(permission_mode);
    let spec = serve_spawn_spec(program, permission_mode);
    let password = generate_server_password();
    let mut cmd = Command::new(&spec.program);
    let serve_args: Vec<&str> = if auto_locked {
        // Serve subcommand rejects `--auto` today; keep the flag off argv until OpenCode adds it.
        spec.args
            .iter()
            .filter(|arg| arg.as_str() != "--auto")
            .map(String::as_str)
            .collect()
    } else {
        spec.args.iter().map(String::as_str).collect()
    };
    cmd.args(&serve_args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .env(PASSWORD_ENV, &password)
        .env(USERNAME_ENV, USERNAME);
    if cwd.exists() {
        cmd.current_dir(cwd);
    }
    if let Some(overrides) = env_overrides {
        for (key, value) in overrides {
            if key == PASSWORD_ENV {
                continue;
            }
            cmd.env(key, value);
        }
    }

    tracing::debug!(
        program = %spec.program,
        hostname = %spec.hostname,
        port = %spec.port,
        "spawning opencode serve"
    );

    let mut child = cmd.spawn().map_err(|error| {
        AgentProviderError::message(format!("failed to spawn opencode: {error}"))
    })?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AgentProviderError::message("opencode stdout not available"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AgentProviderError::message("opencode stderr not available"))?;

    let combined = Arc::new(Mutex::new(String::new()));
    let err_buf = Arc::clone(&combined);
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => break,
                Ok(_) => err_buf.lock().await.push_str(&line),
                Err(_) => break,
            }
        }
    });

    let listen = wait_for_listen(stdout, Arc::clone(&combined), &mut child).await;
    match listen {
        Ok(base_url) => Ok(ServeChild {
            child,
            base_url,
            password,
            auto_locked,
        }),
        Err(error) => {
            let _ = child.start_kill();
            Err(error)
        }
    }
}

async fn wait_for_listen(
    stdout: tokio::process::ChildStdout,
    combined: Arc<Mutex<String>>,
    child: &mut Child,
) -> AgentResult<String> {
    let mut reader = BufReader::new(stdout);
    let found = tokio::time::timeout(LISTEN_TIMEOUT, async {
        let mut line = String::new();
        loop {
            line.clear();
            let n = reader
                .read_line(&mut line)
                .await
                .map_err(|error| AgentProviderError::message(error.to_string()))?;
            if n == 0 {
                if let Some(url) = parse_listening_url(&combined.lock().await) {
                    return Ok((url, reader));
                }
                if let Some(status) = child.try_wait().ok().flatten() {
                    let output = combined.lock().await.clone();
                    return Err(AgentProviderError::message(format!(
                        "opencode serve exited ({status}). output:\n{output}"
                    )));
                }
                let output = combined.lock().await.clone();
                return Err(AgentProviderError::message(format!(
                    "opencode serve closed stdout before listening. output:\n{output}"
                )));
            }
            combined.lock().await.push_str(&line);
            if let Some(url) = parse_listening_url(&line) {
                return Ok((url, reader));
            }
            if let Some(url) = parse_listening_url(&combined.lock().await) {
                return Ok((url, reader));
            }
        }
    })
    .await
    .map_err(|_| {
        AgentProviderError::message("timeout waiting for opencode server listening url")
    })??;

    let (url, rest) = found;
    tokio::spawn(async move {
        let mut reader = rest;
        let mut line = String::new();
        loop {
            line.clear();
            if reader.read_line(&mut line).await.unwrap_or(0) == 0 {
                break;
            }
        }
    });
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spawn_helper_forces_loopback_port_zero_http1_and_password_env() {
        let spec = serve_spawn_spec("opencode", None);
        assert_eq!(
            spec.args,
            ["serve", "--hostname", "127.0.0.1", "--port", "0"]
        );
        let auto_spec = serve_spawn_spec("opencode", Some("auto"));
        assert_eq!(
            auto_spec.args,
            ["--auto", "serve", "--hostname", "127.0.0.1", "--port", "0"]
        );
        assert!(serve_auto_locked(Some("auto")));
        assert!(!serve_auto_locked(Some("ask_always")));
        assert_eq!(spec.hostname, "127.0.0.1");
        assert_eq!(spec.port, "0");
        assert!(spec.http1_only);
        assert_eq!(spec.password_env, "OPENCODE_SERVER_PASSWORD");
        assert_eq!(spec.username, "opencode");
        assert!(!spec.args.iter().any(|arg| arg == "4096"));
        assert!(!spec.args.iter().any(|arg| arg.contains("0.0.0.0")));
        assert!(!spec.args.iter().any(|arg| arg == "acp"));
    }

    #[test]
    fn parse_listening_url_matches_official_sdk() {
        let output = "booting\nopencode server listening on http://127.0.0.1:54321\n";
        assert_eq!(
            parse_listening_url(output).as_deref(),
            Some("http://127.0.0.1:54321")
        );
        assert!(parse_listening_url("still starting").is_none());
        assert_ne!(
            parse_listening_url(output).as_deref(),
            Some("http://127.0.0.1:4096")
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn spawn_reads_url_from_fake_binary_and_requires_password_env() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().expect("tempdir");
        let script = dir.path().join("fake-opencode");
        std::fs::write(
            &script,
            r#"#!/bin/sh
if [ -z "$OPENCODE_SERVER_PASSWORD" ]; then echo "missing password" >&2; exit 1; fi
if [ "$OPENCODE_SERVER_USERNAME" != "opencode" ]; then echo "bad user" >&2; exit 1; fi
echo "opencode server listening on http://127.0.0.1:54321"
sleep 60
"#,
        )
        .expect("write script");
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).expect("chmod");

        let child = spawn_serve(script.to_str().expect("utf8"), dir.path(), None, None)
            .await
            .expect("spawn fake serve");
        assert_eq!(child.base_url, "http://127.0.0.1:54321");
        assert!(!child.password().is_empty());
        drop(child);
    }
}
