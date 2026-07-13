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

/// GET /api/project/:guid/terminal-layout - Get project terminal layout
pub async fn get_terminal_layout(
    State(state): State<AppState>,
    Path(guid): Path<String>,
) -> ApiResult<Json<ApiResponse<TerminalLayoutResponse>>> {
    let project = state.project_service.get_project(guid).await?;
    match project {
        Some(p) => Ok(Json(ApiResponse::success(TerminalLayoutResponse {
            layout: p.terminal_layout,
            maximized_terminal_id: p.maximized_terminal_id,
        }))),
        None => Ok(Json(ApiResponse::success(TerminalLayoutResponse {
            layout: None,
            maximized_terminal_id: None,
        }))),
    }
}

/// PUT /api/project/:guid/terminal-layout - Update project terminal layout
pub async fn update_terminal_layout(
    State(state): State<AppState>,
    Path(guid): Path<String>,
    Json(payload): Json<UpdateTerminalLayoutPayload>,
) -> ApiResult<Json<ApiResponse<MessageResponse>>> {
    state
        .project_service
        .update_terminal_layout(guid, payload.layout)
        .await?;
    Ok(Json(ApiResponse::success(MessageResponse {
        message: "Terminal layout updated",
    })))
}

/// PUT /api/project/:guid/maximized-terminal-id - Update project maximized terminal ID
pub async fn update_maximized_terminal_id(
    State(state): State<AppState>,
    Path(guid): Path<String>,
    Json(payload): Json<UpdateMaximizedTerminalIdPayload>,
) -> ApiResult<Json<ApiResponse<MessageResponse>>> {
    state
        .project_service
        .update_maximized_terminal_id(guid, payload.terminal_id)
        .await?;
    Ok(Json(ApiResponse::success(MessageResponse {
        message: "Maximized terminal ID updated",
    })))
}
