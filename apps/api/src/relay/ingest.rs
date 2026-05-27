//! Outbound Cloudflare relay link (APP-016). Multiplexes browser sessions into one WSS.
//!
//! Keepalive strategy: server-initiated **WebSocket protocol PING** every 25 s. Cloudflare
//! auto-responds with PONG at the edge — the relay Durable Object is **not** woken up, so
//! keepalive traffic incurs no Worker requests, no DO CPU time, no GB-s charges.
//! See `docs/architecture/relay.md` (and `specs/APP/APP-016_atmos-computer/TECH.md`) for
//! the broader cost model.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use crate::api::ws::ClientType;
use futures_util::{SinkExt, StreamExt};
use http::header::{self, HeaderValue};
use http::StatusCode;
use runtime_manager::ServerIdentity;
use serde::Deserialize;
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info, warn};

use crate::api::ws::handlers::push_latest_messages;
use crate::app_state::AppState;
use crate::relay::external_events;
use crate::relay::http_gateway;

/// Interval between server-initiated WS protocol pings.
/// Picked below the typical NAT/firewall idle timeout (commonly 2–10 min) so the
/// outbound connection stays warm without depending on any app-level traffic.
const PING_INTERVAL: Duration = Duration::from_secs(25);

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

/// Outcome of a single relay connection attempt — used by the supervisor to
/// decide whether to retry or give up.
pub enum RunOutcome {
    /// Caller asked us to stop (`shutdown` fired). Do not reconnect.
    Shutdown,
    /// Connection dropped (peer close, write/read error, timeout). Supervisor
    /// should reconnect with backoff.
    Disconnected,
    /// Authentication or other terminal failure where retrying without
    /// operator intervention is pointless (bad credentials, computer revoked).
    Terminal(String),
}

