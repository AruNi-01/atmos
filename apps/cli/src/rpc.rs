//! HTTP client for `POST /api/cli/rpc` and related endpoints.

use reqwest::header::AUTHORIZATION;
use reqwest::Method;
use serde_json::{json, Value};

use crate::api_client::{
    auth_hint_for_status, build_url, http_client, resolve_token, ApiClientArgs,
};
use crate::envelope::{next, unauthorized_actions, CliEnvelope, NextAction};

#[derive(Debug)]
pub enum RpcError {
    Unreachable(String),
    Unauthorized(String),
    Http { status: u16, body: String },
    Action { code: String, message: String },
    Other(String),
}

impl RpcError {
    pub fn to_envelope(&self, command: &str) -> CliEnvelope {
        match self {
            RpcError::Unreachable(msg) => CliEnvelope::failure(
                command,
                "SERVER_UNREACHABLE",
                msg.clone(),
                "Start the server: atmos runtime ensure (or set --api-url)",
                crate::envelope::server_unreachable_actions(),
            ),
            RpcError::Unauthorized(msg) => CliEnvelope::failure(
                command,
                "UNAUTHORIZED",
                msg.clone(),
                "Set --api-token, ATMOS_API_TOKEN, or ATMOS_LOCAL_TOKEN",
                unauthorized_actions(),
            ),
            RpcError::Action { code, message } => CliEnvelope::failure(
                command,
                code.clone(),
                message.clone(),
                "Inspect the error code and fix the request payload or resource state",
                vec![next("atmos status", "Check server health")],
            ),
            RpcError::Http { status, body } => CliEnvelope::failure(
                command,
                "HTTP_ERROR",
                format!("HTTP {status}: {body}"),
                "Retry after checking server logs and auth",
                vec![next("atmos status", "Check server health")],
            ),
            RpcError::Other(msg) => CliEnvelope::failure(
                command,
                "CLI_ERROR",
                msg.clone(),
                "Fix the CLI invocation and retry",
                vec![],
            ),
        }
    }
}

pub async fn call_rpc(api: &ApiClientArgs, action: &str, data: Value) -> Result<Value, RpcError> {
    let endpoint = build_url(api, "/api/cli/rpc").map_err(RpcError::Other)?;
    let client = http_client(api).map_err(RpcError::Other)?;
    let mut req = client.request(Method::POST, &endpoint).json(&json!({
        "action": action,
        "data": data,
    }));
    if let Some(token) = resolve_token(api) {
        req = req.header(AUTHORIZATION, format!("Bearer {token}"));
    }
    let resp = req
        .send()
        .await
        .map_err(|e| RpcError::Unreachable(format!("request failed ({endpoint}): {e}")))?;
    let status = resp.status();
    let body_text = resp
        .text()
        .await
        .map_err(|e| RpcError::Other(format!("read body: {e}")))?;
    let value: Value =
        serde_json::from_str(&body_text).unwrap_or_else(|_| json!({ "raw": body_text }));

    if status.as_u16() == 401 {
        let hint = auth_hint_for_status(status).unwrap_or("unauthorized");
        return Err(RpcError::Unauthorized(hint.to_string()));
    }
    if !status.is_success() {
        return Err(RpcError::Http {
            status: status.as_u16(),
            body: body_text,
        });
    }

    // Domain errors may be returned as HTTP 200 with success:false
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
        return Err(RpcError::Action { code, message });
    }

    if value.get("success").and_then(|v| v.as_bool()) == Some(true) {
        return Ok(value.get("data").cloned().unwrap_or(Value::Null));
    }

    // actions list / health may already be unwrapped shapes
    Ok(value.get("data").cloned().unwrap_or(value))
}

pub async fn get_json(api: &ApiClientArgs, path: &str) -> Result<Value, RpcError> {
    let endpoint = build_url(api, path).map_err(RpcError::Other)?;
    let client = http_client(api).map_err(RpcError::Other)?;
    let mut req = client.request(Method::GET, &endpoint);
    if let Some(token) = resolve_token(api) {
        req = req.header(AUTHORIZATION, format!("Bearer {token}"));
    }
    let resp = req
        .send()
        .await
        .map_err(|e| RpcError::Unreachable(format!("request failed ({endpoint}): {e}")))?;
    let status = resp.status();
    let body_text = resp
        .text()
        .await
        .map_err(|e| RpcError::Other(format!("read body: {e}")))?;
    if status.as_u16() == 401 {
        return Err(RpcError::Unauthorized(
            auth_hint_for_status(status)
                .unwrap_or("unauthorized")
                .to_string(),
        ));
    }
    if !status.is_success() {
        return Err(RpcError::Http {
            status: status.as_u16(),
            body: body_text,
        });
    }
    let value: Value = serde_json::from_str(&body_text)
        .map_err(|e| RpcError::Other(format!("parse json: {e}")))?;
    if value.get("success").and_then(|v| v.as_bool()) == Some(true) {
        return Ok(value.get("data").cloned().unwrap_or(Value::Null));
    }
    Ok(value)
}

pub fn wrap_ok(command: &str, result: Value, next_actions: Vec<NextAction>) -> CliEnvelope {
    CliEnvelope::success(command, result, next_actions)
}
