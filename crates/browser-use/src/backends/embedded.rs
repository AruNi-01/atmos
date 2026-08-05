//! Atmos embedded browser (in-app webview) via host-owned control plane.
//!
//! Electron Desktop writes `~/.atmos/browser-use/control.json` with a loopback
//! HTTP base URL. This backend talks to that plane — **not** user-Chrome
//! `browser_prepare`.

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
use crate::types::{
    BrowserAction, BrowserError, BrowserRequest, BrowserResult, ERR_EMBEDDED_HOST_UNAVAILABLE,
};

#[derive(Debug, Default)]
pub struct EmbeddedBackend;

fn control_dir() -> PathBuf {
    if let Ok(p) = std::env::var("ATMOS_BROWSER_USE_HOME") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".atmos")
        .join("browser-use")
}

fn control_meta_path() -> PathBuf {
    control_dir().join("control.json")
}

/// Resolve loopback base URL from host-written control.json, e.g. `http://127.0.0.1:18765`.
pub fn read_control_base_url() -> Result<String, String> {
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
    if !(base.starts_with("http://127.0.0.1") || base.starts_with("http://localhost")) {
        return Err("control base_url must be loopback HTTP".into());
    }
    Ok(base.trim_end_matches('/').to_string())
}

/// Minimal HTTP/1.1 POST JSON (no reqwest dep).
pub fn http_post_json(base: &str, path: &str, body: &Value) -> Result<Value, String> {
    let url = format!("{base}{path}");
    let parsed = parse_http_url(&url)?;
    let payload = serde_json::to_vec(body).map_err(|e| e.to_string())?;
    let req = format!(
        "POST {} HTTP/1.1\r\nHost: {}:{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
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
    // Read one past the cap so we can reject oversized responses.
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
    if !status_line.contains(" 200 ") && !status_line.ends_with(" 200") {
        // Still try parse body for structured error
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

fn action_name(a: BrowserAction) -> &'static str {
    match a {
        BrowserAction::Prepare => "prepare",
        BrowserAction::State => "state",
        BrowserAction::Click => "click",
        BrowserAction::Type => "type",
        BrowserAction::Navigate => "navigate",
    }
}

fn request_path(a: BrowserAction) -> &'static str {
    match a {
        BrowserAction::Prepare => "/v1/prepare",
        BrowserAction::State => "/v1/state",
        BrowserAction::Click => "/v1/click",
        BrowserAction::Type => "/v1/type",
        BrowserAction::Navigate => "/v1/navigate",
    }
}

pub fn build_embedded_body(req: &BrowserRequest) -> Result<Value, String> {
    let session = req
        .session
        .clone()
        .unwrap_or_else(|| "atmos-browser-use".into());
    match req.action {
        BrowserAction::Prepare => Ok(json!({
            "session": session,
            // Optional preferred in-app browser session id (maps to target_id)
            "target_id": req.target_id,
            "url": req.url,
        })),
        BrowserAction::State => {
            // Bind: no target → list sessions. Snapshot: target_id (+ optional tab_id)
            Ok(json!({
                "session": session,
                "target_id": req.target_id,
                "tab_id": req.tab_id,
            }))
        }
        BrowserAction::Click => {
            let target = req
                .target_id
                .as_ref()
                .ok_or_else(|| "click requires --target-id (embedded session id)".to_string())?;
            let r = req
                .element_ref
                .as_ref()
                .ok_or_else(|| "click requires --ref".to_string())?;
            Ok(json!({
                "session": session,
                "target_id": target,
                "tab_id": req.tab_id.clone().unwrap_or_else(|| "main".into()),
                "ref": r,
            }))
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
            Ok(json!({
                "session": session,
                "target_id": target,
                "tab_id": req.tab_id.clone().unwrap_or_else(|| "main".into()),
                "ref": req.element_ref,
                "text": text,
            }))
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
    }
}

impl BrowserBackend for EmbeddedBackend {
    fn execute(&self, req: BrowserRequest) -> BrowserResult {
        let action = action_name(req.action);
        let body = match build_embedded_body(&req) {
            Ok(b) => b,
            Err(e) => {
                let err = BrowserError::InvalidArgs(e);
                return BrowserResult {
                    ok: false,
                    action: action.into(),
                    backend: "embedded".into(),
                    result: None,
                    error: Some(err.message()),
                    error_code: Some(err.code().into()),
                };
            }
        };
        let base = match read_control_base_url() {
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
                };
            }
        };
        match http_post_json(&base, request_path(req.action), &body) {
            Ok(v) => {
                let ok = v.get("ok").and_then(|x| x.as_bool()).unwrap_or(true);
                if !ok {
                    let msg = v
                        .get("error")
                        .and_then(|x| x.as_str())
                        .unwrap_or("embedded browser action failed")
                        .to_string();
                    let code = v
                        .get("error_code")
                        .and_then(|x| x.as_str())
                        .unwrap_or("browser_engine_failed")
                        .to_string();
                    return BrowserResult {
                        ok: false,
                        action: action.into(),
                        backend: "embedded".into(),
                        result: Some(v),
                        error: Some(msg),
                        error_code: Some(code),
                    };
                }
                BrowserResult {
                    ok: true,
                    action: action.into(),
                    backend: "embedded".into(),
                    result: Some(v),
                    error: None,
                    error_code: None,
                }
            }
            Err(e) => BrowserResult {
                ok: false,
                action: action.into(),
                backend: "embedded".into(),
                result: None,
                error: Some(e),
                error_code: Some(ERR_EMBEDDED_HOST_UNAVAILABLE.into()),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::BrowserBackendKind;

    #[test]
    fn build_click_requires_ref() {
        let req = BrowserRequest {
            backend: BrowserBackendKind::Embedded,
            action: BrowserAction::Click,
            target_id: Some("s1".into()),
            ..Default::default()
        };
        assert!(build_embedded_body(&req).is_err());
    }

    #[test]
    fn parse_loopback_url() {
        let p = parse_http_url("http://127.0.0.1:18765/v1/state").unwrap();
        assert_eq!(p.host, "127.0.0.1");
        assert_eq!(p.port, 18765);
        assert_eq!(p.path, "/v1/state");
    }
}
