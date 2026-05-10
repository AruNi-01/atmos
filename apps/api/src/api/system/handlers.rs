use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use infra::utils::debug_logging::DebugLogger;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::process::Command;
use std::time::Duration;
use tokio_util::io::ReaderStream;
use tracing::{info, warn};

use crate::api::dto::ApiResponse;
use crate::error::ApiError;
use crate::{app_state::AppState, error::ApiResult};

use super::diagnostics;
use super::skills;

const CLI_RELEASES_API_URL: &str = "https://api.github.com/repos/AruNi-01/atmos/releases";
const CLI_TAGS_ATOM_URL: &str = "https://github.com/AruNi-01/atmos/tags.atom";
const CLI_RELEASE_TAG_PREFIX: &str = "cli-v";
const ALT_CLI_RELEASE_TAG_PREFIX: &str = "atmos-cli-v";
const GITHUB_RELEASES_BASE_URL: &str = "https://github.com/AruNi-01/atmos/releases";

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
pub struct CliVersionCheckResponse {
    installed: bool,
    current_version: Option<String>,
    latest_version: Option<String>,
    latest_tag: Option<String>,
    release_url: Option<String>,
    update_available: bool,
    install_path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

/// GET /api/system/cli-version-check
pub async fn check_cli_version() -> ApiResult<Json<ApiResponse<CliVersionCheckResponse>>> {
    let cli_path = infra::utils::atmos_cli::installed_cli_path();
    let current_version = cli_path.as_deref().and_then(read_cli_version);
    let latest = fetch_latest_cli_release().await.ok();
    let latest_version = latest.as_ref().map(|release| release.version.clone());
    let update_available = current_version
        .as_deref()
        .zip(latest_version.as_deref())
        .map(|(current, latest)| version_gt(latest, current))
        .unwrap_or(false);

    Ok(Json(ApiResponse::success(CliVersionCheckResponse {
        installed: current_version.is_some(),
        current_version,
        latest_version,
        latest_tag: latest.as_ref().map(|release| release.tag.clone()),
        release_url: latest.as_ref().map(|release| release.url.clone()),
        update_available,
        install_path: cli_path.map(|path| path.to_string_lossy().to_string()),
    })))
}

#[derive(Debug, Deserialize)]
pub struct InstallCliRequest {
    #[serde(default)]
    modify_path: bool,
}

#[derive(Debug, Serialize)]
pub struct CliInstallResponse {
    success: bool,
    version: Option<String>,
    message: String,
    path_modified: Option<bool>,
    path_modified_file: Option<String>,
}

/// POST /api/system/cli-install
///
/// Download and install the latest Atmos CLI from GitHub releases.
pub async fn install_cli(Json(payload): Json<InstallCliRequest>) -> ApiResult<Json<ApiResponse<CliInstallResponse>>> {
    let cli_path = infra::utils::atmos_cli::installed_cli_path()
        .ok_or_else(|| ApiError::InternalError("Cannot determine CLI install path".to_string()))?;

    // Ensure the bin directory exists
    if let Some(bin_dir) = cli_path.parent() {
        std::fs::create_dir_all(bin_dir)
            .map_err(|e| ApiError::InternalError(format!("Failed to create bin directory: {}", e)))?;
    }

    // Fetch the latest CLI release with assets
    let release = fetch_latest_cli_release_with_assets().await
        .map_err(|e| ApiError::InternalError(format!("Failed to fetch CLI release: {}", e)))?;

    // Determine the correct asset for the current platform
    let asset_url = get_platform_asset_url(&release.assets)
        .ok_or_else(|| ApiError::InternalError("No compatible CLI asset found for this platform".to_string()))?;

    info!("Downloading CLI from: {}", asset_url);

    // Download the asset
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .user_agent("atmos-api")
        .build()
        .map_err(|e| ApiError::InternalError(format!("Failed to create HTTP client: {}", e)))?;

    let response = client.get(&asset_url)
        .send()
        .await
        .map_err(|e| ApiError::InternalError(format!("Failed to download CLI: {}", e)))?;

    if !response.status().is_success() {
        return Err(ApiError::InternalError(format!("Failed to download CLI: HTTP {}", response.status())));
    }

    let bytes = response.bytes()
        .await
        .map_err(|e| ApiError::InternalError(format!("Failed to read CLI bytes: {}", e)))?;

    // Write to a temporary file first
    let temp_path = cli_path.with_extension("tmp");
    tokio::fs::write(&temp_path, bytes)
        .await
        .map_err(|e| ApiError::InternalError(format!("Failed to write CLI to temp file: {}", e)))?;

    // Set executable permissions
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = std::fs::metadata(&temp_path)
            .map_err(|e| ApiError::InternalError(format!("Failed to stat temp file: {}", e)))?;
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&temp_path, permissions)
            .map_err(|e| ApiError::InternalError(format!("Failed to set executable permissions: {}", e)))?;
    }

    // Replace the old CLI with the new one
    tokio::fs::rename(&temp_path, &cli_path)
        .await
        .map_err(|e| ApiError::InternalError(format!("Failed to replace CLI: {}", e)))?;

    // Verify the new version
    let new_version = read_cli_version(&cli_path);

    info!("Successfully installed Atmos CLI version: {:?}", new_version);

    // Modify shell config if requested
    let mut path_modified = false;
    let mut path_modified_file = None::<String>;
    
    if payload.modify_path {
        if let Some(bin_dir) = cli_path.parent() {
            let result = modify_shell_config(bin_dir);
            path_modified = result.modified;
            path_modified_file = result.config_file;
        }
    }

    let mut message = format!("CLI installed successfully to {}", cli_path.display());
    if path_modified {
        if let Some(file) = &path_modified_file {
            message.push_str(&format!(". Added to PATH in {}", file));
        }
    }

    Ok(Json(ApiResponse::success(CliInstallResponse {
        success: true,
        version: new_version,
        message,
        path_modified: Some(path_modified),
        path_modified_file,
    })))
}

