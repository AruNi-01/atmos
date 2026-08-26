use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;

use crate::api::dto::{ApiResponse, MessageResponse};
use crate::{app_state::AppState, error::ApiResult};

#[derive(Deserialize)]
pub struct UpdateMaximizedTerminalIdPayload {
    pub terminal_id: Option<String>,
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
