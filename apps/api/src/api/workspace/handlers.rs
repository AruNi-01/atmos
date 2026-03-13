use axum::{
    extract::{Path, State},
    Json,
};
use core_service::WorkspaceDto;
use serde::Deserialize;

use crate::api::dto::{ApiResponse, MessageResponse, TerminalLayoutResponse};
use crate::{app_state::AppState, error::ApiResult};

#[derive(Deserialize)]
pub struct CreateWorkspacePayload {
    pub project_guid: String,
    pub name: String,
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

/// GET /api/workspace/project/:project_guid - List all workspaces for a project
pub async fn list_workspaces_by_project(
    State(state): State<AppState>,
    Path(project_guid): Path<String>,
) -> ApiResult<Json<ApiResponse<Vec<WorkspaceDto>>>> {
    let workspaces = state
        .workspace_service
        .list_by_project(project_guid)
        .await?;
    Ok(Json(ApiResponse::success(workspaces)))
}

/// GET /api/workspace/:guid - Get a single workspace
pub async fn get_workspace(
    State(state): State<AppState>,
    Path(guid): Path<String>,
) -> ApiResult<Json<ApiResponse<WorkspaceDto>>> {
    let workspace = state.workspace_service.get_workspace(guid).await?;
    match workspace {
        Some(ws) => Ok(Json(ApiResponse::success(ws))),
        None => Err(crate::error::ApiError::NotFound(
            "Workspace not found".to_string(),
        )),
    }
}

/// POST /api/workspace - Create a new workspace
pub async fn create_workspace(
    State(state): State<AppState>,
    Json(payload): Json<CreateWorkspacePayload>,
) -> ApiResult<Json<ApiResponse<WorkspaceDto>>> {
    let workspace = state
        .workspace_service
        .create_workspace(
            payload.project_guid,
            payload.name,
            payload.sidebar_order,
        )
        .await?;
    Ok(Json(ApiResponse::success(workspace)))
}

/// PUT /api/workspace/:guid/name - Update workspace name
pub async fn update_name(
    State(state): State<AppState>,
    Path(guid): Path<String>,
    Json(payload): Json<UpdateNamePayload>,
) -> ApiResult<Json<ApiResponse<MessageResponse>>> {
    state
        .workspace_service
        .update_name(guid, payload.name)
        .await?;
    Ok(Json(ApiResponse::success(MessageResponse {
        message: "Workspace name updated",
    })))
}

/// PUT /api/workspace/:guid/branch - Update workspace branch
pub async fn update_branch(
    State(state): State<AppState>,
    Path(guid): Path<String>,
    Json(payload): Json<UpdateBranchPayload>,
) -> ApiResult<Json<ApiResponse<MessageResponse>>> {
    state
        .workspace_service
        .update_branch(guid, payload.branch)
        .await?;
    Ok(Json(ApiResponse::success(MessageResponse {
        message: "Workspace branch updated",
    })))
}

/// PUT /api/workspace/:guid/order - Update workspace order
pub async fn update_order(
    State(state): State<AppState>,
    Path(guid): Path<String>,
    Json(payload): Json<UpdateOrderPayload>,
) -> ApiResult<Json<ApiResponse<MessageResponse>>> {
    state
        .workspace_service
        .update_order(guid, payload.sidebar_order)
        .await?;
    Ok(Json(ApiResponse::success(MessageResponse {
        message: "Workspace order updated",
    })))
}

/// DELETE /api/workspace/:guid - Delete a workspace
pub async fn delete_workspace(
    State(state): State<AppState>,
    Path(guid): Path<String>,
) -> ApiResult<Json<ApiResponse<MessageResponse>>> {
    state.workspace_service.delete_workspace(guid).await?;
    Ok(Json(ApiResponse::success(MessageResponse {
        message: "Workspace deleted",
    })))
}

/// GET /api/workspace/:guid/terminal-layout - Get terminal layout
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
        None => Err(crate::error::ApiError::NotFound(
            "Workspace not found".to_string(),
        )),
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
