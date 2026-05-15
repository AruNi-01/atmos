//! APP-015: HTTP ingress for the Canvas terminal-agent relay.
//!
//! Flow:
//!
//! ```text
//! atmos canvas <verb>  -- HTTP -->  apps/api  -- WS notification -->  browser
//!                                       ▲                                │
//!                                       └────  canvas_agent_dispatch_result
//! ```
//!
//! The handler resolves which browser tab should receive the dispatch, parks
//! the request in `CanvasAgentRelay`, ships a `canvas_agent_dispatch`
//! notification to that tab, then awaits the matching uplink up to the
//! timeout. The CLI sees a uniform `{ ok, request_id, data | error }` shape.

use std::time::Duration;

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use core_service::ResolveTarget;
use infra::{WsEvent, WsMessage};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::app_state::AppState;

const MAX_PAYLOAD_BYTES: usize = 256 * 1024;

#[derive(Debug, Deserialize)]
pub struct CanvasAgentInvokePayload {
    /// Stable correlation id minted client-side (UUID v4).
    pub request_id: String,
    /// Verb routed to the Canvas Command Bus in the browser
    /// (e.g. `status`, `create_note`, `layout_grid`).
    pub command: String,
    /// Verb-specific arguments. Browser-side validators perform allow-list
    /// checks; the server is intentionally transport-only.
    #[serde(default)]
    pub args: Value,
    /// Optional target tab id (returned by `status` when multiple tabs are
    /// registered). Required when the registry is ambiguous.
    #[serde(default)]
    pub client_id: Option<String>,
    /// Optional CLI-supplied deadline in milliseconds. Clamped to
    /// [`core_service::DEFAULT_RELAY_TIMEOUT_MS`] / `MAX_RELAY_TIMEOUT_MS`.
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    /// Agent presence metadata (M20: Follow Agent).
    #[serde(default)]
    pub actor: Option<AgentActor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentActor {
    pub actor_id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CanvasAgentInvokeResponse {
    pub ok: bool,
    pub request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<CanvasAgentInvokeError>,
}

#[derive(Debug, Serialize)]
pub struct CanvasAgentInvokeError {
    pub code: String,
    pub message: String,
    pub recoverable: bool,
}

impl CanvasAgentInvokeError {
    fn new(code: &str, message: impl Into<String>, recoverable: bool) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            recoverable,
        }
    }
}

