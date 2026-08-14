//! External (system Chrome/Chromium) path via managed Desktop Use control engine (0.19.2+).

use serde_json::{json, Value};

use super::BrowserBackend;
use crate::errors::{
    fail, fail_with_recovery, map_engine_failure, BROWSER_INVALID_ARGS,
    BROWSER_PROFILE_GRANT_REQUIRED, BROWSER_UNSUPPORTED, recovery_for,
};
use crate::types::{
    action_name, BrowserAction, BrowserBackendKind, BrowserError, BrowserRequest, BrowserResult,
    DEFAULT_SNAPSHOT_FORMAT,
};
use desktop_use::host;
use desktop_use::manager::DesktopUseManager;

#[derive(Debug, Default)]
pub struct ExternalBackend;

fn session_id(req: &BrowserRequest) -> String {
    crate::binding::engine_session_id(req.binding_id.as_deref(), req.session.as_deref())
}

fn is_existing_profile(strategy: Option<&str>) -> bool {
    strategy
        .map(str::trim)
        .is_some_and(|s| s.contains("existing"))
}

/// Map a browser request to control-engine tool + args (0.19.2 contracts).
pub fn build_tool_call(req: &BrowserRequest) -> Result<(&'static str, Value), String> {
    let session = session_id(req);

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
            if let Some(tok) = req
                .approval_token
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                a["approval_token"] = json!(tok);
            }

            let strategy = req
                .profile_strategy
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty());

            match strategy {
                Some(s) if s.contains("existing") => {
                    if req.window_id.is_none() {
                        return Err("prepare with existing_profile requires --window-id".into());
                    }
                    a["strategy"] = json!({ "kind": "existing_profile" });
                }
                Some(s) if s.contains("isolated_named") || s == "named" => {
                    let name = req
                        .profile_name
                        .as_deref()
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .unwrap_or("atmos");
                    a["profile"] = json!({ "mode": "isolated_named", "name": name });
                    a["allow_launch"] = json!(true);
                }
                Some(s) if s.contains("isolated") || s == "new" => {
                    a["profile"] = json!({ "mode": "isolated_new" });
                    a["allow_launch"] = json!(true);
                }
                Some(unknown) => {
                    return Err(format!(
                        "unknown --strategy {unknown:?} (use isolated_new | isolated_named | existing_profile)"
                    ));
                }
                None => {
                    // Optimal default: driver-owned isolated profile (never mutates user Chrome).
                    a["profile"] = json!({ "mode": "isolated_new" });
                    a["allow_launch"] = json!(true);
                }
            }
            Ok(("browser_prepare", a))
        }
        BrowserAction::State => {
            // Mode 1 bind: pid + window_id → mints target_id/tab_ids
            // Mode 2 snapshot: target_id + tab_id → semantic_v2 / dom_refs
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
            if snapshot {
                let fmt = req
                    .snapshot_format
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .unwrap_or(DEFAULT_SNAPSHOT_FORMAT);
                if fmt == "embedded_dom_v1" {
                    return Err(
                        "snapshot format embedded_dom_v1 is only valid with --backend embedded"
                            .into(),
                    );
                }
                a["snapshot_format"] = json!(fmt);
                if req.include_screenshot {
                    a["include_screenshot"] = json!(true);
                }
                if let Some(c) = req
                    .continuation
                    .as_ref()
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                {
                    a["continuation"] = json!(c);
                }
                if let Some(q) = req
                    .query
                    .as_ref()
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                {
                    a["query"] = json!(q);
                }
                if let Some(s) = req
                    .scope_ref
                    .as_ref()
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                {
                    a["scope_ref"] = json!(s);
                }
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
            let has_ref = req
                .element_ref
                .as_ref()
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false);
            let has_xy = req.x.is_some() && req.y.is_some();
            if !has_ref && !has_xy {
                return Err("click requires --ref or both --x and --y (viewport CSS px)".into());
            }
            let mut a = json!({
                "session": session,
                "target_id": target,
                "tab_id": tab,
            });
            if has_ref {
                a["ref"] = json!(req.element_ref.as_ref().unwrap().trim());
            }
            if has_xy {
                a["x"] = json!(req.x.unwrap());
                a["y"] = json!(req.y.unwrap());
            }
            if let Some(route) = req
                .input_route
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                a["input_route"] = json!(route);
            }
            Ok(("browser_click", a))
        }
        BrowserAction::Type => {
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
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "type requires --ref".to_string())?;
            let text = req
                .text
                .as_ref()
                .ok_or_else(|| "type requires --text".to_string())?;
            let mut a = json!({
                "session": session,
                "target_id": target,
                "tab_id": tab,
                "ref": r,
                "text": text,
            });
            if let Some(mode) = req
                .type_mode
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                a["mode"] = json!(mode);
            }
            if req.replace {
                a["replace"] = json!(true);
            }
            Ok(("browser_type", a))
        }
        BrowserAction::Navigate => {
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
        BrowserAction::Pointer => {
            let target = req
                .target_id
                .as_ref()
                .ok_or_else(|| "pointer requires --target-id".to_string())?;
            let tab = req
                .tab_id
                .as_ref()
                .ok_or_else(|| "pointer requires --tab-id".to_string())?;
            let action = req
                .pointer_action
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    "pointer requires --action (hover|right_click|double_click|scroll|drag)"
                        .to_string()
                })?;
            let mut a = json!({
                "session": session,
                "target_id": target,
                "tab_id": tab,
                "action": action,
            });
            if let Some(r) = req
                .element_ref
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                a["ref"] = json!(r);
            }
            if let Some(x) = req.x {
                a["x"] = json!(x);
            }
            if let Some(y) = req.y {
                a["y"] = json!(y);
            }
            if let Some(dx) = req.delta_x {
                a["delta_x"] = json!(dx);
            }
            if let Some(dy) = req.delta_y {
                a["delta_y"] = json!(dy);
            }
            if let Some(x) = req.to_x {
                a["to_x"] = json!(x);
            }
            if let Some(y) = req.to_y {
                a["to_y"] = json!(y);
            }
            if let Some(r) = req
                .destination_ref
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                a["destination_ref"] = json!(r);
            }
            if let Some(route) = req
                .input_route
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                a["input_route"] = json!(route);
            }
            Ok(("browser_pointer", a))
        }
        BrowserAction::Dialog => {
            let target = req
                .target_id
                .as_ref()
                .ok_or_else(|| "dialog requires --target-id".to_string())?;
            let tab = req
                .tab_id
                .as_ref()
                .ok_or_else(|| "dialog requires --tab-id".to_string())?;
            let action = req
                .dialog_action
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "dialog requires --action (inspect|accept|dismiss)".to_string())?;
            let mut a = json!({
                "session": session,
                "target_id": target,
                "tab_id": tab,
                "action": action,
            });
            if let Some(id) = req
                .dialog_id
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                a["dialog_id"] = json!(id);
            }
            if let Some(t) = req.prompt_text.as_ref() {
                a["prompt_text"] = json!(t);
            }
            if let Some(m) = req
                .delivery_mode
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                a["delivery_mode"] = json!(m);
            }
            Ok(("browser_dialog", a))
        }
        BrowserAction::Download => {
            let target = req
                .target_id
                .as_ref()
                .ok_or_else(|| "download requires --target-id".to_string())?;
            let tab = req
                .tab_id
                .as_ref()
                .ok_or_else(|| "download requires --tab-id".to_string())?;
            let r = req
                .element_ref
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "download requires --ref".to_string())?;
            let dir = req
                .download_dir
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    "download requires --dir (approved destination directory)".to_string()
                })?;
            Ok((
                "browser_download",
                json!({
                    "session": session,
                    "target_id": target,
                    "tab_id": tab,
                    "ref": r,
                    "destination_root": dir,
                }),
            ))
        }
        BrowserAction::PressKey => Err(
            "press-key is only available with --backend embedded (CUA has no browser_press_key)"
                .into(),
        ),
        BrowserAction::Upload => {
            let target = req
                .target_id
                .as_ref()
                .ok_or_else(|| "upload requires --target-id".to_string())?;
            let tab = req
                .tab_id
                .as_ref()
                .ok_or_else(|| "upload requires --tab-id".to_string())?;
            let r = req
                .element_ref
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "upload requires --ref".to_string())?;
            if req.files.is_empty() {
                return Err("upload requires --file (one or more local paths)".into());
            }
            Ok((
                "browser_set_input_files",
                json!({
                    "session": session,
                    "target_id": target,
                    "tab_id": tab,
                    "ref": r,
                    "paths": req.files,
                }),
            ))
        }
        BrowserAction::End => Ok((
            "end_session",
            json!({
                "session": session,
            }),
        )),
    }
}

