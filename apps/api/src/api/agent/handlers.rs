use std::path::{Path as FsPath, PathBuf};

use axum::extract::{Multipart, Path, Query, State};
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
    pub mode: Option<String>,
}

fn parse_chat_mode(mode: Option<&str>) -> Result<String, crate::error::ApiError> {
    match mode.unwrap_or("default") {
        "default" => Ok("default".to_string()),
        "wiki_ask" => Ok("wiki_ask".to_string()),
        other => Err(crate::error::ApiError::BadRequest(format!(
            "Invalid mode: {}",
            other
        ))),
    }
}

/// POST /api/agent/session - Create a new Agent chat session
/// - With workspace_id: Agent has access to workspace files
/// - Without workspace_id: General AI assistant mode, no file access
pub async fn create_agent_session(
    State(state): State<AppState>,
    Json(payload): Json<CreateAgentSessionPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let mode = parse_chat_mode(payload.mode.as_deref())?;
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

    let cwd_str = cwd.to_string_lossy().to_string();
    let session_id = state
        .agent_session_service
        .create_session_lazy(
            workspace_id_opt,
            project_id_opt,
            &payload.registry_id,
            cwd,
            payload.auth_method_id.clone(),
            &mode,
        )
        .await?;
    let title: Option<String> = None;

    Ok(Json(ApiResponse::success(json!({
        "session_id": session_id,
        "cwd": cwd_str,
        "title": title,
    }))))
}

/// POST /api/agent/sessions/{session_id}/resume - Re-create runtime for an existing session
pub async fn resume_agent_session(
    Path(session_id): Path<String>,
    Query(q): Query<ResumeAgentSessionQuery>,
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let mode = parse_chat_mode(q.mode.as_deref())?;
    let (runtime_session_id, cwd) = state
        .agent_session_service
        .resume_session_lazy(&session_id, Some(&mode))
        .await?;
    let title = state
        .agent_session_service
        .get_session(&runtime_session_id)
        .await?
        .and_then(|s| s.title);
    Ok(Json(ApiResponse::success(json!({
        "session_id": runtime_session_id,
        "cwd": cwd,
        "title": title,
    }))))
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
    pub context_type: Option<String>,
    pub context_guid: Option<String>,
    /// Filter by registry_id (ACP Agent)
    pub registry_id: Option<String>,
    /// Filter by status: active | closed
    pub status: Option<String>,
    pub mode: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: u64,
    pub cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ResumeAgentSessionQuery {
    pub mode: Option<String>,
}

fn default_limit() -> u64 {
    20
}

/// GET /api/agent/sessions - List agent chat sessions with cursor pagination
pub async fn list_agent_sessions(
    State(state): State<AppState>,
    Query(q): Query<ListAgentSessionsQuery>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    // Validate status if provided
    let status = q.status.as_ref().map(|s| match s.as_str() {
        "active" | "closed" => s.clone(),
        _ => "active".to_string(),
    });

    let mode = parse_chat_mode(q.mode.as_deref())?;
    let (items, next_cursor, has_more) = state
        .agent_session_service
        .list_sessions_with_filters(
            q.context_type.as_deref(),
            q.context_guid.as_deref(),
            q.registry_id.as_deref(),
            status.as_deref(),
            Some(&mode),
            q.limit,
            q.cursor.as_deref(),
        )
        .await?;

    let sessions: Vec<Value> = items
        .into_iter()
        .map(|s| {
            json!({
                "guid": s.guid,
                "title": s.title,
                "title_source": s.title_source,
                "context_type": s.context_type,
                "context_guid": s.context_guid,
                "registry_id": s.registry_id,
                "status": s.status,
                "mode": s.mode,
                "cwd": s.cwd,
                "created_at": s.created_at,
                "updated_at": s.updated_at,
            })
        })
        .collect();

    Ok(Json(ApiResponse::success(json!({
        "items": sessions,
        "next_cursor": next_cursor,
        "has_more": has_more,
    }))))
}

/// GET /api/agent/sessions/{session_id} - Get one session metadata
pub async fn get_agent_session(
    Path(session_id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let maybe = state.agent_session_service.get_session(&session_id).await?;
    let s = maybe.ok_or_else(|| {
        crate::error::ApiError::NotFound(format!("Session {} not found", session_id))
    })?;
    Ok(Json(ApiResponse::success(json!({
        "guid": s.guid,
        "title": s.title,
        "title_source": s.title_source,
        "context_type": s.context_type,
        "context_guid": s.context_guid,
        "registry_id": s.registry_id,
        "status": s.status,
        "mode": s.mode,
        "cwd": s.cwd,
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    }))))
}

#[derive(Debug, Deserialize)]
pub struct UpdateAgentSessionPayload {
    pub title: String,
}

/// PATCH /api/agent/sessions/:session_id - Update session title
pub async fn update_agent_session(
    Path(session_id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<UpdateAgentSessionPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    state
        .agent_session_service
        .update_session_title(&session_id, payload.title.trim())
        .await?;
    Ok(Json(ApiResponse::success(json!({ "ok": true }))))
}

/// DELETE /api/agent/sessions/:session_id - Soft delete a session
pub async fn delete_agent_session(
    Path(session_id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let temp_cwd = state
        .agent_session_service
        .delete_session(&session_id)
        .await?;
    Ok(Json(ApiResponse::success(json!({
        "ok": true,
        "temp_cwd": temp_cwd,
    }))))
}
