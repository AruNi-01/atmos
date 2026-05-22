use infra::db::entities::{review_comment, review_message, review_session};
use infra::db::repo::ReviewRepo;
use serde_json::{json, Value};

use crate::error::{Result, ServiceError};

use super::support::is_open_review_comment_status;
use super::{
    ReviewCommentDto, ReviewMessageDto, ReviewRevisionDto, ReviewService, ReviewSessionDto,
};

impl ReviewService {
    pub(super) async fn build_session_dto(
        &self,
        session: review_session::Model,
    ) -> Result<ReviewSessionDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let revisions = review_repo
            .list_revisions_by_session(&session.guid)
            .await
            .map_err(ServiceError::Infra)?;
        let comments = review_repo
            .list_comments_by_session(&session.guid)
            .await
            .map_err(ServiceError::Infra)?;
        let runs = review_repo
            .list_agent_runs_by_session(&session.guid)
            .await
            .map_err(ServiceError::Infra)?;
        let mut revision_dtos = Vec::with_capacity(revisions.len());

        for revision in revisions {
            let files = self.list_files_by_revision(revision.guid.clone()).await?;
            revision_dtos.push(ReviewRevisionDto {
                model: revision,
                files,
            });
        }
        let current_revision = revision_dtos
            .iter()
            .find(|revision| revision.model.guid == session.current_revision_guid);
        let reviewed_file_count = current_revision
            .map(|revision| {
                revision
                    .files
                    .iter()
                    .filter(|item| item.state.reviewed)
                    .count()
            })
            .unwrap_or(0);
        let reviewed_then_changed_count = current_revision
            .map(|revision| {
                revision
                    .files
                    .iter()
                    .filter(|item| item.changed_after_review)
                    .count()
            })
            .unwrap_or(0);

        Ok(ReviewSessionDto {
            open_comment_count: comments
                .iter()
                .filter(|comment| is_open_review_comment_status(&comment.status))
                .count(),
            reviewed_file_count,
            reviewed_then_changed_count,
            revisions: revision_dtos,
            runs,
            model: session,
        })
    }

    pub(super) async fn to_comment_dto(
        &self,
        comment: review_comment::Model,
        messages: Vec<review_message::Model>,
        _session_guid: Option<String>,
    ) -> Result<ReviewCommentDto> {
        let anchor =
            serde_json::from_str::<Value>(&comment.anchor_json).unwrap_or_else(|_| json!({}));
        let messages = messages
            .into_iter()
            .map(|message| {
                let body_full = if message.body_storage_kind == "inline" {
                    message.body.clone()
                } else if let Some(abs_path) = message.body_rel_path.as_ref() {
                    std::fs::read_to_string(abs_path).unwrap_or_else(|_| message.body.clone())
                } else {
                    message.body.clone()
                };
                ReviewMessageDto {
                    body_full,
                    model: message,
                }
            })
            .collect();
        Ok(ReviewCommentDto {
            anchor,
            messages,
            model: comment,
        })
    }
}