pub async fn invoke(
    State(state): State<AppState>,
    Json(payload): Json<CanvasAgentInvokePayload>,
) -> (StatusCode, Json<CanvasAgentInvokeResponse>) {
    let CanvasAgentInvokePayload {
        request_id,
        command,
        args,
        client_id,
        timeout_ms,
        actor,
    } = payload;

    if request_id.trim().is_empty() {
        return error_resp(
            "",
            StatusCode::BAD_REQUEST,
            CanvasAgentInvokeError::new(
                "VALIDATION_ARG",
                "request_id must not be empty",
                false,
            ),
        );
    }

    if command.trim().is_empty() {
        return error_resp(
            &request_id,
            StatusCode::BAD_REQUEST,
            CanvasAgentInvokeError::new(
                "VALIDATION_ARG",
                "command must not be empty",
                false,
            ),
        );
    }

    if serde_json::to_vec(&args)
        .map(|v| v.len() > MAX_PAYLOAD_BYTES)
        .unwrap_or(false)
    {
        return error_resp(
            &request_id,
            StatusCode::PAYLOAD_TOO_LARGE,
            CanvasAgentInvokeError::new(
                "VALIDATION_ARG",
                format!("args exceeds {} bytes", MAX_PAYLOAD_BYTES),
                false,
            ),
        );
    }

    let relay = state.canvas_agent_relay.clone();
    let target = relay.resolve_target(client_id.as_deref());

    let (conn_id, resolved_client_id) = match target {
        ResolveTarget::Single { conn_id, client_id } => (conn_id, client_id),
        ResolveTarget::Offline => {
            return error_resp(
                &request_id,
                StatusCode::SERVICE_UNAVAILABLE,
                CanvasAgentInvokeError::new(
                    "CANVAS_BRIDGE_OFFLINE",
                    "No Canvas tab is currently registered. Open Atmos Canvas in the browser.",
                    true,
                ),
            );
        }
        ResolveTarget::Ambiguous { clients } => {
            let ids: Vec<String> = clients.iter().map(|c| c.client_id.clone()).collect();
            return error_resp_with_extra(
                &request_id,
                StatusCode::CONFLICT,
                CanvasAgentInvokeError::new(
                    "CANVAS_CLIENT_AMBIGUOUS",
                    format!(
                        "Multiple Canvas tabs registered ({}). Re-run with --client-id <id>.",
                        ids.join(", ")
                    ),
                    true,
                ),
                Some(json!({ "candidates": clients })),
            );
        }
        ResolveTarget::NotFound => {
            return error_resp(
                &request_id,
                StatusCode::NOT_FOUND,
                CanvasAgentInvokeError::new(
                    "CANVAS_BRIDGE_OFFLINE",
                    "No registered Canvas tab matches the supplied client_id.",
                    true,
                ),
            );
        }
        ResolveTarget::NotAccepting { client_id } => {
            return error_resp(
                &request_id,
                StatusCode::FORBIDDEN,
                CanvasAgentInvokeError::new(
                    "BRIDGE_DISABLED",
                    format!(
                        "Tab {} has not enabled 'Allow terminal/CLI control'.",
                        client_id
                    ),
                    true,
                ),
            );
        }
    };

    let timeout = core_service::CanvasAgentRelay::clamp_timeout(timeout_ms);
    let rx = relay.begin_pending(&request_id);

    let dispatch_payload = json!({
        "request_id": request_id,
        "client_id": resolved_client_id,
        "command": command,
        "args": args,
        "actor": actor,
        "deadline_ms": timeout.as_millis() as u64,
    });

    let manager = state.ws_service.manager();
    let message = WsMessage::notification(WsEvent::CanvasAgentDispatch, dispatch_payload);
    if let Err(err) = manager.send_to(&conn_id, &message).await {
        relay.cancel_pending(&request_id);
        tracing::warn!(
            "canvas_agent: failed to deliver dispatch to conn {}: {}",
            conn_id,
            err
        );
        return error_resp(
            &request_id,
            StatusCode::SERVICE_UNAVAILABLE,
            CanvasAgentInvokeError::new(
                "CANVAS_BRIDGE_OFFLINE",
                "Canvas tab disconnected before the command could be delivered.",
                true,
            ),
        );
    }

    match tokio::time::timeout(timeout, rx).await {
        Ok(Ok(outcome)) => {
            if outcome.success {
                (
                    StatusCode::OK,
                    Json(CanvasAgentInvokeResponse {
                        ok: true,
                        request_id,
                        data: Some(outcome.data),
                        error: None,
                    }),
                )
            } else {
                error_resp(
                    &request_id,
                    StatusCode::BAD_REQUEST,
                    CanvasAgentInvokeError::new(
                        outcome.error_code.as_deref().unwrap_or("UNKNOWN"),
                        outcome
                            .error_message
                            .unwrap_or_else(|| "Browser reported an unspecified failure".into()),
                        outcome.recoverable.unwrap_or(true),
                    ),
                )
            }
        }
        Ok(Err(_)) => {
            relay.cancel_pending(&request_id);
            error_resp(
                &request_id,
                StatusCode::SERVICE_UNAVAILABLE,
                CanvasAgentInvokeError::new(
                    "RELAY_TIMEOUT",
                    "Browser connection dropped before responding.",
                    true,
                ),
            )
        }
        Err(_) => {
            relay.cancel_pending(&request_id);
            error_resp(
                &request_id,
                StatusCode::GATEWAY_TIMEOUT,
                CanvasAgentInvokeError::new(
                    "RELAY_TIMEOUT",
                    format!(
                        "Browser did not answer within {:?}",
                        Duration::from_millis(timeout.as_millis() as u64)
                    ),
                    true,
                ),
            )
        }
    }
}

/// Out-of-band status endpoint. Works without a registered tab — agents call
/// this to figure out *why* a follow-up call would fail.
pub async fn status(
    State(state): State<AppState>,
) -> Json<Value> {
    let snapshot = state.canvas_agent_relay.status();
    Json(json!({
        "ok": true,
        "bridge": snapshot,
    }))
}

fn error_resp(
    request_id: &str,
    status: StatusCode,
    err: CanvasAgentInvokeError,
) -> (StatusCode, Json<CanvasAgentInvokeResponse>) {
    error_resp_with_extra(request_id, status, err, None)
}

fn error_resp_with_extra(
    request_id: &str,
    status: StatusCode,
    err: CanvasAgentInvokeError,
    extra_data: Option<Value>,
) -> (StatusCode, Json<CanvasAgentInvokeResponse>) {
    (
        status,
        Json(CanvasAgentInvokeResponse {
            ok: false,
            request_id: request_id.to_string(),
            data: extra_data,
            error: Some(err),
        }),
    )
}

#[allow(dead_code)]
impl IntoResponse for CanvasAgentInvokeResponse {
    fn into_response(self) -> axum::response::Response {
        Json(self).into_response()
    }
}
