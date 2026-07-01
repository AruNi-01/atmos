use crate::{
    logging::{self, LogLevel},
    state::{AppState, DesktopPreviewBridgeState},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::webview::{PageLoadEvent, PageLoadPayload};
use tauri::Url;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Position, Size, Webview,
    WebviewBuilder, WebviewUrl, WebviewWindowBuilder,
};
use uuid::Uuid;

pub const PREVIEW_INSPECTOR_LABEL: &str = "preview-inspector";
const PREVIEW_INSPECTOR_LABEL_PREFIX: &str = "preview-inspector-";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
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

fn desktop_bridge_script(bridge_token: &str) -> String {
    let bridge_token_json =
        serde_json::to_string(bridge_token).unwrap_or_else(|_| "\"\"".to_string());
    format!(
        r#"
{}
(() => {{
  if (window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__) return;
  const invoke = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
  if (!invoke || !window.__ATMOS_PREVIEW_RUNTIME__) return;
  const bridgeToken = {bridge_token_json};
  const controller = window.__ATMOS_PREVIEW_RUNTIME__.createRuntime({{
    win: window,
    showSelectionToolbar: true,
    emit(message) {{
      invoke('preview_bridge_event', {{
        payload: Object.assign({{}}, message, {{ bridgeToken }})
      }}).catch(() => {{}});
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
    clearAnnotations() {{
      controller.clearAnnotations?.();
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
    var isOverlayTarget = t.closest && t.closest('[data-atmos-preview-overlay="true"]');
    var override = isOverlayTarget ? '' : window.__ATMOS_PREVIEW_PICK_CURSOR__;
    var next = override || '';
    if (!next) {{
      var c = '';
      try {{ c = window.getComputedStyle(t).cursor || ''; }} catch(_) {{}}
      next = c || 'default';
      if (next === 'auto') next = resolveAutoCursor(t);
    }}
    if (next === lastSyncedCursor) return;
    lastSyncedCursor = next;
    invoke('preview_bridge_event', {{ payload: {{
      type: 'atmos-preview:cursor-changed',
      sessionId: sid,
      pageUrl: window.location.href,
      cursor: next,
      bridgeToken,
    }} }}).catch(function(){{}});
  }}, false);
}})();
"#,
        runtime_script()
    )
}

fn preview_surface_label(session_id: &str) -> String {
    let sanitized: String = session_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect();
    format!("{PREVIEW_INSPECTOR_LABEL_PREFIX}{sanitized}")
}

fn new_bridge_token() -> String {
    Uuid::new_v4().simple().to_string()
}

fn bridge_token_from_state(state: Option<&DesktopPreviewBridgeState>) -> String {
    state
        .map(|state| state.bridge_token.trim())
        .filter(|token| !token.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(new_bridge_token)
}

fn active_bridge_state(app: &AppHandle) -> Option<DesktopPreviewBridgeState> {
    app.state::<AppState>()
        .preview_bridge
        .lock()
        .ok()
        .and_then(|guard| {
            guard
                .active_session_id
                .as_ref()
                .and_then(|session_id| guard.surfaces.get(session_id))
                .cloned()
        })
}

fn bridge_state_for_session(
    app: &AppHandle,
    session_id: &str,
) -> Option<DesktopPreviewBridgeState> {
    app.state::<AppState>()
        .preview_bridge
        .lock()
        .ok()
        .and_then(|guard| guard.surfaces.get(session_id).cloned())
}

fn update_bridge_state(
    app: &AppHandle,
    session_id: &str,
    state: DesktopPreviewBridgeState,
) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    let mut guard = app_state
        .preview_bridge
        .lock()
        .map_err(|_| "preview bridge state lock poisoned".to_string())?;
    guard.active_session_id = Some(session_id.to_string());
    guard.surfaces.insert(session_id.to_string(), state);
    Ok(())
}

fn remove_bridge_state(app: &AppHandle, session_id: &str) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    let mut guard = app_state
        .preview_bridge
        .lock()
        .map_err(|_| "preview bridge state lock poisoned".to_string())?;
    guard.surfaces.remove(session_id);
    if guard.active_session_id.as_deref() == Some(session_id) {
        guard.active_session_id = guard.surfaces.keys().next().cloned();
    }
    Ok(())
}

fn set_active_session(app: &AppHandle, session_id: &str) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    let mut guard = app_state
        .preview_bridge
        .lock()
        .map_err(|_| "preview bridge state lock poisoned".to_string())?;
    if guard.surfaces.contains_key(session_id) {
        guard.active_session_id = Some(session_id.to_string());
    }
    Ok(())
}

fn clear_bridge_state(app: &AppHandle) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    let mut guard = app_state
        .preview_bridge
        .lock()
        .map_err(|_| "preview bridge state lock poisoned".to_string())?;
    guard.active_session_id = None;
    guard.surfaces.clear();
    Ok(())
}

fn update_existing_bridge_state(
    app: &AppHandle,
    session_id: &str,
    update: impl FnOnce(&mut DesktopPreviewBridgeState),
) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    let mut guard = app_state
        .preview_bridge
        .lock()
        .map_err(|_| "preview bridge state lock poisoned".to_string())?;
    if let Some(state) = guard.surfaces.get_mut(session_id) {
        update(state);
    }
    Ok(())
}

