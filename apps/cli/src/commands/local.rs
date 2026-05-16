//! `atmos local` — alias for `atmos runtime` (backward-compatible JSON shape).

use clap::{Args, Subcommand};
use runtime_manager::supervisor::{EnsureOptions, EnsureOutcome, DEFAULT_HOST, DEFAULT_PORT};
use serde_json::{json, Value};

pub async fn execute(command: LocalCommand) -> Result<Value, String> {
    match command {
        LocalCommand::Start(args) => {
            let host = if args.lan {
                "0.0.0.0".to_string()
            } else {
                args.host
            };
            match runtime_manager::supervisor::ensure_running(EnsureOptions {
                host,
                port: args.port,
                force_restart: args.force_restart,
                extra_env: Vec::new(),
            })
            .await?
            {
                EnsureOutcome::AlreadyRunning(status) => Ok(json!({
                    "ok": true,
                    "action": "already_running",
                    "status": legacy_status(&status),
                })),
                EnsureOutcome::Started(status) => Ok(json!({
                    "ok": true,
                    "action": "started",
                    "status": legacy_status(&status),
                })),
            }
        }
        LocalCommand::Stop(args) => {
            let stopped = runtime_manager::supervisor::stop_running(args.force).await?;
            Ok(json!({
                "ok": true,
                "action": "stopped",
                "stopped": stopped,
                "status": legacy_status(&runtime_manager::supervisor::runtime_status().await?),
            }))
        }
        LocalCommand::Status(_) => {
            let status = runtime_manager::supervisor::runtime_status().await?;
            Ok(serde_json::to_value(legacy_status(&status))
                .map_err(|e| format!("Failed to serialize local runtime status: {e}"))?)
        }
    }
}

#[derive(Debug, Subcommand)]
pub enum LocalCommand {
    Start(StartArgs),
    Stop(StopArgs),
    Status(StatusArgs),
}

#[derive(Debug, Args)]
pub struct StartArgs {
    #[arg(long, default_value_t = DEFAULT_PORT)]
    pub port: u16,
    #[arg(long, default_value = DEFAULT_HOST)]
    pub host: String,
    #[arg(long, default_value_t = false)]
    pub force_restart: bool,
    #[arg(long, default_value_t = false)]
    pub lan: bool,
}

#[derive(Debug, Args)]
pub struct StopArgs {
    #[arg(long, default_value_t = false)]
    pub force: bool,
}

#[derive(Debug, Args)]
pub struct StatusArgs {}

/// Shape expected by older CLI consumers (`canvas`, etc.).
#[derive(serde::Serialize)]
struct LegacyLocalRuntimeStatus {
    installed: bool,
    running: bool,
    healthy: bool,
    pid: Option<u32>,
    host: String,
    port: u16,
    url: String,
    runtime_dir: Option<String>,
    api_bin_path: Option<String>,
    cli_bin_path: Option<String>,
    web_dir: Option<String>,
    log_path: Option<String>,
    version: Option<String>,
    started_at: Option<String>,
}

fn legacy_status(status: &runtime_manager::supervisor::RuntimeStatus) -> LegacyLocalRuntimeStatus {
    LegacyLocalRuntimeStatus {
        installed: status.installed,
        running: status.running,
        healthy: status.healthy,
        pid: status.pid,
        host: status.host.clone(),
        port: status.port,
        url: status.url.clone(),
        runtime_dir: status.runtime_dir.clone(),
        api_bin_path: status.api_bin_path.clone(),
        cli_bin_path: None,
        web_dir: None,
        log_path: status.log_path.clone(),
        version: status.version.clone(),
        started_at: None,
    }
}

pub(crate) async fn local_runtime_status(
) -> Result<runtime_manager::supervisor::RuntimeStatus, String> {
    runtime_manager::supervisor::runtime_status().await
}
