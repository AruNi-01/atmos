use axum::{
    extract::ConnectInfo,
    http::{header::AUTHORIZATION, HeaderMap, Request, StatusCode},
    middleware::Next,
    response::Response,
};
use sha2::{Digest, Sha256};
use std::net::SocketAddr;

fn constant_time_eq(a: &str, b: &str) -> bool {
    let hash_a = Sha256::digest(a.as_bytes());
    let hash_b = Sha256::digest(b.as_bytes());
    hash_a
        .iter()
        .zip(hash_b.iter())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}

/// General middleware: trusts loopback by default.
/// LAN trust can be opt-in via configuration.
pub async fn require_local_token(
    connect_info: ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    request: Request<axum::body::Body>,
    next: Next,
    expected_token: Option<String>,
    allow_lan_without_token: bool,
) -> Result<Response, StatusCode> {
    let path = request.uri().path().to_string();
    let query = request.uri().query().map(|s| s.to_string());

    let remote_ip = connect_info.0.ip();

    if is_trusted_local_source(&remote_ip, allow_lan_without_token) {
        return Ok(next.run(request).await);
    }

    if !is_request_authorized(&headers, query.as_deref(), &expected_token) {
        tracing::warn!(
            "Unauthorized API request: path={}, query={:?}, remote={}",
            path,
            query,
            remote_ip
        );
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(next.run(request).await)
}

/// Stricter middleware for destructive operations: only loopback is trusted
/// without a token. LAN clients must also provide a valid token.
pub async fn require_loopback_or_token(
    connect_info: ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    request: Request<axum::body::Body>,
    next: Next,
    expected_token: Option<String>,
) -> Result<Response, StatusCode> {
    let path = request.uri().path().to_string();
    let query = request.uri().query().map(|s| s.to_string());
    let remote_ip = connect_info.0.ip();

    if is_loopback_ip(&remote_ip) {
        return Ok(next.run(request).await);
    }

    if !is_request_authorized(&headers, query.as_deref(), &expected_token) {
        tracing::warn!(
            "Unauthorized destructive API request: path={}, remote={}",
            path,
            remote_ip
        );
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(next.run(request).await)
}

fn is_trusted_local_source(ip: &std::net::IpAddr, allow_lan_without_token: bool) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            if v4.is_loopback() {
                return true;
            }
            allow_lan_without_token && (v4.is_private() || v4.is_link_local())
        }
        std::net::IpAddr::V6(v6) => {
            if v6.is_loopback() || v6.to_ipv4_mapped().is_some_and(|v4| v4.is_loopback()) {
                return true;
            }
            allow_lan_without_token
                && v6
                    .to_ipv4_mapped()
                    .is_some_and(|v4| v4.is_private() || v4.is_link_local())
        }
    }
}

fn is_loopback_ip(ip: &std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => v4.is_loopback(),
        std::net::IpAddr::V6(v6) => {
            v6.is_loopback() || v6.to_ipv4_mapped().is_some_and(|v4| v4.is_loopback())
        }
    }
}

pub fn is_request_authorized(
    headers: &HeaderMap,
    query: Option<&str>,
    token: &Option<String>,
) -> bool {
    let Some(expected_token) = token.as_ref() else {
        return true;
    };

    let by_header = headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|auth_header| auth_header.strip_prefix("Bearer "))
        .map(|v| constant_time_eq(v, expected_token))
        .unwrap_or(false);

    if by_header {
        return true;
    }

    let Some(query_str) = query else {
        return false;
    };
    for pair in query_str.split('&') {
        if let Some(v) = pair.strip_prefix("token=") {
            return constant_time_eq(v, expected_token);
        }
    }
    false
}
