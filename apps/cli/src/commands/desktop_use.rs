//! `atmos desktop-use` — Desktop Use status, control engine, capture, and drive.

use clap::{Args, Subcommand};
use desktop_use::{
    capture, drive, CaptureRequest, DesktopUseManager, DriveAction, DriveRequest, EnsureOutcome,
};
use serde_json::{json, Value};

pub async fn execute(command: DesktopUseCommand) -> Result<Value, String> {
    match command {
        DesktopUseCommand::Status => status(),
        DesktopUseCommand::Driver { command } => match command {
            DriverCommand::Ensure(args) => driver_ensure(args),
            DriverCommand::Status => driver_status(),
            DriverCommand::Stop => driver_stop(),
            DriverCommand::Uninstall => driver_uninstall(),
        },
        DesktopUseCommand::Capture(args) => capture_cmd(args),
        DesktopUseCommand::Drive { command } => drive_cmd(command),
    }
}

#[derive(Debug, Subcommand)]
pub enum DesktopUseCommand {
    /// Show Desktop Use capture + control-engine status.
    Status,
    /// Manage the optional desktop control engine.
    Driver {
        #[command(subcommand)]
        command: DriverCommand,
    },
    /// Capture the frontmost window (screenshot + identity).
    Capture(CaptureArgs),
    /// Drive desktop actions (screenshot / click / type).
    Drive {
        #[command(subcommand)]
        command: DriveCommand,
    },
}

#[derive(Debug, Subcommand)]
pub enum DriverCommand {
    /// Install or refresh the desktop control engine.
    Ensure(EnsureArgs),
    /// Show control-engine status only.
    Status,
    /// Mark the control engine stopped (does not delete the binary).
    Stop,
    /// Remove the installed control engine binary.
    Uninstall,
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
}

#[derive(Debug, Args)]
pub struct TypeArgs {
    #[arg(long)]
    pub text: String,
}

fn status() -> Result<Value, String> {
    let mgr = DesktopUseManager::new();
    serde_json::to_value(mgr.status()).map_err(|e| e.to_string())
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
        })),
        EnsureOutcome::Installed { path } => Ok(json!({
            "ok": true,
            "action": "installed",
            "path": path,
            "status": status.driver,
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
            ..Default::default()
        },
        DriveCommand::Type(a) => DriveRequest {
            action: DriveAction::Type,
            text: Some(a.text),
            ..Default::default()
        },
    };
    let result = drive(&mgr, req);
    serde_json::to_value(result).map_err(|e| e.to_string())
}
