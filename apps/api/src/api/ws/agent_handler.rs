//! Agent WebSocket handler - bridges WebSocket with ACP session.

use std::collections::HashMap;

use agent::{AcpSessionEvent, AcpSessionHandle};
use axum::{
    extract::{Path, State, WebSocketUpgrade},
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tracing::{error, info, warn};

use crate::app_state::AppState;

/// Client -> Server message
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AgentClientMessage {
    Prompt { message: String },
    PermissionResponse {
        request_id: String,
        allowed: bool,
        remember_for_session: bool,
    },
}

/// Command from main loop to bridge task
enum AgentCommand {
    Prompt(String),
    PermissionResponse { request_id: String, allowed: bool },
}

/// Server -> Client message
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AgentServerMessage {
    Stream {
        delta: String,
        done: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        usage: Option<agent::StreamUsage>,
    },
    ToolCall {
        tool_call_id: String,
        tool: String,
        description: String,
        status: agent::ToolCallStatus,
        raw_input: Option<serde_json::Value>,
        raw_output: Option<serde_json::Value>,
        detail: Option<serde_json::Value>,
    },
    PermissionRequest(agent::PermissionRequest),
    Error {
        code: String,
        message: String,
        recoverable: bool,
    },
    SessionEnded,
}

fn event_to_message(ev: AcpSessionEvent) -> Option<AgentServerMessage> {
    match ev {
        AcpSessionEvent::Stream(s) => Some(AgentServerMessage::Stream {
            delta: s.delta,
            done: s.done,
            usage: s.usage,
        }),
        AcpSessionEvent::ToolCall(t) => Some(AgentServerMessage::ToolCall {
            tool_call_id: t.tool_call_id,
            tool: t.tool,
            description: t.description,
            status: t.status,
            raw_input: t.raw_input,
            raw_output: t.raw_output,
            detail: t.detail,
        }),
        AcpSessionEvent::PermissionRequest(p) => Some(AgentServerMessage::PermissionRequest(p)),
        AcpSessionEvent::Error {
            code,
            message,
            recoverable,
        } => Some(AgentServerMessage::Error {
            code,
            message,
            recoverable,
        }),
        AcpSessionEvent::SessionEnded => Some(AgentServerMessage::SessionEnded),
    }
}

/// WebSocket upgrade handler for Agent chat session
pub async fn agent_ws_handler(
    Path(session_id): Path<String>,
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    let handle = state.agent_session_service.take_session(&session_id);
    let Some(handle) = handle else {
        return (
            axum::http::StatusCode::NOT_FOUND,
            format!("Agent session {} not found", session_id),
        )
            .into_response();
    };

    info!("Agent WebSocket connected for session: {}", session_id);

    ws.on_upgrade(move |socket| handle_agent_socket(socket, session_id, handle))
}

async fn handle_agent_socket(socket: axum::extract::ws::WebSocket, session_id: String, mut handle: AcpSessionHandle) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    let (ws_tx, mut ws_rx) = mpsc::unbounded_channel::<String>();
    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<AgentCommand>();
    let mut pending_permissions: HashMap<String, tokio::sync::oneshot::Sender<bool>> = HashMap::new();

    let session_id_send = session_id.clone();
    let send_task = tokio::spawn(async move {
        while let Some(msg) = ws_rx.recv().await {
            if ws_sender.send(axum::extract::ws::Message::Text(msg.into())).await.is_err() {
                warn!("Failed to send to Agent WebSocket for session: {}", session_id_send);
                break;
            }
        }
    });

    let ws_tx_clone = ws_tx.clone();
    let bridge_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                biased;
                cmd = cmd_rx.recv() => match cmd {
                    Some(AgentCommand::Prompt(msg)) => handle.send_prompt(msg),
                    Some(AgentCommand::PermissionResponse { request_id, allowed }) => {
                        if let Some(tx) = pending_permissions.remove(&request_id) {
                            let _ = tx.send(allowed);
                        }
                    }
                    None => break,
                },
                ev = handle.recv_event() => match ev {
                    Some(ev) => {
                        while let Some((req, tx)) = handle.try_recv_permission() {
                            pending_permissions.insert(req.request_id.clone(), tx);
                            if let Ok(msg) = serde_json::to_string(&AgentServerMessage::PermissionRequest(req)) {
                                let _ = ws_tx_clone.send(msg);
                            }
                        }
                        if let Some(msg) = event_to_message(ev) {
                            if let Ok(json) = serde_json::to_string(&msg) {
                                let _ = ws_tx_clone.send(json);
                            }
                        }
                    }
                    None => break,
                },
            }
        }
        let _ = ws_tx_clone.send(
            serde_json::to_string(&AgentServerMessage::SessionEnded).unwrap_or_default(),
        );
    });

    let cmd_tx_clone = cmd_tx.clone();
    while let Some(result) = ws_receiver.next().await {
        match result {
            Ok(axum::extract::ws::Message::Text(text)) => {
                let Ok(msg) = serde_json::from_str::<AgentClientMessage>(&text) else {
                    warn!("Invalid Agent client message: {}", text);
                    continue;
                };
                match msg {
                    AgentClientMessage::Prompt { message } => {
                        let _ = cmd_tx_clone.send(AgentCommand::Prompt(message));
                    }
                    AgentClientMessage::PermissionResponse {
                        request_id,
                        allowed,
                        remember_for_session: _,
                    } => {
                        let _ = cmd_tx_clone.send(AgentCommand::PermissionResponse {
                            request_id,
                            allowed,
                        });
                    }
                }
            }
            Ok(axum::extract::ws::Message::Close(_)) => break,
            Err(e) => {
                error!("Agent WebSocket error for session {}: {}", session_id, e);
                break;
            }
            _ => {}
        }
    }

    drop(cmd_tx);
    send_task.abort();
    bridge_task.abort();
    info!("Agent WebSocket closed for session: {}", session_id);
}
