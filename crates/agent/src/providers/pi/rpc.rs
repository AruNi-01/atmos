//! Pending-id RPC over JSONL. Commands Chat actually writes; not JSON-RPC.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use serde_json::{json, Value};
use tokio::io::{AsyncWrite, AsyncWriteExt};
use tokio::sync::{oneshot, Mutex};
use tokio::time::timeout;

use crate::contract::{AgentProviderError, AgentResult};

use super::codec::{self, encode_line, FrameClass};

/// Live 0.84.2 cold `get_state` was ~7s (extension/skill load). Prompt accept stays short.
pub const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(20);
pub const ACCEPT_TIMEOUT: Duration = Duration::from_secs(5);

const NULL_DATA: Value = Value::Null;

#[derive(Debug, Clone)]
pub struct RpcResponse {
    pub id: Option<String>,
    pub command: String,
    pub success: bool,
    pub error: Option<String>,
    /// Pi omits `data` on prompt/steer/abort success. Keep `None` vs JSON `null`.
    pub data: Option<Value>,
}

impl RpcResponse {
    pub fn from_value(value: &Value) -> Self {
        Self {
            id: parse_rpc_id(value.get("id")),
            command: value
                .get("command")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            success: value
                .get("success")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            error: value
                .get("error")
                .and_then(Value::as_str)
                .map(str::to_string),
            data: value.get("data").cloned(),
        }
    }

    pub fn data(&self) -> &Value {
        self.data.as_ref().unwrap_or(&NULL_DATA)
    }

    pub fn require_ok(&self) -> AgentResult<&Self> {
        if self.success {
            Ok(self)
        } else {
            Err(AgentProviderError::message(
                self.error
                    .clone()
                    .unwrap_or_else(|| format!("{} failed", self.command)),
            ))
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct PiSnapshot {
    pub session_file: Option<String>,
    pub session_id: Option<String>,
    pub model_id: Option<String>,
    pub model_provider: Option<String>,
    pub model_name: Option<String>,
    pub thinking_level: Option<String>,
    pub is_streaming: bool,
}

pub fn parse_rpc_id(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(text)) if !text.is_empty() => Some(text.clone()),
        Some(Value::Number(number)) => Some(number.to_string()),
        _ => None,
    }
}

pub fn apply_get_state(snapshot: &mut PiSnapshot, data: &Value) {
    snapshot.session_file = data
        .get("sessionFile")
        .and_then(Value::as_str)
        .map(str::to_string);
    snapshot.session_id = data
        .get("sessionId")
        .and_then(Value::as_str)
        .map(str::to_string);
    snapshot.thinking_level = data
        .get("thinkingLevel")
        .and_then(Value::as_str)
        .map(str::to_string);
    snapshot.is_streaming = data
        .get("isStreaming")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let _ = data.get("steeringMode");
    let _ = data.get("followUpMode");
    let _ = data.get("pendingMessageCount");
    if let Some(model) = data.get("model") {
        snapshot.model_id = model.get("id").and_then(Value::as_str).map(str::to_string);
        snapshot.model_provider = model
            .get("provider")
            .and_then(Value::as_str)
            .map(str::to_string);
        snapshot.model_name = model
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string);
    }
}

struct PendingSlot {
    command: String,
    tx: oneshot::Sender<RpcResponse>,
}

pub struct PiTransport {
    writer: Mutex<Box<dyn AsyncWrite + Unpin + Send>>,
    pending: Mutex<HashMap<String, PendingSlot>>,
    order: Mutex<VecDeque<String>>,
    next_id: AtomicU64,
    pub is_streaming: AtomicBool,
    pub steered_this_turn: AtomicBool,
    pub snapshot: Mutex<PiSnapshot>,
}

impl PiTransport {
    pub fn new(writer: Box<dyn AsyncWrite + Unpin + Send>) -> Self {
        Self {
            writer: Mutex::new(writer),
            pending: Mutex::new(HashMap::new()),
            order: Mutex::new(VecDeque::new()),
            next_id: AtomicU64::new(1),
            is_streaming: AtomicBool::new(false),
            steered_this_turn: AtomicBool::new(false),
            snapshot: Mutex::new(PiSnapshot::default()),
        }
    }

