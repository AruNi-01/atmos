use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use tokio::process::{Child, Command};
use tracing::{debug, info};

use crate::error::{LocalModelError, Result};

const HEALTH_CHECK_INTERVAL_MS: u64 = 500;
const HEALTH_CHECK_TIMEOUT_SECS: u64 = 60;

/// Spawn `llama-server` as a background child process.
///
/// Arguments:
/// - `bin_path`: path to the llama-server binary
/// - `model_path`: path to the GGUF model file
/// - `port`: TCP port to bind
/// - `context_size`: context window size (tokens)
/// - `log_path`: file to redirect stdout+stderr into
pub async fn spawn_llama_server(
    bin_path: &Path,
    model_path: &Path,
    port: u16,
    context_size: u32,
    log_path: &Path,
) -> Result<Child> {
    // Ensure the binary is executable on Unix.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(bin_path)?.permissions();
        perms.set_mode(perms.mode() | 0o111);
        std::fs::set_permissions(bin_path, perms)?;
    }

    if let Some(parent) = log_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let log_file = std::fs::File::create(log_path).map_err(|e| {
        LocalModelError::SpawnFailed(format!("cannot create log file {}: {e}", log_path.display()))
    })?;
    let log_file_stderr = log_file.try_clone().map_err(|e| {
        LocalModelError::SpawnFailed(format!("cannot clone log file handle: {e}"))
    })?;

    let child = Command::new(bin_path)
        .args([
            "--model",
            &model_path.to_string_lossy(),
            "--port",
            &port.to_string(),
            "--ctx-size",
            &context_size.to_string(),
            "--host",
            "127.0.0.1",
        ])
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(log_file_stderr))
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| LocalModelError::SpawnFailed(e.to_string()))?;

    info!(
        pid = child.id().unwrap_or(0),
        port,
        model = %model_path.display(),
        "llama-server spawned"
    );
    Ok(child)
}

/// Poll the llama-server health endpoint until it responds 200 or we time out.
pub async fn wait_for_ready(port: u16) -> Result<()> {
    let url = format!("http://127.0.0.1:{port}/health");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|e| LocalModelError::Runtime(e.to_string()))?;

    let deadline = tokio::time::Instant::now()
        + Duration::from_secs(HEALTH_CHECK_TIMEOUT_SECS);

    loop {
        if tokio::time::Instant::now() > deadline {
            return Err(LocalModelError::StartupTimeout);
        }
        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                debug!(port, "llama-server is ready");
                return Ok(());
            }
            Ok(resp) => {
                debug!(port, status = %resp.status(), "llama-server not ready yet");
            }
            Err(e) => {
                debug!(port, error = %e, "llama-server health check failed");
            }
        }
        tokio::time::sleep(Duration::from_millis(HEALTH_CHECK_INTERVAL_MS)).await;
    }
}
