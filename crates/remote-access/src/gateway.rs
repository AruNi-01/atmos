use std::net::SocketAddr;

use axum::body::Body;
use axum::extract::{ws::WebSocket, Query, Request, State, WebSocketUpgrade};
use axum::http::{header, HeaderMap, HeaderValue, Method, Response, StatusCode, Uri};
use axum::response::IntoResponse;
use axum::routing::any;
use axum::{serve, Router};
use futures_util::{SinkExt, StreamExt};
use reqwest::redirect::Policy;
use serde::Deserialize;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio_tungstenite::connect_async;

use crate::session::SessionStore;
use crate::types::SessionValidation;

const MAX_PROXY_BODY_BYTES: usize = 10 * 1024 * 1024;

#[derive(Clone)]
struct GatewayState {
    target_base_url: String,
    session_store: SessionStore,
    client: reqwest::Client,
}

#[derive(Debug, Clone)]
pub struct GatewayRuntimeConfig {
    pub bind_addr: SocketAddr,
    pub target_base_url: String,
    pub session_store: SessionStore,
}

pub struct GatewayHandle {
    pub local_url: String,
    pub error_rx: tokio::sync::watch::Receiver<Option<String>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

impl GatewayHandle {
    pub async fn shutdown(mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }
}

pub struct GatewayRuntime;

impl GatewayRuntime {
    pub async fn start(config: GatewayRuntimeConfig) -> anyhow::Result<GatewayHandle> {
        // Use std::net::TcpListener (synchronous) instead of tokio's async bind.
        // In the Tauri runtime context, tokio::net::TcpListener::bind().await
        // can hang indefinitely; the sync bind + from_std conversion avoids that.
        let std_listener = std::net::TcpListener::bind(config.bind_addr)?;
        std_listener.set_nonblocking(true)?;
        let listener = TcpListener::from_std(std_listener)?;
        let local_addr = listener.local_addr()?;
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let (error_tx, error_rx) = tokio::sync::watch::channel(None);

        let state = GatewayState {
            target_base_url: config.target_base_url,
            session_store: config.session_store,
            client: reqwest::Client::builder()
                .redirect(Policy::none())
                .build()?,
        };

        let app = Router::new()
            .route("/ws", any(proxy_ws_root))
            .route("/ws/{*path}", any(proxy_ws))
            .fallback(any(proxy_http))
            .with_state(state);

        tokio::spawn(async move {
            let result = serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx.await;
                })
                .await;
            if let Err(err) = result {
                let _ = error_tx.send(Some(err.to_string()));
            }
        });

        Ok(GatewayHandle {
            local_url: format!("http://{}", local_addr),
            error_rx,
            shutdown_tx: Some(shutdown_tx),
        })
    }
}

#[derive(Debug, Deserialize)]
struct EntryQuery {
    entry_token: Option<String>,
}

async fn proxy_http(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    method: Method,
    uri: Uri,
    Query(query): Query<EntryQuery>,
    request: Request,
) -> impl IntoResponse {
    let session_cookie = parse_session_cookie(&headers);
    let validation = state
        .session_store
        .validate(session_cookie.as_deref(), query.entry_token.as_deref())
        .await;

    let session_id = match validation {
        SessionValidation::Authorized { session_id } => session_id,
        SessionValidation::Unauthorized => {
            return unauthorized_html_response().into_response();
        }
    };

    // If the request carried an entry_token in the URL, redirect to strip it.
    // The session cookie set below persists across the redirect, so the user
    // lands on the clean URL without the token in history or Referer headers.
    if query.entry_token.is_some() {
        let clean_uri = strip_entry_token_from_uri(&uri);
        let set_cookie = build_session_cookie(&session_id);
        let resp = Response::builder()
            .status(StatusCode::FOUND)
            .header(header::LOCATION, clean_uri.to_string())
            .header(header::SET_COOKIE, set_cookie)
            .body(Body::empty())
            .unwrap_or_else(|_| Response::new(Body::empty()));
        return resp.into_response();
    }

    let target_url = format!("{}{}", state.target_base_url, uri);
    let mut builder = state.client.request(method, &target_url);
    for (key, value) in &headers {
        if key != header::HOST && key != header::COOKIE {
            builder = builder.header(key, value);
        }
    }

    let bytes = match axum::body::to_bytes(request.into_body(), MAX_PROXY_BODY_BYTES).await {
        Ok(bytes) => bytes,
        Err(_) => {
            return (
                StatusCode::PAYLOAD_TOO_LARGE,
                format!("request body exceeds {MAX_PROXY_BODY_BYTES} bytes"),
            )
                .into_response()
        }
    };

    let upstream = match builder.body(bytes).send().await {
        Ok(resp) => resp,
        Err(err) => {
            return (StatusCode::BAD_GATEWAY, format!("proxy failed: {err}")).into_response()
        }
    };

    let status = upstream.status();
    let mut resp_headers = HeaderMap::new();
    for (key, value) in upstream.headers() {
        resp_headers.append(key, value.clone());
    }

    let set_cookie = build_session_cookie(&session_id);
    if let Ok(value) = HeaderValue::from_str(&set_cookie) {
        resp_headers.append(header::SET_COOKIE, value);
    }

    let body = upstream.bytes().await.unwrap_or_default();
    (status, resp_headers, Body::from(body)).into_response()
}

