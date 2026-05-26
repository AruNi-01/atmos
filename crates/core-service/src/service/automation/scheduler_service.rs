use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use infra::db::entities::automation;
use infra::db::repo::{AutomationRepo, CreateAutomationRunRecord, UpdateAutomationRunStatusRecord};
use tracing::warn;

use crate::error::{Result, ServiceError};

use super::{
    mark_run_interrupted, publish_run_update, runner, scheduler, AutomationDefinitionChange,
    AutomationEvent, AutomationRunStatus, AutomationService, AutomationSummary,
    AutomationTriggerKind, START_FAILURE_KIND,
};

impl AutomationService {
    pub fn start_scheduler(self: Arc<Self>) {
        tokio::spawn(async move {
            if let Err(error) = self.recover_running_runs().await {
                warn!("Automation startup recovery failed: {}", error);
            }
            if let Err(error) = self.normalize_missed_schedules().await {
                warn!("Automation schedule normalization failed: {}", error);
            }

            let mut interval = tokio::time::interval(Duration::from_secs(30));
            loop {
                interval.tick().await;
                if let Err(error) = self.tick_due_schedules().await {
                    warn!("Automation scheduler tick failed: {}", error);
                }
            }
        });
    }

    pub async fn recover_running_runs(&self) -> Result<()> {
        let repo = AutomationRepo::new(&self.db);
        let runs = repo.list_running_runs().await?;
        for run in runs {
            match runner::read_run_json(&run.run_json_path) {
                Ok(run_json) if runner::is_terminal_status(&run_json.status) => {
                    let completed_at = runner::completed_at_from_run_json(&run_json)
                        .or_else(|| Some(Utc::now().naive_utc()));
                    let failure_kind = (run_json.status == AutomationRunStatus::Failed.as_str())
                        .then(|| "agent_exit".to_string());
                    let updated = repo
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
                        .await?;
                    publish_run_update(
                        &self.db,
                        &self.notification_service,
                        &self.event_tx,
                        updated,
                    )
                    .await;
                }
                Ok(_) => {
                    if self.run_window_exists(&run) {
                        self.spawn_run_watcher(run.guid);
                    } else {
                        mark_run_interrupted(
                            &self.db,
                            &self.notification_service,
                            &self.event_tx,
                            run,
                        )
                        .await;
                    }
                }
                Err(_) => {
                    mark_run_interrupted(&self.db, &self.notification_service, &self.event_tx, run)
                        .await;
                }
            }
        }
        Ok(())
    }

    pub async fn normalize_missed_schedules(&self) -> Result<()> {
        let repo = AutomationRepo::new(&self.db);
        let now = Utc::now().naive_utc();
        let schedules = repo.list_schedules_to_normalize(now).await?;
        for automation in schedules {
            let Some(expr) = automation.schedule_expr.as_deref() else {
                continue;
            };
            let next_run_at = scheduler::next_run_after_expr(
                expr,
                Some(automation.schedule_timezone.as_str()),
                now,
            )?;
            let updated = repo
                .update_next_run_at(&automation.guid, next_run_at)
                .await?;
            let summary = AutomationSummary::from(updated);
            let _ = self.event_tx.send(AutomationEvent::DefinitionUpdated {
                automation_guid: summary.guid.clone(),
                change: AutomationDefinitionChange::ScheduleNormalized,
                automation: Some(summary),
            });
        }
        Ok(())
    }

