//! Local Atmos Computer status and relay registration (APP-016).

use std::time::Duration;

use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use runtime_manager::{
    clear_computer_client_settings, clear_server_identity, computer_client_settings_path,
    default_relay_url, local_computer_display_name, local_computer_display_name_opt,
    normalize_relay_url, read_computer_client_settings, read_runtime_manifest,
    read_server_identity, register_computer, resolved_relay_url, write_computer_client_settings,
    ComputerClientSettings, COMPUTER_CLIENT_SETTINGS_VERSION,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::api::dto::ApiResponse;
use crate::api::system::diagnostics;
use crate::app_state::AppState;
use crate::error::{ApiError, ApiResult};

const RELAY_GATEWAY_HEADER: &str = "x-atmos-relay-gateway";

/// GET /api/system/computer — hostname + relay registration on this machine.
pub async fn get_computer_status(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let shell_env = diagnostics::get_shell_env_info();
    let hostname = shell_env
        .get("hostname")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let computer_name = local_computer_display_name_opt().or(hostname.clone());

    let identity = read_server_identity().map_err(ApiError::BadRequest)?;
    let relay_connected = state.relay_supervisor.is_upstream_connected().await;
    let relay_last_error = state.relay_supervisor.last_error().await;

    let mut body = json!({
        "hostname": hostname,
        "computer_name": computer_name,
        "registered": identity.is_some(),
        "relay_connected": relay_connected,
        "relay_last_error": relay_last_error,
        "server_id": identity.as_ref().map(|i| i.server_id.clone()),
        "relay_url": identity
            .as_ref()
            .and_then(|i| i.relay_url.clone())
            .unwrap_or_else(|| default_relay_url().to_string()),
        "relay_ws_url": identity.as_ref().map(|i| i.relay_ws_url.clone()),
    });

    if let Some(obj) = body.as_object_mut() {
        obj.insert("shell_env".to_string(), shell_env);
    }

    Ok(Json(ApiResponse::success(body)))
}

/// GET /api/system/runtime-info — Atmos API + local runtime manifest + relay presence.
pub async fn get_runtime_info(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let manifest = read_runtime_manifest().ok().flatten();
    let identity = read_server_identity().ok().flatten();
    let relay_connected = state.relay_supervisor.is_upstream_connected().await;

    let manifest_json = manifest.as_ref().map(|m| {
        json!({
            "source": m.source,
            "started_at": m.started_at,
            "api_url": m.api.url,
            "api_port": m.api.port,
            "ws_url": m.api.ws_url,
            "pid": m.pid,
        })
    });

    Ok(Json(ApiResponse::success(json!({
        "api_version": env!("CARGO_PKG_VERSION"),
        "runtime_manifest": manifest_json,
        "registration_meta": identity.as_ref().and_then(|i| i.registration_meta.clone()),
        "relay": {
            "registered": identity.is_some(),
            "server_id": identity.as_ref().map(|i| i.server_id.clone()),
            "relay_url": identity
                .as_ref()
                .and_then(|i| i.relay_url.clone())
                .unwrap_or_else(|| default_relay_url().to_string()),
            "connected": relay_connected,
        },
    }))))
}

#[derive(Deserialize)]
pub struct RegisterComputerPayload {
    pub register_token: String,
    #[serde(default)]
    pub relay_url: Option<String>,
    #[serde(default)]
    pub relay_secret_key: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub registration_meta: Option<Value>,
}

/// POST /api/system/computer/register — register this Server with the relay.
pub async fn register_local_computer(
    State(state): State<AppState>,
    Json(payload): Json<RegisterComputerPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let token = payload.register_token.trim();
    if token.is_empty() {
        return Err(ApiError::BadRequest("register_token is required".into()));
    }

    let display_name = payload
        .display_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(local_computer_display_name);
    let relay_url = payload
        .relay_url
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(normalize_relay_url)
        .unwrap_or_else(|| default_relay_url().to_string());
    let relay_secret_key = payload
        .relay_secret_key
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let identity = register_computer(
        &relay_url,
        token,
        relay_secret_key,
        Some(&display_name),
        payload.registration_meta,
    )
    .await
    .map_err(ApiError::BadRequest)?;

    let server_id = identity.server_id.clone();
    let relay_url = identity.relay_url.clone();
    let relay_ws_url = identity.relay_ws_url.clone();

    state.relay_supervisor.start(state.clone(), identity).await;

    let (relay_connected, relay_last_error) = state
        .relay_supervisor
        .wait_upstream(std::time::Duration::from_secs(8))
        .await;

    Ok(Json(ApiResponse::success(json!({
        "ok": true,
        "server_id": server_id,
        "display_name": display_name,
        "relay_url": relay_url,
        "relay_ws_url": relay_ws_url,
        "relay_connected": relay_connected,
        "relay_last_error": relay_last_error,
    }))))
}

/// POST /api/system/computer/relay-sync — (re)connect outbound relay from disk identity.
pub async fn sync_relay_connection(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let (relay_connected, relay_last_error) =
        state.relay_supervisor.sync_from_disk(state.clone()).await;

    Ok(Json(ApiResponse::success(json!({
        "ok": true,
        "relay_connected": relay_connected,
        "relay_last_error": relay_last_error,
    }))))
}

/// GET /api/system/computer-client-settings — user Access Token from `~/.atmos/computer-client.json`.
pub async fn get_computer_client_settings(
    headers: HeaderMap,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let path = computer_client_settings_path();
    let expose_secrets = !is_relay_gateway_request(&headers) && !is_hosted_web_request(&headers);
    let settings = read_computer_client_settings().map_err(ApiError::BadRequest)?;
    let Some(settings) = settings else {
        return Ok(Json(ApiResponse::success(json!({
            "path": path.display().to_string(),
            "configured": false,
            "access_token": "",
            "relay_url": default_relay_url(),
            "relay_secret_key": "",
            "relay_secret_key_configured": false,
        }))));
    };
    let configured = !settings.access_token.trim().is_empty();
    let relay_secret_key_configured = settings
        .relay_secret_key
        .as_ref()
        .is_some_and(|value| !value.trim().is_empty());
    let access_token = if expose_secrets {
        settings.access_token.clone()
    } else {
        String::new()
    };
    let relay_secret_key = if expose_secrets {
        settings.relay_secret_key.clone().unwrap_or_default()
    } else {
        String::new()
    };
    Ok(Json(ApiResponse::success(json!({
        "path": path.display().to_string(),
        "configured": configured,
        "access_token": access_token,
        "relay_url": resolved_relay_url(&settings),
        "relay_secret_key": relay_secret_key,
        "relay_secret_key_configured": relay_secret_key_configured,
    }))))
}

#[derive(Deserialize)]
pub struct PutComputerClientSettingsPayload {
    #[serde(default)]
    pub clear: bool,
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub relay_url: Option<String>,
    #[serde(default)]
    pub relay_secret_key: Option<String>,
}

/// PUT /api/system/computer-client-settings — write or clear `~/.atmos/computer-client.json`.
pub async fn put_computer_client_settings(
    headers: HeaderMap,
    Json(payload): Json<PutComputerClientSettingsPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let path = computer_client_settings_path();
    let expose_secrets = !is_relay_gateway_request(&headers) && !is_hosted_web_request(&headers);
    if payload.clear {
        let removed = clear_computer_client_settings().map_err(ApiError::BadRequest)?;
        return Ok(Json(ApiResponse::success(json!({
            "ok": true,
            "action": if removed { "cleared" } else { "absent" },
            "path": path.display().to_string(),
            "configured": false,
            "relay_secret_key_configured": false,
        }))));
    }

    let existing = read_computer_client_settings().map_err(ApiError::BadRequest)?;
    let access_token = payload
        .access_token
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| {
            existing
                .as_ref()
                .map(|settings| settings.access_token.clone())
        })
        .unwrap_or_default();

    let relay_url = if payload.relay_url.is_some() {
        payload
            .relay_url
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(normalize_relay_url)
    } else {
        existing
            .as_ref()
            .and_then(|settings| settings.relay_url.clone())
    };
    let relay_secret_key = if payload.relay_secret_key.is_some() {
        payload
            .relay_secret_key
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    } else {
        existing
            .as_ref()
            .and_then(|settings| settings.relay_secret_key.clone())
    };

    let settings = ComputerClientSettings {
        version: COMPUTER_CLIENT_SETTINGS_VERSION,
        access_token,
        relay_url,
        relay_secret_key,
    };
    let written = write_computer_client_settings(&settings).map_err(ApiError::BadRequest)?;
    let configured = !settings.access_token.trim().is_empty();
    let relay_secret_key_configured = settings
        .relay_secret_key
        .as_ref()
        .is_some_and(|value| !value.trim().is_empty());
    let relay_secret_key = if expose_secrets {
        settings.relay_secret_key.clone().unwrap_or_default()
    } else {
        String::new()
    };
    Ok(Json(ApiResponse::success(json!({
        "ok": true,
        "action": "written",
        "path": written.display().to_string(),
        "configured": configured,
        "relay_url": resolved_relay_url(&settings),
        "relay_secret_key": relay_secret_key,
        "relay_secret_key_configured": relay_secret_key_configured,
    }))))
}

