//! Terminal WebSocket handler for PTY communication
//!
//! This handler manages WebSocket connections for terminal sessions,
//! bridging the frontend xterm.js with backend portable-pty.

use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, State, WebSocketUpgrade,
    },
    response::Response,
};
use core_service::{TerminalResponse, TerminalService};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

use crate::app_state::AppState;

/// Terminal query parameters
#[derive(Debug, Deserialize)]
pub struct TerminalWsQuery {
    pub workspace_id: Option<String>,
    pub shell: Option<String>,
}

/// Terminal message from client
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientTerminalMessage {
    TerminalCreate {
        workspace_id: String,
        shell: Option<String>,
    },
    TerminalInput {
        data: String,
    },
    TerminalResize {
        cols: u16,
        rows: u16,
    },
    TerminalClose,
}

/// Terminal WebSocket upgrade handler
pub async fn terminal_ws_handler(
    Path(session_id): Path<String>,
    State(state): State<AppState>,
    axum::extract::Query(query): axum::extract::Query<TerminalWsQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    let workspace_id = query
        .workspace_id
        .clone()
        .unwrap_or_else(|| "default".to_string());
    let shell = query.shell.clone();

    info!(
        "Terminal WebSocket upgrade request for session: {} (workspace: {})",
        session_id, workspace_id
    );

    ws.on_upgrade(move |socket| {
        handle_terminal_socket(socket, session_id, workspace_id, shell, state)
    })
}

/// Handle the terminal WebSocket connection
async fn handle_terminal_socket(
    socket: WebSocket,
    session_id: String,
    workspace_id: String,
    shell: Option<String>,
    state: AppState,
) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    info!(
        "Terminal WebSocket connected for session: {} (workspace: {})",
        session_id, workspace_id
    );

    // Get terminal service
    let terminal_service = state.terminal_service.clone();

    // Create the terminal session and get output receiver
    let output_rx = match terminal_service
        .create_session(
            session_id.clone(),
            workspace_id.clone(),
            shell,
            None, // Default cols
            None, // Default rows
        )
        .await
    {
        Ok(rx) => rx,
        Err(e) => {
            error!("Failed to create terminal session: {}", e);
            let error_response = TerminalResponse::TerminalError {
                session_id: Some(session_id),
                error: e.to_string(),
            };
            let _ = ws_sender
                .send(Message::Text(
                    serde_json::to_string(&error_response).unwrap().into(),
                ))
                .await;
            return;
        }
    };

    // Send session created confirmation
    let created_response = TerminalResponse::TerminalCreated {
        session_id: session_id.clone(),
        workspace_id: workspace_id.clone(),
    };
    if let Ok(json) = serde_json::to_string(&created_response) {
        let _ = ws_sender.send(Message::Text(json.into())).await;
    }

    // Create channel for WebSocket outgoing messages
    let (ws_tx, mut ws_rx) = mpsc::unbounded_channel::<String>();

    // Task: Forward PTY output to WebSocket
    let session_id_output = session_id.clone();
    let ws_tx_clone = ws_tx.clone();
    let output_task = tokio::spawn(async move {
        let mut output_rx = output_rx;
        while let Some(data) = output_rx.recv().await {
            // Convert bytes to string (terminal output is typically UTF-8)
            let text = String::from_utf8_lossy(&data).to_string();
            let response = TerminalResponse::TerminalOutput {
                session_id: session_id_output.clone(),
                data: text,
            };
            if let Ok(json) = serde_json::to_string(&response) {
                if ws_tx_clone.send(json).is_err() {
                    debug!(
                        "WebSocket channel closed for session: {}",
                        session_id_output
                    );
                    break;
                }
            }
        }
    });

    // Task: Send messages from channel to WebSocket
    let session_id_send = session_id.clone();
    let send_task = tokio::spawn(async move {
        while let Some(msg) = ws_rx.recv().await {
            if ws_sender.send(Message::Text(msg.into())).await.is_err() {
                warn!(
                    "Failed to send to WebSocket for session: {}",
                    session_id_send
                );
                break;
            }
        }
    });

    // Main loop: Handle incoming WebSocket messages
    let terminal_service_clone = terminal_service.clone();
    let session_id_recv = session_id.clone();
    while let Some(result) = ws_receiver.next().await {
        match result {
            Ok(msg) => {
                if !handle_terminal_message(
                    msg,
                    &session_id_recv,
                    &terminal_service_clone,
                    &ws_tx,
                )
                .await
                {
                    break;
                }
            }
            Err(e) => {
                error!("WebSocket error for session {}: {}", session_id_recv, e);
                break;
            }
        }
    }

    // Cleanup
    output_task.abort();
    send_task.abort();

    // Close the terminal session
    if let Err(e) = terminal_service.close_session(&session_id).await {
        warn!("Error closing terminal session {}: {}", session_id, e);
    }

    info!("Terminal WebSocket closed for session: {}", session_id);
}

