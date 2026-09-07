use std::path::Path;
use std::time::Duration;

use base64::Engine as _;
use serde_json::{json, Value};

use crate::error::{EngineError, Result};

use super::coords::validate_point;
use super::screenshot::{write_png, ScreenshotSize};

const HTTP_TIMEOUT: Duration = Duration::from_secs(5);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const SWIPE_DURATION_CAP_MS: u32 = 10_000;

pub async fn serve_emu_tap(port: u16, x: f64, y: f64) -> Result<()> {
    let (x, y) = validate_point(x, y)?;
    post_json(port, "/api/tap", json!({ "x": x, "y": y })).await
}

pub async fn serve_emu_swipe(
    port: u16,
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    duration_ms: Option<u32>,
) -> Result<()> {
    let (x1, y1) = validate_point(x1, y1)?;
    let (x2, y2) = validate_point(x2, y2)?;
    let mut body = json!({
        "x1": x1,
        "y1": y1,
        "x2": x2,
        "y2": y2,
    });
    if let Some(ms) = duration_ms {
        body["durationMs"] = json!(ms.min(SWIPE_DURATION_CAP_MS));
    }
    post_json(port, "/api/swipe", body).await
}

pub async fn serve_emu_text(port: u16, text: &str) -> Result<()> {
    post_json(port, "/api/text", json!({ "text": text })).await
}

pub async fn serve_emu_key(port: u16, key: &str) -> Result<()> {
    match key {
        "home" | "back" | "recents" => {}
        other => {
            return Err(EngineError::Processing(format!(
                "unsupported Android key '{other}' (expected home, back, or recents)"
            )));
        }
    }
    post_json(port, "/api/key", json!({ "key": key })).await
}

pub async fn serve_emu_screenshot(port: u16, dest: impl AsRef<Path>) -> Result<ScreenshotSize> {
    let url = loopback_url(port, "/api/screenshot");
    let client = emu_client()?;
    let response = client.get(&url).send().await.map_err(|e| {
        EngineError::Processing(format!("serve-emu screenshot request failed: {e}"))
    })?;
    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let bytes = response.bytes().await.map_err(|e| {
        EngineError::Processing(format!("serve-emu screenshot body read failed: {e}"))
    })?;
    if !status.is_success() {
        return Err(EngineError::Processing(format!(
            "serve-emu screenshot returned {status}: {}",
            String::from_utf8_lossy(&bytes)
        )));
    }
    let png = decode_screenshot_body(&bytes, &content_type)?;
    write_png(dest, &png)
}

fn loopback_url(port: u16, path: &str) -> String {
    format!("http://127.0.0.1:{port}{path}")
}

fn emu_client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(HTTP_TIMEOUT)
        .connect_timeout(CONNECT_TIMEOUT)
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.url().host_str() == Some("127.0.0.1") {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|e| EngineError::Processing(format!("failed to build serve-emu HTTP client: {e}")))
}

async fn post_json(port: u16, path: &str, body: Value) -> Result<()> {
    let url = loopback_url(port, path);
    let client = emu_client()?;
    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| EngineError::Processing(format!("serve-emu {path} failed: {e}")))?;
    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(EngineError::Processing(format!(
            "serve-emu {path} returned {status}: {text}"
        )));
    }
    Ok(())
}

fn decode_screenshot_body(bytes: &[u8], content_type: &str) -> Result<Vec<u8>> {
    if bytes.starts_with(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Ok(bytes.to_vec());
    }
    let looks_json = content_type.contains("json")
        || bytes
            .first()
            .copied()
            .is_some_and(|b| b == b'{' || b == b'[');
    if !looks_json {
        return Err(EngineError::Processing(format!(
            "serve-emu screenshot is not image/png (content-type {content_type})"
        )));
    }
    let value: Value = serde_json::from_slice(bytes).map_err(|e| {
        EngineError::Processing(format!("serve-emu screenshot JSON was invalid: {e}"))
    })?;
    let data = value.get("data").and_then(Value::as_str).ok_or_else(|| {
        EngineError::Processing("serve-emu screenshot JSON is missing a base64 data field".into())
    })?;
    base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| {
            EngineError::Processing(format!("serve-emu screenshot base64 decode failed: {e}"))
        })
}

#[cfg(test)]
mod tests {
    use super::super::screenshot::TINY_PNG;
    use super::*;
    use std::fs;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::{Arc, Mutex};
    use std::thread;

    struct CapturedRequest {
        method: String,
        path: String,
        host: Option<String>,
        body: Vec<u8>,
    }

