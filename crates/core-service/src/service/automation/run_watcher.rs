use std::path::PathBuf;
use std::sync::Arc;

use chrono::Utc;
use infra::db::entities::automation_run;
use infra::db::repo::{AutomationRepo, UpdateAutomationRunStatusRecord};
use sea_orm::DatabaseConnection;
use tokio::sync::broadcast;
use tracing::warn;

use super::runner;
use super::{AutomationEvent, AutomationRunStatus, AutomationRunSummary, NotificationService};

pub(super) async fn mark_run_interrupted(
    db: &Arc<DatabaseConnection>,
    notification_service: &Arc<NotificationService>,
    event_tx: &broadcast::Sender<AutomationEvent>,
    run: automation_run::Model,
) {
    let repo = AutomationRepo::new(db);
    let current = match repo.find_run_by_guid(&run.guid).await {
        Ok(Some(current)) if current.status == AutomationRunStatus::Running.as_str() => current,
        Ok(Some(_)) | Ok(None) => return,
        Err(error) => {
            warn!(
                "Failed to re-check automation run {} before marking interrupted: {}",
                run.guid, error
            );
            return;
        }
    };
    let completed_at = Utc::now().naive_utc();
    match repo
        .update_run_status(
            &current.guid,
            UpdateAutomationRunStatusRecord {
                status: AutomationRunStatus::Interrupted.as_str().to_string(),
                completed_at: Some(completed_at),
                exit_code: None,
                failure_kind: Some("process_lost".to_string()),
                error_message: None,
            },
        )
        .await
    {
        Ok(updated) => {
            let status_json = runner::run_json_for_status(
                &updated,
                AutomationRunStatus::Interrupted.as_str(),
                Some(completed_at),
                None,
            );
            let _ = runner::write_run_json(
                PathBuf::from(&updated.run_json_path).as_path(),
                &status_json,
            );
            publish_run_update(db, notification_service, event_tx, updated).await;
        }
        Err(error) => warn!("Failed to mark automation run interrupted: {}", error),
    }
}

pub(super) async fn publish_run_update(
    db: &Arc<DatabaseConnection>,
    notification_service: &Arc<NotificationService>,
    event_tx: &broadcast::Sender<AutomationEvent>,
    run: automation_run::Model,
) {
    let summary = AutomationRunSummary::from(run);
    let _ = event_tx.send(AutomationEvent::RunUpdated {
        automation_guid: summary.automation_guid.clone(),
        run_guid: summary.guid.clone(),
        status: summary.status.clone(),
        run: summary.clone(),
    });

    if !runner::is_terminal_status(&summary.status) {
        return;
    }

    let repo = AutomationRepo::new(db);
    match repo.find_automation_by_guid(&summary.automation_guid).await {
        Ok(Some(automation)) => {
            if let Some(payload) = notification_service.on_automation_run_outcome(
                summary.automation_guid.clone(),
                automation.display_name,
                summary.guid.clone(),
                summary.status.clone(),
                Some(summary.result_path.clone()),
            ) {
                let _ = event_tx.send(AutomationEvent::Notification(payload));
            }
        }
        Ok(None) => {}
        Err(error) => warn!(
            "Failed to load automation definition for run notification {}: {}",
            summary.guid, error
        ),
    }
}
