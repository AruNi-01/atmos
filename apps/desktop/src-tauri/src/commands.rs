use crate::logging::{self, LogLevel};
use crate::preview_bridge::{self, PreviewBridgeBounds};
use crate::state::AppState;
use crate::updater;
use runtime_manager::{clear_client_session, local_computer_display_name_opt};
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime};
use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};

#[cfg(target_os = "macos")]
use tauri::{LogicalPosition, Position, TitleBarStyle};

const AGENT_CHAT_WINDOW_LABEL: &str = "agent-chat";
const PREVIEW_BROWSER_WINDOW_LABEL: &str = "preview-browser";
const AGENT_CHAT_HANDOFF_MAX_AGE: Duration = Duration::from_secs(12 * 60 * 60);

#[tauri::command]
pub fn clear_client_session_cmd() -> Result<(), String> {
    clear_client_session()
}

#[tauri::command]
pub fn get_local_computer_display_name() -> Result<Option<String>, String> {
    Ok(local_computer_display_name_opt())
}

#[tauri::command]
pub fn get_api_config(state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
    let port = current_api_port(&state)?;

    Ok(json!({
        "host": crate::runtime::API_BIND_HOST,
        "port": port,
    }))
}

#[tauri::command]
pub fn get_version_info(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let version = app.package_info().version.to_string();
    let version_type = updater::detect_version_type(&version);

    Ok(json!({
        "version": version,
        "version_type": version_type.to_string(),
    }))
}

#[tauri::command]
pub fn open_agent_chat_window(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    locale: Option<String>,
    agent: Option<String>,
    session: Option<String>,
    session_cwd: Option<String>,
    workspace_id: Option<String>,
    project_id: Option<String>,
    handoff_token: Option<String>,
) -> Result<(), String> {
    let api_port = current_api_port(&state)?;
    let url = agent_chat_window_url(
        locale.as_deref(),
        api_port,
        agent.as_deref(),
        session.as_deref(),
        session_cwd.as_deref(),
        workspace_id.as_deref(),
        project_id.as_deref(),
        handoff_token.as_deref(),
    )?;

    if let Some(existing) = app.get_webview_window(AGENT_CHAT_WINDOW_LABEL) {
        let _ = existing.navigate(url);
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }

    let mut builder =
        WebviewWindowBuilder::new(&app, AGENT_CHAT_WINDOW_LABEL, app_window_webview_url(&url))
            .title("Atmos Chat")
            .inner_size(1180.0, 820.0)
            .min_inner_size(720.0, 520.0)
            .resizable(true)
            .decorations(true);

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .hidden_title(true)
            .title_bar_style(TitleBarStyle::Overlay)
            .traffic_light_position(Position::Logical(LogicalPosition::new(16.0, 18.0)));
    }

    let window = builder
        .transparent(false)
        .shadow(true)
        .visible(false)
        .build()
        .map_err(|error| format!("failed to open Agent Chat window: {error}"))?;

    let _ = window.center();
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
pub fn write_agent_chat_handoff(
    app: tauri::AppHandle,
    token: Option<String>,
    snapshot: serde_json::Value,
) -> Result<String, String> {
    let dir = agent_chat_handoff_dir(&app);
    fs::create_dir_all(&dir)
        .map_err(|error| format!("failed to create Agent Chat handoff directory: {error}"))?;
    cleanup_agent_chat_handoff_dir(&dir);

    let token = match token {
        Some(value) if is_valid_handoff_token(&value) => value,
        Some(_) => return Err("invalid Agent Chat handoff token".to_string()),
        None => uuid::Uuid::new_v4().to_string(),
    };
    let path = agent_chat_handoff_path(&dir, &token)?;
    let tmp_path = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec(&snapshot)
        .map_err(|error| format!("failed to serialize Agent Chat handoff: {error}"))?;

    fs::write(&tmp_path, bytes)
        .map_err(|error| format!("failed to write Agent Chat handoff: {error}"))?;
    fs::rename(&tmp_path, &path).map_err(|error| {
        let _ = fs::remove_file(&tmp_path);
        format!("failed to publish Agent Chat handoff: {error}")
    })?;

    Ok(token)
}

