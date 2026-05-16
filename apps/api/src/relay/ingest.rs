//! Outbound Cloudflare relay link (APP-016). Multiplexes browser sessions into one WSS.

use std::collections::HashMap;
use std::sync::Arc;

use runtime_manager::ServerIdentity;
use futures_util::{SinkExt, StreamExt};
use http;
use infra::ClientType;
use serde::Deserialize;
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};
use tracing::{error, info, warn};

use crate::api::ws::handlers::push_latest_messages;
use crate::app_state::AppState;

#[derive(Debug, Deserialize)]
struct RelayEnvelope {
    v: u32,
    kind: String,
    from: Option<String>,
    #[allow(dead_code)]
    to: Option<String>,
    body: Option<String>,
}

struct Session {
    conn_id: String,
    _push_abort: tokio::task::JoinHandle<()>,
}

pub async fn run(state: AppState, identity: ServerIdentity) -> Result<(), String> {
    let mut url = reqwest::Url::parse(&identity.relay_ws_url)
        .map_err(|e| format!("relay_ws_url parse: {e}"))?;

    url.query_pairs_mut()
        .append_pair("server_id", &identity.server_id);

    let uri: http::Uri = url
        .as_str()
        .parse()
        .map_err(|e| format!("relay_ws_uri parse: {e}"))?;

    let req = http::Request::builder()
        .method("GET")
        .uri(uri)
        .header(
            http::header::AUTHORIZATION,
            format!("Bearer {}", identity.server_secret),
        )
        .body(())
        .map_err(|e| format!("relay request build: {e}"))?;

    let (ws, response) = connect_async(req).await.map_err(|e| e.to_string())?;
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
        let next = stream.next().await;
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
                if env.v != 1 || env.kind != "frame" {
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
