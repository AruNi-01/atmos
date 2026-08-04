//! CUA external Chromium path via managed control engine tools.

use serde_json::{json, Value};

use super::BrowserBackend;
use crate::engine_client;
use crate::types::{BrowserAction, BrowserError, BrowserRequest, BrowserResult};

#[derive(Debug, Default)]
pub struct CuaExternalBackend;

pub fn build_tool_call(req: &BrowserRequest) -> Result<(&'static str, Value), String> {
    let session = req
        .session
        .clone()
        .unwrap_or_else(|| "atmos-browser-use".into());

    match req.action {
        BrowserAction::Prepare => {
            let pid = req
                .pid
                .ok_or_else(|| "prepare requires --pid (browser process)".to_string())?;
            let mut a = json!({
                "pid": pid,
                "session": session,
            });
            if let Some(wid) = req.window_id {
                a["window_id"] = json!(wid);
            }
            let strategy = req
                .profile_strategy
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty());
            match strategy {
                Some(s) if s.contains("existing") => {
                    if req.window_id.is_none() {
                        return Err(
                            "prepare with existing_profile requires --window-id (engine 0.17)"
                                .into(),
                        );
                    }
                    a["strategy"] = json!({ "kind": "existing_profile" });
                }
                Some(s) if s.contains("isolated_named") => {
                    a["profile"] = json!({ "mode": "isolated_named", "name": "atmos" });
                    a["allow_launch"] = json!(true);
                }
                Some(s) if s.contains("isolated") => {
                    a["profile"] = json!({ "mode": "isolated_new" });
                    a["allow_launch"] = json!(true);
                }
                _ => {}
            }
            Ok(("browser_prepare", a))
        }
        BrowserAction::State => {
            let mut a = json!({ "session": session });
            if let Some(pid) = req.pid {
                a["pid"] = json!(pid);
            }
            if let Some(wid) = req.window_id {
                a["window_id"] = json!(wid);
            }
            if let Some(t) = req.target_id.as_ref() {
                a["target_id"] = json!(t);
            }
            if let Some(t) = req.tab_id.as_ref() {
                a["tab_id"] = json!(t);
            }
            let bind = req.pid.is_some() && req.window_id.is_some();
            let snapshot = req.target_id.is_some() && req.tab_id.is_some();
            if !bind && !snapshot {
                return Err(
                    "state requires bind (--pid + --window-id) or snapshot (--target-id + --tab-id)"
                        .into(),
                );
            }
            Ok(("get_browser_state", a))
        }
        BrowserAction::Click => {
            let target = req
                .target_id
                .as_ref()
                .ok_or_else(|| "click requires --target-id (from browser-use state)".to_string())?;
            let tab = req
                .tab_id
                .as_ref()
                .ok_or_else(|| "click requires --tab-id".to_string())?;
            let r = req
                .element_ref
                .as_ref()
                .ok_or_else(|| "click requires --ref".to_string())?;
            Ok((
                "browser_click",
                json!({
                    "session": session,
                    "target_id": target,
                    "tab_id": tab,
                    "ref": r,
                }),
            ))
        }
        BrowserAction::Type => {
            let target = req
                .target_id
                .as_ref()
                .ok_or_else(|| "type requires --target-id".to_string())?;
            let tab = req
                .tab_id
                .as_ref()
                .ok_or_else(|| "type requires --tab-id".to_string())?;
            let text = req
                .text
                .as_ref()
                .ok_or_else(|| "type requires --text".to_string())?;
            let r = req
                .element_ref
                .as_ref()
                .ok_or_else(|| "type requires --ref (CUA engine 0.17)".to_string())?;
            Ok((
                "browser_type",
                json!({
                    "session": session,
                    "target_id": target,
                    "tab_id": tab,
                    "text": text,
                    "ref": r,
                }),
            ))
        }
        BrowserAction::Navigate => {
            let target = req
                .target_id
                .as_ref()
                .ok_or_else(|| "navigate requires --target-id".to_string())?;
            let tab = req
                .tab_id
                .as_ref()
                .ok_or_else(|| "navigate requires --tab-id".to_string())?;
            let url = req
                .url
                .as_ref()
                .ok_or_else(|| "navigate requires --url".to_string())?;
            Ok((
                "browser_navigate",
                json!({
                    "session": session,
                    "target_id": target,
                    "tab_id": tab,
                    "url": url,
                }),
            ))
        }
    }
}

impl BrowserBackend for CuaExternalBackend {
    fn execute(&self, req: BrowserRequest) -> BrowserResult {
        let action = match req.action {
            BrowserAction::Prepare => "prepare",
            BrowserAction::State => "state",
            BrowserAction::Click => "click",
            BrowserAction::Type => "type",
            BrowserAction::Navigate => "navigate",
        };
        let (tool, args) = match build_tool_call(&req) {
            Ok(v) => v,
            Err(e) => {
                let err = BrowserError::InvalidArgs(e);
                return BrowserResult {
                    ok: false,
                    action: action.into(),
                    backend: "cua".into(),
                    result: None,
                    error: Some(err.message()),
                    error_code: Some(err.code().into()),
                };
            }
        };
        match engine_client::call_tool(tool, &args) {
            Ok(v) => {
                // Soft-fail engine refusals
                if let Some(status) = v.get("status").and_then(|s| s.as_str()) {
                    let s = status.to_ascii_lowercase();
                    if s == "refused" || s == "error" || s == "failed" {
                        return BrowserResult {
                            ok: false,
                            action: action.into(),
                            backend: "cua".into(),
                            result: Some(v),
                            error: Some("browser engine refused or failed".into()),
                            error_code: Some("browser_engine_failed".into()),
                        };
                    }
                }
                if v.get("refusal").is_some() {
                    return BrowserResult {
                        ok: false,
                        action: action.into(),
                        backend: "cua".into(),
                        result: Some(v),
                        error: Some("browser engine refused".into()),
                        error_code: Some("browser_engine_failed".into()),
                    };
                }
                BrowserResult {
                    ok: true,
                    action: action.into(),
                    backend: "cua".into(),
                    result: Some(v),
                    error: None,
                    error_code: None,
                }
            }
            Err(e) => BrowserResult {
                ok: false,
                action: action.into(),
                backend: "cua".into(),
                result: None,
                error: Some(e),
                error_code: Some("browser_engine_failed".into()),
            },
        }
    }
}