#[tauri::command]
pub fn read_agent_chat_handoff(
    app: tauri::AppHandle,
    token: String,
) -> Result<Option<serde_json::Value>, String> {
    if !is_valid_handoff_token(&token) {
        return Err("invalid Agent Chat handoff token".to_string());
    }

    let dir = agent_chat_handoff_dir(&app);
    let path = agent_chat_handoff_path(&dir, &token)?;
    if !path.exists() {
        return Ok(None);
    }

    let bytes =
        fs::read(&path).map_err(|error| format!("failed to read Agent Chat handoff: {error}"))?;
    let _ = fs::remove_file(&path);
    let snapshot = serde_json::from_slice(&bytes)
        .map_err(|error| format!("failed to parse Agent Chat handoff: {error}"))?;
    Ok(Some(snapshot))
}

#[tauri::command]
pub fn open_preview_browser_window(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    locale: Option<String>,
    url: Option<String>,
    workspace_id: Option<String>,
    project_id: Option<String>,
) -> Result<(), String> {
    let api_port = current_api_port(&state)?;
    let url = preview_browser_window_url(
        locale.as_deref(),
        api_port,
        url.as_deref(),
        workspace_id.as_deref(),
        project_id.as_deref(),
    )?;

    if let Some(existing) = app.get_webview_window(PREVIEW_BROWSER_WINDOW_LABEL) {
        let _ = existing.navigate(url);
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(
        &app,
        PREVIEW_BROWSER_WINDOW_LABEL,
        app_window_webview_url(&url),
    )
    .title("Atmos Browser")
    .inner_size(1280.0, 860.0)
    .min_inner_size(760.0, 520.0)
    .resizable(true)
    .decorations(true);

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .hidden_title(true)
            .title_bar_style(TitleBarStyle::Overlay)
            .traffic_light_position(Position::Logical(LogicalPosition::new(16.0, 16.0)));
    }

    let window = builder
        .transparent(false)
        .shadow(true)
        .visible(false)
        .build()
        .map_err(|error| format!("failed to open Preview browser window: {error}"))?;

    let _ = window.center();
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
pub fn write_log(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    level: String,
    message: String,
) -> Result<(), String> {
    let level = LogLevel::parse(&level);
    if level < state.desktop_log_level {
        return Ok(());
    }

    let log_file = logging::app_log_path(&app, "desktop.log");
    logging::append_log_with_level(&log_file, level, &message);
    Ok(())
}

#[tauri::command]
pub async fn open_in_external_editor(editor: String, path: String) -> Result<(), String> {
    let cmd = match editor.as_str() {
        "vscode" => "code",
        "cursor" => "cursor",
        "zed" => "zed",
        "idea" => "idea",
        "vim" => "vim",
        _ => return Err(format!("Unknown editor: {}", editor)),
    };

    tokio::process::Command::new(cmd)
        .arg(path)
        .spawn()
        .map_err(|e| format!("Failed to open editor '{}': {}", cmd, e))?;

    Ok(())
}

#[tauri::command]
pub async fn send_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn preview_bridge_open(
    app: tauri::AppHandle,
    window: tauri::Window,
    session_id: String,
    url: String,
    bounds: PreviewBridgeBounds,
) -> Result<(), String> {
    preview_bridge::open_preview_window(&app, window.label(), &session_id, &url, bounds)
}

#[tauri::command]
pub fn preview_bridge_update_bounds(
    app: tauri::AppHandle,
    session_id: String,
    bounds: PreviewBridgeBounds,
) -> Result<(), String> {
    preview_bridge::update_preview_bounds(&app, &session_id, bounds)
}

#[tauri::command]
pub fn preview_bridge_set_detached(
    app: tauri::AppHandle,
    window: tauri::Window,
    session_id: String,
    url: String,
    bounds: PreviewBridgeBounds,
    detached: bool,
) -> Result<(), String> {
    preview_bridge::set_preview_detached(&app, window.label(), &session_id, &url, bounds, detached)
}

#[tauri::command]
pub fn preview_bridge_navigate(
    app: tauri::AppHandle,
    window: tauri::Window,
    session_id: String,
    url: String,
) -> Result<(), String> {
    preview_bridge::navigate_preview_window(&app, window.label(), &session_id, &url)
}

#[tauri::command]
pub fn preview_bridge_enter_pick_mode(
    app: tauri::AppHandle,
    window: tauri::Window,
    session_id: String,
) -> Result<(), String> {
    preview_bridge::enter_pick_mode(&app, window.label(), &session_id)
}

#[tauri::command]
pub fn preview_bridge_clear_selection(
    app: tauri::AppHandle,
    window: tauri::Window,
    session_id: String,
) -> Result<(), String> {
    preview_bridge::clear_selection(&app, window.label(), &session_id)
}

#[tauri::command]
pub fn preview_bridge_clear_annotations(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<(), String> {
    preview_bridge::clear_annotations(&app, &session_id)
}

#[tauri::command]
pub fn preview_bridge_open_devtools(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<(), String> {
    preview_bridge::open_preview_devtools(&app, &session_id)
}

#[tauri::command]
pub fn preview_bridge_close(app: tauri::AppHandle, session_id: String) -> Result<(), String> {
    preview_bridge::close_preview_window(&app, &session_id)
}

#[tauri::command]
pub fn preview_bridge_show(app: tauri::AppHandle, session_id: String) -> Result<(), String> {
    preview_bridge::show_preview_window(&app, &session_id)
}

#[tauri::command]
pub fn preview_bridge_hide(app: tauri::AppHandle, session_id: String) -> Result<(), String> {
    preview_bridge::hide_preview_window(&app, &session_id);
    Ok(())
}

#[tauri::command]
pub fn preview_bridge_event(
    app: tauri::AppHandle,
    payload: serde_json::Value,
) -> Result<(), String> {
    preview_bridge::forward_runtime_event(&app, payload)
}

#[tauri::command]
pub async fn preview_bridge_probe_url(url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|error| format!("Invalid URL: {}", error))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Ok(());
    }
    Ok(())
}

#[tauri::command]
pub async fn appshot_status(
    app: tauri::AppHandle,
) -> Result<crate::appshot::types::AppshotStatus, String> {
    crate::appshot::status(app).await
}

#[tauri::command]
pub async fn appshot_accept_pending(
    preview_id: String,
) -> Result<crate::appshot::types::AppshotAcceptResponse, String> {
    crate::appshot::accept_pending(preview_id).await
}

#[tauri::command]
pub async fn appshot_discard_pending(preview_id: String) -> Result<(), String> {
    crate::appshot::discard_pending(preview_id).await
}

#[tauri::command]
pub async fn appshot_set_pending_auto_accept(
    req: crate::appshot::types::AppshotPendingAutoAcceptRequest,
) -> Result<(), String> {
    crate::appshot::set_pending_auto_accept(req).await
}

#[tauri::command]
pub async fn appshot_list_records(
) -> Result<Vec<crate::appshot::types::AppshotRecordListItem>, String> {
    crate::appshot::list_records().await
}

#[tauri::command]
pub async fn appshot_read_records(
    req: crate::appshot::types::AppshotReadRecordsRequest,
) -> Result<Vec<crate::appshot::types::AppshotRecordDetail>, String> {
    crate::appshot::read_records(req).await
}

#[tauri::command]
pub async fn appshot_read_snapshot(
    timestamp: String,
) -> Result<crate::appshot::types::AppshotSnapshotView, String> {
    crate::appshot::read_snapshot(timestamp).await
}

#[tauri::command]
pub async fn appshot_copy_record(
    timestamp: String,
) -> Result<crate::appshot::types::AppshotCopyResponse, String> {
    crate::appshot::copy_record(timestamp).await
}

#[tauri::command]
pub async fn appshot_delete_record(timestamp: String) -> Result<(), String> {
    crate::appshot::delete_record(timestamp).await
}

#[tauri::command]
pub async fn appshot_trigger_capture(app: tauri::AppHandle) -> Result<(), String> {
    crate::appshot::trigger_capture(app).await;
    Ok(())
}

#[tauri::command]
pub async fn appshot_open_permissions(
    req: crate::appshot::types::AppshotOpenPermissionsRequest,
) -> Result<(), String> {
    crate::appshot::open_permissions(req).await
}

#[tauri::command]
pub fn appshot_show_permissions_window(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    locale: Option<String>,
) -> Result<(), String> {
    let api_port = current_api_port(&state)?;
    crate::appshot::show_permissions_window(app, locale, api_port)
}

fn agent_chat_window_url(
    _locale: Option<&str>,
    _api_port: u16,
    agent: Option<&str>,
    session: Option<&str>,
    session_cwd: Option<&str>,
    workspace_id: Option<&str>,
    project_id: Option<&str>,
    handoff_token: Option<&str>,
) -> Result<tauri::Url, String> {
    let mut url = app_window_url("agent-chat/")
        .map_err(|error| format!("invalid Agent Chat window URL: {error}"))?;

    {
        let mut query = url.query_pairs_mut();
        if let Some(value) = trim_query_value(agent) {
            query.append_pair("agent", value);
        }
        if let Some(value) = trim_query_value(session) {
            query.append_pair("session", value);
        }
        if let Some(value) = trim_query_value(session_cwd) {
            query.append_pair("sessionCwd", value);
        }
        if let Some(value) = trim_query_value(workspace_id) {
            query.append_pair("workspaceId", value);
        }
        if let Some(value) = trim_query_value(project_id) {
            query.append_pair("projectId", value);
        }
        if let Some(value) = trim_query_value(handoff_token) {
            query.append_pair("handoffToken", value);
        }
    }

    Ok(url)
}

fn preview_browser_window_url(
    _locale: Option<&str>,
    _api_port: u16,
    preview_url: Option<&str>,
    workspace_id: Option<&str>,
    project_id: Option<&str>,
) -> Result<tauri::Url, String> {
    let mut url = app_window_url("preview/")
        .map_err(|error| format!("invalid Preview browser window URL: {error}"))?;

    {
        let mut query = url.query_pairs_mut();
        if let Some(value) = trim_query_value(preview_url) {
            query.append_pair("pvUrl", value);
        }
        if let Some(value) = trim_query_value(workspace_id) {
            query.append_pair("workspaceId", value);
        }
        if let Some(value) = trim_query_value(project_id) {
            query.append_pair("projectId", value);
        }
    }

    Ok(url)
}

fn app_window_url(path: &str) -> Result<Url, String> {
    let normalized = path.trim_start_matches('/');
    format!("tauri://localhost/{normalized}")
        .parse::<Url>()
        .map_err(|error| error.to_string())
}

fn app_window_webview_url(url: &Url) -> WebviewUrl {
    let mut path = url.path().trim_start_matches('/').to_string();
    if let Some(query) = url.query() {
        path.push('?');
        path.push_str(query);
    }
    if let Some(fragment) = url.fragment() {
        path.push('#');
        path.push_str(fragment);
    }
    WebviewUrl::App(PathBuf::from(path))
}

fn trim_query_value(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn agent_chat_handoff_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("atmos"))
        .join("handoff")
        .join("agent-chat")
}

fn agent_chat_handoff_path(dir: &std::path::Path, token: &str) -> Result<PathBuf, String> {
    if !is_valid_handoff_token(token) {
        return Err("invalid Agent Chat handoff token".to_string());
    }
    Ok(dir.join(format!("{token}.json")))
}

fn is_valid_handoff_token(token: &str) -> bool {
    let len = token.len();
    (8..=128).contains(&len)
        && token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn cleanup_agent_chat_handoff_dir(dir: &std::path::Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let now = SystemTime::now();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let Ok(modified) = metadata.modified() else {
            continue;
        };

        if now
            .duration_since(modified)
            .map(|age| age > AGENT_CHAT_HANDOFF_MAX_AGE)
            .unwrap_or(false)
        {
            let _ = fs::remove_file(path);
        }
    }
}

fn current_api_port(state: &tauri::State<'_, AppState>) -> Result<u16, String> {
    if let Some(port) = *state
        .api_port
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?
    {
        return Ok(port);
    }

    runtime_manager::read_runtime_manifest()
        .map_err(|error| format!("API not ready: {error}"))?
        .map(|manifest| manifest.api.port)
        .ok_or_else(|| "API not ready".to_string())
}
