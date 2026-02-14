use std::path::PathBuf;

use axum::extract::State;
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

    let session_id = state
        .agent_session_service
        .create_session(
            workspace_id_opt,
            &payload.registry_id,
            cwd,
        )
        .await?;

    Ok(Json(ApiResponse::success(json!({
        "session_id": session_id
    }))))
}
