//! `atmos desktop-use` — Desktop Use status, control engine, capture, and drive.

use clap::{Args, Subcommand};
use desktop_use::{
    capture, drive, load_prefs, permission_doctor, update_prefs, CaptureRequest, CoordSpace,
    DesktopUseManager, DriveAction, DriveRequest, EnsureOutcome, HighlightMode,
    PermissionGrantTarget,
};
use serde_json::{json, Value};

pub async fn execute(command: DesktopUseCommand) -> Result<Value, String> {
    match command {
        DesktopUseCommand::Status => status(),
        DesktopUseCommand::Doctor => doctor(),
        DesktopUseCommand::Driver { command } => match command {
            DriverCommand::Ensure(args) => driver_ensure(args),
            DriverCommand::Status => driver_status(),
            DriverCommand::Stop => driver_stop(),
            DriverCommand::Uninstall => driver_uninstall(),
            DriverCommand::GrantPermissions(args) => driver_grant(args),
        },
        DesktopUseCommand::Capture(args) => capture_cmd(args),
        DesktopUseCommand::Drive { command } => drive_cmd(*command),
        DesktopUseCommand::Prefs { command } => prefs_cmd(command),
    }
}

#[derive(Debug, Subcommand)]
pub enum DesktopUseCommand {
    /// Show Desktop Use capture + control-engine status.
    Status,
    /// Permission doctor for Atmos Desktop Use host (unified TCC surface).
    Doctor,
    /// Manage the optional desktop control engine.
    Driver {
        #[command(subcommand)]
        command: DriverCommand,
    },
    /// Capture the frontmost window (screenshot + identity).
    Capture(CaptureArgs),
    /// Drive desktop actions (screenshot / click / type / verify).
    Drive {
        #[command(subcommand)]
        command: Box<DriveCommand>,
    },
    /// Read or update Desktop Use user prefs (operation border, idle clear).
    Prefs {
        #[command(subcommand)]
        command: PrefsCommand,
    },
}

#[derive(Debug, Subcommand)]
pub enum PrefsCommand {
    /// Show current prefs.
    Get,
    /// Update prefs (only provided flags are changed).
    Set(PrefsSetArgs),
}

#[derive(Debug, Args)]
pub struct PrefsSetArgs {
    /// Show blinking operation border while driving (true/false).
    #[arg(long)]
    pub operation_border: Option<String>,
    /// Auto-clear border after this many ms of idle (0 = never).
    #[arg(long)]
    pub highlight_idle_ms: Option<u64>,
}

#[derive(Debug, Subcommand)]
pub enum DriverCommand {
    /// Install or refresh the desktop control engine (pinned package).
    Ensure(EnsureArgs),
    /// Show control-engine status only.
    Status,
    /// Stop the control engine daemon (does not delete the binary).
    Stop,
    /// Remove the installed control engine binary.
    Uninstall,
    /// Open OS permission grant flow for Atmos Desktop Use host.
    GrantPermissions(GrantPermissionsArgs),
}

#[derive(Debug, Args)]
pub struct GrantPermissionsArgs {
    /// Which Privacy pane to open: accessibility | screen_recording | all
    #[arg(long, default_value = "all")]
    pub target: String,
}

#[derive(Debug, Args)]
pub struct EnsureArgs {
    /// Re-install even if a control engine is already present.
    #[arg(long, default_value_t = false)]
    pub force: bool,
}

#[derive(Debug, Args)]
pub struct CaptureArgs {
    /// Write PNG to this path instead of embedding base64 only.
    #[arg(long)]
    pub out: Option<String>,
    /// Always include base64 in JSON (default when --out is omitted).
    #[arg(long, default_value_t = false)]
    pub base64: bool,
}

