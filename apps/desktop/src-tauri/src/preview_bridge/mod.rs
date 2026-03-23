use crate::state::{AppState, DesktopPreviewBridgeState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::webview::PageLoadEvent;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Position, Size, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};
use tauri::Url;

pub const PREVIEW_INSPECTOR_LABEL: &str = "preview-inspector";

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewBridgeBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

fn runtime_script() -> &'static str {
    include_str!("../../../../web/public/atmos-inspector-extension/preview-runtime.js")
}

fn desktop_bridge_script() -> String {
    format!(
        r#"
{}
(() => {{
  if (window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__) return;
  const invoke = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
  if (!invoke || !window.__ATMOS_PREVIEW_RUNTIME__) return;
  const controller = window.__ATMOS_PREVIEW_RUNTIME__.createRuntime({{
    win: window,
    emit(message) {{
      invoke('preview_bridge_event', {{ payload: message }}).catch(() => {{}});
    }},
  }});
  window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__ = {{
    announceReady(sessionId) {{
      controller.announceReady(sessionId);
    }},
    enterPickMode(sessionId) {{
      controller.enterPickMode(sessionId);
    }},
    clearSelection() {{
      controller.clearSelection(false);
    }},
    destroy() {{
      controller.destroy();
    }},
  }};
}})();
"#,
        runtime_script()
    )
}

fn bridge_state(app: &AppHandle) -> Option<DesktopPreviewBridgeState> {
    app.state::<AppState>()
        .preview_bridge
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
}

fn update_bridge_state(app: &AppHandle, state: DesktopPreviewBridgeState) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    let mut guard = app_state
        .preview_bridge
        .lock()
        .map_err(|_| "preview bridge state lock poisoned".to_string())?;
    *guard = Some(state);
    Ok(())
}

fn clear_bridge_state(app: &AppHandle) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    let mut guard = app_state
        .preview_bridge
        .lock()
        .map_err(|_| "preview bridge state lock poisoned".to_string())?;
    *guard = None;
    Ok(())
}

fn emit_navigation_changed(app: &AppHandle, session_id: &str, url: &str) {
    let _ = app.emit_to(
        "main",
        "desktop-preview:navigation-changed",
        serde_json::json!({
            "sessionId": session_id,
            "pageUrl": url,
        }),
    );
}

fn sync_pick_mode(webview: &WebviewWindow, session_id: &str, pick_mode: bool) {
    let script = if pick_mode {
        format!(
            "window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__?.enterPickMode({:?});",
            session_id
        )
    } else {
        format!(
            "window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__?.announceReady({:?});",
            session_id
        )
    };
    let _ = webview.eval(format!(
        "window.__ATMOS_PREVIEW_SESSION_ID__ = {:?}; {}",
        session_id, script
    ));
}

