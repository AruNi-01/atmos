//! Register this host as an Atmos Computer on the relay.

use serde::Deserialize;
use serde_json::Value;

use crate::device_identity::derive_app_device_id;
use crate::identity::{write_server_identity, ServerIdentity};

const DEFAULT_RELAY_URL: &str = "https://relay.atmos.land";

#[derive(Debug, Deserialize)]
struct RegisterResponse {
    server_id: String,
    server_secret: String,
    relay_ws_url: String,
    relay_url: String,
    #[allow(dead_code)]
    display_name: Option<String>,
    #[serde(default)]
    registration_meta: Option<Value>,
}

pub fn normalize_relay_url(raw: &str) -> String {
    let t = raw.trim().trim_end_matches('/');
    if t.is_empty() {
        return DEFAULT_RELAY_URL.to_string();
    }
    if t.starts_with("http://") || t.starts_with("https://") {
        t.to_string()
    } else {
        format!("https://{t}")
    }
}

pub async fn register_computer(
    relay_url: &str,
    register_token: &str,
    relay_secret_key: Option<&str>,
    display_name: Option<&str>,
    registration_meta: Option<Value>,
) -> Result<ServerIdentity, String> {
    let token = register_token.trim();
    if token.is_empty() {
        return Err("register token is empty".into());
    }

    let relay_origin = normalize_relay_url(relay_url);
    let mut body = serde_json::json!({ "register_token": token });
    if let Some(name) = display_name.filter(|s| !s.trim().is_empty()) {
        body["display_name"] = serde_json::Value::String(name.trim().to_string());
    }
    if let Some(meta) = registration_meta {
        body["registration_meta"] = meta;
    }
    body["device"] = serde_json::json!({
        "app_device_id": derive_app_device_id()?,
    });

    let url = format!("{relay_origin}/v1/computers/register");
    let client = reqwest::Client::new();
    let mut request = client.post(&url).json(&body);
    if let Some(secret) = relay_secret_key.map(str::trim).filter(|s| !s.is_empty()) {
        request = request.header("X-Atmos-Relay-Secret", secret);
    }
    let res = request
        .send()
        .await
        .map_err(|e| format!("register request failed: {e}"))?;

    let status = res.status();
    let raw = res
        .text()
        .await
        .map_err(|e| format!("register response read: {e}"))?;

    if !status.is_success() {
        return Err(format!("relay register failed ({status}): {raw}"));
    }

    let parsed: RegisterResponse =
        serde_json::from_str(&raw).map_err(|e| format!("register response parse: {e}"))?;

    let identity = ServerIdentity {
        server_id: parsed.server_id,
        server_secret: parsed.server_secret,
        relay_ws_url: parsed.relay_ws_url,
        relay_url: Some(parsed.relay_url),
        registration_meta: parsed.registration_meta,
    };

    write_server_identity(&identity)?;
    Ok(identity)
}

pub fn default_relay_url() -> &'static str {
    DEFAULT_RELAY_URL
}
