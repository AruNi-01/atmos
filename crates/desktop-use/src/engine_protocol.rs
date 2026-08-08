//! Pure parse/map units for the pinned control-engine wire protocol (0.19.2).
//!
//! No process spawn here — unit tests lock real response shapes via fixtures.

use std::path::Path;

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde_json::Value;

use crate::strings::scrub_vendor;

/// Detect engine JSON that is a soft failure (exit 0 but refused / invalid).
/// Used so drive/browser-use surfaces `ok: false` instead of trusting bare success.
pub fn engine_payload_is_failure(v: &Value) -> Option<String> {
    if let Some(status) = v.get("status").and_then(|s| s.as_str()) {
        let s = status.to_ascii_lowercase();
        if s == "refused" || s == "error" || s == "failed" {
            let detail = v
                .get("message")
                .or_else(|| v.get("detail"))
                .or_else(|| v.pointer("/refusal/message"))
                .and_then(|x| x.as_str())
                .unwrap_or(status);
            return Some(detail.to_string());
        }
    }
    if v.get("refusal").is_some() {
        let detail = v
            .pointer("/refusal/message")
            .or_else(|| v.pointer("/refusal/code"))
            .and_then(|x| x.as_str())
            .unwrap_or("refused");
        return Some(detail.to_string());
    }
    // Engine soft-fail payloads often use a top-level `code` string
    // (invalid_arguments, window_scope_disabled, …) without non-zero exit.
    if let Some(code) = v.get("code").and_then(|s| s.as_str()) {
        let c = code.to_ascii_lowercase();
        if c != "ok" && c != "success" {
            let detail = v
                .get("detail")
                .or_else(|| v.get("message"))
                .and_then(|x| x.as_str())
                .unwrap_or(code);
            return Some(format!("{code}: {detail}"));
        }
    }
    None
}

/// Parse `call` CLI stdout/stderr into JSON.
///
/// Rules (locked against 0.19.x live probe; shapes stable since 0.17 fixtures):
/// - non-zero exit → Err
/// - empty stdout on success → `{"ok": true}` (tools with no payload)
/// - non-JSON stdout → **Err** (never wrap as `Ok({ok:true, raw})` — TCC/screencapture
///   failures return exit 0 + plain text)
pub fn parse_call_tool_output(success: bool, stdout: &str, stderr: &str) -> Result<Value, String> {
    let stdout = stdout.trim();
    let stderr = stderr.trim();

    if !success {
        let msg = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "control engine call failed"
        };
        return Err(scrub_vendor(msg));
    }

    if stdout.is_empty() {
        return Ok(serde_json::json!({ "ok": true }));
    }

    match serde_json::from_str::<Value>(stdout) {
        Ok(v) => Ok(v),
        Err(_) => {
            // Exit 0 + plain text is a real engine failure mode (e.g. screencapture TCC).
            let msg = if !stderr.is_empty() {
                format!("{stdout} ({stderr})")
            } else {
                stdout.to_string()
            };
            Err(scrub_vendor(&msg))
        }
    }
}

/// Extract PNG bytes from a real engine payload and/or a file written by
/// `--screenshot-out-file` / tool arg `screenshot_out_file`.
///
/// Accepted shapes only:
/// 1. Non-empty file at `screenshot_out_file` (CLI flag path)
/// 2. `screenshot_file_path` (string path on disk)
/// 3. MCP `content[]` image block with base64 `data` (+ optional `mimeType`)
/// 4. Nested under `structuredContent` / `result` for the same fields
///
/// Phantom keys (`screenshot_base64`, `png_base64`) are **not** primary engine
/// contract — they may appear only after Atmos normalizes the drive result.
pub fn extract_screenshot_png(
    value: &Value,
    screenshot_out_file: Option<&Path>,
) -> Result<Vec<u8>, String> {
    if let Some(path) = screenshot_out_file {
        if let Ok(bytes) = std::fs::read(path) {
            if looks_like_image(&bytes) {
                return Ok(bytes);
            }
        }
    }

    if let Some(path) = find_string_field(value, &["screenshot_file_path", "screenshot_path"]) {
        let p = Path::new(&path);
        if let Ok(bytes) = std::fs::read(p) {
            if looks_like_image(&bytes) {
                return Ok(bytes);
            }
        }
        return Err(scrub_vendor(&format!(
            "screenshot file missing or unreadable: {path}"
        )));
    }

    if let Some(b64) = find_mcp_image_base64(value) {
        return decode_image_b64(&b64);
    }

    Err(scrub_vendor(
        "control engine returned no screenshot image (expected --screenshot-out-file bytes, screenshot_file_path, or MCP image content)",
    ))
}

/// Encode PNG bytes as standard base64 (for Atmos-normalized CLI/JSON).
pub fn encode_png_base64(bytes: &[u8]) -> String {
    B64.encode(bytes)
}

fn looks_like_image(bytes: &[u8]) -> bool {
    if bytes.len() < 8 {
        return false;
    }
    // PNG magic — primary contract for get_desktop_state / window screenshots.
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n']) {
        return true;
    }
    // JPEG (zoom / some engine paths)
    if bytes[0] == 0xff && bytes[1] == 0xd8 {
        return true;
    }
    // Reject plain-text / empty TCC failure blobs that are only "long enough".
    false
}

fn decode_image_b64(s: &str) -> Result<Vec<u8>, String> {
    let trimmed = s.trim();
    // Strip data-URL prefix if present
    let payload = trimmed
        .split_once("base64,")
        .map(|(_, b)| b)
        .unwrap_or(trimmed);
    B64.decode(payload)
        .map_err(|e| scrub_vendor(&format!("screenshot base64 decode failed: {e}")))
        .and_then(|bytes| {
            if looks_like_image(&bytes) {
                Ok(bytes)
            } else {
                Err(scrub_vendor("decoded screenshot is not a valid image"))
            }
        })
}

