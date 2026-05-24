mod finalize_fix;
mod revision;

use std::collections::HashSet;

use infra::db::entities::review_agent_run;
use infra::db::repo::ReviewRepo;
use infra::utils::review_artifacts::{run_root_abs_path, write_text_atomic};

use crate::error::{Result, ServiceError};

use super::{is_open_review_comment_status, ReviewService};
use super::{
    CreateReviewAgentRunInput, ReviewAgentRunCreatedDto, ReviewAgentRunStatusDto, ReviewCommentDto,
    ReviewRunArtifactDto, SetReviewAgentRunStatusInput,
};

const VALID_RUN_KINDS: &[&str] = &["review", "fix"];
const VALID_EXECUTION_MODES: &[&str] = &["copy_prompt", "agent_chat", "terminal_cli"];

impl ReviewService {
    pub async fn set_agent_run_status(
        &self,
        input: SetReviewAgentRunStatusInput,
    ) -> Result<ReviewAgentRunStatusDto> {
        match input.status.as_str() {
            "running" => self
                .mark_agent_run_running(input.run_guid)
                .await
                .map(|run| ReviewAgentRunStatusDto::Run { run }),
            "succeeded" => {
                self.mark_agent_run_running(input.run_guid.clone()).await?;
                if let Some(summary) = input.summary.filter(|value| !value.trim().is_empty()) {
                    self.write_run_summary(input.run_guid.clone(), summary)
                        .await?;
                }
                self.finalize_agent_run(input.run_guid, input.title)
                    .await
                    .map(ReviewAgentRunStatusDto::Finalized)
            }
            "failed" => self
                .mark_agent_run_failed(input.run_guid, input.message)
                .await
                .map(|run| ReviewAgentRunStatusDto::Run { run }),
            status => Err(ServiceError::Validation(format!(
                "Invalid review agent run status: {}",
                status
            ))),
        }
    }