    async fn tick_due_schedules(&self) -> Result<()> {
        let repo = AutomationRepo::new(&self.db);
        let now = Utc::now().naive_utc();
        let due = repo.list_due_scheduled_automations(now, 10).await?;

        for automation in due {
            if let Some(expr) = automation.schedule_expr.as_deref() {
                let next_run_at = scheduler::next_run_after_expr(
                    expr,
                    Some(automation.schedule_timezone.as_str()),
                    now,
                )?;
                let updated = repo
                    .update_next_run_at(&automation.guid, next_run_at)
                    .await?;
                let summary = AutomationSummary::from(updated);
                let _ = self.event_tx.send(AutomationEvent::DefinitionUpdated {
                    automation_guid: summary.guid.clone(),
                    change: AutomationDefinitionChange::NextRunAdvanced,
                    automation: Some(summary),
                });
            }

            match self
                .start_run_from_model(automation.clone(), AutomationTriggerKind::Scheduled)
                .await
            {
                Ok(run)
                    if run.status == AutomationRunStatus::Failed.as_str()
                        && run.failure_kind.as_deref() == Some(START_FAILURE_KIND) =>
                {
                    if let Err(error) = self
                        .pause_schedule_after_start_failure(&automation.guid)
                        .await
                    {
                        warn!(
                            "Failed to pause scheduled automation after start failure: {}",
                            error
                        );
                    }
                }
                Ok(_) => {}
                Err(ServiceError::Validation(message)) if message == "already_running" => {}
                Err(error) => {
                    let message = error.to_string();
                    warn!("Failed to start scheduled automation run: {}", message);
                    if let Err(record_error) = self
                        .record_scheduled_start_failure(&automation, message)
                        .await
                    {
                        warn!(
                            "Failed to record scheduled automation start failure: {}",
                            record_error
                        );
                    }
                }
            }
        }

        Ok(())
    }

    async fn record_scheduled_start_failure(
        &self,
        automation: &automation::Model,
        error_message: String,
    ) -> Result<()> {
        let repo = AutomationRepo::new(&self.db);
        let prepared = runner::prepare_start_failure_files(automation, &error_message)?;
        let cwd = prepared.run_dir.to_string_lossy().to_string();
        let run = repo
            .create_run(CreateAutomationRunRecord {
                guid: prepared.run_guid.clone(),
                automation_guid: automation.guid.clone(),
                trigger_kind: AutomationTriggerKind::Scheduled.as_str().to_string(),
                status: AutomationRunStatus::Running.as_str().to_string(),
                target_kind: automation.target_kind.clone(),
                project_guid: automation.project_guid.clone(),
                workspace_guid: automation.workspace_guid.clone(),
                created_workspace_guid: None,
                cwd,
                run_dir: prepared.run_dir.to_string_lossy().to_string(),
                prompt_path: prepared.prompt_path.to_string_lossy().to_string(),
                output_path: prepared.output_path.to_string_lossy().to_string(),
                result_path: prepared.result_path.to_string_lossy().to_string(),
                run_json_path: prepared.run_json_path.to_string_lossy().to_string(),
                tmux_session_name: None,
                tmux_window_name: None,
                tmux_window_index: None,
                started_at: prepared.started_at,
            })
            .await?;
        let running_json = runner::AutomationRunJson::from_run_model(&run);
        runner::write_run_json(PathBuf::from(&run.run_json_path).as_path(), &running_json)?;

        let completed_at = Utc::now().naive_utc();
        let failed = repo
            .update_run_status(
                &run.guid,
                UpdateAutomationRunStatusRecord {
                    status: AutomationRunStatus::Failed.as_str().to_string(),
                    completed_at: Some(completed_at),
                    exit_code: None,
                    failure_kind: Some(START_FAILURE_KIND.to_string()),
                    error_message: Some(error_message),
                },
            )
            .await?;
        let failed_json = runner::run_json_for_status(
            &failed,
            AutomationRunStatus::Failed.as_str(),
            Some(completed_at),
            None,
        );
        runner::write_run_json(PathBuf::from(&failed.run_json_path).as_path(), &failed_json)?;

        self.pause_schedule_after_start_failure(&automation.guid)
            .await?;
        publish_run_update(&self.db, &self.notification_service, &self.event_tx, failed).await;
        Ok(())
    }

    async fn pause_schedule_after_start_failure(&self, automation_guid: &str) -> Result<()> {
        let repo = AutomationRepo::new(&self.db);
        let paused = repo.set_schedule_paused(automation_guid, true).await?;
        let summary = AutomationSummary::from(paused);
        let _ = self.event_tx.send(AutomationEvent::DefinitionUpdated {
            automation_guid: summary.guid.clone(),
            change: AutomationDefinitionChange::PausedAfterStartFailure,
            automation: Some(summary),
        });
        Ok(())
    }
}
