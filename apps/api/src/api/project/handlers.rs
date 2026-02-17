use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::api::dto::ApiResponse;
use crate::{app_state::AppState, error::ApiResult};

#[derive(Deserialize)]
pub struct CreateProjectPayload {
    pub name: String,
    pub main_file_path: String,
    pub sidebar_order: i32,
    pub border_color: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateColorPayload {
    pub border_color: Option<String>,
}

pub async fn list_projects(State(state): State<AppState>) -> ApiResult<Json<ApiResponse<Value>>> {
    let projects = state.project_service.list_projects().await?;
    Ok(Json(ApiResponse::success(json!(projects))))
}

pub async fn create_project(
    State(state): State<AppState>,
    Json(payload): Json<CreateProjectPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let project = state
        .project_service
        .create_project(
            payload.name,
            payload.main_file_path,
            payload.sidebar_order,
            payload.border_color,
        )
        .await?;
    Ok(Json(ApiResponse::success(json!(project))))
}

pub async fn delete_project(
    State(state): State<AppState>,
    Path(guid): Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    state.project_service.delete_project(guid).await?;
    Ok(Json(ApiResponse::success(
        json!({ "message": "Project deleted" }),
    )))
}

pub async fn update_color(
    State(state): State<AppState>,
    Path(guid): Path<String>,
    Json(payload): Json<UpdateColorPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    state
        .project_service
        .update_color(guid, payload.border_color)
        .await?;
    Ok(Json(ApiResponse::success(
        json!({ "message": "Color updated" }),
    )))
}

pub async fn validate_git(Json(payload): Json<Value>) -> ApiResult<Json<ApiResponse<Value>>> {
    let path = payload["path"].as_str().unwrap_or("");
    let is_git = std::path::Path::new(path).join(".git").exists();

    if is_git {
        let name = std::path::Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("New Project");
        Ok(Json(ApiResponse::success(
            json!({ "isValid": true, "name": name }),
        )))
    } else {
        Ok(Json(ApiResponse::success(json!({ "isValid": false }))))
    }
}
