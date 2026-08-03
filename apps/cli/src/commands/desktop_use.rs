//! `atmos desktop-use` — Desktop Use status, control engine, capture, and drive.

use clap::{Args, Subcommand};
use desktop_use::{
    capture, drive, permission_doctor, CaptureRequest, DesktopUseManager, DriveAction,
    DriveRequest, EnsureOutcome,
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
            DriverCommand::GrantPermissions => driver_grant(),
        },
        DesktopUseCommand::Capture(args) => capture_cmd(args),
        DesktopUseCommand::Drive { command } => drive_cmd(command),
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
    GrantPermissions,
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
    /// Click at screen coordinates (requires control engine).
    Click(ClickArgs),
    /// Type text (requires control engine).
    Type(TypeArgs),
    /// Verify engine is live (list windows).
    Verify,
}

#[derive(Debug, Args)]
pub struct ScreenshotArgs {
    #[arg(long)]
    pub out: Option<String>,
}

#[derive(Debug, Args)]
pub struct ClickArgs {
    #[arg(long)]
    pub x: i32,
    #[arg(long)]
    pub y: i32,
    #[arg(long)]
    pub pid: Option<i32>,
    #[arg(long)]
    pub window_id: Option<i64>,
}

#[derive(Debug, Args)]
pub struct TypeArgs {
    #[arg(long)]
    pub text: String,
    #[arg(long)]
    pub pid: Option<i32>,
    #[arg(long)]
    pub window_id: Option<i64>,
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

fn driver_grant() -> Result<Value, String> {
    let mgr = DesktopUseManager::new();
    mgr.open_permission_grant()?;
    Ok(json!({
        "ok": true,
        "action": "grant_permissions",
        "host": "Atmos Desktop Use",
        "hint": "Complete Accessibility and Screen Recording grants in System Settings for Atmos Desktop Use.",
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

fn drive_cmd(command: DriveCommand) -> Result<Value, String> {
    let mgr = DesktopUseManager::new();
    let req = match command {
        DriveCommand::Screenshot(a) => DriveRequest {
            action: DriveAction::Screenshot,
            out_path: a.out.map(Into::into),
            ..Default::default()
        },
        DriveCommand::Click(a) => DriveRequest {
            action: DriveAction::Click,
            x: Some(a.x),
            y: Some(a.y),
            pid: a.pid,
            window_id: a.window_id,
            ..Default::default()
        },
        DriveCommand::Type(a) => DriveRequest {
            action: DriveAction::Type,
            text: Some(a.text),
            pid: a.pid,
            window_id: a.window_id,
            ..Default::default()
        },
        DriveCommand::Verify => DriveRequest {
            action: DriveAction::Verify,
            ..Default::default()
        },
    };
    let result = drive(&mgr, req);
    serde_json::to_value(result).map_err(|e| e.to_string())
}
