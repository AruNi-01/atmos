use axum::{extract::State, Json};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{info, warn};

use crate::api::dto::ApiResponse;
use crate::{app_state::AppState, error::ApiResult};

/// Gather system-level PTY usage information.
/// Works on macOS (sysctl + /dev/ttys*) and Linux (/dev/pts/*).
fn get_system_pty_info() -> Value {
    let os = std::env::consts::OS;

    // 1. Max PTY limit
    let pty_max: Option<u64> = if os == "macos" {
        std::process::Command::new("sysctl")
            .args(["-n", "kern.tty.ptmx_max"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| s.trim().parse().ok())
    } else {
        // Linux: /proc/sys/kernel/pty/max
        std::fs::read_to_string("/proc/sys/kernel/pty/max")
            .ok()
            .and_then(|s| s.trim().parse().ok())
    };

    // 2. Current PTY device count
    let pty_current: Option<u64> = if os == "macos" {
        // Count /dev/ttys* files
        std::fs::read_dir("/dev").ok().map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| e.file_name().to_string_lossy().starts_with("ttys"))
                .count() as u64
        })
    } else {
        // Linux: /proc/sys/kernel/pty/nr or count /dev/pts/*
        std::fs::read_to_string("/proc/sys/kernel/pty/nr")
            .ok()
            .and_then(|s| s.trim().parse().ok())
            .or_else(|| {
                std::fs::read_dir("/dev/pts")
                    .ok()
                    .map(|entries| entries.filter_map(|e| e.ok()).count() as u64)
            })
    };

    // 3. Usage percentage
    let usage_percent: Option<f64> = match (pty_current, pty_max) {
        (Some(cur), Some(max)) if max > 0 => Some((cur as f64 / max as f64) * 100.0),
        _ => None,
    };

    // 4. Health level
    let health = match usage_percent {
        Some(p) if p >= 90.0 => "critical",
        Some(p) if p >= 70.0 => "warning",
        Some(_) => "healthy",
        None => "unknown",
    };

    // 5. Top processes holding PTY devices (via lsof, capped)
    let top_processes = get_pty_process_summary();

    json!({
        "os": os,
        "pty_max": pty_max,
        "pty_current": pty_current,
        "usage_percent": usage_percent.map(|p| (p * 10.0).round() / 10.0),
        "health": health,
        "top_processes": top_processes,
    })
}

/// Get a summary of which commands are using the most PTY devices.
/// Returns a list of { command, count } sorted by count descending, top 10.
/// Counts unique PTY devices per process, not file descriptors.
fn get_pty_process_summary() -> Vec<Value> {
    let os = std::env::consts::OS;

    // Use shell glob for reliable PTY device enumeration
    let output = if os == "macos" {
        std::process::Command::new("sh")
            .args(["-c", "lsof /dev/ttys* 2>/dev/null"])
            .output()
    } else {
        std::process::Command::new("sh")
            .args(["-c", "lsof /dev/pts/* 2>/dev/null"])
            .output()
    };

    // Parse lsof output: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
    // Count unique PTY devices per command (process name), not file descriptors
    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            // Map command -> set of unique device names
            let mut device_counts: HashMap<String, HashSet<String>> = HashMap::new();

            for line in stdout.lines().skip(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 9 {
                    let command = parts[0].to_string();
                    let device_name = parts[parts.len() - 1].trim().to_string();
                    device_counts
                        .entry(command)
                        .or_default()
                        .insert(device_name);
                }
            }

            let mut sorted: Vec<(String, u32)> = device_counts
                .into_iter()
                .map(|(cmd, devices)| (cmd, devices.len() as u32))
                .collect();
            sorted.sort_by(|a, b| b.1.cmp(&a.1));
            sorted.truncate(10);

            sorted
                .into_iter()
                .map(|(cmd, count)| json!({ "command": cmd, "count": count }))
                .collect()
        }
        Err(e) => {
            warn!("Failed to get PTY process summary: {}", e);
            vec![]
        }
    }
}

