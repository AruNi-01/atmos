//! Outbound Cloudflare relay link (APP-016). Multiplexes browser sessions into one WSS.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use runtime_manager::ServerIdentity;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::oneshot;
use http::header::{self, HeaderValue};
use http::StatusCode;
use infra::ClientType;
use serde::Deserialize;
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};
use tracing::{error, info, warn};

use crate::api::ws::handlers::push_latest_messages;
use crate::app_state::AppState;
use crate::relay::http_gateway;

#[derive(Debug, Deserialize)]
struct RelayEnvelope {
    v: u32,
    #[serde(default)]
    stream: Option<String>,
    kind: String,
    from: Option<String>,
    #[allow(dead_code)]
    to: Option<String>,
    request_id: Option<String>,
    body: Option<String>,
}

struct Session {
    conn_id: String,
    _push_abort: tokio::task::JoinHandle<()>,
}

/// Shared flags updated by the outbound relay task for status APIs.
#[derive(Clone)]
pub struct RelayLifecycle {
    upstream_connected: Arc<AtomicBool>,
    last_error: Arc<tokio::sync::Mutex<Option<String>>>,
}

impl RelayLifecycle {
    pub fn new(
        upstream_connected: Arc<AtomicBool>,
        last_error: Arc<tokio::sync::Mutex<Option<String>>>,
    ) -> Self {
        Self {
            upstream_connected,
            last_error,
        }
    }

    fn set_connected(&self) {
        self.upstream_connected.store(true, Ordering::SeqCst);
    }

    fn set_failed(&self, message: impl Into<String>) {
        self.upstream_connected.store(false, Ordering::SeqCst);
        if let Ok(mut guard) = self.last_error.try_lock() {
            *guard = Some(message.into());
        }
    }

    fn clear_connected(&self) {
        self.upstream_connected.store(false, Ordering::SeqCst);
    }
}

pub async fn run(
    state: AppState,
    identity: ServerIdentity,
    mut shutdown: oneshot::Receiver<()>,
    lifecycle: RelayLifecycle,
) -> Result<(), String> {
    let mut url = reqwest::Url::parse(&identity.relay_ws_url)
        .map_err(|e| format!("relay_ws_url parse: {e}"))?;

    url.query_pairs_mut()
        .append_pair("server_id", &identity.server_id);

    let ws_url = url.as_str();
    let mut req = ws_url
        .into_client_request()
        .map_err(|e| format!("relay client request: {e}"))?;
    req.headers_mut().insert(
        header::AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", identity.server_secret))
            .map_err(|e| format!("authorization header: {e}"))?,
    );

    let (ws, response) = match tokio::select! {
        _ = &mut shutdown => return Ok(()),
        res = connect_async(req) => res,
    } {
        Ok(pair) => pair,
        Err(e) => {
            let msg = format!("WebSocket connect failed: {e}");
            lifecycle.set_failed(&msg);
            return Err(msg);
        }
    };

    // WebSocket upgrade succeeds with 101 Switching Protocols (not 2xx).
    if response.status() != StatusCode::SWITCHING_PROTOCOLS {
        let msg = format!(
            "Relay rejected connection (HTTP {})",
            response.status().as_u16()
        );
        lifecycle.set_failed(&msg);
        return Err(msg);
    }

    lifecycle.set_connected();
    info!(
        target: "atmos_relay",
        status = %response.status(),
        "relay upstream websocket established"
    );

    let ws: WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>> = ws;
    let (mut sink, mut stream) = ws.split();

    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();

    let writer = tokio::spawn(async move {
        while let Some(msg) = out_rx.recv().await {
            if sink.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    let sessions: Arc<RwLock<HashMap<String, Session>>> = Arc::new(RwLock::new(HashMap::new()));

    loop {
        let next = tokio::select! {
            _ = &mut shutdown => {
                info!(target: "atmos_relay", "relay shutdown requested");
                break;
            }
            msg = stream.next() => msg,
        };
        match next {
            Some(Ok(Message::Text(t))) => {
                let env: RelayEnvelope = match serde_json::from_str(&t) {
                    Ok(v) => v,
                    Err(e) => {
                        warn!(
                            target: "atmos_relay",
                            error = %e,
                            "relay envelope decode failed",
                        );
                        continue;
                    }
                };
                if env.v != 1 {
                    continue;
                }

                if env.stream.as_deref() == Some("http") && env.kind == "request" {
                    let Some(request_id) = env.request_id.clone() else {
                        continue;
                    };
                    let body = env.body.unwrap_or_default();
                    let relay_out = out_tx.clone();
                    tokio::spawn(async move {
                        let response_body =
                            http_gateway::handle_http_envelope(&body).await.unwrap_or_default();
                        let outbound = serde_json::json!({
                            "v": 1_u32,
                            "stream": "http",
                            "kind": "response",
                            "request_id": request_id,
                            "body": response_body,
                        })
                        .to_string();
                        let _ = relay_out.send(outbound);
                    });
                    continue;
                }

                if env.kind != "frame" {
                    continue;
                }
                let Some(from) = env.from.clone() else { continue };
                let Some(rest) = from.strip_prefix("client:") else {
                    continue;
                };
                let sid = rest.to_string();

                let body = env.body.unwrap_or_default();

                let conn_id =
                    ensure_session(&state, &sessions, sid.clone(), &out_tx).await?;

                if let Some(reply) = state.ws_service.handle_message(&conn_id, &body).await {
                    let outbound = serde_json::json!( {
                        "v": 1_u32,
                        "stream": "app",
                        "kind": "frame",
                        "from": "server",
                        "to": format!("client:{sid}"),
                        "body": reply,
                    })
                    .to_string();
                    let _ = out_tx.send(outbound);
                }
            }
            Some(Ok(Message::Close(_))) => {
                info!(target: "atmos_relay", "relay websocket closed by peer");
                break;
            }
            Some(Err(e)) => {
                error!(
                    target: "atmos_relay",
                    error = ?e,
                    "relay read error",
                );
                break;
            }
            None => break,
            _ => {}
        }
    }

    writer.abort();
    drop(out_tx);

    let mut locked = sessions.write().await;
    for (_sid, s) in locked.drain() {
        s._push_abort.abort();
        state.ws_service.unregister(&s.conn_id).await;
    }

    lifecycle.clear_connected();
    Ok(())
}

async fn ensure_session(
    state: &AppState,
    sessions: &Arc<RwLock<HashMap<String, Session>>>,
    sid: String,
    relay_out: &mpsc::UnboundedSender<String>,
) -> Result<String, String> {
    let mut locked = sessions.write().await;

    if let Some(existing) = locked.get(&sid) {
        return Ok(existing.conn_id.clone());
    }

    let (tx, mut rx) = mpsc::channel::<String>(32);
    let conn_id = state.ws_service.register(ClientType::Web, tx.clone()).await;

    let relay_out_clone = relay_out.clone();
    let sid_for_task = sid.clone();
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let frame = serde_json::json!( {
                "v": 1_u32,
                "stream": "app",
                "kind": "frame",
                "from": "server",
                "to": format!("client:{sid_for_task}"),
                "body": msg,
            })
            .to_string();
            if relay_out_clone.send(frame).is_err() {
                break;
            }
        }
    });

    let updates = state.message_push_service.subscribe();
    let push_task = tokio::spawn(push_latest_messages(
        Arc::clone(&state.message_push_service),
        updates,
        conn_id.clone(),
        tx.clone(),
    ));

    locked.insert(
        sid,
        Session {
            conn_id: conn_id.clone(),
            _push_abort: push_task,
        },
    );

    Ok(conn_id)
}
