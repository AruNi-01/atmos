//! Pure engine tool + JSON arg builders for drive actions (unit-tested without a daemon).

use serde_json::{json, Value};

use crate::control::{DriveAction, DriveRequest};

/// Map a drive request to an engine tool name and arguments.
///
/// Screenshot / highlight / session-end are handled outside this builder
/// (capture path, overlay helper, end_session).
pub fn build_engine_call(req: &DriveRequest) -> Result<(&'static str, Value), String> {
    let delivery = req.delivery_mode.as_deref().unwrap_or("background");

    match req.action {
        DriveAction::Screenshot | DriveAction::Highlight | DriveAction::SessionEnd => Err(format!(
            "action {:?} is not an engine tool call",
            req.action
        )),
        DriveAction::Verify => Ok(("list_windows", json!({}))),
        DriveAction::ListApps => Ok(("list_apps", json!({}))),
        DriveAction::GetScreenSize => Ok(("get_screen_size", json!({}))),
        DriveAction::GetCursorPosition => Ok(("get_cursor_position", json!({}))),
        DriveAction::GetAccessibilityTree => Ok(("get_accessibility_tree", json!({}))),
        DriveAction::ClipboardRead => {
            let mut a = json!({ "include_text": true });
            if let Some(t) = req.clipboard_type.as_ref() {
                a["types"] = json!([t]);
            }
            Ok(("clipboard_read", a))
        }
        DriveAction::ClipboardWrite => {
            // Engine 0.17 clipboard_write: exactly one of text | image_path | file_path.
            // additionalProperties:false — do not send content_kind.
            let text = req
                .text
                .as_ref()
                .ok_or_else(|| "clipboard write requires --text".to_string())?;
            Ok(("clipboard_write", json!({ "text": text })))
        }
        DriveAction::LaunchApp => {
            let mut a = json!({});
            if let Some(b) = req.bundle_id.as_ref() {
                a["bundle_id"] = json!(b);
            } else if let Some(n) = req.app_name.as_ref() {
                a["name"] = json!(n);
            } else {
                return Err("launch requires --bundle-id or --name".into());
            }
            Ok(("launch_app", a))
        }
        DriveAction::KillApp => {
            let pid = req
                .pid
                .ok_or_else(|| "quit/kill requires --pid".to_string())?;
            Ok(("kill_app", json!({ "pid": pid })))
        }
        DriveAction::BringToFront => {
            let pid = req.pid.ok_or_else(|| "front requires --pid".to_string())?;
            let mut a = json!({ "pid": pid });
            if let Some(wid) = req.window_id {
                a["window_id"] = json!(wid);
            }
            Ok(("bring_to_front", a))
        }
        DriveAction::WindowState => {
            let pid = req
                .pid
                .ok_or_else(|| "window-state requires --pid".to_string())?;
            let wid = req
                .window_id
                .ok_or_else(|| "window-state requires --window-id".to_string())?;
            let mut a = json!({
                "pid": pid,
                "window_id": wid,
                "include_screenshot": req.include_screenshot,
            });
            if let Some(n) = req.max_elements {
                if n > 0 {
                    a["max_elements"] = json!(n);
                }
            }
            if let Some(n) = req.max_depth {
                if n > 0 {
                    a["max_depth"] = json!(n);
                }
            }
            if let Some(q) = req
                .query
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                a["query"] = json!(q);
            }
            Ok(("get_window_state", a))
        }
        DriveAction::InvokeMenu => {
            let pid = req.pid.ok_or_else(|| "menu requires --pid".to_string())?;
            let path = req
                .menu_path
                .as_ref()
                .ok_or_else(|| "menu requires --path".to_string())?;
            let mut a = json!({ "pid": pid, "path": path });
            if let Some(wid) = req.window_id {
                a["window_id"] = json!(wid);
            }
            Ok(("invoke_menu", a))
        }
        DriveAction::Hotkey => {
            let keys = req
                .keys
                .as_ref()
                .ok_or_else(|| "hotkey requires --keys".to_string())?;
            let mut a = json!({ "keys": keys, "delivery_mode": delivery });
            inject_target(&mut a, req);
            Ok(("hotkey", a))
        }
        DriveAction::PressKey => {
            let key = req
                .key
                .as_ref()
                .ok_or_else(|| "key requires --key".to_string())?;
            let mut a = json!({ "key": key, "delivery_mode": delivery });
            inject_target(&mut a, req);
            Ok(("press_key", a))
        }
        DriveAction::Scroll => {
            let direction = req
                .direction
                .as_ref()
                .ok_or_else(|| "scroll requires --direction".to_string())?;
            let mut a = json!({
                "direction": direction,
                "delivery_mode": delivery,
            });
            if let Some(n) = req.amount {
                a["amount"] = json!(n);
            }
            if let Some(by) = req.scroll_by.as_ref() {
                a["by"] = json!(by);
            }
            inject_target(&mut a, req);
            inject_xy_if_present(&mut a, req);
            inject_element(&mut a, req);
            Ok(("scroll", a))
        }
        DriveAction::MoveCursor => {
            let (x, y) = require_xy(req, "move")?;
            let mut a = json!({ "x": x, "y": y });
            if req.window_id.is_none() && req.pid.is_none() {
                a["scope"] = json!("desktop");
            }
            inject_target(&mut a, req);
            Ok(("move_cursor", a))
        }
        DriveAction::Drag => {
            let from_x = req
                .from_x
                .ok_or_else(|| "drag requires --from-x".to_string())?;
            let from_y = req
                .from_y
                .ok_or_else(|| "drag requires --from-y".to_string())?;
            let to_x = req.to_x.ok_or_else(|| "drag requires --to-x".to_string())?;
            let to_y = req.to_y.ok_or_else(|| "drag requires --to-y".to_string())?;
            let mut a = json!({
                "from_x": from_x,
                "from_y": from_y,
                "to_x": to_x,
                "to_y": to_y,
                "delivery_mode": delivery,
            });
            inject_target(&mut a, req);
            Ok(("drag", a))
        }
        DriveAction::Click | DriveAction::DoubleClick | DriveAction::RightClick => {
            let tool = match req.action {
                DriveAction::Click => "click",
                DriveAction::DoubleClick => "double_click",
                DriveAction::RightClick => "right_click",
                _ => unreachable!(),
            };
            // double_click / right_click require pid in engine 0.17 (no scope=desktop path).
            let pid_required = matches!(
                req.action,
                DriveAction::DoubleClick | DriveAction::RightClick
            );

            if let Some(token) = req.element_token.as_ref() {
                if pid_required && req.pid.is_none() {
                    return Err(format!("{tool} requires --pid (engine 0.17)"));
                }
                // Prefer also passing pid/window_id when known (engine validates agreement).
                let mut a = json!({
                    "element_token": token,
                    "delivery_mode": delivery,
                });
                inject_target(&mut a, req);
                return Ok((tool, a));
            }
            if let Some(idx) = req.element_index {
                let snap = req.snapshot_id.as_ref().ok_or_else(|| {
                    format!("{tool} --element-index requires --snapshot-id from window-state")
                })?;
                if pid_required && req.pid.is_none() {
                    return Err(format!("{tool} requires --pid (engine 0.17)"));
                }
                if req.window_id.is_none() {
                    return Err(format!(
                        "{tool} --element-index requires --window-id (engine scopes the snapshot)"
                    ));
                }
                let mut a = json!({
                    "element_index": idx,
                    "snapshot_id": snap,
                    "delivery_mode": delivery,
                });
                inject_target(&mut a, req);
                return Ok((tool, a));
            }
            let (x, y) = require_xy(req, tool)?;
            if pid_required {
                let pid = req
                    .pid
                    .ok_or_else(|| format!("{tool} requires --pid with --x/--y (engine 0.17)"))?;
                let mut a = json!({
                    "x": x,
                    "y": y,
                    "pid": pid,
                    "delivery_mode": delivery,
                });
                if let Some(wid) = req.window_id {
                    a["window_id"] = json!(wid);
                }
                return Ok((tool, a));
            }
            // click only: desktop scope without pid, or window-local with window_id/pid.
            let mut a = if req.window_id.is_some() || req.pid.is_some() {
                let mut o = json!({ "x": x, "y": y, "delivery_mode": delivery });
                inject_target(&mut o, req);
                o
            } else {
                json!({
                    "x": x,
                    "y": y,
                    "scope": "desktop",
                    "delivery_mode": delivery,
                })
            };
            if matches!(req.action, DriveAction::Click) && req.count.unwrap_or(1) > 1 {
                a["count"] = json!(req.count.unwrap_or(1));
            }
            Ok((tool, a))
        }
        DriveAction::Type => {
            let text = req
                .text
                .as_ref()
                .ok_or_else(|| "type requires --text".to_string())?;
            let mut a = json!({ "text": text, "delivery_mode": delivery });
            inject_target(&mut a, req);
            inject_element(&mut a, req);
            // Engine 0.17: pass either element_token/index (AX) OR x,y (pixel-focus
            // the field then type). Pixel path is required for empty-AX apps
            // (Electron / custom UI like QQ Music) after a focus click.
            if req.element_token.is_none() && req.element_index.is_none() {
                inject_xy_if_present(&mut a, req);
            }
            Ok(("type_text", a))
        }
        DriveAction::SetValue => {
            let value = req
                .text
                .as_ref()
                .ok_or_else(|| "set-value requires --text/--value".to_string())?;
            let mut a = json!({ "value": value });
            inject_target(&mut a, req);
            inject_element(&mut a, req);
            Ok(("set_value", a))
        }
        DriveAction::SetWindowFrame => {
            let pid = req
                .pid
                .ok_or_else(|| "window-frame requires --pid".to_string())?;
            let wid = req
                .window_id
                .ok_or_else(|| "window-frame requires --window-id".to_string())?;
            let x = req
                .x
                .ok_or_else(|| "window-frame requires --x".to_string())? as f64;
            let y = req
                .y
                .ok_or_else(|| "window-frame requires --y".to_string())? as f64;
            let width = req
                .width
                .ok_or_else(|| "window-frame requires --width".to_string())?
                as f64;
            let height = req
                .height
                .ok_or_else(|| "window-frame requires --height".to_string())?
                as f64;
            Ok((
                "set_window_frame",
                json!({
                    "pid": pid,
                    "window_id": wid,
                    "x": x,
                    "y": y,
                    "width": width,
                    "height": height,
                }),
            ))
        }
        DriveAction::Zoom => {
            let wid = req
                .window_id
                .ok_or_else(|| "zoom requires --window-id".to_string())?;
            let x1 = req.x1.ok_or_else(|| "zoom requires --x1".to_string())?;
            let y1 = req.y1.ok_or_else(|| "zoom requires --y1".to_string())?;
            let x2 = req.x2.ok_or_else(|| "zoom requires --x2".to_string())?;
            let y2 = req.y2.ok_or_else(|| "zoom requires --y2".to_string())?;
            let mut a = json!({
                "window_id": wid,
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
            });
            if let Some(pid) = req.pid {
                a["pid"] = json!(pid);
            }
            Ok(("zoom", a))
        }
        DriveAction::VerifyState => {
            let pid = req
                .pid
                .ok_or_else(|| "verify-state requires --pid".to_string())?;
            let wid = req
                .window_id
                .ok_or_else(|| "verify-state requires --window-id".to_string())?;
            // Minimal expect payload: existence probe; agents may pass richer JSON later.
            let expect = req
                .expect_json
                .clone()
                .unwrap_or_else(|| json!([{ "element": { "exists": true, "selector": {} } }]));
            Ok((
                "verify_state",
                json!({
                    "pid": pid,
                    "window_id": wid,
                    "expect": expect,
                }),
            ))
        }
    }
}

