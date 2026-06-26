//! APP-016 — register this host as an Atmos Computer and run API with relay.

use clap::{Args, Subcommand};
use runtime_manager::{
    normalize_relay_url, read_server_identity, resolve_server_identity_path,
    supervisor::{EnsureOptions, EnsureOutcome, DEFAULT_HOST, DEFAULT_PORT},
    RegistrationMeta,
};
use serde_json::{json, Value};

const DEFAULT_RELAY: &str = "https://relay.atmos.land";

pub async fn execute(command: ComputerCommand) -> Result<Value, String> {
    match command {
        ComputerCommand::Status => status().await,
        ComputerCommand::Start(args) => start(args).await,
    }
}

#[derive(Debug, Subcommand)]
pub enum ComputerCommand {
    Status,
    Start(ComputerStartArgs),
}

#[derive(Debug, Args)]
pub struct ComputerStartArgs {
    #[arg(long)]
    pub token: Option<String>,
    #[arg(long)]
    pub relay: Option<String>,
    #[arg(long)]
    pub relay_secret_key: Option<String>,
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
    /// Start API in the background (detached) and exit after a short readiness check.
    #[arg(long, default_value_t = false)]
    pub daemon: bool,
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
            (None, _) => "Not registered. Create a registration code in Settings, then: atmos computer start --token <token> --daemon",
            (Some(_), false) => "Registered. Run: atmos computer start --daemon (or atmos runtime ensure)",
            (Some(_), true) => "Registered and API is running. Connect from another device via Settings → Connect via relay",
        },
    }))
}

async fn start(args: ComputerStartArgs) -> Result<Value, String> {
    let token = optional_register_token(args.token.as_deref())?;
    let mut register_result: Option<Value> = None;

    if token.is_none() && read_server_identity()?.is_none() {
        return Err(
            "Not registered yet. Pass --token from Atmos Settings: atmos computer start --token <token> --daemon".into(),
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
        daemon: args.daemon,
    })
    .await?;

    let (action, status) = match outcome {
        EnsureOutcome::AlreadyRunning(s) => ("already_running", s),
        EnsureOutcome::Started(s) => ("started", s),
    };

    let relay_synced = if let Some(token) = token {
        let relay = resolve_relay(args.relay.as_deref());
        let relay_secret_key = resolve_relay_secret_key(args.relay_secret_key.as_deref());
        let display_name = resolve_display_name(args.display_name);
        let reg = register_with_local_api(
            &status.url,
            &token,
            &relay,
            relay_secret_key.as_deref(),
            &display_name,
        )
        .await?;
        let relay_connected = reg
            .get("relay_connected")
            .and_then(|value| value.as_bool())
            .unwrap_or(false);
        register_result = Some(json!({
            "server_id": reg.get("server_id").cloned().unwrap_or(Value::Null),
            "display_name": reg.get("display_name").cloned().unwrap_or_else(|| json!(display_name)),
            "identity_path": resolve_server_identity_path().display().to_string(),
        }));
        relay_connected
    } else {
        false
    };

    let hint = if args.daemon {
        "API is running in the background. Relay connects on startup; check with: atmos computer status"
    } else {
        "Keep this host online. On another device: Settings → access token → Connect via relay."
    };

    Ok(json!({
        "ok": true,
        "action": action,
        "register": register_result,
        "relay_connected": relay_synced,
        "daemon": args.daemon,
        "relay_url": normalize_relay_url(&resolve_relay(args.relay.as_deref())),
        "runtime": status,
        "hint": hint,
    }))
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

fn resolve_relay(cli: Option<&str>) -> String {
    if let Some(url) = cli.filter(|s| !s.trim().is_empty()) {
        return normalize_relay_url(url);
    }
    std::env::var("ATMOS_RELAY_URL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(|s| normalize_relay_url(&s))
        .unwrap_or_else(|| DEFAULT_RELAY.to_string())
}

fn resolve_relay_secret_key(cli: Option<&str>) -> Option<String> {
    if let Some(secret) = cli.filter(|s| !s.trim().is_empty()) {
        return Some(secret.trim().to_string());
    }
    std::env::var("ATMOS_RELAY_SECRET_KEY")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_string())
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
    runtime_manager::local_computer_display_name()
}

async fn register_with_local_api(
    api_url: &str,
    register_token: &str,
    relay: &str,
    relay_secret_key: Option<&str>,
    display_name: &str,
) -> Result<Value, String> {
    let mut payload = json!({
        "register_token": register_token,
        "display_name": display_name,
        "relay_url": relay,
        "registration_meta": registration_meta(),
    });
    if let Some(secret) = relay_secret_key.filter(|value| !value.trim().is_empty()) {
        payload["relay_secret_key"] = json!(secret.trim());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|err| format!("failed to build http client: {err}"))?;
    let url = format!(
        "{}/api/system/computer/register",
        api_url.trim_end_matches('/')
    );
    let mut request = client.post(&url).json(&payload);
    if let Some(token) = runtime_manager::resolve_api_bearer_token(None) {
        request = request.header(reqwest::header::AUTHORIZATION, format!("Bearer {token}"));
    }

    let response = request
        .send()
        .await
        .map_err(|err| format!("local API register request failed ({url}): {err}"))?;
    let status = response.status();
    let value = response
        .json::<Value>()
        .await
        .map_err(|err| format!("local API register response parse failed: {err}"))?;
    if !status.is_success() {
        let detail = value
            .get("error")
            .and_then(|err| err.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| value.to_string());
        return Err(format!("local API register failed ({status}): {detail}"));
    }
    crate::api_client::unwrap_api_envelope(value)
}

fn registration_meta() -> Value {
    let via = std::env::var("ATMOS_REGISTRATION_VIA")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "cli".to_string());
    let version = std::env::var("ATMOS_REGISTRATION_VERSION")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string());
    RegistrationMeta::new(via, Some(version)).to_value()
}
