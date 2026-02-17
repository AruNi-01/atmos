use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::api::dto::ApiResponse;
use crate::{app_state::AppState, error::ApiResult};

#[derive(Deserialize)]
pub struct CreateWorkspacePayload {
    pub project_guid: String,
    pub name: String,
    pub branch: String,
    pub sidebar_order: i32,
}

#[derive(Deserialize)]
pub struct UpdateNamePayload {
    pub name: String,
}

#[derive(Deserialize)]
pub struct UpdateBranchPayload {
    pub branch: String,
}

#[derive(Deserialize)]
pub struct UpdateOrderPayload {
    pub sidebar_order: i32,
}

#[derive(Deserialize)]
pub struct UpdateTerminalLayoutPayload {
    pub layout: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateMaximizedTerminalIdPayload {
    pub terminal_id: Option<String>,
}

/// GET /api/workspace/project/:project_guid - 获取项目下的所有工作区
pub async fn list_workspaces_by_project(
    State(state): State<AppState>,
    Path(project_guid): Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let workspaces = state
        .workspace_service
        .list_by_project(project_guid)
        .await?;
    Ok(Json(ApiResponse::success(json!(workspaces))))
}

/// GET /api/workspace/:guid - 获取单个工作区详情
pub async fn get_workspace(
    State(state): State<AppState>,
    Path(guid): Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let workspace = state.workspace_service.get_workspace(guid).await?;
    match workspace {
        Some(ws) => Ok(Json(ApiResponse::success(json!(ws)))),
        None => Ok(Json(ApiResponse::success(json!(null)))),
    }
}

/// POST /api/workspace - 创建新工作区
pub async fn create_workspace(
    State(state): State<AppState>,
    Json(payload): Json<CreateWorkspacePayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let workspace = state
        .workspace_service
        .create_workspace(
            payload.project_guid,
            payload.name,
            payload.branch,
            payload.sidebar_order,
        )
        .await?;
    Ok(Json(ApiResponse::success(json!(workspace))))
}

/// PUT /api/workspace/:guid/name - 更新工作区名称
pub async fn update_name(
    State(state): State<AppState>,
    Path(guid): Path<String>,
    Json(payload): Json<UpdateNamePayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    state
        .workspace_service
        .update_name(guid, payload.name)
        .await?;
    Ok(Json(ApiResponse::success(
        json!({ "message": "Workspace name updated" }),
    )))
}

/// PUT /api/workspace/:guid/branch - 更新工作区分支
pub async fn update_branch(
    State(state): State<AppState>,
    Path(guid): Path<String>,
    Json(payload): Json<UpdateBranchPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    state
        .workspace_service
        .update_branch(guid, payload.branch)
        .await?;
    Ok(Json(ApiResponse::success(
        json!({ "message": "Workspace branch updated" }),
    )))
}

/// PUT /api/workspace/:guid/order - 更新工作区排序
pub async fn update_order(
    State(state): State<AppState>,
    Path(guid): Path<String>,
    Json(payload): Json<UpdateOrderPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    state
        .workspace_service
        .update_order(guid, payload.sidebar_order)
        .await?;
    Ok(Json(ApiResponse::success(
        json!({ "message": "Workspace order updated" }),
    )))
}

/// DELETE /api/workspace/:guid - 删除工作区
pub async fn delete_workspace(
    State(state): State<AppState>,
    Path(guid): Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    state.workspace_service.delete_workspace(guid).await?;
    Ok(Json(ApiResponse::success(
        json!({ "message": "Workspace deleted" }),
    )))
}

/// GET /api/workspace/:guid/terminal-layout - 获取终端布局
pub async fn get_terminal_layout(
    State(state): State<AppState>,
    Path(guid): Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let workspace = state.workspace_service.get_workspace(guid).await?;
    match workspace {
        Some(ws) => Ok(Json(ApiResponse::success(json!({
            "layout": ws.model.terminal_layout,
            "maximized_terminal_id": ws.model.maximized_terminal_id
        })))),
        None => Ok(Json(ApiResponse::success(
            json!({ "layout": null, "maximized_terminal_id": null }),
        ))),
    }
}

/// PUT /api/workspace/:guid/terminal-layout - 更新终端布局
pub async fn update_terminal_layout(
    State(state): State<AppState>,
    Path(guid): Path<String>,
    Json(payload): Json<UpdateTerminalLayoutPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    state
        .workspace_service
        .update_terminal_layout(guid, payload.layout)
        .await?;
    Ok(Json(ApiResponse::success(
        json!({ "message": "Terminal layout updated" }),
    )))
}

/// PUT /api/workspace/:guid/maximized-terminal-id - 更新最大化终端 ID
pub async fn update_maximized_terminal_id(
    State(state): State<AppState>,
    Path(guid): Path<String>,
    Json(payload): Json<UpdateMaximizedTerminalIdPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    state
        .workspace_service
        .update_maximized_terminal_id(guid, payload.terminal_id)
        .await?;
    Ok(Json(ApiResponse::success(
        json!({ "message": "Maximized terminal ID updated" }),
    )))
}
