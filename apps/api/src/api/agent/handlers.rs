use std::path::PathBuf;

use axum::extract::{Multipart, State};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::api::dto::ApiResponse;
use crate::app_state::AppState;
use crate::error::ApiResult;
use axum::Json;

#[derive(Deserialize)]
pub struct CreateAgentSessionPayload {
    /// Optional. When provided, Agent gets file access to the workspace. When omitted, runs as general AI assistant (no file access).
    pub workspace_id: Option<String>,
    pub registry_id: String,
}

/// POST /api/agent/session - Create a new Agent chat session
/// - With workspace_id: Agent has access to workspace files
/// - Without workspace_id: General AI assistant mode, no file access
pub async fn create_agent_session(
    State(state): State<AppState>,
    Json(payload): Json<CreateAgentSessionPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let (workspace_id_opt, cwd) = if let Some(ref wid) = payload.workspace_id {
        let workspace = state
            .workspace_service
            .get_workspace(wid.clone())
            .await?
            .ok_or_else(|| crate::error::ApiError::NotFound("Workspace not found".to_string()))?;
        (Some(wid.as_str()), PathBuf::from(workspace.local_path))
    } else {
        let temp_dir = std::env::temp_dir().join("atmos-agent");
        let _ = std::fs::create_dir_all(&temp_dir);
        (None, temp_dir)
    };

    let cwd_str = cwd.to_string_lossy().to_string();
    let session_id = state
        .agent_session_service
        .create_session(
            workspace_id_opt,
            &payload.registry_id,
            cwd,
        )
        .await?;

    Ok(Json(ApiResponse::success(json!({
        "session_id": session_id,
        "cwd": cwd_str
    }))))
}

/// POST /api/agent/upload-attachments - Upload attachment files to .atmos/attachments/ under the given path
pub async fn upload_attachments(
    mut multipart: Multipart,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let mut local_path: Option<String> = None;
    let mut saved_paths: Vec<String> = Vec::new();

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        crate::error::ApiError::BadRequest(format!("Multipart error: {}", e))
    })? {
        let name = field.name().unwrap_or("").to_string();

        if name == "local_path" {
            let text = field.text().await.map_err(|e| {
                crate::error::ApiError::BadRequest(format!("Failed to read local_path: {}", e))
            })?;
            local_path = Some(text);
            continue;
        }

        if name == "files" {
            let base_path = local_path.clone().ok_or_else(|| {
                crate::error::ApiError::BadRequest(
                    "local_path must be sent before files in multipart form".to_string(),
                )
            })?;

            let attachment_dir = PathBuf::from(&base_path)
                .join(".atmos")
                .join("attachments");
            std::fs::create_dir_all(&attachment_dir).map_err(|e| {
                crate::error::ApiError::InternalError(format!(
                    "Failed to create attachments directory: {}",
                    e
                ))
            })?;

            let filename = field
                .file_name()
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("attachment_{}", uuid::Uuid::new_v4()));

            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis();
            let safe_filename = format!(
                "{}_{}",
                ts,
                filename.replace(['/', '\\', '\0'], "_")
            );

            let file_path = attachment_dir.join(&safe_filename);
            let data = field.bytes().await.map_err(|e| {
                crate::error::ApiError::BadRequest(format!("Failed to read file data: {}", e))
            })?;

            std::fs::write(&file_path, &data).map_err(|e| {
                crate::error::ApiError::InternalError(format!("Failed to write attachment: {}", e))
            })?;

            saved_paths.push(file_path.to_string_lossy().to_string());
        }
    }

    Ok(Json(ApiResponse::success(json!({
        "paths": saved_paths
    }))))
}
