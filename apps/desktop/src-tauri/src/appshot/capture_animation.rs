use crate::appshot::types::AppshotWindowBounds;
use std::path::PathBuf;
use tauri::utils::config::Color;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::time::{sleep, Duration};

const OVERLAY_LABEL: &str = "appshot-capture-overlay";
const OVERLAY_PADDING: f64 = 14.0;
const OVERLAY_DURATION_MS: u64 = 720;

pub async fn play(app: AppHandle, bounds: AppshotWindowBounds) -> Result<(), String> {
    if bounds.width < 32 || bounds.height < 32 {
        return Ok(());
    }

    if let Some(existing) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = existing.close();
    }

    let x = bounds.x as f64 - OVERLAY_PADDING;
    let y = bounds.y as f64 - OVERLAY_PADDING;
    let width = bounds.width as f64 + OVERLAY_PADDING * 2.0;
    let height = bounds.height as f64 + OVERLAY_PADDING * 2.0;

    let overlay = WebviewWindowBuilder::new(
        &app,
        OVERLAY_LABEL,
        WebviewUrl::App(PathBuf::from("appshot-capture-overlay.html")),
    )
    .title("Appshot Capture")
    .position(x, y)
    .inner_size(width, height)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .focusable(false)
    .focused(false)
    .visible(true)
    .build()
    .map_err(|error| format!("failed to show appshot capture overlay: {error}"))?;

    let _ = overlay.set_background_color(Some(Color(0, 0, 0, 0)));
    let _ = overlay.set_ignore_cursor_events(true);

    sleep(Duration::from_millis(OVERLAY_DURATION_MS)).await;
    let _ = overlay.close();
    Ok(())
}