/// Detect orphaned shell processes (PPID=1) that may be holding PTY devices.
/// Returns a list of { pid, command, elapsed } sorted by PID.
fn get_orphaned_processes() -> Vec<Value> {
    // ps -eo pid,ppid,etime,command : get PID, parent PID, elapsed time, and full command
    // Use 'command' instead of 'comm' to get full command line (not truncated)
    let output = std::process::Command::new("sh")
        .args(["-c", "ps -eo pid,ppid,etime,command 2>/dev/null"])
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let shell_names = ["zsh", "bash", "sh", "fish", "tcsh", "csh", "ksh", "dash"];

            let mut orphans: Vec<Value> = stdout
                .lines()
                .skip(1) // skip header
                .filter_map(|line| {
                    // Parse line: PID PPID ELAPSED COMMAND...
                    // The command field may contain spaces, so we need to parse carefully
                    let mut parts = line.split_whitespace();
                    let pid_str = parts.next()?;
                    let ppid_str = parts.next()?;
                    let elapsed = parts.next()?.to_string();

                    // Everything after elapsed time is the command
                    let command: String = parts.collect::<Vec<&str>>().join(" ");

                    let pid: u32 = pid_str.trim().parse().ok()?;
                    let ppid: u32 = ppid_str.trim().parse().ok()?;

                    // Only report orphans (PPID=1) that are shell processes
                    // Check if command contains any shell name (case-insensitive for robustness)
                    let command_lower = command.to_lowercase();
                    if ppid == 1 && shell_names.iter().any(|s| command_lower.contains(s)) {
                        Some(json!({
                            "pid": pid,
                            "command": command,
                            "elapsed": elapsed,
                        }))
                    } else {
                        None
                    }
                })
                .collect();

            // Sort by PID for consistency
            orphans.sort_by_key(|v| v["pid"].as_u64().unwrap_or(0));

            // Return all orphans (no limit) - user needs to see the full picture
            orphans
        }
        Err(e) => {
            warn!("Failed to detect orphaned processes: {}", e);
            vec![]
        }
    }
}

/// Gather tmux server information (socket, PID, uptime, total sessions/windows).
fn get_tmux_server_info(tmux_engine: &core_engine::TmuxEngine) -> Value {
    let socket_path = tmux_engine.socket_file_path();
    let server_pid = tmux_engine.get_server_pid();

    // Calculate uptime from server start time
    let uptime_secs: Option<u64> = tmux_engine.get_server_start_time().and_then(|start| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .ok()
            .map(|now| now.as_secs().saturating_sub(start))
    });

    // Count total sessions and windows
    let (total_sessions, total_windows) = tmux_engine
        .list_sessions()
        .map(|sessions| {
            let ws: u32 = sessions.iter().map(|s| s.windows).sum();
            (sessions.len() as u32, ws)
        })
        .unwrap_or((0, 0));

    json!({
        "socket_path": socket_path,
        "server_pid": server_pid,
        "uptime_secs": uptime_secs,
        "total_sessions": total_sessions,
        "total_windows": total_windows,
        "running": server_pid.is_some(),
    })
}

/// Gather shell environment information.
fn get_shell_env_info() -> Value {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "unknown".to_string());
    let term = std::env::var("TERM").unwrap_or_else(|_| "unknown".to_string());
    let user = std::env::var("USER")
        .or_else(|_| std::env::var("LOGNAME"))
        .unwrap_or_else(|_| "unknown".to_string());
    let home = std::env::var("HOME").unwrap_or_else(|_| "unknown".to_string());
    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();

    // Get OS version
    let os_version: Option<String> = if os == "macos" {
        std::process::Command::new("sw_vers")
            .args(["-productVersion"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
    } else {
        std::fs::read_to_string("/etc/os-release")
            .ok()
            .and_then(|content| {
                content
                    .lines()
                    .find(|l| l.starts_with("PRETTY_NAME="))
                    .map(|l| {
                        l.trim_start_matches("PRETTY_NAME=")
                            .trim_matches('"')
                            .to_string()
                    })
            })
    };

    // Get hostname
    let hostname: Option<String> = std::process::Command::new("hostname")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string());

    json!({
        "shell": shell,
        "term": term,
        "user": user,
        "home": home,
        "os": os,
        "arch": arch,
        "os_version": os_version,
        "hostname": hostname,
    })
}

