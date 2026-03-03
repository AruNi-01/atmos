use axum::{
    extract::ConnectInfo,
    http::{header::AUTHORIZATION, HeaderMap, Request, StatusCode},
    middleware::Next,
    response::Response,
};
use std::net::SocketAddr;

pub async fn require_local_token(
    connect_info: ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let token = std::env::var("ATMOS_LOCAL_TOKEN").ok();
    let path = request.uri().path().to_string();
    let query = request.uri().query().map(|s| s.to_string());

    let remote_ip = connect_info.0.ip();

    // Same-machine and LAN requests are trusted without a token.
    // This allows browsers (including mobile on the same network) to connect
    // to the desktop sidecar without needing the Tauri IPC token.
    if is_local_or_lan(&remote_ip) {
        return Ok(next.run(request).await);
    }

    if !is_request_authorized(&headers, query.as_deref(), &token) {
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

fn is_local_or_lan(ip: &std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            v4.is_loopback()          // 127.0.0.0/8
            || v4.is_private()        // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
            || v4.is_link_local() // 169.254.0.0/16
        }
        std::net::IpAddr::V6(v6) => {
            v6.is_loopback()          // ::1
            // IPv4-mapped addresses (::ffff:x.x.x.x) — check the inner v4
            || v6.to_ipv4_mapped().is_some_and(|v4| {
                v4.is_loopback() || v4.is_private() || v4.is_link_local()
            })
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
        .map(|v| v == expected_token)
        .unwrap_or(false);

    if by_header {
        return true;
    }

    let Some(query_str) = query else {
        return false;
    };
    for pair in query_str.split('&') {
        if let Some(v) = pair.strip_prefix("token=") {
            return v == expected_token;
        }
    }
    false
}