fn require_xy(req: &DriveRequest, action: &str) -> Result<(i32, i32), String> {
    match (req.x, req.y) {
        (Some(x), Some(y)) => Ok((x, y)),
        _ => Err(format!(
            "{action} requires --x and --y (or element targeting)"
        )),
    }
}

fn inject_target(a: &mut Value, req: &DriveRequest) {
    if let Some(obj) = a.as_object_mut() {
        if let Some(pid) = req.pid {
            obj.insert("pid".into(), json!(pid));
        }
        if let Some(wid) = req.window_id {
            obj.insert("window_id".into(), json!(wid));
        }
    }
}

fn inject_xy_if_present(a: &mut Value, req: &DriveRequest) {
    if let Some(obj) = a.as_object_mut() {
        if let Some(x) = req.x {
            obj.insert("x".into(), json!(x));
        }
        if let Some(y) = req.y {
            obj.insert("y".into(), json!(y));
        }
    }
}

fn inject_element(a: &mut Value, req: &DriveRequest) {
    if let Some(obj) = a.as_object_mut() {
        if let Some(t) = req.element_token.as_ref() {
            obj.insert("element_token".into(), json!(t));
        }
        if let Some(i) = req.element_index {
            obj.insert("element_index".into(), json!(i));
        }
        if let Some(s) = req.snapshot_id.as_ref() {
            obj.insert("snapshot_id".into(), json!(s));
        }
    }
}

