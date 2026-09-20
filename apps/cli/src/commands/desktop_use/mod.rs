//! `atmos desktop-use` — Desktop Use status, control engine, capture, and drive.

mod args;
mod drive;

pub use args::DesktopUseCommand;

use crate::api_client::ApiClientArgs;
use crate::server_invoke::{self, InvokeError};
use args::*;
use desktop_use::{
    capture, load_prefs, permission_doctor, update_prefs, CaptureRequest, DesktopUseManager,
    EnsureOutcome, PermissionGrantTarget,
};
use serde_json::{json, Value};

fn unwrap_api(value: Value) -> Value {
    if value.get("success").and_then(|v| v.as_bool()) == Some(true) {
        value.get("data").cloned().unwrap_or(Value::Null)
    } else {
        value.get("data").cloned().unwrap_or(value)
    }
}

async fn runtime_get(api: &ApiClientArgs, path: &str) -> Option<Value> {
    match server_invoke::get_json(api, path).await {
        Ok(v) => Some(unwrap_api(v)),
        Err(InvokeError::Unreachable(_)) => None,
        Err(_) => None,
    }
}

async fn runtime_post(api: &ApiClientArgs, path: &str) -> Option<Value> {
    match server_invoke::request_json_ensured(api, reqwest::Method::POST, path, None).await {
        Ok(v) => Some(unwrap_api(v)),
        Err(InvokeError::Unreachable(_)) => None,
        Err(_) => None,
    }
}

pub async fn execute(api: ApiClientArgs, command: DesktopUseCommand) -> Result<Value, String> {
    match command {
        DesktopUseCommand::Status => {
            if let Some(v) = runtime_get(&api, "/api/desktop-use/status").await {
                return Ok(v);
            }
            status()
        }
        DesktopUseCommand::Doctor => {
            if let Some(v) = runtime_get(&api, "/api/desktop-use/doctor").await {
                return Ok(v);
            }
            doctor()
        }
        DesktopUseCommand::Driver { command } => match command {
            DriverCommand::Ensure(args) => {
                let q = if args.force {
                    "/api/desktop-use/driver/ensure?force=true"
                } else {
                    "/api/desktop-use/driver/ensure"
                };
                if let Some(v) = runtime_post(&api, q).await {
                    return Ok(v);
                }
                driver_ensure(args)
            }
            DriverCommand::Status => {
                if let Some(v) = runtime_get(&api, "/api/desktop-use/status").await {
                    return Ok(v.get("driver").cloned().unwrap_or(v));
                }
                driver_status()
            }
            DriverCommand::Stop => {
                if let Some(v) = runtime_post(&api, "/api/desktop-use/driver/stop").await {
                    return Ok(v);
                }
                driver_stop()
            }
            DriverCommand::Restart => {
                if let Some(v) = runtime_post(&api, "/api/desktop-use/driver/restart").await {
                    return Ok(v);
                }
                driver_restart()
            }
            DriverCommand::Check => {
                if let Some(v) = runtime_post(&api, "/api/desktop-use/driver/check").await {
                    return Ok(v);
                }
                driver_check()
            }
            DriverCommand::Uninstall => {
                if let Some(v) = runtime_post(&api, "/api/desktop-use/driver/uninstall").await {
                    return Ok(v);
                }
                driver_uninstall()
            }
            DriverCommand::GrantPermissions(args) => driver_grant(args),
        },
        DesktopUseCommand::Capture(args) => capture_cmd(args),
        DesktopUseCommand::Drive { command } => drive::drive_cmd(*command),
        DesktopUseCommand::Prefs { command } => match command {
            PrefsCommand::Get => {
                if let Some(v) = runtime_get(&api, "/api/desktop-use/prefs").await {
                    return Ok(json!({ "ok": true, "prefs": v }));
                }
                prefs_cmd(PrefsCommand::Get)
            }
            PrefsCommand::Set(a) => {
                if let Ok(payload) = prefs_payload_from_set(&a) {
                    if let Ok(v) = server_invoke::request_json_ensured(
                        &api,
                        reqwest::Method::PUT,
                        "/api/desktop-use/prefs",
                        Some(payload),
                    )
                    .await
                    {
                        return Ok(json!({ "ok": true, "prefs": unwrap_api(v), "action": "set" }));
                    }
                }
                prefs_cmd(PrefsCommand::Set(a))
            }
        },
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

fn driver_restart() -> Result<Value, String> {
    let mgr = DesktopUseManager::new();
    match mgr.restart_driver() {
        Ok(driver) => Ok(json!({ "ok": true, "action": "restarted", "status": driver })),
        Err(error) => Ok(json!({
            "ok": false,
            "action": "restart_failed",
            "error": error,
            "status": mgr.status().driver,
        })),
    }
}

fn driver_check() -> Result<Value, String> {
    let mgr = DesktopUseManager::new();
    let check = mgr.runtime_check();
    Ok(json!({
        "ok": true,
        "action": "check",
        "healthy": check.healthy,
        "check": check,
    }))
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
            "System Settings → Accessibility opened. Enable the toggle for {host_name}. If it is not listed, add the host app with + (path in host_app_path), then Refresh. Atmos Desktop shows a drag panel for the same path."
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

fn prefs_payload_from_set(a: &PrefsSetArgs) -> Result<Value, String> {
    let current = load_prefs();
    let border = match a.operation_border.as_deref() {
        None => current.operation_border_enabled,
        Some(s) => match s.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => true,
            "0" | "false" | "no" | "off" => false,
            other => {
                return Err(format!(
                    "invalid --operation-border {:?} (use true/false)",
                    other
                ));
            }
        },
    };
    Ok(json!({
        "operation_border_enabled": border,
        "highlight_idle_ms": a.highlight_idle_ms.unwrap_or(current.highlight_idle_ms),
    }))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_use_cli_routes_prefs_doctor_driver_through_runtime_http() {
        let src = include_str!("mod.rs");
        for path in [
            "/api/desktop-use/status",
            "/api/desktop-use/doctor",
            "/api/desktop-use/driver/ensure",
            "/api/desktop-use/driver/stop",
            "/api/desktop-use/driver/restart",
            "/api/desktop-use/driver/check",
            "/api/desktop-use/driver/uninstall",
            "/api/desktop-use/prefs",
        ] {
            assert!(src.contains(path), "missing Runtime path {path}");
        }
        assert!(
            src.contains("request_json_ensured"),
            "driver/prefs mutations must lazy-ensure via request_json_ensured"
        );
        assert!(
            src.contains("runtime_get"),
            "status/doctor must GET Runtime"
        );
        assert!(
            src.contains("runtime_post"),
            "driver commands must POST Runtime"
        );
    }

    #[test]
    fn unwrap_api_uses_server_data_envelope() {
        let v = json!({"success": true, "data": {"product": "Desktop Use"}});
        assert_eq!(
            unwrap_api(v).get("product").and_then(|p| p.as_str()),
            Some("Desktop Use")
        );
    }

    #[test]
    fn prefs_payload_from_set_drives_shipped_builder() {
        let payload = prefs_payload_from_set(&PrefsSetArgs {
            operation_border: Some("true".into()),
            highlight_idle_ms: Some(1234),
        })
        .expect("payload");
        assert_eq!(payload["operation_border_enabled"], true);
        assert_eq!(payload["highlight_idle_ms"], 1234);
    }
}
