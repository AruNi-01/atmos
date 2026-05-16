//! Local Atmos Computer status and relay registration (APP-016).

use axum::extract::State;
use axum::Json;
use runtime_manager::{
    clear_server_identity, default_control_plane_url, local_computer_display_name,
    local_computer_display_name_opt, read_server_identity, register_computer,
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
