use infra::db::entities::review_agent_run;
use infra::db::repo::{ReviewRepo, WorkspaceRepo};

use crate::error::{Result, ServiceError};

use super::{ReviewAgentRunFinalizedDto, ReviewService};

impl ReviewService {
    pub async fn finalize_agent_run(
        &self,
        run_guid: String,
        _title: Option<String>,
    ) -> Result<ReviewAgentRunFinalizedDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let run = review_repo
            .find_agent_run_by_guid(&run_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run_guid))
            })?;
        if run.status == "succeeded" {
            let target_revision_guid = run.result_revision_guid.clone().ok_or_else(|| {
                ServiceError::Validation(format!(
                    "Review agent run {} is succeeded but has no result revision",
                    run.guid
                ))
            })?;
            let revision = review_repo
                .find_revision_by_guid(&target_revision_guid)
                .await
                .map_err(ServiceError::Infra)?
                .ok_or_else(|| {
                    ServiceError::NotFound(format!(
                        "Review revision {} not found",
                        target_revision_guid
                    ))
                })?;
            return Ok(ReviewAgentRunFinalizedDto { run, revision });
        }
        if run.status == "failed" {
            return Err(ServiceError::Validation(format!(
                "Review agent run {} has already failed",
                run.guid
            )));
        }
        if run.status == "pending" {
            self.mark_agent_run_running(run.guid.clone()).await?;
        }

        let finalize_result: Result<ReviewAgentRunFinalizedDto> = async {
            let session = review_repo
                .find_session_by_guid(&run.session_guid)
                .await
                .map_err(ServiceError::Infra)?
                .ok_or_else(|| {
                    ServiceError::NotFound(format!("Review session {} not found", run.session_guid))
                })?;
            let workspace_root = if let Some(ref ws_guid) = session.workspace_guid {
                let workspace = WorkspaceRepo::new(&self.db)
                    .find_by_guid(ws_guid)
                    .await?
                    .ok_or_else(|| {
                        ServiceError::NotFound(format!("Workspace {} not found", ws_guid))
                    })?;
                self.git_engine
                    .get_worktree_path(&workspace.name)
                    .map_err(ServiceError::Engine)?
            } else if !session.repo_path.is_empty() {
                std::path::PathBuf::from(&session.repo_path)
            } else {
                return Err(ServiceError::Processing(
                    "Review session has no repo_path and no workspace_guid".to_string(),
                ));
            };
            let base_revision = review_repo
                .find_revision_by_guid(&run.base_revision_guid)
                .await
                .map_err(ServiceError::Infra)?
                .ok_or_else(|| {
                    ServiceError::NotFound(format!(
                        "Review revision {} not found",
                        run.base_revision_guid
                    ))
                })?;
            let target_revision_guid = run.result_revision_guid.clone().ok_or_else(|| {
                ServiceError::Validation(format!(
                    "Review agent run {} has no target revision",
                    run.guid
                ))
            })?;
            let revision = review_repo
                .find_revision_by_guid(&target_revision_guid)
                .await
                .map_err(ServiceError::Infra)?
                .ok_or_else(|| {
                    ServiceError::NotFound(format!(
                        "Review revision {} not found",
                        target_revision_guid
                    ))
                })?;
            let change_time = chrono::Utc::now().naive_utc();

            if run.run_kind == "review" {
                return self
                    .finalize_review_agent_run(&review_repo, &run, revision, change_time)
                    .await;
            }

            self.finalize_fix_agent_run(
                &review_repo,
                &run,
                &session,
                &base_revision,
                revision,
                &workspace_root,
                change_time,
            )
            .await
        }
        .await;

        if let Err(error) = &finalize_result {
            if let Err(update_error) = review_repo
                .update_agent_run_status(
                    &run.guid,
                    "failed",
                    None,
                    None,
                    None,
                    None,
                    if run.started_at.is_none() {
                        Some(chrono::Utc::now().naive_utc())
                    } else {
                        None
                    },
                    Some(chrono::Utc::now().naive_utc()),
                    Some(error.to_string()),
                    true,
                )
                .await
            {
                tracing::warn!(
                    run_guid = %run.guid,
                    error = %update_error,
                    "Failed to mark review fix run failed after finalize error",
                );
            }
        }

        finalize_result
    }

    async fn finalize_review_agent_run(
        &self,
        review_repo: &ReviewRepo<'_>,
        run: &review_agent_run::Model,
        revision: infra::db::entities::review_revision::Model,
        change_time: chrono::NaiveDateTime,
    ) -> Result<ReviewAgentRunFinalizedDto> {
        review_repo
            .update_session_current_revision(&run.session_guid, &revision.guid)
            .await
            .map_err(ServiceError::Infra)?;
        review_repo
            .update_revision_title_and_source_kind(
                &revision.guid,
                Some("Review Checkpoint"),
                "agent_review",
            )
            .await
            .map_err(ServiceError::Infra)?;
        review_repo
            .update_agent_run_status(
                &run.guid,
                "succeeded",
                Some(revision.guid.clone()),
                Some(revision.storage_root_rel_path.clone()),
                None,
                None,
                if run.started_at.is_none() {
                    Some(change_time)
                } else {
                    None
                },
                Some(change_time),
                None,
                true,
            )
            .await
            .map_err(ServiceError::Infra)?;
        let updated_run = review_repo
            .find_agent_run_by_guid(&run.guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run.guid))
            })?;
        let updated_revision = review_repo
            .find_revision_by_guid(&revision.guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review revision {} not found", revision.guid))
            })?;
        Ok(ReviewAgentRunFinalizedDto {
            run: updated_run,
            revision: updated_revision,
        })
    }
}
