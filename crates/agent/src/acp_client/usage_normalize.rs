//! Coerce Claude ACP `usage_update` null/missing counters before the SDK schema
//! parser sees them. Upstream `agent-client-protocol-schema` 1.5+ still requires
//! `used`/`size: u64`; vendoring the schema crate for two fields is no longer
//! needed once this runs on the stdio JSON-RPC stream.

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader};

pub fn normalize_acp_json_line(line: &str) -> String {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return line.to_string();
    }
    let Ok(mut value) = serde_json::from_str::<Value>(trimmed) else {
        return line.to_string();
    };
    coerce_usage_update(&mut value);
    serde_json::to_string(&value).unwrap_or_else(|_| line.to_string())
}

fn coerce_usage_update(value: &mut Value) {
    let method = value.get("method").and_then(Value::as_str);
    if method != Some("session/update") {
        return;
    }
    let Some(update) = value
        .get_mut("params")
        .and_then(Value::as_object_mut)
        .and_then(|params| params.get_mut("update"))
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    if update.get("sessionUpdate").and_then(Value::as_str) != Some("usage_update") {
        return;
    }
    if update.get("used").is_none_or(Value::is_null) {
        update.insert("used".into(), json!(0));
    }
    if update.get("size").is_none_or(Value::is_null) {
        update.insert("size".into(), json!(0));
    }
}

pub fn spawn_usage_normalizer(
    stdout: impl AsyncRead + Unpin + Send + 'static,
) -> impl AsyncRead + Unpin {
    let (client, mut server) = tokio::io::duplex(64 * 1024);
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let out = normalize_acp_json_line(&line);
            if server.write_all(out.as_bytes()).await.is_err() {
                break;
            }
            if server.write_all(b"\n").await.is_err() {
                break;
            }
        }
    });
    client
}

#[cfg(test)]
mod tests {
    use super::normalize_acp_json_line;
    use serde_json::json;

    #[test]
    fn coerces_null_usage_counters() {
        let line = r#"{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"usage_update","used":null,"size":null}}}"#;
        let value: serde_json::Value =
            serde_json::from_str(&normalize_acp_json_line(line)).unwrap();
        assert_eq!(value["params"]["update"]["used"], json!(0));
        assert_eq!(value["params"]["update"]["size"], json!(0));
    }

    #[test]
    fn coerces_missing_usage_counters() {
        let line = r#"{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"usage_update"}}}"#;
        let value: serde_json::Value =
            serde_json::from_str(&normalize_acp_json_line(line)).unwrap();
        assert_eq!(value["params"]["update"]["used"], json!(0));
        assert_eq!(value["params"]["update"]["size"], json!(0));
    }

    #[test]
    fn leaves_other_notifications_alone() {
        let line = r#"{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"hi"}}}}"#;
        let normalized = normalize_acp_json_line(line);
        let value: serde_json::Value = serde_json::from_str(&normalized).unwrap();
        assert_eq!(value["params"]["update"]["content"]["text"], json!("hi"));
        assert!(value["params"]["update"].get("used").is_none());
    }
}
