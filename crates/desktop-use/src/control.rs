//! Desktop control (drive) via Atmos-managed engine (`call` over socket).

use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::capture::{capture, CaptureRequest, CaptureResult};
use crate::host;
use crate::manager::DesktopUseManager;
use crate::strings::{self, scrub_vendor, ERR_ENGINE_NOT_INSTALLED};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DriveAction {
    #[default]
    Screenshot,
    Click,
    Type,
    /// Verification probe: list windows (requires live engine + grants).
    Verify,
    /// AX tree + optional screenshot for one window (background-friendly).
    WindowState,
    /// Show/clear the target window or desktop border highlight.
    Highlight,
    /// End the drive session: clear border + end engine session cursor.
    SessionEnd,
    // Phase 1
    DoubleClick,
    RightClick,
    Drag,
    Scroll,
    Hotkey,
    PressKey,
    MoveCursor,
    ListApps,
    LaunchApp,
    KillApp,
    ClipboardRead,
    ClipboardWrite,
    GetScreenSize,
    GetCursorPosition,
    InvokeMenu,
    GetAccessibilityTree,
    // Phase 2
    BringToFront,
    SetValue,
    SetWindowFrame,
    Zoom,
    VerifyState,
}

/// Visual border chrome while Desktop Use is driving UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum HighlightMode {
    /// Window border when `window_id` is set; else full-desktop border.
    #[default]
    Auto,
    /// Force primary-desktop border (green).
    Desktop,
    /// Clear overlay.
    Clear,
    /// Do not touch overlay for this call.
    Off,
}

impl HighlightMode {
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "auto" => Some(Self::Auto),
            "desktop" => Some(Self::Desktop),
            "clear" | "off-clear" => Some(Self::Clear),
            "off" | "none" | "disable" => Some(Self::Off),
            _ => None,
        }
    }
}

/// Coordinate space for desktop-scope pixel actions (`scope=desktop`).
///
/// Engine 0.17 maps desktop clicks from the **get_desktop_state PNG pixels**
/// (often 2× logical points on Retina). Passing logical screen points without
/// conversion lands at ~half the intended position.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CoordSpace {
    /// PNG / screenshot pixels from `drive screenshot` / `get_desktop_state` (engine native).
    #[default]
    Png,
    /// Logical screen points (same space as `list_windows` bounds / AX position).
    /// Converted to PNG pixels via screenshot/screen scale before the engine call.
    Points,
}