async fn proxy_ws_root(
    ws: WebSocketUpgrade,
    State(state): State<GatewayState>,
    headers: HeaderMap,
    uri: Uri,
    Query(query): Query<EntryQuery>,
) -> impl IntoResponse {
    let raw_query = uri.query().unwrap_or("").to_string();
    proxy_ws_impl(ws, state, headers, query, String::new(), raw_query).await
}

async fn proxy_ws(
    ws: WebSocketUpgrade,
    State(state): State<GatewayState>,
    headers: HeaderMap,
    uri: Uri,
    Query(query): Query<EntryQuery>,
    axum::extract::Path(path): axum::extract::Path<String>,
) -> impl IntoResponse {
    let raw_query = uri.query().unwrap_or("").to_string();
    proxy_ws_impl(ws, state, headers, query, path, raw_query).await
}

async fn proxy_ws_impl(
    ws: WebSocketUpgrade,
    state: GatewayState,
    headers: HeaderMap,
    query: EntryQuery,
    path: String,
    raw_query: String,
) -> Response<Body> {
    let session_cookie = parse_session_cookie(&headers);
    let validation = state
        .session_store
        .validate(session_cookie.as_deref(), query.entry_token.as_deref())
        .await;
    if matches!(validation, SessionValidation::Unauthorized) {
        return (StatusCode::UNAUTHORIZED, "remote access session required\n\nProvide ?entry_token=<token> in the URL").into_response();
    }

    let target = build_ws_target(&state.target_base_url, &path, &raw_query);
    ws.on_upgrade(move |socket| async move {
        if let Ok((upstream, _)) = connect_async(target).await {
            bridge_websocket(socket, upstream).await;
        }
    })
}

async fn bridge_websocket(
    client: WebSocket,
    upstream: tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
) {
    let (mut client_write, mut client_read) = client.split();
    let (mut up_write, mut up_read) = upstream.split();

    let to_upstream = async {
        while let Some(Ok(msg)) = client_read.next().await {
            let mapped = match msg {
                axum::extract::ws::Message::Text(text) => {
                    tokio_tungstenite::tungstenite::Message::Text(text.to_string())
                }
                axum::extract::ws::Message::Binary(bin) => {
                    tokio_tungstenite::tungstenite::Message::Binary(bin.to_vec())
                }
                axum::extract::ws::Message::Ping(v) => {
                    tokio_tungstenite::tungstenite::Message::Ping(v.to_vec())
                }
                axum::extract::ws::Message::Pong(v) => {
                    tokio_tungstenite::tungstenite::Message::Pong(v.to_vec())
                }
                axum::extract::ws::Message::Close(_) => {
                    tokio_tungstenite::tungstenite::Message::Close(None)
                }
            };
            if up_write.send(mapped).await.is_err() {
                break;
            }
        }
    };

    let to_client = async {
        while let Some(Ok(msg)) = up_read.next().await {
            let mapped = match msg {
                tokio_tungstenite::tungstenite::Message::Text(text) => {
                    axum::extract::ws::Message::Text(text.into())
                }
                tokio_tungstenite::tungstenite::Message::Binary(bin) => {
                    axum::extract::ws::Message::Binary(bin.into())
                }
                tokio_tungstenite::tungstenite::Message::Ping(v) => {
                    axum::extract::ws::Message::Ping(v.into())
                }
                tokio_tungstenite::tungstenite::Message::Pong(v) => {
                    axum::extract::ws::Message::Pong(v.into())
                }
                tokio_tungstenite::tungstenite::Message::Close(_) => {
                    axum::extract::ws::Message::Close(None)
                }
                tokio_tungstenite::tungstenite::Message::Frame(_) => continue,
            };
            if client_write.send(mapped).await.is_err() {
                break;
            }
        }
    };

    tokio::select! {
        _ = to_upstream => {},
        _ = to_client => {},
    }
}

