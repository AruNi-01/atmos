//! `atmos desktop-use` — Desktop Use status, control engine, capture, and drive.

mod args;
mod drive;

pub use args::DesktopUseCommand;

use args::*;
use desktop_use::{
    capture, load_prefs, permission_doctor, update_prefs, CaptureRequest, DesktopUseManager,
    EnsureOutcome, PermissionGrantTarget,
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
        DesktopUseCommand::Drive { command } => drive::drive_cmd(*command),
        DesktopUseCommand::Prefs { command } => prefs_cmd(command),
    }
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
