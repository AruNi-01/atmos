use axum::{extract::State, Json};

use crate::{
    api::dto::{ApiResponse, TerminalCanvasBoardResponse, UpdateTerminalCanvasBoardPayload},
    app_state::AppState,
    error::ApiResult,
};
use core_service::SaveTerminalCanvasBoardReq;

pub async fn get_default_board(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<TerminalCanvasBoardResponse>>> {
    let board = state.terminal_canvas_service.get_default_board().await?;
    Ok(Json(ApiResponse::success(TerminalCanvasBoardResponse {
        guid: board.guid,
        slug: board.slug,
        name: board.name,
        document_json: board.document_json,
        updated_at: board.updated_at,
    })))
}

pub async fn update_default_board(
    State(state): State<AppState>,
    Json(payload): Json<UpdateTerminalCanvasBoardPayload>,
) -> ApiResult<Json<ApiResponse<TerminalCanvasBoardResponse>>> {
    let board = state
        .terminal_canvas_service
        .save_default_board(SaveTerminalCanvasBoardReq {
            document_json: payload.document_json,
        })
        .await?;
    Ok(Json(ApiResponse::success(TerminalCanvasBoardResponse {
        guid: board.guid,
        slug: board.slug,
        name: board.name,
        document_json: board.document_json,
        updated_at: board.updated_at,
    })))
}