fn apply_bounds(window: &WebviewWindow, bounds: PreviewBridgeBounds) -> Result<(), String> {
    window
        .set_position(Position::Logical(LogicalPosition::new(
            bounds.x as f64,
            bounds.y as f64,
        )))
        .map_err(|error| error.to_string())?;
    window
        .set_size(Size::Logical(LogicalSize::new(
            bounds.width as f64,
            bounds.height as f64,
        )))
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn open_preview_window(
    app: &AppHandle,
    session_id: &str,
    url: &str,
    bounds: PreviewBridgeBounds,
) -> Result<(), String> {
    update_bridge_state(
        app,
        DesktopPreviewBridgeState {
            session_id: session_id.to_string(),
            current_url: url.to_string(),
            pick_mode: false,
        },
    )?;

    if let Some(existing) = app.get_webview_window(PREVIEW_INSPECTOR_LABEL) {
        apply_bounds(&existing, bounds)?;
        existing
            .navigate(url.parse::<Url>().map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
        existing.show().map_err(|error| error.to_string())?;
        return Ok(());
    }

    let app_handle = app.clone();
    let preview = WebviewWindowBuilder::new(
        app,
        PREVIEW_INSPECTOR_LABEL,
        WebviewUrl::External(url.parse::<Url>().map_err(|error| error.to_string())?),
    )
    .decorations(false)
    .shadow(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .focused(false)
    .position(bounds.x as f64, bounds.y as f64)
    .inner_size(bounds.width as f64, bounds.height as f64)
    .initialization_script(desktop_bridge_script())
    .on_page_load(move |webview, payload| {
        if payload.event() != PageLoadEvent::Finished {
            return;
        }

        if let Some(state) = bridge_state(&app_handle) {
            let _ = webview.eval(format!(
                "window.__ATMOS_PREVIEW_SESSION_ID__ = {:?}; window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__?.announceReady({:?});",
                state.session_id, state.session_id
            ));
            if state.pick_mode {
                let _ = webview.eval(format!(
                    "window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__?.enterPickMode({:?});",
                    state.session_id
                ));
            }
            emit_navigation_changed(&app_handle, &state.session_id, payload.url().as_str());
        }
    })
    .build()
    .map_err(|error| error.to_string())?;

    preview.show().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn navigate_preview_window(app: &AppHandle, session_id: &str, url: &str) -> Result<(), String> {
    update_bridge_state(
        app,
        DesktopPreviewBridgeState {
            session_id: session_id.to_string(),
            current_url: url.to_string(),
            pick_mode: bridge_state(app).map(|state| state.pick_mode).unwrap_or(false),
        },
    )?;

    let preview = app
        .get_webview_window(PREVIEW_INSPECTOR_LABEL)
        .ok_or_else(|| "preview inspector window not open".to_string())?;
    preview
        .navigate(url.parse::<Url>().map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())
}

pub fn update_preview_bounds(app: &AppHandle, bounds: PreviewBridgeBounds) -> Result<(), String> {
    let preview = app
        .get_webview_window(PREVIEW_INSPECTOR_LABEL)
        .ok_or_else(|| "preview inspector window not open".to_string())?;
    apply_bounds(&preview, bounds)
}

pub fn enter_pick_mode(app: &AppHandle, session_id: &str) -> Result<(), String> {
    let mut next_state = bridge_state(app).unwrap_or_default();
    next_state.session_id = session_id.to_string();
    next_state.pick_mode = true;
    update_bridge_state(app, next_state)?;

    let preview = app
        .get_webview_window(PREVIEW_INSPECTOR_LABEL)
        .ok_or_else(|| "preview inspector window not open".to_string())?;
    sync_pick_mode(&preview, session_id, true);
    Ok(())
}

pub fn clear_selection(app: &AppHandle, session_id: &str) -> Result<(), String> {
    let mut next_state = bridge_state(app).unwrap_or_default();
    next_state.session_id = session_id.to_string();
    next_state.pick_mode = false;
    update_bridge_state(app, next_state)?;

    let preview = app
        .get_webview_window(PREVIEW_INSPECTOR_LABEL)
        .ok_or_else(|| "preview inspector window not open".to_string())?;
    preview
        .eval("window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__?.clearSelection();")
        .map_err(|error| error.to_string())
}

pub fn close_preview_window(app: &AppHandle) -> Result<(), String> {
    if let Some(preview) = app.get_webview_window(PREVIEW_INSPECTOR_LABEL) {
        let _ = preview.eval("window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__?.destroy();");
        preview.close().map_err(|error| error.to_string())?;
    }
    clear_bridge_state(app)
}

pub fn hide_preview_window(app: &AppHandle) {
    if let Some(preview) = app.get_webview_window(PREVIEW_INSPECTOR_LABEL) {
        let _ = preview.hide();
    }
}

pub fn forward_runtime_event(app: &AppHandle, payload: Value) -> Result<(), String> {
    let event_name = match payload
        .get("type")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
    {
        "atmos-preview:ready" => "desktop-preview:ready",
        "atmos-preview:selected" => "desktop-preview:selected",
        "atmos-preview:cleared" => "desktop-preview:cleared",
        "atmos-preview:error" => "desktop-preview:error",
        _ => return Ok(()),
    };

    app.emit_to("main", event_name, payload)
        .map_err(|error| error.to_string())
}
