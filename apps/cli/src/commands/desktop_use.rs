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
        DesktopUseCommand::Drive { command } => drive_cmd(command),
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
        command: DriveCommand,
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
    /// Under-arrow status text (what the agent is doing). Overrides auto copy.
    #[arg(long)]
    pub status: Option<String>,
    /// Agent display name for fallback "{name} Operating". Also reads ATMOS_DESKTOP_USE_AGENT_NAME.
    #[arg(long)]
    pub agent_name: Option<String>,
}

#[derive(Debug, Args)]
pub struct TypeArgs {
    #[arg(long)]
    pub text: String,
    #[arg(long)]
    pub pid: Option<i32>,
    #[arg(long)]
    pub window_id: Option<i64>,
    /// background (default) or foreground.
    #[arg(long, default_value = "background")]
    pub delivery_mode: String,
    #[arg(long)]
    pub element_token: Option<String>,
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
    /// Include window screenshot (heavier; default false).
    #[arg(long, default_value_t = false)]
    pub screenshot: bool,
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
    mgr.open_permission_grant_target(target)?;
    let target_label = match target {
        PermissionGrantTarget::All => "all",
        PermissionGrantTarget::Accessibility => "accessibility",
        PermissionGrantTarget::ScreenRecording => "screen_recording",
    };
    Ok(json!({
        "ok": true,
        "action": "grant_permissions",
        "target": target_label,
        "host": "Atmos Desktop Use",
        "applied": true,
        "opened_settings": true,
        "hint": "System Settings → Privacy & Security opened for Atmos Desktop Use. Enable the toggle there, then return and Refresh. No extra system alert is shown — Settings is the grant surface.",
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
        DriveCommand::Click(a) => {
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
            // Screen-absolute pixel path: ignore bare --pid. Keep pid for element /
            // window-local addressing.
            let pid = if has_element || a.window_id.is_some() {
                a.pid
            } else {
                None
            };
            DriveRequest {
                action: DriveAction::Click,
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
            }
        }
        DriveCommand::Type(a) => {
            let highlight = HighlightMode::parse(&a.highlight).unwrap_or(HighlightMode::Auto);
            DriveRequest {
                action: DriveAction::Type,
                text: Some(a.text),
                pid: a.pid,
                window_id: a.window_id,
                delivery_mode: Some(a.delivery_mode),
                element_token: a.element_token,
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
    };
    let result = drive(&mgr, req);
    serde_json::to_value(result).map_err(|e| e.to_string())
}
