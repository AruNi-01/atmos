//! Shared HTTP client for CLI commands that target a running Atmos API.

use std::time::Duration;

use clap::Args;
use reqwest::header::AUTHORIZATION;
use reqwest::Method;
use runtime_manager::{resolve_api_base_url, resolve_api_bearer_token};
use serde_json::Value;

pub const DEFAULT_TIMEOUT_MS: u64 = 45_000;

#[derive(Debug, Args, Clone)]
pub struct ApiClientArgs {
    /// Override the API base URL (`ATMOS_API_URL` / runtime manifest / client state).
    #[arg(long, global = true)]
    pub api_url: Option<String>,
    /// Bearer token (`ATMOS_API_TOKEN`, `ATMOS_LOCAL_TOKEN`, or client state).
    #[arg(long, global = true)]
    pub api_token: Option<String>,
    /// HTTP deadline in milliseconds. Default 45000.
    #[arg(long, global = true)]
    pub timeout_ms: Option<u64>,
}

pub fn resolve_base_url(args: &ApiClientArgs) -> Result<String, String> {
    resolve_api_base_url(args.api_url.as_deref())
}

pub fn resolve_token(args: &ApiClientArgs) -> Option<String> {
    resolve_api_bearer_token(args.api_token.as_deref())
}

pub fn build_url(args: &ApiClientArgs, path: &str) -> Result<String, String> {
    let base = resolve_base_url(args)?;
    let trimmed = base.trim_end_matches('/');
    Ok(format!("{}{}", trimmed, path))
}

pub fn http_client(args: &ApiClientArgs) -> Result<reqwest::Client, String> {
    let timeout = Duration::from_millis(
        args.timeout_ms
            .unwrap_or(DEFAULT_TIMEOUT_MS)
            .saturating_add(5_000),
    );
    reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|err| format!("failed to build http client: {}", err))
}

pub fn auth_hint_for_status(status: reqwest::StatusCode) -> Option<&'static str> {
    if status == reqwest::StatusCode::UNAUTHORIZED {
        Some(
            "HTTP 401 — set --api-token, ATMOS_API_TOKEN, or ATMOS_LOCAL_TOKEN (remote/LAN API requires a token)",
        )
    } else {
        None
    }
}

pub async fn request_json(
    args: &ApiClientArgs,
    method: Method,
    path: &str,
    query: Option<&[(&str, String)]>,
    body: Option<Value>,
) -> Result<Value, String> {
    let endpoint = build_url(args, path)?;
    let client = http_client(args)?;
    let mut req = client.request(method, &endpoint);
    if let Some(token) = resolve_token(args) {
        req = req.header(AUTHORIZATION, format!("Bearer {}", token));
    }
    if let Some(pairs) = query {
        req = req.query(pairs);
    }
    if let Some(payload) = body {
        req = req.json(&payload);
    }
    let resp = req
        .send()
        .await
        .map_err(|err| format!("request failed ({endpoint}): {err}"))?;
    let status = resp.status();
    let value = resp
        .json::<Value>()
        .await
        .map_err(|err| format!("failed to parse response from {endpoint}: {err}"))?;
    if !status.is_success() {
        if let Some(hint) = auth_hint_for_status(status) {
            return Err(hint.to_string());
        }
        let detail = value
            .get("error")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| value.to_string());
        return Err(format!("HTTP {}: {}", status, detail));
    }
    unwrap_api_envelope(value)
}

pub fn unwrap_api_envelope(value: Value) -> Result<Value, String> {
    if let Some(success) = value.get("success").and_then(|v| v.as_bool()) {
        if success {
            return Ok(value.get("data").cloned().unwrap_or(Value::Null));
        }
        let message = value
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("API request failed");
        return Err(message.to_string());
    }
    Ok(value)
}
