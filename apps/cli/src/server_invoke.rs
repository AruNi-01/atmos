//! Invoke Atmos Server product actions over HTTP (`POST /api/cli/invoke`).
//!
//! This is a thin request client — not an RPC framework. Naming: **server_invoke**.

use reqwest::header::AUTHORIZATION;
use reqwest::Method;
use serde_json::{json, Value};

use crate::api_client::{
    auth_hint_for_status, build_url, http_client, resolve_token, ApiClientArgs,
};
use crate::envelope::{next, unauthorized_actions, CliEnvelope, NextAction};

#[derive(Debug)]
pub enum InvokeError {
    Unreachable(String),
    Unauthorized(String),
    Http { status: u16, body: String },
    Action { code: String, message: String },
    Other(String),
}

impl InvokeError {
    pub fn to_envelope(&self, command: &str) -> CliEnvelope {
        match self {
            InvokeError::Unreachable(msg) => CliEnvelope::failure(
                command,
                "SERVER_UNREACHABLE",
                msg.clone(),
                "Start the server: atmos runtime ensure (or set --api-url)",
                crate::envelope::server_unreachable_actions(),
            ),
            InvokeError::Unauthorized(msg) => CliEnvelope::failure(
                command,
                "UNAUTHORIZED",
                msg.clone(),
                "Set --api-token, ATMOS_API_TOKEN, or ATMOS_LOCAL_TOKEN",
                unauthorized_actions(),
            ),
            InvokeError::Action { code, message } => CliEnvelope::failure(
                command,
                code.clone(),
                message.clone(),
                "Inspect the error code and fix the request payload or resource state",
                vec![next("atmos status", "Check server health")],
            ),
            InvokeError::Http { status, body } => CliEnvelope::failure(
                command,
                "HTTP_ERROR",
                format!("HTTP {status}: {body}"),
                "Retry after checking server logs and auth",
                vec![next("atmos status", "Check server health")],
            ),
            InvokeError::Other(msg) => CliEnvelope::failure(
                command,
                "CLI_ERROR",
                msg.clone(),
                "Fix the CLI invocation and retry",
                vec![],
            ),
        }
    }
}

async fn try_lazy_ensure(api: &ApiClientArgs) -> bool {
    if !runtime_manager::supervisor::cli_should_lazy_ensure(api.no_ensure, true) {
        return false;
    }
    runtime_manager::supervisor::ensure_running(Default::default())
        .await
        .is_ok()
}

/// Invoke a server-side `WsAction` by wire name with JSON `data`.
pub async fn invoke(api: &ApiClientArgs, action: &str, data: Value) -> Result<Value, InvokeError> {
    let endpoint = build_url(api, "/api/cli/invoke").map_err(InvokeError::Other)?;
    let client = http_client(api).map_err(InvokeError::Other)?;
    let mut last_unreachable = None;
    for attempt in 0..2 {
        let mut req = client.request(Method::POST, &endpoint).json(&json!({
            "action": action,
            "data": data,
        }));
        if let Some(token) = resolve_token(api) {
            req = req.header(AUTHORIZATION, format!("Bearer {token}"));
        }
        match req.send().await {
            Ok(resp) => {
                return invoke_read_response(resp).await;
            }
            Err(e) => {
                last_unreachable = Some(format!("request failed ({endpoint}): {e}"));
                if attempt == 0 && try_lazy_ensure(api).await {
                    continue;
                }
            }
        }
    }
    Err(InvokeError::Unreachable(
        last_unreachable.unwrap_or_else(|| "request failed".into()),
    ))
}

async fn invoke_read_response(resp: reqwest::Response) -> Result<Value, InvokeError> {
    let status = resp.status();
    let body_text = resp
        .text()
        .await
        .map_err(|e| InvokeError::Other(format!("read body: {e}")))?;
    let value: Value =
        serde_json::from_str(&body_text).unwrap_or_else(|_| json!({ "raw": body_text }));

    if status.as_u16() == 401 {
        let hint = auth_hint_for_status(status).unwrap_or("unauthorized");
        return Err(InvokeError::Unauthorized(hint.to_string()));
    }

    // Prefer structured error envelope when present (including HTTP 200).
    if value.get("success").and_then(|v| v.as_bool()) == Some(false) {
        let code = value
            .pointer("/error/code")
            .and_then(|v| v.as_str())
            .unwrap_or("ACTION_FAILED")
            .to_string();
        let message = value
            .pointer("/error/message")
            .and_then(|v| v.as_str())
            .or_else(|| value.get("error").and_then(|v| v.as_str()))
            .unwrap_or("action failed")
            .to_string();
        return Err(InvokeError::Action { code, message });
    }

    if !status.is_success() {
        let lower = body_text.to_ascii_lowercase();
        if status.as_u16() == 400
            && (lower.contains("unknown action") || lower.contains("unknown_action"))
        {
            return Err(InvokeError::Action {
                code: "UNKNOWN_ACTION".into(),
                message: body_text,
            });
        }
        return Err(InvokeError::Http {
            status: status.as_u16(),
            body: body_text,
        });
    }

    if value.get("success").and_then(|v| v.as_bool()) == Some(true) {
        return Ok(value.get("data").cloned().unwrap_or(Value::Null));
    }

    Ok(value.get("data").cloned().unwrap_or(value))
}