fn emit_navigation_changed(app: &AppHandle, session_id: &str, url: &str) {
    let host_label = bridge_state_for_session(app, session_id)
        .map(|state| state.host_label)
        .unwrap_or_else(|| "main".to_string());
    let _ = app.emit_to(
        &host_label,
        "desktop-preview:navigation-changed",
        serde_json::json!({
            "sessionId": session_id,
            "pageUrl": url,
        }),
    );
}

fn emit_detached_changed(app: &AppHandle, session_id: &str, detached: bool) {
    let host_label = bridge_state_for_session(app, session_id)
        .map(|state| state.host_label)
        .unwrap_or_else(|| "main".to_string());
    let _ = app.emit_to(
        &host_label,
        "desktop-preview:detached-changed",
        serde_json::json!({
            "sessionId": session_id,
            "detached": detached,
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

fn pick_mode_script(session_id: &str, pick_mode: bool, bridge_token: &str) -> String {
    let method = if pick_mode {
        "enterPickMode"
    } else {
        "announceReady"
    };
    format!(
        r#"
{}
(() => {{
  const sessionId = {session_id:?};
  const method = {method:?};
  window.__ATMOS_PREVIEW_SESSION_ID__ = sessionId;
  let attempts = 0;
  const sync = () => {{
    const bridge = window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__;
    if (bridge && typeof bridge[method] === 'function') {{
      bridge[method](sessionId);
      return;
    }}
    attempts += 1;
    if (attempts < 20) window.setTimeout(sync, 50);
  }};
  sync();
}})();
"#,
        desktop_bridge_script(bridge_token)
    )
}

fn sync_pick_mode(webview: &Webview, session_id: &str, pick_mode: bool, bridge_token: &str) {
    let _ = webview.eval(pick_mode_script(session_id, pick_mode, bridge_token));
}

fn eval_preview_surface(
    app: &AppHandle,
    session_id: &str,
    script: impl AsRef<str>,
) -> Result<(), String> {
    let label = preview_surface_label(session_id);
    if let Some(preview) = app.get_webview(&label) {
        return preview
            .eval(script.as_ref())
            .map_err(|error| error.to_string());
    }

    if let Some(preview_window) = app.get_webview_window(&label) {
        return preview_window
            .eval(script.as_ref())
            .map_err(|error| error.to_string());
    }

    Err("preview inspector window not open".to_string())
}

fn navigate_preview_surface(app: &AppHandle, session_id: &str, url: Url) -> Result<(), String> {
    let label = preview_surface_label(session_id);
    if let Some(preview) = app.get_webview(&label) {
        return preview.navigate(url).map_err(|error| error.to_string());
    }

    if let Some(preview_window) = app.get_webview_window(&label) {
        return preview_window
            .navigate(url)
            .map_err(|error| error.to_string());
    }

    Err("preview inspector window not open".to_string())
}

fn emit_error_page_probe(webview: &Webview, session_id: &str, page_url: &str, bridge_token: &str) {
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
      bridgeToken: {bridge_token:?},
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

fn close_legacy_preview_surface(app: &AppHandle) -> Result<(), String> {
    if let Some(preview_window) = app.get_webview_window(PREVIEW_INSPECTOR_LABEL) {
        let _ = preview_window.eval("window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__?.destroy();");
        preview_window.close().map_err(|error| error.to_string())?;
        return Ok(());
    }

    if let Some(preview) = app.get_webview(PREVIEW_INSPECTOR_LABEL) {
        let _ = preview.eval("window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__?.destroy();");
        preview.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn close_preview_surface_only(app: &AppHandle, session_id: &str) -> Result<(), String> {
    let label = preview_surface_label(session_id);
    if let Some(preview_window) = app.get_webview_window(&label) {
        let _ = preview_window.eval("window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__?.destroy();");
        preview_window.close().map_err(|error| error.to_string())?;
        return Ok(());
    }

    if let Some(preview) = app.get_webview(&label) {
        let _ = preview.eval("window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__?.destroy();");
        preview.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn close_preview_surface(app: &AppHandle, session_id: &str) -> Result<(), String> {
    close_preview_surface_only(app, session_id)?;
    remove_bridge_state(app, session_id)
}

fn close_all_preview_surfaces(app: &AppHandle) -> Result<(), String> {
    let session_ids: Vec<String> = app
        .state::<AppState>()
        .preview_bridge
        .lock()
        .map_err(|_| "preview bridge state lock poisoned".to_string())?
        .surfaces
        .keys()
        .cloned()
        .collect();

    for session_id in session_ids {
        close_preview_surface(app, &session_id)?;
    }
    close_legacy_preview_surface(app)?;
    clear_bridge_state(app)
}

pub fn show_active_preview_window(app: &AppHandle) -> Result<(), String> {
    if let Some(state) = active_bridge_state(app) {
        show_preview_window(app, &state.session_id)?;
    }
    Ok(())
}

fn hide_other_preview_surfaces(app: &AppHandle, active_session_id: &str) {
    let states: Vec<DesktopPreviewBridgeState> = app
        .state::<AppState>()
        .preview_bridge
        .lock()
        .ok()
        .map(|guard| {
            guard
                .surfaces
                .values()
                .filter(|state| {
                    state.session_id != active_session_id && state.visible && !state.detached
                })
                .cloned()
                .collect()
        })
        .unwrap_or_default();

    for state in states {
        let label = preview_surface_label(&state.session_id);
        if let Some(preview) = app.get_webview(&label) {
            let _ = preview.hide();
        }
        let _ = update_existing_bridge_state(app, &state.session_id, |state| {
            state.visible = false;
        });
    }
}

fn handle_page_load(
    app: &AppHandle,
    webview: &Webview,
    session_id: &str,
    payload: PageLoadPayload<'_>,
) {
    if payload.event() != PageLoadEvent::Finished {
        return;
    }

    if let Some(state) = bridge_state_for_session(app, session_id) {
        let page_url = payload.url().as_str().to_string();
        let _ = update_existing_bridge_state(app, session_id, |state| {
            state.current_url = page_url.clone();
        });
        sync_pick_mode(webview, session_id, state.pick_mode, &state.bridge_token);
        emit_navigation_changed(app, session_id, &page_url);
        emit_error_page_probe(webview, session_id, &page_url, &state.bridge_token);
    }
}

fn open_preview_child(
    app: &AppHandle,
    host_label: &str,
    session_id: &str,
    bridge_token: &str,
    url: &str,
    bounds: PreviewBridgeBounds,
    should_navigate: bool,
    should_update_bounds: bool,
    should_show: bool,
) -> Result<(), String> {
    let label = preview_surface_label(session_id);
    if app.get_webview_window(&label).is_some() {
        close_preview_surface_only(app, session_id)?;
    }

    if let Some(existing) = app.get_webview(&label) {
        log_preview(
            app,
            format!("reusing preview child webview session={session_id}"),
        );
        if should_update_bounds {
            apply_bounds(&existing, bounds)?;
        }
        if should_navigate {
            existing
                .navigate(url.parse::<Url>().map_err(|error| error.to_string())?)
                .map_err(|error| error.to_string())?;
        }
        if should_show {
            existing.show().map_err(|error| error.to_string())?;
            hide_other_preview_surfaces(app, session_id);
        }
        return Ok(());
    }

    let host_window = app
        .get_window(host_label)
        .ok_or_else(|| format!("preview host window not available: {host_label}"))?;
    let app_handle = app.clone();
    let page_load_session_id = session_id.to_string();
    let preview = host_window
        .add_child(
            WebviewBuilder::new(
                &label,
                WebviewUrl::External(url.parse::<Url>().map_err(|error| error.to_string())?),
            )
            .initialization_script(desktop_bridge_script(bridge_token))
            .on_page_load(move |webview, payload| {
                handle_page_load(&app_handle, &webview, &page_load_session_id, payload);
            }),
            Position::Logical(LogicalPosition::new(bounds.x as f64, bounds.y as f64)),
            Size::Logical(LogicalSize::new(bounds.width as f64, bounds.height as f64)),
        )
        .map_err(|error| error.to_string())?;

    preview.show().map_err(|error| error.to_string())?;
    hide_other_preview_surfaces(app, session_id);
    Ok(())
}

fn open_preview_detached_window(
    app: &AppHandle,
    session_id: &str,
    bridge_token: &str,
    url: &str,
) -> Result<(), String> {
    close_preview_surface_only(app, session_id)?;

    let app_handle = app.clone();
    let label = preview_surface_label(session_id);
    let page_load_session_id = session_id.to_string();
    let preview = WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::External(url.parse::<Url>().map_err(|error| error.to_string())?),
    )
    .title("Atmos Preview")
    .inner_size(1100.0, 760.0)
    .min_inner_size(480.0, 360.0)
    .resizable(true)
    .decorations(true)
    .initialization_script(desktop_bridge_script(bridge_token))
    .on_page_load(move |webview, payload| {
        handle_page_load(
            &app_handle,
            webview.as_ref(),
            &page_load_session_id,
            payload,
        );
    })
    .visible(false)
    .build()
    .map_err(|error| error.to_string())?;

    let _ = preview.center();
    preview.show().map_err(|error| error.to_string())?;
    preview.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn open_preview_window(
    app: &AppHandle,
    host_label: &str,
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
    close_legacy_preview_surface(app)?;
    let previous_state = bridge_state_for_session(app, session_id);
    let bridge_token = bridge_token_from_state(previous_state.as_ref());
    let previous_host_label = previous_state
        .as_ref()
        .map(|state| state.host_label.as_str());
    if previous_host_label.is_some_and(|previous| previous != host_label) {
        close_preview_surface(app, session_id)?;
    }
    let previous_same_host = previous_host_label == Some(host_label);
    let should_navigate = !previous_same_host
        || previous_state
            .as_ref()
            .map(|state| state.detached || state.current_url != url)
            .unwrap_or(true);
    let should_update_bounds = !previous_same_host
        || previous_state
            .as_ref()
            .map(|state| state.bounds != Some(bounds))
            .unwrap_or(true);
    let should_show = !previous_same_host
        || !previous_state
            .as_ref()
            .map(|state| state.visible)
            .unwrap_or(false);
    update_bridge_state(
        app,
        session_id,
        DesktopPreviewBridgeState {
            session_id: session_id.to_string(),
            current_url: url.to_string(),
            host_label: host_label.to_string(),
            bridge_token: bridge_token.clone(),
            pick_mode: false,
            detached: false,
            visible: true,
            bounds: Some(bounds),
        },
    )?;

    open_preview_child(
        app,
        host_label,
        session_id,
        &bridge_token,
        url,
        bounds,
        should_navigate,
        should_update_bounds,
        should_show,
    )
}

pub fn set_preview_detached(
    app: &AppHandle,
    host_label: &str,
    session_id: &str,
    url: &str,
    bounds: PreviewBridgeBounds,
    detached: bool,
) -> Result<(), String> {
    log_preview(
        app,
        format!(
            "set-detached session={} detached={} url={}",
            session_id, detached, url
        ),
    );

    let previous_state = bridge_state_for_session(app, session_id);
    let bridge_token = bridge_token_from_state(previous_state.as_ref());
    if previous_state
        .as_ref()
        .map(|state| state.host_label.as_str())
        .is_some_and(|previous| previous != host_label)
    {
        close_preview_surface(app, session_id)?;
    }

    let pick_mode = previous_state
        .as_ref()
        .map(|state| state.pick_mode)
        .unwrap_or(false);
    update_bridge_state(
        app,
        session_id,
        DesktopPreviewBridgeState {
            session_id: session_id.to_string(),
            current_url: url.to_string(),
            host_label: host_label.to_string(),
            bridge_token: bridge_token.clone(),
            pick_mode,
            detached,
            visible: true,
            bounds: if detached { None } else { Some(bounds) },
        },
    )?;

    if detached {
        open_preview_detached_window(app, session_id, &bridge_token, url)?;
    } else {
        open_preview_child(
            app,
            host_label,
            session_id,
            &bridge_token,
            url,
            bounds,
            true,
            true,
            true,
        )?;
    }
    emit_detached_changed(app, session_id, detached);
    Ok(())
}

pub fn navigate_preview_window(
    app: &AppHandle,
    host_label: &str,
    session_id: &str,
    url: &str,
) -> Result<(), String> {
    log_preview(app, format!("navigate session={} url={}", session_id, url));
    let previous_state = bridge_state_for_session(app, session_id);
    let bridge_token = bridge_token_from_state(previous_state.as_ref());
    let should_navigate = previous_state
        .as_ref()
        .map(|state| state.current_url != url)
        .unwrap_or(true);
    update_bridge_state(
        app,
        session_id,
        DesktopPreviewBridgeState {
            session_id: session_id.to_string(),
            current_url: url.to_string(),
            host_label: host_label.to_string(),
            bridge_token,
            pick_mode: previous_state
                .clone()
                .map(|state| state.pick_mode)
                .unwrap_or(false),
            detached: previous_state
                .as_ref()
                .map(|state| state.detached)
                .unwrap_or(false),
            visible: previous_state
                .as_ref()
                .map(|state| state.visible)
                .unwrap_or(true),
            bounds: previous_state.and_then(|state| state.bounds),
        },
    )?;

    if !should_navigate {
        return Ok(());
    }

    navigate_preview_surface(
        app,
        session_id,
        url.parse::<Url>().map_err(|error| error.to_string())?,
    )
}

pub fn update_preview_bounds(
    app: &AppHandle,
    session_id: &str,
    bounds: PreviewBridgeBounds,
) -> Result<(), String> {
    let current_state = bridge_state_for_session(app, session_id);
    if current_state
        .as_ref()
        .map(|state| state.detached)
        .unwrap_or(false)
    {
        return Ok(());
    }
    if current_state
        .as_ref()
        .map(|state| state.bounds == Some(bounds))
        .unwrap_or(false)
    {
        return Ok(());
    }

    log_preview(
        app,
        format!(
            "update-bounds session={} ({}, {}, {}x{})",
            session_id, bounds.x, bounds.y, bounds.width, bounds.height
        ),
    );
    let label = preview_surface_label(session_id);
    let preview = app
        .get_webview(&label)
        .ok_or_else(|| "preview inspector window not open".to_string())?;
    apply_bounds(&preview, bounds)?;
    update_existing_bridge_state(app, session_id, |state| {
        state.bounds = Some(bounds);
    })
}

pub fn enter_pick_mode(app: &AppHandle, host_label: &str, session_id: &str) -> Result<(), String> {
    let previous_state = bridge_state_for_session(app, session_id);
    let bridge_token = bridge_token_from_state(previous_state.as_ref());
    let mut next_state = previous_state.unwrap_or_default();
    next_state.session_id = session_id.to_string();
    next_state.host_label = host_label.to_string();
    next_state.bridge_token = bridge_token.clone();
    next_state.pick_mode = true;
    update_bridge_state(app, session_id, next_state)?;

    eval_preview_surface(
        app,
        session_id,
        pick_mode_script(session_id, true, &bridge_token),
    )
}

pub fn clear_selection(app: &AppHandle, host_label: &str, session_id: &str) -> Result<(), String> {
    let previous_state = bridge_state_for_session(app, session_id);
    let bridge_token = bridge_token_from_state(previous_state.as_ref());
    let mut next_state = previous_state.unwrap_or_default();
    next_state.session_id = session_id.to_string();
    next_state.host_label = host_label.to_string();
    next_state.bridge_token = bridge_token;
    next_state.pick_mode = false;
    update_bridge_state(app, session_id, next_state)?;

    eval_preview_surface(
        app,
        session_id,
        "window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__?.clearSelection?.() ?? window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__?.exitPickMode?.();",
    )
}

pub fn clear_annotations(app: &AppHandle, session_id: &str) -> Result<(), String> {
    eval_preview_surface(
        app,
        session_id,
        r#"
(() => {
  window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__?.clearAnnotations?.();
  document.querySelectorAll('[data-atmos-preview-annotation="true"]').forEach((node) => node.remove());
})();
"#,
    )
}

pub fn close_preview_window(app: &AppHandle, session_id: &str) -> Result<(), String> {
    log_preview(app, format!("close session={session_id}"));
    close_preview_surface(app, session_id)
}

pub fn close_all_preview_windows(app: &AppHandle) -> Result<(), String> {
    log_preview(app, "close-all");
    close_all_preview_surfaces(app)
}

pub fn hide_preview_window(app: &AppHandle, session_id: &str) {
    let current_state = bridge_state_for_session(app, session_id);
    if current_state
        .as_ref()
        .map(|state| state.detached)
        .unwrap_or(false)
    {
        return;
    }
    if !current_state
        .as_ref()
        .map(|state| state.visible)
        .unwrap_or(false)
    {
        return;
    }

    log_preview(app, format!("hide session={session_id}"));
    let label = preview_surface_label(session_id);
    if let Some(preview) = app.get_webview(&label) {
        let _ = preview.hide();
    }
    let _ = update_existing_bridge_state(app, session_id, |state| {
        state.visible = false;
    });
}

pub fn hide_all_preview_windows(app: &AppHandle) {
    let session_ids: Vec<String> = app
        .state::<AppState>()
        .preview_bridge
        .lock()
        .ok()
        .map(|guard| guard.surfaces.keys().cloned().collect())
        .unwrap_or_default();

    for session_id in session_ids {
        hide_preview_window(app, &session_id);
    }
}

pub fn show_preview_window(app: &AppHandle, session_id: &str) -> Result<(), String> {
    let current_state = bridge_state_for_session(app, session_id);
    let label = preview_surface_label(session_id);
    if current_state
        .as_ref()
        .map(|state| state.detached)
        .unwrap_or(false)
    {
        if let Some(preview_window) = app.get_webview_window(&label) {
            if !current_state
                .as_ref()
                .map(|state| state.visible)
                .unwrap_or(false)
            {
                log_preview(app, format!("show session={session_id}"));
                preview_window.show().map_err(|error| error.to_string())?;
            }
        }
        set_active_session(app, session_id)?;
        update_existing_bridge_state(app, session_id, |state| {
            state.visible = true;
        })?;
        return Ok(());
    }
    if current_state
        .as_ref()
        .map(|state| state.visible)
        .unwrap_or(false)
    {
        set_active_session(app, session_id)?;
        hide_other_preview_surfaces(app, session_id);
        return Ok(());
    }

    log_preview(app, format!("show session={session_id}"));
    if let Some(preview) = app.get_webview(&label) {
        preview.show().map_err(|error| error.to_string())?;
    }
    set_active_session(app, session_id)?;
    hide_other_preview_surfaces(app, session_id);
    update_existing_bridge_state(app, session_id, |state| {
        state.visible = true;
    })?;
    Ok(())
}

pub fn forward_runtime_event(app: &AppHandle, mut payload: Value) -> Result<(), String> {
    let event_type = payload
        .get("type")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();
    let session_id = payload
        .get("sessionId")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();
    let bridge_token = payload
        .get("bridgeToken")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();
    if !event_type.is_empty() {
        log_preview(
            app,
            format!("runtime-event {} session={}", event_type, session_id),
        );
    }

    let Some(state) = bridge_state_for_session(app, &session_id) else {
        log_preview(
            app,
            format!("runtime-event rejected unknown-session session={session_id}"),
        );
        return Ok(());
    };
    if state.bridge_token.is_empty() || bridge_token.as_str() != state.bridge_token.as_str() {
        log_preview(
            app,
            format!("runtime-event rejected bad-token session={session_id}"),
        );
        return Ok(());
    }
    if let Some(object) = payload.as_object_mut() {
        object.remove("bridgeToken");
    }

    if matches!(
        event_type.as_str(),
        "atmos-preview:ready" | "atmos-preview:navigation-changed"
    ) {
        if let Some(page_url) = payload.get("pageUrl").and_then(|value| value.as_str()) {
            update_existing_bridge_state(app, &session_id, |state| {
                state.current_url = page_url.to_string();
            })?;
        }
    }

    let event_name = match event_type.as_str() {
        "atmos-preview:ready" => "desktop-preview:ready",
        "atmos-preview:hover" => "desktop-preview:hover",
        "atmos-preview:selected" => "desktop-preview:selected",
        "atmos-preview:toolbar-action" => "desktop-preview:toolbar-action",
        "atmos-preview:cleared" => "desktop-preview:cleared",
        "atmos-preview:error" => "desktop-preview:error",
        "atmos-preview:navigation-changed" => "desktop-preview:navigation-changed",
        "atmos-preview:title-changed" => "desktop-preview:title-changed",
        "atmos-preview:open-tab" => "desktop-preview:open-tab",
        "atmos-preview:cursor-changed" => "desktop-preview:cursor-changed",
        _ => return Ok(()),
    };

    app.emit_to(&state.host_label, event_name, payload)
        .map_err(|error| error.to_string())
}