    pub async fn mark_agent_run_running(
        &self,
        run_guid: String,
    ) -> Result<review_agent_run::Model> {
        let review_repo = ReviewRepo::new(&self.db);
        let run = review_repo
            .find_agent_run_by_guid(&run_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run_guid))
            })?;
        if run.status == "succeeded" || run.status == "failed" {
            return Ok(run);
        }
        let has_other_running_run = review_repo
            .list_agent_runs_by_session(&run.session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .into_iter()
            .any(|item| item.guid != run.guid && item.status == "running");
        if has_other_running_run {
            return Err(ServiceError::Validation(
                "A review agent run is already running for this session".to_string(),
            ));
        }
        review_repo
            .update_agent_run_status(
                &run.guid,
                "running",
                None,
                None,
                None,
                None,
                if run.started_at.is_none() {
                    Some(chrono::Utc::now().naive_utc())
                } else {
                    None
                },
                None,
                None,
                false,
            )
            .await
            .map_err(ServiceError::Infra)?;
        review_repo
            .find_agent_run_by_guid(&run.guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run.guid))
            })
    }

    pub async fn mark_agent_run_failed(
        &self,
        run_guid: String,
        message: Option<String>,
    ) -> Result<review_agent_run::Model> {
        let review_repo = ReviewRepo::new(&self.db);
        let run = review_repo
            .find_agent_run_by_guid(&run_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run_guid))
            })?;
        if run.status == "succeeded" || run.status == "failed" {
            return Ok(run);
        }
        let now = chrono::Utc::now().naive_utc();
        review_repo
            .update_agent_run_status(
                &run.guid,
                "failed",
                None,
                None,
                None,
                None,
                if run.started_at.is_none() {
                    Some(now)
                } else {
                    None
                },
                Some(now),
                Some(
                    message
                        .filter(|value| !value.trim().is_empty())
                        .unwrap_or_else(|| "Review agent run failed".to_string()),
                ),
                false,
            )
            .await
            .map_err(ServiceError::Infra)?;
        review_repo
            .find_agent_run_by_guid(&run.guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run.guid))
            })
    }

    pub async fn create_agent_run(
        &self,
        input: CreateReviewAgentRunInput,
    ) -> Result<ReviewAgentRunCreatedDto> {
        if !VALID_RUN_KINDS.contains(&input.run_kind.as_str()) {
            return Err(ServiceError::Validation(format!(
                "Invalid run_kind: {}. Must be one of: {:?}",
                input.run_kind, VALID_RUN_KINDS
            )));
        }

        if !VALID_EXECUTION_MODES.contains(&input.execution_mode.as_str()) {
            return Err(ServiceError::Validation(format!(
                "Invalid execution_mode: {}. Must be one of: {:?}",
                input.execution_mode, VALID_EXECUTION_MODES
            )));
        }
        if input.run_kind == "review"
            && input
                .skill_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_none()
        {
            return Err(ServiceError::Validation(
                "Review agent runs require skill_id".to_string(),
            ));
        }

        let review_repo = ReviewRepo::new(&self.db);
        let session = review_repo
            .find_session_by_guid(&input.session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review session {} not found", input.session_guid))
            })?;
        if input.execution_mode != "copy_prompt" {
            let has_running_run = review_repo
                .list_agent_runs_by_session(&session.guid)
                .await
                .map_err(ServiceError::Infra)?
                .into_iter()
                .any(|run| run.status == "running");
            if has_running_run {
                return Err(ServiceError::Validation(
                    "A review agent run is already running for this session".to_string(),
                ));
            }
        }
        let base_revision = review_repo
            .find_revision_by_guid(&input.base_revision_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!(
                    "Review revision {} not found",
                    input.base_revision_guid
                ))
            })?;
        let base_comments = self
            .list_comments(session.guid.clone(), Some(input.base_revision_guid.clone()))
            .await?;
        let selected_set: HashSet<String> = input.selected_comment_guids.into_iter().collect();
        let selected_base_comment_guids: HashSet<String> = base_comments
            .iter()
            .filter_map(|comment| {
                if !selected_set.is_empty() {
                    selected_set
                        .contains(&comment.model.guid)
                        .then(|| comment.model.guid.clone())
                } else if is_open_review_comment_status(&comment.model.status) {
                    Some(comment.model.guid.clone())
                } else {
                    None
                }
            })
            .collect();

        if input.run_kind == "fix" && selected_base_comment_guids.is_empty() {
            return Err(ServiceError::Validation(
                "No review comments selected for fix run".to_string(),
            ));
        }

        let run = review_repo
            .create_agent_run(
                session.guid.clone(),
                input.base_revision_guid.clone(),
                input.run_kind.clone(),
                input.execution_mode.clone(),
                input.skill_id.clone(),
                None,
                input.created_by.clone(),
            )
            .await
            .map_err(ServiceError::Infra)?;
        let revision = self
            .create_agent_run_revision(&review_repo, &session, &base_revision, &run)
            .await?;
        let mut session_for_prompt = session.clone();
        session_for_prompt.current_revision_guid = revision.model.guid.clone();
        let run = review_repo
            .find_agent_run_by_guid(&run.guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run.guid))
            })?;

        let prompt = match input.run_kind.as_str() {
            "review" => self.render_review_prompt(
                &session_for_prompt,
                &run,
                &base_revision,
                &base_comments,
            )?,
            "fix" => {
                let selected_comments: Vec<ReviewCommentDto> = self
                    .list_comments(session.guid.clone(), Some(revision.model.guid.clone()))
                    .await?
                    .into_iter()
                    .filter(|comment| {
                        comment
                            .model
                            .parent_comment_guid
                            .as_ref()
                            .map(|parent_guid| selected_base_comment_guids.contains(parent_guid))
                            .unwrap_or_else(|| {
                                selected_base_comment_guids.contains(&comment.model.guid)
                            })
                    })
                    .collect();
                self.render_fix_prompt(&session_for_prompt, &run, &selected_comments)?
            }
            _ => {
                return Err(ServiceError::Validation(format!(
                    "Invalid run_kind: {}",
                    input.run_kind
                )));
            }
        };
        let prompt_abs_path = run_root_abs_path(&session.guid, &run.guid)
            .map_err(ServiceError::Infra)?
            .join("prompt.md");
        write_text_atomic(&prompt_abs_path, &prompt)
            .await
            .map_err(ServiceError::Infra)?;
        review_repo
            .update_agent_run_prompt_rel_path(
                &run.guid,
                &prompt_abs_path.to_string_lossy().to_string(),
            )
            .await
            .map_err(ServiceError::Infra)?;
        if input.execution_mode != "copy_prompt" {
            review_repo
                .update_agent_run_status(
                    &run.guid,
                    "running",
                    None,
                    None,
                    None,
                    None,
                    Some(chrono::Utc::now().naive_utc()),
                    None,
                    None,
                    false,
                )
                .await
                .map_err(ServiceError::Infra)?;
        }

        let updated_run = review_repo
            .find_agent_run_by_guid(&run.guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run.guid))
            })?;

        Ok(ReviewAgentRunCreatedDto {
            run: updated_run,
            revision,
            prompt,
        })
    }

    pub async fn list_agent_runs(
        &self,
        session_guid: String,
    ) -> Result<Vec<review_agent_run::Model>> {
        ReviewRepo::new(&self.db)
            .list_agent_runs_by_session(&session_guid)
            .await
            .map_err(ServiceError::Infra)
    }

    pub async fn get_run_artifact(
        &self,
        run_guid: String,
        kind: String,
    ) -> Result<ReviewRunArtifactDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let run = review_repo
            .find_agent_run_by_guid(&run_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run_guid))
            })?;
        let abs_path = match kind.as_str() {
            "prompt" => run.prompt_rel_path.clone(),
            "patch" => run.patch_rel_path.clone(),
            "summary" => run.summary_rel_path.clone(),
            _ => {
                return Err(ServiceError::Validation(format!(
                    "Unsupported review run artifact kind: {}",
                    kind
                )));
            }
        }
        .ok_or_else(|| {
            ServiceError::NotFound(format!(
                "Review agent run {} has no {} artifact",
                run.guid, kind
            ))
        })?;
        let content = std::fs::read_to_string(&abs_path)
            .map_err(|error| ServiceError::Infra(infra::InfraError::Io(error)))?;

        Ok(ReviewRunArtifactDto { run, kind, content })
    }

    pub async fn write_run_summary(
        &self,
        run_guid: String,
        body: String,
    ) -> Result<review_agent_run::Model> {
        let review_repo = ReviewRepo::new(&self.db);
        let run = review_repo
            .find_agent_run_by_guid(&run_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run_guid))
            })?;
        let summary_abs_path = run_root_abs_path(&run.session_guid, &run.guid)
            .map_err(ServiceError::Infra)?
            .join("summary.md");
        write_text_atomic(&summary_abs_path, &body)
            .await
            .map_err(ServiceError::Infra)?;
        if run.status == "pending" {
            self.mark_agent_run_running(run.guid.clone()).await?;
        }
        review_repo
            .update_agent_run_summary_path(
                &run.guid,
                summary_abs_path.to_string_lossy().to_string(),
                if run.started_at.is_none() {
                    Some(chrono::Utc::now().naive_utc())
                } else {
                    None
                },
                None,
            )
            .await
            .map_err(ServiceError::Infra)?;
        review_repo
            .find_agent_run_by_guid(&run.guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run.guid))
            })
    }
}