#[derive(Debug, Subcommand)]
pub enum DriveCommand {
    /// Capture a screenshot via Desktop Use.
    Screenshot(ScreenshotArgs),
    /// Click at screen coordinates or AX element (requires control engine).
    Click(ClickArgs),
    /// Double-click (Phase 1).
    #[command(name = "double-click")]
    DoubleClick(ClickArgs),
    /// Right-click (Phase 1).
    #[command(name = "right-click")]
    RightClick(ClickArgs),
    /// Drag from --from-x/y to --to-x/y (Phase 1).
    Drag(DragArgs),
    /// Scroll (Phase 1).
    Scroll(ScrollArgs),
    /// Hotkey chord, e.g. --keys cmd,c (Phase 1).
    Hotkey(HotkeyArgs),
    /// Single key press (Phase 1).
    Key(KeyArgs),
    /// Move cursor (Phase 1).
    Move(MoveArgs),
    /// List apps (Phase 1).
    Apps,
    /// Launch app by bundle id or name (Phase 1).
    Launch(LaunchArgs),
    /// Terminate process by pid (Phase 1).
    Quit(QuitArgs),
    /// Clipboard get/set (Phase 1).
    Clipboard {
        #[command(subcommand)]
        command: ClipboardCommand,
    },
    /// Screen size (Phase 1).
    Screen,
    /// Cursor position (Phase 1).
    Cursor,
    /// Invoke application menu path (Phase 1).
    Menu(MenuArgs),
    /// Lightweight desktop accessibility tree (Phase 1).
    #[command(name = "ax-tree")]
    AxTree,
    /// Type text (requires control engine).
    Type(TypeArgs),
    /// Verify engine is live (list windows).
    Verify,
    /// Snapshot one window's AX elements (background-friendly; prefer for element clicks).
    WindowState(WindowStateArgs),
    /// Show/clear target window or desktop border highlight.
    Highlight(HighlightArgs),
    /// End drive session: clear operation border and agent cursor session.
    SessionEnd,
    /// Bring app/window to front (Phase 2 — explicit only).
    Front(FrontArgs),
    /// Set AX value on an element (Phase 2).
    #[command(name = "set-value")]
    SetValue(SetValueArgs),
    /// Set window frame (Phase 2).
    #[command(name = "window-frame")]
    WindowFrame(WindowFrameArgs),
    /// Zoom/crop window region (Phase 2).
    Zoom(ZoomArgs),
    /// Verify structured window predicates (Phase 2).
    #[command(name = "verify-state")]
    VerifyState(VerifyStateArgs),
}

#[derive(Debug, Subcommand)]
pub enum ClipboardCommand {
    Get(ClipboardGetArgs),
    Set(ClipboardSetArgs),
}

#[derive(Debug, Args)]
pub struct ClipboardGetArgs {}

#[derive(Debug, Args)]
pub struct ClipboardSetArgs {
    #[arg(long)]
    pub text: String,
}

#[derive(Debug, Args)]
pub struct DragArgs {
    #[arg(long)]
    pub from_x: i32,
    #[arg(long)]
    pub from_y: i32,
    #[arg(long)]
    pub to_x: i32,
    #[arg(long)]
    pub to_y: i32,
    #[arg(long)]
    pub pid: Option<i32>,
    #[arg(long)]
    pub window_id: Option<i64>,
    #[arg(long, default_value = "background")]
    pub delivery_mode: String,
}

#[derive(Debug, Args)]
pub struct ScrollArgs {
    #[arg(long)]
    pub direction: String,
    #[arg(long)]
    pub amount: Option<i32>,
    #[arg(long)]
    pub by: Option<String>,
    #[arg(long)]
    pub x: Option<i32>,
    #[arg(long)]
    pub y: Option<i32>,
    #[arg(long)]
    pub pid: Option<i32>,
    #[arg(long)]
    pub window_id: Option<i64>,
    #[arg(long)]
    pub element_token: Option<String>,
    #[arg(long, default_value = "background")]
    pub delivery_mode: String,
}

#[derive(Debug, Args)]
pub struct HotkeyArgs {
    /// Comma-separated keys, e.g. cmd,c or ctrl,shift,t
    #[arg(long)]
    pub keys: String,
    #[arg(long)]
    pub pid: Option<i32>,
    #[arg(long)]
    pub window_id: Option<i64>,
    #[arg(long, default_value = "background")]
    pub delivery_mode: String,
}

#[derive(Debug, Args)]
pub struct KeyArgs {
    #[arg(long)]
    pub key: String,
    #[arg(long)]
    pub pid: Option<i32>,
    #[arg(long)]
    pub window_id: Option<i64>,
    #[arg(long, default_value = "background")]
    pub delivery_mode: String,
}

#[derive(Debug, Args)]
pub struct MoveArgs {
    #[arg(long)]
    pub x: i32,
    #[arg(long)]
    pub y: i32,
    #[arg(long, default_value = "png")]
    pub coord_space: String,
    #[arg(long)]
    pub session: Option<String>,
}

