//! CUA external Chromium path via managed desktop-use engine.

use serde_json::{json, Value};

use super::BrowserBackend;
use crate::types::{BrowserAction, BrowserError, BrowserRequest, BrowserResult};
use desktop_use::host;
use desktop_use::manager::DesktopUseManager;

#[derive(Debug, Default)]
pub struct CuaExternalBackend;

pub fn build_tool_call(req: &BrowserRequest) -> Result<(&'static str, Value), String> {
    let session = req
        .session
        .clone()
        .unwrap_or_else(|| "atmos-browser-use".into());

    match req.action {
        BrowserAction::Prepare => {
            // Engine 0.17: pid required. strategy.kind=existing_profile also requires window_id.
            // Do NOT default existing_profile without window_id (engine refuses / consent needs anchor).
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
                Some(_) => {
                    // Unknown strategy string: only attach window_id when present; omit strategy.
                }
                None => {
                    // Detect-only prepare (no strategy) when window_id absent.
                    // With window_id, still omit strategy unless caller asked — avoids
                    // forcing existing_profile without explicit consent intent.
                }
            }
            Ok(("browser_prepare", a))
        }
        BrowserAction::State => {
            // Mode 1 bind: pid + window_id → mints target_id/tab_ids
            // Mode 2 snapshot: target_id + tab_id → DOM refs
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
            // Engine 0.17 required: target_id, tab_id (+ ref or x/y).
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
            // Engine 0.17 required: target_id, tab_id, ref, text.
            let target = req
                .target_id
                .as_ref()
                .ok_or_else(|| "type requires --target-id (from browser-use state)".to_string())?;
            let tab = req
                .tab_id
                .as_ref()
                .ok_or_else(|| "type requires --tab-id".to_string())?;
            let r = req
                .element_ref
                .as_ref()
                .ok_or_else(|| "type requires --ref".to_string())?;
            let text = req
                .text
                .as_ref()
                .ok_or_else(|| "type requires --text".to_string())?;
            Ok((
                "browser_type",
                json!({
                    "session": session,
                    "target_id": target,
                    "tab_id": tab,
                    "ref": r,
                    "text": text,
                }),
            ))
        }
        BrowserAction::Navigate => {
            // Engine 0.17 required: target_id, tab_id, url.
            let target = req.target_id.as_ref().ok_or_else(|| {
                "navigate requires --target-id (from browser-use state)".to_string()
            })?;
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
        let backend = "cua";

        let (tool, args) = match build_tool_call(&req) {
            Ok(v) => v,
            Err(e) => {
                return BrowserResult {
                    ok: false,
                    action: action.into(),
                    backend: backend.into(),
                    result: None,
                    error: Some(BrowserError::InvalidArgs(e).message()),
                    error_code: Some(BrowserError::InvalidArgs(String::new()).code().into()),
                };
            }
        };

        let mgr = DesktopUseManager::new();
        let engine = match mgr.require_engine() {
            Ok(p) => p,
            Err(e) => {
                return BrowserResult {
                    ok: false,
                    action: action.into(),
                    backend: backend.into(),
                    result: None,
                    error: Some(e),
                    error_code: Some("control_engine_not_installed".into()),
                };
            }
        };
        let socket = mgr.socket_path();
        let host_app = mgr.host_app_path();
        if let Err(e) = host::ensure_daemon(&engine, &socket, host_app.as_deref()) {
            return BrowserResult {
                ok: false,
                action: action.into(),
                backend: backend.into(),
                result: None,
                error: Some(e),
                error_code: Some("control_engine_failed".into()),
            };
        }

        // Desktop Use-class chrome (session cursor + operation border) for spatial
        // actions. Best-effort; does not replace browser_click / browser_type.
        if crate::chrome::wants_action_chrome(req.action, req.element_ref.as_deref()) {
            let bounds = req.window_id.and_then(crate::chrome::resolve_window_bounds);
            if let Some(target) = crate::chrome::chrome_target_for_request(
                req.action,
                req.session
                    .clone()
                    .or_else(|| Some(crate::chrome::DEFAULT_BROWSER_USE_SESSION.into())),
                req.window_id,
                req.pid,
                bounds,
                None,
            ) {
                let _ = crate::chrome::show_browser_action_chrome(&target);
            }
        }

        match host::call_tool(&engine, &socket, tool, &args) {
            Ok(v) => {
                if let Some(fail) = desktop_use::engine_protocol::engine_payload_is_failure(&v) {
                    return BrowserResult {
                        ok: false,
                        action: action.into(),
                        backend: backend.into(),
                        result: Some(v),
                        error: Some(BrowserError::Engine(fail).message()),
                        error_code: Some(BrowserError::Engine(String::new()).code().into()),
                    };
                }
                BrowserResult {
                    ok: true,
                    action: action.into(),
                    backend: backend.into(),
                    result: Some(v),
                    error: None,
                    error_code: None,
                }
            }
            Err(e) => BrowserResult {
                ok: false,
                action: action.into(),
                backend: backend.into(),
                result: None,
                error: Some(BrowserError::Engine(e).message()),
                error_code: Some(BrowserError::Engine(String::new()).code().into()),
            },
        }
    }
}