    pub fn next_rpc_id(&self) -> String {
        let n = self.next_id.fetch_add(1, Ordering::Relaxed);
        format!("pi-rpc-{n}")
    }

    pub async fn write_value(&self, value: &Value) -> AgentResult<()> {
        let bytes = encode_line(value)
            .map_err(|error| AgentProviderError::message(format!("pi encode: {error}")))?;
        let mut writer = self.writer.lock().await;
        writer
            .write_all(&bytes)
            .await
            .map_err(|error| AgentProviderError::message(format!("pi stdin: {error}")))?;
        writer
            .flush()
            .await
            .map_err(|error| AgentProviderError::message(format!("pi stdin flush: {error}")))?;
        Ok(())
    }

    pub async fn shutdown_writer(&self) {
        let mut writer = self.writer.lock().await;
        let _ = writer.shutdown().await;
    }

    pub async fn call(&self, mut body: Value, wait: Duration) -> AgentResult<RpcResponse> {
        if is_forbidden_chat_command(&body) {
            return Err(AgentProviderError::message("forbidden pi command"));
        }
        let command = body
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let id = self.next_rpc_id();
        body["id"] = json!(id);
        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending.lock().await;
            pending.insert(id.clone(), PendingSlot { command, tx });
            self.order.lock().await.push_back(id.clone());
        }
        if let Err(error) = self.write_value(&body).await {
            self.take_pending(&id).await;
            return Err(error);
        }
        match timeout(wait, rx).await {
            Ok(Ok(response)) => Ok(response),
            Ok(Err(_)) => Err(AgentProviderError::message(format!("pi rpc {id} dropped"))),
            Err(_) => {
                self.take_pending(&id).await;
                Err(AgentProviderError::message(format!(
                    "pi rpc {id} timed out"
                )))
            }
        }
    }

    async fn take_pending(&self, id: &str) {
        self.pending.lock().await.remove(id);
        let mut order = self.order.lock().await;
        if let Some(index) = order.iter().position(|item| item == id) {
            order.remove(index);
        }
    }

    pub async fn complete_response(&self, value: &Value) -> bool {
        if codec::classify_frame(value) != FrameClass::Response {
            return false;
        }
        let response = RpcResponse::from_value(value);
        let slot = if let Some(id) = &response.id {
            self.pending.lock().await.remove(id)
        } else {
            let mut pending = self.pending.lock().await;
            let mut order = self.order.lock().await;
            let found = order
                .iter()
                .find(|id| {
                    pending
                        .get(*id)
                        .is_some_and(|slot| slot.command == response.command)
                })
                .cloned();
            found.and_then(|id| {
                order.retain(|item| item != &id);
                pending.remove(&id)
            })
        };
        if let Some(id) = &response.id {
            let mut order = self.order.lock().await;
            order.retain(|item| item != id);
        }
        match slot {
            Some(slot) => {
                let _ = slot.tx.send(response);
                true
            }
            None => false,
        }
    }
}

pub fn cmd_get_state() -> Value {
    json!({"type": "get_state"})
}

pub fn cmd_get_session_stats() -> Value {
    json!({"type": "get_session_stats"})
}

pub fn cmd_get_available_models() -> Value {
    json!({"type": "get_available_models"})
}

pub fn cmd_get_available_thinking_levels() -> Value {
    json!({"type": "get_available_thinking_levels"})
}

pub fn cmd_get_commands() -> Value {
    json!({"type": "get_commands"})
}

pub fn cmd_prompt(message: &str, images: &[Value]) -> Value {
    let mut body = json!({"type": "prompt", "message": message});
    if !images.is_empty() {
        body["images"] = Value::Array(images.to_vec());
    }
    body
}

pub fn cmd_steer(message: &str, images: &[Value]) -> Value {
    let mut body = json!({"type": "steer", "message": message});
    if !images.is_empty() {
        body["images"] = Value::Array(images.to_vec());
    }
    body
}

