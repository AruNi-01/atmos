use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use core_engine::TmuxEngine;
use infra::db::entities::{automation, automation_run};
use infra::db::repo::{AutomationRepo, CreateAutomationRunRecord, UpdateAutomationRunStatusRecord};
use tracing::warn;

use crate::error::{Result, ServiceError};

use super::{
    agents, artifacts, publish_run_update, runner, watch_automation_run, AutomationEvent,
    AutomationRunDetail, AutomationRunStatus, AutomationRunSummary, AutomationService,
    AutomationTargetKind, AutomationTriggerKind, START_FAILURE_KIND,
};

impl AutomationService {
    pub async fn run_now(&self, guid: &str) -> Result<AutomationRunDetail> {
        let repo = AutomationRepo::new(&self.db);
        let automation = repo
            .find_automation_by_guid(guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Automation {guid} not found")))?;
        let run = self
            .start_run_from_model(automation, AutomationTriggerKind::Manual)
            .await?;
        Ok(AutomationRunDetail {
            summary: AutomationRunSummary::from(run),
        })
    }

    pub async fn cancel_run(&self, run_guid: &str) -> Result<AutomationRunDetail> {
        let repo = AutomationRepo::new(&self.db);
        let existing = repo.find_run_by_guid(run_guid).await?.ok_or_else(|| {
            ServiceError::NotFound(format!("Automation run {run_guid} not found"))
        })?;
        if existing.status != AutomationRunStatus::Running.as_str() {
            return Ok(AutomationRunDetail {
                summary: AutomationRunSummary::from(existing),
            });
        }

        repo.mark_run_cancellation_requested(run_guid).await?;
        self.interrupt_run_window(&existing);
        tokio::time::sleep(Duration::from_secs(5)).await;
        if let Some(current) = repo.find_run_by_guid(run_guid).await? {
            if current.status != AutomationRunStatus::Running.as_str() {
                return Ok(AutomationRunDetail {
                    summary: AutomationRunSummary::from(current),
                });
            }
        }
        self.kill_run_window(&existing);

        let completed_at = Utc::now().naive_utc();
        let run = repo
            .update_run_status(
                run_guid,
                UpdateAutomationRunStatusRecord {
                    status: AutomationRunStatus::Cancelled.as_str().to_string(),
                    completed_at: Some(completed_at),
                    exit_code: Some(130),
                    failure_kind: None,
                    error_message: None,
                },
            )
            .await?;
        let status_json = runner::run_json_for_status(
            &run,
            AutomationRunStatus::Cancelled.as_str(),
            Some(completed_at),
            Some(130),
        );
        let _ = runner::write_run_json(PathBuf::from(&run.run_json_path).as_path(), &status_json);
        let summary = AutomationRunSummary::from(run);
        self.emit_run_and_notify(&summary).await;
        Ok(AutomationRunDetail { summary })
    }

    pub(super) async fn start_run_from_model(
        &self,
        automation: automation::Model,
        trigger_kind: AutomationTriggerKind,
    ) -> Result<automation_run::Model> {
        let automation_guid = automation.guid.clone();
        self.claim_run_start(&automation_guid).await?;
        let result = self
            .start_run_from_model_claimed(automation, trigger_kind)
            .await;
        self.release_run_start(&automation_guid).await;
        result
    }

    async fn claim_run_start(&self, automation_guid: &str) -> Result<()> {
        let mut active = self.active_start_guids.lock().await;
        if !active.insert(automation_guid.to_string()) {
            return Err(ServiceError::Validation("already_running".to_string()));
        }
        Ok(())
    }

    async fn release_run_start(&self, automation_guid: &str) {
        let mut active = self.active_start_guids.lock().await;
        active.remove(automation_guid);
    }

    async fn start_run_from_model_claimed(
        &self,
        automation: automation::Model,
        trigger_kind: AutomationTriggerKind,
    ) -> Result<automation_run::Model> {
        let repo = AutomationRepo::new(&self.db);
        if repo
            .has_running_run_for_automation(&automation.guid)
            .await?
        {
            return Err(ServiceError::Validation("already_running".to_string()));
        }

        let agent_command = agents::resolve_automation_agent(&automation.agent_id)?;
        let instructions = artifacts::read_instructions(&automation.instructions_path)?;
        let target = self.resolve_target(&automation).await?;
        let prepared =
            runner::prepare_run_files(&automation, &instructions, &target, trigger_kind.as_str())?;

        let cwd = if target.target_kind == AutomationTargetKind::Standalone.as_str() {
            prepared.run_dir.clone()
        } else {
            target.cwd.clone()
        };
        if !cwd.exists() {
            return Err(ServiceError::Validation(format!(
                "Automation working directory does not exist: {}",
                cwd.display()
            )));
        }

        let terminal_launcher =
            TmuxAutomationTerminalLauncher::new(self.terminal_service.tmux_engine());
        let tmux_session_name = self.tmux_session_name_for_target(&target);
        let cwd_str = cwd.to_string_lossy().to_string();
        let tmux_window_index = create_automation_terminal_window(
            &terminal_launcher,
            &tmux_session_name,
            &prepared.tmux_window_name,
            &cwd_str,
        )?;

        let command = agent_command.build_command(&agents::AutomationCommandInput {
            prompt_path: prepared.prompt_path.clone(),
            final_path: prepared.result_path.clone(),
            output_path: prepared.output_path.clone(),
            run_json_path: prepared.run_json_path.clone(),
            run_guid: prepared.run_guid.clone(),
            automation_guid: automation.guid.clone(),
            started_at: prepared.started_at,
            run_dir: prepared.run_dir.clone(),
            tmux_session_name: tmux_session_name.clone(),
            tmux_window_name: prepared.tmux_window_name.clone(),
            tmux_window_index,
        });

        let run = match repo
            .create_run(CreateAutomationRunRecord {
                guid: prepared.run_guid.clone(),
                automation_guid: automation.guid.clone(),
                trigger_kind: trigger_kind.as_str().to_string(),
                status: AutomationRunStatus::Running.as_str().to_string(),
                target_kind: target.target_kind.clone(),
                project_guid: target.project_guid.clone(),
                workspace_guid: target.workspace_guid.clone(),
                created_workspace_guid: target.created_workspace_guid.clone(),
                cwd: cwd_str,
                run_dir: prepared.run_dir.to_string_lossy().to_string(),
                prompt_path: prepared.prompt_path.to_string_lossy().to_string(),
                output_path: prepared.output_path.to_string_lossy().to_string(),
                result_path: prepared.result_path.to_string_lossy().to_string(),
                run_json_path: prepared.run_json_path.to_string_lossy().to_string(),
                tmux_session_name: Some(tmux_session_name.clone()),
                tmux_window_name: Some(prepared.tmux_window_name.clone()),
                tmux_window_index: Some(tmux_window_index as i32),
                started_at: prepared.started_at,
            })
            .await
        {
            Ok(run) => run,
            Err(error) => {
                cleanup_automation_terminal_window(
                    &terminal_launcher,
                    &tmux_session_name,
                    tmux_window_index,
                );
                return Err(error.into());
            }
        };

        let run_json = runner::AutomationRunJson::from_run_model(&run);
        if let Err(error) =
            runner::write_run_json(PathBuf::from(&run.run_json_path).as_path(), &run_json)
        {
            cleanup_automation_terminal_window(
                &terminal_launcher,
                &tmux_session_name,
                tmux_window_index,
            );
            let completed_at = Utc::now().naive_utc();
            let failed = repo
                .update_run_status(
                    &run.guid,
                    UpdateAutomationRunStatusRecord {
                        status: AutomationRunStatus::Failed.as_str().to_string(),
                        completed_at: Some(completed_at),
                        exit_code: None,
                        failure_kind: Some(START_FAILURE_KIND.to_string()),
                        error_message: Some(error.to_string()),
                    },
                )
                .await?;
            publish_run_update(
                &self.db,
                &self.notification_service,
                &self.event_tx,
                failed.clone(),
            )
            .await;
            return Ok(failed);
        }

        if let Err(error) = send_automation_terminal_command(
            &terminal_launcher,
            &tmux_session_name,
            tmux_window_index,
            &(command + "\n"),
        ) {
            let completed_at = Utc::now().naive_utc();
            cleanup_automation_terminal_window(
                &terminal_launcher,
                &tmux_session_name,
                tmux_window_index,
            );
            let failed = repo
                .update_run_status(
                    &run.guid,
                    UpdateAutomationRunStatusRecord {
                        status: AutomationRunStatus::Failed.as_str().to_string(),
                        completed_at: Some(completed_at),
                        exit_code: None,
                        failure_kind: Some(START_FAILURE_KIND.to_string()),
                        error_message: Some(error.to_string()),
                    },
                )
                .await?;
            let status_json = runner::run_json_for_status(
                &failed,
                AutomationRunStatus::Failed.as_str(),
                Some(completed_at),
                None,
            );
            let _ = runner::write_run_json(
                PathBuf::from(&failed.run_json_path).as_path(),
                &status_json,
            );
            publish_run_update(
                &self.db,
                &self.notification_service,
                &self.event_tx,
                failed.clone(),
            )
            .await;
            return Ok(failed);
        }

        publish_run_update(
            &self.db,
            &self.notification_service,
            &self.event_tx,
            run.clone(),
        )
        .await;
        self.spawn_run_watcher(run.guid.clone());
        Ok(run)
    }

    pub(super) fn spawn_run_watcher(&self, run_guid: String) {
        let db = Arc::clone(&self.db);
        let notification_service = Arc::clone(&self.notification_service);
        let event_tx = self.event_tx.clone();
        let tmux_engine = self.terminal_service.tmux_engine();
        tokio::spawn(async move {
            watch_automation_run(db, tmux_engine, notification_service, event_tx, run_guid).await;
        });
    }

    pub(super) fn run_window_exists(&self, run: &automation_run::Model) -> bool {
        let Some(session_name) = run.tmux_session_name.as_deref() else {
            return false;
        };
        let Some(window_index) = run
            .tmux_window_index
            .and_then(|value| value.try_into().ok())
        else {
            return false;
        };
        self.terminal_service
            .tmux_engine()
            .window_exists(session_name, window_index)
            .unwrap_or(false)
    }

    fn interrupt_run_window(&self, run: &automation_run::Model) {
        let Some(session_name) = run.tmux_session_name.as_deref() else {
            return;
        };
        let Some(window_index) = run
            .tmux_window_index
            .and_then(|value| value.try_into().ok())
        else {
            return;
        };
        let _ = self
            .terminal_service
            .tmux_engine()
            .interrupt_window(session_name, window_index);
    }

    fn kill_run_window(&self, run: &automation_run::Model) {
        let Some(session_name) = run.tmux_session_name.as_deref() else {
            return;
        };
        let Some(window_index) = run
            .tmux_window_index
            .and_then(|value| value.try_into().ok())
        else {
            return;
        };
        let _ = self
            .terminal_service
            .tmux_engine()
            .kill_window(session_name, window_index);
    }

    async fn emit_run_and_notify(&self, summary: &AutomationRunSummary) {
        let _ = self.event_tx.send(AutomationEvent::RunUpdated {
            automation_guid: summary.automation_guid.clone(),
            run_guid: summary.guid.clone(),
            status: summary.status.clone(),
            run: summary.clone(),
        });

        if !runner::is_terminal_status(&summary.status) {
            return;
        }

        let repo = AutomationRepo::new(&self.db);
        if let Ok(Some(automation)) = repo.find_automation_by_guid(&summary.automation_guid).await {
            if let Some(payload) = self.notification_service.on_automation_run_outcome(
                summary.automation_guid.clone(),
                automation.display_name,
                summary.guid.clone(),
                summary.status.clone(),
                Some(summary.result_path.clone()),
            ) {
                let _ = self.event_tx.send(AutomationEvent::Notification(payload));
            }
        }
    }
}

trait AutomationTerminalLauncher {
    fn create_window(
        &self,
        session_name: &str,
        window_name: &str,
        cwd: &str,
    ) -> std::result::Result<u32, String>;

