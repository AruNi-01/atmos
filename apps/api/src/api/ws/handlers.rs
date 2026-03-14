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
use serde::Deserialize;
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
    while let Some(result) = receiver.next().await {
        match result {
            Ok(msg) => {
                if !handle_incoming_message(msg, &tx, &state, &conn_id).await {
                    break;
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

/// Handle incoming WebSocket message
/// Returns false if connection should be closed
async fn handle_incoming_message(
    msg: Message,
    tx: &mpsc::Sender<String>,
    state: &AppState,
    conn_id: &str,
) -> bool {
    match msg {
        Message::Text(text) => {
            let text_str: &str = text.as_ref();

            // Unified message handling - infra layer handles both control and business messages
            if let Some(response) = state.ws_service.handle_message(conn_id, text_str).await {
                // Send response if there is one
                if let Err(e) = tx.send(response).await {
                    tracing::warn!("Failed to send response to {}: {}", conn_id, e);
                    return false;
                }
            }

            true
        }
        Message::Close(_) => false,
        _ => true,
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
