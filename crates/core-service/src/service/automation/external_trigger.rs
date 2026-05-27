use infra::db::repo::{AutomationRepo, ClaimGithubDeliveryRecord, GithubDeliveryClaimResult};
use serde::{Deserialize, Serialize};

use crate::error::{Result, ServiceError};

use super::github_trigger::{
    build_github_trigger_context, github_trigger_source_json, GithubTriggerConfig,
    GithubTriggerEvent,
};
use super::{AutomationRunDetail, AutomationRunSummary, AutomationService, AutomationTriggerKind};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ExternalTriggerOutcome {
    Accepted { run: AutomationRunDetail },
    LocalRejected { rejection: ExternalTriggerRejection },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalTriggerRejection {
    pub delivery_id: String,
    pub route_id: String,
    pub automation_guid: String,
    pub reason: ExternalTriggerRejectReason,
    pub message: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExternalTriggerRejectReason {
    AutomationNotFound,
    TriggerKindMismatch,
    TriggerDisabled,
    TriggerStatusInactive,
    TriggerConfigMissing,
    TriggerConfigInvalid,
    RouteMismatch,
    RepositoryMismatch,
    EventMismatch,
    DuplicateDelivery,
    AlreadyRunning,
}

impl AutomationService {
    pub async fn handle_external_trigger(
        &self,
        event: GithubTriggerEvent,
    ) -> Result<ExternalTriggerOutcome> {
        let repo = AutomationRepo::new(&self.db);
        let automation = match repo.find_automation_by_guid(&event.automation_guid).await? {
            Some(automation) => automation,
            None => {
                return Ok(local_rejected(
                    &event,
                    ExternalTriggerRejectReason::AutomationNotFound,
                    "Automation no longer exists on this Computer.",
                ));
            }
        };

        if automation.trigger_kind != AutomationTriggerKind::Github.as_str() {
            return Ok(local_rejected(
                &event,
                ExternalTriggerRejectReason::TriggerKindMismatch,
                "Automation is not configured for GitHub triggers.",
            ));
        }

        if !automation.trigger_enabled {
            return Ok(local_rejected(
                &event,
                ExternalTriggerRejectReason::TriggerDisabled,
                "GitHub trigger is disabled.",
            ));
        }

        if automation.trigger_status != "active" {
            return Ok(local_rejected(
                &event,
                ExternalTriggerRejectReason::TriggerStatusInactive,
                "GitHub trigger is not active.",
            ));
        }

        let config = match GithubTriggerConfig::from_automation(&automation) {
            Ok(config) => config,
            Err(ServiceError::Validation(message))
                if message == "github_trigger_config_missing" =>
            {
                return Ok(local_rejected(
                    &event,
                    ExternalTriggerRejectReason::TriggerConfigMissing,
                    "GitHub trigger config is missing.",
                ));
            }
            Err(ServiceError::Validation(message))
                if message.starts_with("github_trigger_config_invalid") =>
            {
                return Ok(local_rejected(
                    &event,
                    ExternalTriggerRejectReason::TriggerConfigInvalid,
                    "GitHub trigger config is invalid.",
                ));
            }
            Err(error) => return Err(error),
        };

        if config.route_id.trim() != event.route_id.trim() {
            return Ok(local_rejected(
                &event,
                ExternalTriggerRejectReason::RouteMismatch,
                "GitHub route id does not match the local automation config.",
            ));
        }

        if !config.repository_matches_event(&event) {
            return Ok(local_rejected(
                &event,
                ExternalTriggerRejectReason::RepositoryMismatch,
                "GitHub repository does not match the local automation config.",
            ));
        }

        if !config.matches_event(&event) {
            return Ok(local_rejected(
                &event,
                ExternalTriggerRejectReason::EventMismatch,
                "GitHub event no longer matches the local automation filters.",
            ));
        }

        if repo
            .has_running_run_for_automation(&automation.guid)
            .await?
        {
            return Ok(local_rejected(
                &event,
                ExternalTriggerRejectReason::AlreadyRunning,
                "Automation already has a running run.",
            ));
        }

        let delivery_claim = repo
            .claim_github_delivery(ClaimGithubDeliveryRecord {
                delivery_id: event.delivery_id.clone(),
                route_id: event.route_id.clone(),
                automation_guid: automation.guid.clone(),
            })
            .await?;
        if matches!(delivery_claim, GithubDeliveryClaimResult::AlreadyClaimed(_)) {
            return Ok(local_rejected(
                &event,
                ExternalTriggerRejectReason::DuplicateDelivery,
                "GitHub delivery was already processed for this route.",
            ));
        }

        let trigger_context = build_github_trigger_context(&event);
        let trigger_source_json = github_trigger_source_json(&event)?;
        match self
            .start_run_from_model_with_context(
                automation,
                AutomationTriggerKind::Github,
                Some(trigger_context),
                Some(trigger_source_json),
            )
            .await
        {
            Ok(run) => {
                repo.associate_github_delivery_run(&event.delivery_id, &event.route_id, &run.guid)
                    .await?;
                Ok(ExternalTriggerOutcome::Accepted {
                    run: AutomationRunDetail {
                        summary: AutomationRunSummary::from(run),
                    },
                })
            }
            Err(ServiceError::Validation(message)) if message == "already_running" => {
                repo.reject_github_delivery_claim(
                    &event.delivery_id,
                    &event.route_id,
                    "already_running",
                )
                .await?;
                Ok(local_rejected(
                    &event,
                    ExternalTriggerRejectReason::AlreadyRunning,
                    "Automation already has a running run.",
                ))
            }
            Err(error) => {
                repo.release_github_delivery_claim(&event.delivery_id, &event.route_id)
                    .await?;
                Err(error)
            }
        }
    }
}

fn local_rejected(
    event: &GithubTriggerEvent,
    reason: ExternalTriggerRejectReason,
    message: &str,
) -> ExternalTriggerOutcome {
    ExternalTriggerOutcome::LocalRejected {
        rejection: ExternalTriggerRejection {
            delivery_id: event.delivery_id.clone(),
            route_id: event.route_id.clone(),
            automation_guid: event.automation_guid.clone(),
            reason,
            message: message.to_string(),
        },
    }
}
