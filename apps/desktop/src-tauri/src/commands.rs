use crate::logging::{self, LogLevel};
use crate::preview_bridge::{self, PreviewBridgeBounds};
use crate::state::AppState;
use serde_json::json;

#[tauri::command]
pub fn get_api_config(state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
    let port = state
        .api_port
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?
        .ok_or_else(|| "API not ready".to_string())?;

    Ok(json!({
        "port": port,
        "token": state.api_token,
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
pub fn preview_bridge_event(app: tauri::AppHandle, payload: serde_json::Value) -> Result<(), String> {
    preview_bridge::forward_runtime_event(&app, payload)
}