/// Get detailed PTY device list with per-device process information.
/// Returns a list of { device, pid, user, command } for each PTY device.
fn get_pty_device_details() -> Vec<Value> {
    let os = std::env::consts::OS;

    let output = if os == "macos" {
        std::process::Command::new("sh")
            .args(["-c", "lsof /dev/ttys* 2>/dev/null"])
            .output()
    } else {
        std::process::Command::new("sh")
            .args(["-c", "lsof /dev/pts/* 2>/dev/null"])
            .output()
    };

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            // Parse lsof: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
            // Group by device (NAME column), collect unique pid + command per device
            let mut device_map: HashMap<String, Vec<Value>> = HashMap::new();

            for line in stdout.lines().skip(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 9 {
                    let command = parts[0].to_string();
                    let pid = parts[1].to_string();
                    let user = parts[2].to_string();
                    let fd = parts[3].to_string();
                    let device_name = parts[parts.len() - 1].to_string();

                    device_map.entry(device_name).or_default().push(json!({
                        "command": command,
                        "pid": pid,
                        "user": user,
                        "fd": fd,
                    }));
                }
            }

            let mut devices: Vec<Value> = device_map
                .into_iter()
                .map(|(device, processes)| {
                    // Deduplicate by pid within each device
                    let mut seen_pids = HashSet::new();
                    let unique_processes: Vec<Value> = processes
                        .into_iter()
                        .filter(|p| {
                            let pid = p["pid"].as_str().unwrap_or("").to_string();
                            seen_pids.insert(pid)
                        })
                        .collect();

                    json!({
                        "device": device,
                        "process_count": unique_processes.len(),
                        "processes": unique_processes,
                    })
                })
                .collect();

            // Sort by device name
            devices.sort_by(|a, b| {
                let da = a["device"].as_str().unwrap_or("");
                let db = b["device"].as_str().unwrap_or("");
                da.cmp(db)
            });

            // Cap at 100 devices
            devices.truncate(100);
            devices
        }
        Err(e) => {
            warn!("Failed to get PTY device details: {}", e);
            vec![]
        }
    }
}

/// GET /api/system/tmux-status - Check tmux installation status
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

/// GET /api/system/tmux-sessions - List all Atmos tmux sessions
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
    // 1. Try workspace lookup for name-based session (atmos_{project}_{workspace})
    if let Ok(Some(ws)) = state
        .workspace_service
        .get_workspace(workspace_id.to_string())
        .await
    {
        if let Ok(Some(proj)) = state
            .project_service
            .get_project(ws.model.project_guid.clone())
            .await
        {
            return Some(
                state
                    .terminal_service
                    .tmux_engine()
                    .get_session_name_from_names(&proj.name, &ws.model.name),
            );
        }
    }
    // 2. Try as project (main dev: workspace_id = project_id)
    // Frontend uses workspaceName "Main" for project-only (ProjectWikiTerminal, TerminalGrid),
    // so we must use "Main" to match atmos_{project}_Main session.
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
    // 3. Fallback: workspace_id as session name base
    Some(
        state
            .terminal_service
            .tmux_engine()
            .get_session_name(workspace_id),
    )
}

/// GET /api/system/project-wiki-window/:workspace_id - Check if Project Wiki tmux window exists
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

/// POST /api/system/project-wiki-window/:workspace_id - Kill the Project Wiki tmux window
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

/// GET /api/system/code-review-window/:workspace_id - Check if Code Review tmux window exists
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