async fn fetch_latest_cli_release_with_assets() -> Result<GithubRelease, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("atmos-api")
        .build()
        .map_err(|error| error.to_string())?;
    let releases = client
        .get(format!("{}?per_page=100", CLI_RELEASES_API_URL))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<Vec<GithubRelease>>()
        .await
        .map_err(|error| error.to_string())?;

    releases
        .into_iter()
        .find(|release| {
            !release.draft && !release.prerelease && is_cli_release_tag(&release.tag_name)
        })
        .ok_or_else(|| "No published Atmos CLI release was found".to_string())
}

fn get_platform_asset_url(assets: &[GithubAsset]) -> Option<String> {
    let (os, arch) = detect_platform();
    
    // Common asset name patterns
    let patterns = match (os.as_str(), arch.as_str()) {
        ("darwin", "aarch64") => vec![
            "aarch64-apple-darwin", "arm64-apple-darwin", "darwin-arm64", "macos-arm64",
        ],
        ("darwin", "x86_64") => vec![
            "x86_64-apple-darwin", "darwin-amd64", "macos-amd64", "macos-x86_64",
        ],
        ("linux", "aarch64") => vec![
            "aarch64-unknown-linux", "arm64-unknown-linux", "linux-arm64",
        ],
        ("linux", "x86_64") => vec![
            "x86_64-unknown-linux", "amd64-unknown-linux", "linux-amd64", "linux-x86_64",
        ],
        ("windows", "x86_64") => vec![
            "x86_64-pc-windows", "windows-amd64", "windows-x86_64",
        ],
        _ => return None,
    };

    for pattern in patterns {
        if let Some(asset) = assets.iter().find(|a| a.name.contains(pattern)) {
            return Some(asset.browser_download_url.clone());
        }
    }

    None
}

