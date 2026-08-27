use std::path::{Path as FsPath, PathBuf};

use axum::extract::{Multipart, State};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::api::dto::ApiResponse;
use crate::app_state::AppState;
use crate::error::ApiResult;
use axum::Json;

#[derive(Deserialize)]
pub struct LogoutAgentPayload {
    pub registry_id: String,
    pub cwd: Option<String>,
    pub auth_method_id: Option<String>,
}

/// POST /api/agent/upload-attachments - Upload attachment files to .atmos/attachments/ under the given path
pub async fn upload_attachments(mut multipart: Multipart) -> ApiResult<Json<ApiResponse<Value>>> {
    let mut local_path: Option<String> = None;
    let mut saved_paths: Vec<String> = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| crate::error::ApiError::BadRequest(format!("Multipart error: {}", e)))?
    {
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

            let attachment_dir = PathBuf::from(&base_path).join(".atmos").join("attachments");
            core_engine::ensure_project_atmos_dir(FsPath::new(&base_path)).map_err(|e| {
                crate::error::ApiError::InternalError(format!(
                    "Failed to ensure project .atmos layout: {}",
                    e
                ))
            })?;
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
            let safe_filename = format!("{}_{}", ts, filename.replace(['/', '\\', '\0'], "_"));

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

/// POST /api/agent/logout - Logout selected ACP agent
pub async fn logout_agent(
    State(state): State<AppState>,
    Json(payload): Json<LogoutAgentPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let cwd = payload.cwd.as_ref().map(PathBuf::from);
    let result = state
        .agent_session_service
        .logout_agent(&payload.registry_id, cwd, payload.auth_method_id)
        .await?;

    Ok(Json(ApiResponse::success(json!({
        "registry_id": payload.registry_id,
        "agent_info": result.agent_info,
        "capabilities": result.capabilities,
        "logged_out": result.logged_out,
        "unsupported_reason": result.unsupported_reason,
    }))))
}

#[cfg(test)]
mod tests {
    use core_service::utils::path_boundary::path_within_root;
    use std::fs;

    #[test]
    fn boundary_check_rejects_parent_escape() {
        let temp = std::env::temp_dir().join(format!("atmos-path-test-{}", uuid::Uuid::new_v4()));
        let root = temp.join("workspace");
        let src = root.join("src");
        let outside = temp.join("outside");
        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(root.join("Cargo.toml"), "").unwrap();

        assert!(path_within_root(&src.join("../Cargo.toml"), &root));
        assert!(!path_within_root(&root.join("../outside"), &root));
        let _ = fs::remove_dir_all(temp);
    }
}
