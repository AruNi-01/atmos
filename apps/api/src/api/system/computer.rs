//! Local Atmos Computer status and relay registration (APP-016).

use std::time::Duration;

use axum::extract::State;
use axum::Json;
use runtime_manager::{
    clear_computer_client_settings, clear_server_identity, computer_client_settings_path,
    default_control_plane_url, local_computer_display_name, local_computer_display_name_opt,
    normalize_control_plane_url, read_computer_client_settings, read_server_identity,
    register_computer, resolved_control_plane_url, write_computer_client_settings,
    ComputerClientSettings, COMPUTER_CLIENT_SETTINGS_VERSION,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::api::dto::ApiResponse;
use crate::api::system::diagnostics;
use crate::app_state::AppState;
use crate::error::{ApiError, ApiResult};

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
        "control_plane_url": identity
            .as_ref()
            .and_then(|i| i.control_plane_url.clone())
            .unwrap_or_else(|| default_control_plane_url().to_string()),
        "relay_ws_url": identity.as_ref().map(|i| i.relay_ws_url.clone()),
    });

    if let Some(obj) = body.as_object_mut() {
        obj.insert("shell_env".to_string(), shell_env);
    }

    Ok(Json(ApiResponse::success(body)))
}

#[derive(Deserialize)]
pub struct RegisterComputerPayload {
    pub register_token: String,
    #[serde(default)]
    pub display_name: Option<String>,
}

/// POST /api/system/computer/register — register this Server with the control plane.
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

    let identity = register_computer(default_control_plane_url(), token, Some(&display_name))
        .await
        .map_err(ApiError::BadRequest)?;

    let server_id = identity.server_id.clone();
    let control_plane_url = identity.control_plane_url.clone();
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
        "control_plane_url": control_plane_url,
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
pub async fn get_computer_client_settings() -> ApiResult<Json<ApiResponse<Value>>> {
    let path = computer_client_settings_path();
    let settings = read_computer_client_settings().map_err(ApiError::BadRequest)?;
    let Some(settings) = settings else {
        return Ok(Json(ApiResponse::success(json!({
            "path": path.display().to_string(),
            "configured": false,
            "access_token": "",
            "control_plane_url": default_control_plane_url(),
        }))));
    };
    Ok(Json(ApiResponse::success(json!({
        "path": path.display().to_string(),
        "configured": !settings.access_token.trim().is_empty(),
        "access_token": settings.access_token,
        "control_plane_url": resolved_control_plane_url(&settings),
    }))))
}

#[derive(Deserialize)]
pub struct PutComputerClientSettingsPayload {
    #[serde(default)]
    pub clear: bool,
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub control_plane_url: Option<String>,
}

/// PUT /api/system/computer-client-settings — write or clear `~/.atmos/computer-client.json`.
pub async fn put_computer_client_settings(
    Json(payload): Json<PutComputerClientSettingsPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let path = computer_client_settings_path();
    if payload.clear {
        let removed = clear_computer_client_settings().map_err(ApiError::BadRequest)?;
        return Ok(Json(ApiResponse::success(json!({
            "ok": true,
            "action": if removed { "cleared" } else { "absent" },
            "path": path.display().to_string(),
        }))));
    }

    let access_token = payload
        .access_token
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::BadRequest("access_token is required".into()))?;

    let control_plane_url = payload
        .control_plane_url
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(normalize_control_plane_url);

    let settings = ComputerClientSettings {
        version: COMPUTER_CLIENT_SETTINGS_VERSION,
        access_token: access_token.to_string(),
        control_plane_url,
    };
    let written = write_computer_client_settings(&settings).map_err(ApiError::BadRequest)?;
    Ok(Json(ApiResponse::success(json!({
        "ok": true,
        "action": "written",
        "path": written.display().to_string(),
        "control_plane_url": resolved_control_plane_url(&settings),
    }))))
}

#[derive(Deserialize)]
pub struct ControlPlaneProxyPayload {
    #[serde(default)]
    pub control_plane_url: Option<String>,
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
}

/// POST /api/system/computer/control-plane — proxy HTTPS to the relay control plane (loopback only).
pub async fn proxy_control_plane(
    Json(payload): Json<ControlPlaneProxyPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let base = payload
        .control_plane_url
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(normalize_control_plane_url)
        .unwrap_or_else(|| default_control_plane_url().to_string());

    let path = if payload.path.starts_with('/') {
        payload.path.clone()
    } else {
        format!("/{}", payload.path)
    };
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

    if let Some(token) = payload
        .access_token
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        builder = builder.header("Authorization", format!("Bearer {token}"));
    }
    if let Some(body) = payload.body.filter(|s| !s.is_empty()) {
        builder = builder.body(body);
    }

    let res = builder.send().await.map_err(|e| {
        ApiError::BadRequest(format!(
            "Cannot reach control plane at {base} ({e}). Check network and firewall settings."
        ))
    })?;

    let status = res.status().as_u16();
    let body = res
        .text()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Failed to read control plane response: {e}")))?;

    Ok(Json(ApiResponse::success(json!({
        "status": status,
        "body": body,
    }))))
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