fn detect_platform() -> (String, String) {
    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();
    (os, arch)
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
        let extra = entry.data.clone();
        // Prefix the frontend timestamp into the message so it's visible in the log line
        let msg = format!("[fe:{}] {}", entry.ts, entry.msg);
        logger.log(&entry.cat, &msg, extra);
    }
    StatusCode::NO_CONTENT
}

#[derive(Debug)]
struct LatestCliRelease {
    version: String,
    tag: String,
    url: String,
}

fn read_cli_version(path: &std::path::Path) -> Option<String> {
    if !path.is_file() {
        return None;
    }
    let output = Command::new(path).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .split_whitespace()
        .last()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

async fn fetch_latest_cli_release() -> Result<LatestCliRelease, String> {
    match fetch_latest_cli_release_from_api().await {
        Ok(release) => Ok(release),
        Err(_) => fetch_latest_cli_release_from_tags_feed().await,
    }
}

async fn fetch_latest_cli_release_from_api() -> Result<LatestCliRelease, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("atmos-api")
        .build()
        .map_err(|error| error.to_string())?;
    let releases = client
        .get(format!("{}?per_page=100", CLI_RELEASES_API_URL))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<Vec<GithubRelease>>()
        .await
        .map_err(|error| error.to_string())?;

    releases
        .into_iter()
        .find(|release| {
            !release.draft && !release.prerelease && is_cli_release_tag(&release.tag_name)
        })
        .map(|release| LatestCliRelease {
            version: release_version(&release.tag_name),
            tag: release.tag_name,
            url: release.html_url,
        })
        .ok_or_else(|| "No published Atmos CLI release was found".to_string())
}

async fn fetch_latest_cli_release_from_tags_feed() -> Result<LatestCliRelease, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("atmos-api")
        .build()
        .map_err(|error| error.to_string())?;
    let feed = client
        .get(CLI_TAGS_ATOM_URL)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;
    let tag = find_latest_cli_tag_in_atom(&feed)
        .ok_or_else(|| "No cli-v tag was found in Atmos tags feed".to_string())?;
    Ok(LatestCliRelease {
        version: release_version(&tag),
        url: format!("{}/tag/{}", GITHUB_RELEASES_BASE_URL, tag),
        tag,
    })
}

fn find_latest_cli_tag_in_atom(feed: &str) -> Option<String> {
    for entry in feed.split("<entry").skip(1) {
        if let Some(tag) = extract_between(entry, "/releases/tag/", "\"")
            .or_else(|| extract_between(entry, "/releases/tag/", "<"))
            .or_else(|| extract_between(entry, "<title>", "</title>"))
        {
            let tag = tag.trim().to_string();
            if is_stable_cli_release_tag(&tag) {
                return Some(tag);
            }
        }
        // Continue to next entry if no parseable tag found
    }
    None
}

fn extract_between(value: &str, start: &str, end: &str) -> Option<String> {
    let start_index = value.find(start)? + start.len();
    let rest = &value[start_index..];
    let end_index = rest.find(end)?;
    Some(rest[..end_index].to_string())
}

fn release_version(tag: &str) -> String {
    tag.strip_prefix(CLI_RELEASE_TAG_PREFIX)
        .or_else(|| tag.strip_prefix(ALT_CLI_RELEASE_TAG_PREFIX))
        .or_else(|| tag.strip_prefix('v'))
        .unwrap_or(tag)
        .to_string()
}

fn is_cli_release_tag(tag: &str) -> bool {
    tag.starts_with(CLI_RELEASE_TAG_PREFIX) || tag.starts_with(ALT_CLI_RELEASE_TAG_PREFIX)
}

fn is_stable_cli_release_tag(tag: &str) -> bool {
    if !is_cli_release_tag(tag) {
        return false;
    }
    let version = release_version(tag);
    !version.contains('-')
}

fn version_gt(candidate: &str, current: &str) -> bool {
    let candidate_parts = version_parts(candidate);
    let current_parts = version_parts(current);
    for index in 0..candidate_parts.len().max(current_parts.len()) {
        let candidate_part = *candidate_parts.get(index).unwrap_or(&0);
        let current_part = *current_parts.get(index).unwrap_or(&0);
        if candidate_part != current_part {
            return candidate_part > current_part;
        }
    }
    false
}