#[derive(Debug, Args)]
pub struct LaunchArgs {
    #[arg(long)]
    pub bundle_id: Option<String>,
    #[arg(long)]
    pub name: Option<String>,
}

#[derive(Debug, Args)]
pub struct QuitArgs {
    #[arg(long)]
    pub pid: i32,
}

#[derive(Debug, Args)]
pub struct MenuArgs {
    #[arg(long)]
    pub pid: i32,
    /// JSON array path, e.g. '["File","New"]'
    #[arg(long)]
    pub path: String,
    #[arg(long)]
    pub window_id: Option<i64>,
}

#[derive(Debug, Args)]
pub struct FrontArgs {
    #[arg(long)]
    pub pid: i32,
    #[arg(long)]
    pub window_id: Option<i64>,
}

#[derive(Debug, Args)]
pub struct SetValueArgs {
    #[arg(long)]
    pub text: String,
    #[arg(long)]
    pub pid: Option<i32>,
    #[arg(long)]
    pub window_id: Option<i64>,
    #[arg(long)]
    pub element_token: Option<String>,
    #[arg(long)]
    pub element_index: Option<i32>,
    #[arg(long)]
    pub snapshot_id: Option<String>,
}

#[derive(Debug, Args)]
pub struct WindowFrameArgs {
    #[arg(long)]
    pub pid: i32,
    #[arg(long)]
    pub window_id: i64,
    #[arg(long)]
    pub x: i32,
    #[arg(long)]
    pub y: i32,
    #[arg(long)]
    pub width: i32,
    #[arg(long)]
    pub height: i32,
}

#[derive(Debug, Args)]
pub struct ZoomArgs {
    #[arg(long)]
    pub window_id: i64,
    #[arg(long)]
    pub pid: Option<i32>,
    #[arg(long)]
    pub x1: f64,
    #[arg(long)]
    pub y1: f64,
    #[arg(long)]
    pub x2: f64,
    #[arg(long)]
    pub y2: f64,
}

#[derive(Debug, Args)]
pub struct VerifyStateArgs {
    #[arg(long)]
    pub pid: i32,
    #[arg(long)]
    pub window_id: i64,
    /// Optional JSON array for expect predicates.
    #[arg(long)]
    pub expect: Option<String>,
}

#[derive(Debug, Args)]
pub struct ScreenshotArgs {
    #[arg(long)]
    pub out: Option<String>,
}

#[derive(Debug, Args)]
pub struct ClickArgs {
    /// X coordinate (top-left origin). Default: PNG pixels from `drive screenshot`. With --window-id: window-local image pixels. Not required with --element-token.
    #[arg(long)]
    pub x: Option<i32>,
    /// Y coordinate (top-left origin). Default: PNG pixels from `drive screenshot`. With --window-id: window-local image pixels. Not required with --element-token.
    #[arg(long)]
    pub y: Option<i32>,
    /// Optional process id. Prefer omitting for screen-absolute pixel clicks. Required for element clicks when token alone is insufficient.
    #[arg(long)]
    pub pid: Option<i32>,
    /// Optional window id for window-local coordinates / foreground delivery / window border highlight.
    #[arg(long)]
    pub window_id: Option<i64>,
    /// background (default, no persistent fronting) or foreground (brief front→act→restore).
    #[arg(long, default_value = "background")]
    pub delivery_mode: String,
    /// Desktop-scope coord space: `png` (default, screenshot pixels, often 2× on Retina) or `points` (logical screen / AX / list_windows bounds).
    #[arg(long, default_value = "png")]
    pub coord_space: String,
    /// Agent cursor session id (default atmos-desktop-use). Pass empty string to disable cursor chrome.
    #[arg(long)]
    pub session: Option<String>,
    /// AX element token from `drive window-state` (true background path; preferred).
    #[arg(long)]
    pub element_token: Option<String>,
    /// AX element index (requires --snapshot-id). Prefer --element-token.
    #[arg(long)]
    pub element_index: Option<i32>,
    /// Snapshot id from `drive window-state` (with --element-index).
    #[arg(long)]
    pub snapshot_id: Option<String>,
    /// Border highlight: auto (default) | desktop | clear | off
    #[arg(long, default_value = "auto")]
    pub highlight: String,
    /// Under-arrow operation text. Combined as "{agent} - {status}". Also used alone when already prefixed.
    #[arg(long)]
    pub status: Option<String>,
    /// Agent display name for "{name} - …". Also reads ATMOS_DESKTOP_USE_AGENT_NAME / AGENT_NAME.
    #[arg(long)]
    pub agent_name: Option<String>,
}