/// Whether this action should pre-move the OS/agent cursor (desktop pixel path).
pub fn wants_pre_move_cursor(req: &DriveRequest) -> bool {
    matches!(
        req.action,
        DriveAction::Click | DriveAction::DoubleClick | DriveAction::RightClick | DriveAction::Drag
    ) && req.element_token.is_none()
        && req.element_index.is_none()
        && req.x.is_some()
        && req.y.is_some()
        && req.window_id.is_none()
}

/// Whether default highlight chrome applies.
pub fn wants_action_highlight(req: &DriveRequest) -> bool {
    !matches!(
        req.action,
        DriveAction::Verify
            | DriveAction::ListApps
            | DriveAction::GetScreenSize
            | DriveAction::GetCursorPosition
            | DriveAction::ClipboardRead
            | DriveAction::SessionEnd
            | DriveAction::Screenshot
            | DriveAction::Highlight
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::control::DriveRequest;

    #[test]
    fn click_desktop_scope() {
        let req = DriveRequest {
            action: DriveAction::Click,
            x: Some(10),
            y: Some(20),
            ..Default::default()
        };
        let (tool, args) = build_engine_call(&req).unwrap();
        assert_eq!(tool, "click");
        assert_eq!(args["scope"], "desktop");
        assert_eq!(args["x"], 10);
        assert_eq!(args["delivery_mode"], "background");
    }

    #[test]
    fn click_element_token() {
        let req = DriveRequest {
            action: DriveAction::Click,
            element_token: Some("tok".into()),
            pid: Some(1),
            window_id: Some(2),
            ..Default::default()
        };
        let (tool, args) = build_engine_call(&req).unwrap();
        assert_eq!(tool, "click");
        assert_eq!(args["element_token"], "tok");
        assert!(args.get("scope").is_none());
    }

    #[test]
    fn type_with_pixel_focus_xy() {
        let req = DriveRequest {
            action: DriveAction::Type,
            text: Some("hello".into()),
            x: Some(120),
            y: Some(40),
            pid: Some(9),
            window_id: Some(99),
            ..Default::default()
        };
        let (tool, args) = build_engine_call(&req).unwrap();
        assert_eq!(tool, "type_text");
        assert_eq!(args["text"], "hello");
        assert_eq!(args["x"], 120);
        assert_eq!(args["y"], 40);
        assert_eq!(args["pid"], 9);
        assert_eq!(args["window_id"], 99);
    }

    #[test]
    fn type_element_token_skips_xy() {
        let req = DriveRequest {
            action: DriveAction::Type,
            text: Some("hello".into()),
            x: Some(1),
            y: Some(2),
            element_token: Some("tok".into()),
            pid: Some(1),
            ..Default::default()
        };
        let (tool, args) = build_engine_call(&req).unwrap();
        assert_eq!(tool, "type_text");
        assert_eq!(args["element_token"], "tok");
        assert!(args.get("x").is_none());
        assert!(args.get("y").is_none());
    }

    #[test]
    fn click_element_index_requires_snapshot_and_window() {
        let missing_snap = DriveRequest {
            action: DriveAction::Click,
            element_index: Some(3),
            window_id: Some(9),
            pid: Some(1),
            ..Default::default()
        };
        assert!(build_engine_call(&missing_snap).is_err());

        let ok = DriveRequest {
            action: DriveAction::Click,
            element_index: Some(3),
            snapshot_id: Some("snap".into()),
            window_id: Some(9),
            pid: Some(1),
            ..Default::default()
        };
        let (tool, args) = build_engine_call(&ok).unwrap();
        assert_eq!(tool, "click");
        assert_eq!(args["element_index"], 3);
        assert_eq!(args["snapshot_id"], "snap");
        assert_eq!(args["window_id"], 9);
    }

    #[test]
    fn window_state_bounds_and_query() {
        let req = DriveRequest {
            action: DriveAction::WindowState,
            pid: Some(7),
            window_id: Some(8),
            max_elements: Some(200),
            max_depth: Some(12),
            query: Some("Submit".into()),
            include_screenshot: true,
            ..Default::default()
        };
        let (tool, args) = build_engine_call(&req).unwrap();
        assert_eq!(tool, "get_window_state");
        assert_eq!(args["max_elements"], 200);
        assert_eq!(args["max_depth"], 12);
        assert_eq!(args["query"], "Submit");
        assert_eq!(args["include_screenshot"], true);
    }

    #[test]
    fn double_and_right_click_require_pid_no_desktop_scope() {
        let missing = DriveRequest {
            action: DriveAction::DoubleClick,
            x: Some(1),
            y: Some(2),
            ..Default::default()
        };
        assert!(build_engine_call(&missing).is_err());

        let d = DriveRequest {
            action: DriveAction::DoubleClick,
            x: Some(1),
            y: Some(2),
            pid: Some(42),
            ..Default::default()
        };
        let (tool, args) = build_engine_call(&d).unwrap();
        assert_eq!(tool, "double_click");
        assert_eq!(args["pid"], 42);
        assert!(args.get("scope").is_none());

        let r = DriveRequest {
            action: DriveAction::RightClick,
            x: Some(1),
            y: Some(2),
            pid: Some(7),
            ..Default::default()
        };
        let (tool, args) = build_engine_call(&r).unwrap();
        assert_eq!(tool, "right_click");
        assert_eq!(args["pid"], 7);
    }

    #[test]
    fn clipboard_write_text_only_no_content_kind() {
        let req = DriveRequest {
            action: DriveAction::ClipboardWrite,
            text: Some("hello".into()),
            ..Default::default()
        };
        let (tool, args) = build_engine_call(&req).unwrap();
        assert_eq!(tool, "clipboard_write");
        assert_eq!(args["text"], "hello");
        assert!(args.get("content_kind").is_none());
        // Engine 0.17 allowed keys only
        for k in args.as_object().unwrap().keys() {
            assert!(
                matches!(k.as_str(), "text" | "image_path" | "file_path" | "session"),
                "unexpected field {k}"
            );
        }
    }

    #[test]
    fn drag_scroll_hotkey_launch() {
        let drag = DriveRequest {
            action: DriveAction::Drag,
            from_x: Some(0),
            from_y: Some(0),
            to_x: Some(5),
            to_y: Some(5),
            pid: Some(9),
            ..Default::default()
        };
        let (t, a) = build_engine_call(&drag).unwrap();
        assert_eq!(t, "drag");
        assert_eq!(a["to_x"], 5);

        let scroll = DriveRequest {
            action: DriveAction::Scroll,
            direction: Some("down".into()),
            amount: Some(3),
            pid: Some(1),
            ..Default::default()
        };
        assert_eq!(build_engine_call(&scroll).unwrap().0, "scroll");

        let hk = DriveRequest {
            action: DriveAction::Hotkey,
            keys: Some(json!(["cmd", "c"])),
            ..Default::default()
        };
        assert_eq!(build_engine_call(&hk).unwrap().0, "hotkey");

        let launch = DriveRequest {
            action: DriveAction::LaunchApp,
            bundle_id: Some("com.apple.Safari".into()),
            ..Default::default()
        };
        let (t, a) = build_engine_call(&launch).unwrap();
        assert_eq!(t, "launch_app");
        assert_eq!(a["bundle_id"], "com.apple.Safari");
    }

    #[test]
    fn phase2_front_set_value_frame() {
        let front = DriveRequest {
            action: DriveAction::BringToFront,
            pid: Some(3),
            window_id: Some(4),
            ..Default::default()
        };
        assert_eq!(build_engine_call(&front).unwrap().0, "bring_to_front");

        let sv = DriveRequest {
            action: DriveAction::SetValue,
            text: Some("hi".into()),
            element_token: Some("e".into()),
            pid: Some(1),
            ..Default::default()
        };
        let (t, a) = build_engine_call(&sv).unwrap();
        assert_eq!(t, "set_value");
        assert_eq!(a["value"], "hi");

        let frame = DriveRequest {
            action: DriveAction::SetWindowFrame,
            pid: Some(1),
            window_id: Some(2),
            x: Some(0),
            y: Some(0),
            width: Some(100),
            height: Some(200),
            ..Default::default()
        };
        assert_eq!(build_engine_call(&frame).unwrap().0, "set_window_frame");
    }
}