fn unauthorized_html_response() -> impl IntoResponse {
    let html = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Atmos Remote Access</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #141414;
      border: 1px solid #262626;
      border-radius: 12px;
      padding: 32px;
      width: 100%;
      max-width: 420px;
    }
    h1 { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
    p { font-size: 13px; color: #737373; margin-bottom: 24px; line-height: 1.6; }
    label { display: block; font-size: 12px; font-weight: 500; margin-bottom: 6px; color: #a3a3a3; }
    input {
      width: 100%;
      background: #0a0a0a;
      border: 1px solid #262626;
      border-radius: 6px;
      color: #e5e5e5;
      font-size: 13px;
      font-family: monospace;
      padding: 10px 12px;
      outline: none;
      margin-bottom: 16px;
      transition: border-color 0.15s;
    }
    input:focus { border-color: #525252; }
    button {
      width: 100%;
      background: #e5e5e5;
      color: #0a0a0a;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      padding: 10px;
      cursor: pointer;
      transition: background 0.15s;
    }
    button:hover { background: #d4d4d4; }
    .error { color: #ef4444; font-size: 12px; margin-top: -8px; margin-bottom: 12px; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Atmos Remote Access</h1>
    <p>Enter the access token from your Atmos desktop app to continue.</p>
    <label for="token">Access Token</label>
    <input id="token" type="password" placeholder="Paste your entry token here" autocomplete="off" />
    <p class="error" id="err">Invalid token. Please try again.</p>
    <button onclick="submit()">Access</button>
  </div>
  <script>
    // Pre-fill from URL if already provided (shows error state)
    var params = new URLSearchParams(location.search);
    if (params.get('entry_token')) {
      document.getElementById('err').style.display = 'block';
    }
    document.getElementById('token').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') submit();
    });
    function submit() {
      var token = document.getElementById('token').value.trim();
      if (!token) return;
      var url = new URL(location.href);
      url.searchParams.set('entry_token', token);
      location.href = url.toString();
    }
  </script>
</body>
</html>"#;
    (
        StatusCode::UNAUTHORIZED,
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        html,
    )
}

fn parse_session_cookie(headers: &HeaderMap) -> Option<String> {
    let cookie_header = headers.get(header::COOKIE)?.to_str().ok()?;
    for part in cookie_header.split(';') {
        let trimmed = part.trim();
        if let Some(value) = trimmed.strip_prefix("atmos_tunnel_session=") {
            return Some(value.to_string());
        }
    }
    None
}

fn build_session_cookie(session_id: &str) -> String {
    format!("atmos_tunnel_session={session_id}; HttpOnly; Secure; Path=/; SameSite=Lax")
}

fn build_ws_target(target_base_url: &str, path: &str, raw_query: &str) -> String {
    let tail = if path.is_empty() {
        String::new()
    } else {
        format!("/{path}")
    };
    let ws_target = target_base_url
        .replace("http://", "ws://")
        .replace("https://", "wss://");
    let upstream_query = strip_entry_token_from_query(raw_query);
    if upstream_query.is_empty() {
        format!("{ws_target}/ws{tail}")
    } else {
        format!("{ws_target}/ws{tail}?{upstream_query}")
    }
}

/// Remove `entry_token` from a query string, preserving all other parameters.
fn strip_entry_token_from_query(raw_query: &str) -> String {
    raw_query
        .split('&')
        .filter(|part| {
            let key = part.split('=').next().unwrap_or("");
            key != "entry_token"
        })
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("&")
}

/// Rebuild the URI without the `entry_token` query parameter.
fn strip_entry_token_from_uri(uri: &Uri) -> Uri {
    let query = uri.query().unwrap_or("");
    let clean_query = strip_entry_token_from_query(query);
    let path = uri.path();
    let new_path_and_query = if clean_query.is_empty() {
        path.to_string()
    } else {
        format!("{path}?{clean_query}")
    };
    Uri::builder()
        .path_and_query(new_path_and_query)
        .build()
        .unwrap_or_else(|_| uri.clone())
}
