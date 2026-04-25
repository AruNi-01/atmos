//! WebSocket HTTP Upgrade handler for Axum.
//!
//! This module only handles the HTTP -> WebSocket upgrade.
//! All message processing is delegated to infra::WsService.

use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket},
        Query, State, WebSocketUpgrade,
    },
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use infra::{ClientType, WsMessage};
use infra::utils::debug_logging::DebugLogger;
use serde::Deserialize;
use serde_json::Value;
use tokio::sync::{mpsc, watch};

use crate::app_state::AppState;

#[derive(Debug, Deserialize)]
pub struct WsQueryParams {
    #[serde(default = "default_client_type")]
    pub client_type: String,
}

fn default_client_type() -> String {
    "web".to_string()
}

fn dbg() -> DebugLogger {
    DebugLogger::new("backend-ws-main")
}

fn extract_request_meta(text: &str) -> Option<(String, String)> {
    let value: Value = serde_json::from_str(text).ok()?;
    let payload = value.get("payload")?;
    let request_id = payload.get("request_id")?.as_str()?.to_string();
    let action = payload.get("action")?.as_str()?.to_string();
    Some((request_id, action))
}

/// HTTP Upgrade handler - this is the only Axum-specific code
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<WsQueryParams>,
    State(state): State<AppState>,
) -> Response {
    let client_type = ClientType::parse(&params.client_type);
    ws.on_upgrade(move |socket| handle_socket(socket, state, client_type))
}

/// Handle the WebSocket connection after upgrade
async fn handle_socket(socket: WebSocket, state: AppState, client_type: ClientType) {
    let (mut sender, mut receiver) = socket.split();

    // Create channel for sending messages
    let (tx, mut rx) = mpsc::channel::<String>(32);

    // Register connection with WsService (in infra layer)
    let conn_id = state.ws_service.register(client_type, tx.clone()).await;
    tracing::info!("WebSocket connection established: {}", conn_id);

    // Task: Forward messages from channel to WebSocket
    let conn_id_send = conn_id.clone();
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                tracing::warn!("Failed to send message to {}", conn_id_send);
                break;
            }
        }
    });

    // Task: Push messages to client when updates arrive.
    // Use a versioned watch channel so updates cannot be missed between a final
    // state check and the next wait.
    let conn_id_push = conn_id.clone();
    let tx_push = tx.clone();
    let message_push_service = Arc::clone(&state.message_push_service);
    let updates = message_push_service.subscribe();
    let push_task = tokio::spawn(push_latest_messages(
        message_push_service,
        updates,
        conn_id_push,
        tx_push,
    ));

    // Main loop: Receive messages and delegate to WsService
    let state_recv = state.clone();
    while let Some(result) = receiver.next().await {
        match result {
            Ok(msg) => {
                match msg {
                    Message::Text(text) => {
                        let tx_task = tx.clone();
                        let state_task = state_recv.clone();
                        let conn_id_task = conn_id.clone();
                        let meta = extract_request_meta(text.as_ref());
                        if let Some((request_id, action)) = &meta {
                            if action.starts_with("lsp_") {
                                dbg().log(
                                    "WS_REQUEST_RECV",
                                    "received websocket request",
                                    Some(serde_json::json!({
                                        "conn_id": conn_id_task,
                                        "request_id": request_id,
                                        "action": action,
                                    })),
                                );
                            }
                        }
                        tokio::spawn(async move {
                            let text_str: &str = text.as_ref();
                            if let Some(response) =
                                state_task.ws_service.handle_message(&conn_id_task, text_str).await
                            {
                                if let Some((request_id, action)) = &meta {
                                    if action.starts_with("lsp_") {
                                        dbg().log(
                                            "WS_RESPONSE_SEND",
                                            "sending websocket response",
                                            Some(serde_json::json!({
                                                "conn_id": conn_id_task,
                                                "request_id": request_id,
                                                "action": action,
                                            })),
                                        );
                                    }
                                }
                                if let Err(e) = tx_task.send(response).await {
                                    tracing::warn!(
                                        "Failed to send response to {}: {}",
                                        conn_id_task,
                                        e
                                    );
                                }
                            }
                        });
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
            Err(e) => {
                tracing::error!("WebSocket error: {}", e);
                break;
            }
        }
    }

    // Cleanup
    push_task.abort();
    send_task.abort();
    state.ws_service.unregister(&conn_id).await;
    tracing::info!("WebSocket connection closed: {}", conn_id);
}

async fn push_latest_messages(
    message_push_service: Arc<core_service::MessagePushService>,
    mut updates: watch::Receiver<u64>,
    conn_id: String,
    tx_push: mpsc::Sender<String>,
) {
    'outer: loop {
        match message_push_service.wait_for_update(&mut updates).await {
            Ok(true) => {}
            Ok(false) => continue,
            Err(_) => break,
        }

        let (_, latest) = message_push_service.get_latest_snapshot().await;
        if latest.is_empty() {
            continue;
        }

        let msg = WsMessage::message(&conn_id, &latest);
        if let Ok(json) = msg.to_json() {
            if tx_push.send(json).await.is_err() {
                break 'outer;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use core_service::MessagePushService;
    use tokio::sync::mpsc;

    use super::push_latest_messages;

    #[tokio::test]
    async fn push_loop_delivers_first_update_after_subscribe() {
        let service = std::sync::Arc::new(MessagePushService::new());
        let (tx, mut rx) = mpsc::channel(1);

        let task = tokio::spawn(push_latest_messages(
            std::sync::Arc::clone(&service),
            service.subscribe(),
            "conn-1".to_string(),
            tx,
        ));

        service.update_latest_message("hello").await;

        let payload = tokio::time::timeout(Duration::from_millis(200), rx.recv())
            .await
            .expect("push task should forward the first update")
            .expect("channel should stay open");

        assert!(payload.contains("hello"));

        task.abort();
    }
}