pub fn cmd_prompt_streaming_steer(message: &str, images: &[Value]) -> Value {
    let mut body = cmd_prompt(message, images);
    body["streamingBehavior"] = json!("steer");
    body
}

pub fn cmd_abort() -> Value {
    json!({"type": "abort"})
}

pub fn cmd_set_model(provider: &str, model_id: &str) -> Value {
    json!({"type": "set_model", "provider": provider, "modelId": model_id})
}

pub fn cmd_set_thinking_level(level: &str) -> Value {
    json!({"type": "set_thinking_level", "level": level})
}

pub fn cmd_switch_session(session_path: &str) -> Value {
    json!({"type": "switch_session", "sessionPath": session_path})
}

pub fn cmd_get_fork_messages() -> Value {
    json!({"type": "get_fork_messages"})
}

pub fn cmd_clone() -> Value {
    json!({"type": "clone"})
}

pub fn cmd_fork(entry_id: &str) -> Value {
    json!({"type": "fork", "entryId": entry_id})
}

pub fn parse_fork_messages(data: &Value) -> Vec<(String, String)> {
    let messages = data
        .get("messages")
        .or_else(|| data.get("data").and_then(|inner| inner.get("messages")))
        .and_then(Value::as_array);
    let Some(messages) = messages else {
        return Vec::new();
    };
    messages
        .iter()
        .filter_map(|item| {
            let id = item
                .get("entryId")
                .or_else(|| item.get("entry_id"))
                .or_else(|| item.get("id"))
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty())?;
            let name = item
                .get("text")
                .or_else(|| item.get("preview"))
                .or_else(|| item.get("content"))
                .or_else(|| item.get("message"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(|text| text.chars().take(80).collect::<String>())
                .unwrap_or_else(|| format!("Fork at {id}"));
            Some((id.to_string(), name))
        })
        .collect()
}

pub fn cmd_ui_confirmed(id: &str, confirmed: bool) -> Value {
    json!({"type": "extension_ui_response", "id": id, "confirmed": confirmed})
}

pub fn cmd_ui_value(id: &str, value: &str) -> Value {
    json!({"type": "extension_ui_response", "id": id, "value": value})
}

pub fn cmd_ui_cancelled(id: &str) -> Value {
    json!({"type": "extension_ui_response", "id": id, "cancelled": true})
}

pub fn is_forbidden_chat_command(value: &Value) -> bool {
    matches!(
        value.get("type").and_then(Value::as_str),
        Some(
            "compact"
                | "export_html"
                | "new_session"
                | "follow_up"
                | "cycle_model"
                | "cycle_thinking_level"
                | "get_messages"
                | "bash"
                | "abort_bash"
        )
    )
}

#[cfg(test)]
mod tests {
    use super::super::codec::encode_line;
    use super::*;

    #[test]
    fn prompt_and_steer_are_not_jsonrpc_and_not_follow_up() {
        let prompt = cmd_prompt("list files", &[]);
        let steer = cmd_steer("only src/", &[]);
        for body in [&prompt, &steer] {
            let bytes = encode_line(body).unwrap();
            let text = String::from_utf8(bytes).unwrap();
            assert!(!text.contains("jsonrpc"));
            assert!(!text.contains("\"method\""));
            assert!(!text.contains("follow_up"));
            assert!(!text.contains("\"bash\""));
            assert!(!is_forbidden_chat_command(body));
        }
        assert_eq!(steer["type"], "steer");
        assert!(cmd_prompt("hi", &[]).get("streamingBehavior").is_none());
        assert_eq!(
            cmd_prompt_streaming_steer("hi", &[])["streamingBehavior"],
            "steer"
        );
        assert_ne!(
            cmd_prompt_streaming_steer("hi", &[])["streamingBehavior"],
            "followUp"
        );
    }

    #[test]
    fn set_model_and_switch_session_shapes() {
        let set = cmd_set_model("anthropic", "claude-sonnet-4-20250514");
        assert_eq!(set["type"], "set_model");
        assert_eq!(set["provider"], "anthropic");
        assert_eq!(set["modelId"], "claude-sonnet-4-20250514");
        let switch = cmd_switch_session("/Users/me/.pi/agent/sessions/abc.jsonl");
        assert_eq!(switch["type"], "switch_session");
        assert_eq!(
            switch["sessionPath"],
            "/Users/me/.pi/agent/sessions/abc.jsonl"
        );
    }

    #[test]
    fn apply_get_state_keeps_session_file_and_ignores_vendor_queue() {
        let mut snapshot = PiSnapshot::default();
        apply_get_state(
            &mut snapshot,
            &json!({
                "sessionFile": "/tmp/pi-agent/sessions/abc.jsonl",
                "sessionId": "abc123",
                "thinkingLevel": "high",
                "isStreaming": true,
                "steeringMode": "all",
                "followUpMode": "all",
                "pendingMessageCount": 2,
                "model": {
                    "id": "claude-sonnet-4-20250514",
                    "provider": "anthropic",
                    "name": "Claude Sonnet 4"
                }
            }),
        );
        assert_eq!(
            snapshot.session_file.as_deref(),
            Some("/tmp/pi-agent/sessions/abc.jsonl")
        );
        assert_eq!(snapshot.model_provider.as_deref(), Some("anthropic"));
        assert!(snapshot.is_streaming);
    }

    #[test]
    fn fork_and_clone_are_not_forbidden_compact_stays() {
        assert!(!is_forbidden_chat_command(&cmd_fork("abc123")));
        assert!(!is_forbidden_chat_command(&cmd_clone()));
        assert!(!is_forbidden_chat_command(&cmd_get_fork_messages()));
        assert!(is_forbidden_chat_command(&json!({"type": "compact"})));
        assert_eq!(cmd_fork("abc123")["entryId"], "abc123");
        assert_eq!(cmd_get_fork_messages()["type"], "get_fork_messages");
        assert!(cmd_fork("abc123").get("jsonrpc").is_none());
        assert_eq!(
            parse_fork_messages(&json!({
                "messages": [{ "entryId": "ent_1", "text": "hello there" }]
            })),
            vec![("ent_1".into(), "hello there".into())]
        );
        assert_eq!(
            parse_fork_messages(&json!({
                "messages": [{ "entryId": "3955a068", "text": "hello fork" }]
            })),
            vec![("3955a068".into(), "hello fork".into())]
        );
    }

    #[test]
    fn rpc_response_parses_live_id_and_data_shapes() {
        let abort = RpcResponse::from_value(&json!({
            "id": "a1",
            "type": "response",
            "command": "abort",
            "success": true
        }));
        assert_eq!(abort.id.as_deref(), Some("a1"));
        assert_eq!(abort.data, None);
        assert_eq!(*abort.data(), json!(null));

        let numeric = RpcResponse::from_value(&json!({
            "id": 42,
            "type": "response",
            "command": "get_state",
            "success": true,
            "data": { "sessionFile": "/tmp/pi.jsonl", "sessionId": "abc" }
        }));
        assert_eq!(numeric.id.as_deref(), Some("42"));
        assert_eq!(
            numeric.data().get("sessionFile").and_then(Value::as_str),
            Some("/tmp/pi.jsonl")
        );

        let jsonrpc_unknown = RpcResponse::from_value(&json!({
            "id": "jr1",
            "type": "response",
            "success": false,
            "error": "Unknown command: undefined"
        }));
        assert_eq!(jsonrpc_unknown.command, "");
        assert!(!jsonrpc_unknown.success);
        assert_eq!(jsonrpc_unknown.data, None);

        let fork = RpcResponse::from_value(&json!({
            "id": "fk",
            "type": "response",
            "command": "fork",
            "success": true,
            "data": { "text": "forkme", "cancelled": false }
        }));
        assert_eq!(
            fork.data().get("text").and_then(Value::as_str),
            Some("forkme")
        );
        assert_eq!(
            fork.data().get("cancelled").and_then(Value::as_bool),
            Some(false)
        );
    }
}
