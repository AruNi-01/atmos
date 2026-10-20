use axum::{
    extract::ConnectInfo,
    http::{
        header::{AUTHORIZATION, HOST, ORIGIN},
        HeaderMap, Request, StatusCode,
    },
    middleware::Next,
    response::Response,
};
use sha2::{Digest, Sha256};
use std::net::SocketAddr;
use std::sync::Arc;

use crate::config::ServerConfig;

fn constant_time_eq(a: &str, b: &str) -> bool {
    let hash_a = Sha256::digest(a.as_bytes());
    let hash_b = Sha256::digest(b.as_bytes());
    hash_a
        .iter()
        .zip(hash_b.iter())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}

/// Reject browser-initiated requests from origins we do not trust.
///
/// This runs outside the CORS layer because a WebSocket handshake is exempt from
/// the same-origin policy: without this guard any page the user visits can open
/// `ws://127.0.0.1:<port>/ws/terminal/...` and, because the connection arrives
/// from loopback, `require_local_token` waves it through. Only browsers are
/// required to send `Origin`, so a missing header means a non-browser client
/// (relay/tunnel bridge, CLI) and is left alone — same model as Chrome's
/// `--remote-allow-origins` for the DevTools protocol.
///
/// The `Host` check closes the sibling hole: a same-origin request after DNS
/// rebinding carries no `Origin` header at all, so the hostname has to be an IP
/// literal or `localhost` (extend via `ATMOS_ALLOWED_HOSTS`).
pub async fn require_allowed_origin(
    headers: HeaderMap,
    request: Request<axum::body::Body>,
    next: Next,
    config: Arc<ServerConfig>,
) -> Result<Response, StatusCode> {
    if let Some(host) = headers.get(HOST).and_then(|value| value.to_str().ok()) {
        if !config.is_host_allowed(host) {
            tracing::warn!(
                "Rejected request with untrusted Host header: host={}, path={}",
                host,
                request.uri().path()
            );
            return Err(StatusCode::FORBIDDEN);
        }
    }

    if let Some(origin) = headers.get(ORIGIN).and_then(|value| value.to_str().ok()) {
        if !config.is_origin_allowed(origin) {
            tracing::warn!(
                "Rejected cross-origin request: origin={}, path={}",
                origin,
                request.uri().path()
            );
            return Err(StatusCode::FORBIDDEN);
        }
    }

    Ok(next.run(request).await)
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
            "Unauthorized API request: path={}, query={}, remote={}",
            path,
            redact_query_token(query.as_deref()),
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

/// Replace `token` query values so logs cannot keep a bearer secret.
///
/// The key match is case-insensitive and accepts a percent-encoded key or
/// separator (`%74oken=`, `token%3D`, `Token=`). Decoding is only for
/// redaction. `is_request_authorized` still accepts a literal `token=` key.
pub fn redact_query_token(query: Option<&str>) -> String {
    let Some(query) = query else {
        return "<none>".to_string();
    };
    query
        .split('&')
        .map(|pair| {
            if query_pair_is_token_key(pair) {
                "token=REDACTED"
            } else {
                pair
            }
        })
        .collect::<Vec<_>>()
        .join("&")
}

/// Path plus query for access logs. The query uses [`redact_query_token`].
pub fn redacted_request_uri(uri: &axum::http::Uri) -> String {
    match uri.query() {
        Some(query) => format!("{}?{}", uri.path(), redact_query_token(Some(query))),
        None => uri.path().to_string(),
    }
}

/// Span factory for `TraceLayer`. Every access-log event inherits this span,
/// so the DEBUG `uri` field must already be redacted.
pub fn http_access_span<B>(request: &axum::http::Request<B>) -> tracing::Span {
    tracing::debug_span!(
        "request",
        method = %request.method(),
        uri = %redacted_request_uri(request.uri()),
        version = ?request.version(),
    )
}

fn query_pair_is_token_key(pair: &str) -> bool {
    let Some(key) = query_pair_key(pair) else {
        return false;
    };
    decoded_key_is_token(key)
}

/// Key text before the first raw `=` or an earlier `%3D` / `%3d`.
fn query_pair_key(pair: &str) -> Option<&str> {
    let raw_eq = pair.find('=');
    let encoded_eq = pair.as_bytes().windows(3).position(|window| {
        window[0] == b'%'
            && window[1].eq_ignore_ascii_case(&b'3')
            && window[2].eq_ignore_ascii_case(&b'D')
    });
    match (raw_eq, encoded_eq) {
        (Some(raw), Some(encoded)) if encoded < raw => Some(&pair[..encoded]),
        (Some(raw), _) => Some(&pair[..raw]),
        (None, Some(encoded)) => Some(&pair[..encoded]),
        (None, None) => None,
    }
}

fn decoded_key_is_token(key: &str) -> bool {
    let mut current = key.to_string();
    for _ in 0..4 {
        if current.eq_ignore_ascii_case("token") {
            return true;
        }
        match urlencoding::decode(&current) {
            Ok(decoded) if decoded.as_ref() != current => current = decoded.into_owned(),
            _ => return false,
        }
    }
    current.eq_ignore_ascii_case("token")
}

pub fn is_request_authorized(
    headers: &HeaderMap,
    query: Option<&str>,
    token: &Option<String>,
) -> bool {
    // Missing or blank ATMOS_LOCAL_TOKEN is not a pass. Loopback is allowed
    // earlier by require_local_token / require_loopback_or_token.
    let Some(expected_token) = crate::config::configured_token(token) else {
        return false;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::CorsOriginConfig;
    use axum::{
        body::Body, http::Request as HttpRequest, middleware::from_fn, routing::get, Router,
    };
    use tower::ServiceExt;

    fn guarded_app() -> Router {
        let config = Arc::new(ServerConfig {
            host: "127.0.0.1".to_string(),
            port: 30303,
            cors_origins: CorsOriginConfig::List(vec!["https://app.atmos.land".to_string()]),
            allow_dynamic_localhost_origins: false,
            local_api_token: None,
            allow_lan_without_token: false,
            allowed_hosts: Vec::new(),
        });

        Router::new()
            .route("/ws/terminal/{session_id}", get(|| async { "reached" }))
            .layer(from_fn(move |headers, req, next| {
                require_allowed_origin(headers, req, next, config.clone())
            }))
    }

    async fn status_for(headers: &[(&str, &str)]) -> StatusCode {
        let mut builder = HttpRequest::builder().uri("/ws/terminal/abc");
        for (name, value) in headers {
            builder = builder.header(*name, *value);
        }
        let request = builder.body(Body::empty()).expect("request builds");
        guarded_app()
            .oneshot(request)
            .await
            .expect("router responds")
            .status()
    }

    #[tokio::test]
    async fn blocks_terminal_websocket_from_untrusted_page() {
        assert_eq!(
            status_for(&[
                ("host", "127.0.0.1:30303"),
                ("origin", "https://evil.example")
            ])
            .await,
            StatusCode::FORBIDDEN
        );
    }

    #[tokio::test]
    async fn allows_own_static_ui_origin() {
        assert_eq!(
            status_for(&[
                ("host", "127.0.0.1:30303"),
                ("origin", "http://127.0.0.1:30303")
            ])
            .await,
            StatusCode::OK
        );
    }

    #[tokio::test]
    async fn allows_configured_hosted_origin() {
        assert_eq!(
            status_for(&[
                ("host", "127.0.0.1:30303"),
                ("origin", "https://app.atmos.land")
            ])
            .await,
            StatusCode::OK
        );
    }

    #[tokio::test]
    async fn allows_clients_that_send_no_origin() {
        // Rust relay/tunnel bridges and the CLI never set Origin.
        assert_eq!(
            status_for(&[("host", "127.0.0.1:30303")]).await,
            StatusCode::OK
        );
    }

    #[tokio::test]
    async fn blocks_dns_rebinding_host() {
        assert_eq!(
            status_for(&[("host", "rebind.evil.example:30303")]).await,
            StatusCode::FORBIDDEN
        );
    }

    #[tokio::test]
    async fn allows_lan_ip_host_for_tailscale_access() {
        assert_eq!(
            status_for(&[("host", "100.101.102.103:30303")]).await,
            StatusCode::OK
        );
    }

    fn auth_header(token: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            format!("Bearer {token}").parse().expect("header value"),
        );
        headers
    }

    #[test]
    fn unset_token_is_not_authorization() {
        let headers = auth_header("anything");
        assert!(!is_request_authorized(&headers, None, &None));
        assert!(!is_request_authorized(
            &HeaderMap::new(),
            Some("token=anything"),
            &None
        ));
        assert!(!is_request_authorized(
            &headers,
            Some("token=anything"),
            &Some("   ".to_string())
        ));
    }

    #[test]
    fn configured_token_matches_bearer_or_query() {
        let token = Some("expected".to_string());
        assert!(is_request_authorized(
            &auth_header("expected"),
            None,
            &token
        ));
        assert!(is_request_authorized(
            &HeaderMap::new(),
            Some("foo=1&token=expected"),
            &token
        ));
        assert!(!is_request_authorized(&HeaderMap::new(), None, &token));
        assert!(!is_request_authorized(
            &auth_header("other"),
            Some("token=other"),
            &token
        ));
    }

    #[test]
    fn redact_query_token_hides_token_values() {
        assert_eq!(redact_query_token(None), "<none>");
        assert_eq!(redact_query_token(Some("a=1")), "a=1");
        assert_eq!(redact_query_token(Some("token=SECRET")), "token=REDACTED");
        assert_eq!(
            redact_query_token(Some("a=1&token=SECRET&b=2")),
            "a=1&token=REDACTED&b=2"
        );
        assert_eq!(redact_query_token(Some("Token=SECRET")), "token=REDACTED");
        assert_eq!(redact_query_token(Some("%74oken=secret")), "token=REDACTED");
        assert_eq!(redact_query_token(Some("token%3Dsecret")), "token=REDACTED");
        assert_eq!(
            redact_query_token(Some("%74oken%3Dsecret")),
            "token=REDACTED"
        );
        assert_eq!(redact_query_token(Some("TOKEN%3dSECRET")), "token=REDACTED");
        assert_eq!(
            redact_query_token(Some("%54%4f%4b%45%4e=secret")),
            "token=REDACTED"
        );
        assert_eq!(
            redact_query_token(Some("%2574oken=secret")),
            "token=REDACTED"
        );
        assert_eq!(redact_query_token(Some("notoken=secret")), "notoken=secret");
        assert_eq!(redact_query_token(Some("a=%74oken")), "a=%74oken");
        let redacted =
            redact_query_token(Some("a=1&token=SECRET&%74oken=secret&token%3Dsecret&b=2"));
        assert!(!redacted.contains("SECRET"));
        assert!(!redacted.contains("secret"));
        assert_eq!(
            redacted_request_uri(
                &"/api/system/file?token=SECRET&path=%2Ftmp%2Fa"
                    .parse()
                    .unwrap()
            ),
            "/api/system/file?token=REDACTED&path=%2Ftmp%2Fa"
        );
        assert_eq!(
            redacted_request_uri(&"/api/system/file".parse().unwrap()),
            "/api/system/file"
        );
    }

    #[test]
    fn token_comparison_is_the_sha256_xor_fold() {
        let source = include_str!("mod.rs");
        let start = source
            .find("fn constant_time_eq(a: &str, b: &str) -> bool {")
            .expect("constant_time_eq");
        let rest = &source[start..];
        let end = rest.find("\n}\n").expect("function end");
        let body = &rest[..end];
        assert!(body.contains("Sha256::digest(a.as_bytes())"), "{body}");
        assert!(body.contains("Sha256::digest(b.as_bytes())"), "{body}");
        assert!(
            body.contains("fold(0u8, |acc, (x, y)| acc | (x ^ y))"),
            "{body}"
        );
        let without_accumulator = body.replace("== 0", "");
        assert!(
            !without_accumulator.contains("=="),
            "token compare must not use == on the secrets: {body}"
        );
        assert!(!body.contains(".eq("), "{body}");
    }

    #[test]
    fn only_ipv4_mapped_loopback_is_loopback() {
        let mapped_loopback: std::net::IpAddr = "::ffff:127.0.0.1".parse().unwrap();
        let mapped_loopback_high: std::net::IpAddr = "::ffff:127.255.255.254".parse().unwrap();
        let mapped_unspecified: std::net::IpAddr = "::ffff:0.0.0.0".parse().unwrap();
        let mapped_public: std::net::IpAddr = "::ffff:8.8.8.8".parse().unwrap();
        let mapped_private: std::net::IpAddr = "::ffff:10.1.2.3".parse().unwrap();
        let mapped_lan: std::net::IpAddr = "::ffff:192.168.0.1".parse().unwrap();

        assert!(is_loopback_ip(&mapped_loopback));
        assert!(is_loopback_ip(&mapped_loopback_high));
        assert!(!is_loopback_ip(&mapped_unspecified));
        assert!(!is_loopback_ip(&mapped_public));
        assert!(!is_loopback_ip(&mapped_private));
        assert!(!is_loopback_ip(&mapped_lan));

        assert!(is_trusted_local_source(&mapped_loopback, false));
        assert!(!is_trusted_local_source(&mapped_public, false));
        assert!(!is_trusted_local_source(&mapped_unspecified, false));
        assert!(!is_trusted_local_source(&mapped_private, false));
        assert!(is_trusted_local_source(&mapped_private, true));
        assert!(!is_trusted_local_source(&mapped_public, true));
        assert!(!is_trusted_local_source(&mapped_lan, false));
    }

    fn token_router(token: Option<String>, allow_lan: bool) -> Router {
        Router::new()
            .route("/api/system/file", get(|| async { "ok" }))
            .layer(from_fn(move |connect_info, headers, request, next| {
                let token = token.clone();
                async move {
                    require_local_token(connect_info, headers, request, next, token, allow_lan)
                        .await
                }
            }))
    }

    async fn token_status(
        token: Option<String>,
        allow_lan: bool,
        peer: [u8; 4],
        query: &str,
    ) -> StatusCode {
        token_status_ip(
            token,
            allow_lan,
            std::net::Ipv4Addr::from(peer).into(),
            query,
        )
        .await
    }

    async fn token_status_ip(
        token: Option<String>,
        allow_lan: bool,
        peer: std::net::IpAddr,
        query: &str,
    ) -> StatusCode {
        let mut request = HttpRequest::builder()
            .uri(format!("/api/system/file?{query}"))
            .body(Body::empty())
            .expect("request builds");
        request
            .extensions_mut()
            .insert(ConnectInfo(SocketAddr::new(peer, 4242)));
        token_router(token, allow_lan)
            .oneshot(request)
            .await
            .expect("router responds")
            .status()
    }

    #[tokio::test]
    async fn loopback_without_token_is_allowed_and_public_is_not() {
        assert_eq!(
            token_status(None, false, [127, 0, 0, 1], "path=%2Ftmp%2Fa").await,
            StatusCode::OK
        );
        assert_eq!(
            token_status(None, false, [10, 0, 0, 1], "path=%2Ftmp%2Fa").await,
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn ipv4_mapped_loopback_is_allowed_and_other_mapped_addresses_are_not() {
        let mapped_loopback: std::net::IpAddr = "::ffff:127.0.0.1".parse().unwrap();
        let mapped_public: std::net::IpAddr = "::ffff:8.8.8.8".parse().unwrap();
        let mapped_unspecified: std::net::IpAddr = "::ffff:0.0.0.0".parse().unwrap();
        let mapped_private: std::net::IpAddr = "::ffff:192.168.0.1".parse().unwrap();
        assert_eq!(
            token_status_ip(None, false, mapped_loopback, "path=a").await,
            StatusCode::OK
        );
        assert_eq!(
            token_status_ip(None, false, mapped_public, "path=a").await,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            token_status_ip(None, false, mapped_unspecified, "path=a").await,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            token_status_ip(None, true, mapped_private, "path=a").await,
            StatusCode::OK
        );
        assert_eq!(
            token_status_ip(None, false, mapped_private, "path=a").await,
            StatusCode::UNAUTHORIZED
        );

        let destructive = Router::new()
            .route("/api/system/file", get(|| async { "ok" }))
            .layer(from_fn(|connect_info, headers, request, next| async move {
                require_loopback_or_token(connect_info, headers, request, next, None).await
            }));
        for (ip, expected) in [
            (mapped_loopback, StatusCode::OK),
            (mapped_public, StatusCode::UNAUTHORIZED),
            (mapped_unspecified, StatusCode::UNAUTHORIZED),
            (mapped_private, StatusCode::UNAUTHORIZED),
        ] {
            let mut request = HttpRequest::builder()
                .uri("/api/system/file?path=a")
                .body(Body::empty())
                .expect("request builds");
            request
                .extensions_mut()
                .insert(ConnectInfo(SocketAddr::new(ip, 9)));
            let status = destructive
                .clone()
                .oneshot(request)
                .await
                .expect("router responds")
                .status();
            assert_eq!(status, expected, "{ip}");
        }
    }

    #[tokio::test]
    async fn lan_trust_allows_private_peers_only() {
        assert_eq!(
            token_status(None, true, [10, 1, 2, 3], "path=%2Ftmp%2Fa").await,
            StatusCode::OK
        );
        assert_eq!(
            token_status(None, true, [8, 8, 8, 8], "path=%2Ftmp%2Fa").await,
            StatusCode::UNAUTHORIZED
        );
    }

    #[test]
    fn unauthorized_log_redacts_query_token() {
        let captured = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let writer_buf = captured.clone();
        let subscriber = tracing_subscriber::fmt()
            .with_ansi(false)
            .with_max_level(tracing::Level::WARN)
            .with_writer(move || LogWriter(writer_buf.clone()))
            .finish();

        // Current-thread runtime keeps the thread-local subscriber across the
        // middleware poll. A multi-thread runtime can resume the task elsewhere
        // and drop the captured line.
        let status = std::thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("runtime");
            let _guard = tracing::subscriber::set_default(subscriber);
            runtime.block_on(token_status(
                None,
                false,
                [1, 2, 3, 4],
                "token=s3cr3t-token-value&path=%2Fetc%2Fpasswd",
            ))
        })
        .join()
        .expect("log thread panicked");

        assert_eq!(status, StatusCode::UNAUTHORIZED);
        let log = captured.lock().expect("log mutex").clone();
        assert!(
            !log.contains("s3cr3t-token-value"),
            "log leaked the query token: {log}"
        );
        assert!(log.contains("REDACTED"), "log was: {log}");
    }

    #[test]
    fn access_log_span_redacts_token_on_success() {
        use tower_http::trace::TraceLayer;
        use tracing_subscriber::fmt::format::FmtSpan;

        let captured = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let writer_buf = captured.clone();
        let subscriber = tracing_subscriber::fmt()
            .with_ansi(false)
            .with_max_level(tracing::Level::DEBUG)
            .with_span_events(FmtSpan::NEW | FmtSpan::CLOSE)
            .with_writer(move || LogWriter(writer_buf.clone()))
            .finish();

        let status = std::thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("runtime");
            let _guard = tracing::subscriber::set_default(subscriber);
            runtime.block_on(async {
                let app = Router::new()
                    .route("/api/system/file", get(|| async { "ok" }))
                    .layer(TraceLayer::new_for_http().make_span_with(
                        |request: &HttpRequest<Body>| http_access_span(request),
                    ));
                let request = HttpRequest::builder()
                    .uri(
                        "/api/system/file?token=s3cr3t-token-value&path=%2Ftmp%2Flogo.png&%74oken=s3cr3t-token-value&token%3Ds3cr3t-token-value",
                    )
                    .body(Body::empty())
                    .expect("request builds");
                app.oneshot(request)
                    .await
                    .expect("router responds")
                    .status()
            })
        })
        .join()
        .expect("log thread panicked");

        assert_eq!(status, StatusCode::OK);
        let log = captured.lock().expect("log mutex").clone();
        assert!(
            !log.contains("s3cr3t-token-value"),
            "access log leaked the query token: {log}"
        );
        assert!(
            log.contains("token=REDACTED"),
            "access log was not redacted: {log}"
        );
        assert!(
            log.contains("/api/system/file"),
            "access log dropped the path: {log}"
        );
    }

    struct LogWriter(std::sync::Arc<std::sync::Mutex<String>>);

    impl std::io::Write for LogWriter {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            self.0
                .lock()
                .expect("log mutex")
                .push_str(&String::from_utf8_lossy(buf));
            Ok(buf.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
}
