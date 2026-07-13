use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;

use crate::api::dto::{ApiResponse, MessageResponse, TerminalLayoutResponse};
use crate::{app_state::AppState, error::ApiResult};

#[derive(Deserialize)]
pub struct UpdateTerminalLayoutPayload {
    pub layout: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateMaximizedTerminalIdPayload {
    pub terminal_id: Option<String>,
}

/// GET /api/workspace/:guid/terminal-layout - Get terminal layout
///
/// Returns empty layout when workspace doesn't exist yet (avoids 404 noise
/// in the browser console during initial page load before workspace is persisted).
pub async fn get_terminal_layout(
    State(state): State<AppState>,
    Path(guid): Path<String>,
) -> ApiResult<Json<ApiResponse<TerminalLayoutResponse>>> {
    let workspace = state.workspace_service.get_workspace(guid).await?;
    match workspace {
        Some(ws) => Ok(Json(ApiResponse::success(TerminalLayoutResponse {
            layout: ws.model.terminal_layout,
            maximized_terminal_id: ws.model.maximized_terminal_id,
        }))),
        None => Ok(Json(ApiResponse::success(TerminalLayoutResponse {
            layout: None,
            maximized_terminal_id: None,
        }))),
    }
}

/// PUT /api/workspace/:guid/terminal-layout - Update terminal layout
pub async fn update_terminal_layout(
    State(state): State<AppState>,
    Path(guid): Path<String>,
    Json(payload): Json<UpdateTerminalLayoutPayload>,
) -> ApiResult<Json<ApiResponse<MessageResponse>>> {
    state
        .workspace_service
        .update_terminal_layout(guid, payload.layout)
        .await?;
    Ok(Json(ApiResponse::success(MessageResponse {
        message: "Terminal layout updated",
    })))
}

/// PUT /api/workspace/:guid/maximized-terminal-id - Update maximized terminal ID
pub async fn update_maximized_terminal_id(
    State(state): State<AppState>,
    Path(guid): Path<String>,
    Json(payload): Json<UpdateMaximizedTerminalIdPayload>,
) -> ApiResult<Json<ApiResponse<MessageResponse>>> {
    state
        .workspace_service
        .update_maximized_terminal_id(guid, payload.terminal_id)
        .await?;
    Ok(Json(ApiResponse::success(MessageResponse {
        message: "Maximized terminal ID updated",
    })))
}
