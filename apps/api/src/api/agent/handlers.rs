use std::path::{Path as FsPath, PathBuf};

use axum::extract::{Multipart, Query, State};
use core_service::utils::path_boundary::path_within_root;
use core_service::ResumeNativeSessionSpec;
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
    /// Optional. When provided (and no workspace_id), context is project. When both omitted, context is temp.
    pub project_id: Option<String>,
    pub registry_id: String,
    pub auth_method_id: Option<String>,
}

#[derive(Deserialize)]
pub struct ResumeNativeAgentSessionPayload {
    pub registry_id: String,
    pub acp_session_id: String,
    pub cwd: Option<String>,
    pub workspace_id: Option<String>,
    pub project_id: Option<String>,
    pub auth_method_id: Option<String>,
}

#[derive(Deserialize)]
pub struct LogoutAgentPayload {
    pub registry_id: String,
    pub cwd: Option<String>,
    pub auth_method_id: Option<String>,
}

/// POST /api/agent/session - Create a new Agent chat session
/// - With workspace_id: Agent has access to workspace files
/// - Without workspace_id: General AI assistant mode, no file access
pub async fn create_agent_session(
    State(state): State<AppState>,
    Json(payload): Json<CreateAgentSessionPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let (workspace_id_opt, project_id_opt, cwd) = if let Some(ref wid) = payload.workspace_id {
        let workspace = state
            .workspace_service
            .get_workspace(wid.clone())
            .await?
            .ok_or_else(|| crate::error::ApiError::NotFound("Workspace not found".to_string()))?;
        (
            Some(wid.as_str()),
            None,
            PathBuf::from(workspace.local_path),
        )
    } else if let Some(ref pid) = payload.project_id {
        let project = state
            .project_service
            .get_project(pid.clone())
            .await?
            .ok_or_else(|| crate::error::ApiError::NotFound("Project not found".to_string()))?;
        let main_path = PathBuf::from(&project.main_file_path);
        let cwd = if main_path.is_dir() {
            main_path
        } else {
            main_path.parent().map(PathBuf::from).unwrap_or(main_path)
        };
        (None, Some(pid.as_str()), cwd)
    } else {
        let home_dir = std::env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| std::env::temp_dir());
        let sessions_root = home_dir.join(".atmos").join("agent").join("sessions");
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let temp_session_dir = format!("temp_session_{}_{}", uuid::Uuid::new_v4(), ts);
        let temp_dir = sessions_root.join(temp_session_dir);
        let _ = std::fs::create_dir_all(&temp_dir);
        (None, None, temp_dir)
    };

    let session = state
        .agent_session_service
        .create_session_lazy(
            workspace_id_opt,
            project_id_opt,
            &payload.registry_id,
            cwd,
            payload.auth_method_id.clone(),
        )
        .await?;

    Ok(Json(ApiResponse::success(json!({
        "runtime_session_id": session.runtime_session_id,
        "registry_id": session.registry_id,
        "cwd": session.cwd,
        "status": session.status,
    }))))
}

/// POST /api/agent/session/resume - Re-create runtime for a native ACP session
pub async fn resume_agent_session(
    State(state): State<AppState>,
    Json(payload): Json<ResumeNativeAgentSessionPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let requested_cwd = payload
        .cwd
        .as_deref()
        .map(parse_absolute_resume_cwd)
        .transpose()?;
    let (cwd, allow_file_access) = if let Some(ref wid) = payload.workspace_id {
        let workspace = state
            .workspace_service
            .get_workspace(wid.clone())
            .await?
            .ok_or_else(|| crate::error::ApiError::NotFound("Workspace not found".to_string()))?;
        let root = PathBuf::from(workspace.local_path);
        let cwd = requested_cwd.unwrap_or_else(|| root.clone());
        if !path_within_root(&cwd, &root) {
            return Err(crate::error::ApiError::BadRequest(
                "ACP session cwd is outside the selected workspace".to_string(),
            ));
        }
        (Some(cwd), true)
    } else if let Some(ref pid) = payload.project_id {
        let project = state
            .project_service
            .get_project(pid.clone())
            .await?
            .ok_or_else(|| crate::error::ApiError::NotFound("Project not found".to_string()))?;
        let main_path = PathBuf::from(&project.main_file_path);
        let root = if main_path.is_dir() {
            main_path
        } else {
            main_path.parent().map(PathBuf::from).unwrap_or(main_path)
        };
        let cwd = requested_cwd.unwrap_or_else(|| root.clone());
        if !path_within_root(&cwd, &root) {
            return Err(crate::error::ApiError::BadRequest(
                "ACP session cwd is outside the selected project".to_string(),
            ));
        }
        (Some(cwd), true)
    } else {
        (requested_cwd, false)
    };

    let session = state
        .agent_session_service
        .resume_native_session_lazy(ResumeNativeSessionSpec {
            registry_id: payload.registry_id.clone(),
            acp_session_id: payload.acp_session_id.clone(),
            cwd,
            allow_file_access,
            workspace_id: payload.workspace_id.clone(),
            project_id: payload.project_id.clone(),
            auth_method_id: payload.auth_method_id,
        })
        .await?;
    Ok(Json(ApiResponse::success(json!({
        "runtime_session_id": session.runtime_session_id,
        "registry_id": session.registry_id,
        "acp_session_id": payload.acp_session_id,
        "cwd": session.cwd,
        "status": session.status,
    }))))
}

