//! Relay external-event ingress for APP-019 provider triggers.
//!
//! Accept path (durable queue):
//! 1. Parse / validate shape
//! 2. Persist to [`infra::queue::LocalPersistentQueue`]
//! 3. ACK Accepted (provider should not redeliver for internal processing failures)
//!
//! Domain matching / start_run runs in the queue worker with internal retries.

use chrono::{DateTime, Utc};
use core_service::{GithubTriggerEvent, ServiceError};
use infra::queue::{topics, EnqueueError, Topic};
use serde::{Deserialize, Serialize};
use tracing::warn;

use crate::app_state::AppState;

#[derive(Debug, Deserialize)]
struct RelayGithubTriggerEvent {
    delivery_id: String,
    route_id: String,
    automation_guid: String,
    provider: String,
    #[serde(default)]
    repository_id: Option<String>,
    repository_full_name: String,
    event_name: String,
    #[serde(default)]
    action: Option<String>,
    #[serde(default)]
    sender_login: Option<String>,
    #[serde(default)]
    source_url: Option<String>,
    #[serde(default)]
    issue_number: Option<i64>,
    #[serde(default)]
    pull_request_number: Option<i64>,
    #[serde(default)]
    branch: Option<String>,
    #[serde(default)]
    workflow_name: Option<String>,
    #[serde(default)]
    conclusion: Option<String>,
    #[serde(default)]
    label_name: Option<String>,
    #[serde(default)]
    untrusted_text_excerpt: Option<String>,
    received_at: i64,
}

#[derive(Debug, Serialize)]
pub struct ExternalEventAck {
    delivery_id: String,
    route_id: String,
    status: ExternalEventAckStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_code: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
enum ExternalEventAckStatus {
    /// Event was persisted for internal processing (accept-on-persist).
    /// Domain match / start_run happens asynchronously in the queue worker.
    /// `local_rejected` is no longer used on this path — domain rejects complete
    /// the queue event without asking the provider to redeliver.
    Accepted,
    Error,
}

pub async fn handle_external_event_body(state: &AppState, body: &str) -> Option<String> {
    let event = match parse_github_trigger_event(body) {
        Ok(event) => event,
        Err(error) => {
            warn!(
                target: "atmos_relay",
                error = %error,
                "external event decode failed"
            );
            return parse_ack_identity(body).and_then(|(delivery_id, route_id)| {
                serialize_ack(ExternalEventAck {
                    delivery_id,
                    route_id,
                    status: ExternalEventAckStatus::Error,
                    error_code: Some("invalid_external_event".to_string()),
                })
            });
        }
    };

    let delivery_id = event.delivery_id.clone();
    let route_id = event.route_id.clone();

    match accept_github_trigger(state, event).await {
        Ok(queue_event_id) => {
            debug_queue_accepted(&delivery_id, &queue_event_id);
            serialize_ack(ExternalEventAck {
                delivery_id,
                route_id,
                status: ExternalEventAckStatus::Accepted,
                error_code: None,
            })
        }
        Err(error) => serialize_ack(ExternalEventAck {
            delivery_id,
            route_id,
            status: ExternalEventAckStatus::Error,
            error_code: Some(service_error_code(&error).to_string()),
        }),
    }
}

fn debug_queue_accepted(delivery_id: &str, queue_event_id: &str) {
    tracing::debug!(
        target: "atmos_relay",
        delivery_id = %delivery_id,
        queue_event_id = %queue_event_id,
        "github external event accepted into durable queue"
    );
}

/// Payload stored in the durable queue (no reply channel — ACK is accept-only).
#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct GithubQueuePayload {
    pub event: GithubTriggerEvent,
}

async fn accept_github_trigger(
    state: &AppState,
    event: GithubTriggerEvent,
) -> Result<String, ServiceError> {
    let payload = serde_json::to_vec(&GithubQueuePayload { event }).map_err(|error| {
        ServiceError::Validation(format!("github trigger serialize failed: {error}"))
    })?;

    state
        .event_queue
        .enqueue(&Topic::new(topics::AUTOMATION_GITHUB_DELIVERY), payload)
        .await
        .map_err(|error| match error {
            EnqueueError::ShuttingDown => {
                ServiceError::Processing("event queue is shutting down".to_string())
            }
            EnqueueError::Full => ServiceError::Processing("event queue is full".to_string()),
            EnqueueError::NoConsumer => {
                // Durable queue does not require a live consumer to accept.
                ServiceError::Processing("event queue has no consumer".to_string())
            }
            EnqueueError::Internal(message) => ServiceError::Processing(message),
        })
}

fn parse_github_trigger_event(body: &str) -> Result<GithubTriggerEvent, String> {
    let raw: RelayGithubTriggerEvent =
        serde_json::from_str(body).map_err(|error| format!("invalid json: {error}"))?;
    if raw.provider != "github" {
        return Err("unsupported provider".to_string());
    }

    let received_at = DateTime::<Utc>::from_timestamp(raw.received_at, 0)
        .ok_or_else(|| "invalid received_at".to_string())?
        .naive_utc();

    GithubTriggerEvent {
        delivery_id: raw.delivery_id,
        route_id: raw.route_id,
        automation_guid: raw.automation_guid,
        repository_id: raw.repository_id,
        repository_full_name: raw.repository_full_name,
        event_name: raw.event_name,
        action: raw.action,
        sender_login: raw.sender_login,
        source_url: raw.source_url,
        issue_number: raw.issue_number,
        pull_request_number: raw.pull_request_number,
        branch: raw.branch,
        workflow_name: raw.workflow_name,
        conclusion: raw.conclusion,
        label_name: raw.label_name,
        untrusted_text_excerpt: raw.untrusted_text_excerpt,
        received_at,
    }
    .canonicalize()
    .map_err(|error| error.to_string())
}

fn parse_ack_identity(body: &str) -> Option<(String, String)> {
    #[derive(Deserialize)]
    struct AckIdentity {
        delivery_id: String,
        route_id: String,
    }

    serde_json::from_str::<AckIdentity>(body)
        .ok()
        .map(|identity| (identity.delivery_id, identity.route_id))
}

fn serialize_ack(ack: ExternalEventAck) -> Option<String> {
    match serde_json::to_string(&ack) {
        Ok(value) => Some(value),
        Err(error) => {
            warn!(
                target: "atmos_relay",
                error = %error,
                "external event ack encode failed"
            );
            None
        }
    }
}

fn service_error_code(error: &ServiceError) -> &'static str {
    match error {
        ServiceError::Validation(_) => "validation_error",
        ServiceError::NotFound(_) => "not_found",
        ServiceError::Infra(_) => "infra_error",
        ServiceError::Engine(_) => "engine_error",
        ServiceError::Repository(_) => "repository_error",
        ServiceError::Processing(_) => "processing_error",
    }
}
