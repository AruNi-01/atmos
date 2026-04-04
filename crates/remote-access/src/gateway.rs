use std::net::SocketAddr;

use axum::body::Body;
use axum::extract::{ws::WebSocket, Query, Request, State, WebSocketUpgrade};
use axum::http::{header, HeaderMap, HeaderValue, Method, Response, StatusCode, Uri};
use axum::response::IntoResponse;
use axum::routing::any;
use axum::{serve, Router};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio_tungstenite::connect_async;

use crate::session::SessionStore;
use crate::types::SessionValidation;

#[derive(Clone)]
struct GatewayState {
    target_base_url: String,
    session_store: SessionStore,
}

#[derive(Debug, Clone)]
pub struct GatewayRuntimeConfig {
    pub bind_addr: SocketAddr,
    pub target_base_url: String,
    pub session_store: SessionStore,
}

pub struct GatewayHandle {
    pub local_url: String,
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
        let listener = TcpListener::bind(config.bind_addr).await?;
        let local_addr = listener.local_addr()?;
        let (shutdown_tx, shutdown_rx) = oneshot::channel();

        let state = GatewayState {
            target_base_url: config.target_base_url,
            session_store: config.session_store,
        };

        let app = Router::new()
            .route("/ws", any(proxy_ws_root))
            .route("/ws/*path", any(proxy_ws))
            .fallback(any(proxy_http))
            .with_state(state);

        tokio::spawn(async move {
            let _ = serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx.await;
                })
                .await;
        });

        Ok(GatewayHandle {
            local_url: format!("http://{}", local_addr),
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
            return (StatusCode::UNAUTHORIZED, "remote access session required").into_response()
        }
    };

    let target_url = format!("{}{}", state.target_base_url, uri);
    let client = reqwest::Client::new();

    let mut builder = client.request(method, &target_url);
    for (key, value) in &headers {
        if key != header::HOST && key != header::COOKIE {
            builder = builder.header(key, value);
        }
    }

    let bytes = axum::body::to_bytes(request.into_body(), usize::MAX)
        .await
        .unwrap_or_default();

    let upstream = match builder.body(bytes).send().await {
        Ok(resp) => resp,
        Err(err) => {
            return (StatusCode::BAD_GATEWAY, format!("proxy failed: {err}")).into_response()
        }
    };

    let status = upstream.status();
    let mut resp_headers = HeaderMap::new();
    for (key, value) in upstream.headers() {
        resp_headers.insert(key, value.clone());
    }

    let set_cookie = build_session_cookie(&session_id);
    if let Ok(value) = HeaderValue::from_str(&set_cookie) {
        resp_headers.insert(header::SET_COOKIE, value);
    }

    let body = upstream.bytes().await.unwrap_or_default();
    (status, resp_headers, Body::from(body)).into_response()
}

async fn proxy_ws_root(
    ws: WebSocketUpgrade,
    State(state): State<GatewayState>,
    headers: HeaderMap,
    Query(query): Query<EntryQuery>,
) -> impl IntoResponse {
    proxy_ws_impl(ws, state, headers, query, String::new())
}

async fn proxy_ws(
    ws: WebSocketUpgrade,
    State(state): State<GatewayState>,
    headers: HeaderMap,
    Query(query): Query<EntryQuery>,
    axum::extract::Path(path): axum::extract::Path<String>,
) -> impl IntoResponse {
    proxy_ws_impl(ws, state, headers, query, path)
}

fn proxy_ws_impl(
    ws: WebSocketUpgrade,
    state: GatewayState,
    headers: HeaderMap,
    query: EntryQuery,
    path: String,
) -> Response<Body> {
    let session_cookie = parse_session_cookie(&headers);
    let store = state.session_store.clone();
    let token = query.entry_token;

    ws.on_upgrade(move |socket| async move {
        let validation = store
            .validate(session_cookie.as_deref(), token.as_deref())
            .await;
        if matches!(validation, SessionValidation::Unauthorized) {
            return;
        }

        let tail = if path.is_empty() {
            String::new()
        } else {
            format!("/{path}")
        };
        let ws_target = state
            .target_base_url
            .replace("http://", "ws://")
            .replace("https://", "wss://");
        let target = format!("{ws_target}/ws{tail}");

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
    format!("atmos_tunnel_session={session_id}; HttpOnly; Path=/; SameSite=Lax")
}