/// POST /api/system/code-review-window/:workspace_id - Kill the Code Review tmux window
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

/// GET /api/system/tmux-windows/:workspace_id - List tmux windows for a workspace
pub async fn list_tmux_windows(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let windows = state
        .terminal_service
        .list_workspace_windows(&workspace_id)
        .map(|windows| {
            windows
                .into_iter()
                .map(|(index, name)| {
                    json!({
                        "index": index,
                        "name": name,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(Json(ApiResponse::success(json!({
        "windows": windows
    }))))
}

/// GET /api/system/terminal-overview - Comprehensive terminal overview for Terminal Manager UI
pub async fn get_terminal_overview(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let terminal_service = &state.terminal_service;
    let tmux_engine = terminal_service.tmux_engine();

    // 1. Active Atmos sessions (in-memory handles)
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

    // 2. Tmux status
    let tmux_installed = terminal_service.is_tmux_available();
    let tmux_version = if tmux_installed {
        terminal_service.get_tmux_version().ok().map(|v| v.raw)
    } else {
        None
    };

    // 3. Tmux sessions (all atmos_* master sessions, excluding client sessions)
    let tmux_sessions: Vec<Value> = if tmux_installed {
        tmux_engine
            .list_atmos_sessions()
            .map(|sessions| {
                sessions
                    .into_iter()
                    .filter(|s| !s.name.starts_with("atmos_client_"))
                    .map(|s| {
                        // List windows for each session
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

    // 4. Stale client sessions count (for health indicator)
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

    // 5. System-level PTY info
    let system_pty = get_system_pty_info();

    // 6. Orphaned processes
    let orphaned_processes = get_orphaned_processes();

    // 7. Tmux server info
    let tmux_server = if tmux_installed {
        get_tmux_server_info(&tmux_engine)
    } else {
        json!({"running": false})
    };

    // 8. WebSocket connection count
    let ws_connection_count = state.ws_service.connection_count().await;

    // 9. Shell environment
    let shell_env = get_shell_env_info();

    // 10. PTY device details
    let pty_devices = get_pty_device_details();

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

/// POST /api/system/terminal-cleanup - Clean up stale terminal resources
pub async fn cleanup_terminals(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let terminal_service = &state.terminal_service;
    let tmux_engine = terminal_service.tmux_engine();

    // Count stale sessions before cleanup
    let before_count = tmux_engine
        .list_sessions()
        .map(|sessions| {
            sessions
                .iter()
                .filter(|s| s.name.starts_with("atmos_client_"))
                .count()
        })
        .unwrap_or(0);

    // Perform cleanup: exclude active sessions so we don't kill live terminals
    // (killing an active session would make tmux write "[exited]" / "can't find session" into the PTY)
    terminal_service.cleanup_stale_client_sessions();

    // Count after cleanup
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

/// POST /api/system/tmux-kill-server - Kill the entire tmux server
pub async fn kill_tmux_server(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let tmux_engine = state.terminal_service.tmux_engine();

    // Shut down all in-memory sessions first
    state.terminal_service.shutdown().await;

    // Kill the tmux server
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

/// POST /api/system/tmux-kill-session - Kill a specific tmux session
pub async fn kill_tmux_session(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let session_name = body["session_name"].as_str().unwrap_or("").to_string();

    if session_name.is_empty() {
        return Ok(Json(ApiResponse::success(json!({
            "killed": false,
            "error": "session_name is required",
        }))));
    }

    let tmux_engine = state.terminal_service.tmux_engine();

    match tmux_engine.kill_session(&session_name) {
        Ok(_) => {
            info!(
                "Killed tmux session '{}' via Terminal Manager",
                session_name
            );
            Ok(Json(ApiResponse::success(json!({
                "killed": true,
                "session_name": session_name,
            }))))
        }
        Err(e) => {
            warn!("Failed to kill tmux session '{}': {}", session_name, e);
            Ok(Json(ApiResponse::success(json!({
                "killed": false,
                "error": format!("{}", e),
            }))))
        }
    }
}

/// POST /api/system/kill-orphaned-processes - Kill all orphaned processes (PPID=1 shell processes)
pub async fn kill_orphaned_processes(
    Json(body): Json<Value>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let pids: Vec<u32> = body["pids"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|v| v.as_u64().map(|n| n as u32))
        .collect();

    if pids.is_empty() {
        return Ok(Json(ApiResponse::success(json!({
            "killed": 0,
            "error": "pids array is required and must not be empty",
        }))));
    }

    let total = pids.len();
    let mut killed_count = 0;
    let mut failed_pids = Vec::new();

    for pid in &pids {
        // Use kill command to terminate the process
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
    }))))
}
/// GET /api/system/ws-connections - List active WebSocket connections
pub async fn list_ws_connections(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let connections = state.ws_service.manager().list_connections().await;
    let items: Vec<Value> = connections
        .into_iter()
        .map(|(id, client_type, idle_secs)| {
            json!({ "id": id, "client_type": client_type, "idle_secs": idle_secs })
        })
        .collect();
    Ok(Json(ApiResponse::success(json!({
        "connections": items,
        "count": items.len(),
    }))))
}

/// GET /api/system/review-skills - List code review skill definitions from ~/.atmos/skills/.system/code_review_skills
pub async fn list_review_skills() -> ApiResult<Json<ApiResponse<Value>>> {
    let home = std::env::var("HOME").unwrap_or_default();
    let base =
        std::path::PathBuf::from(&home).join(".atmos/skills/.system/code_review_skills");

    let mut skills: Vec<Value> = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&base) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let dir_name = entry.file_name().to_string_lossy().to_string();
            let skill_md = path.join("SKILL.md");

            let mut label = dir_name
                .split('-')
                .map(|w| {
                    let mut c = w.chars();
                    match c.next() {
                        None => String::new(),
                        Some(f) => f.to_uppercase().to_string() + c.as_str(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ");

            let mut description = format!("Custom review skill for {}", dir_name);
            let mut best_for =
                "Code review tasks configured in system skills".to_string();

            if skill_md.is_file() {
                if let Ok(content) = std::fs::read_to_string(&skill_md) {
                    for line in content.lines() {
                        let trimmed = line.trim();
                        if let Some(val) = trimmed.strip_prefix("bestFor:") {
                            best_for = val.trim().to_string();
                        } else if let Some(val) = trimmed.strip_prefix("description:") {
                            let val = val.trim();
                            if !val.is_empty() {
                                description = val.to_string();
                            }
                        }
                    }
                }
            }

            let badge = if dir_name.contains("expert") {
                "Backend"
            } else if dir_name.contains("react") || dir_name.contains("typescript") {
                "TS/React"
            } else if dir_name.contains("fullstack") {
                "Fullstack"
            } else {
                "Review"
            };

            // Well-known overrides
            if dir_name == "fullstack-reviewer" {
                label = "Fullstack Reviewer".into();
                if best_for == "Code review tasks configured in system skills" {
                    best_for = "Fullstack review for any project".into();
                }
            } else if dir_name == "code-review-expert" {
                label = "Backend Arch Expert".into();
                if best_for == "Code review tasks configured in system skills" {
                    best_for =
                        "Complex backend logic, API, and DB architectural reviews".into();
                }
            } else if dir_name == "typescript-react-reviewer" {
                label = "TypeScript React Expert".into();
                if best_for == "Code review tasks configured in system skills" {
                    best_for = "React/Next.js frontend applications".into();
                }
            }

            skills.push(json!({
                "id": dir_name,
                "label": label,
                "badge": badge,
                "description": description,
                "bestFor": best_for,
            }));
        }
    }

    Ok(Json(ApiResponse::success(json!({ "skills": skills }))))
}

/// POST /api/system/sync-skills - Manually trigger system skill sync
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
