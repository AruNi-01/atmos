use axum::{extract::State, Json};
use serde_json::{json, Value};

use crate::{app_state::AppState, error::ApiResult};
use crate::api::dto::ApiResponse;

/// GET /api/system/tmux-status - Check tmux installation status
pub async fn get_tmux_status(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let installed = state.terminal_service.is_tmux_available();
    
    let version = if installed {
        state.terminal_service.get_tmux_version().ok().map(|v| v.raw)
    } else {
        None
    };
    
    Ok(Json(ApiResponse::success(json!({
        "installed": installed,
        "version": version,
    }))))
}

/// GET /api/system/tmux-sessions - List all Atmos tmux sessions
pub async fn list_tmux_sessions(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let tmux_engine = state.terminal_service.tmux_engine();
    
    let sessions = tmux_engine.list_atmos_sessions()
        .map(|sessions| {
            sessions.into_iter().map(|s| json!({
                "name": s.name,
                "windows": s.windows,
                "created": s.created,
                "attached": s.attached,
            })).collect::<Vec<_>>()
        })
        .unwrap_or_default();
    
    Ok(Json(ApiResponse::success(json!({
        "sessions": sessions
    }))))
}

/// GET /api/system/tmux-windows/:workspace_id - List tmux windows for a workspace
pub async fn list_tmux_windows(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let windows = state.terminal_service.list_workspace_windows(&workspace_id)
        .map(|windows| {
            windows.into_iter().map(|(index, name)| json!({
                "index": index,
                "name": name,
            })).collect::<Vec<_>>()
        })
        .unwrap_or_default();
    
    Ok(Json(ApiResponse::success(json!({
        "windows": windows
    }))))
}
