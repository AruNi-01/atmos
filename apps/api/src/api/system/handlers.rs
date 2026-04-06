use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use infra::utils::debug_logging::DebugLogger;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use tokio_util::io::ReaderStream;
use tracing::{info, warn};

use crate::api::dto::ApiResponse;
use crate::{app_state::AppState, error::ApiResult};

use super::diagnostics;
use super::skills;

#[derive(Deserialize)]
pub struct KillTmuxSessionPayload {
    pub session_name: String,
}

#[derive(Deserialize)]
pub struct KillOrphanedProcessesPayload {
    pub pids: Vec<u32>,
}

/// GET /api/system/tmux-status
pub async fn get_tmux_status(State(state): State<AppState>) -> ApiResult<Json<ApiResponse<Value>>> {
    let installed = state.terminal_service.is_tmux_available();

    let version = if installed {
        state
            .terminal_service
            .get_tmux_version()
            .ok()
            .map(|v| v.raw)
    } else {
        None
    };

    Ok(Json(ApiResponse::success(json!({
        "installed": installed,
        "version": version,
    }))))
}

/// GET /api/system/tmux-install-plan
pub async fn get_tmux_install_plan(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let plan = state.terminal_service.get_tmux_install_plan();

    Ok(Json(ApiResponse::success(json!({
        "installed": plan.installed,
        "supported": plan.supported,
        "platform": plan.platform,
        "package_manager": plan.package_manager,
        "package_manager_label": plan.package_manager_label,
        "command": plan.command,
        "requires_sudo": plan.requires_sudo,
        "reason": plan.reason,
    }))))
}

