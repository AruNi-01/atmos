use crate::{
    logging::{self, LogLevel},
    state::{AppState, DesktopPreviewBridgeState},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::webview::PageLoadEvent;
use tauri::Url;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Position, Size, Webview,
    WebviewBuilder, WebviewUrl,
};

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
    include_str!("../../../../../packages/shared/preview/preview-runtime.js")
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
    showSelectionToolbar: true,
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
      controller.exitPickMode();
    }},
    destroy() {{
      controller.destroy();
    }},
  }};

  function resolveAutoCursor(el) {{
    var tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'textarea' || el.isContentEditable) return 'text';
    if (tag === 'input') {{
      var it = (el.getAttribute('type') || 'text').toLowerCase();
      return 'text search url tel email password number'.split(' ').indexOf(it) >= 0 ? 'text' : 'default';
    }}
    if ((tag === 'a' && el.hasAttribute('href')) || (el.closest && el.closest('a[href]'))) return 'pointer';
    if (tag === 'label') {{
      var ctrl = el.htmlFor ? document.getElementById(el.htmlFor) : el.querySelector('input,textarea,select');
      if (ctrl) return resolveAutoCursor(ctrl);
    }}
    if (tag === 'button' || tag === 'select' || tag === 'summary') return 'default';
    if (el.closest && el.closest('button')) return 'default';
    if ('img video canvas audio iframe object embed svg hr'.split(' ').indexOf(tag) >= 0) return 'default';
    try {{
      var us = window.getComputedStyle(el).userSelect || '';
      if (us === 'none') return 'default';
    }} catch(_) {{}}
    var cn = el.childNodes;
    for (var ci = 0; ci < cn.length; ci++) {{
      if (cn[ci].nodeType === 3 && /\S/.test(cn[ci].nodeValue || '')) return 'text';
    }}
    return 'default';
  }}

  var lastSyncedCursor = '';
  document.addEventListener('mousedown', function(ev) {{
    var dt = ev.target;
    if (dt instanceof Element && dt.closest && dt.closest('[data-atmos-preview-overlay="true"]')) return;
    lastSyncedCursor = '';
  }}, true);
  document.addEventListener('mousemove', function(ev) {{
    var sid = window.__ATMOS_PREVIEW_SESSION_ID__;
    if (!sid) return;
    var t = ev.target;
    if (!(t instanceof Element)) return;
    var c = '';
    try {{ c = window.getComputedStyle(t).cursor || ''; }} catch(_) {{}}
    var next = c || 'default';
    if (next === 'auto') next = resolveAutoCursor(t);
    if (next === lastSyncedCursor) return;
    lastSyncedCursor = next;
    invoke('preview_bridge_event', {{ payload: {{
      type: 'atmos-preview:cursor-changed',
      sessionId: sid,
      pageUrl: window.location.href,
      cursor: next,
    }} }}).catch(function(){{}});
  }}, false);
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

fn log_preview(app: &AppHandle, message: impl AsRef<str>) {
    let path = logging::app_log_path(app, "desktop.log");
    logging::append_log_with_level(
        &path,
        LogLevel::Debug,
        &format!("[preview] {}", message.as_ref()),
    );
}

