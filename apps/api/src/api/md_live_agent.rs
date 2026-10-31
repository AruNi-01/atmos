//! HTTP ingress for the local Live markdown agent.
//!
//! Non-browser clients (Atmos Agent, curl) call this loopback endpoint.
//! The server is transport-only: it forwards the tool call to the open
//! Live markdown tab over `/ws` and waits for the result. Same category
//! as `/api/canvas/agent/invoke` and `/api/pt-design/agent/invoke`.

use std::time::Duration;

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use core_service::ResolveTarget;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::api::ws::{WsEvent, WsMessage};
use crate::app_state::AppState;

const MAX_PAYLOAD_BYTES: usize = 256 * 1024;

#[derive(Debug, Deserialize)]
pub struct MdLiveAgentInvokePayload {
    pub request_id: String,
    #[serde(default)]
    pub tool: Option<String>,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub args: Value,
    #[serde(default)]
    pub client_id: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct MdLiveAgentInvokeResponse {
    pub ok: bool,
    pub request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<MdLiveAgentInvokeError>,
}

#[derive(Debug, Serialize)]
pub struct MdLiveAgentInvokeError {
    pub code: String,
    pub message: String,
    pub recoverable: bool,
}

impl MdLiveAgentInvokeError {
    fn new(code: &str, message: impl Into<String>, recoverable: bool) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            recoverable,
        }
    }
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/agent/invoke", post(invoke))
        .route("/agent/status", get(status))
}

pub async fn invoke(
    State(state): State<AppState>,
    Json(payload): Json<MdLiveAgentInvokePayload>,
) -> (StatusCode, Json<MdLiveAgentInvokeResponse>) {
    let MdLiveAgentInvokePayload {
        request_id,
        tool,
        command,
        args,
        client_id,
        timeout_ms,
    } = payload;

    if request_id.trim().is_empty() {
        return error_resp(
            "",
            StatusCode::BAD_REQUEST,
            MdLiveAgentInvokeError::new("VALIDATION_ARG", "request_id must not be empty", false),
        );
    }

    let tool_name = tool
        .as_deref()
        .or(command.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("");
    if tool_name.is_empty() {
        return error_resp(
            &request_id,
            StatusCode::BAD_REQUEST,
            MdLiveAgentInvokeError::new("VALIDATION_ARG", "tool must not be empty", false),
        );
    }

    if serde_json::to_vec(&args)
        .map(|v| v.len() > MAX_PAYLOAD_BYTES)
        .unwrap_or(false)
    {
        return error_resp(
            &request_id,
            StatusCode::PAYLOAD_TOO_LARGE,
            MdLiveAgentInvokeError::new(
                "VALIDATION_ARG",
                format!("args exceeds {MAX_PAYLOAD_BYTES} bytes"),
                false,
            ),
        );
    }

    let relay = state.md_live_agent_relay.clone();
    let target_id = client_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let target = relay.resolve_target(target_id.as_deref());

    let (conn_id, resolved_client_id) = match target {
        ResolveTarget::Single { conn_id, client_id } => (conn_id, client_id),
        ResolveTarget::Offline => {
            return error_resp(
                &request_id,
                StatusCode::SERVICE_UNAVAILABLE,
                MdLiveAgentInvokeError::new(
                    "MD_LIVE_BRIDGE_OFFLINE",
                    "No Live markdown tab is open. Open a Live .md file first.",
                    true,
                ),
            );
        }
        ResolveTarget::Ambiguous { clients } => {
            let ids: Vec<String> = clients.iter().map(|c| c.client_id.clone()).collect();
            return error_resp(
                &request_id,
                StatusCode::CONFLICT,
                MdLiveAgentInvokeError::new(
                    "MD_LIVE_CLIENT_AMBIGUOUS",
                    format!(
                        "Multiple Live markdown tabs are open ({}). Pass client_id.",
                        ids.join(", ")
                    ),
                    true,
                ),
            );
        }
        ResolveTarget::NotFound => {
            return error_resp(
                &request_id,
                StatusCode::NOT_FOUND,
                MdLiveAgentInvokeError::new(
                    "MD_LIVE_CLIENT_NOT_FOUND",
                    "No open Live markdown tab matches that client_id. Open the document first.",
                    true,
                ),
            );
        }
        ResolveTarget::NotAccepting { client_id } => {
            return error_resp(
                &request_id,
                StatusCode::FORBIDDEN,
                MdLiveAgentInvokeError::new(
                    "BRIDGE_DISABLED",
                    format!("Live markdown tab {client_id} is not accepting agent calls."),
                    true,
                ),
            );
        }
    };

    let timeout = core_service::CanvasAgentRelay::clamp_timeout(timeout_ms);
    let rx = match relay.begin_pending(&request_id, &conn_id) {
        Ok(rx) => rx,
        Err(_) => {
            return error_resp(
                &request_id,
                StatusCode::CONFLICT,
                MdLiveAgentInvokeError::new(
                    "VALIDATION_ARG",
                    "request_id is already in flight; mint a fresh id and retry",
                    false,
                ),
            );
        }
    };

    let dispatch_payload = json!({
        "request_id": request_id,
        "client_id": resolved_client_id,
        "tool": tool_name,
        "args": args,
        "deadline_ms": timeout.as_millis() as u64,
    });

    let manager = state.ws_service.manager();
    let message = WsMessage::notification(WsEvent::MdLiveAgentDispatch, dispatch_payload);
    if let Err(err) = manager.send_to(&conn_id, &message).await {
        relay.cancel_pending(&request_id);
        tracing::warn!(
            "md_live_agent: failed to deliver dispatch to conn {}: {}",
            conn_id,
            err
        );
        return error_resp(
            &request_id,
            StatusCode::SERVICE_UNAVAILABLE,
            MdLiveAgentInvokeError::new(
                "MD_LIVE_BRIDGE_OFFLINE",
                "Live markdown tab disconnected before the tool could be delivered.",
                true,
            ),
        );
    }

    match tokio::time::timeout(timeout, rx).await {
        Ok(Ok(outcome)) => {
            if outcome.success {
                (
                    StatusCode::OK,
                    Json(MdLiveAgentInvokeResponse {
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
                    MdLiveAgentInvokeError::new(
                        outcome.error_code.as_deref().unwrap_or("UNKNOWN"),
                        outcome.error_message.unwrap_or_else(|| {
                            "Live editor reported an unspecified failure".into()
                        }),
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
                MdLiveAgentInvokeError::new(
                    "RELAY_TIMEOUT",
                    "Live markdown tab disconnected before responding.",
                    true,
                ),
            )
        }
        Err(_) => {
            relay.cancel_pending(&request_id);
            error_resp(
                &request_id,
                StatusCode::GATEWAY_TIMEOUT,
                MdLiveAgentInvokeError::new(
                    "RELAY_TIMEOUT",
                    format!(
                        "Live markdown tab did not answer within {:?}",
                        Duration::from_millis(timeout.as_millis() as u64)
                    ),
                    true,
                ),
            )
        }
    }
}

pub async fn status(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "ok": true,
        "bridge": state.md_live_agent_relay.status(),
    }))
}

fn error_resp(
    request_id: &str,
    status: StatusCode,
    err: MdLiveAgentInvokeError,
) -> (StatusCode, Json<MdLiveAgentInvokeResponse>) {
    (
        status,
        Json(MdLiveAgentInvokeResponse {
            ok: false,
            request_id: request_id.to_string(),
            data: None,
            error: Some(err),
        }),
    )
}