fn parse_absolute_resume_cwd(cwd: &str) -> Result<PathBuf, crate::error::ApiError> {
    let path = PathBuf::from(cwd);
    if !path.is_absolute() {
        return Err(crate::error::ApiError::BadRequest(
            "ACP session cwd must be an absolute path".to_string(),
        ));
    }
    Ok(path)
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
            ensure_atmos_attachments_gitignore(FsPath::new(&base_path), &attachment_dir)?;
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

fn ensure_atmos_attachments_gitignore(
    base_path: &FsPath,
    _attachment_dir: &FsPath,
) -> Result<(), crate::error::ApiError> {
    if !is_inside_git_repo(base_path) {
        return Ok(());
    }

    let atmos_dir = base_path.join(".atmos");
    std::fs::create_dir_all(&atmos_dir).map_err(|e| {
        crate::error::ApiError::InternalError(format!("Failed to create .atmos directory: {}", e))
    })?;

    let gitignore_path = atmos_dir.join(".gitignore");
    let rule = "attachments/";
    let existing = if gitignore_path.exists() {
        std::fs::read_to_string(&gitignore_path).map_err(|e| {
            crate::error::ApiError::InternalError(format!(
                "Failed to read .atmos/.gitignore: {}",
                e
            ))
        })?
    } else {
        String::new()
    };

    let already_present = existing
        .lines()
        .map(str::trim)
        .any(|line| line == rule || line == "/attachments/");
    if already_present {
        return Ok(());
    }

    let mut updated = existing;
    if !updated.is_empty() && !updated.ends_with('\n') {
        updated.push('\n');
    }
    updated.push_str(rule);
    updated.push('\n');

    std::fs::write(&gitignore_path, updated).map_err(|e| {
        crate::error::ApiError::InternalError(format!("Failed to write .atmos/.gitignore: {}", e))
    })?;

    Ok(())
}

fn is_inside_git_repo(path: &FsPath) -> bool {
    path.ancestors()
        .any(|ancestor| ancestor.join(".git").exists())
}

#[derive(Debug, Deserialize)]
pub struct ListAgentSessionsQuery {
    pub registry_id: String,
    pub cwd: Option<String>,
    /// Atmos response cap for agents that return an unpaginated result.
    ///
    /// ACP `session/list` itself is cursor-paginated but does not define a
    /// client-supplied page-size field. Agents own upstream page size.
    #[serde(default = "default_limit")]
    pub limit: u64,
    pub cursor: Option<String>,
    pub auth_method_id: Option<String>,
}

const MAX_UNPAGINATED_SESSION_ITEMS: u64 = 20;

fn default_limit() -> u64 {
    MAX_UNPAGINATED_SESSION_ITEMS
}

/// GET /api/agent/sessions - List agent chat sessions with cursor pagination
pub async fn list_agent_sessions(
    State(state): State<AppState>,
    Query(q): Query<ListAgentSessionsQuery>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let cwd = q.cwd.as_ref().map(PathBuf::from);
    let mut native = state
        .agent_session_service
        .list_native_sessions(&q.registry_id, cwd, q.cursor, q.auth_method_id)
        .await?;

    let response_limit = q.limit.clamp(1, MAX_UNPAGINATED_SESSION_ITEMS) as usize;
    let truncated = native.next_cursor.is_none() && native.sessions.len() > response_limit;
    if truncated {
        tracing::warn!(
            registry_id = %q.registry_id,
            returned = native.sessions.len(),
            limit = response_limit,
            "ACP session/list returned an unpaginated result larger than Atmos will expose"
        );
        native.sessions.truncate(response_limit);
    }

    let registry_id = q.registry_id.clone();
    let sessions: Vec<Value> = native
        .sessions
        .into_iter()
        .map(|s| {
            json!({
                "registry_id": registry_id.clone(),
                "acp_session_id": s.acp_session_id,
                "title": s.title,
                "cwd": s.cwd,
                "updated_at": s.updated_at,
            })
        })
        .collect();

    Ok(Json(ApiResponse::success(json!({
        "registry_id": q.registry_id,
        "agent_info": native.agent_info,
        "capabilities": native.capabilities,
        "items": sessions,
        "next_cursor": native.next_cursor,
        "truncated": truncated,
        "unsupported_reason": native.unsupported_reason,
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
    use super::parse_absolute_resume_cwd;
    use core_service::utils::path_boundary::path_within_root;
    use std::path::Path;

    #[test]
    fn resume_cwd_must_be_absolute() {
        assert!(parse_absolute_resume_cwd("relative/path").is_err());
        assert!(parse_absolute_resume_cwd("/tmp/atmos").is_ok());
    }

    #[test]
    fn boundary_check_rejects_parent_escape() {
        assert!(path_within_root(
            Path::new("/tmp/workspace/src/../Cargo.toml"),
            Path::new("/tmp/workspace")
        ));
        assert!(!path_within_root(
            Path::new("/tmp/workspace/../outside"),
            Path::new("/tmp/workspace")
        ));
    }
}
