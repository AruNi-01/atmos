//! APP-016 — register this host as an Atmos Computer and run API with relay.

use clap::{Args, Subcommand};
use runtime_manager::{
    normalize_control_plane_url, read_server_identity, register_computer,
    resolve_server_identity_path, supervisor::{EnsureOptions, EnsureOutcome, DEFAULT_HOST, DEFAULT_PORT},
};
use serde_json::{json, Value};

const DEFAULT_CONTROL_PLANE: &str = "https://relay.atmos.land";

pub async fn execute(command: ComputerCommand) -> Result<Value, String> {
    match command {
        ComputerCommand::Register(args) => register(args).await,
        ComputerCommand::Status => status().await,
        ComputerCommand::Start(args) => start(args).await,
    }
}

#[derive(Debug, Subcommand)]
pub enum ComputerCommand {
    Register(RegisterArgs),
    Status,
    Start(ComputerStartArgs),
}

#[derive(Debug, Args)]
pub struct RegisterArgs {
    #[arg(long)]
    pub token: Option<String>,
    #[arg(long)]
    pub control_plane: Option<String>,
    #[arg(long)]
    pub display_name: Option<String>,
}

#[derive(Debug, Args)]
pub struct ComputerStartArgs {
    #[arg(long)]
    pub token: Option<String>,
    #[arg(long)]
    pub control_plane: Option<String>,
    #[arg(long)]
    pub display_name: Option<String>,
    #[arg(long, default_value_t = DEFAULT_PORT)]
    pub port: u16,
    #[arg(long, default_value = DEFAULT_HOST)]
    pub host: String,
    #[arg(long, default_value_t = false)]
    pub force_restart: bool,
    #[arg(long, default_value_t = false)]
    pub lan: bool,
}

async fn register(args: RegisterArgs) -> Result<Value, String> {
    let register_token = resolve_register_token(args.token.as_deref())?;
    let control_plane = resolve_control_plane(args.control_plane.as_deref());
    let display_name = resolve_display_name(args.display_name);

    let identity = register_computer(
        &control_plane,
        &register_token,
        Some(display_name.as_str()),
    )
    .await?;

    let path = resolve_server_identity_path();
    let local = runtime_manager::supervisor::runtime_status().await.ok();

    Ok(json!({
        "ok": true,
        "action": "registered",
        "server_id": identity.server_id,
        "display_name": display_name,
        "control_plane_url": identity.control_plane_url,
        "relay_ws_url": identity.relay_ws_url,
        "identity_path": path.display().to_string(),
        "local_api_running": local.as_ref().map(|s| s.running).unwrap_or(false),
        "hint": relay_restart_hint(local.as_ref().map(|s| s.running).unwrap_or(false)),
    }))
}

async fn status() -> Result<Value, String> {
    let path = resolve_server_identity_path();
    let identity = read_server_identity()?;
    let local = runtime_manager::supervisor::runtime_status().await?;

    Ok(json!({
        "ok": true,
        "registered": identity.is_some(),
        "identity_path": path.display().to_string(),
        "identity": identity,
        "local_api": local,
        "hint": match (&identity, local.running) {
            (None, _) => "Not registered. Create a register token in Settings, then: atmos computer register --token <token>",
            (Some(_), false) => "Registered. Run: atmos computer start --token … (or atmos runtime ensure)",
            (Some(_), true) => "Registered and API is running. Connect from another device via Settings → Connect via relay",
        },
    }))
}

async fn start(args: ComputerStartArgs) -> Result<Value, String> {
    let mut register_result: Option<Value> = None;

    if let Some(token) = optional_register_token(args.token.as_deref())? {
        let control_plane = resolve_control_plane(args.control_plane.as_deref());
        let display_name = resolve_display_name(args.display_name);
        let identity = register_computer(
            &control_plane,
            &token,
            Some(display_name.as_str()),
        )
        .await?;
        register_result = Some(json!({
            "server_id": identity.server_id,
            "display_name": display_name,
            "identity_path": resolve_server_identity_path().display().to_string(),
        }));
    } else if read_server_identity()?.is_none() {
        return Err(
            "Not registered yet. Pass --token from Atmos Settings, or run `atmos computer register` first.".into(),
        );
    }

    let host = if args.lan {
        "0.0.0.0".to_string()
    } else {
        args.host
    };

    let outcome = runtime_manager::supervisor::ensure_running(EnsureOptions {
        host,
        port: args.port,
        force_restart: args.force_restart,
        extra_env: Vec::new(),
    })
    .await?;

    let (action, status) = match outcome {
        EnsureOutcome::AlreadyRunning(s) => ("already_running", s),
        EnsureOutcome::Started(s) => ("started", s),
    };

    Ok(json!({
        "ok": true,
        "action": action,
        "register": register_result,
        "control_plane_url": normalize_control_plane_url(&resolve_control_plane(args.control_plane.as_deref())),
        "runtime": status,
        "hint": "Keep this host online. On another device: Settings → access token → Connect via relay.",
    }))
}

fn resolve_register_token(cli: Option<&str>) -> Result<String, String> {
    if let Some(t) = cli.filter(|s| !s.trim().is_empty()) {
        return Ok(t.trim().to_string());
    }
    std::env::var("ATMOS_REGISTER_TOKEN")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_string())
        .ok_or_else(|| {
            "Missing register token. Pass --token or set ATMOS_REGISTER_TOKEN.".into()
        })
}

fn optional_register_token(cli: Option<&str>) -> Result<Option<String>, String> {
    if let Some(t) = cli.filter(|s| !s.trim().is_empty()) {
        return Ok(Some(t.trim().to_string()));
    }
    Ok(std::env::var("ATMOS_REGISTER_TOKEN")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_string()))
}

fn resolve_control_plane(cli: Option<&str>) -> String {
    if let Some(url) = cli.filter(|s| !s.trim().is_empty()) {
        return normalize_control_plane_url(url);
    }
    std::env::var("ATMOS_CONTROL_PLANE_URL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(|s| normalize_control_plane_url(&s))
        .unwrap_or_else(|| DEFAULT_CONTROL_PLANE.to_string())
}

fn resolve_display_name(cli: Option<String>) -> String {
    cli.filter(|s| !s.trim().is_empty())
        .or_else(|| {
            std::env::var("ATMOS_COMPUTER_DISPLAY_NAME")
                .ok()
                .filter(|s| !s.trim().is_empty())
        })
        .unwrap_or_else(default_display_name)
}

fn default_display_name() -> String {
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "Atmos Computer".to_string())
}

fn relay_restart_hint(local_api_running: bool) -> &'static str {
    if local_api_running {
        "Relay identity saved. Restart the API (`atmos runtime ensure --force-restart`) to open the relay connection."
    } else {
        "Relay identity saved. Run `atmos computer start` or `atmos runtime ensure` to launch the API with relay."
    }
}