pub async fn request_json_ensured(
    api: &ApiClientArgs,
    method: Method,
    path: &str,
    body: Option<Value>,
) -> Result<Value, InvokeError> {
    let endpoint = build_url(api, path).map_err(InvokeError::Other)?;
    let client = http_client(api).map_err(InvokeError::Other)?;
    let mut last_unreachable = None;
    let mut resp_ok = None;
    for attempt in 0..2 {
        let mut req = client.request(method.clone(), &endpoint);
        if let Some(token) = resolve_token(api) {
            req = req.header(AUTHORIZATION, format!("Bearer {token}"));
        }
        if let Some(payload) = &body {
            req = req.json(payload);
        }
        match req.send().await {
            Ok(resp) => {
                resp_ok = Some(resp);
                break;
            }
            Err(e) => {
                last_unreachable = Some(format!("request failed ({endpoint}): {e}"));
                if attempt == 0 && try_lazy_ensure(api).await {
                    continue;
                }
            }
        }
    }
    let Some(resp) = resp_ok else {
        return Err(InvokeError::Unreachable(
            last_unreachable.unwrap_or_else(|| "request failed".into()),
        ));
    };
    let status = resp.status();
    let body_text = resp
        .text()
        .await
        .map_err(|e| InvokeError::Other(format!("read body: {e}")))?;
    if status.as_u16() == 401 {
        return Err(InvokeError::Unauthorized(
            auth_hint_for_status(status)
                .unwrap_or("unauthorized")
                .to_string(),
        ));
    }
    if !status.is_success() {
        return Err(InvokeError::Http {
            status: status.as_u16(),
            body: body_text,
        });
    }
    let value: Value = serde_json::from_str(&body_text)
        .map_err(|e| InvokeError::Other(format!("parse json: {e}")))?;
    if value.get("success").and_then(|v| v.as_bool()) == Some(true) {
        return Ok(value.get("data").cloned().unwrap_or(Value::Null));
    }
    Ok(value.get("data").cloned().unwrap_or(value))
}

pub async fn get_json(api: &ApiClientArgs, path: &str) -> Result<Value, InvokeError> {
    let endpoint = build_url(api, path).map_err(InvokeError::Other)?;
    let client = http_client(api).map_err(InvokeError::Other)?;
    let mut last_unreachable = None;
    let mut resp_ok = None;
    for attempt in 0..2 {
        let mut req = client.request(Method::GET, &endpoint);
        if let Some(token) = resolve_token(api) {
            req = req.header(AUTHORIZATION, format!("Bearer {token}"));
        }
        match req.send().await {
            Ok(resp) => {
                resp_ok = Some(resp);
                break;
            }
            Err(e) => {
                last_unreachable = Some(format!("request failed ({endpoint}): {e}"));
                if attempt == 0 && try_lazy_ensure(api).await {
                    continue;
                }
            }
        }
    }
    let Some(resp) = resp_ok else {
        return Err(InvokeError::Unreachable(
            last_unreachable.unwrap_or_else(|| "request failed".into()),
        ));
    };
    let status = resp.status();
    let body_text = resp
        .text()
        .await
        .map_err(|e| InvokeError::Other(format!("read body: {e}")))?;
    if status.as_u16() == 401 {
        return Err(InvokeError::Unauthorized(
            auth_hint_for_status(status)
                .unwrap_or("unauthorized")
                .to_string(),
        ));
    }
    if !status.is_success() {
        return Err(InvokeError::Http {
            status: status.as_u16(),
            body: body_text,
        });
    }
    let value: Value = serde_json::from_str(&body_text)
        .map_err(|e| InvokeError::Other(format!("parse json: {e}")))?;
    if value.get("success").and_then(|v| v.as_bool()) == Some(true) {
        return Ok(value.get("data").cloned().unwrap_or(Value::Null));
    }
    Ok(value)
}

pub fn wrap_ok(command: &str, result: Value, next_actions: Vec<NextAction>) -> CliEnvelope {
    CliEnvelope::success(command, result, next_actions)
}

#[cfg(test)]
mod tests {
    #[test]
    fn product_http_lazy_ensures_runtime() {
        let src = include_str!("server_invoke.rs");
        assert!(src.contains("fn try_lazy_ensure"));
        assert!(src.contains("cli_should_lazy_ensure"));
        assert!(src.contains("ensure_running"));
        // invoke, get_json, and request_json_ensured all retry after ensure
        let ensured_fn = src
            .split("pub async fn request_json_ensured")
            .nth(1)
            .expect("request_json_ensured");
        let ensured_body = ensured_fn.split("pub async fn get_json").next().unwrap();
        assert!(ensured_body.contains("try_lazy_ensure"));
        let invoke_fn = src.split("pub async fn invoke").nth(1).unwrap();
        let invoke_body = invoke_fn
            .split("async fn invoke_read_response")
            .next()
            .unwrap();
        assert!(invoke_body.contains("try_lazy_ensure"));
    }
}