#[derive(Debug, Args)]
pub struct TypeArgs {
    #[arg(long)]
    pub text: String,
    /// Optional pixel focus before type (engine 0.17). Use after a click fails to keep focus,
    /// or for empty-AX apps: same coordinate rules as `drive click`.
    #[arg(long)]
    pub x: Option<i32>,
    #[arg(long)]
    pub y: Option<i32>,
    #[arg(long)]
    pub pid: Option<i32>,
    #[arg(long)]
    pub window_id: Option<i64>,
    /// background (default) or foreground.
    #[arg(long, default_value = "background")]
    pub delivery_mode: String,
    /// Desktop/window coord space for --x/--y: `png` (default) or `points` (screen/AX logical).
    #[arg(long, default_value = "png")]
    pub coord_space: String,
    /// AX element token from `drive window-state` (preferred for focused fields).
    #[arg(long)]
    pub element_token: Option<String>,
    /// AX element index (requires --snapshot-id + --window-id). Prefer --element-token.
    #[arg(long)]
    pub element_index: Option<i32>,
    /// Snapshot id from `drive window-state` (with --element-index).
    #[arg(long)]
    pub snapshot_id: Option<String>,
    #[arg(long, default_value = "auto")]
    pub highlight: String,
    #[arg(long)]
    pub status: Option<String>,
    #[arg(long)]
    pub agent_name: Option<String>,
}

#[derive(Debug, Args)]
pub struct WindowStateArgs {
    #[arg(long)]
    pub pid: i32,
    #[arg(long)]
    pub window_id: i64,
    /// Include window screenshot (heavier; default false). Use when AX is empty (pixel path).
    #[arg(long, default_value_t = false)]
    pub screenshot: bool,
    /// Cap AX nodes walked (engine default ~2000). Lower for heavy Electron trees.
    #[arg(long)]
    pub max_elements: Option<i32>,
    /// Cap AX walk depth (engine default ~25). Lower for deep Electron menus.
    #[arg(long)]
    pub max_depth: Option<i32>,
    /// Case-insensitive substring filter over role / name / text (engine `query`).
    #[arg(long)]
    pub query: Option<String>,
}

#[derive(Debug, Args)]
pub struct HighlightArgs {
    /// auto | desktop | clear | window (window needs --x --y --width --height)
    #[arg(long, default_value = "desktop")]
    pub mode: String,
    #[arg(long)]
    pub x: Option<i32>,
    #[arg(long)]
    pub y: Option<i32>,
    #[arg(long)]
    pub width: Option<i32>,
    #[arg(long)]
    pub height: Option<i32>,
    /// Target CGWindowID — border stacks just above this window (covered when app is covered).
    #[arg(long)]
    pub window_id: Option<i64>,
    /// Under-arrow / border status text.
    #[arg(long)]
    pub status: Option<String>,
    #[arg(long)]
    pub agent_name: Option<String>,
}

fn status() -> Result<Value, String> {
    let mgr = DesktopUseManager::new();
    serde_json::to_value(mgr.status()).map_err(|e| e.to_string())
}

fn doctor() -> Result<Value, String> {
    let mgr = DesktopUseManager::new();
    serde_json::to_value(permission_doctor(&mgr)).map_err(|e| e.to_string())
}

fn driver_status() -> Result<Value, String> {
    let mgr = DesktopUseManager::new();
    serde_json::to_value(mgr.status().driver).map_err(|e| e.to_string())
}

fn driver_ensure(args: EnsureArgs) -> Result<Value, String> {
    let mgr = DesktopUseManager::new();
    let outcome = mgr.ensure_driver(args.force);
    let status = mgr.status();
    match outcome {
        EnsureOutcome::AlreadyInstalled { path } => Ok(json!({
            "ok": true,
            "action": "already_installed",
            "path": path,
            "status": status.driver,
            "host_app_name": status.host_app_name,
            "host_app_path": status.host_app_path,
            "pinned_version": status.pinned_version,
        })),
        EnsureOutcome::Installed { path } => Ok(json!({
            "ok": true,
            "action": "installed",
            "path": path,
            "status": status.driver,
            "host_app_name": status.host_app_name,
            "host_app_path": status.host_app_path,
            "pinned_version": status.pinned_version,
        })),
        EnsureOutcome::Failed { error } => Ok(json!({
            "ok": false,
            "action": "failed",
            "error": error,
            "status": status.driver,
        })),
    }
}

