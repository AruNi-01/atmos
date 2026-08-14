//! Atmos embedded browser (in-app webview) via host-owned control plane.
//!
//! Electron Desktop writes `~/.atmos/data/browser-use/control.json` with a loopback
//! HTTP base URL and a per-runtime bearer token. This backend talks to that plane —
//! **not** user-Chrome `browser_prepare`.

use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::time::Duration;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
/// Cap identity-framed HTTP responses so a broken host cannot unbounded-buffer.
const MAX_RESPONSE_BYTES: u64 = 8 * 1024 * 1024;

use serde_json::{json, Value};

use super::BrowserBackend;
use crate::errors::{
    fail, fail_with_recovery, classify_engine_message, recovery_for, BROWSER_CONTROL_AUTH_FAILED,
    BROWSER_CONTROL_UNAVAILABLE, BROWSER_INVALID_ARGS, BROWSER_UNSUPPORTED,
};
use crate::types::{
    action_name, BrowserAction, BrowserError, BrowserRequest, BrowserResult,
    EMBEDDED_SNAPSHOT_FORMAT, ERR_EMBEDDED_HOST_UNAVAILABLE,
};

#[derive(Debug, Default)]
pub struct EmbeddedBackend;

#[derive(Debug, Clone)]
pub struct ControlMeta {
    base_url: String,
    token: String,
}

fn control_dir() -> PathBuf {
    if let Ok(p) = std::env::var("ATMOS_BROWSER_USE_HOME") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".atmos")
        .join("data")
        .join("browser-use")
}

fn control_meta_path() -> PathBuf {
    control_dir().join("control.json")
}

fn is_exact_loopback_host(host: &str) -> bool {
    matches!(host, "127.0.0.1" | "localhost" | "[::1]" | "::1")
}

/// Resolve loopback base URL + bearer token from host-written control.json.
pub fn read_control_meta() -> Result<ControlMeta, String> {
    let path = control_meta_path();
    let raw = fs::read_to_string(&path).map_err(|_| {
        format!(
            "Atmos Browser Use host is not running (missing {}). Open Atmos Desktop with an in-app Browser tab, then retry --backend embedded.",
            path.display()
        )
    })?;
    let v: Value = serde_json::from_str(&raw).map_err(|e| format!("invalid control.json: {e}"))?;
    let base = v
        .get("base_url")
        .and_then(|x| x.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "control.json missing base_url".to_string())?;
    let parsed = parse_http_url(base)?;
    if !is_exact_loopback_host(&parsed.host) {
        return Err("control base_url must be exact loopback HTTP (127.0.0.1 or localhost)".into());
    }
    let token = v
        .get("token")
        .and_then(|x| x.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            "control.json missing token — restart Atmos Desktop so the embedded control plane can issue a bearer token".to_string()
        })?;
    Ok(ControlMeta {
        base_url: base.trim_end_matches('/').to_string(),
        token: token.to_string(),
    })
}

/// Backward-compatible helper used by older tests / callers.
#[allow(dead_code)]
pub fn read_control_base_url() -> Result<String, String> {
    Ok(read_control_meta()?.base_url)
}

/// Minimal HTTP/1.1 POST JSON (no reqwest dep).
#[allow(dead_code)]
pub fn http_post_json(base: &str, path: &str, body: &Value) -> Result<Value, String> {
    http_post_json_auth(base, path, body, None)
}

