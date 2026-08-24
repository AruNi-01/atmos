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
use crate::relay::terminal::{self, TerminalRelaySessions};

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
    #[serde(default)]
    client_type: Option<String>,
    from: Option<String>,
    #[allow(dead_code)]
    to: Option<String>,
    request_id: Option<String>,
    body: Option<String>,
}

struct Session {
    conn_id: String,
    push_task: tokio::task::JoinHandle<()>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum RelaySessionClose {
    App { sid: String },
    Terminal { sid: String },
}

fn classify_relay_session_close(
    stream: Option<&str>,
    kind: &str,
    from: Option<&str>,
) -> Option<RelaySessionClose> {
    if kind != "close" {
        return None;
    }
    let sid = from?.strip_prefix("client:")?;
    match stream {
        Some("app") => Some(RelaySessionClose::App {
            sid: sid.to_string(),
        }),
        Some("terminal") => Some(RelaySessionClose::Terminal {
            sid: sid.to_string(),
        }),
        _ => None,
    }
}

async fn close_app_virtual_session(
    sessions: &RwLock<HashMap<String, Session>>,
    sid: &str,
) -> Option<String> {
    let mut locked = sessions.write().await;
    let session = locked.remove(sid)?;
    session.push_task.abort();
    Some(session.conn_id)
}

async fn apply_app_session_close<F, Fut>(
    sessions: &RwLock<HashMap<String, Session>>,
    sid: &str,
    unregister: F,
) -> bool
where
    F: FnOnce(String) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    match close_app_virtual_session(sessions, sid).await {
        Some(conn_id) => {
            unregister(conn_id).await;
            true
        }
        None => false,
    }
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
            if ping_tx.send(Message::Ping(Vec::new())).is_err() {
                break;
            }
        }
    });

    let sessions: Arc<RwLock<HashMap<String, Session>>> = Arc::new(RwLock::new(HashMap::new()));
    let terminal_sessions: Arc<TerminalRelaySessions> = Arc::new(RwLock::new(HashMap::new()));

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
                        if let Err(error) = relay_out.send(Message::Text(outbound)) {
                            warn!(
                                target: "atmos_relay",
                                error = %error,
                                "http relay response could not be queued; delivery may have failed"
                            );
                        }
                    });
                    continue;
                }

                if env.stream.as_deref() == Some("system") && env.kind == "external_event" {
                    let Some(ack_to) = env.from.clone().filter(|value| value == "relay:github")
                    else {
                        warn!(
                            target: "atmos_relay",
                            from = ?env.from,
                            "external event missing supported relay source; ack cannot be delivered"
                        );
                        continue;
                    };
                    let body = env.body.unwrap_or_default();
                    let relay_out = out_tx.clone();
                    let request_id = env.request_id.clone();
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
                        if let Err(error) = relay_out.send(Message::Text(outbound)) {
                            warn!(
                                target: "atmos_relay",
                                error = %error,
                                "external event ack send failed"
                            );
                        }
                    });
                    continue;
                }

                if let Some(close) = classify_relay_session_close(
                    env.stream.as_deref(),
                    &env.kind,
                    env.from.as_deref(),
                ) {
                    match close {
                        RelaySessionClose::Terminal { sid } => {
                            terminal::handle_terminal_client_close(
                                &state,
                                &terminal_sessions,
                                &sid,
                            )
                            .await;
                        }
                        RelaySessionClose::App { sid } => {
                            apply_app_session_close(&sessions, &sid, |conn_id| {
                                let ws_service = Arc::clone(&state.ws_service);
                                async move { ws_service.unregister(&conn_id).await }
                            })
                            .await;
                        }
                    }
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

                if env.stream.as_deref() == Some("terminal") {
                    terminal::handle_terminal_frame(
                        &state,
                        &terminal_sessions,
                        &sid,
                        &body,
                        &out_tx,
                    )
                    .await;
                    continue;
                }

                let client_type = env
                    .client_type
                    .as_deref()
                    .map(ClientType::parse)
                    .unwrap_or(ClientType::Web);
                let conn_id = match ensure_session(
                    &state,
                    &sessions,
                    sid.clone(),
                    client_type,
                    &out_tx,
                )
                .await
                {
                    Ok(id) => id,
                    Err(e) => {
                        warn!(target: "atmos_relay", error = %e, "ensure_session failed");
                        continue;
                    }
                };

                let state = state.clone();
                let out_tx = out_tx.clone();
                tokio::spawn(async move {
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
                        let _ = out_tx.send(Message::Text(outbound));
                    }
                });
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
        s.push_task.abort();
        state.ws_service.unregister(&s.conn_id).await;
    }
    drop(locked);

    let mut terminal_locked = terminal_sessions.write().await;
    for (_sid, s) in terminal_locked.drain() {
        s.output_task.abort();
        if !s.destroy_requested {
            let _ = state.terminal_service.close_session(&s.session_id).await;
        }
    }

    lifecycle.clear_connected();
    outcome
}