fn version_parts(version: &str) -> Vec<u64> {
    version
        .split(['+', '-'])
        .next()
        .unwrap_or(version)
        .split('.')
        .map(|part| part.parse::<u64>().unwrap_or(0))
        .collect()
}

// ===== Shell Config Modification =====

struct ShellConfigResult {
    modified: bool,
    config_file: Option<String>,
}

fn modify_shell_config(bin_dir: &std::path::Path) -> ShellConfigResult {
    let home_dir = dirs::home_dir();
    if home_dir.is_none() {
        warn!("Cannot determine home directory for shell config modification");
        return ShellConfigResult {
            modified: false,
            config_file: None,
        };
    }

    let home = home_dir.unwrap();
    let shell = std::env::var("SHELL").unwrap_or_default();
    let shell_name = std::path::Path::new(&shell)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("bash");

    let config_files = get_shell_config_files(&home, shell_name);
    let bin_dir_str = bin_dir.to_string_lossy().to_string();
    let path_command = format!("export PATH=\"{}:$PATH\"", bin_dir_str);

    // Find the first writable config file
    for config_file in &config_files {
        if config_file.exists() {
            // Check if already in the file
            if let Ok(content) = std::fs::read_to_string(config_file) {
                if content.contains(&path_command) || content.contains(&bin_dir_str) {
                    info!("PATH already configured in {}", config_file.display());
                    return ShellConfigResult {
                        modified: false,
                        config_file: Some(config_file.display().to_string()),
                    };
                }
            }

            // Try to write to the file
            if let Ok(mut file) = std::fs::OpenOptions::new().append(true).open(config_file) {
                use std::io::Write;
                if writeln!(file, "\n# Atmos CLI").is_ok() 
                    && writeln!(file, "{}", path_command).is_ok() 
                {
                    info!("Successfully added Atmos CLI to PATH in {}", config_file.display());
                    return ShellConfigResult {
                        modified: true,
                        config_file: Some(config_file.display().to_string()),
                    };
                }
            }
        }
    }

    // No writable config file found
    warn!("No writable shell config file found. Tried: {:?}", config_files);
    ShellConfigResult {
        modified: false,
        config_file: None,
    }
}

fn get_shell_config_files(home: &std::path::Path, shell_name: &str) -> Vec<std::path::PathBuf> {
    let xdg_config_home = std::env::var("XDG_CONFIG_HOME")
        .map(|path| std::path::PathBuf::from(path))
        .unwrap_or_else(|_| home.join(".config"));

    match shell_name {
        "fish" => vec![
            home.join(".config/fish/config.fish"),
        ],
        "zsh" => vec![
            std::env::var("ZDOTDIR")
                .map(|path| std::path::PathBuf::from(path).join(".zshrc"))
                .unwrap_or_else(|_| home.join(".zshrc")),
            std::env::var("ZDOTDIR")
                .map(|path| std::path::PathBuf::from(path).join(".zshenv"))
                .unwrap_or_else(|_| home.join(".zshenv")),
            xdg_config_home.join("zsh/.zshrc"),
            xdg_config_home.join("zsh/.zshenv"),
        ],
        "bash" => vec![
            home.join(".bashrc"),
            home.join(".bash_profile"),
            home.join(".profile"),
            xdg_config_home.join("bash/.bashrc"),
            xdg_config_home.join("bash/.bash_profile"),
        ],
        "ash" | "sh" => vec![
            home.join(".ashrc"),
            home.join(".profile"),
            std::path::PathBuf::from("/etc/profile"),
        ],
        _ => vec![
            home.join(".bashrc"),
            home.join(".bash_profile"),
            xdg_config_home.join("bash/.bashrc"),
            xdg_config_home.join("bash/.bash_profile"),
        ],
    }
}