pub fn http_post_json_auth(
    base: &str,
    path: &str,
    body: &Value,
    token: Option<&str>,
) -> Result<Value, String> {
    let url = format!("{base}{path}");
    let parsed = parse_http_url(&url)?;
    if !is_exact_loopback_host(&parsed.host) {
        return Err("embedded host must be exact loopback".into());
    }
    let payload = serde_json::to_vec(body).map_err(|e| e.to_string())?;
    let auth = token
        .map(|t| format!("Authorization: Bearer {t}\r\n"))
        .unwrap_or_default();
    let req = format!(
        "POST {} HTTP/1.1\r\nHost: {}:{}\r\nOrigin: http://127.0.0.1\r\nContent-Type: application/json\r\nAccept: application/json\r\n{auth}Content-Length: {}\r\nConnection: close\r\n\r\n",
        parsed.path,
        parsed.host,
        parsed.port,
        payload.len()
    );
    let addr = resolve_socket_addr(&parsed.host, parsed.port)?;
    let mut stream = TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT)
        .map_err(|e| format!("connect embedded host failed: {e}"))?;
    stream.set_read_timeout(Some(Duration::from_secs(30))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(10))).ok();
    stream
        .write_all(req.as_bytes())
        .and_then(|_| stream.write_all(&payload))
        .map_err(|e| format!("write embedded host failed: {e}"))?;
    let mut buf = Vec::new();
    let mut limited = (&mut stream).take(MAX_RESPONSE_BYTES + 1);
    limited
        .read_to_end(&mut buf)
        .map_err(|e| format!("read embedded host failed: {e}"))?;
    if buf.len() as u64 > MAX_RESPONSE_BYTES {
        return Err("embedded host response too large".into());
    }
    let text = String::from_utf8_lossy(&buf);
    let body_start = text
        .find("\r\n\r\n")
        .map(|i| i + 4)
        .ok_or_else(|| "invalid HTTP response from embedded host".to_string())?;
    let status_line = text.lines().next().unwrap_or("");
    if status_line.contains(" 401 ") || status_line.contains(" 403 ") {
        return Err("embedded host rejected the control-plane token".into());
    }
    if !status_line.contains(" 200 ") && !status_line.ends_with(" 200") {
        if let Ok(v) = serde_json::from_str::<Value>(text[body_start..].trim()) {
            return Ok(v);
        }
        return Err(format!("embedded host HTTP error: {}", status_line.trim()));
    }
    let body_str = text[body_start..].trim();
    if body_str.is_empty() {
        return Ok(json!({ "ok": true }));
    }
    serde_json::from_str(body_str).map_err(|e| format!("embedded host JSON: {e}"))
}

struct ParsedUrl {
    host: String,
    port: u16,
    path: String,
}

fn resolve_socket_addr(host: &str, port: u16) -> Result<SocketAddr, String> {
    (host, port)
        .to_socket_addrs()
        .map_err(|e| format!("resolve embedded host failed: {e}"))?
        .next()
        .ok_or_else(|| format!("resolve embedded host failed: no address for {host}:{port}"))
}

fn parse_http_url(url: &str) -> Result<ParsedUrl, String> {
    let rest = url
        .strip_prefix("http://")
        .ok_or_else(|| "only http:// loopback is supported".to_string())?;
    let (hostport, path) = match rest.split_once('/') {
        Some((h, p)) => (h, format!("/{p}")),
        None => (rest, "/".into()),
    };
    let (host, port) = if let Some((h, p)) = hostport.split_once(':') {
        (
            h.to_string(),
            p.parse::<u16>()
                .map_err(|_| format!("invalid port in {url}"))?,
        )
    } else {
        (hostport.to_string(), 80u16)
    };
    Ok(ParsedUrl { host, port, path })
}

fn request_path(a: BrowserAction) -> &'static str {
    match a {
        BrowserAction::Prepare => "/v1/prepare",
        BrowserAction::State => "/v1/state",
        BrowserAction::Click => "/v1/click",
        BrowserAction::Type => "/v1/type",
        BrowserAction::Navigate => "/v1/navigate",
        BrowserAction::Pointer => "/v1/pointer",
        BrowserAction::Dialog => "/v1/dialog",
        BrowserAction::Download => "/v1/download",
        BrowserAction::PressKey => "/v1/press-key",
        BrowserAction::Upload => "/v1/upload",
        BrowserAction::End => "/v1/end",
        BrowserAction::Tabs => "/v1/tabs",
    }
}

fn session_id(req: &BrowserRequest) -> String {
    crate::binding::engine_session_id(req.binding_id.as_deref(), req.session.as_deref())
}

