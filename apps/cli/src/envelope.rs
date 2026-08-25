//! APP-063 agent-first JSON envelope (cli-design principles).

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize)]
pub struct ParamMeta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<Value>,
    #[serde(rename = "enum", skip_serializing_if = "Option::is_none")]
    pub enum_values: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NextAction {
    pub command: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<BTreeMap<String, ParamMeta>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CliError {
    pub message: String,
    pub code: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CliEnvelope {
    pub ok: bool,
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<CliError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fix: Option<String>,
    pub next_actions: Vec<NextAction>,
}

impl CliEnvelope {
    pub fn success(
        command: impl Into<String>,
        result: Value,
        next_actions: Vec<NextAction>,
    ) -> Self {
        Self {
            ok: true,
            command: command.into(),
            result: Some(result),
            error: None,
            fix: None,
            next_actions,
        }
    }

    pub fn failure(
        command: impl Into<String>,
        code: impl Into<String>,
        message: impl Into<String>,
        fix: impl Into<String>,
        next_actions: Vec<NextAction>,
    ) -> Self {
        Self {
            ok: false,
            command: command.into(),
            result: None,
            error: Some(CliError {
                message: message.into(),
                code: code.into(),
            }),
            fix: Some(fix.into()),
            next_actions,
        }
    }

    #[cfg(test)]
    pub fn to_value(&self) -> Value {
        serde_json::to_value(self).unwrap_or_else(
            |_| json!({"ok": false, "error": {"message": "serialize failed", "code": "INTERNAL"}}),
        )
    }

    pub fn print_and_exit_code(&self) -> i32 {
        let pretty = std::env::var("ATMOS_CLI_COMPACT").ok().as_deref() != Some("1");
        let text = if pretty {
            serde_json::to_string_pretty(self)
        } else {
            serde_json::to_string(self)
        }
        .unwrap_or_else(|e| {
            format!(r#"{{"ok":false,"error":{{"message":"{e}","code":"INTERNAL"}}}}"#)
        });
        println!("{text}");
        if self.ok {
            0
        } else {
            1
        }
    }
}

pub fn next(command: impl Into<String>, description: impl Into<String>) -> NextAction {
    NextAction {
        command: command.into(),
        description: description.into(),
        params: None,
    }
}

pub fn next_with_params(
    command: impl Into<String>,
    description: impl Into<String>,
    params: BTreeMap<String, ParamMeta>,
) -> NextAction {
    NextAction {
        command: command.into(),
        description: description.into(),
        params: Some(params),
    }
}

pub fn param_value(value: impl Into<Value>, description: &str, required: bool) -> ParamMeta {
    ParamMeta {
        description: Some(description.to_string()),
        value: Some(value.into()),
        default: None,
        enum_values: None,
        required: Some(required),
    }
}

pub fn param_required(description: &str) -> ParamMeta {
    ParamMeta {
        description: Some(description.to_string()),
        value: None,
        default: None,
        enum_values: None,
        required: Some(true),
    }
}

/// Truncate large arrays for agent context safety.
pub fn truncate_list(items: Vec<Value>, limit: usize) -> Value {
    let total = items.len();
    if total <= limit {
        return json!({
            "items": items,
            "total": total,
            "truncated": false,
        });
    }
    let kept: Vec<Value> = items.into_iter().take(limit).collect();
    json!({
        "items": kept,
        "total": total,
        "truncated": true,
        "limit": limit,
    })
}

pub fn server_unreachable_actions() -> Vec<NextAction> {
    vec![
        next("atmos runtime ensure", "Start the local Atmos Server"),
        next("atmos status", "Re-check server health"),
    ]
}

pub fn unauthorized_actions() -> Vec<NextAction> {
    vec![
        next(
            "atmos status --api-token <token>",
            "Retry with an explicit API token",
        ),
        next(
            "export ATMOS_API_TOKEN=<token>",
            "Set token from runtime manifest / client-session",
        ),
    ]
}

pub fn extract_id(value: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(s) = value.get(*key).and_then(|v| v.as_str()) {
            return Some(s.to_string());
        }
        if let Some(s) = value
            .get("model")
            .and_then(|m| m.get(*key))
            .and_then(|v| v.as_str())
        {
            return Some(s.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn success_envelope_shape() {
        let env = CliEnvelope::success("atmos status", json!({"server":"up"}), vec![]);
        let v = env.to_value();
        assert_eq!(v["ok"], true);
        assert_eq!(v["command"], "atmos status");
        assert!(v.get("result").is_some());
        assert!(v.get("next_actions").unwrap().is_array());
        assert!(v.get("error").is_none());
    }

    #[test]
    fn failure_envelope_shape() {
        let env = CliEnvelope::failure(
            "atmos project list",
            "SERVER_UNREACHABLE",
            "connection refused",
            "Run: atmos runtime ensure",
            server_unreachable_actions(),
        );
        let v = env.to_value();
        assert_eq!(v["ok"], false);
        assert_eq!(v["error"]["code"], "SERVER_UNREACHABLE");
        assert!(v["fix"].as_str().unwrap().contains("runtime ensure"));
        assert!(!v["next_actions"].as_array().unwrap().is_empty());
    }

    #[test]
    fn truncate_list_marks_truncated() {
        let items: Vec<Value> = (0..5).map(|i| json!(i)).collect();
        let out = truncate_list(items, 2);
        assert_eq!(out["truncated"], true);
        assert_eq!(out["total"], 5);
        assert_eq!(out["items"].as_array().unwrap().len(), 2);
    }
}