fn enrich_prepare_result(v: &mut Value, requested_pid: Option<i32>) {
    let prepared_pid = v
        .get("pid")
        .and_then(Value::as_i64)
        .or_else(|| v.pointer("/process/pid").and_then(Value::as_i64))
        .or_else(|| v.pointer("/browser/pid").and_then(Value::as_i64));
    let prepared_window = v
        .get("window_id")
        .and_then(Value::as_i64)
        .or_else(|| v.pointer("/window/id").and_then(Value::as_i64));
    if let Some(pid) = prepared_pid {
        v["prepared_pid"] = json!(pid);
        if requested_pid.is_some_and(|req| i64::from(req) != pid) {
            v["rebind_required"] = json!(true);
        }
    }
    if let Some(wid) = prepared_window {
        v["prepared_window_id"] = json!(wid);
    }
}

impl BrowserBackend for ExternalBackend {
    fn execute(&self, req: BrowserRequest) -> BrowserResult {
        let action = action_name(req.action);
        let backend = BrowserBackendKind::External.as_str();

        if is_existing_profile(req.profile_strategy.as_deref()) {
            return fail_with_recovery(
                action,
                backend,
                BROWSER_PROFILE_GRANT_REQUIRED,
                "`existing_profile` is not granted on this Desktop Use host. The daemon is started without `--grant existing-profile`.",
                recovery_for(BROWSER_PROFILE_GRANT_REQUIRED),
            );
        }

        let (tool, args) = match build_tool_call(&req) {
            Ok(v) => v,
            Err(e) => {
                let code = if e.contains("only available") {
                    BROWSER_UNSUPPORTED
                } else {
                    BROWSER_INVALID_ARGS
                };
                return fail_with_recovery(
                    action,
                    backend,
                    code,
                    BrowserError::InvalidArgs(e).message(),
                    recovery_for(code),
                );
            }
        };

        let mgr = DesktopUseManager::new();
        let engine = match mgr.require_engine() {
            Ok(p) => p,
            Err(e) => {
                return fail(action, backend, "control_engine_not_installed", e);
            }
        };
        let socket = mgr.socket_path();
        let host_app = mgr.host_app_path();
        if let Err(e) = host::ensure_daemon(&engine, &socket, host_app.as_deref()) {
            return fail(action, backend, "control_engine_failed", e);
        }

        let session = session_id(&req);
        if req.action != BrowserAction::End {
            let _ = host::call_tool(
                &engine,
                &socket,
                "start_session",
                &json!({ "session": session }),
            );
        }

        // Desktop Use-class chrome only when we have a native window to bound.
        // APP-052: do not couple page actions to a guessed operation border.
        if req.window_id.is_some()
            && crate::chrome::wants_action_chrome(req.action, req.element_ref.as_deref())
        {
            let bounds = req.window_id.and_then(crate::chrome::resolve_window_bounds);
            if let Some(target) = crate::chrome::chrome_target_for_request(
                req.action,
                Some(session.clone()),
                req.window_id,
                req.pid,
                bounds,
                None,
            ) {
                let _ = crate::chrome::show_browser_action_chrome(&target);
            }
        }

        match host::call_tool(&engine, &socket, tool, &args) {
            Ok(mut v) => {
                if let Some(fail_msg) = desktop_use::engine_protocol::engine_payload_is_failure(&v) {
                    return map_engine_failure(action, backend, &v, &fail_msg);
                }
                if req.action == BrowserAction::Prepare {
                    enrich_prepare_result(&mut v, req.pid);
                }
                let mut result = BrowserResult {
                    ok: true,
                    action: action.into(),
                    backend: backend.into(),
                    result: Some(v),
                    ..BrowserResult::default()
                };
                if req.action == BrowserAction::Prepare
                    && result
                        .result
                        .as_ref()
                        .and_then(|v| v.get("rebind_required"))
                        .and_then(Value::as_bool)
                        == Some(true)
                {
                    result.recovery = Some(
                        "`isolated_new` launched a new browser process. Bind with `prepared_pid` / `prepared_window_id` from this response — do not reuse the original --pid."
                            .into(),
                    );
                }
                result
            }
            Err(e) => map_engine_failure(
                action,
                backend,
                &json!({ "error": e }),
                "browser engine failed",
            ),
        }
    }
}
