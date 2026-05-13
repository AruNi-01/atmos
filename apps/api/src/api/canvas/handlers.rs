use axum::{extract::State, Json};

use crate::{
    api::dto::{ApiResponse, CanvasBoardResponse, UpdateCanvasBoardPayload},
    app_state::AppState,
    error::ApiResult,
};
use core_service::SaveCanvasBoardReq;

pub async fn get_default_board(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<CanvasBoardResponse>>> {
    let board = state.canvas_service.get_default_board().await?;
    Ok(Json(ApiResponse::success(CanvasBoardResponse {
        guid: board.guid,
        slug: board.slug,
        name: board.name,
        document_json: board.document_json,
        updated_at: board.updated_at,
    })))
}

pub async fn update_default_board(
    State(state): State<AppState>,
    Json(payload): Json<UpdateCanvasBoardPayload>,
) -> ApiResult<Json<ApiResponse<CanvasBoardResponse>>> {
    let board = state
        .canvas_service
        .save_default_board(SaveCanvasBoardReq {
            document_json: payload.document_json,
        })
        .await?;
    Ok(Json(ApiResponse::success(CanvasBoardResponse {
        guid: board.guid,
        slug: board.slug,
        name: board.name,
        document_json: board.document_json,
        updated_at: board.updated_at,
    })))
}
