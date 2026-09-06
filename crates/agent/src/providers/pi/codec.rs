//! Pi RPC JSONL framing. Split on `\n` only; strip a trailing `\r`. Not JSON-RPC.

use serde_json::Value;

pub fn encode_line(value: &Value) -> Result<Vec<u8>, serde_json::Error> {
    let mut bytes = serde_json::to_vec(value)?;
    bytes.push(b'\n');
    Ok(bytes)
}

pub fn trim_record(line: &[u8]) -> Option<&[u8]> {
    let mut end = line.len();
    if end > 0 && line[end - 1] == b'\n' {
        end -= 1;
    }
    if end > 0 && line[end - 1] == b'\r' {
        end -= 1;
    }
    let record = &line[..end];
    if record.is_empty() {
        None
    } else {
        Some(record)
    }
}

/// Complete records from a buffer that uses LF as the only delimiter.
#[cfg(test)]
pub fn split_complete_records(bytes: &[u8]) -> Vec<&[u8]> {
    let mut records = Vec::new();
    let mut start = 0usize;
    for (i, byte) in bytes.iter().enumerate() {
        if *byte != b'\n' {
            continue;
        }
        if let Some(record) = trim_record(&bytes[start..=i]) {
            records.push(record);
        }
        start = i + 1;
    }
    records
}

#[cfg(test)]
pub fn parse_record(record: &[u8]) -> Option<Value> {
    serde_json::from_slice(record).ok()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameClass {
    Response,
    Event,
}

/// `extension_ui_request` is an event even when it carries `id`.
pub fn classify_frame(value: &Value) -> FrameClass {
    match value.get("type").and_then(Value::as_str) {
        Some("response") => FrameClass::Response,
        _ => FrameClass::Event,
    }
}

#[cfg(test)]
pub fn parse_jsonl(text: &str) -> Vec<Value> {
    split_complete_records(text.as_bytes())
        .into_iter()
        .filter_map(parse_record)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_line_is_compact_json_plus_lf() {
        let value = serde_json::json!({"id":"pi-rpc-1","type":"prompt","message":"Hello"});
        let bytes = encode_line(&value).expect("encode");
        assert_eq!(*bytes.last().unwrap(), b'\n');
        assert_eq!(bytes.iter().filter(|b| **b == b'\n').count(), 1);
        let parsed: Value = serde_json::from_slice(&bytes[..bytes.len() - 1]).unwrap();
        assert!(parsed.get("jsonrpc").is_none());
        assert!(parsed.get("method").is_none());
        assert_eq!(parsed["type"], "prompt");
    }

    #[test]
    fn trim_record_strips_crlf_and_skips_empty() {
        assert_eq!(trim_record(b"\n"), None);
        assert_eq!(trim_record(b"\r\n"), None);
        assert_eq!(trim_record(b"{\"a\":1}\r\n"), Some(&b"{\"a\":1}"[..]));
        assert_eq!(trim_record(b"{\"a\":1}\n"), Some(&b"{\"a\":1}"[..]));
    }

    #[test]
    fn framing_lf_keeps_u2028_inside_one_record() {
        let raw = include_str!("testdata/framing-lf.jsonl");
        assert!(
            raw.contains('\u{2028}'),
            "fixture must contain raw U+2028, not only an escape"
        );
        let records = split_complete_records(raw.as_bytes());
        assert_eq!(records.len(), 3);
        let delta: Value = serde_json::from_slice(records[1]).expect("one json value");
        let text = delta["assistantMessageEvent"]["delta"].as_str().unwrap();
        assert!(text.contains('\u{2028}'));
        assert_eq!(delta["type"], "message_update");
        assert_eq!(
            classify_frame(&parse_record(records[0]).unwrap()),
            FrameClass::Response
        );
        assert_eq!(classify_frame(&delta), FrameClass::Event);
    }

    #[test]
    fn jsonrpc_object_is_not_a_response_frame() {
        let jsonrpc = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "session/prompt",
            "id": 1,
            "params": {}
        });
        assert_eq!(classify_frame(&jsonrpc), FrameClass::Event);
        assert_ne!(
            jsonrpc.get("type").and_then(Value::as_str),
            Some("response")
        );
    }

    #[test]
    fn extension_ui_request_is_event_even_with_id() {
        let request = serde_json::json!({
            "type": "extension_ui_request",
            "id": "uuid-2",
            "method": "confirm",
            "title": "Allow bash?",
            "message": "ls -la"
        });
        assert_eq!(classify_frame(&request), FrameClass::Event);
    }
}
