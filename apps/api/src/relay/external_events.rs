//! Relay external-event ingress for APP-018 provider triggers.

use chrono::{DateTime, Utc};
use core_service::{
    ExternalTriggerOutcome, ExternalTriggerRejectReason, GithubTriggerEvent, ServiceError,
};
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
    repository_id: Option<i64>,
    repository_full_name: String,
    event_name: String,
    #[serde(default)]
    action: Option<String>,
    #[serde(default)]
    sender_login: Option<String>,
    #[serde(default)]
    source_url: Option<String>,
    #[serde(default)]
    pull_request_number: Option<i64>,
    #[serde(default)]
    branch: Option<String>,
    #[serde(default)]
    workflow_name: Option<String>,
    #[serde(default)]
    conclusion: Option<String>,
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
    Accepted,
    LocalRejected,
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
    let outcome = state
        .automation_service
        .handle_external_trigger(event)
        .await;
    let ack = match outcome {
        Ok(ExternalTriggerOutcome::Accepted { .. }) => ExternalEventAck {
            delivery_id,
            route_id,
            status: ExternalEventAckStatus::Accepted,
            error_code: None,
        },
        Ok(ExternalTriggerOutcome::LocalRejected { rejection }) => ExternalEventAck {
            delivery_id: rejection.delivery_id,
            route_id: rejection.route_id,
            status: ExternalEventAckStatus::LocalRejected,
            error_code: Some(reject_reason_code(rejection.reason).to_string()),
        },
        Err(error) => ExternalEventAck {
            delivery_id,
            route_id,
            status: ExternalEventAckStatus::Error,
            error_code: Some(service_error_code(&error).to_string()),
        },
    };

    serialize_ack(ack)
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
        pull_request_number: raw.pull_request_number,
        branch: raw.branch,
        workflow_name: raw.workflow_name,
        conclusion: raw.conclusion,
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

fn reject_reason_code(reason: ExternalTriggerRejectReason) -> &'static str {
    match reason {
        ExternalTriggerRejectReason::AutomationNotFound => "automation_not_found",
        ExternalTriggerRejectReason::TriggerKindMismatch => "trigger_kind_mismatch",
        ExternalTriggerRejectReason::TriggerDisabled => "trigger_disabled",
        ExternalTriggerRejectReason::TriggerStatusInactive => "trigger_status_inactive",
        ExternalTriggerRejectReason::TriggerConfigMissing => "trigger_config_missing",
        ExternalTriggerRejectReason::TriggerConfigInvalid => "trigger_config_invalid",
        ExternalTriggerRejectReason::RouteMismatch => "route_mismatch",
        ExternalTriggerRejectReason::RepositoryMismatch => "repository_mismatch",
        ExternalTriggerRejectReason::EventMismatch => "event_mismatch",
        ExternalTriggerRejectReason::DuplicateDelivery => "duplicate_delivery",
        ExternalTriggerRejectReason::AlreadyRunning => "already_running",
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
