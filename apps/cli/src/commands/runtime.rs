//! `atmos runtime` — ensure / stop / status for the local API runtime.

use clap::{Args, Subcommand};
use runtime_manager::supervisor::{EnsureOptions, EnsureOutcome, DEFAULT_HOST, DEFAULT_PORT};
use serde_json::{json, Value};

pub async fn execute(command: RuntimeCommand) -> Result<Value, String> {
    match command {
        RuntimeCommand::Ensure(args) => ensure(args).await,
        RuntimeCommand::Stop(args) => stop(args).await,
        RuntimeCommand::Status => status().await,
    }
}

#[derive(Debug, Subcommand)]
pub enum RuntimeCommand {
    /// Start the local API if it is not already running (writes `runtime_manifest.json`).
    Ensure(EnsureArgs),
    /// Stop the local API and remove `runtime_manifest.json`.
    Stop(StopArgs),
    /// Show install layout and whether the API is healthy.
    Status,
}

#[derive(Debug, Args)]
pub struct EnsureArgs {
    #[arg(long, default_value_t = DEFAULT_PORT)]
    pub port: u16,
    #[arg(long, default_value = DEFAULT_HOST)]
    pub host: String,
    #[arg(long, default_value_t = false)]
    pub force_restart: bool,
    /// Bind API on all interfaces (`0.0.0.0`); manifest still points clients to loopback.
    #[arg(long, default_value_t = false)]
    pub lan: bool,
}

#[derive(Debug, Args)]
pub struct StopArgs {
    #[arg(long, default_value_t = false)]
    pub force: bool,
}

async fn ensure(args: EnsureArgs) -> Result<Value, String> {
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
            "status": status,
        })),
        EnsureOutcome::Started(status) => Ok(json!({
            "ok": true,
            "action": "started",
            "status": status,
        })),
    }
}

async fn stop(args: StopArgs) -> Result<Value, String> {
    let stopped = runtime_manager::supervisor::stop_running(args.force).await?;
    let status = runtime_manager::supervisor::runtime_status().await?;
    Ok(json!({
        "ok": true,
        "action": "stopped",
        "stopped": stopped,
        "status": status,
    }))
}

async fn status() -> Result<Value, String> {
    let status = runtime_manager::supervisor::runtime_status().await?;
    Ok(serde_json::to_value(status)
        .map_err(|e| format!("Failed to serialize runtime status: {e}"))?)
}
