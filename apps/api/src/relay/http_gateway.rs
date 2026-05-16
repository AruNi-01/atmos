//! Relay HTTP gateway — execute proxied requests against loopback `apps/api`.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use reqwest::header::{HeaderName, HeaderValue, AUTHORIZATION};
use reqwest::Method;
use runtime_manager::read_runtime_manifest;
use serde::Deserialize;
use tracing::warn;

#[derive(Debug, Deserialize)]
struct HttpRelayRequestBody {
    method: String,
    path: String,
    headers: Vec<(String, String)>,
    body_b64: Option<String>,
}

#[derive(Debug, serde::Serialize)]
struct HttpRelayResponseBody {
    status: u16,
    headers: Vec<(String, String)>,
    body_b64: Option<String>,
}

const HOP_BY_HOP: &[&str] = &[
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
];

/// Handle `stream == "http"` envelope from relay; returns JSON body for the response envelope.
pub async fn handle_http_envelope(body: &str) -> Option<String> {
    let req: HttpRelayRequestBody = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(e) => {
            warn!(
                target: "atmos_relay",
                error = %e,
                "http gateway request decode failed"
            );
            return Some(error_response(400, "invalid_http_request"));
        }
    };

    let manifest = match read_runtime_manifest() {
        Ok(Some(m)) => m,
        Ok(None) => {
            return Some(error_response(503, "runtime_manifest_missing"));
        }
        Err(e) => {
            warn!(target: "atmos_relay", error = %e, "manifest read failed");
            return Some(error_response(503, "runtime_manifest_unreadable"));
        }
    };

    let base = manifest.api.url.trim_end_matches('/');
    let path = if req.path.starts_with('/') {
        req.path.clone()
    } else {
        format!("/{}", req.path)
    };
    let url = format!("{base}{path}");

    let method = match Method::from_bytes(req.method.as_bytes()) {
        Ok(m) => m,
        Err(_) => {
            return Some(error_response(400, "invalid_method"));
        }
    };

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(55))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            warn!(target: "atmos_relay", error = %e, "http gateway client build failed");
            return Some(error_response(502, "gateway_client_error"));
        }
    };

    let mut builder = client.request(method, &url);

    let mut has_auth = false;
    for (name, value) in &req.headers {
        let lower = name.to_ascii_lowercase();
        if HOP_BY_HOP.contains(&lower.as_str()) {
            continue;
        }
        // Gateway Bearer is for the edge only — never forward to loopback.
        if lower == "authorization" {
            continue;
        }
        let Ok(header_name) = HeaderName::from_bytes(name.as_bytes()) else {
            continue;
        };
        let Ok(header_value) = HeaderValue::from_str(value) else {
            continue;
        };
        if lower == "x-atmos-api-token" {
            has_auth = true;
            builder = builder.header(AUTHORIZATION, format!("Bearer {value}"));
            continue;
        }
        builder = builder.header(header_name, header_value);
    }

    if !has_auth {
        if let Some(token) = relay_gateway_local_token() {
            builder = builder.header(AUTHORIZATION, format!("Bearer {token}"));
        }
    }

    if let Some(b64) = req.body_b64.as_ref().filter(|s| !s.is_empty()) {
        match B64.decode(b64) {
            Ok(bytes) => {
                builder = builder.body(bytes);
            }
            Err(e) => {
                warn!(target: "atmos_relay", error = %e, "http gateway body base64 decode failed");
                return Some(error_response(400, "invalid_body"));
            }
        }
    }

    let resp = match builder.send().await {
        Ok(r) => r,
        Err(e) => {
            warn!(
                target: "atmos_relay",
                error = %e,
                url = %url,
                "http gateway upstream request failed"
            );
            return Some(error_response(502, "upstream_unreachable"));
        }
    };

    let status = resp.status().as_u16();
    let mut out_headers: Vec<(String, String)> = Vec::new();
    for (name, value) in resp.headers().iter() {
        let lower = name.as_str().to_ascii_lowercase();
        if HOP_BY_HOP.contains(&lower.as_str()) {
            continue;
        }
        if let Ok(v) = value.to_str() {
            out_headers.push((name.to_string(), v.to_string()));
        }
    }

    let bytes = match resp.bytes().await {
        Ok(b) => b,
        Err(e) => {
            warn!(target: "atmos_relay", error = %e, "http gateway read body failed");
            return Some(error_response(502, "upstream_body_error"));
        }
    };

    let body_b64 = if bytes.is_empty() {
        None
    } else {
        Some(B64.encode(bytes))
    };

    let payload = HttpRelayResponseBody {
        status,
        headers: out_headers,
        body_b64,
    };

    match serde_json::to_string(&payload) {
        Ok(s) => Some(s),
        Err(e) => {
            warn!(target: "atmos_relay", error = %e, "http gateway response encode failed");
            Some(error_response(500, "response_encode_error"))
        }
    }
}

pub(crate) fn encode_error_response(status: u16, code: &str) -> String {
    error_response(status, code)
}

fn relay_gateway_local_token() -> Option<String> {
    for key in ["ATMOS_LOCAL_TOKEN", "ATMOS_API_TOKEN"] {
        if let Ok(token) = std::env::var(key) {
            if !token.trim().is_empty() {
                return Some(token);
            }
        }
    }
    None
}

fn error_response(status: u16, code: &str) -> String {
    let payload = HttpRelayResponseBody {
        status,
        headers: vec![("content-type".to_string(), "application/json".to_string())],
        body_b64: Some(B64.encode(format!(r#"{{"error":"{code}"}}"#))),
    };
    serde_json::to_string(&payload).unwrap_or_else(|_| "{}".into())
}