pub fn build_embedded_body(req: &BrowserRequest) -> Result<Value, String> {
    let session = session_id(req);
    match req.action {
        BrowserAction::Prepare => Ok(json!({
            "session": session,
            "target_id": req.target_id,
            "url": req.url,
        })),
        BrowserAction::State => {
            if let Some(fmt) = req
                .snapshot_format
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                if fmt != EMBEDDED_SNAPSHOT_FORMAT && fmt != "dom_refs_v1" {
                    return Err(format!(
                        "embedded snapshot format {fmt:?} is unsupported (use {EMBEDDED_SNAPSHOT_FORMAT})"
                    ));
                }
            }
            Ok(json!({
                "session": session,
                "target_id": req.target_id,
                "tab_id": req.tab_id,
                "snapshot_format": EMBEDDED_SNAPSHOT_FORMAT,
                "include_screenshot": req.include_screenshot,
                "query": req.query,
            }))
        }
        BrowserAction::Click => {
            let target = req
                .target_id
                .as_ref()
                .ok_or_else(|| "click requires --target-id (embedded session id)".to_string())?;
            let has_ref = req
                .element_ref
                .as_ref()
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false);
            let has_xy = req.x.is_some() && req.y.is_some();
            if !has_ref && !has_xy {
                return Err("click requires --ref or both --x and --y".into());
            }
            if let Some(route) = req
                .input_route
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                if route != "trusted" {
                    return Err(
                        "embedded click does not support --input-route besides the default trusted path"
                            .into(),
                    );
                }
            }
            let mut a = json!({
                "session": session,
                "target_id": target,
                "tab_id": req.tab_id.clone().unwrap_or_else(|| "main".into()),
            });
            if has_ref {
                a["ref"] = json!(req.element_ref.as_ref().unwrap().trim());
            }
            if has_xy {
                a["x"] = json!(req.x.unwrap());
                a["y"] = json!(req.y.unwrap());
            }
            Ok(a)
        }
        BrowserAction::Type => {
            let target = req
                .target_id
                .as_ref()
                .ok_or_else(|| "type requires --target-id".to_string())?;
            let text = req
                .text
                .as_ref()
                .ok_or_else(|| "type requires --text".to_string())?;
            let mut a = json!({
                "session": session,
                "target_id": target,
                "tab_id": req.tab_id.clone().unwrap_or_else(|| "main".into()),
                "ref": req.element_ref,
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
            Ok(a)
        }
        BrowserAction::Navigate => {
            let target = req
                .target_id
                .as_ref()
                .ok_or_else(|| "navigate requires --target-id".to_string())?;
            let url = req
                .url
                .as_ref()
                .ok_or_else(|| "navigate requires --url".to_string())?;
            Ok(json!({
                "session": session,
                "target_id": target,
                "tab_id": req.tab_id.clone().unwrap_or_else(|| "main".into()),
                "url": url,
            }))
        }
        BrowserAction::Pointer => {
            let target = req
                .target_id
                .as_ref()
                .ok_or_else(|| "pointer requires --target-id".to_string())?;
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
                "tab_id": req.tab_id.clone().unwrap_or_else(|| "main".into()),
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
            Ok(a)
        }
        BrowserAction::Dialog => {
            let target = req
                .target_id
                .as_ref()
                .ok_or_else(|| "dialog requires --target-id".to_string())?;
            let action = req
                .dialog_action
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "dialog requires --action (inspect|accept|dismiss)".to_string())?;
            let mut a = json!({
                "session": session,
                "target_id": target,
                "tab_id": req.tab_id.clone().unwrap_or_else(|| "main".into()),
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
            Ok(a)
        }
        BrowserAction::Download => {
            let target = req
                .target_id
                .as_ref()
                .ok_or_else(|| "download requires --target-id".to_string())?;
            let r = req
                .element_ref
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "download requires --ref".to_string())?;
            let mut a = json!({
                "session": session,
                "target_id": target,
                "tab_id": req.tab_id.clone().unwrap_or_else(|| "main".into()),
                "ref": r,
            });
            if let Some(dir) = req
                .download_dir
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                a["dir"] = json!(dir);
            }
            Ok(a)
        }
        BrowserAction::PressKey => {
            let target = req
                .target_id
                .as_ref()
                .ok_or_else(|| "press-key requires --target-id".to_string())?;
            let key = req
                .key
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "press-key requires --key".to_string())?;
            Ok(json!({
                "session": session,
                "target_id": target,
                "tab_id": req.tab_id.clone().unwrap_or_else(|| "main".into()),
                "ref": req.element_ref,
                "key": key,
            }))
        }
        BrowserAction::Upload => Err(
            "upload / set-input-files is not supported on --backend embedded yet; use --backend external"
                .into(),
        ),
        BrowserAction::End => Ok(json!({
            "session": session,
            "target_id": req.target_id,
        })),
        BrowserAction::Tabs => {
            let action = req
                .tab_action
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "tabs requires --action list|open|close|select".to_string())?;
            match action {
                "list" | "open" | "close" | "select" => {}
                other => {
                    return Err(format!(
                        "unknown tabs --action {other:?} (use list|open|close|select)"
                    ));
                }
            }
            if action == "open" {
                let url = req
                    .url
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .ok_or_else(|| "tabs open requires --url".to_string())?;
                let mut body = json!({
                    "session": session,
                    "action": action,
                    "url": url,
                });
                if let Some(target) = req.target_id.as_ref() {
                    body["target_id"] = json!(target);
                }
                return Ok(body);
            }
            if matches!(action, "close" | "select") && req.target_id.is_none() {
                return Err(format!("tabs {action} requires --target-id"));
            }
            Ok(json!({
                "session": session,
                "action": action,
                "target_id": req.target_id,
            }))
        }
    }
}

