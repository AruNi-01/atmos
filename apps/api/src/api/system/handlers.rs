use axum::{
    extract::{Query, State},
    Json,
};
use core_service::build_terminal_overview_active_sessions_json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::process::Command;
use tracing::{info, warn};

use crate::api::dto::ApiResponse;
use crate::error::ApiError;
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

#[derive(Debug, Serialize)]
pub struct GhCliStatusResponse {
    installed: bool,
    authenticated: bool,
    version: Option<String>,
    username: Option<String>,
}

/// GET /api/system/gh-cli-status
pub async fn get_gh_cli_status() -> ApiResult<Json<ApiResponse<GhCliStatusResponse>>> {
    let installed = Command::new("gh").arg("--version").output().is_ok();

    let (authenticated, username) = if installed {
        // Try to get auth status using JSON format
        match Command::new("gh")
            .args(["auth", "status", "--json", "hosts"])
            .output()
        {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);

                // Debug logging to see actual output
                info!("GitHub CLI auth status stdout: {}", stdout);
                info!("GitHub CLI auth status stderr: {}", stderr);

                // Parse JSON output
                // Format: {"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"username",...}]}
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&stdout) {
                    let is_authenticated = json
                        .as_object()
                        .and_then(|obj| obj.get("hosts"))
                        .and_then(|hosts| hosts.as_object())
                        .and_then(|hosts_obj| {
                            // Find the first host with an active account
                            hosts_obj.values().find_map(|host_accounts| {
                                host_accounts.as_array().and_then(|accounts| {
                                    accounts.iter().find_map(|account| {
                                        account.as_object().and_then(|acc| {
                                            let state = acc.get("state").and_then(|s| s.as_str());
                                            let active =
                                                acc.get("active").and_then(|a| a.as_bool());
                                            // Consider authenticated if state is "success" and active is true
                                            if state == Some("success") && active == Some(true) {
                                                Some(true)
                                            } else {
                                                None
                                            }
                                        })
                                    })
                                })
                            })
                        })
                        .unwrap_or(false);

                    let user = if is_authenticated {
                        json.as_object()
                            .and_then(|obj| obj.get("hosts"))
                            .and_then(|hosts| hosts.as_object())
                            .and_then(|hosts_obj| {
                                // Find the login from the active account
                                hosts_obj.values().find_map(|host_accounts| {
                                    host_accounts.as_array().and_then(|accounts| {
                                        accounts.iter().find_map(|account| {
                                            account.as_object().and_then(|acc| {
                                                let state =
                                                    acc.get("state").and_then(|s| s.as_str());
                                                let active =
                                                    acc.get("active").and_then(|a| a.as_bool());
                                                let login =
                                                    acc.get("login").and_then(|l| l.as_str());
                                                if state == Some("success") && active == Some(true)
                                                {
                                                    login.map(|s| s.to_string())
                                                } else {
                                                    None
                                                }
                                            })
                                        })
                                    })
                                })
                            })
                    } else {
                        None
                    };

                    info!(
                        "JSON parsed - authenticated: {:?}, username: {:?}",
                        is_authenticated, user
                    );
                    (is_authenticated, user)
                } else {
                    // Fallback to text parsing if JSON fails
                    info!("JSON parsing failed, falling back to text parsing");
                    let combined = format!("{}{}", stdout, stderr);
                    let is_authenticated = combined.contains("Logged in")
                        || combined.contains("GitHub.com")
                        || !combined.contains("not logged in");
                    (is_authenticated, None)
                }
            }
            Err(_) => {
                // If JSON command fails, try basic check
                match Command::new("gh").args(["auth", "status"]).output() {
                    Ok(output) => {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        let combined = format!("{}{}", stdout, stderr);
                        let is_authenticated = combined.contains("Logged in")
                            || combined.contains("GitHub.com")
                            || !combined.contains("not logged in");
                        info!(
                            "Fallback text parsing - authenticated: {}",
                            is_authenticated
                        );
                        (is_authenticated, None)
                    }
                    Err(_) => (false, None),
                }
            }
        }
    } else {
        (false, None)
    };

    let version = if installed {
        Command::new("gh")
            .arg("--version")
            .output()
            .ok()
            .and_then(|output| {
                let stdout = String::from_utf8_lossy(&output.stdout);
                stdout.lines().next().map(String::from)
            })
    } else {
        None
    };

    Ok(Json(ApiResponse::success(GhCliStatusResponse {
        installed,
        authenticated,
        version,
        username,
    })))
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
            }))));
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
            }))));
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
                            let current_command = state
                                .terminal_service
                                .tmux_engine()
                                .get_pane_current_command(session_name, w.index)
                                .ok();
                            json!({
                                "index": w.index,
                                "name": w.name,
                                "current_command": current_command,
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

#[derive(Debug, Deserialize)]
pub struct TmuxCaptureQuery {
    pub tmux_window_name: String,
    #[serde(default = "default_tmux_capture_max_lines")]
    pub max_lines: i32,
    /// Lines already read from the bottom (0 = newest page). For pagination, pass `next_skip_lines` from the prior response.
    #[serde(default)]
    pub skip_lines: i32,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
}

fn default_tmux_capture_max_lines() -> i32 {
    300
}

/// GET /api/system/tmux-capture/:workspace_id — read-only tmux pane text for canvas copy / agent context.
pub async fn capture_tmux_window(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
    Query(query): Query<TmuxCaptureQuery>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    if !state.terminal_service.is_tmux_available() {
        return Err(ApiError::BadRequest("tmux is not available".into()));
    }

    if resolve_session_name(&state, &workspace_id).await.is_none() {
        return Err(ApiError::NotFound(
            "Could not resolve workspace to tmux session".into(),
        ));
    }

    let page = state
        .terminal_service
        .capture_window_snapshot_page(
            &workspace_id,
            &query.tmux_window_name,
            query.project_name.as_deref(),
            query.workspace_name.as_deref(),
            query.skip_lines,
            query.max_lines,
        )
        .map_err(ApiError::from)?;

    let snapshot = page.snapshot;

    Ok(Json(ApiResponse::success(json!({
        "tmux_window_name": query.tmux_window_name,
        "data": snapshot.data,
        "rows": snapshot.rows,
        "cols": snapshot.cols,
        "alternate": snapshot.alternate,
        "skip_lines": page.skip_from_bottom,
        "lines_returned": page.lines_returned,
        "has_more_older": page.has_more_older,
        "next_skip_lines": page.next_skip_from_bottom,
    }))))
}

/// GET /api/system/terminal-overview
pub async fn get_terminal_overview(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let terminal_service = &state.terminal_service;
    let tmux_engine = terminal_service.tmux_engine();

    let (active_sessions_json, active_session_count) =
        build_terminal_overview_active_sessions_json(terminal_service, &state.project_service)
            .await?;

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
        "active_session_count": active_session_count,
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

/// POST /api/system/review-skills/scaffold
///
/// Create a scaffolded custom review skill under
/// `~/.atmos/skills/.system/code_review_skills/`. Returns the new skill id / path
/// so the client can refresh its list and preselect the new skill.
pub async fn scaffold_review_skill() -> ApiResult<Json<ApiResponse<Value>>> {
    let result = skills::scaffold_review_skill()
        .await
        .map_err(ApiError::InternalError)?;

    invalidate_skills_cache();

    Ok(Json(ApiResponse::success(json!({
        "id": result.id,
        "path": result.path.to_string_lossy(),
        "needs_sync": result.needs_sync,
    }))))
}

/// POST /api/system/sync-skills
pub async fn sync_skills() -> ApiResult<Json<ApiResponse<Value>>> {
    let report = tokio::task::spawn_blocking(|| {
        infra::utils::system_skill_sync::sync_system_skills_with_report()
    })
    .await
    .map_err(|e| ApiError::InternalError(format!("Task join error: {}", e)))?;

    let completed = report.missing_skills.is_empty();
    let message = if completed {
        "System skill sync completed"
    } else {
        "System skill sync completed with missing skills"
    };

    tracing::info!(
        "System skill sync result: completed={}, versions={:?}, missing={:?}",
        completed,
        report.versions,
        report.missing_skills
    );

    invalidate_skills_cache();

    Ok(Json(ApiResponse {
        success: completed,
        data: Some(json!({
            "initiated": true,
            "completed": completed,
            "message": message,
            "versions": report.versions,
            "missingSkills": report.missing_skills
        })),
        error: if completed {
            None
        } else {
            Some("One or more system skills could not be synced".to_string())
        },
    }))
}

/// Best-effort invalidation of the skills disk cache after mutations.
fn invalidate_skills_cache() {
    if let Ok(cache) = infra::utils::disk_cache::DiskCache::new() {
        if let Err(e) = cache.remove_feature("skills") {
            tracing::warn!(error = %e, "failed to invalidate skills disk cache");
        }
    }
}
