use std::path::Path;
use std::time::Duration;

use chrono::Utc;
use infra::db::repo::{AutomationRepo, UpdateAutomationRunStatusRecord};

use crate::error::{Result, ServiceError};

use super::execute_mode::{run_paths_from_parts, AutomationExecuteMode, AutomationRunPaths};
use super::{
    publish_run_update, runner, AutomationEvent, AutomationRunDetail, AutomationRunStatus,
    AutomationRunSummary, AutomationService,
};

impl AutomationService {
    pub async fn complete_run(
        &self,
        run_guid: &str,
        failed: bool,
        message: Option<String>,
    ) -> Result<AutomationRunDetail> {
        let repo = AutomationRepo::new(&self.db);
        let run = repo.find_run_by_guid(run_guid).await?.ok_or_else(|| {
            ServiceError::NotFound(format!("Automation run {run_guid} not found"))
        })?;
        if run.status != AutomationRunStatus::Running.as_str() {
            return Err(ServiceError::Validation(format!(
                "Automation run {run_guid} is not running"
            )));
        }

        if !failed {
            let content = std::fs::read_to_string(&run.result_path).unwrap_or_default();
            if content.trim().is_empty() {
                return Err(ServiceError::Validation(
                    "final.md is required before completing a run. Write the result first or pass --failed."
                        .to_string(),
                ));
            }
        }

        let completed_at = Utc::now().naive_utc();
        let status = if failed {
            AutomationRunStatus::Failed
        } else {
            AutomationRunStatus::Completed
        };
        let updated = repo
            .update_run_status(
                run_guid,
                UpdateAutomationRunStatusRecord {
                    status: status.as_str().to_string(),
                    completed_at: Some(completed_at),
                    exit_code: if failed { Some(1) } else { Some(0) },
                    failure_kind: failed.then(|| "agent_failed".to_string()),
                    error_message: failed.then(|| {
                        message
                            .filter(|value| !value.trim().is_empty())
                            .unwrap_or_else(|| "Automation marked failed".to_string())
                    }),
                },
            )
            .await?;
        let run_json = runner::AutomationRunJson::from_run_model(&updated);
        runner::write_run_json(Path::new(&updated.run_json_path), &run_json)?;
        publish_run_update(
            &self.db,
            &self.notification_service,
            &self.event_tx,
            updated.clone(),
        )
        .await;
        Ok(AutomationRunDetail {
            summary: AutomationRunSummary::from(updated),
        })
    }

    pub async fn run_paths(&self, run_guid: &str) -> Result<AutomationRunPaths> {
        let repo = AutomationRepo::new(&self.db);
        let run = repo.find_run_by_guid(run_guid).await?.ok_or_else(|| {
            ServiceError::NotFound(format!("Automation run {run_guid} not found"))
        })?;
        run_paths_from_parts(
            &run.guid,
            &run.automation_guid,
            &run.run_dir,
            &run.prompt_path,
            &run.result_path,
            &run.run_json_path,
            &run.cwd,
        )
    }

    pub async fn dismiss_stale_prompt(&self, run_guid: &str) -> Result<AutomationRunDetail> {
        let repo = AutomationRepo::new(&self.db);
        let existing = repo.find_run_by_guid(run_guid).await?.ok_or_else(|| {
            ServiceError::NotFound(format!("Automation run {run_guid} not found"))
        })?;
        if existing.stale_prompted_at.is_none() {
            return Ok(AutomationRunDetail {
                summary: AutomationRunSummary::from(existing),
            });
        }
        let updated = repo.dismiss_stale_prompt(run_guid).await?;
        Ok(AutomationRunDetail {
            summary: AutomationRunSummary::from(updated),
        })
    }

    pub async fn scan_stale_interactive_prompts(&self) -> Result<usize> {
        let repo = AutomationRepo::new(&self.db);
        let older_than = Utc::now().naive_utc()
            - chrono::Duration::from_std(stale_prompt_age()).unwrap_or(chrono::Duration::hours(1));
        let candidates = repo.list_stale_interactive_candidates(older_than).await?;
        let mut prompted = 0usize;
        for run in candidates {
            let Some(automation) = repo.find_automation_by_guid(&run.automation_guid).await? else {
                continue;
            };
            let updated = repo
                .mark_stale_prompted(&run.guid, Utc::now().naive_utc())
                .await?;
            let _ = self.event_tx.send(AutomationEvent::StalePrompt {
                automation_guid: updated.automation_guid.clone(),
                run_guid: updated.guid.clone(),
                display_name: automation.display_name,
                execute_mode: updated.execute_mode.clone(),
                surface_scope_id: updated.surface_scope_id.clone(),
                surface_session_id: updated.surface_session_id.clone(),
            });
            prompted += 1;
        }
        Ok(prompted)
    }
}

pub fn stale_prompt_age() -> Duration {
    Duration::from_secs(60 * 60)
}

pub fn run_is_interactive(execute_mode: &str) -> bool {
    AutomationExecuteMode::parse(execute_mode)
        .map(|mode| mode.is_interactive())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stale_prompt_age_is_one_hour() {
        assert_eq!(stale_prompt_age(), Duration::from_secs(60 * 60));
    }

    #[test]
    fn only_terminal_and_chat_are_interactive() {
        assert!(run_is_interactive("terminal"));
        assert!(run_is_interactive("chat"));
        assert!(!run_is_interactive("headless"));
        assert!(!run_is_interactive("unknown"));
    }
}
