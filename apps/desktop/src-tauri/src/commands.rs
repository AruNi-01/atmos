use crate::logging::{self, LogLevel};
use crate::preview_bridge::{self, PreviewBridgeBounds};
use crate::state::AppState;
use crate::updater;
use runtime_manager::{clear_client_session, local_computer_display_name_opt};
use serde_json::json;
use std::time::Duration;

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
    let port = state
        .api_port
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?
        .ok_or_else(|| "API not ready".to_string())?;

    Ok(json!({
        "host": "127.0.0.1",
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
    session_id: String,
    url: String,
    bounds: PreviewBridgeBounds,
) -> Result<(), String> {
    preview_bridge::open_preview_window(&app, &session_id, &url, bounds)
}

#[tauri::command]
pub fn preview_bridge_update_bounds(
    app: tauri::AppHandle,
    bounds: PreviewBridgeBounds,
) -> Result<(), String> {
    preview_bridge::update_preview_bounds(&app, bounds)
}

#[tauri::command]
pub fn preview_bridge_navigate(
    app: tauri::AppHandle,
    session_id: String,
    url: String,
) -> Result<(), String> {
    preview_bridge::navigate_preview_window(&app, &session_id, &url)
}

#[tauri::command]
pub fn preview_bridge_enter_pick_mode(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<(), String> {
    preview_bridge::enter_pick_mode(&app, &session_id)
}

#[tauri::command]
pub fn preview_bridge_clear_selection(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<(), String> {
    preview_bridge::clear_selection(&app, &session_id)
}

#[tauri::command]
pub fn preview_bridge_close(app: tauri::AppHandle) -> Result<(), String> {
    preview_bridge::close_preview_window(&app)
}

#[tauri::command]
pub fn preview_bridge_show(app: tauri::AppHandle) -> Result<(), String> {
    preview_bridge::show_preview_window(&app)
}

#[tauri::command]
pub fn preview_bridge_hide(app: tauri::AppHandle) -> Result<(), String> {
    preview_bridge::hide_preview_window(&app);
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
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(6))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|error| format!("Failed to initialize preview probe: {}", error))?;

    client
        .get(parsed)
        .send()
        .await
        .map_err(|error| format!("Failed to load preview URL: {}", error))?;

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
pub async fn appshot_open_permissions(
    req: crate::appshot::types::AppshotOpenPermissionsRequest,
) -> Result<(), String> {
    crate::appshot::open_permissions(req).await
}