#[derive(Deserialize)]
pub struct RelayProxyPayload {
    #[serde(default)]
    pub relay_url: Option<String>,
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub relay_secret_key: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
}

/// POST /api/system/computer/relay — proxy HTTPS to the relay (loopback only).
pub async fn proxy_relay(
    Json(payload): Json<RelayProxyPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let path = if payload.path.starts_with('/') {
        payload.path.clone()
    } else {
        format!("/{}", payload.path)
    };
    let payload_relay_url = payload
        .relay_url
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(normalize_relay_url);
    let payload_access_token = payload
        .access_token
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let payload_relay_secret_key = payload
        .relay_secret_key
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let use_settings_token = payload_access_token.is_none() && path != "/v1/tenants";
    let settings = if payload_relay_url.is_none()
        || payload_relay_secret_key.is_none()
        || use_settings_token
    {
        read_computer_client_settings().map_err(ApiError::BadRequest)?
    } else {
        None
    };
    let settings_relay_url = settings.as_ref().map(resolved_relay_url);
    let base = if use_settings_token {
        settings_relay_url.or(payload_relay_url)
    } else {
        payload_relay_url.or(settings_relay_url)
    }
    .unwrap_or_else(|| default_relay_url().to_string());
    let access_token = payload_access_token.or_else(|| {
        if use_settings_token {
            settings
                .as_ref()
                .map(|settings| settings.access_token.trim().to_string())
                .filter(|value| !value.is_empty())
        } else {
            None
        }
    });
    let relay_secret_key = payload_relay_secret_key.or_else(|| {
        settings
            .as_ref()
            .and_then(|settings| settings.relay_secret_key.as_ref())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    });
    let url = format!("{base}{path}");

    let method = payload
        .method
        .parse::<reqwest::Method>()
        .map_err(|_| ApiError::BadRequest(format!("Invalid HTTP method: {}", payload.method)))?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| ApiError::BadRequest(format!("Failed to build HTTP client: {e}")))?;

    let mut builder = client
        .request(method, &url)
        .header("Content-Type", "application/json");

    if let Some(token) = access_token.as_deref() {
        builder = builder.header("Authorization", format!("Bearer {token}"));
    }
    if let Some(secret) = relay_secret_key.as_deref() {
        builder = builder.header("X-Atmos-Relay-Secret", secret);
    }
    if let Some(body) = payload.body.filter(|s| !s.is_empty()) {
        builder = builder.body(body);
    }

    let res = builder.send().await.map_err(|e| {
        ApiError::BadRequest(format!(
            "Cannot reach relay at {base} ({e}). Check network and firewall settings."
        ))
    })?;

    let status = res.status().as_u16();
    let body = res
        .text()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Failed to read relay response: {e}")))?;

    Ok(Json(ApiResponse::success(json!({
        "status": status,
        "body": body,
    }))))
}

fn is_relay_gateway_request(headers: &HeaderMap) -> bool {
    headers
        .get(RELAY_GATEWAY_HEADER)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value == "1")
}

fn is_hosted_web_request(headers: &HeaderMap) -> bool {
    ["origin", "referer"].iter().any(|name| {
        headers
            .get(*name)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with("https://app.atmos.land"))
    })
}

/// POST /api/system/computer/unregister — remove relay identity from this machine.
pub async fn unregister_local_computer(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    state.relay_supervisor.stop().await;
    let removed = clear_server_identity().map_err(ApiError::BadRequest)?;
    Ok(Json(ApiResponse::success(json!({
        "ok": true,
        "removed": removed,
        "relay_connected": false,
    }))))
}