/// GET /api/system/tmux-sessions
pub async fn list_tmux_sessions(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let tmux_engine = state.terminal_service.tmux_engine();

    let sessions = tmux_engine
        .list_atmos_sessions()
        .map(|sessions| {
            sessions
                .into_iter()
                .map(|s| {
                    json!({
                        "name": s.name,
                        "windows": s.windows,
                        "created": s.created,
                        "attached": s.attached,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(Json(ApiResponse::success(json!({
        "sessions": sessions
    }))))
}

/// Resolve workspace_id to tmux session name. Tries workspace lookup (for name-based sessions)
/// then falls back to workspace_id-based session name.
async fn resolve_session_name(state: &AppState, workspace_id: &str) -> Option<String> {
    if let Ok(session_name) = state
        .workspace_service
        .resolve_tmux_session_name(workspace_id, &state.terminal_service.tmux_engine())
        .await
    {
        return Some(session_name);
    }

    if let Ok(Some(proj)) = state
        .project_service
        .get_project(workspace_id.to_string())
        .await
    {
        return Some(
            state
                .terminal_service
                .tmux_engine()
                .get_session_name_from_names(&proj.name, "Main"),
        );
    }
    Some(
        state
            .terminal_service
            .tmux_engine()
            .get_session_name(workspace_id),
    )
}

/// GET /api/system/project-wiki-window/:workspace_id
pub async fn check_project_wiki_window(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let session_name = match resolve_session_name(&state, &workspace_id).await {
        Some(s) => s,
        None => return Ok(Json(ApiResponse::success(json!({ "exists": false })))),
    };
    let exists = state
        .terminal_service
        .has_project_wiki_window(&session_name)
        .unwrap_or(false);
    Ok(Json(ApiResponse::success(json!({ "exists": exists }))))
}

/// POST /api/system/project-wiki-window/:workspace_id
pub async fn kill_project_wiki_window(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let session_name = match resolve_session_name(&state, &workspace_id).await {
        Some(s) => s,
        None => {
            return Ok(Json(ApiResponse::success(json!({
                "killed": false,
                "message": "Could not resolve workspace to tmux session"
            }))))
        }
    };
    match state
        .terminal_service
        .kill_project_wiki_window(&session_name)
    {
        Ok(()) => Ok(Json(ApiResponse::success(json!({
            "killed": true,
            "message": "Project Wiki window closed"
        })))),
        Err(e) => Ok(Json(ApiResponse::success(json!({
            "killed": false,
            "message": format!("{}", e)
        })))),
    }
}

/// GET /api/system/code-review-window/:workspace_id
pub async fn check_code_review_window(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let session_name = match resolve_session_name(&state, &workspace_id).await {
        Some(s) => s,
        None => return Ok(Json(ApiResponse::success(json!({ "exists": false })))),
    };
    let exists = state
        .terminal_service
        .has_code_review_window(&session_name)
        .unwrap_or(false);
    Ok(Json(ApiResponse::success(json!({ "exists": exists }))))
}

/// POST /api/system/code-review-window/:workspace_id
pub async fn kill_code_review_window(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let session_name = match resolve_session_name(&state, &workspace_id).await {
        Some(s) => s,
        None => {
            return Ok(Json(ApiResponse::success(json!({
                "killed": false,
                "message": "Could not resolve workspace to tmux session"
            }))))
        }
    };
    match state
        .terminal_service
        .kill_code_review_window(&session_name)
    {
        Ok(()) => Ok(Json(ApiResponse::success(json!({
            "killed": true,
            "message": "Code Review window closed"
        })))),
        Err(e) => Ok(Json(ApiResponse::success(json!({
            "killed": false,
            "message": format!("{}", e)
        })))),
    }
}

/// GET /api/system/tmux-windows/:workspace_id
pub async fn list_tmux_windows(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let session_name = resolve_session_name(&state, &workspace_id).await;
    let windows = session_name
        .as_deref()
        .map(|session_name| {
            state
                .terminal_service
                .tmux_engine()
                .list_windows(session_name)
                .map(|windows| {
                    windows
                        .into_iter()
                        .map(|w| {
                            json!({
                                "index": w.index,
                                "name": w.name,
                            })
                        })
                        .collect::<Vec<_>>()
                })
        })
        .transpose()
        .unwrap_or_default()
        .unwrap_or_default();

    Ok(Json(ApiResponse::success(json!({
        "windows": windows
    }))))
}

/// GET /api/system/terminal-overview
pub async fn get_terminal_overview(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let terminal_service = &state.terminal_service;
    let tmux_engine = terminal_service.tmux_engine();

    let active_sessions = terminal_service.list_session_details().await;
    let active_sessions_json: Vec<Value> = active_sessions
        .iter()
        .map(|s| {
            json!({
                "session_id": s.session_id,
                "workspace_id": s.workspace_id,
                "session_type": s.session_type,
                "project_name": s.project_name,
                "workspace_name": s.workspace_name,
                "terminal_name": s.terminal_name,
                "tmux_session": s.tmux_session,
                "tmux_window_index": s.tmux_window_index,
                "cwd": s.cwd,
                "uptime_secs": s.uptime_secs,
            })
        })
        .collect();

    let tmux_installed = terminal_service.is_tmux_available();
    let tmux_version = if tmux_installed {
        terminal_service.get_tmux_version().ok().map(|v| v.raw)
    } else {
        None
    };

    let tmux_sessions: Vec<Value> = if tmux_installed {
        tmux_engine
            .list_atmos_sessions()
            .map(|sessions| {
                sessions
                    .into_iter()
                    .filter(|s| !s.name.starts_with("atmos_client_"))
                    .map(|s| {
                        let windows: Vec<Value> = tmux_engine
                            .list_windows(&s.name)
                            .map(|ws| {
                                ws.into_iter()
                                    .map(|w| {
                                        json!({
                                            "index": w.index,
                                            "name": w.name,
                                            "active": w.active,
                                        })
                                    })
                                    .collect()
                            })
                            .unwrap_or_default();

                        json!({
                            "name": s.name,
                            "windows": s.windows,
                            "window_list": windows,
                            "created": s.created,
                            "attached": s.attached,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    } else {
        vec![]
    };

    let stale_client_count: usize = if tmux_installed {
        tmux_engine
            .list_sessions()
            .map(|sessions| {
                sessions
                    .iter()
                    .filter(|s| s.name.starts_with("atmos_client_"))
                    .count()
            })
            .unwrap_or(0)
    } else {
        0
    };

    let system_pty = diagnostics::get_system_pty_info();
    let orphaned_processes = diagnostics::get_orphaned_processes();

    let tmux_server = if tmux_installed {
        diagnostics::get_tmux_server_info(&tmux_engine)
    } else {
        json!({"running": false})
    };

    let ws_connection_count = state.ws_service.connection_count().await;
    let shell_env = diagnostics::get_shell_env_info();
    let pty_devices = diagnostics::get_pty_device_details();

    Ok(Json(ApiResponse::success(json!({
        "active_sessions": active_sessions_json,
        "active_session_count": active_sessions.len(),
        "tmux": {
            "installed": tmux_installed,
            "version": tmux_version,
            "sessions": tmux_sessions,
            "session_count": tmux_sessions.len(),
            "stale_client_sessions": stale_client_count,
        },
        "tmux_server": tmux_server,
        "system_pty": system_pty,
        "orphaned_processes": orphaned_processes,
        "orphaned_process_count": orphaned_processes.len(),
        "ws_connection_count": ws_connection_count,
        "shell_env": shell_env,
        "pty_devices": pty_devices,
    }))))
}

/// POST /api/system/terminal-cleanup
pub async fn cleanup_terminals(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let terminal_service = &state.terminal_service;
    let tmux_engine = terminal_service.tmux_engine();

    let before_count = tmux_engine
        .list_sessions()
        .map(|sessions| {
            sessions
                .iter()
                .filter(|s| s.name.starts_with("atmos_client_"))
                .count()
        })
        .unwrap_or(0);

    terminal_service.cleanup_stale_client_sessions();

    let after_count = tmux_engine
        .list_sessions()
        .map(|sessions| {
            sessions
                .iter()
                .filter(|s| s.name.starts_with("atmos_client_"))
                .count()
        })
        .unwrap_or(0);

    let cleaned = before_count.saturating_sub(after_count);

    info!(
        "Terminal cleanup complete: {} stale client sessions removed",
        cleaned
    );

    Ok(Json(ApiResponse::success(json!({
        "cleaned_client_sessions": cleaned,
        "remaining_client_sessions": after_count,
    }))))
}

/// POST /api/system/tmux-kill-server
pub async fn kill_tmux_server(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let tmux_engine = state.terminal_service.tmux_engine();

    state.terminal_service.shutdown().await;

    tmux_engine
        .kill_server()
        .map_err(|e| {
            warn!("Failed to kill tmux server: {}", e);
        })
        .ok();

    info!("Tmux server killed via Terminal Manager");

    Ok(Json(ApiResponse::success(json!({
        "killed": true,
    }))))
}

/// POST /api/system/tmux-kill-session
pub async fn kill_tmux_session(
    State(state): State<AppState>,
    Json(payload): Json<KillTmuxSessionPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    if payload.session_name.trim().is_empty() {
        return Err(crate::error::ApiError::BadRequest(
            "session_name is required".to_string(),
        ));
    }

    let tmux_engine = state.terminal_service.tmux_engine();

    match tmux_engine.kill_session(&payload.session_name) {
        Ok(_) => {
            info!(
                "Killed tmux session '{}' via Terminal Manager",
                payload.session_name
            );
            Ok(Json(ApiResponse::success(json!({
                "killed": true,
                "session_name": payload.session_name,
            }))))
        }
        Err(e) => {
            warn!(
                "Failed to kill tmux session '{}': {}",
                payload.session_name, e
            );
            Ok(Json(ApiResponse::success(json!({
                "killed": false,
                "error": format!("{}", e),
            }))))
        }
    }
}

/// POST /api/system/kill-orphaned-processes
pub async fn kill_orphaned_processes(
    Json(payload): Json<KillOrphanedProcessesPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    if payload.pids.is_empty() {
        return Err(crate::error::ApiError::BadRequest(
            "pids array must not be empty".to_string(),
        ));
    }

    let verified_orphans: HashSet<u32> = diagnostics::get_orphaned_processes()
        .iter()
        .filter_map(|v| v["pid"].as_u64().map(|n| n as u32))
        .collect();

    let total = payload.pids.len();
    let mut killed_count = 0;
    let mut failed_pids = Vec::new();
    let mut skipped_pids = Vec::new();

    for pid in &payload.pids {
        if !verified_orphans.contains(pid) {
            skipped_pids.push(*pid);
            warn!("Skipping PID {} — not a verified orphaned process", pid);
            continue;
        }

        let result = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output();

        match result {
            Ok(output) if output.status.success() => {
                killed_count += 1;
                info!("Killed orphaned process {} via Terminal Manager", pid);
            }
            _ => {
                failed_pids.push(*pid);
                warn!("Failed to kill orphaned process {}", pid);
            }
        }
    }

    Ok(Json(ApiResponse::success(json!({
        "killed": killed_count,
        "total": total,
        "failed_pids": failed_pids,
        "skipped_pids": skipped_pids,
    }))))
}

/// GET /api/system/ws-connections
pub async fn list_ws_connections(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let connections = state.ws_service.manager().list_connections().await;
    let items: Vec<Value> = connections
        .into_iter()
        .map(|c| {
            json!({ "id": c.id, "client_type": c.client_type, "idle_secs": c.connected_seconds })
        })
        .collect();
    Ok(Json(ApiResponse::success(json!({
        "connections": items,
        "count": items.len(),
    }))))
}

/// GET /api/system/review-skills
pub async fn list_review_skills() -> ApiResult<Json<ApiResponse<Value>>> {
    let skills = skills::scan_review_skills().await;
    Ok(Json(ApiResponse::success(json!({ "skills": skills }))))
}

/// POST /api/system/sync-skills
pub async fn sync_skills() -> ApiResult<Json<ApiResponse<Value>>> {
    tokio::task::spawn_blocking(|| {
        match std::panic::catch_unwind(|| {
            infra::utils::system_skill_sync::sync_system_skills_on_startup();
        }) {
            Ok(_) => tracing::info!("System skill sync completed successfully"),
            Err(e) => tracing::error!("System skill sync panicked: {:?}", e),
        }
    });
    Ok(Json(ApiResponse::success(json!({
        "initiated": true,
        "message": "System skill sync initiated"
    }))))
}

// ===== File serving for binary preview =====

#[derive(Deserialize)]
pub struct ServeFileQuery {
    pub path: String,
}

/// Map file extension to MIME type for browser-previewable formats.
fn mime_type_for_ext(ext: &str) -> &'static str {
    match ext {
        // Images
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "tiff" | "tif" => "image/tiff",
        // Video
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "ogg" => "video/ogg",
        "mov" => "video/quicktime",
        // Audio
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        // Documents
        "pdf" => "application/pdf",
        // Fallback
        _ => "application/octet-stream",
    }
}

/// GET /api/system/file?path=<absolute_path>
///
/// Streams a local file with the appropriate Content-Type header so the
/// browser can render previews of images, videos, PDFs, etc.
/// This replaces the old Next.js API route that was removed during the
/// desktop static-export migration.
pub async fn serve_file(Query(query): Query<ServeFileQuery>) -> Result<Response, Response> {
    let file_path = std::path::Path::new(&query.path);

    if !file_path.exists() {
        return Err((StatusCode::NOT_FOUND, "File not found").into_response());
    }

    if !file_path.is_file() {
        return Err((StatusCode::BAD_REQUEST, "Not a file").into_response());
    }

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let content_type = mime_type_for_ext(&ext);

    let metadata = tokio::fs::metadata(file_path).await.map_err(|e| {
        warn!("Failed to read file metadata: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read file").into_response()
    })?;

    let file = tokio::fs::File::open(file_path).await.map_err(|e| {
        warn!("Failed to open file: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "Failed to open file").into_response()
    })?;

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, metadata.len())
        .body(body)
        .unwrap()
        .into_response())
}

// ── Frontend debug log ingestion ─────────────────────────────────────────────

#[derive(serde::Deserialize)]
pub struct FrontendLogEntry {
    pub ts: String,
    pub cat: String,
    pub msg: String,
    pub data: Option<Value>,
}

#[derive(serde::Deserialize)]
pub struct FrontendLogPayload {
    /// Logger prefix, e.g. "terminal" → writes to frontend-terminal-YYYY-MM-DD.log
    pub prefix: String,
    pub entries: Vec<FrontendLogEntry>,
}

/// POST /api/system/debug-log
///
/// Receives batched log entries from the frontend and appends them to
/// `./logs/debug/frontend-<prefix>-YYYY-MM-DD.log` on the server.
pub async fn ingest_frontend_debug_log(
    Json(payload): Json<FrontendLogPayload>,
) -> impl IntoResponse {
    // Sanitize the caller-supplied prefix before embedding it in a file path.
    // Allow only alphanumeric, hyphen, and underscore — strip everything else
    // (including '/', '..', and other path-traversal sequences) so the resolved
    // path can never escape ./logs/debug/.
    let safe_prefix: String = payload
        .prefix
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if safe_prefix.is_empty() {
        return StatusCode::BAD_REQUEST;
    }
    let logger = DebugLogger::new(&format!("frontend-{}", safe_prefix));
    for entry in &payload.entries {
        let extra = entry.data.clone().map(|d| {
            if let Value::Object(map) = d {
                serde_json::json!(map)
            } else {
                d
            }
        });
        // Prefix the frontend timestamp into the message so it's visible in the log line
        let msg = format!("[fe:{}] {}", entry.ts, entry.msg);
        logger.log(&entry.cat, &msg, extra);
    }
    StatusCode::NO_CONTENT
}
