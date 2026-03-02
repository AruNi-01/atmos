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
    Cancel,
    SetConfigOption {
        config_id: String,
        value: String,
    },
    SetAgentDefaultConfig {
        config_id: String,
        value: String,
        registry_id: String,
    },
}

/// Command from main loop to bridge task
enum AgentCommand {
    Prompt(String),
    PermissionResponse { request_id: String, allowed: bool },
    Cancel,
    SetConfigOption(String, String),
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
    LoadCompleted,
    /// Real-time ACP connection phase update
    PhaseUpdate {
        phase: String,
    },
    ConfigOptionsUpdate {
        #[serde(rename = "configOptions")]
        config_options: Vec<agent::acp_client::types::AgentConfigOption>,
    },
    PlanUpdate {
        plan: agent::acp_client::types::AgentPlan,
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
        AcpSessionEvent::LoadCompleted => Some(AgentServerMessage::LoadCompleted),
        AcpSessionEvent::ConfigOptionsUpdate(opts) => {
            Some(AgentServerMessage::ConfigOptionsUpdate {
                config_options: opts,
            })
        }
        AcpSessionEvent::Plan(plan) => Some(AgentServerMessage::PlanUpdate { plan }),
    }
}

/// WebSocket upgrade handler for Agent chat session
pub async fn agent_ws_handler(
    Path(session_id): Path<String>,
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    let pending = state
        .agent_session_service
        .take_pending_session(&session_id);

    let Some(spec) = pending else {
        return (
            axum::http::StatusCode::NOT_FOUND,
            format!("Agent session {} not found", session_id),
        )
            .into_response();
    };

    info!("Agent WebSocket connected for session: {}", session_id);

    ws.on_upgrade(move |socket| async move {
        handle_lazy_agent_socket(socket, session_id, spec, state).await;
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

/// Common bridge loop between WS receiver and ACP session handle.
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
                    Some(AgentCommand::Cancel) => handle.send_cancel(),
                    Some(AgentCommand::SetConfigOption(config_id, value)) => handle.send_set_config_option(config_id, value),
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
                    AgentClientMessage::Cancel => {
                        let _ = cmd_tx_clone.send(AgentCommand::Cancel);
                    }
                    AgentClientMessage::SetConfigOption { config_id, value } => {
                        let _ = cmd_tx_clone.send(AgentCommand::SetConfigOption(config_id, value));
                    }
                    AgentClientMessage::SetAgentDefaultConfig {
                        config_id,
                        value,
                        registry_id,
                    } => {
                        info!(
                            "Received set_agent_default_config: {}/{}={}",
                            registry_id, config_id, value
                        );
                        if let Err(e) = state.agent_service.set_agent_default_config(
                            &registry_id,
                            &config_id,
                            &value,
                        ) {
                            warn!("Failed to set agent default config: {}", e);
                            if let Ok(json) = serde_json::to_string(&AgentServerMessage::Error {
                                code: "SET_DEFAULT_CONFIG_FAILED".to_string(),
                                message: format!("Failed to save default config: {}", e),
                                recoverable: true,
                            }) {
                                let _ = ws_tx.send(json);
                            }
                        }
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
    drop(cmd_tx_clone);
    let _ = bridge_task.await;
}