async fn ensure_session(
    state: &AppState,
    sessions: &Arc<RwLock<HashMap<String, Session>>>,
    sid: String,
    client_type: ClientType,
    relay_out: &mpsc::UnboundedSender<Message>,
) -> Result<String, String> {
    let mut locked = sessions.write().await;

    if let Some(existing) = locked.get(&sid) {
        return Ok(existing.conn_id.clone());
    }

    let (tx, mut rx) = mpsc::channel::<String>(32);
    let conn_id = state.ws_service.register(client_type, tx.clone()).await;

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
            if relay_out_clone.send(Message::Text(frame)).is_err() {
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
            push_task,
        },
    );

    Ok(conn_id)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Arc;
    use std::time::Duration;

    use tokio::sync::{oneshot, RwLock};

    use super::{
        apply_app_session_close, classify_relay_session_close, RelaySessionClose, Session,
    };

    fn pending_session(conn_id: &str) -> (Session, oneshot::Receiver<()>) {
        let (alive_tx, alive_rx) = oneshot::channel();
        let push_task = tokio::spawn(async move {
            let _alive_tx = alive_tx;
            std::future::pending::<()>().await;
        });
        (
            Session {
                conn_id: conn_id.to_string(),
                push_task,
            },
            alive_rx,
        )
    }

    #[test]
    fn app_close_classifies_only_app_stream_close() {
        assert_eq!(
            classify_relay_session_close(Some("app"), "close", Some("client:sid-a")),
            Some(RelaySessionClose::App {
                sid: "sid-a".to_string(),
            })
        );
        assert_eq!(
            classify_relay_session_close(Some("terminal"), "close", Some("client:sid-t")),
            Some(RelaySessionClose::Terminal {
                sid: "sid-t".to_string(),
            })
        );
        assert_eq!(
            classify_relay_session_close(Some("app"), "frame", Some("client:sid-a")),
            None
        );
        assert_eq!(
            classify_relay_session_close(Some("app"), "close", Some("server")),
            None
        );
        assert_eq!(
            classify_relay_session_close(Some("app"), "close", None),
            None
        );
        assert_eq!(
            classify_relay_session_close(None, "close", Some("client:sid-a")),
            None
        );
        assert_eq!(
            classify_relay_session_close(Some("http"), "close", Some("client:sid-a")),
            None
        );
    }

    #[tokio::test]
    async fn app_close_removes_only_target_and_exposes_unregister_id() {
        let sessions = RwLock::new(HashMap::new());
        let (target, target_alive) = pending_session("conn-a");
        let (other, _other_alive) = pending_session("conn-b");
        sessions.write().await.insert("sid-a".to_string(), target);
        sessions.write().await.insert("sid-b".to_string(), other);

        let cleaned = Arc::new(tokio::sync::Mutex::new(Vec::<String>::new()));
        let cleaned_cb = Arc::clone(&cleaned);
        assert!(
            apply_app_session_close(&sessions, "sid-a", |conn_id| {
                let cleaned_cb = Arc::clone(&cleaned_cb);
                async move {
                    cleaned_cb.lock().await.push(conn_id);
                }
            })
            .await,
            "app-close must invoke cleanup for the target session"
        );

        let locked = sessions.read().await;
        assert!(!locked.contains_key("sid-a"));
        assert!(locked.contains_key("sid-b"));
        assert_eq!(
            locked.get("sid-b").map(|s| s.conn_id.as_str()),
            Some("conn-b")
        );
        drop(locked);

        let result = tokio::time::timeout(Duration::from_secs(1), target_alive)
            .await
            .expect("timed out waiting for target push task abort");
        assert!(
            result.is_err(),
            "app-close must abort only the target push task"
        );
        assert_eq!(cleaned.lock().await.as_slice(), ["conn-a"]);
        assert!(
            !apply_app_session_close(&sessions, "sid-a", |_conn_id| async {}).await,
            "closing an already-removed sid must be a no-op"
        );
        assert_eq!(
            sessions
                .read()
                .await
                .get("sid-b")
                .map(|s| s.conn_id.as_str()),
            Some("conn-b")
        );
    }
}
