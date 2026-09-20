use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::Utc;
use infra::db::entities::{automation, automation_run};
use infra::db::repo::{AutomationRepo, CreateAutomationRunRecord, UpdateAutomationRunStatusRecord};

use crate::error::{Result, ServiceError};

use super::{
    agents, artifacts, process_runner, publish_run_update, runner,
    AutomationContinueInTerminalResponse, AutomationRunDetail, AutomationRunStatus,
    AutomationRunSummary, AutomationService, AutomationTriggerKind, START_FAILURE_KIND,
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

        if super::complete::run_is_interactive(&existing.execute_mode) {
            self.interrupt_interactive_surface(&existing).await;
            let completed_at = Utc::now().naive_utc();
            let updated = repo
                .update_run_status(
                    run_guid,
                    UpdateAutomationRunStatusRecord {
                        status: AutomationRunStatus::Cancelled.as_str().to_string(),
                        completed_at: Some(completed_at),
                        exit_code: None,
                        failure_kind: None,
                        error_message: None,
                    },
                )
                .await?;
            let run_json = runner::AutomationRunJson::from_run_model(&updated);
            let _ = runner::write_run_json(Path::new(&updated.run_json_path), &run_json);
            publish_run_update(
                &self.db,
                &self.notification_service,
                &self.event_tx,
                updated.clone(),
            )
            .await;
            return Ok(AutomationRunDetail {
                summary: AutomationRunSummary::from(updated),
            });
        }

        repo.mark_run_cancellation_requested(run_guid).await?;
        tokio::time::sleep(Duration::from_secs(5)).await;
        if let Some(current) = repo.find_run_by_guid(run_guid).await? {
            if current.status != AutomationRunStatus::Running.as_str() {
                return Ok(AutomationRunDetail {
                    summary: AutomationRunSummary::from(current),
                });
            }
            return Ok(AutomationRunDetail {
                summary: AutomationRunSummary::from(current),
            });
        }
        Ok(AutomationRunDetail {
            summary: AutomationRunSummary::from(existing),
        })
    }

    pub async fn continue_in_terminal(
        &self,
        run_guid: &str,
    ) -> Result<AutomationContinueInTerminalResponse> {
        let repo = AutomationRepo::new(&self.db);
        let run = repo.find_run_by_guid(run_guid).await?.ok_or_else(|| {
            ServiceError::NotFound(format!("Automation run {run_guid} not found"))
        })?;
        let automation = repo
            .find_automation_by_guid(&run.automation_guid)
            .await?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Automation {} not found", run.automation_guid))
            })?;
        let run_config = run
            .agent_config_json
            .as_deref()
            .or(automation.agent_config_json.as_deref())
            .and_then(parse_run_config);
        let mut agent = agents::resolve_interactive_automation_agent_with_config(
            &automation.agent_id,
            run_config.as_ref(),
        )?;
        agent
            .args
            .extend(super::interactive_runner::interactive_trust_args(
                &agent.agent_id,
                &run.cwd,
            ));

        let prompt_path = PathBuf::from(&run.run_dir).join(runner::CONTINUE_PROMPT_FILE);
        let memory_path = artifacts::ensure_memory_file(&automation.guid)?;
        let prompt = build_continue_prompt(&automation, &run, &memory_path);
        artifacts::write_user_private_file(&prompt_path, &prompt)?;

        let command = agent.build_terminal_launch_command();
        Ok(AutomationContinueInTerminalResponse {
            run_guid: run.guid.clone(),
            automation_guid: automation.guid.clone(),
            agent_id: automation.agent_id.clone(),
            agent_label: self
                .agent_capabilities()?
                .into_iter()
                .find(|capability| capability.agent_id == automation.agent_id)
                .map(|capability| capability.label),
            target_kind: run.target_kind.clone(),
            project_guid: run.project_guid.clone(),
            workspace_guid: run
                .created_workspace_guid
                .clone()
                .or(run.workspace_guid.clone()),
            command,
            terminal_label: format!("Automation {}", short_run_id(run_guid)),
            prompt_path: prompt_path.to_string_lossy().to_string(),
            prompt_content: prompt,
        })
    }

    pub(super) async fn start_run_from_model(
        &self,
        automation: automation::Model,
        trigger_kind: AutomationTriggerKind,
    ) -> Result<automation_run::Model> {
        self.start_run_from_model_with_context(automation, trigger_kind, None, None)
            .await
    }

    pub(super) async fn start_run_from_model_with_context(
        &self,
        automation: automation::Model,
        trigger_kind: AutomationTriggerKind,
        trigger_context: Option<String>,
        trigger_source_json: Option<String>,
    ) -> Result<automation_run::Model> {
        let automation_guid = automation.guid.clone();
        self.claim_run_start(&automation_guid).await?;
        let result = self
            .start_run_from_model_claimed(
                automation,
                trigger_kind,
                trigger_context,
                trigger_source_json,
            )
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
        trigger_context: Option<String>,
        trigger_source_json: Option<String>,
    ) -> Result<automation_run::Model> {
        let repo = AutomationRepo::new(&self.db);
        if repo
            .has_running_run_for_automation(&automation.guid)
            .await?
        {
            return Err(ServiceError::Validation("already_running".to_string()));
        }

        let execute_mode = super::AutomationExecuteMode::parse(&automation.execute_mode)?;
        let run_config = automation
            .agent_config_json
            .as_deref()
            .and_then(parse_run_config);
        let agent_command = if execute_mode == super::AutomationExecuteMode::Chat {
            None
        } else if execute_mode == super::AutomationExecuteMode::Terminal {
            Some(agents::resolve_interactive_automation_agent_with_config(
                &automation.agent_id,
                run_config.as_ref(),
            )?)
        } else {
            Some(agents::resolve_automation_agent_with_config(
                &automation.agent_id,
                run_config.as_ref(),
            )?)
        };
        let instructions = artifacts::read_instructions(&automation.instructions_path)?;
        let target = self.resolve_target(&automation).await?;
        let prepared = runner::prepare_run_files(
            &automation,
            &instructions,
            &target,
            trigger_kind.as_str(),
            trigger_context.as_deref(),
        )?;

        let cwd = super::interactive_runner::interactive_cwd(
            &automation,
            &target.target_kind,
            &prepared.run_dir,
            &target.cwd,
            execute_mode,
        )?;
        if !cwd.exists() {
            return Err(ServiceError::Validation(format!(
                "Automation working directory does not exist: {}",
                cwd.display()
            )));
        }

        let cwd_str = cwd.to_string_lossy().to_string();
        if execute_mode.is_interactive() {
            super::interactive_runner::write_interactive_prompt(
                &automation,
                &prepared.run_guid,
                &prepared.prompt_path,
                &cwd_str,
            )?;
        }

        let invocation = agent_command.as_ref().map(|agent| {
            agent.build_invocation(agents::AutomationCommandInput {
                prompt_path: prepared.prompt_path.clone(),
            })
        });

        let run = match repo
            .create_run(CreateAutomationRunRecord {
                guid: prepared.run_guid.clone(),
                automation_guid: automation.guid.clone(),
                agent_id: Some(automation.agent_id.clone()),
                agent_label: agent_command.as_ref().map(|agent| agent.label.clone()),
                agent_config_json: automation.agent_config_json.clone(),
                trigger_kind: trigger_kind.as_str().to_string(),
                trigger_source_json,
                status: AutomationRunStatus::Running.as_str().to_string(),
                target_kind: target.target_kind.clone(),
                project_guid: target.project_guid.clone(),
                workspace_guid: target.workspace_guid.clone(),
                created_workspace_guid: target.created_workspace_guid.clone(),
                cwd: cwd_str.clone(),
                run_dir: prepared.run_dir.to_string_lossy().to_string(),
                prompt_path: prepared.prompt_path.to_string_lossy().to_string(),
                result_path: prepared.result_path.to_string_lossy().to_string(),
                run_json_path: prepared.run_json_path.to_string_lossy().to_string(),
                tmux_session_name: None,
                tmux_window_name: None,
                tmux_window_index: None,
                started_at: prepared.started_at,
                execute_mode: execute_mode.as_str().to_string(),
                surface_kind: Some(
                    match execute_mode {
                        super::AutomationExecuteMode::Headless => "none",
                        super::AutomationExecuteMode::Terminal => "terminal",
                        super::AutomationExecuteMode::Chat => "chat",
                    }
                    .to_string(),
                ),
                surface_session_id: None,
                surface_scope_id: None,
            })
            .await
        {
            Ok(run) => run,
            Err(error) => return Err(error.into()),
        };

        let run_json = runner::AutomationRunJson::from_run_model(&run);
        if let Err(error) =
            runner::write_run_json(PathBuf::from(&run.run_json_path).as_path(), &run_json)
        {
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

        publish_run_update(
            &self.db,
            &self.notification_service,
            &self.event_tx,
            run.clone(),
        )
        .await;
        if execute_mode.is_interactive() {
            match self
                .start_interactive_surface(&automation, run.clone(), execute_mode, &cwd_str)
                .await
            {
                Ok(updated) => {
                    publish_run_update(
                        &self.db,
                        &self.notification_service,
                        &self.event_tx,
                        updated.clone(),
                    )
                    .await;
                    return Ok(updated);
                }
                Err(error) => {
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
            }
        }
        if let Some(invocation) = invocation {
            self.spawn_process_runner(run.guid.clone(), invocation);
        }
        Ok(run)
    }

    pub(super) fn spawn_process_runner(
        &self,
        run_guid: String,
        invocation: agents::AutomationAgentInvocation,
    ) {
        let db = self.db.clone();
        let notification_service = self.notification_service.clone();
        let event_tx = self.event_tx.clone();
        tokio::spawn(async move {
            process_runner::run_automation_process(
                db,
                notification_service,
                event_tx,
                run_guid,
                invocation,
            )
            .await;
        });
    }
}

fn parse_run_config(raw: &str) -> Option<agents::AutomationAgentRunConfig> {
    serde_json::from_str(raw).ok()
}

fn build_continue_prompt(
    automation: &automation::Model,
    run: &automation_run::Model,
    memory_path: &Path,
) -> String {
    format!(
        r#"<automation_continue>
  <automation_name>{automation_name}</automation_name>
  <automation_id>{automation_guid}</automation_id>
  <run_id>{run_guid}</run_id>
  <status>{status}</status>
  <cwd>{cwd}</cwd>
  <task>Read the run context and continue from the result. Start by checking the final result, then inspect the event stream only if needed. Preserve the original automation intent and explicitly mention any follow-up actions you take.</task>
  <artifacts>
    <prompt>{prompt_path}</prompt>
    <final>{result_path}</final>
    <run_json>{run_json_path}</run_json>
    <memory>{memory_path}</memory>
  </artifacts>
  <memory_policy>Follow the memory rules in the original prompt. Default: leave the file unchanged. Edit it only for a durable fact a later run would otherwise miss.</memory_policy>
</automation_continue>
"#,
        automation_name = super::xml_escape(&automation.display_name),
        automation_guid = super::xml_escape(&automation.guid),
        run_guid = super::xml_escape(&run.guid),
        status = super::xml_escape(&run.status),
        cwd = super::xml_escape(&run.cwd),
        prompt_path = super::xml_escape(&run.prompt_path),
        result_path = super::xml_escape(&run.result_path),
        run_json_path = super::xml_escape(&run.run_json_path),
        memory_path = super::xml_escape(&memory_path.display().to_string()),
    )
}

fn short_run_id(run_guid: &str) -> String {
    run_guid.chars().take(8).collect()
}

#[cfg(test)]
mod tests {
    #[test]
    fn interactive_cancel_interrupts_surface_then_marks_cancelled() {
        let source = include_str!("lifecycle.rs");
        let start = source.find("pub async fn cancel_run").expect("cancel_run");
        let end = source
            .find("pub async fn continue_in_terminal")
            .expect("continue_in_terminal");
        let block = &source[start..end];
        let interrupt_at = block
            .find("interrupt_interactive_surface")
            .expect("interrupt live surface");
        let cancelled_at = block
            .find("AutomationRunStatus::Cancelled")
            .expect("mark cancelled");
        assert!(
            interrupt_at < cancelled_at,
            "interrupt the live turn before persisting cancelled"
        );
        assert!(!block.contains("kill_window"));
        assert!(!block.contains("destroy_session"));
        assert!(!block.contains("close_session"));
    }
}
