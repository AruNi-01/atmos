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
}

#[derive(Debug, Clone, Default)]
pub struct DriveRequest {
    pub action: DriveAction,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub text: Option<String>,
    pub out_path: Option<std::path::PathBuf>,
    pub pid: Option<i32>,
    pub window_id: Option<i64>,
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
pub fn drive(manager: &DesktopUseManager, req: DriveRequest) -> DriveResult {
    let action_name = match req.action {
        DriveAction::Screenshot => "screenshot",
        DriveAction::Click => "click",
        DriveAction::Type => "type",
        DriveAction::Verify => "verify",
    };

    match req.action {
        DriveAction::Screenshot => {
            if manager.require_engine().is_ok() {
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
                error: cap.error.clone(),
                error_code: if cap.ok {
                    None
                } else {
                    Some("capture_failed".into())
                },
                capture: Some(cap),
            }
        }
        DriveAction::Click | DriveAction::Type | DriveAction::Verify => {
            match manager.require_engine() {
                Err(msg) => DriveResult {
                    ok: false,
                    action: action_name.into(),
                    detail: None,
                    capture: None,
                    result: None,
                    error: Some(msg),
                    error_code: Some(DriveError::EngineNotInstalled.code().into()),
                },
                Ok(engine) => run_engine(manager, &engine, &req, action_name),
            }
        }
    }
}

fn screenshot_via_engine(
    manager: &DesktopUseManager,
    req: &DriveRequest,
    action_name: &str,
) -> DriveResult {
    let Ok(engine) = manager.require_engine() else {
        return DriveResult {
            ok: false,
            action: action_name.into(),
            detail: None,
            capture: None,
            result: None,
            error: Some(ERR_ENGINE_NOT_INSTALLED.into()),
            error_code: Some("control_engine_not_installed".into()),
        };
    };
    let socket = manager.socket_path();
    let host_app = manager.host_app_path();
    if let Err(e) = host::ensure_daemon(&engine, &socket, host_app.as_deref()) {
        return DriveResult {
            ok: false,
            action: action_name.into(),
            detail: None,
            capture: None,
            result: None,
            error: Some(e),
            error_code: Some("control_engine_failed".into()),
        };
    }
    match host::call_tool(&engine, &socket, "get_desktop_state", &json!({})) {
        Ok(v) => {
            // Optionally write PNG if base64 present and out_path set.
            if let (Some(out), Some(b64)) = (
                req.out_path.as_ref(),
                v.get("screenshot_base64")
                    .or_else(|| v.get("png_base64"))
                    .and_then(|x| x.as_str()),
            ) {
                if let Ok(bytes) = base64_decode(b64) {
                    let _ = std::fs::write(out, bytes);
                }
            }
            DriveResult {
                ok: true,
                action: action_name.into(),
                detail: Some("via host engine".into()),
                result: Some(v),
                capture: None,
                error: None,
                error_code: None,
            }
        }
        Err(e) => DriveResult {
            ok: false,
            action: action_name.into(),
            detail: None,
            result: None,
            capture: None,
            error: Some(scrub_vendor(&format!(
                "{}: {e}",
                strings::ERR_ENGINE_FAILED
            ))),
            error_code: Some("control_engine_failed".into()),
        },
    }
}

fn base64_decode(s: &str) -> Result<Vec<u8>, ()> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    STANDARD.decode(s.trim()).map_err(|_| ())
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
        return DriveResult {
            ok: false,
            action: action_name.into(),
            detail: None,
            capture: None,
            result: None,
            error: Some(e),
            error_code: Some("control_engine_failed".into()),
        };
    }

    let (tool, args) = match req.action {
        DriveAction::Click => {
            let (Some(x), Some(y)) = (req.x, req.y) else {
                return DriveResult {
                    ok: false,
                    action: action_name.into(),
                    detail: None,
                    capture: None,
                    result: None,
                    error: Some(
                        DriveError::InvalidArgs("click requires --x and --y".into()).message(),
                    ),
                    error_code: Some("invalid_args".into()),
                };
            };
            // Desktop-scope pixel click for verification without window binding.
            let mut args = json!({
                "x": x,
                "y": y,
                "scope": "desktop",
            });
            if let Some(pid) = req.pid {
                args["pid"] = json!(pid);
            }
            if let Some(wid) = req.window_id {
                args["window_id"] = json!(wid);
            }
            ("click", args)
        }
        DriveAction::Type => {
            let Some(text) = req.text.as_ref() else {
                return DriveResult {
                    ok: false,
                    action: action_name.into(),
                    detail: None,
                    capture: None,
                    result: None,
                    error: Some(DriveError::InvalidArgs("type requires --text".into()).message()),
                    error_code: Some("invalid_args".into()),
                };
            };
            let mut args = json!({ "text": text });
            if let Some(pid) = req.pid {
                args["pid"] = json!(pid);
            }
            if let Some(wid) = req.window_id {
                args["window_id"] = json!(wid);
            }
            ("type_text", args)
        }
        DriveAction::Verify => ("list_windows", json!({})),
        DriveAction::Screenshot => unreachable!(),
    };

    match host::call_tool(engine, &socket, tool, &args) {
        Ok(v) => DriveResult {
            ok: true,
            action: action_name.into(),
            detail: Some(v.to_string()),
            result: Some(v),
            capture: None,
            error: None,
            error_code: None,
        },
        Err(e) => DriveResult {
            ok: false,
            action: action_name.into(),
            detail: None,
            result: None,
            capture: None,
            error: Some(scrub_vendor(&format!(
                "{}: {e}",
                strings::ERR_ENGINE_FAILED
            ))),
            error_code: Some("control_engine_failed".into()),
        },
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
}
