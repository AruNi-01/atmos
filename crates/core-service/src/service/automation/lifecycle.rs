use std::path::PathBuf;
use std::time::Duration;

use chrono::Utc;
use infra::db::entities::{automation, automation_run};
use infra::db::repo::{AutomationRepo, CreateAutomationRunRecord, UpdateAutomationRunStatusRecord};

use crate::error::{Result, ServiceError};

use super::{
    agents, artifacts, process_runner, publish_run_update, runner,
    AutomationContinueInTerminalResponse, AutomationRunDetail, AutomationRunStatus,
    AutomationRunSummary, AutomationService, AutomationTargetKind, AutomationTriggerKind,
    START_FAILURE_KIND,
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
        let agent = agents::resolve_interactive_automation_agent(&automation.agent_id)?;

        let prompt_path = PathBuf::from(&run.run_dir).join(runner::CONTINUE_PROMPT_FILE);
        let prompt = build_continue_prompt(&automation, &run);
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

        let agent_command = agents::resolve_automation_agent(&automation.agent_id)?;
        let instructions = artifacts::read_instructions(&automation.instructions_path)?;
        let target = self.resolve_target(&automation).await?;
        let prepared = runner::prepare_run_files(
            &automation,
            &instructions,
            &target,
            trigger_kind.as_str(),
            trigger_context.as_deref(),
        )?;

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

        let cwd_str = cwd.to_string_lossy().to_string();

        let invocation = agent_command.build_invocation(agents::AutomationCommandInput {
            prompt_path: prepared.prompt_path.clone(),
        });

        let run = match repo
            .create_run(CreateAutomationRunRecord {
                guid: prepared.run_guid.clone(),
                automation_guid: automation.guid.clone(),
                agent_id: Some(agent_command.agent_id.clone()),
                agent_label: Some(agent_command.label.clone()),
                trigger_kind: trigger_kind.as_str().to_string(),
                trigger_source_json,
                status: AutomationRunStatus::Running.as_str().to_string(),
                target_kind: target.target_kind.clone(),
                project_guid: target.project_guid.clone(),
                workspace_guid: target.workspace_guid.clone(),
                created_workspace_guid: target.created_workspace_guid.clone(),
                cwd: cwd_str,
                run_dir: prepared.run_dir.to_string_lossy().to_string(),
                prompt_path: prepared.prompt_path.to_string_lossy().to_string(),
                result_path: prepared.result_path.to_string_lossy().to_string(),
                run_json_path: prepared.run_json_path.to_string_lossy().to_string(),
                tmux_session_name: None,
                tmux_window_name: None,
                tmux_window_index: None,
                started_at: prepared.started_at,
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
        self.spawn_process_runner(run.guid.clone(), invocation);
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

fn build_continue_prompt(automation: &automation::Model, run: &automation_run::Model) -> String {
    format!(
        r#"# Continue Atmos Automation Run

Automation: {automation_name}
Automation ID: {automation_guid}
Run ID: {run_guid}
Run status: {status}
Working directory: {cwd}

Read the run context and continue from the result. Start by checking the final result, then inspect the event stream only if needed.

Artifacts:
- Original prompt: {prompt_path}
- Final result: {result_path}
- Run JSON: {run_json_path}

When continuing, preserve the original automation intent and explicitly mention any follow-up actions you take.
"#,
        automation_name = automation.display_name,
        automation_guid = automation.guid,
        run_guid = run.guid,
        status = run.status,
        cwd = run.cwd,
        prompt_path = run.prompt_path,
        result_path = run.result_path,
        run_json_path = run.run_json_path,
    )
}

fn short_run_id(run_guid: &str) -> String {
    run_guid.chars().take(8).collect()
}
