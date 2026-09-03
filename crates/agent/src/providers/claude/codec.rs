//! NDJSON framing for Claude Code Chat (split on `\n` only; no 64KiB scan cap).

use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ClaudeFrameKind {
    System,
    Assistant,
    User,
    StreamEvent,
    Result,
    ControlRequest,
    ControlResponse,
    RateLimitEvent,
    ToolProgress,
    KeepAlive,
    CommandLifecycle,
    Unknown(String),
}

pub(crate) fn frame_kind(value: &Value) -> ClaudeFrameKind {
    match value.get("type").and_then(Value::as_str).unwrap_or("") {
        "system" => ClaudeFrameKind::System,
        "assistant" => ClaudeFrameKind::Assistant,
        "user" => ClaudeFrameKind::User,
        "stream_event" => ClaudeFrameKind::StreamEvent,
        "result" => ClaudeFrameKind::Result,
        "control_request" => ClaudeFrameKind::ControlRequest,
        "control_response" => ClaudeFrameKind::ControlResponse,
        "rate_limit_event" => ClaudeFrameKind::RateLimitEvent,
        "tool_progress" => ClaudeFrameKind::ToolProgress,
        "keep_alive" => ClaudeFrameKind::KeepAlive,
        "command_lifecycle" => ClaudeFrameKind::CommandLifecycle,
        other => ClaudeFrameKind::Unknown(other.to_string()),
    }
}

pub(crate) fn encode_line(value: &Value) -> Result<Vec<u8>, serde_json::Error> {
    let mut bytes = serde_json::to_vec(value)?;
    bytes.push(b'\n');
    Ok(bytes)
}

/// Split complete NDJSON lines on `\n` only. Remainder stays in `buffer`.
#[cfg(test)]
pub(crate) fn split_ndjson(buffer: &mut Vec<u8>) -> Vec<Vec<u8>> {
    let mut lines = Vec::new();
    while let Some(idx) = buffer.iter().position(|byte| *byte == b'\n') {
        let mut line: Vec<u8> = buffer.drain(..=idx).collect();
        line.pop();
        if !line.is_empty() {
            lines.push(line);
        }
    }
    lines
}

pub(crate) fn parse_line(line: &[u8]) -> Option<Value> {
    serde_json::from_slice(line).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn testdata(name: &str) -> std::path::PathBuf {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("src/providers/claude/testdata")
            .join(name)
    }

    fn load_jsonl(name: &str) -> Vec<Value> {
        let text = std::fs::read_to_string(testdata(name)).expect("fixture");
        text.lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| serde_json::from_str(line).expect("jsonl line"))
            .collect()
    }

    #[test]
    fn split_ndjson_uses_newline_only_without_scan_cap() {
        let mut buffer = Vec::new();
        buffer.extend_from_slice(&[b'x'; 70_000]);
        buffer.push(b'\n');
        buffer.extend_from_slice(br#"{"type":"keep_alive"}"#);
        buffer.push(b'\n');
        buffer.extend_from_slice(b"partial");
        let lines = split_ndjson(&mut buffer);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].len(), 70_000);
        assert_eq!(buffer.as_slice(), b"partial");
    }

    #[test]
    fn mixed_control_interleaves_control_between_stream_and_assistant() {
        let frames = load_jsonl("mixed_control.jsonl");
        let kinds: Vec<ClaudeFrameKind> = frames.iter().map(frame_kind).collect();
        let stream = kinds
            .iter()
            .position(|kind| *kind == ClaudeFrameKind::StreamEvent)
            .expect("stream");
        let control = kinds
            .iter()
            .position(|kind| *kind == ClaudeFrameKind::ControlRequest)
            .expect("control");
        let assistant = kinds
            .iter()
            .position(|kind| *kind == ClaudeFrameKind::Assistant)
            .expect("assistant");
        assert!(stream < control);
        assert!(control < assistant);
        assert!(kinds.contains(&ClaudeFrameKind::Unknown("not_a_real_frame".into())));
        assert!(kinds.iter().any(|kind| matches!(
            kind,
            ClaudeFrameKind::ControlResponse
                | ClaudeFrameKind::KeepAlive
                | ClaudeFrameKind::RateLimitEvent
                | ClaudeFrameKind::ToolProgress
                | ClaudeFrameKind::CommandLifecycle
        )));
        for frame in &frames {
            let _ = encode_line(frame).expect("re-encode");
        }
    }

    #[test]
    fn parse_line_skips_invalid_json_without_panic() {
        assert!(parse_line(b"not-json").is_none());
        assert!(parse_line(br#"{"type":"keep_alive"}"#).is_some());
    }

    #[test]
    fn command_lifecycle_is_a_known_omit_kind() {
        let frame = serde_json::json!({
            "type": "command_lifecycle",
            "command_uuid": "uu-user-1",
            "state": "queued"
        });
        assert_eq!(frame_kind(&frame), ClaudeFrameKind::CommandLifecycle);
    }
}
