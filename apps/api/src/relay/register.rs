//! One-shot control-plane registration via `ATMOS_REGISTER_TOKEN`.

use runtime_manifest::{write_server_identity, ServerIdentity};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct RegisterResponse {
    server_id: String,
    server_secret: String,
    relay_ws_url: String,
    control_plane_url: String,
    #[allow(dead_code)]
    display_name: Option<String>,
}

pub async fn try_consume_register_token() -> Result<Option<ServerIdentity>, String> {
    let token = match std::env::var("ATMOS_REGISTER_TOKEN") {
        Ok(v) if !v.trim().is_empty() => v.trim().to_string(),
        _ => return Ok(None),
    };

    unsafe {
        std::env::remove_var("ATMOS_REGISTER_TOKEN");
    }

    let cp = std::env::var("ATMOS_CONTROL_PLANE_URL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "https://relay.atmos.land".to_string());
    let cp = cp.trim().trim_end_matches('/').to_string();

    let display_name = std::env::var("ATMOS_COMPUTER_DISPLAY_NAME")
        .ok()
        .filter(|s| !s.trim().is_empty());

    let mut body = serde_json::json!({ "register_token": token });
    if let Some(name) = display_name {
        body["display_name"] = serde_json::Value::String(name);
    }

    let url = format!("{cp}/v1/computers/register");
    let client = reqwest::Client::new();
    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("register request failed: {e}"))?;

    let status = res.status();
    let raw = res
        .text()
        .await
        .map_err(|e| format!("register response read: {e}"))?;

    if !status.is_success() {
        return Err(format!(
            "control plane register failed ({status}): {raw}"
        ));
    }

    let parsed: RegisterResponse = serde_json::from_str(&raw)
        .map_err(|e| format!("register response parse: {e}"))?;

    let identity = ServerIdentity {
        server_id: parsed.server_id,
        server_secret: parsed.server_secret,
        relay_ws_url: parsed.relay_ws_url,
        control_plane_url: Some(parsed.control_plane_url),
    };

    let path = write_server_identity(&identity)?;
    tracing::info!(
        target: "atmos_relay",
        path = %path.display(),
        server_id = %identity.server_id,
        "registered computer with control plane"
    );

    Ok(Some(identity))
}
