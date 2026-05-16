use crate::logging::{self, LogLevel};
use crate::preview_bridge::{self, PreviewBridgeBounds};
use crate::state::AppState;
use crate::updater;
use runtime_manager::{clear_client_session, local_computer_display_name_opt};
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;

fn normalize_control_plane_url(raw: &str) -> String {
    let t = raw.trim().trim_end_matches('/');
    if t.is_empty() {
        return "https://relay.atmos.land".to_string();
    }
    if t.starts_with("http://") || t.starts_with("https://") {
        t.to_string()
    } else {
        format!("https://{t}")
    }
}

#[derive(Debug, Deserialize)]
pub struct RelayHttpRequest {
    pub control_plane_url: String,
    pub method: String,
    pub path: String,
    pub access_token: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct RelayHttpResponse {
    pub status: u16,
    pub body: String,
}

/// Proxy control-plane HTTP from the webview (WKWebView fetch to external HTTPS often fails).
#[tauri::command]
pub async fn relay_http_request(req: RelayHttpRequest) -> Result<RelayHttpResponse, String> {
    let base = normalize_control_plane_url(&req.control_plane_url);
    let path = if req.path.starts_with('/') {
        req.path.clone()
    } else {
        format!("/{}", req.path)
    };
    let url = format!("{base}{path}");

    let method = req
        .method
        .parse::<reqwest::Method>()
        .map_err(|_| format!("Invalid HTTP method: {}", req.method))?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let mut builder = client.request(method, &url).header("Content-Type", "application/json");
    if let Some(token) = req.access_token.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        builder = builder.header("Authorization", format!("Bearer {token}"));
    }
    if let Some(body) = req.body {
        builder = builder.body(body);
    }

    let res = builder.send().await.map_err(|e| {
        format!(
            "Cannot reach control plane at {base} ({e}). Check network and firewall settings."
        )
    })?;

    let status = res.status().as_u16();
    let body = res
        .text()
        .await
        .map_err(|e| format!("Failed to read control plane response: {e}"))?;

    Ok(RelayHttpResponse { status, body })
}

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
