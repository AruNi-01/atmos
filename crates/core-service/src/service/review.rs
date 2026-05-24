use std::collections::HashMap;
use std::sync::Arc;

use core_engine::GitEngine;
use infra::db::entities::review_file_state;
use infra::db::repo::ReviewRepo;
use sea_orm::DatabaseConnection;

use crate::error::{Result, ServiceError};

mod agent_run_finalize;
mod agent_runs;
mod comments;
mod dto;
mod prompts;
mod session;
mod support;
#[cfg(test)]
mod tests;
mod types;

use support::*;
pub use types::*;

pub struct ReviewService {
    db: Arc<DatabaseConnection>,
    git_engine: GitEngine,
}

#[derive(Debug)]
struct RepoContext {
    project_guid: String,
    workspace_guid: Option<String>,
    repo_path: std::path::PathBuf,
    base_ref: Option<String>,
    #[cfg_attr(not(test), allow(dead_code))]
    base_ref_origin: BaseRefOrigin,
}

#[derive(PartialEq, Debug)]
enum BaseRefOrigin {
    ProjectTargetBranch,
    DefaultBranchFallback,
    WorkspaceBaseBranch,
}

impl ReviewService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self {
            db,
            git_engine: GitEngine::new(),
        }
    }

    pub async fn list_sessions_by_workspace(
        &self,
        workspace_guid: String,
        include_archived: bool,
    ) -> Result<Vec<ReviewSessionDto>> {
        let repo = ReviewRepo::new(&self.db);
        let sessions = repo
            .list_sessions_by_workspace(&workspace_guid, include_archived)
            .await?;
        let mut items = Vec::with_capacity(sessions.len());
        for session in sessions {
            items.push(self.build_session_dto(session).await?);
        }
        Ok(items)
    }

    pub async fn list_sessions_by_project(
        &self,
        project_guid: String,
        include_archived: bool,
    ) -> Result<Vec<ReviewSessionDto>> {
        let repo = ReviewRepo::new(&self.db);
        let sessions = repo
            .list_sessions_by_project(&project_guid, include_archived)
            .await?;
        let mut items = Vec::with_capacity(sessions.len());
        for session in sessions {
            items.push(self.build_session_dto(session).await?);
        }
        Ok(items)
    }

    pub async fn get_session(&self, session_guid: String) -> Result<Option<ReviewSessionDto>> {
        let repo = ReviewRepo::new(&self.db);
        let Some(session) = repo.find_session_by_guid(&session_guid).await? else {
            return Ok(None);
        };
        Ok(Some(self.build_session_dto(session).await?))
    }

    pub async fn close_session(&self, session_guid: String) -> Result<()> {
        ReviewRepo::new(&self.db)
            .update_session_status(&session_guid, "closed")
            .await
            .map_err(ServiceError::Infra)
    }

    pub async fn archive_session(&self, session_guid: String) -> Result<()> {
        ReviewRepo::new(&self.db)
            .update_session_status(&session_guid, "archived")
            .await
            .map_err(ServiceError::Infra)
    }

    pub async fn activate_session(&self, session_guid: String) -> Result<()> {
        ReviewRepo::new(&self.db)
            .update_session_status(&session_guid, "active")
            .await
            .map_err(ServiceError::Infra)
    }

    pub async fn rename_session(&self, session_guid: String, title: String) -> Result<()> {
        ReviewRepo::new(&self.db)
            .update_session_title(&session_guid, &title)
            .await
            .map_err(ServiceError::Infra)
    }

    pub async fn list_files_by_revision(
        &self,
        revision_guid: String,
    ) -> Result<Vec<ReviewFileDto>> {
        let review_repo = ReviewRepo::new(&self.db);
        let snapshots = review_repo
            .list_file_snapshots_by_revision(&revision_guid)
            .await?;
        let states = review_repo
            .list_file_states_by_revision(&revision_guid)
            .await?;
        let state_by_snapshot: HashMap<String, review_file_state::Model> = states
            .into_iter()
            .map(|item| (item.file_snapshot_guid.clone(), item))
            .collect();
        let comments = review_repo
            .list_comments_by_revision(&revision_guid)
            .await?;
        let mut open_comment_count_by_snapshot: HashMap<String, usize> = HashMap::new();
        for comment in comments {
            if is_open_review_comment_status(&comment.status) {
                *open_comment_count_by_snapshot
                    .entry(comment.file_snapshot_guid.clone())
                    .or_default() += 1;
            }
        }

        snapshots
            .into_iter()
            .map(|snapshot| {
                let state = state_by_snapshot
                    .get(&snapshot.guid)
                    .cloned()
                    .ok_or_else(|| {
                        ServiceError::Processing(format!(
                            "Missing review_file_state for snapshot {}",
                            snapshot.guid
                        ))
                    })?;
                let changed_after_review = state
                    .reviewed_at
                    .zip(state.last_code_change_at)
                    .map(|(reviewed_at, changed_at)| changed_at > reviewed_at)
                    .unwrap_or(false);
                let (additions, deletions) = count_review_snapshot_changes(&snapshot);
                Ok(ReviewFileDto {
                    open_comment_count: *open_comment_count_by_snapshot
                        .get(&snapshot.guid)
                        .unwrap_or(&0),
                    snapshot,
                    state,
                    changed_after_review,
                    additions,
                    deletions,
                })
            })
            .collect()
    }

    pub async fn set_file_reviewed(&self, input: SetReviewFileReviewedInput) -> Result<()> {
        ReviewRepo::new(&self.db)
            .update_file_reviewed(&input.file_state_guid, input.reviewed, input.reviewed_by)
            .await
            .map_err(ServiceError::Infra)
    }

    pub async fn get_comment_context(
        &self,
        comment_guid: String,
    ) -> Result<ReviewCommentContextDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let comment = review_repo
            .find_comment_by_guid(&comment_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review comment {} not found", comment_guid))
            })?;
        let session = review_repo
            .find_session_by_guid(&comment.session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review session {} not found", comment.session_guid))
            })?;
        let revision = review_repo
            .find_revision_by_guid(&comment.revision_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!(
                    "Review revision {} not found",
                    comment.revision_guid
                ))
            })?;
        let file_snapshot = review_repo
            .find_file_snapshot_by_guid(&comment.file_snapshot_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!(
                    "Review file snapshot {} not found",
                    comment.file_snapshot_guid
                ))
            })?;
        let messages = review_repo
            .list_messages_by_comment_guids(std::slice::from_ref(&comment.guid))
            .await
            .map_err(ServiceError::Infra)?;
        let comment = self
            .to_comment_dto(comment, messages, Some(session.guid.clone()))
            .await?;
        Ok(ReviewCommentContextDto {
            old_file_abs_path: file_snapshot.old_rel_path.clone(),
            new_file_abs_path: file_snapshot.new_rel_path.clone(),
            workspace_root: "".to_string(), // No longer needed as paths are absolute
            session,
            revision,
            file_snapshot,
            comment,
        })
    }

    pub async fn get_file_content(
        &self,
        file_snapshot_guid: String,
    ) -> Result<ReviewFileContentDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let file_snapshot = review_repo
            .find_file_snapshot_by_guid(&file_snapshot_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!(
                    "Review file snapshot {} not found",
                    file_snapshot_guid
                ))
            })?;
        let old_content = std::fs::read_to_string(&file_snapshot.old_rel_path)
            .map_err(|error| ServiceError::Infra(infra::InfraError::Io(error)))?;
        let new_content = std::fs::read_to_string(&file_snapshot.new_rel_path)
            .map_err(|error| ServiceError::Infra(infra::InfraError::Io(error)))?;

        Ok(ReviewFileContentDto {
            file_snapshot,
            old_content,
            new_content,
        })
    }
}