fn driver_stop() -> Result<Value, String> {
    let mgr = DesktopUseManager::new();
    let driver = mgr.stop_driver();
    Ok(json!({ "ok": true, "action": "stopped", "status": driver }))
}

fn driver_uninstall() -> Result<Value, String> {
    let mgr = DesktopUseManager::new();
    let driver = mgr.uninstall_driver();
    Ok(json!({ "ok": true, "action": "uninstalled", "status": driver }))
}

fn driver_grant(args: GrantPermissionsArgs) -> Result<Value, String> {
    let target = PermissionGrantTarget::parse(&args.target).ok_or_else(|| {
        format!(
            "invalid --target {:?} (use accessibility, screen_recording, or all)",
            args.target
        )
    })?;
    let mgr = DesktopUseManager::new();
    let outcome = mgr.open_permission_grant_target(target)?;
    let target_label = outcome.target.as_str();
    let host_name = outcome
        .host_app_name
        .as_deref()
        .unwrap_or("Atmos Desktop Use");

    // Do not open Finder / Reveal — Settings is enough; Desktop shows a grant panel.

    let hint = if outcome.accessibility_pane {
        format!(
            "System Settings → Accessibility opened. Enable the toggle for {host_name}. If it is not listed, add the host app with + (path in host_app_path), then Refresh. Atmos Desktop shows a drag chip for the same path."
        )
    } else {
        format!(
            "System Settings → Screen Recording opened for {host_name}. Enable the toggle there, then return and Refresh."
        )
    };

    Ok(json!({
        "ok": true,
        "action": "grant_permissions",
        "target": target_label,
        "host": host_name,
        "host_app_path": outcome.host_app_path,
        "host_app_name": outcome.host_app_name,
        "accessibility_pane": outcome.accessibility_pane,
        "applied": true,
        "opened_settings": outcome.opened_settings,
        "hint": hint,
    }))
}

fn capture_cmd(args: CaptureArgs) -> Result<Value, String> {
    let include_base64 = args.base64 || args.out.is_none();
    let result = capture(CaptureRequest {
        out_path: args.out.map(Into::into),
        include_base64,
    });
    serde_json::to_value(result).map_err(|e| e.to_string())
}

fn prefs_cmd(command: PrefsCommand) -> Result<Value, String> {
    match command {
        PrefsCommand::Get => {
            let p = load_prefs();
            Ok(json!({ "ok": true, "prefs": p }))
        }
        PrefsCommand::Set(a) => {
            let border = match a.operation_border.as_deref() {
                None => None,
                Some(s) => {
                    let t = s.trim().to_ascii_lowercase();
                    match t.as_str() {
                        "1" | "true" | "yes" | "on" => Some(true),
                        "0" | "false" | "no" | "off" => Some(false),
                        other => {
                            return Err(format!(
                                "invalid --operation-border {:?} (use true/false)",
                                other
                            ));
                        }
                    }
                }
            };
            let p = update_prefs(border, a.highlight_idle_ms)?;
            Ok(json!({ "ok": true, "prefs": p, "action": "set" }))
        }
    }
}

