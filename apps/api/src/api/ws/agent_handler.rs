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
    Prompt {
        message: String,
    },
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
        role: String,
        kind: String,
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
    TurnEnd,
    SessionEnded,
    /// Real-time ACP connection phase update
    PhaseUpdate {
        phase: String,
    },
}

fn event_to_message(ev: AcpSessionEvent) -> Option<AgentServerMessage> {
    match ev {
        AcpSessionEvent::Stream(s) => Some(AgentServerMessage::Stream {
            role: s.role,
            kind: s.kind,
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
        AcpSessionEvent::TurnEnd => Some(AgentServerMessage::TurnEnd),
        AcpSessionEvent::SessionEnded => Some(AgentServerMessage::SessionEnded),
    }
}

/// WebSocket upgrade handler for Agent chat session
pub async fn agent_ws_handler(
    Path(session_id): Path<String>,
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    // Check for already-connected session (legacy path)
    let handle = state.agent_session_service.take_session(&session_id);
    // Check for pending lazy session
    let pending = state
        .agent_session_service
        .take_pending_session(&session_id);

    if handle.is_none() && pending.is_none() {
        return (
            axum::http::StatusCode::NOT_FOUND,
            format!("Agent session {} not found", session_id),
        )
            .into_response();
    }

    info!("Agent WebSocket connected for session: {}", session_id);

    ws.on_upgrade(move |socket| async move {
        if let Some(spec) = pending {
            handle_lazy_agent_socket(socket, session_id, spec, state).await;
        } else if let Some(handle) = handle {
            handle_agent_socket(socket, session_id, handle, state).await;
        }
    })
}

/// Send a phase update message over the WebSocket send channel
fn send_phase(ws_tx: &mpsc::UnboundedSender<String>, phase: &str) {
    if let Ok(json) = serde_json::to_string(&AgentServerMessage::PhaseUpdate {
        phase: phase.to_string(),
    }) {
        let _ = ws_tx.send(json);
    }
}

/// Handle a lazy session: connect ACP first (reporting phases), then run normal bridge
async fn handle_lazy_agent_socket(
    socket: axum::extract::ws::WebSocket,
    session_id: String,
    spec: core_service::LazySessionSpec,
    state: AppState,
) {
    let (mut ws_sender, ws_receiver) = socket.split();

    let (ws_tx, mut ws_rx) = mpsc::unbounded_channel::<String>();

    // Spawn a task to forward messages from ws_tx to the actual WS sender
    let session_id_send = session_id.clone();
    let send_task = tokio::spawn(async move {
        while let Some(msg) = ws_rx.recv().await {
            if ws_sender
                .send(axum::extract::ws::Message::Text(msg.into()))
                .await
                .is_err()
            {
                warn!(
                    "Failed to send to Agent WebSocket for session: {}",
                    session_id_send
                );
                break;
            }
        }
    });

    // Report phases while connecting
    send_phase(&ws_tx, "initializing");

    send_phase(&ws_tx, "spawning_agent");

    let connect_result = state.agent_session_service.connect_session(spec).await;

    let session_id_close = session_id.clone();
    let state_close = state.clone();

    match connect_result {
        Ok(handle) => {
            send_phase(&ws_tx, "connected");
            run_bridge(session_id, handle, ws_tx, ws_receiver, state).await;
        }
        Err(e) => {
            error!(
                "ACP connection failed for session {}: {}",
                session_id_close, e
            );
            if e.contains(agent::AUTH_REQUIRED_ERROR_PREFIX) {
                let json_part = e
                    .strip_prefix(agent::AUTH_REQUIRED_ERROR_PREFIX)
                    .unwrap_or(&e);
                if let Ok(json) = serde_json::to_string(&AgentServerMessage::Error {
                    code: "ACP_AUTH_REQUIRED".to_string(),
                    message: json_part.to_string(),
                    recoverable: true,
                }) {
                    let _ = ws_tx.send(json);
                }
            } else if let Ok(json) = serde_json::to_string(&AgentServerMessage::Error {
                code: "ACP_CONNECT_FAILED".to_string(),
                message: e,
                recoverable: false,
            }) {
                let _ = ws_tx.send(json);
            }
            if let Ok(json) = serde_json::to_string(&AgentServerMessage::SessionEnded) {
                let _ = ws_tx.send(json);
            }
            drop(ws_tx);
        }
    }

    let _ = send_task.await;
    state_close
        .agent_session_service
        .mark_session_closed(&session_id_close)
        .await;
    info!("Agent WebSocket closed for session: {}", session_id_close);
}

/// Legacy path: session was already ACP-connected before WS
async fn handle_agent_socket(
    socket: axum::extract::ws::WebSocket,
    session_id: String,
    handle: AcpSessionHandle,
    state: AppState,
) {
    let (mut ws_sender, ws_receiver) = socket.split();

    let (ws_tx, mut ws_rx) = mpsc::unbounded_channel::<String>();

    let session_id_send = session_id.clone();
    let send_task = tokio::spawn(async move {
        while let Some(msg) = ws_rx.recv().await {
            if ws_sender
                .send(axum::extract::ws::Message::Text(msg.into()))
                .await
                .is_err()
            {
                warn!(
                    "Failed to send to Agent WebSocket for session: {}",
                    session_id_send
                );
                break;
            }
        }
    });

    {
        let state_bridge = state.clone();
        let sid = session_id.clone();
        run_bridge(sid, handle, ws_tx, ws_receiver, state_bridge).await;
    }

    let _ = send_task.await;
    state
        .agent_session_service
        .mark_session_closed(&session_id)
        .await;
    info!("Agent WebSocket closed for session: {}", session_id);
}

/// Common bridge loop between WS receiver and ACP session handle
async fn run_bridge(
    session_id: String,
    mut handle: AcpSessionHandle,
    ws_tx: mpsc::UnboundedSender<String>,
    mut ws_receiver: futures_util::stream::SplitStream<axum::extract::ws::WebSocket>,
    state: AppState,
) {
    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<AgentCommand>();
    let mut pending_permissions: HashMap<String, tokio::sync::oneshot::Sender<bool>> =
        HashMap::new();

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
        let _ = ws_tx_clone
            .send(serde_json::to_string(&AgentServerMessage::SessionEnded).unwrap_or_default());
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
                        state
                            .agent_session_service
                            .spawn_title_generation(session_id.clone(), message.clone());
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
    bridge_task.abort();
}