    fn send_text_to_window(
        &self,
        session_name: &str,
        window_index: u32,
        text: &str,
    ) -> std::result::Result<(), String>;

    fn kill_window(&self, session_name: &str, window_index: u32)
        -> std::result::Result<(), String>;
}

struct TmuxAutomationTerminalLauncher {
    tmux_engine: Arc<TmuxEngine>,
}

impl TmuxAutomationTerminalLauncher {
    fn new(tmux_engine: Arc<TmuxEngine>) -> Self {
        Self { tmux_engine }
    }
}

impl AutomationTerminalLauncher for TmuxAutomationTerminalLauncher {
    fn create_window(
        &self,
        session_name: &str,
        window_name: &str,
        cwd: &str,
    ) -> std::result::Result<u32, String> {
        self.tmux_engine
            .create_window(session_name, window_name, Some(cwd), None, None)
            .map_err(|error| error.to_string())
    }

    fn send_text_to_window(
        &self,
        session_name: &str,
        window_index: u32,
        text: &str,
    ) -> std::result::Result<(), String> {
        self.tmux_engine
            .send_text_to_window(session_name, window_index, text)
            .map_err(|error| error.to_string())
    }

    fn kill_window(
        &self,
        session_name: &str,
        window_index: u32,
    ) -> std::result::Result<(), String> {
        self.tmux_engine
            .kill_window(session_name, window_index)
            .map_err(|error| error.to_string())
    }
}

fn create_automation_terminal_window(
    launcher: &impl AutomationTerminalLauncher,
    session_name: &str,
    window_name: &str,
    cwd: &str,
) -> Result<u32> {
    launcher
        .create_window(session_name, window_name, cwd)
        .map_err(|error| {
            ServiceError::Processing(format!(
                "Failed to create automation terminal window: {error}"
            ))
        })
}

fn send_automation_terminal_command(
    launcher: &impl AutomationTerminalLauncher,
    session_name: &str,
    window_index: u32,
    command: &str,
) -> std::result::Result<(), String> {
    launcher.send_text_to_window(session_name, window_index, command)
}

fn cleanup_automation_terminal_window(
    launcher: &impl AutomationTerminalLauncher,
    session_name: &str,
    window_index: u32,
) {
    if let Err(error) = launcher.kill_window(session_name, window_index) {
        warn!(
            "Failed to clean up automation terminal window {}:{} after startup error: {}",
            session_name, window_index, error
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeTerminalLauncher {
        create_result: std::result::Result<u32, String>,
        send_result: std::result::Result<(), String>,
    }

    impl AutomationTerminalLauncher for FakeTerminalLauncher {
        fn create_window(
            &self,
            _session_name: &str,
            _window_name: &str,
            _cwd: &str,
        ) -> std::result::Result<u32, String> {
            self.create_result.clone()
        }

        fn send_text_to_window(
            &self,
            _session_name: &str,
            _window_index: u32,
            _text: &str,
        ) -> std::result::Result<(), String> {
            self.send_result.clone()
        }

        fn kill_window(
            &self,
            _session_name: &str,
            _window_index: u32,
        ) -> std::result::Result<(), String> {
            Ok(())
        }
    }

    #[test]
    fn terminal_launcher_boundary_maps_window_create_failures() {
        let launcher = FakeTerminalLauncher {
            create_result: Err("tmux unavailable".to_string()),
            send_result: Ok(()),
        };

        let error =
            create_automation_terminal_window(&launcher, "automations", "Automations", "/tmp")
                .unwrap_err();

        assert!(error
            .to_string()
            .contains("Failed to create automation terminal window"));
    }

    #[test]
    fn terminal_launcher_boundary_can_fake_send_failures() {
        let launcher = FakeTerminalLauncher {
            create_result: Ok(3),
            send_result: Err("pane lost".to_string()),
        };

        let window_index =
            create_automation_terminal_window(&launcher, "automations", "Automations", "/tmp")
                .unwrap();
        let error =
            send_automation_terminal_command(&launcher, "automations", window_index, "run\n")
                .unwrap_err();

        assert_eq!(window_index, 3);
        assert_eq!(error, "pane lost");
    }
}