fn drive_cmd(command: DriveCommand) -> Result<Value, String> {
    let mgr = DesktopUseManager::new();
    let req = match command {
        DriveCommand::Screenshot(a) => DriveRequest {
            action: DriveAction::Screenshot,
            out_path: a.out.map(Into::into),
            ..Default::default()
        },
        DriveCommand::Click(a) => click_like(DriveAction::Click, a)?,
        DriveCommand::DoubleClick(a) => click_like(DriveAction::DoubleClick, a)?,
        DriveCommand::RightClick(a) => click_like(DriveAction::RightClick, a)?,
        DriveCommand::Drag(a) => DriveRequest {
            action: DriveAction::Drag,
            from_x: Some(a.from_x),
            from_y: Some(a.from_y),
            to_x: Some(a.to_x),
            to_y: Some(a.to_y),
            pid: a.pid,
            window_id: a.window_id,
            delivery_mode: Some(a.delivery_mode),
            highlight: HighlightMode::Auto,
            ..Default::default()
        },
        DriveCommand::Scroll(a) => DriveRequest {
            action: DriveAction::Scroll,
            direction: Some(a.direction),
            amount: a.amount,
            scroll_by: a.by,
            x: a.x,
            y: a.y,
            pid: a.pid,
            window_id: a.window_id,
            element_token: a.element_token,
            delivery_mode: Some(a.delivery_mode),
            highlight: HighlightMode::Auto,
            ..Default::default()
        },
        DriveCommand::Hotkey(a) => {
            let keys: Vec<String> = a
                .keys
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            DriveRequest {
                action: DriveAction::Hotkey,
                keys: Some(json!(keys)),
                pid: a.pid,
                window_id: a.window_id,
                delivery_mode: Some(a.delivery_mode),
                highlight: HighlightMode::Off,
                ..Default::default()
            }
        }
        DriveCommand::Key(a) => DriveRequest {
            action: DriveAction::PressKey,
            key: Some(a.key),
            pid: a.pid,
            window_id: a.window_id,
            delivery_mode: Some(a.delivery_mode),
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::Move(a) => {
            let coord_space = CoordSpace::parse(&a.coord_space)
                .ok_or_else(|| format!("invalid --coord-space {:?}", a.coord_space))?;
            DriveRequest {
                action: DriveAction::MoveCursor,
                x: Some(a.x),
                y: Some(a.y),
                coord_space,
                session: a.session,
                highlight: HighlightMode::Off,
                ..Default::default()
            }
        }
        DriveCommand::Apps => DriveRequest {
            action: DriveAction::ListApps,
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::Launch(a) => DriveRequest {
            action: DriveAction::LaunchApp,
            bundle_id: a.bundle_id,
            app_name: a.name,
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::Quit(a) => DriveRequest {
            action: DriveAction::KillApp,
            pid: Some(a.pid),
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::Clipboard { command } => match command {
            ClipboardCommand::Get(_) => DriveRequest {
                action: DriveAction::ClipboardRead,
                highlight: HighlightMode::Off,
                ..Default::default()
            },
            ClipboardCommand::Set(a) => DriveRequest {
                action: DriveAction::ClipboardWrite,
                text: Some(a.text),
                highlight: HighlightMode::Off,
                ..Default::default()
            },
        },
        DriveCommand::Screen => DriveRequest {
            action: DriveAction::GetScreenSize,
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::Cursor => DriveRequest {
            action: DriveAction::GetCursorPosition,
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::Menu(a) => {
            let path: serde_json::Value = serde_json::from_str(&a.path)
                .map_err(|e| format!("menu --path must be JSON array: {e}"))?;
            DriveRequest {
                action: DriveAction::InvokeMenu,
                pid: Some(a.pid),
                window_id: a.window_id,
                menu_path: Some(path),
                highlight: HighlightMode::Auto,
                ..Default::default()
            }
        }
        DriveCommand::AxTree => DriveRequest {
            action: DriveAction::GetAccessibilityTree,
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::Type(a) => {
            let highlight = HighlightMode::parse(&a.highlight).ok_or_else(|| {
                format!(
                    "invalid --highlight {:?} (use auto, desktop, clear, off)",
                    a.highlight
                )
            })?;
            let coord_space = CoordSpace::parse(&a.coord_space)
                .ok_or_else(|| format!("invalid --coord-space {:?}", a.coord_space))?;
            DriveRequest {
                action: DriveAction::Type,
                text: Some(a.text),
                x: a.x,
                y: a.y,
                pid: a.pid,
                window_id: a.window_id,
                delivery_mode: Some(a.delivery_mode),
                coord_space,
                element_token: a.element_token,
                element_index: a.element_index,
                snapshot_id: a.snapshot_id,
                highlight,
                status_label: a.status,
                agent_name: a.agent_name,
                ..Default::default()
            }
        }
        DriveCommand::Verify => DriveRequest {
            action: DriveAction::Verify,
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::WindowState(a) => DriveRequest {
            action: DriveAction::WindowState,
            pid: Some(a.pid),
            window_id: Some(a.window_id),
            include_screenshot: a.screenshot,
            max_elements: a.max_elements,
            max_depth: a.max_depth,
            query: a.query,
            highlight: HighlightMode::Auto,
            ..Default::default()
        },
        DriveCommand::Highlight(a) => {
            let mode = a.mode.to_ascii_lowercase();
            let highlight = match mode.as_str() {
                "clear" | "off" => HighlightMode::Clear,
                "desktop" => HighlightMode::Desktop,
                "window" | "auto" => HighlightMode::Auto,
                other => {
                    return Err(format!(
                        "invalid highlight --mode {:?} (use desktop, window, clear)",
                        other
                    ));
                }
            };
            DriveRequest {
                action: DriveAction::Highlight,
                x: a.x,
                y: a.y,
                width: a.width,
                height: a.height,
                window_id: a.window_id,
                highlight,
                status_label: a.status,
                agent_name: a.agent_name,
                ..Default::default()
            }
        }
        DriveCommand::SessionEnd => DriveRequest {
            action: DriveAction::SessionEnd,
            highlight: HighlightMode::Clear,
            ..Default::default()
        },
        DriveCommand::Front(a) => DriveRequest {
            action: DriveAction::BringToFront,
            pid: Some(a.pid),
            window_id: a.window_id,
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::SetValue(a) => DriveRequest {
            action: DriveAction::SetValue,
            text: Some(a.text),
            pid: a.pid,
            window_id: a.window_id,
            element_token: a.element_token,
            element_index: a.element_index,
            snapshot_id: a.snapshot_id,
            highlight: HighlightMode::Auto,
            ..Default::default()
        },
        DriveCommand::WindowFrame(a) => DriveRequest {
            action: DriveAction::SetWindowFrame,
            pid: Some(a.pid),
            window_id: Some(a.window_id),
            x: Some(a.x),
            y: Some(a.y),
            width: Some(a.width),
            height: Some(a.height),
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::Zoom(a) => DriveRequest {
            action: DriveAction::Zoom,
            window_id: Some(a.window_id),
            pid: a.pid,
            x1: Some(a.x1),
            y1: Some(a.y1),
            x2: Some(a.x2),
            y2: Some(a.y2),
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::VerifyState(a) => {
            let expect_json = match a.expect.as_ref() {
                Some(s) => Some(
                    serde_json::from_str(s)
                        .map_err(|e| format!("verify-state --expect JSON: {e}"))?,
                ),
                None => None,
            };
            DriveRequest {
                action: DriveAction::VerifyState,
                pid: Some(a.pid),
                window_id: Some(a.window_id),
                expect_json,
                highlight: HighlightMode::Off,
                ..Default::default()
            }
        }
    };
    let result = drive(&mgr, req);
    serde_json::to_value(result).map_err(|e| e.to_string())
}

fn click_like(action: DriveAction, a: ClickArgs) -> Result<DriveRequest, String> {
    let coord_space = CoordSpace::parse(&a.coord_space).ok_or_else(|| {
        format!(
            "invalid --coord-space {:?} (use png or points)",
            a.coord_space
        )
    })?;
    let highlight = HighlightMode::parse(&a.highlight).ok_or_else(|| {
        format!(
            "invalid --highlight {:?} (use auto, desktop, clear, off)",
            a.highlight
        )
    })?;
    let has_element =
        a.element_token.is_some() || (a.element_index.is_some() && a.snapshot_id.is_some());
    // Engine 0.17: double_click/right_click require pid. click may use scope=desktop without pid.
    let needs_pid = matches!(action, DriveAction::DoubleClick | DriveAction::RightClick);
    if needs_pid && a.pid.is_none() {
        return Err(
            "double-click/right-click require --pid (engine 0.17 has no desktop-scope path)".into(),
        );
    }
    let pid = if needs_pid || has_element || a.window_id.is_some() {
        a.pid
    } else {
        // Strip bare --pid on screen-absolute click so coords stay desktop-scope.
        None
    };
    Ok(DriveRequest {
        action,
        x: a.x,
        y: a.y,
        pid,
        window_id: a.window_id,
        delivery_mode: Some(a.delivery_mode),
        coord_space,
        session: a.session,
        element_token: a.element_token,
        element_index: a.element_index,
        snapshot_id: a.snapshot_id,
        highlight,
        status_label: a.status,
        agent_name: a.agent_name,
        ..Default::default()
    })
}