impl CoordSpace {
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "png" | "pixels" | "screenshot" | "image" => Some(Self::Png),
            "points" | "point" | "logical" | "screen" => Some(Self::Points),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct DriveRequest {
    pub action: DriveAction,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub from_x: Option<i32>,
    pub from_y: Option<i32>,
    pub to_x: Option<i32>,
    pub to_y: Option<i32>,
    pub x1: Option<f64>,
    pub y1: Option<f64>,
    pub x2: Option<f64>,
    pub y2: Option<f64>,
    pub text: Option<String>,
    pub keys: Option<serde_json::Value>,
    pub key: Option<String>,
    pub direction: Option<String>,
    pub amount: Option<i32>,
    pub scroll_by: Option<String>,
    pub count: Option<i32>,
    pub bundle_id: Option<String>,
    pub app_name: Option<String>,
    pub menu_path: Option<serde_json::Value>,
    pub clipboard_type: Option<String>,
    pub expect_json: Option<serde_json::Value>,
    pub out_path: Option<std::path::PathBuf>,
    pub pid: Option<i32>,
    pub window_id: Option<i64>,
    /// Engine delivery ladder: `background` (default) or `foreground`.
    pub delivery_mode: Option<String>,
    /// Desktop-scope coordinate space. Ignored for window-local (`window_id`) clicks.
    pub coord_space: CoordSpace,
    /// Agent session id for the engine cursor overlay. Default: `atmos-desktop-use`.
    pub session: Option<String>,
    pub element_token: Option<String>,
    pub element_index: Option<i32>,
    pub snapshot_id: Option<String>,
    pub include_screenshot: bool,
    /// Cap AX walk size for heavy Electron trees (engine `max_elements`).
    pub max_elements: Option<i32>,
    /// Cap AX walk depth (engine `max_depth`).
    pub max_depth: Option<i32>,
    /// Optional case-insensitive substring filter for window-state elements.
    pub query: Option<String>,
    pub highlight: HighlightMode,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub status_label: Option<String>,
    pub agent_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DriveResult {
    pub ok: bool,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capture: Option<CaptureResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
}

impl DriveResult {
    /// Structured failure from a typed [`DriveError`].
    fn err(action: &str, error: DriveError) -> Self {
        Self {
            ok: false,
            action: action.into(),
            detail: None,
            capture: None,
            result: None,
            error: Some(error.message()),
            error_code: Some(error.code().into()),
        }
    }

    /// Structured failure with an explicit code (e.g. screenshot write paths).
    fn err_code(action: &str, code: &str, message: impl Into<String>) -> Self {
        Self {
            ok: false,
            action: action.into(),
            detail: None,
            capture: None,
            result: None,
            error: Some(message.into()),
            error_code: Some(code.into()),
        }
    }

    /// Successful engine/tool payload (detail mirrors JSON string for agents).
    fn ok_result(action: &str, result: serde_json::Value) -> Self {
        Self {
            ok: true,
            action: action.into(),
            detail: Some(result.to_string()),
            capture: None,
            result: Some(result),
            error: None,
            error_code: None,
        }
    }

    fn ok_detail(action: &str, detail: Option<String>, result: Option<serde_json::Value>) -> Self {
        Self {
            ok: true,
            action: action.into(),
            detail,
            capture: None,
            result,
            error: None,
            error_code: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DriveError {
    EngineNotInstalled,
    InvalidArgs(String),
    EngineFailed(String),
}

impl DriveError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::EngineNotInstalled => "control_engine_not_installed",
            Self::InvalidArgs(_) => "invalid_args",
            Self::EngineFailed(_) => "control_engine_failed",
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::EngineNotInstalled => ERR_ENGINE_NOT_INSTALLED.to_string(),
            Self::InvalidArgs(m) => scrub_vendor(m),
            Self::EngineFailed(m) => scrub_vendor(m),
        }
    }
}

/// Execute a drive action.
///
/// Screenshot prefers the **host engine** when installed (same TCC identity as control),
/// falling back to local Capture for pre-engine installs.
///
/// **Background by default:** click/type use engine `delivery_mode=background` (no
/// persistent fronting). Prefer `element_token` from `window-state` for hidden/background
/// apps; pixel clicks still need an on-screen window. Use `foreground` only as last resort
/// (brief front → act → restore prior app).
fn action_name(action: &DriveAction) -> &'static str {
    match action {
        DriveAction::Screenshot => "screenshot",
        DriveAction::Click => "click",
        DriveAction::Type => "type",
        DriveAction::Verify => "verify",
        DriveAction::WindowState => "window_state",
        DriveAction::Highlight => "highlight",
        DriveAction::SessionEnd => "session_end",
        DriveAction::DoubleClick => "double_click",
        DriveAction::RightClick => "right_click",
        DriveAction::Drag => "drag",
        DriveAction::Scroll => "scroll",
        DriveAction::Hotkey => "hotkey",
        DriveAction::PressKey => "key",
        DriveAction::MoveCursor => "move",
        DriveAction::ListApps => "apps",
        DriveAction::LaunchApp => "launch",
        DriveAction::KillApp => "quit",
        DriveAction::ClipboardRead => "clipboard_get",
        DriveAction::ClipboardWrite => "clipboard_set",
        DriveAction::GetScreenSize => "screen",
        DriveAction::GetCursorPosition => "cursor",
        DriveAction::InvokeMenu => "menu",
        DriveAction::GetAccessibilityTree => "ax_tree",
        DriveAction::BringToFront => "front",
        DriveAction::SetValue => "set_value",
        DriveAction::SetWindowFrame => "window_frame",
        DriveAction::Zoom => "zoom",
        DriveAction::VerifyState => "verify_state",
    }
}

pub fn drive(manager: &DesktopUseManager, req: DriveRequest) -> DriveResult {
    let action_name = action_name(&req.action);

    match req.action {
        DriveAction::Screenshot => {
            if manager.require_engine().is_ok() {
                if let Some(denied) = permissions_block_for_capture(manager, action_name) {
                    return denied;
                }
                return screenshot_via_engine(manager, &req, action_name);
            }
            let cap = capture(CaptureRequest {
                out_path: req.out_path.clone(),
                include_base64: req.out_path.is_none(),
            });
            DriveResult {
                ok: cap.ok,
                action: action_name.into(),
                detail: None,
                result: None,
                error: cap.error.clone().map(|e| {
                    if e.contains("screencapture") || e.contains("could not create image") {
                        format!(
                            "{e}. Grant Screen Recording to Atmos Desktop Use (Settings → Desktop Use → Grant permissions), then retry."
                        )
                    } else {
                        e
                    }
                }),
                error_code: if cap.ok {
                    None
                } else {
                    Some("capture_failed".into())
                },
                capture: Some(cap),
            }
        }
        DriveAction::Highlight => run_highlight(&req, action_name),
        DriveAction::SessionEnd => run_session_end(manager, &req, action_name),
        _ => match manager.require_engine() {
            Err(_msg) => DriveResult::err(action_name, DriveError::EngineNotInstalled),
            Ok(engine) => {
                if action_needs_screen_recording(&req.action) && req.element_token.is_none() {
                    if let Some(denied) = permissions_block_for_capture(manager, action_name) {
                        return denied;
                    }
                }
                run_engine(manager, &engine, &req, action_name)
            }
        },
    }
}

/// Pixel / desktop-state actions that require Screen Recording on the host identity.
fn action_needs_screen_recording(action: &DriveAction) -> bool {
    matches!(
        action,
        DriveAction::Click
            | DriveAction::DoubleClick
            | DriveAction::RightClick
            | DriveAction::Drag
            | DriveAction::Screenshot
            | DriveAction::MoveCursor
    )
}

/// Fail fast with a structured grant hint when the host lacks Screen Recording.
fn permissions_block_for_capture(
    manager: &DesktopUseManager,
    action_name: &str,
) -> Option<DriveResult> {
    let doctor = crate::doctor::permission_doctor(manager);
    if doctor.screen_recording == Some(true) {
        return None;
    }
    // Unknown (null) — don't block; let the engine try.
    if doctor.screen_recording.is_none() && doctor.engine_ready {
        return None;
    }
    if doctor.screen_recording != Some(false) {
        return None;
    }
    Some(DriveResult {
        ok: false,
        action: action_name.into(),
        detail: None,
        capture: None,
        result: Some(json!({
            "accessibility": doctor.accessibility,
            "screen_recording": doctor.screen_recording,
            "host_app_name": doctor.host_app_name,
            "host_app_path": doctor.host_app_path,
            "grant": "atmos desktop-use driver grant-permissions --target all",
        })),
        error: Some(scrub_vendor(
            "Screen Recording is not granted to Atmos Desktop Use — pixel click/screenshot cannot run. \
Open System Settings → Privacy & Security → Screen Recording, enable Atmos Desktop Use, then: \
atmos desktop-use driver grant-permissions --target all",
        )),
        error_code: Some("permissions_required".into()),
    })
}

fn run_session_end(
    manager: &DesktopUseManager,
    req: &DriveRequest,
    action_name: &str,
) -> DriveResult {
    use crate::highlight::clear_highlight;

    let hl = clear_highlight();
    let mut engine_ended = false;
    let mut engine_error: Option<String> = None;

    // Use the caller's manager (paths/data dir) — do not construct a fresh global one.
    if let Ok(engine) = manager.require_engine() {
        let socket = manager.socket_path();
        let host_app = manager.host_app_path();
        if host::ensure_daemon(&engine, &socket, host_app.as_deref()).is_ok() {
            let sid = session_id(req).unwrap_or_else(|| DEFAULT_DRIVE_SESSION.to_string());
            match host::call_tool(&engine, &socket, "end_session", &json!({ "session": sid })) {
                Ok(_) => engine_ended = true,
                Err(e) => engine_error = Some(scrub_vendor(&e)),
            }
        }
    }

    let result = json!({
        "highlight_cleared": hl.ok,
        "session_ended": engine_ended,
        "session_error": engine_error,
    });
    DriveResult::ok_detail(action_name, None, Some(result))
}

fn status_for_request(req: &DriveRequest, target_app: Option<&str>, action_name: &str) -> String {
    crate::highlight::build_status_label(
        req.status_label.as_deref(),
        req.agent_name.as_deref(),
        action_name,
        target_app,
    )
}

fn cursor_points_for_request(req: &DriveRequest) -> Option<(f64, f64)> {
    cursor_points_for_request_with_window(req, None)
}

/// Logical screen points for the under-arrow caption.
///
/// When `window_bounds` is known and coords are window-local PNG/points, convert
/// to screen space so the capsule sits under the agent pointer — not at a free
/// window corner.
fn cursor_points_for_request_with_window(
    req: &DriveRequest,
    window_bounds: Option<(f64, f64, f64, f64)>,
) -> Option<(f64, f64)> {
    let (x, y) = match (req.x, req.y) {
        (Some(x), Some(y)) => (x as f64, y as f64),
        _ => return None,
    };
    match (req.coord_space, window_bounds, req.window_id) {
        (CoordSpace::Points, Some((bx, by, bw, bh)), Some(_)) => {
            // Agents often pass screen-absolute points with --window-id. If the
            // point lies inside the window, use it as-is; otherwise treat as local.
            if x >= bx && x <= bx + bw && y >= by && y <= by + bh {
                Some((x, y))
            } else {
                Some((bx + x, by + y))
            }
        }
        (CoordSpace::Points, _, _) => Some((x, y)),
        (CoordSpace::Png, Some((bx, by, _, _)), Some(_)) => {
            // Window-local PNG pixels → approximate screen points (Retina 2×).
            Some((bx + x / 2.0, by + y / 2.0))
        }
        (CoordSpace::Png, _, _) => {
            // Desktop PNG → logical points (best-effort 2× Retina).
            Some((x / 2.0, y / 2.0))
        }
    }
}

fn run_highlight(req: &DriveRequest, action_name: &str) -> DriveResult {
    use crate::highlight::{
        clear_highlight, show_desktop_highlight_styled, show_window_highlight_styled,
        HighlightStyle,
    };

    let label = status_for_request(req, None, action_name);
    // Explicit `drive highlight --mode window --x --y --width --height` uses x/y as
    // **window bounds**, not pointer position. Do not treat those as cursor anchors
    // (that recreated the free-floating capsule at the window top-left).
    let bounds_mode = matches!(
        (req.width, req.height),
        (Some(w), Some(h)) if w > 0 && h > 0
    );
    let cursor = if bounds_mode {
        None
    } else {
        cursor_points_for_request(req)
    };
    // Capsule only when we have a real pointer anchor.
    let style = HighlightStyle {
        label: cursor.as_ref().map(|_| label),
        cursor,
        blink: true,
        idle_ms: None,
        above_window_id: req.window_id,
        // Match the engine agent-cursor fill for this drive session.
        session_id: session_id(req),
        color_hex: None,
    };

    let hl = match req.highlight {
        HighlightMode::Clear | HighlightMode::Off => clear_highlight(),
        HighlightMode::Desktop => show_desktop_highlight_styled(style),
        HighlightMode::Auto => {
            if let (Some(x), Some(y), Some(w), Some(h)) = (req.x, req.y, req.width, req.height) {
                if w > 0 && h > 0 {
                    show_window_highlight_styled(x as f64, y as f64, w as f64, h as f64, style)
                } else {
                    show_desktop_highlight_styled(style)
                }
            } else {
                show_desktop_highlight_styled(style)
            }
        }
    };

    DriveResult {
        ok: hl.ok,
        action: action_name.into(),
        detail: None,
        capture: None,
        result: serde_json::to_value(&hl).ok(),
        error: hl.error,
        error_code: if hl.ok {
            None
        } else {
            Some("highlight_failed".into())
        },
    }
}

/// Apply border chrome + under-arrow status for an in-progress drive action
/// (best-effort; never fails the action).
///
/// Rules:
/// - Window border only when `window_id` resolves (no full-desktop fallback that
///   paints over the user's other apps).
/// - Status capsule only when a cursor position is known (under the agent arrow).
/// - Explicit `HighlightMode::Desktop` still draws desktop chrome.
fn apply_action_highlight(
    engine: &Path,
    socket: &Path,
    req: &DriveRequest,
    action_name: &str,
) -> Option<serde_json::Value> {
    use crate::highlight::{
        app_name_for_pid, app_name_for_window_id, bounds_for_window_id, clear_highlight,
        show_desktop_highlight_styled, show_window_highlight_styled, HighlightStyle,
    };

    match req.highlight {
        HighlightMode::Off => return None,
        HighlightMode::Clear => {
            let hl = clear_highlight();
            return serde_json::to_value(hl).ok();
        }
        HighlightMode::Desktop | HighlightMode::Auto => {}
    }

    let list = host::call_tool(engine, socket, "list_windows", &json!({})).ok();
    let target_app = list.as_ref().and_then(|l| {
        if let Some(wid) = req.window_id {
            app_name_for_window_id(l, wid)
        } else if let Some(pid) = req.pid {
            app_name_for_pid(l, pid)
        } else {
            None
        }
    });
    let window_bounds = list
        .as_ref()
        .and_then(|l| req.window_id.and_then(|wid| bounds_for_window_id(l, wid)));
    let cursor = cursor_points_for_request_with_window(req, window_bounds);
    let label = status_for_request(req, target_app.as_deref(), action_name);
    // Capsule only under the agent pointer — never a free-standing status pill.
    let caption = cursor.map(|_| label.clone());
    let style = HighlightStyle {
        label: caption,
        cursor,
        blink: true,
        idle_ms: None,
        above_window_id: req.window_id,
        // Same palette as the agent pointer for this session.
        session_id: session_id(req),
        color_hex: None,
    };

    if matches!(req.highlight, HighlightMode::Desktop) {
        let hl = show_desktop_highlight_styled(HighlightStyle {
            above_window_id: None, // desktop chrome is not tied to one window stack
            ..style
        });
        return serde_json::to_value(hl).ok();
    }

    if let Some(wid) = req.window_id {
        if let Some((x, y, w, h)) = window_bounds {
            let hl = show_window_highlight_styled(
                x,
                y,
                w,
                h,
                HighlightStyle {
                    above_window_id: Some(wid),
                    ..style
                },
            );
            return serde_json::to_value(hl).ok();
        }
        // Window requested but bounds unknown — do NOT fall back to full-desktop
        // chrome (that paints over whatever app the user is working in).
        return None;
    }

    // True desktop-scope actions (no window_id): border on the active display.
    // Still only attach a caption when we know a cursor point.
    if matches!(
        req.action,
        DriveAction::Click
            | DriveAction::DoubleClick
            | DriveAction::RightClick
            | DriveAction::MoveCursor
            | DriveAction::Drag
            | DriveAction::Scroll
            | DriveAction::Type
    ) {
        let hl = show_desktop_highlight_styled(style);
        return serde_json::to_value(hl).ok();
    }

    None
}

fn screenshot_via_engine(
    manager: &DesktopUseManager,
    req: &DriveRequest,
    action_name: &str,
) -> DriveResult {
    let Ok(engine) = manager.require_engine() else {
        return DriveResult::err(action_name, DriveError::EngineNotInstalled);
    };
    let socket = manager.socket_path();
    let host_app = manager.host_app_path();
    if let Err(e) = host::ensure_daemon(&engine, &socket, host_app.as_deref()) {
        return DriveResult::err(action_name, DriveError::EngineFailed(e));
    }

    // Materialize PNG via engine contract: --screenshot-out-file + tool arg.
    let tmp_guard = if req.out_path.is_none() {
        match tempfile::Builder::new()
            .prefix("atmos-du-shot-")
            .suffix(".png")
            .tempfile()
        {
            Ok(f) => Some(f),
            Err(e) => {
                return DriveResult::err(
                    action_name,
                    DriveError::EngineFailed(format!("temp screenshot path failed: {e}")),
                );
            }
        }
    } else {
        None
    };
    let out_path: std::path::PathBuf = req
        .out_path
        .clone()
        .or_else(|| tmp_guard.as_ref().map(|t| t.path().to_path_buf()))
        .expect("out path set");

    let args = json!({});
    match host::call_tool_with_screenshot_out(
        &engine,
        &socket,
        "get_desktop_state",
        &args,
        &out_path,
    ) {
        Ok(v) => match crate::engine_protocol::extract_screenshot_png(&v, Some(&out_path)) {
            Ok(bytes) => {
                // Ensure user-requested path has the bytes; surface write failures.
                if let Some(user_out) = req.out_path.as_ref() {
                    if user_out != &out_path {
                        if let Err(e) = std::fs::write(user_out, &bytes) {
                            drop(tmp_guard);
                            let mut r = DriveResult::err_code(
                                action_name,
                                "screenshot_write_failed",
                                scrub_vendor(&format!(
                                    "failed to write screenshot to {}: {e}",
                                    user_out.display()
                                )),
                            );
                            r.result = Some(v);
                            return r;
                        }
                    }
                } else if !out_path.exists() {
                    if let Err(e) = std::fs::write(&out_path, &bytes) {
                        drop(tmp_guard);
                        let mut r = DriveResult::err_code(
                            action_name,
                            "screenshot_write_failed",
                            scrub_vendor(&format!(
                                "failed to write screenshot to {}: {e}",
                                out_path.display()
                            )),
                        );
                        r.result = Some(v);
                        return r;
                    }
                }
                let b64 = crate::engine_protocol::encode_png_base64(&bytes);
                let normalized = match v {
                    serde_json::Value::Object(mut obj) => {
                        obj.insert("png_base64".into(), json!(b64.clone()));
                        obj.insert("png_path".into(), json!(out_path.display().to_string()));
                        // Tell agents which coordinate space drive click expects.
                        obj.insert("click_coord_space".into(), json!("png"));
                        obj.insert(
                            "click_coord_hint".into(),
                            json!(
                                "drive click --x/--y default is PNG pixels from this image (often 2× logical points on Retina). Use --coord-space points only for list_windows/AX logical coordinates."
                            ),
                        );
                        serde_json::Value::Object(obj)
                    }
                    other => json!({
                        "engine": other,
                        "png_base64": b64.clone(),
                        "png_path": out_path.display().to_string(),
                        "click_coord_space": "png",
                    }),
                };
                let capture = CaptureResult {
                    ok: true,
                    app_name: None,
                    window_title: None,
                    bundle_id: None,
                    process_id: None,
                    bounds: None,
                    png_base64: Some(b64),
                    png_path: Some(out_path.display().to_string()),
                    context_markdown: "capture_via: Atmos Desktop Use host engine".into(),
                    quality: "screenshot_only".into(),
                    warnings: vec!["capture_via: Atmos Desktop Use host engine".into()],
                    error: None,
                };
                // Keep temp file alive until after read; drop now that bytes are in memory.
                drop(tmp_guard);
                DriveResult {
                    ok: true,
                    action: action_name.into(),
                    detail: Some("via host engine".into()),
                    result: Some(normalized),
                    capture: Some(capture),
                    error: None,
                    error_code: None,
                }
            }
            Err(e) => {
                drop(tmp_guard);
                let mut r = DriveResult::err_code(
                    action_name,
                    "screenshot_missing",
                    scrub_vendor(&format!("{}: {e}", strings::ERR_ENGINE_FAILED)),
                );
                r.result = Some(v);
                r
            }
        },
        Err(e) => {
            drop(tmp_guard);
            DriveResult::err(
                action_name,
                DriveError::EngineFailed(format!("{}: {e}", strings::ERR_ENGINE_FAILED)),
            )
        }
    }
}

/// Default session id so agent cursor chrome stays visible across drive actions.
pub const DEFAULT_DRIVE_SESSION: &str = "atmos-desktop-use";

fn session_id(req: &DriveRequest) -> Option<String> {
    match req.session.as_deref() {
        Some("") => None,
        Some(s) => Some(s.to_string()),
        None => Some(DEFAULT_DRIVE_SESSION.to_string()),
    }
}

fn ensure_drive_session(engine: &Path, socket: &Path, session: &str) {
    // `auto` keeps window-scoped tools (double_click/right_click with pid) available.
    // Desktop-scope pixel clicks escalate when needed (see run_engine).
    let _ = host::call_tool(
        engine,
        socket,
        "start_session",
        &json!({
            "session": session,
            "capture_scope": "auto",
        }),
    );
    // Keep the agent cursor visible for long runs (default engine idle hide ~20s).
    // Note: the engine cursor is a session HUD; our border/caption stay window-scoped
    // and hide when the target is covered so they do not paint over the user's work.
    let _ = host::call_tool(
        engine,
        socket,
        "set_agent_cursor_enabled",
        &json!({ "session": session, "enabled": true }),
    );
    let _ = host::call_tool(
        engine,
        socket,
        "set_agent_cursor_motion",
        &json!({
            "session": session,
            "idle_hide_ms": 3_600_000.0,
        }),
    );
}

/// Engine 0.17: `escalate_session` is one-way. After a desktop-scope click the
/// live session is locked to desktop and window-scoped tools return
/// `window_scope_disabled`. End + restart so the next window action works.
fn reset_drive_session(engine: &Path, socket: &Path, session: &str) {
    let _ = host::call_tool(
        engine,
        socket,
        "end_session",
        &json!({ "session": session }),
    );
    ensure_drive_session(engine, socket, session);
}

fn session_effective_scope(engine: &Path, socket: &Path, session: &str) -> Option<String> {
    let v = host::call_tool(
        engine,
        socket,
        "get_session_state",
        &json!({ "session": session }),
    )
    .ok()?;
    v.get("effective_scope")
        .or_else(|| v.get("capture_scope"))
        .or_else(|| v.pointer("/session/effective_scope"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_ascii_lowercase())
}

fn needs_window_scope(req: &DriveRequest, args: &serde_json::Value) -> bool {
    if req.element_token.is_some() || req.element_index.is_some() {
        return true;
    }
    if req.window_id.is_some() {
        return true;
    }
    // Engine args may carry window_id even when request was filled via auto-pid.
    if args.get("window_id").is_some()
        && args.get("scope").and_then(|s| s.as_str()) != Some("desktop")
    {
        return true;
    }
    matches!(
        req.action,
        DriveAction::WindowState
            | DriveAction::BringToFront
            | DriveAction::SetWindowFrame
            | DriveAction::InvokeMenu
            | DriveAction::VerifyState
    )
}

fn is_window_scope_disabled(fail: &str) -> bool {
    let f = fail.to_ascii_lowercase();
    f.contains("window_scope_disabled") || f.contains("window scope disabled")
}

/// Desktop-scope scale: PNG pixels / logical screen points (often 2.0 on Retina).
/// Source of truth is get_desktop_state metadata, not get_screen_size.scale_factor
/// (which can report 1.0 while the PNG is still 2×).
fn desktop_png_scale(
    engine: &Path,
    socket: &Path,
) -> Result<(f64, f64, serde_json::Value), String> {
    let tmp = tempfile::Builder::new()
        .prefix("atmos-du-scale-")
        .suffix(".png")
        .tempfile()
        .map_err(|e| format!("scale probe tempfile failed: {e}"))?;
    let path = tmp.path().to_path_buf();
    let v = host::call_tool_with_screenshot_out(
        engine,
        socket,
        "get_desktop_state",
        &json!({}),
        &path,
    )?;
    let screen_w = v
        .get("screen_width")
        .and_then(|x| x.as_f64())
        .or_else(|| {
            v.get("screen_width")
                .and_then(|x| x.as_i64())
                .map(|n| n as f64)
        })
        .unwrap_or(0.0);
    let screen_h = v
        .get("screen_height")
        .and_then(|x| x.as_f64())
        .or_else(|| {
            v.get("screen_height")
                .and_then(|x| x.as_i64())
                .map(|n| n as f64)
        })
        .unwrap_or(0.0);
    let shot_w = v
        .get("screenshot_width")
        .and_then(|x| x.as_f64())
        .or_else(|| {
            v.get("screenshot_width")
                .and_then(|x| x.as_i64())
                .map(|n| n as f64)
        })
        .unwrap_or(0.0);
    let shot_h = v
        .get("screenshot_height")
        .and_then(|x| x.as_f64())
        .or_else(|| {
            v.get("screenshot_height")
                .and_then(|x| x.as_i64())
                .map(|n| n as f64)
        })
        .unwrap_or(0.0);
    let sx = if screen_w > 0.0 && shot_w > 0.0 {
        shot_w / screen_w
    } else {
        1.0
    };
    let sy = if screen_h > 0.0 && shot_h > 0.0 {
        shot_h / screen_h
    } else {
        1.0
    };
    let meta = json!({
        "screen_width": screen_w,
        "screen_height": screen_h,
        "screenshot_width": shot_w,
        "screenshot_height": shot_h,
        "scale_x": sx,
        "scale_y": sy,
        "coord_space_engine": "png",
    });
    // Keep tempfile until drop after read; engine already wrote PNG.
    drop(tmp);
    Ok((sx, sy, meta))
}

fn to_engine_desktop_xy(
    engine: &Path,
    socket: &Path,
    x: i32,
    y: i32,
    space: CoordSpace,
) -> Result<(i32, i32, Option<serde_json::Value>), String> {
    match space {
        CoordSpace::Png => Ok((x, y, None)),
        CoordSpace::Points => {
            let (sx, sy, meta) = desktop_png_scale(engine, socket)?;
            let px = (x as f64 * sx).round() as i32;
            let py = (y as f64 * sy).round() as i32;
            Ok((px, py, Some(meta)))
        }
    }
}

/// Convert logical points → window-local PNG pixels for engine 0.17.
///
/// Screen-absolute points that fall inside the window bounds are converted to
/// window-local; otherwise the values are treated as already window-local points.
fn to_engine_window_xy(
    engine: &Path,
    socket: &Path,
    window_id: i64,
    x: i32,
    y: i32,
) -> Result<(i32, i32, Option<serde_json::Value>), String> {
    let list = host::call_tool(engine, socket, "list_windows", &json!({}))
        .map_err(|e| format!("list_windows for window coord conversion failed: {e}"))?;
    let (bx, by, bw, bh) = crate::highlight::bounds_for_window_id(&list, window_id)
        .ok_or_else(|| format!("window_id {window_id} not found in list_windows"))?;

    let xf = x as f64;
    let yf = y as f64;
    let (local_x, local_y, input_kind) = if xf >= bx && xf <= bx + bw && yf >= by && yf <= by + bh {
        (xf - bx, yf - by, "screen_points")
    } else {
        (xf, yf, "window_local_points")
    };

    let (sx, sy, mut meta) = desktop_png_scale(engine, socket)?;
    let px = (local_x * sx).round() as i32;
    let py = (local_y * sy).round() as i32;
    if let Some(obj) = meta.as_object_mut() {
        obj.insert("window_id".into(), json!(window_id));
        obj.insert(
            "window_local_points".into(),
            json!({ "x": local_x, "y": local_y }),
        );
        obj.insert(
            "window_bounds_points".into(),
            json!({ "x": bx, "y": by, "width": bw, "height": bh }),
        );
        obj.insert("input_kind".into(), json!(input_kind));
        obj.insert("output_space".into(), json!("window_png"));
    } else {
        meta = json!({
            "window_id": window_id,
            "window_local_points": { "x": local_x, "y": local_y },
            "input_kind": input_kind,
            "scale_x": sx,
            "scale_y": sy,
        });
    }
    Ok((px, py, Some(meta)))
}

fn inject_session(args: &mut serde_json::Value, session: Option<&str>) {
    if let (Some(s), Some(obj)) = (session, args.as_object_mut()) {
        obj.insert("session".into(), json!(s));
    }
}

/// Best-effort app name for window-state surface hints (list_windows).
fn resolve_app_name_for_window(engine: &Path, socket: &Path, req: &DriveRequest) -> Option<String> {
    let wid = req.window_id?;
    let list = host::call_tool(engine, socket, "list_windows", &json!({})).ok()?;
    crate::highlight::app_name_for_window_id(&list, wid).or_else(|| {
        req.pid
            .and_then(|p| crate::highlight::app_name_for_pid(&list, p))
    })
}

/// Attach agent-facing metadata (coord conversion, highlight, delivery notes, AX surface).
fn enrich_drive_success(
    engine: &Path,
    socket: &Path,
    req: &DriveRequest,
    mut result: serde_json::Value,
    delivery: &str,
    scale_meta: Option<serde_json::Value>,
    highlight_meta: Option<serde_json::Value>,
) -> serde_json::Value {
    if let Some(meta) = scale_meta {
        result = match result {
            serde_json::Value::Object(mut obj) => {
                obj.insert("coord_conversion".into(), meta);
                serde_json::Value::Object(obj)
            }
            other => json!({ "engine": other, "coord_conversion": meta }),
        };
    }
    if let Some(hl) = highlight_meta {
        if let Some(obj) = result.as_object_mut() {
            obj.insert("highlight".into(), hl);
        } else {
            result = json!({ "engine": result, "highlight": hl });
        }
    }
    // Annotate delivery so agents can see background was used.
    if let Some(obj) = result.as_object_mut() {
        obj.entry("delivery_mode_requested")
            .or_insert_with(|| json!(delivery));
        obj.entry("background_note").or_insert_with(|| {
            json!(
                "Default is background (no persistent fronting). AX element_token works off-focus; pixel path needs on-screen window. Use --delivery-mode foreground only if background fails (brief front→act→restore)."
            )
        });
    }

    // Window AX surface classification (Electron empty trees, heavy trees, …).
    if matches!(req.action, DriveAction::WindowState) {
        let app_name = resolve_app_name_for_window(engine, socket, req);
        crate::window_surface::enrich_window_state(&mut result, app_name.as_deref());
    }

    // Pixel-path clicks: remind agents of the AX→pixel→foreground ladder.
    if matches!(
        req.action,
        DriveAction::Click | DriveAction::DoubleClick | DriveAction::RightClick
    ) && req.element_token.is_none()
        && req.element_index.is_none()
        && req.x.is_some()
    {
        if let Some(obj) = result.as_object_mut() {
            obj.entry("atmos_addressing")
                .or_insert_with(crate::window_surface::pixel_path_note);
        }
    }

    // Type without element/pixel focus often lands in the wrong app on
    // empty-AX surfaces — surface a short recovery ladder.
    if matches!(req.action, DriveAction::Type)
        && req.element_token.is_none()
        && req.element_index.is_none()
        && req.x.is_none()
    {
        if let Some(obj) = result.as_object_mut() {
            obj.entry("atmos_type_hint").or_insert_with(|| {
                json!({
                    "note": "type without --element-token or --x/--y uses AX focus in the target pid (or frontmost). Empty-AX / custom UI apps often drop text.",
                    "next_steps": [
                        "Prefer: window-state → type --element-token … (true background when AX exists)",
                        "Empty AX: click the field (PNG or points), then type --text … --x --y (same coords) --pid --window-id",
                        "If still no input: --delivery-mode foreground once (brief front→type→restore)",
                        "Do not drive front every turn"
                    ]
                })
            });
        }
    }
    result
}

fn run_engine(
    manager: &DesktopUseManager,
    engine: &Path,
    req: &DriveRequest,
    action_name: &str,
) -> DriveResult {
    let socket = manager.socket_path();
    let host_app = manager.host_app_path();
    if let Err(e) = host::ensure_daemon(engine, &socket, host_app.as_deref()) {
        return DriveResult::err(action_name, DriveError::EngineFailed(e));
    }

    let delivery = req.delivery_mode.as_deref().unwrap_or("background");
    let session = session_id(req);
    if let Some(ref s) = session {
        ensure_drive_session(engine, &socket, s);
    }

    // Scale desktop pixel coords for points→png before building the engine call.
    // Also fill missing pid from window_id (engine 0.17 requires pid for window-scoped click).
    let mut req_for_call = req.clone();
    if req_for_call.pid.is_none() {
        if let Some(wid) = req_for_call.window_id {
            if let Ok(list) = host::call_tool(engine, &socket, "list_windows", &json!({})) {
                if let Some(pid) = crate::highlight::pid_for_window_id(&list, wid) {
                    req_for_call.pid = Some(pid);
                }
            }
        }
    }

    let mut scale_meta: Option<serde_json::Value> = None;
    let highlight_meta = if crate::drive_tools::wants_action_highlight(&req_for_call) {
        apply_action_highlight(engine, &socket, &req_for_call, action_name)
    } else {
        None
    };

    // Convert coordinates for the engine when agents pass logical points:
    // - desktop-scope + points → desktop PNG pixels
    // - window-scope + points → window-local PNG pixels
    //   (screen-absolute points inside the window are auto-normalized — common
    //   agent mistake when combining --window-id with list_windows / AX coords)
    if req_for_call.element_token.is_none()
        && req_for_call.element_index.is_none()
        && req_for_call.x.is_some()
        && req_for_call.y.is_some()
        && matches!(req_for_call.coord_space, CoordSpace::Points)
        && matches!(
            req_for_call.action,
            DriveAction::Click
                | DriveAction::DoubleClick
                | DriveAction::RightClick
                | DriveAction::MoveCursor
                | DriveAction::Type
                | DriveAction::Scroll
        )
    {
        if let (Some(x), Some(y)) = (req_for_call.x, req_for_call.y) {
            if let Some(wid) = req_for_call.window_id {
                match to_engine_window_xy(engine, &socket, wid, x, y) {
                    Ok((ex, ey, meta)) => {
                        req_for_call.x = Some(ex);
                        req_for_call.y = Some(ey);
                        req_for_call.coord_space = CoordSpace::Png;
                        scale_meta = meta;
                    }
                    Err(e) => {
                        return DriveResult::err(
                            action_name,
                            DriveError::EngineFailed(format!(
                                "{}: {e}",
                                strings::ERR_ENGINE_FAILED
                            )),
                        );
                    }
                }
            } else if req_for_call.pid.is_none() {
                match to_engine_desktop_xy(engine, &socket, x, y, CoordSpace::Points) {
                    Ok((ex, ey, meta)) => {
                        req_for_call.x = Some(ex);
                        req_for_call.y = Some(ey);
                        req_for_call.coord_space = CoordSpace::Png;
                        scale_meta = meta;
                    }
                    Err(e) => {
                        return DriveResult::err(
                            action_name,
                            DriveError::EngineFailed(format!(
                                "{}: {e}",
                                strings::ERR_ENGINE_FAILED
                            )),
                        );
                    }
                }
            }
        }
    }

    let (tool, mut args) = match crate::drive_tools::build_engine_call(&req_for_call) {
        Ok(v) => v,
        Err(msg) => {
            return DriveResult::err(action_name, DriveError::InvalidArgs(msg));
        }
    };

    // Window-scoped engine tools expect pid; we auto-fill above — surface a clear
    // error if list_windows could not resolve it.
    if args.get("window_id").is_some()
        && args.get("pid").is_none()
        && matches!(
            req_for_call.action,
            DriveAction::Click
                | DriveAction::DoubleClick
                | DriveAction::RightClick
                | DriveAction::Type
                | DriveAction::WindowState
        )
        && req_for_call.element_token.is_none()
    {
        return DriveResult {
            ok: false,
            action: action_name.into(),
            detail: None,
            capture: None,
            result: None,
            error: Some(
                "window-scoped action needs --pid (could not resolve from --window-id; pass --pid explicitly)"
                    .into(),
            ),
            error_code: Some("invalid_args".into()),
        };
    }

    if crate::drive_tools::wants_pre_move_cursor(&req_for_call) {
        if let (Some(x), Some(y)) = (req_for_call.x, req_for_call.y) {
            let mut move_args = json!({ "x": x, "y": y, "scope": "desktop" });
            inject_session(&mut move_args, session.as_deref());
            let _ = host::call_tool(engine, &socket, "move_cursor", &move_args);
        }
    }

    inject_session(&mut args, session.as_deref());

    // If a prior desktop escalate locked this session, restore window capability
    // before the next window-scoped tool (engine escalate is one-way).
    let window_scoped = needs_window_scope(&req_for_call, &args);
    if window_scoped {
        if let Some(ref s) = session {
            if session_effective_scope(engine, &socket, s)
                .as_deref()
                .is_some_and(|sc| sc.contains("desktop"))
            {
                reset_drive_session(engine, &socket, s);
                inject_session(&mut args, Some(s));
            }
        }
    }

    // Desktop-scope actions need an escalated auto session (engine 0.17).
    if args.get("scope").and_then(|s| s.as_str()) == Some("desktop") {
        if let Some(ref s) = session {
            let _ = host::call_tool(
                engine,
                &socket,
                "escalate_session",
                &json!({
                    "session": s,
                    "reason": "no_window_target",
                    "detail": "desktop_scope_drive",
                }),
            );
        }
    }

    let mut engine_result = host::call_tool(engine, &socket, tool, &args);
    // One automatic recovery if escalate left us desktop-locked mid-run.
    if window_scoped {
        if let (Some(s), Ok(ref v)) = (session.as_ref(), &engine_result) {
            if let Some(fail) = crate::engine_protocol::engine_payload_is_failure(v) {
                if is_window_scope_disabled(&fail) {
                    reset_drive_session(engine, &socket, s);
                    inject_session(&mut args, Some(s));
                    engine_result = host::call_tool(engine, &socket, tool, &args);
                }
            }
        }
    }

    match engine_result {
        Ok(v) => {
            if let Some(fail) = crate::engine_protocol::engine_payload_is_failure(&v) {
                let fail_l = fail.to_ascii_lowercase();
                let capture_related = fail_l.contains("screencapture")
                    || fail_l.contains("px_capture")
                    || fail_l.contains("could not create image")
                    || fail_l.contains("capture_unavailable");
                let mut r = if capture_related {
                    DriveResult::err_code(
                        action_name,
                        "permissions_required",
                        scrub_vendor(&format!(
                            "{fail}. Grant Screen Recording to Atmos Desktop Use \
(System Settings → Privacy & Security → Screen Recording), then: \
atmos desktop-use driver grant-permissions --target screen_recording"
                        )),
                    )
                } else {
                    DriveResult::err(
                        action_name,
                        DriveError::EngineFailed(format!("{}: {fail}", strings::ERR_ENGINE_FAILED)),
                    )
                };
                r.detail = Some(v.to_string());
                r.result = Some(v);
                return r;
            }
            let result = enrich_drive_success(
                engine,
                &socket,
                req,
                v,
                delivery,
                scale_meta,
                highlight_meta,
            );
            DriveResult::ok_result(action_name, result)
        }
        Err(e) => DriveResult::err(
            action_name,
            DriveError::EngineFailed(format!("{}: {e}", strings::ERR_ENGINE_FAILED)),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manager::DesktopUseManager;
    use tempfile::tempdir;

    #[test]
    fn click_without_engine_structured_error() {
        let dir = tempdir().unwrap();
        let engine = dir.path().join("missing-engine");
        let mgr = DesktopUseManager::with_paths(dir.path(), &engine);
        let res = drive(
            &mgr,
            DriveRequest {
                action: DriveAction::Click,
                x: Some(1),
                y: Some(2),
                ..Default::default()
            },
        );
        assert!(!res.ok);
        assert_eq!(
            res.error_code.as_deref(),
            Some("control_engine_not_installed")
        );
        let err = res.error.unwrap();
        assert!(!strings::contains_vendor_brand(&err));
        assert!(err.contains("desktop-use"));
    }

    #[test]
    fn coord_space_parse_aliases() {
        assert_eq!(CoordSpace::parse("png"), Some(CoordSpace::Png));
        assert_eq!(CoordSpace::parse("pixels"), Some(CoordSpace::Png));
        assert_eq!(CoordSpace::parse("points"), Some(CoordSpace::Points));
        assert_eq!(CoordSpace::parse("logical"), Some(CoordSpace::Points));
        assert_eq!(CoordSpace::parse("nope"), None);
    }

    #[test]
    fn session_id_defaults_and_disable() {
        let default_req = DriveRequest::default();
        assert_eq!(
            session_id(&default_req).as_deref(),
            Some(DEFAULT_DRIVE_SESSION)
        );
        let off = DriveRequest {
            session: Some(String::new()),
            ..Default::default()
        };
        assert_eq!(session_id(&off), None);
        let custom = DriveRequest {
            session: Some("run-1".into()),
            ..Default::default()
        };
        assert_eq!(session_id(&custom).as_deref(), Some("run-1"));
    }
}