fn sync_pick_mode(webview: &Webview, session_id: &str, pick_mode: bool) {
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

fn emit_error_page_probe(webview: &Webview, session_id: &str, page_url: &str) {
    let script = format!(
        r#"
(() => {{
  const invoke = window.__TAURI_INTERNALS__?.invoke;
  if (!invoke) return;
  const href = window.location.href || {page_url:?};
  const title = document.title?.trim() || '';
  const bodyText = document.body?.innerText?.trim() || '';
  const combined = `${{title}}\n${{bodyText}}`;
  const markers = [
    'This site can’t provide a secure connection',
    "This site can't provide a secure connection",
    "This page isn’t working",
    "This page isn't working",
    'sent an invalid response',
    'ERR_SSL_PROTOCOL_ERROR',
    'ERR_CERT_',
    'ERR_CONNECTION_',
    'ERR_NAME_NOT_RESOLVED',
    'ERR_ADDRESS_UNREACHABLE',
    'ERR_INTERNET_DISCONNECTED',
    '此网站无法提供安全连接',
    '发送的响应无效',
  ];
  const errorCode = combined.match(/\bERR_[A-Z0-9_]+\b/)?.[0] || '';
  const hasMarker = markers.some((marker) => combined.includes(marker));
  const isErrorPage =
    href.startsWith('chrome-error://') ||
    href.startsWith('edge-error://') ||
    href.startsWith('webkit-error-page://') ||
    Boolean(errorCode) ||
    hasMarker;

  if (!isErrorPage) return;

  const lines = bodyText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
  const details = [];
  if (title) details.push(title);
  if (errorCode && !details.includes(errorCode)) details.push(errorCode);
  for (const line of lines) {{
    if (!details.includes(line)) details.push(line);
  }}

  invoke('preview_bridge_event', {{
    payload: {{
      type: 'atmos-preview:error',
      sessionId: {session_id:?},
      pageUrl: {page_url:?},
      error: ['Preview failed to load.', ...details].join('\n'),
    }},
  }}).catch(() => {{}});
}})();
"#
    );
    let _ = webview.eval(script);
}

fn apply_bounds(webview: &Webview, bounds: PreviewBridgeBounds) -> Result<(), String> {
    webview
        .set_position(Position::Logical(LogicalPosition::new(
            bounds.x as f64,
            bounds.y as f64,
        )))
        .map_err(|error| error.to_string())?;
    webview
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
    log_preview(
        app,
        format!(
            "open session={} url={} bounds=({}, {}, {}x{})",
            session_id, url, bounds.x, bounds.y, bounds.width, bounds.height
        ),
    );
    update_bridge_state(
        app,
        DesktopPreviewBridgeState {
            session_id: session_id.to_string(),
            current_url: url.to_string(),
            pick_mode: false,
        },
    )?;

    if let Some(existing) = app.get_webview(PREVIEW_INSPECTOR_LABEL) {
        log_preview(app, "reusing existing preview child webview");
        apply_bounds(&existing, bounds)?;
        existing
            .navigate(url.parse::<Url>().map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
        existing.show().map_err(|error| error.to_string())?;
        return Ok(());
    }

    let main_window = app
        .get_window("main")
        .ok_or_else(|| "main window not available".to_string())?;
    let app_handle = app.clone();
    let preview = main_window
        .add_child(
            WebviewBuilder::new(
                PREVIEW_INSPECTOR_LABEL,
                WebviewUrl::External(url.parse::<Url>().map_err(|error| error.to_string())?),
            )
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
                    emit_error_page_probe(&webview, &state.session_id, payload.url().as_str());
                }
            }),
            Position::Logical(LogicalPosition::new(bounds.x as f64, bounds.y as f64)),
            Size::Logical(LogicalSize::new(bounds.width as f64, bounds.height as f64)),
        )
        .map_err(|error| error.to_string())?;

    preview.show().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn navigate_preview_window(app: &AppHandle, session_id: &str, url: &str) -> Result<(), String> {
    log_preview(app, format!("navigate session={} url={}", session_id, url));
    update_bridge_state(
        app,
        DesktopPreviewBridgeState {
            session_id: session_id.to_string(),
            current_url: url.to_string(),
            pick_mode: bridge_state(app)
                .map(|state| state.pick_mode)
                .unwrap_or(false),
        },
    )?;

    let preview = app
        .get_webview(PREVIEW_INSPECTOR_LABEL)
        .ok_or_else(|| "preview inspector window not open".to_string())?;
    preview
        .navigate(url.parse::<Url>().map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())
}

pub fn update_preview_bounds(app: &AppHandle, bounds: PreviewBridgeBounds) -> Result<(), String> {
    log_preview(
        app,
        format!(
            "update-bounds ({}, {}, {}x{})",
            bounds.x, bounds.y, bounds.width, bounds.height
        ),
    );
    let preview = app
        .get_webview(PREVIEW_INSPECTOR_LABEL)
        .ok_or_else(|| "preview inspector window not open".to_string())?;
    apply_bounds(&preview, bounds)
}

pub fn enter_pick_mode(app: &AppHandle, session_id: &str) -> Result<(), String> {
    let mut next_state = bridge_state(app).unwrap_or_default();
    next_state.session_id = session_id.to_string();
    next_state.pick_mode = true;
    update_bridge_state(app, next_state)?;

    let preview = app
        .get_webview(PREVIEW_INSPECTOR_LABEL)
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
        .get_webview(PREVIEW_INSPECTOR_LABEL)
        .ok_or_else(|| "preview inspector window not open".to_string())?;
    preview
        .eval("window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__?.clearSelection?.() ?? window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__?.exitPickMode?.();")
        .map_err(|error| error.to_string())
}

pub fn close_preview_window(app: &AppHandle) -> Result<(), String> {
    log_preview(app, "close");
    if let Some(preview) = app.get_webview(PREVIEW_INSPECTOR_LABEL) {
        let _ = preview.eval("window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__?.destroy();");
        preview.close().map_err(|error| error.to_string())?;
    }
    clear_bridge_state(app)
}

pub fn hide_preview_window(app: &AppHandle) {
    log_preview(app, "hide");
    if let Some(preview) = app.get_webview(PREVIEW_INSPECTOR_LABEL) {
        let _ = preview.hide();
    }
}

pub fn show_preview_window(app: &AppHandle) -> Result<(), String> {
    log_preview(app, "show");
    if let Some(preview) = app.get_webview(PREVIEW_INSPECTOR_LABEL) {
        preview.show().map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn forward_runtime_event(app: &AppHandle, payload: Value) -> Result<(), String> {
    if let Some(event_type) = payload.get("type").and_then(|value| value.as_str()) {
        log_preview(app, format!("runtime-event {}", event_type));
    }
    let event_name = match payload
        .get("type")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
    {
        "atmos-preview:ready" => "desktop-preview:ready",
        "atmos-preview:hover" => "desktop-preview:hover",
        "atmos-preview:selected" => "desktop-preview:selected",
        "atmos-preview:toolbar-action" => "desktop-preview:toolbar-action",
        "atmos-preview:cleared" => "desktop-preview:cleared",
        "atmos-preview:error" => "desktop-preview:error",
        "atmos-preview:navigation-changed" => "desktop-preview:navigation-changed",
        "atmos-preview:title-changed" => "desktop-preview:title-changed",
        "atmos-preview:cursor-changed" => "desktop-preview:cursor-changed",
        _ => return Ok(()),
    };

    app.emit_to("main", event_name, payload)
        .map_err(|error| error.to_string())
}
