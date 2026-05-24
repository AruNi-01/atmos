use axum::Json;
use runtime_manager::{
    clear_client_session, read_client_session, write_client_session, ClientSession,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::api::dto::ApiResponse;
use crate::error::{ApiError, ApiResult};

#[derive(Deserialize)]
pub struct PutClientSessionPayload {
    #[serde(default)]
    pub clear: bool,
    #[serde(default)]
    pub server_id: Option<String>,
    #[serde(default)]
    pub api_base_url: Option<String>,
    #[serde(default)]
    pub gateway_token: Option<String>,
}

/// PUT /api/system/client-session — write or clear `~/.atmos/client-session.json`.
pub async fn put_client_session(
    Json(payload): Json<PutClientSessionPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    if payload.clear {
        clear_client_session().map_err(ApiError::BadRequest)?;
        return Ok(Json(ApiResponse::success(json!({
            "ok": true,
            "action": "cleared",
            "path": runtime_manager::client_session_path().display().to_string(),
        }))));
    }

    let server_id = payload
        .server_id
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::BadRequest("server_id is required".into()))?;
    let api_base_url = payload
        .api_base_url
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::BadRequest("api_base_url is required".into()))?;
    let gateway_token = payload
        .gateway_token
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::BadRequest("gateway_token is required".into()))?;

    let session = ClientSession::new(server_id, api_base_url, gateway_token);
    let path = write_client_session(&session).map_err(ApiError::BadRequest)?;
    Ok(Json(ApiResponse::success(json!({
        "ok": true,
        "action": "written",
        "path": path.display().to_string(),
        "session": session,
    }))))
}

/// GET /api/system/client-session
pub async fn get_client_session() -> ApiResult<Json<ApiResponse<Value>>> {
    let path = runtime_manager::client_session_path();
    let session = read_client_session().map_err(ApiError::BadRequest)?;
    let Some(session) = session else {
        return Err(ApiError::NotFound(format!(
            "No client session file at {}",
            path.display()
        )));
    };
    Ok(Json(ApiResponse::success(json!({
        "path": path.display().to_string(),
        "session": session,
    }))))
}