pub async fn run(
    state: AppState,
    identity: ServerIdentity,
    shutdown: CancellationToken,
    lifecycle: RelayLifecycle,
) -> RunOutcome {
    let mut url = match reqwest::Url::parse(&identity.relay_ws_url) {
        Ok(u) => u,
        Err(e) => {
            let msg = format!("relay_ws_url parse: {e}");
            lifecycle.set_failed(&msg);
            return RunOutcome::Terminal(msg);
        }
    };

    url.query_pairs_mut()
        .append_pair("server_id", &identity.server_id);

    let ws_url = url.as_str();
    let mut req = match ws_url.into_client_request() {
        Ok(r) => r,
        Err(e) => {
            let msg = format!("relay client request: {e}");
            lifecycle.set_failed(&msg);
            return RunOutcome::Terminal(msg);
        }
    };
    let auth_header = match HeaderValue::from_str(&format!("Bearer {}", identity.server_secret)) {
        Ok(v) => v,
        Err(e) => {
            let msg = format!("authorization header: {e}");
            lifecycle.set_failed(&msg);
            return RunOutcome::Terminal(msg);
        }
    };
    req.headers_mut().insert(header::AUTHORIZATION, auth_header);

    let (ws, response) = match tokio::select! {
        _ = shutdown.cancelled() => return RunOutcome::Shutdown,
        res = connect_async(req) => res,
    } {
        Ok(pair) => pair,
        Err(e) => {
            let msg = format!("WebSocket connect failed: {e}");
            lifecycle.set_failed(&msg);
            return RunOutcome::Disconnected;
        }
    };

    // WebSocket upgrade succeeds with 101 Switching Protocols (not 2xx).
    if response.status() != StatusCode::SWITCHING_PROTOCOLS {
        let status = response.status();
        let msg = format!("Relay rejected connection (HTTP {})", status.as_u16());
        lifecycle.set_failed(&msg);
        // 401/403 = credential problem; retrying won't help without user action.
        if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            return RunOutcome::Terminal(msg);
        }
        return RunOutcome::Disconnected;
    }

    lifecycle.set_connected();
    info!(
        target: "atmos_relay",
        status = %response.status(),
        "relay upstream websocket established"
    );

    let ws: WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>> = ws;
    let (mut sink, mut stream) = ws.split();

    // Single outbound queue carrying both app-level Text frames and protocol
    // Ping/Pong frames. Keeps ordering and avoids splitting sink ownership.
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Message>();

    let writer = tokio::spawn(async move {
        while let Some(msg) = out_rx.recv().await {
            if sink.send(msg).await.is_err() {
                break;
            }
        }
        // Best-effort: close the sink cleanly so the peer doesn't have to
        // wait for a TCP timeout.
        let _ = sink.send(Message::Close(None)).await;
    });

    // Ping task: send a protocol PING every PING_INTERVAL. Cloudflare answers
    // PONG at the edge without waking the Durable Object (zero billing impact),
    // and any NAT box between us and the edge sees fresh traffic so its
    // conntrack entry never expires.
    let ping_tx = out_tx.clone();
    let ping_task = tokio::spawn(async move {
        let mut interval = tokio::time::interval(PING_INTERVAL);
        // Skip the immediate first tick — connection was just established.
        interval.tick().await;
        loop {
            interval.tick().await;
            if ping_tx.send(Message::Ping(Vec::new().into())).is_err() {
                break;
            }
        }
    });

    let sessions: Arc<RwLock<HashMap<String, Session>>> = Arc::new(RwLock::new(HashMap::new()));

    let outcome = loop {
        let next = tokio::select! {
            _ = shutdown.cancelled() => {
                info!(target: "atmos_relay", "relay shutdown requested");
                break RunOutcome::Shutdown;
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
                        let response_body = match http_gateway::handle_http_envelope(&body).await {
                            Some(body) => body,
                            None => {
                                warn!(
                                    target: "atmos_relay",
                                    request_id = %request_id,
                                    "http gateway handler returned no response"
                                );
                                http_gateway::encode_error_response(500, "gateway_internal_error")
                            }
                        };
                        let outbound = serde_json::json!({
                            "v": 1_u32,
                            "stream": "http",
                            "kind": "response",
                            "request_id": request_id,
                            "body": response_body,
                        })
                        .to_string();
                        if let Err(error) = relay_out.send(Message::Text(outbound.into())) {
                            warn!(
                                target: "atmos_relay",
                                error = %error,
                                "external event ack could not be queued; relay delivery status may remain pending"
                            );
                        }
                    });
                    continue;
                }

                if env.stream.as_deref() == Some("system") && env.kind == "external_event" {
                    let body = env.body.unwrap_or_default();
                    let relay_out = out_tx.clone();
                    let request_id = env.request_id.clone();
                    let ack_to = env.from.clone();
                    let state = state.clone();
                    tokio::spawn(async move {
                        let Some(ack_body) =
                            external_events::handle_external_event_body(&state, &body).await
                        else {
                            return;
                        };
                        let outbound = serde_json::json!({
                            "v": 1_u32,
                            "stream": "system",
                            "kind": "external_event_ack",
                            "request_id": request_id,
                            "to": ack_to,
                            "body": ack_body,
                        })
                        .to_string();
                        if let Err(error) = relay_out.send(Message::Text(outbound.into())) {
                            warn!(
                                target: "atmos_relay",
                                error = %error,
                                "external event ack send failed"
                            );
                        }
                    });
                    continue;
                }

                if env.kind != "frame" {
                    continue;
                }
                let Some(from) = env.from.clone() else {
                    continue;
                };
                let Some(rest) = from.strip_prefix("client:") else {
                    continue;
                };
                let sid = rest.to_string();

                let body = env.body.unwrap_or_default();

                let conn_id = match ensure_session(&state, &sessions, sid.clone(), &out_tx).await {
                    Ok(id) => id,
                    Err(e) => {
                        warn!(target: "atmos_relay", error = %e, "ensure_session failed");
                        continue;
                    }
                };

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
                    let _ = out_tx.send(Message::Text(outbound.into()));
                }
            }
            Some(Ok(Message::Ping(payload))) => {
                // Echo back so CF/peers know we're alive. Pong is also cheap on
                // the edge and never wakes the Durable Object.
                let _ = out_tx.send(Message::Pong(payload));
            }
            Some(Ok(Message::Pong(_))) => {
                debug!(target: "atmos_relay", "received pong from relay edge");
            }
            Some(Ok(Message::Close(frame))) => {
                info!(
                    target: "atmos_relay",
                    frame = ?frame,
                    "relay websocket closed by peer"
                );
                break RunOutcome::Disconnected;
            }
            Some(Ok(Message::Binary(_))) | Some(Ok(Message::Frame(_))) => {
                // Atmos relay only uses text envelopes; ignore stray binary frames.
            }
            Some(Err(e)) => {
                error!(
                    target: "atmos_relay",
                    error = ?e,
                    "relay read error",
                );
                break RunOutcome::Disconnected;
            }
            None => break RunOutcome::Disconnected,
        }
    };

    ping_task.abort();
    writer.abort();
    drop(out_tx);

    let mut locked = sessions.write().await;
    for (_sid, s) in locked.drain() {
        s._push_abort.abort();
        state.ws_service.unregister(&s.conn_id).await;
    }

    lifecycle.clear_connected();
    outcome
}

async fn ensure_session(
    state: &AppState,
    sessions: &Arc<RwLock<HashMap<String, Session>>>,
    sid: String,
    relay_out: &mpsc::UnboundedSender<Message>,
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
            if relay_out_clone.send(Message::Text(frame.into())).is_err() {
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
