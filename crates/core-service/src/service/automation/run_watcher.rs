use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use core_engine::TmuxEngine;
use infra::db::entities::automation_run;
use infra::db::repo::{AutomationRepo, UpdateAutomationRunStatusRecord};
use sea_orm::DatabaseConnection;
use tokio::sync::broadcast;
use tracing::warn;

use super::runner;
use super::{AutomationEvent, AutomationRunStatus, AutomationRunSummary, NotificationService};

const MAX_TMUX_PROBE_ERRORS: u32 = 5;
const TMUX_PROBE_RETRY_DELAY: Duration = Duration::from_millis(500);

pub(super) async fn watch_automation_run(
    db: Arc<DatabaseConnection>,
    tmux_engine: Arc<TmuxEngine>,
    notification_service: Arc<NotificationService>,
    event_tx: broadcast::Sender<AutomationEvent>,
    run_guid: String,
) {
    let mut tmux_probe_errors = 0_u32;

    loop {
        let repo = AutomationRepo::new(&db);
        let run = match repo.find_run_by_guid(&run_guid).await {
            Ok(Some(run)) => run,
            Ok(None) => return,
            Err(error) => {
                warn!("Failed to load automation run {}: {}", run_guid, error);
                tokio::time::sleep(Duration::from_secs(1)).await;
                continue;
            }
        };

        if run.status != AutomationRunStatus::Running.as_str() {
            return;
        }

        if run.cancellation_requested {
            if let (Some(session_name), Some(window_index)) = (
                run.tmux_session_name.as_deref(),
                run.tmux_window_index
                    .and_then(|value| value.try_into().ok()),
            ) {
                let _ = tmux_engine.interrupt_window(session_name, window_index);
                tokio::time::sleep(Duration::from_secs(5)).await;
                let _ = tmux_engine.kill_window(session_name, window_index);
            }
            let current = match repo.find_run_by_guid(&run_guid).await {
                Ok(Some(current)) if current.status == AutomationRunStatus::Running.as_str() => {
                    current
                }
                Ok(Some(_)) | Ok(None) => return,
                Err(error) => {
                    warn!(
                        "Failed to re-check automation run {} before cancelling: {}",
                        run_guid, error
                    );
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    continue;
                }
            };
            let completed_at = Utc::now().naive_utc();
            match repo
                .update_run_status(
                    &current.guid,
                    UpdateAutomationRunStatusRecord {
                        status: AutomationRunStatus::Cancelled.as_str().to_string(),
                        completed_at: Some(completed_at),
                        exit_code: Some(130),
                        failure_kind: None,
                        error_message: None,
                    },
                )
                .await
            {
                Ok(updated) => {
                    let status_json = runner::run_json_for_status(
                        &updated,
                        AutomationRunStatus::Cancelled.as_str(),
                        Some(completed_at),
                        Some(130),
                    );
                    let _ = runner::write_run_json(
                        PathBuf::from(&updated.run_json_path).as_path(),
                        &status_json,
                    );
                    publish_run_update(&db, &notification_service, &event_tx, updated).await;
                }
                Err(error) => warn!("Failed to cancel automation run {}: {}", run_guid, error),
            }
            return;
        }

        if let Ok(run_json) = runner::read_run_json(&run.run_json_path) {
            if runner::is_terminal_status(&run_json.status) {
                let completed_at = runner::completed_at_from_run_json(&run_json)
                    .or_else(|| Some(Utc::now().naive_utc()));
                let failure_kind = (run_json.status == AutomationRunStatus::Failed.as_str())
                    .then(|| "agent_exit".to_string());
                match repo
                    .update_run_status(
                        &run.guid,
                        UpdateAutomationRunStatusRecord {
                            status: run_json.status,
                            completed_at,
                            exit_code: run_json.exit_code,
                            failure_kind,
                            error_message: None,
                        },
                    )
                    .await
                {
                    Ok(updated) => {
                        publish_run_update(&db, &notification_service, &event_tx, updated).await
                    }
                    Err(error) => warn!(
                        "Failed to persist automation run terminal status {}: {}",
                        run_guid, error
                    ),
                }
                return;
            }
        }

        if let (Some(session_name), Some(window_index)) = (
            run.tmux_session_name.as_deref(),
            run.tmux_window_index
                .and_then(|value| value.try_into().ok()),
        ) {
            match tmux_engine.window_exists(session_name, window_index) {
                Ok(true) => {
                    tmux_probe_errors = 0;
                }
                Ok(false) => {
                    mark_run_interrupted(&db, &notification_service, &event_tx, run).await;
                    return;
                }
                Err(error) => {
                    tmux_probe_errors = tmux_probe_errors.saturating_add(1);
                    warn!(
                        "Failed to probe automation run window {}:{} for {} (attempt {}/{}): {}",
                        session_name,
                        window_index,
                        run_guid,
                        tmux_probe_errors,
                        MAX_TMUX_PROBE_ERRORS,
                        error
                    );
                    if tmux_probe_errors >= MAX_TMUX_PROBE_ERRORS {
                        mark_run_interrupted(&db, &notification_service, &event_tx, run).await;
                        return;
                    }
                    tokio::time::sleep(TMUX_PROBE_RETRY_DELAY).await;
                    continue;
                }
            }
        }

        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

pub(super) async fn mark_run_interrupted(
    db: &Arc<DatabaseConnection>,
    notification_service: &Arc<NotificationService>,
    event_tx: &broadcast::Sender<AutomationEvent>,
    run: automation_run::Model,
) {
    let repo = AutomationRepo::new(db);
    let completed_at = Utc::now().naive_utc();
    match repo
        .update_run_status(
            &run.guid,
            UpdateAutomationRunStatusRecord {
                status: AutomationRunStatus::Interrupted.as_str().to_string(),
                completed_at: Some(completed_at),
                exit_code: None,
                failure_kind: Some("terminal_lost".to_string()),
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
