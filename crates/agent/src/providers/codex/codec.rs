//! Codex app-server JSON-RPC lite codec (S23).
//!
//! Live `codex-cli 0.144.5` / `0.150.0-alpha.12.2` omit `"jsonrpc":"2.0"` on
//! both stdin and stdout. Writes omit the key. Inbound extra `jsonrpc` and
//! 0.150 `emittedAtMs` are ignored.

use serde_json::{Map, Value};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum RpcId {
    Number(i64),
    String(String),
}

impl RpcId {
    pub fn from_value(value: &Value) -> Option<Self> {
        match value {
            Value::Number(number) => {
                if let Some(i) = number.as_i64() {
                    Some(Self::Number(i))
                } else {
                    Some(Self::String(number.to_string()))
                }
            }
            Value::String(text) => Some(Self::String(text.clone())),
            _ => None,
        }
    }

    pub fn to_value(&self) -> Value {
        match self {
            Self::Number(n) => Value::Number((*n).into()),
            Self::String(s) => Value::String(s.clone()),
        }
    }

    pub fn key(&self) -> String {
        match self {
            Self::Number(n) => n.to_string(),
            Self::String(s) => s.clone(),
        }
    }
}

#[derive(Debug, Clone)]
pub enum InboundFrame {
    Response {
        id: RpcId,
        result: Option<Value>,
        error: Option<Value>,
    },
    ServerRequest {
        id: RpcId,
        method: String,
        params: Value,
    },
    Notification {
        method: String,
        params: Value,
    },
    Malformed(Value),
}

pub fn parse_line(line: &str) -> Result<Value, serde_json::Error> {
    serde_json::from_str(line.trim())
}

pub fn classify(value: &Value) -> InboundFrame {
    let Some(object) = value.as_object() else {
        return InboundFrame::Malformed(value.clone());
    };
    let id = object.get("id").and_then(RpcId::from_value);
    let method = object
        .get("method")
        .and_then(Value::as_str)
        .map(str::to_string);
    let params = object.get("params").cloned().unwrap_or(Value::Null);
    let has_result = object.contains_key("result");
    let has_error = object.contains_key("error");

    match (id, method) {
        (Some(id), Some(method)) => InboundFrame::ServerRequest { id, method, params },
        (Some(id), None) if has_result || has_error => InboundFrame::Response {
            id,
            result: object.get("result").cloned(),
            error: object.get("error").cloned(),
        },
        (None, Some(method)) => InboundFrame::Notification { method, params },
        _ => InboundFrame::Malformed(value.clone()),
    }
}

pub fn encode_request(id: &RpcId, method: &str, params: Value) -> String {
    let mut object = Map::new();
    object.insert("method".into(), Value::String(method.to_string()));
    object.insert("id".into(), id.to_value());
    object.insert("params".into(), params);
    finish_line(object)
}

pub fn encode_notification(method: &str, params: Value) -> String {
    let mut object = Map::new();
    object.insert("method".into(), Value::String(method.to_string()));
    object.insert("params".into(), params);
    finish_line(object)
}

pub fn encode_result(id: &RpcId, result: Value) -> String {
    let mut object = Map::new();
    object.insert("id".into(), id.to_value());
    object.insert("result".into(), result);
    finish_line(object)
}

pub fn encode_error(id: &RpcId, code: i64, message: &str) -> String {
    let mut object = Map::new();
    object.insert("id".into(), id.to_value());
    object.insert(
        "error".into(),
        serde_json::json!({ "code": code, "message": message }),
    );
    finish_line(object)
}

fn finish_line(object: Map<String, Value>) -> String {
    let mut line = serde_json::to_string(&Value::Object(object)).expect("json");
    debug_assert!(
        !line.contains("\"jsonrpc\""),
        "encoder must never emit jsonrpc"
    );
    line.push('\n');
    line
}

pub const METHOD_NOT_FOUND: i64 = -32601;

#[cfg(test)]
mod tests {
    use super::*;

    fn load_framing() -> Vec<Value> {
        include_str!("testdata/framing-no-jsonrpc.jsonl")
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| serde_json::from_str(line).expect("fixture json"))
            .collect()
    }

    #[test]
    fn classify_splits_notification_response_and_server_request() {
        let frames = load_framing();
        assert!(matches!(
            classify(&frames[0]),
            InboundFrame::Notification { ref method, .. } if method == "turn/started"
        ));
        assert!(matches!(
            classify(&frames[1]),
            InboundFrame::Response { ref id, .. } if id.key() == "0"
        ));
        match classify(&frames[2]) {
            InboundFrame::ServerRequest { id, method, .. } => {
                assert_eq!(id.key(), "61");
                assert_eq!(method, "item/commandExecution/requestApproval");
            }
            other => panic!("expected server request, got {other:?}"),
        }
    }

    #[test]
    fn classify_is_tolerant_of_inbound_jsonrpc() {
        let frames = load_framing();
        assert!(matches!(
            classify(&frames[3]),
            InboundFrame::Response { ref id, .. } if id.key() == "1"
        ));
        assert!(matches!(
            classify(&frames[4]),
            InboundFrame::Notification { ref method, .. } if method == "turn/started"
        ));
        assert!(matches!(classify(&frames[5]), InboundFrame::Malformed(_)));
    }

    #[test]
    fn encoder_omits_jsonrpc_key() {
        let request = encode_request(
            &RpcId::Number(0),
            "initialize",
            serde_json::json!({"clientInfo":{"name":"atmos"}}),
        );
        let notification = encode_notification("initialized", serde_json::json!({}));
        let result = encode_result(&RpcId::Number(61), serde_json::json!({"decision":"accept"}));
        let error = encode_error(&RpcId::Number(60), METHOD_NOT_FOUND, "Method not found");
        assert_eq!(result.trim(), r#"{"id":61,"result":{"decision":"accept"}}"#);
        for line in [request, notification, result, error] {
            let value: Value = serde_json::from_str(line.trim()).expect("line");
            assert!(
                value.get("jsonrpc").is_none(),
                "encoder snapshot must not contain jsonrpc: {line}"
            );
        }
    }

    #[test]
    fn id_stringify_preserves_number_on_the_wire() {
        let id = RpcId::from_value(&serde_json::json!(61)).expect("id");
        assert_eq!(id.key(), "61");
        assert_eq!(id.to_value(), serde_json::json!(61));
        let text = RpcId::from_value(&serde_json::json!("req-1")).expect("id");
        assert_eq!(text.key(), "req-1");
    }
}