fn find_string_field(value: &Value, keys: &[&str]) -> Option<String> {
    for node in walk_objects(value) {
        if let Some(obj) = node.as_object() {
            for k in keys {
                if let Some(Value::String(s)) = obj.get(*k) {
                    if !s.is_empty() {
                        return Some(s.clone());
                    }
                }
            }
        }
    }
    None
}

fn find_mcp_image_base64(value: &Value) -> Option<String> {
    for node in walk_objects(value) {
        if let Some(arr) = node
            .get("content")
            .and_then(|c| c.as_array())
            .or_else(|| node.as_array())
        {
            for item in arr {
                let ty = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
                if ty == "image" || ty == "image_url" {
                    if let Some(data) = item.get("data").and_then(|d| d.as_str()) {
                        if data.len() > 16 {
                            return Some(data.to_string());
                        }
                    }
                    // nested source
                    if let Some(data) = item
                        .pointer("/source/data")
                        .or_else(|| item.pointer("/image/data"))
                        .and_then(|d| d.as_str())
                    {
                        if data.len() > 16 {
                            return Some(data.to_string());
                        }
                    }
                }
            }
        }
    }
    None
}

/// Depth-limited object walk (root + common wrappers).
fn walk_objects(value: &Value) -> Vec<&Value> {
    let mut out = vec![value];
    if let Some(obj) = value.as_object() {
        for key in ["structuredContent", "result", "data", "output"] {
            if let Some(child) = obj.get(key) {
                out.push(child);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn soft_failure_invalid_arguments() {
        let v = json!({
            "code": "invalid_arguments",
            "detail": "unknown field `content_kind`",
            "tool": "clipboard_write"
        });
        let msg = engine_payload_is_failure(&v).expect("should fail");
        assert!(msg.contains("invalid_arguments"));
        assert!(msg.contains("content_kind"));
    }

    #[test]
    fn soft_failure_refused_status() {
        let v = json!({
            "status": "refused",
            "message": "requires exact target_id"
        });
        assert_eq!(
            engine_payload_is_failure(&v).as_deref(),
            Some("requires exact target_id")
        );
    }

    #[test]
    fn success_payload_not_failure() {
        let v = json!({ "width": 1512, "height": 982 });
        assert!(engine_payload_is_failure(&v).is_none());
    }

    fn fixture_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/engine_0_19_2")
    }

    fn load_text(name: &str) -> String {
        fs::read_to_string(fixture_dir().join(name)).expect(name)
    }

    fn load_json(name: &str) -> Value {
        serde_json::from_str(&load_text(name)).expect(name)
    }

    #[test]
    fn parse_exit0_plain_text_is_error_not_ok_raw() {
        let text = load_text("get_desktop_state_fail_plain_text.txt");
        let err = parse_call_tool_output(true, &text, "").unwrap_err();
        assert!(
            err.to_lowercase().contains("screenshot")
                || err.to_lowercase().contains("screencapture"),
            "unexpected err: {err}"
        );
        assert!(!err.contains("\"ok\":true"));
        // Must not invent success envelope
        assert!(!err.contains("raw"));
    }

    #[test]
    fn parse_nonzero_exit_is_error() {
        let err = parse_call_tool_output(false, "", "daemon down").unwrap_err();
        assert!(err.contains("daemon down"));
    }

    #[test]
    fn parse_empty_success_ok() {
        let v = parse_call_tool_output(true, "", "").unwrap();
        assert_eq!(v["ok"], true);
    }

    #[test]
    fn parse_json_success() {
        let v = parse_call_tool_output(true, r#"{"windows":[]}"#, "").unwrap();
        assert!(v.get("windows").is_some());
    }

    #[test]
    fn extract_from_mcp_image_fixture() {
        let v = load_json("get_desktop_state_success_mcp_image.json");
        let png = extract_screenshot_png(&v, None).unwrap();
        assert!(png.starts_with(&[0x89, b'P', b'N', b'G']));
        assert_eq!(png, fs::read(fixture_dir().join("tiny.png")).unwrap());
    }

    #[test]
    fn extract_from_screenshot_file_path_fixture() {
        let tiny = fixture_dir().join("tiny.png");
        let mut v = load_json("get_desktop_state_success_file_path.json");
        v["screenshot_file_path"] = json!(tiny.display().to_string());
        let png = extract_screenshot_png(&v, None).unwrap();
        assert!(png.starts_with(&[0x89, b'P', b'N', b'G']));
    }

    #[test]
    fn extract_prefers_screenshot_out_file_bytes() {
        let tiny = fixture_dir().join("tiny.png");
        // Even if JSON has no image fields, out file wins.
        let v = json!({"screen_width": 1});
        let png = extract_screenshot_png(&v, Some(&tiny)).unwrap();
        assert_eq!(png, fs::read(&tiny).unwrap());
    }

    #[test]
    fn extract_rejects_empty_payload() {
        let err = extract_screenshot_png(&json!({"screen_width": 1920}), None).unwrap_err();
        assert!(err.contains("no screenshot"), "{err}");
        // Phantom keys alone must not succeed without real image
        let err2 = extract_screenshot_png(
            &json!({"screenshot_base64": "not-real", "png_base64": "xx"}),
            None,
        )
        .unwrap_err();
        assert!(err2.contains("no screenshot"), "{err2}");
    }
}
