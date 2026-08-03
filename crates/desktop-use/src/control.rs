//! Desktop control (drive) actions via optional Atmos-managed control engine.

use std::path::Path;
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::capture::{capture, CaptureRequest, CaptureResult};
use crate::manager::DesktopUseManager;
use crate::strings::{self, scrub_vendor, ERR_ENGINE_NOT_INSTALLED};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DriveAction {
    #[default]
    Screenshot,
    Click,
    Type,
}

#[derive(Debug, Clone, Default)]
pub struct DriveRequest {
    pub action: DriveAction,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub text: Option<String>,
    pub out_path: Option<std::path::PathBuf>,
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

/// Execute a drive action. Screenshot may use Capture without the control engine.
pub fn drive(manager: &DesktopUseManager, req: DriveRequest) -> DriveResult {
    let action_name = match req.action {
        DriveAction::Screenshot => "screenshot",
        DriveAction::Click => "click",
        DriveAction::Type => "type",
    };

    match req.action {
        DriveAction::Screenshot => {
            let cap = capture(CaptureRequest {
                out_path: req.out_path.clone(),
                include_base64: req.out_path.is_none(),
            });
            DriveResult {
                ok: cap.ok,
                action: action_name.into(),
                detail: None,
                error: cap.error.clone(),
                error_code: if cap.ok {
                    None
                } else {
                    Some("capture_failed".into())
                },
                capture: Some(cap),
            }
        }
        DriveAction::Click | DriveAction::Type => match manager.require_engine() {
            Err(msg) => DriveResult {
                ok: false,
                action: action_name.into(),
                detail: None,
                capture: None,
                error: Some(msg),
                error_code: Some(DriveError::EngineNotInstalled.code().into()),
            },
            Ok(engine) => run_engine(&engine, &req, action_name),
        },
    }
}

fn run_engine(engine: &Path, req: &DriveRequest, action_name: &str) -> DriveResult {
    let mut cmd = Command::new(engine);
    cmd.arg(action_name);
    match req.action {
        DriveAction::Click => {
            let (Some(x), Some(y)) = (req.x, req.y) else {
                return DriveResult {
                    ok: false,
                    action: action_name.into(),
                    detail: None,
                    capture: None,
                    error: Some(
                        DriveError::InvalidArgs("click requires --x and --y".into()).message(),
                    ),
                    error_code: Some("invalid_args".into()),
                };
            };
            cmd.arg("--x").arg(x.to_string());
            cmd.arg("--y").arg(y.to_string());
        }
        DriveAction::Type => {
            let Some(text) = req.text.as_ref() else {
                return DriveResult {
                    ok: false,
                    action: action_name.into(),
                    detail: None,
                    capture: None,
                    error: Some(DriveError::InvalidArgs("type requires --text".into()).message()),
                    error_code: Some("invalid_args".into()),
                };
            };
            cmd.arg("--text").arg(text);
        }
        DriveAction::Screenshot => {}
    }

    match cmd.output() {
        Ok(out) if out.status.success() => DriveResult {
            ok: true,
            action: action_name.into(),
            detail: Some(String::from_utf8_lossy(&out.stdout).trim().to_string()),
            capture: None,
            error: None,
            error_code: None,
        },
        Ok(out) => {
            let err = scrub_vendor(&format!(
                "{}: {}",
                strings::ERR_ENGINE_FAILED,
                String::from_utf8_lossy(&out.stderr)
            ));
            DriveResult {
                ok: false,
                action: action_name.into(),
                detail: None,
                capture: None,
                error: Some(err),
                error_code: Some("control_engine_failed".into()),
            }
        }
        Err(e) => DriveResult {
            ok: false,
            action: action_name.into(),
            detail: None,
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