    fn spawn_fake_http(
        respond: impl Fn(&CapturedRequest) -> (u16, &'static str, Vec<u8>) + Send + 'static,
    ) -> (u16, Arc<Mutex<Vec<CapturedRequest>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind fake serve-emu");
        let port = listener.local_addr().expect("local addr").port();
        let captured = Arc::new(Mutex::new(Vec::new()));
        let captured_thread = captured.clone();
        thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(stream) = stream else { continue };
                let Ok(clone) = stream.try_clone() else {
                    continue;
                };
                if let Ok(req) = read_http_request(clone) {
                    let (status, content_type, body) = respond(&req);
                    captured_thread.lock().expect("capture lock").push(req);
                    let _ = write_http_response(stream, status, content_type, &body);
                }
            }
        });
        (port, captured)
    }

    fn read_http_request(stream: TcpStream) -> std::io::Result<CapturedRequest> {
        stream.set_read_timeout(Some(Duration::from_secs(2)))?;
        let mut reader = BufReader::new(stream);
        let mut request_line = String::new();
        reader.read_line(&mut request_line)?;
        let mut parts = request_line.split_whitespace();
        let method = parts.next().unwrap_or("").to_string();
        let path = parts.next().unwrap_or("").to_string();
        let mut host = None;
        let mut content_length = 0usize;
        loop {
            let mut line = String::new();
            reader.read_line(&mut line)?;
            if line == "\r\n" || line == "\n" || line.is_empty() {
                break;
            }
            let Some((name, value)) = line.split_once(':') else {
                continue;
            };
            let name = name.trim();
            let value = value.trim().trim_end_matches(['\r', '\n']);
            if name.eq_ignore_ascii_case("content-length") {
                content_length = value.parse().unwrap_or(0);
            } else if name.eq_ignore_ascii_case("host") {
                host = Some(value.to_string());
            }
        }
        let mut body = vec![0u8; content_length];
        if content_length > 0 {
            reader.read_exact(&mut body)?;
        }
        Ok(CapturedRequest {
            method,
            path,
            host,
            body,
        })
    }

    fn write_http_response(
        mut stream: TcpStream,
        status: u16,
        content_type: &str,
        body: &[u8],
    ) -> std::io::Result<()> {
        let reason = if status == 200 { "OK" } else { "Error" };
        let header = format!(
            "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        stream.write_all(header.as_bytes())?;
        stream.write_all(body)?;
        stream.flush()
    }

    fn ok_json(_req: &CapturedRequest) -> (u16, &'static str, Vec<u8>) {
        (200, "application/json", br#"{"ok":true}"#.to_vec())
    }

    #[tokio::test]
    async fn tap_posts_xy_on_loopback() {
        let (port, captured) = spawn_fake_http(ok_json);
        serve_emu_tap(port, 0.5, 0.5).await.unwrap();
        let captured = captured.lock().unwrap();
        assert_eq!(captured.len(), 1);
        assert_eq!(captured[0].method, "POST");
        assert_eq!(captured[0].path, "/api/tap");
        assert!(
            captured[0]
                .host
                .as_deref()
                .unwrap_or("")
                .starts_with("127.0.0.1"),
            "{:?}",
            captured[0].host
        );
        let body: Value = serde_json::from_slice(&captured[0].body).unwrap();
        assert_eq!(body["x"], 0.5);
        assert_eq!(body["y"], 0.5);
    }

    #[tokio::test]
    async fn swipe_posts_four_coords_and_duration_ms() {
        let (port, captured) = spawn_fake_http(ok_json);
        serve_emu_swipe(port, 0.1, 0.9, 0.8, 0.2, Some(350))
            .await
            .unwrap();
        let captured = captured.lock().unwrap();
        assert_eq!(captured[0].path, "/api/swipe");
        let body: Value = serde_json::from_slice(&captured[0].body).unwrap();
        assert_eq!(body["x1"], 0.1);
        assert_eq!(body["y1"], 0.9);
        assert_eq!(body["x2"], 0.8);
        assert_eq!(body["y2"], 0.2);
        assert_eq!(body["durationMs"], 350);
    }

    #[tokio::test]
    async fn text_and_key_post_expected_bodies() {
        let (port, captured) = spawn_fake_http(ok_json);
        serve_emu_text(port, "hello").await.unwrap();
        serve_emu_key(port, "back").await.unwrap();
        let captured = captured.lock().unwrap();
        assert_eq!(captured[0].path, "/api/text");
        let text: Value = serde_json::from_slice(&captured[0].body).unwrap();
        assert_eq!(text["text"], "hello");
        assert_eq!(captured[1].path, "/api/key");
        let key: Value = serde_json::from_slice(&captured[1].body).unwrap();
        assert_eq!(key["key"], "back");
    }

    #[tokio::test]
    async fn screenshot_writes_png_from_binary_body() {
        let (port, captured) = spawn_fake_http(|_req| (200, "image/png", TINY_PNG.to_vec()));
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("emu.png");
        let size = serve_emu_screenshot(port, &dest).await.unwrap();
        assert_eq!(size.width, 1);
        assert_eq!(size.height, 1);
        assert_eq!(fs::read(&dest).unwrap(), TINY_PNG);
        let captured = captured.lock().unwrap();
        assert_eq!(captured[0].method, "GET");
        assert_eq!(captured[0].path, "/api/screenshot");
    }

    #[tokio::test]
    async fn screenshot_decodes_json_base64_once() {
        use base64::Engine as _;
        let encoded = base64::engine::general_purpose::STANDARD.encode(TINY_PNG);
        let json_body = json!({
            "ok": true,
            "mimeType": "image/png",
            "data": encoded,
        });
        let (port, _) = spawn_fake_http(move |_req| {
            (200, "application/json", json_body.to_string().into_bytes())
        });
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("emu.png");
        let size = serve_emu_screenshot(port, &dest).await.unwrap();
        assert_eq!(size.width, 1);
        assert_eq!(fs::read(&dest).unwrap(), TINY_PNG);
    }

    #[tokio::test]
    async fn tap_rejects_coords_without_http() {
        let (port, captured) = spawn_fake_http(ok_json);
        let err = serve_emu_tap(port, 1.5, 0.5).await.unwrap_err().to_string();
        assert!(err.contains("invalid coords"), "{err}");
        assert!(captured.lock().unwrap().is_empty());
    }
}