impl BrowserBackend for EmbeddedBackend {
    fn execute(&self, req: BrowserRequest) -> BrowserResult {
        let action = action_name(req.action);
        let body = match build_embedded_body(&req) {
            Ok(b) => b,
            Err(e) => {
                let code = if e.contains("not supported") || e.contains("unsupported") {
                    BROWSER_UNSUPPORTED
                } else {
                    BROWSER_INVALID_ARGS
                };
                return fail_with_recovery(
                    action,
                    "embedded",
                    code,
                    BrowserError::InvalidArgs(e).message(),
                    recovery_for(code),
                );
            }
        };
        let meta = match read_control_meta() {
            Ok(b) => b,
            Err(e) => {
                return BrowserResult {
                    ok: false,
                    action: action.into(),
                    backend: "embedded".into(),
                    result: Some(json!({
                        "partition": "persist:atmos-browser",
                        "attach": "electron_debugger_host_control_plane",
                        "control_meta": control_meta_path().display().to_string(),
                    })),
                    error: Some(e),
                    error_code: Some(ERR_EMBEDDED_HOST_UNAVAILABLE.into()),
                    recovery: recovery_for(BROWSER_CONTROL_UNAVAILABLE),
                    ..BrowserResult::default()
                };
            }
        };
        let path = request_path(req.action);
        match http_post_json_auth(&meta.base_url, path, &body, Some(&meta.token)) {
            Ok(v) => {
                let ok = v.get("ok").and_then(|x| x.as_bool()).unwrap_or(true);
                if !ok {
                    let msg = v
                        .get("error")
                        .and_then(|x| x.as_str())
                        .unwrap_or("embedded browser action failed")
                        .to_string();
                    let host_code = v.get("error_code").and_then(|x| x.as_str());
                    let (code, recovery) = classify_engine_message(host_code, &msg);
                    let mut result = fail_with_recovery(action, "embedded", code, msg, recovery);
                    result.result = Some(v);
                    return result;
                }
                BrowserResult {
                    ok: true,
                    action: action.into(),
                    backend: "embedded".into(),
                    result: Some(v),
                    ..BrowserResult::default()
                }
            }
            Err(e) => {
                let auth_fail = e.contains("token") || e.contains("401") || e.contains("403");
                let code = if auth_fail {
                    BROWSER_CONTROL_AUTH_FAILED
                } else {
                    ERR_EMBEDDED_HOST_UNAVAILABLE
                };
                fail_with_recovery(action, "embedded", code, e, recovery_for(code))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::BrowserBackendKind;

    #[test]
    fn build_click_requires_ref_or_xy() {
        let req = BrowserRequest {
            backend: BrowserBackendKind::Embedded,
            action: BrowserAction::Click,
            target_id: Some("s1".into()),
            ..Default::default()
        };
        assert!(build_embedded_body(&req).is_err());

        let with_ref = BrowserRequest {
            backend: BrowserBackendKind::Embedded,
            action: BrowserAction::Click,
            target_id: Some("s1".into()),
            element_ref: Some("e0".into()),
            ..Default::default()
        };
        let body = build_embedded_body(&with_ref).unwrap();
        assert_eq!(body["ref"], "e0");
        assert_eq!(request_path(BrowserAction::Pointer), "/v1/pointer");
        assert_eq!(request_path(BrowserAction::Dialog), "/v1/dialog");
        assert_eq!(request_path(BrowserAction::Download), "/v1/download");
        assert_eq!(request_path(BrowserAction::PressKey), "/v1/press-key");
        assert_eq!(request_path(BrowserAction::End), "/v1/end");
        assert_eq!(request_path(BrowserAction::Tabs), "/v1/tabs");
    }

    #[test]
    fn build_pointer_and_download_bodies() {
        let ptr = BrowserRequest {
            backend: BrowserBackendKind::Embedded,
            action: BrowserAction::Pointer,
            target_id: Some("s1".into()),
            pointer_action: Some("hover".into()),
            element_ref: Some("e2".into()),
            ..Default::default()
        };
        let body = build_embedded_body(&ptr).unwrap();
        assert_eq!(body["action"], "hover");
        assert_eq!(body["ref"], "e2");

        let dl = BrowserRequest {
            backend: BrowserBackendKind::Embedded,
            action: BrowserAction::Download,
            target_id: Some("s1".into()),
            element_ref: Some("e1".into()),
            download_dir: Some("/tmp/out".into()),
            ..Default::default()
        };
        let body = build_embedded_body(&dl).unwrap();
        assert_eq!(body["dir"], "/tmp/out");
        assert_eq!(body["ref"], "e1");
    }

    #[test]
    fn rejects_semantic_v2_on_embedded() {
        let req = BrowserRequest {
            backend: BrowserBackendKind::Embedded,
            action: BrowserAction::State,
            snapshot_format: Some("semantic_v2".into()),
            ..Default::default()
        };
        assert!(build_embedded_body(&req).is_err());
    }

    #[test]
    fn upload_is_unsupported() {
        let req = BrowserRequest {
            backend: BrowserBackendKind::Embedded,
            action: BrowserAction::Upload,
            target_id: Some("s1".into()),
            files: vec!["/tmp/a.png".into()],
            ..Default::default()
        };
        assert!(build_embedded_body(&req).unwrap_err().contains("not supported"));
    }

    #[test]
    fn parse_loopback_url() {
        let p = parse_http_url("http://127.0.0.1:18765/v1/state").unwrap();
        assert_eq!(p.host, "127.0.0.1");
        assert_eq!(p.port, 18765);
        assert_eq!(p.path, "/v1/state");
        assert!(is_exact_loopback_host("127.0.0.1"));
        assert!(is_exact_loopback_host("localhost"));
        assert!(!is_exact_loopback_host("localhost.evil"));
    }

    #[test]
    fn tabs_open_requires_url_and_valid_action() {
        let missing = BrowserRequest {
            backend: BrowserBackendKind::Embedded,
            action: BrowserAction::Tabs,
            tab_action: Some("open".into()),
            ..Default::default()
        };
        assert!(build_embedded_body(&missing).unwrap_err().contains("--url"));

        let bad = BrowserRequest {
            backend: BrowserBackendKind::Embedded,
            action: BrowserAction::Tabs,
            tab_action: Some("explode".into()),
            ..Default::default()
        };
        assert!(build_embedded_body(&bad).unwrap_err().contains("unknown tabs"));

        let open = BrowserRequest {
            backend: BrowserBackendKind::Embedded,
            action: BrowserAction::Tabs,
            tab_action: Some("open".into()),
            url: Some("https://example.com".into()),
            ..Default::default()
        };
        let body = build_embedded_body(&open).unwrap();
        assert_eq!(body["action"], "open");
        assert_eq!(body["url"], "https://example.com");

        let close = BrowserRequest {
            backend: BrowserBackendKind::Embedded,
            action: BrowserAction::Tabs,
            tab_action: Some("close".into()),
            target_id: Some("sess".into()),
            ..Default::default()
        };
        let body = build_embedded_body(&close).unwrap();
        assert_eq!(body["action"], "close");
        assert_eq!(body["target_id"], "sess");
    }

    #[test]
    fn download_dir_is_optional_for_embedded() {
        let dl = BrowserRequest {
            backend: BrowserBackendKind::Embedded,
            action: BrowserAction::Download,
            target_id: Some("s1".into()),
            element_ref: Some("e1".into()),
            ..Default::default()
        };
        let body = build_embedded_body(&dl).unwrap();
        assert!(body.get("dir").is_none());
    }
}