/// Handle incoming terminal WebSocket message
async fn handle_terminal_message(
    msg: Message,
    session_id: &str,
    terminal_service: &Arc<TerminalService>,
    ws_tx: &mpsc::UnboundedSender<String>,
) -> bool {
    match msg {
        Message::Text(text) => {
            let text_str: &str = text.as_ref();

            // Try to parse as JSON message
            if let Ok(terminal_msg) = serde_json::from_str::<ClientTerminalMessage>(text_str) {
                match terminal_msg {
                    ClientTerminalMessage::TerminalCreate { .. } => {
                        // Session already created on connect, just ignore or re-confirm
                        let created_response = TerminalResponse::TerminalCreated {
                            session_id: session_id.to_string(),
                            workspace_id: "unknown".to_string(), // We don't track it here easily
                        };
                        if let Ok(json) = serde_json::to_string(&created_response) {
                            let _ = ws_tx.send(json);
                        }
                    }
                    ClientTerminalMessage::TerminalInput { data } => {
                        if let Err(e) = terminal_service.send_input(session_id, &data).await {
                            error!("Failed to send input to session {}: {}", session_id, e);
                            let error_response = TerminalResponse::TerminalError {
                                session_id: Some(session_id.to_string()),
                                error: e.to_string(),
                            };
                            if let Ok(json) = serde_json::to_string(&error_response) {
                                let _ = ws_tx.send(json);
                            }
                        }
                    }
                    ClientTerminalMessage::TerminalResize { cols, rows } => {
                        if let Err(e) = terminal_service.resize(session_id, cols, rows).await {
                            error!("Failed to resize session {}: {}", session_id, e);
                        }
                    }
                    ClientTerminalMessage::TerminalClose => {
                        // Client requested close
                        let close_response = TerminalResponse::TerminalClosed {
                            session_id: session_id.to_string(),
                        };
                        if let Ok(json) = serde_json::to_string(&close_response) {
                            let _ = ws_tx.send(json);
                        }
                        return false;
                    }
                }
            } else {
                // Treat as raw terminal input if not valid JSON
                if let Err(e) = terminal_service.send_input(session_id, text_str).await {
                    error!("Failed to send raw input to session {}: {}", session_id, e);
                }
            }
            true
        }
        Message::Binary(data) => {
            // Handle binary data as raw terminal input
            let text = String::from_utf8_lossy(&data);
            if let Err(e) = terminal_service.send_input(session_id, &text).await {
                error!(
                    "Failed to send binary input to session {}: {}",
                    session_id, e
                );
            }
            true
        }
        Message::Ping(_) => {
            debug!("Received ping from session: {}", session_id);
            true
        }
        Message::Pong(_) => {
            debug!("Received pong from session: {}", session_id);
            true
        }
        Message::Close(_) => {
            info!("Received close frame for session: {}", session_id);
            false
        }
    }
}
