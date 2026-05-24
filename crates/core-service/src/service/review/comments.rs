use std::collections::HashMap;
use std::path::Path;

use infra::db::entities::{review_comment, review_message};
use infra::db::repo::ReviewRepo;
use infra::utils::review_artifacts::{run_root_abs_path, write_text_atomic};
use serde_json::json;
use uuid::Uuid;

use crate::error::{Result, ServiceError};

use super::support::{
    is_valid_review_comment_status, normalize_review_file_path, review_message_visible_in_revision,
    MESSAGE_INLINE_LIMIT,
};
use super::{
    AddReviewMessageInput, CreateReviewCommentByFilePathInput, CreateReviewCommentInput,
    DeleteReviewMessageInput, ReviewCommentDto, ReviewMessageDto, ReviewService,
    UpdateReviewCommentStatusInput, UpdateReviewMessageInput,
};

impl ReviewService {
    pub async fn list_comments(
        &self,
        session_guid: String,
        revision_guid: Option<String>,
    ) -> Result<Vec<ReviewCommentDto>> {
        let review_repo = ReviewRepo::new(&self.db);
        let target_revision_guid = revision_guid.clone();
        let comments = if let Some(revision_guid) = revision_guid.as_deref() {
            review_repo.list_comments_by_revision(revision_guid).await?
        } else {
            review_repo.list_comments_by_session(&session_guid).await?
        };
        let agent_runs = if target_revision_guid.is_some() {
            review_repo
                .list_agent_runs_by_session(&session_guid)
                .await
                .map_err(ServiceError::Infra)?
        } else {
            Vec::new()
        };
        let comment_guids: Vec<String> = comments.iter().map(|item| item.guid.clone()).collect();
        let messages = review_repo
            .list_messages_by_comment_guids(&comment_guids)
            .await?;
        let mut messages_by_comment: HashMap<String, Vec<review_message::Model>> = HashMap::new();
        for message in messages {
            messages_by_comment
                .entry(message.comment_guid.clone())
                .or_default()
                .push(message);
        }

        let parent_guids: Vec<String> = comments
            .iter()
            .filter_map(|t| t.parent_comment_guid.clone())
            .collect();
        let mut ancestor_comment_cache: HashMap<String, review_comment::Model> = HashMap::new();
        for parent_guid in &parent_guids {
            Self::resolve_ancestor_comments(
                parent_guid.clone(),
                &review_repo,
                &mut ancestor_comment_cache,
            )
            .await?;
        }
        let all_ancestor_guids: Vec<String> = ancestor_comment_cache.keys().cloned().collect();
        let mut ancestor_messages: HashMap<String, Vec<review_message::Model>> = HashMap::new();
        if !all_ancestor_guids.is_empty() {
            let ancestor_msgs = review_repo
                .list_messages_by_comment_guids(&all_ancestor_guids)
                .await?;
            for msg in ancestor_msgs {
                ancestor_messages
                    .entry(msg.comment_guid.clone())
                    .or_default()
                    .push(msg);
            }
        }

        let mut items = Vec::with_capacity(comments.len());
        for comment in comments {
            let comment_guid = comment.guid.clone();
            let mut comment_messages = messages_by_comment
                .remove(&comment_guid)
                .unwrap_or_default();
            if let Some(target_revision) = target_revision_guid.as_deref() {
                comment_messages.retain(|message| {
                    review_message_visible_in_revision(
                        message,
                        &comment.revision_guid,
                        target_revision,
                        &agent_runs,
                    )
                });
            }
            if let Some(ref parent_guid) = comment.parent_comment_guid {
                let mut chain_guids = vec![parent_guid.clone()];
                let mut cursor = parent_guid.clone();
                loop {
                    if let Some(ancestor) = ancestor_comment_cache.get(&cursor) {
                        if let Some(ref pg) = ancestor.parent_comment_guid {
                            if !chain_guids.contains(pg) {
                                chain_guids.push(pg.clone());
                                cursor = pg.clone();
                                continue;
                            }
                        }
                    }
                    break;
                }
                for guid in &chain_guids {
                    if let Some(ancestor_msgs) = ancestor_messages.get(guid).cloned() {
                        let ancestor_revision_guid = ancestor_comment_cache
                            .get(guid)
                            .map(|ancestor| ancestor.revision_guid.as_str())
                            .unwrap_or(comment.revision_guid.as_str());
                        if let Some(target_revision) = target_revision_guid.as_deref() {
                            comment_messages.extend(ancestor_msgs.into_iter().filter(|message| {
                                review_message_visible_in_revision(
                                    message,
                                    ancestor_revision_guid,
                                    target_revision,
                                    &agent_runs,
                                )
                            }));
                        } else {
                            comment_messages.extend(ancestor_msgs);
                        }
                    }
                }
            }
            comment_messages.sort_by_key(|message| message.created_at);
            items.push(
                self.to_comment_dto(comment, comment_messages, Some(session_guid.clone()))
                    .await?,
            );
        }
        Ok(items)
    }

    async fn resolve_ancestor_comments(
        parent_guid: String,
        repo: &ReviewRepo<'_>,
        cache: &mut HashMap<String, review_comment::Model>,
    ) -> Result<()> {
        if cache.contains_key(&parent_guid) {
            return Ok(());
        }
        if let Some(comment) = repo
            .find_comment_by_guid(&parent_guid)
            .await
            .map_err(ServiceError::Infra)?
        {
            if let Some(ref pg) = comment.parent_comment_guid {
                Box::pin(Self::resolve_ancestor_comments(pg.clone(), repo, cache)).await?;
            }
            cache.insert(parent_guid, comment);
        }
        Ok(())
    }

    pub async fn create_comment_by_file_path(
        &self,
        input: CreateReviewCommentByFilePathInput,
    ) -> Result<ReviewCommentDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let session = review_repo
            .find_session_by_guid(&input.session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review session {} not found", input.session_guid))
            })?;
        if input.revision_guid != session.current_revision_guid {
            return Err(ServiceError::Validation(format!(
                "Cannot create comment on sealed revision {} (current is {})",
                input.revision_guid, session.current_revision_guid
            )));
        }
        if input.side != "new" && input.side != "old" {
            return Err(ServiceError::Validation(
                "Review comment side must be either 'new' or 'old'".to_string(),
            ));
        }
        if input.start_line <= 0 || input.end_line < input.start_line {
            return Err(ServiceError::Validation(
                "Review comment line range must be positive and end_line must be >= start_line"
                    .to_string(),
            ));
        }

        let file_snapshots = review_repo
            .list_file_snapshots_by_revision(&input.revision_guid)
            .await
            .map_err(ServiceError::Infra)?;
        let requested_path = if let Ok(path) =
            Path::new(&input.file_path).strip_prefix(Path::new(&session.repo_path))
        {
            normalize_review_file_path(&path.to_string_lossy())
        } else {
            normalize_review_file_path(&input.file_path)
        };
        let file_snapshot = file_snapshots
            .into_iter()
            .find(|fs| normalize_review_file_path(&fs.file_path) == requested_path)
            .ok_or_else(|| {
                ServiceError::NotFound(format!(
                    "File snapshot not found for path '{}' in revision {}",
                    input.file_path, input.revision_guid
                ))
            })?;

        let comment = review_repo
            .create_comment(
                input.session_guid,
                input.revision_guid,
                file_snapshot.guid.clone(),
                input.side.clone(),
                input.start_line,
                input.end_line,
                "line".to_string(),
                serde_json::to_string(&json!({
                    "side": input.side,
                    "start_line": input.start_line,
                    "end_line": input.end_line,
                    "line_range_kind": "line"
                }))
                .map_err(|error| ServiceError::Processing(error.to_string()))?,
                "open".to_string(),
                None,
                input.title,
                Some(input.author_type.clone()),
            )
            .await
            .map_err(ServiceError::Infra)?;
        let message = self
            .create_message(AddReviewMessageInput {
                comment_guid: comment.guid.clone(),
                author_type: input.author_type,
                kind: "comment".to_string(),
                body: input.body,
                agent_run_guid: input.agent_run_guid,
            })
            .await?;
        Ok(ReviewCommentDto {
            anchor: serde_json::to_value(&json!({
                "file_path": file_snapshot.file_path,
                "side": input.side,
                "start_line": input.start_line,
                "end_line": input.end_line,
                "line_range_kind": "line"
            }))
            .map_err(|error| ServiceError::Processing(error.to_string()))?,
            messages: vec![message],
            model: comment,
        })
    }

    pub async fn create_comment(
        &self,
        input: CreateReviewCommentInput,
    ) -> Result<ReviewCommentDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let session = review_repo
            .find_session_by_guid(&input.session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review session {} not found", input.session_guid))
            })?;
        if input.revision_guid != session.current_revision_guid {
            return Err(ServiceError::Validation(format!(
                "Cannot create comment on sealed revision {} (current is {})",
                input.revision_guid, session.current_revision_guid
            )));
        }
        let comment = review_repo
            .create_comment(
                input.session_guid,
                input.revision_guid,
                input.file_snapshot_guid,
                input.anchor.side.clone(),
                input.anchor.start_line,
                input.anchor.end_line,
                input.anchor.line_range_kind.clone(),
                serde_json::to_string(&input.anchor)
                    .map_err(|error| ServiceError::Processing(error.to_string()))?,
                "open".to_string(),
                input.parent_comment_guid,
                input.title,
                input.created_by,
            )
            .await
            .map_err(ServiceError::Infra)?;
        let message = self
            .create_message(AddReviewMessageInput {
                comment_guid: comment.guid.clone(),
                author_type: "user".to_string(),
                kind: "comment".to_string(),
                body: input.body,
                agent_run_guid: None,
            })
            .await?;
        Ok(ReviewCommentDto {
            anchor: serde_json::to_value(&input.anchor)
                .map_err(|error| ServiceError::Processing(error.to_string()))?,
            messages: vec![message],
            model: comment,
        })
    }

    pub async fn create_message(&self, input: AddReviewMessageInput) -> Result<ReviewMessageDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let comment = review_repo
            .find_comment_by_guid(&input.comment_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review comment {} not found", input.comment_guid))
            })?;
        let session = review_repo
            .find_session_by_guid(&comment.session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review session {} not found", comment.session_guid))
            })?;
        if comment.revision_guid != session.current_revision_guid {
            return Err(ServiceError::Validation(format!(
                "Cannot add message to comment on sealed revision {} (current is {})",
                comment.revision_guid, session.current_revision_guid
            )));
        }
        let effective_agent_run_guid =
            if input.agent_run_guid.is_none() && input.author_type != "user" {
                let active_runs = review_repo
                    .list_agent_runs_by_session(&comment.session_guid)
                    .await
                    .map_err(ServiceError::Infra)?
                    .into_iter()
                    .filter(|run| {
                        let matches_revision = run.base_revision_guid == comment.revision_guid
                            || run.result_revision_guid.as_deref() == Some(&comment.revision_guid);
                        matches_revision && (run.status == "pending" || run.status == "running")
                    })
                    .collect::<Vec<_>>();
                if active_runs.len() == 1 {
                    Some(active_runs[0].guid.clone())
                } else {
                    None
                }
            } else {
                input.agent_run_guid.clone()
            };

        if let Some(run_guid) = effective_agent_run_guid.as_deref() {
            if let Some(run) = review_repo
                .find_agent_run_by_guid(run_guid)
                .await
                .map_err(ServiceError::Infra)?
            {
                if run.status == "pending" {
                    self.mark_agent_run_running(run.guid.clone()).await?;
                }
            }
        }
        let (body_storage_kind, body, body_rel_path, body_full) =
            if input.body.len() > MESSAGE_INLINE_LIMIT {
                let abs_path = run_root_abs_path(
                    &comment.session_guid,
                    effective_agent_run_guid.as_deref().unwrap_or("message"),
                )
                .map_err(ServiceError::Infra)?
                .join("messages")
                .join(format!("{}.md", Uuid::new_v4()));
                write_text_atomic(&abs_path, &input.body)
                    .await
                    .map_err(ServiceError::Infra)?;
                (
                    "file".to_string(),
                    input.body.chars().take(500).collect(),
                    Some(abs_path.to_string_lossy().to_string()),
                    input.body,
                )
            } else {
                ("inline".to_string(), input.body.clone(), None, input.body)
            };

        let message = review_repo
            .create_message(
                input.comment_guid,
                input.author_type,
                input.kind,
                body_storage_kind,
                body,
                body_rel_path,
                effective_agent_run_guid,
            )
            .await
            .map_err(ServiceError::Infra)?;

        Ok(ReviewMessageDto {
            body_full,
            model: message,
        })
    }

    pub async fn update_message(
        &self,
        input: UpdateReviewMessageInput,
    ) -> Result<ReviewMessageDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let message = review_repo
            .find_message_by_guid(&input.message_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review message {} not found", input.message_guid,))
            })?;
        let comment = review_repo
            .find_comment_by_guid(&message.comment_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review comment {} not found", message.comment_guid))
            })?;

        let (body_storage_kind, body, body_rel_path, body_full) =
            if input.body.len() > MESSAGE_INLINE_LIMIT {
                let abs_path = run_root_abs_path(
                    &comment.session_guid,
                    message.agent_run_guid.as_deref().unwrap_or("message"),
                )
                .map_err(ServiceError::Infra)?
                .join("messages")
                .join(format!("{}.md", Uuid::new_v4()));
                write_text_atomic(&abs_path, &input.body)
                    .await
                    .map_err(ServiceError::Infra)?;
                (
                    "file".to_string(),
                    input.body.chars().take(500).collect(),
                    Some(abs_path.to_string_lossy().to_string()),
                    input.body,
                )
            } else {
                ("inline".to_string(), input.body.clone(), None, input.body)
            };

        let message = review_repo
            .update_message_body(&message.guid, body_storage_kind, body, body_rel_path)
            .await
            .map_err(ServiceError::Infra)?;
        review_repo
            .touch_comment(&message.comment_guid)
            .await
            .map_err(ServiceError::Infra)?;

        Ok(ReviewMessageDto {
            body_full,
            model: message,
        })
    }

    pub async fn delete_message(&self, input: DeleteReviewMessageInput) -> Result<String> {
        let review_repo = ReviewRepo::new(&self.db);
        let message = review_repo
            .find_message_by_guid(&input.message_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review message {} not found", input.message_guid,))
            })?;

        let mut messages = review_repo
            .list_messages_by_comment_guids(&[message.comment_guid.clone()])
            .await
            .map_err(ServiceError::Infra)?;
        messages.sort_by_key(|item| item.created_at);

        review_repo
            .soft_delete_message(&message.guid)
            .await
            .map_err(ServiceError::Infra)?;

        let comment = review_repo
            .find_comment_by_guid(&message.comment_guid)
            .await
            .map_err(ServiceError::Infra)?;

        let should_delete_comment = messages.len() == 1
            && comment
                .as_ref()
                .map_or(true, |c| c.parent_comment_guid.is_none());

        if should_delete_comment {
            review_repo
                .soft_delete_comment(&message.comment_guid)
                .await
                .map_err(ServiceError::Infra)?;
        } else {
            review_repo
                .touch_comment(&message.comment_guid)
                .await
                .map_err(ServiceError::Infra)?;
        }

        Ok(message.comment_guid)
    }

    pub async fn update_comment_status(&self, input: UpdateReviewCommentStatusInput) -> Result<()> {
        if !is_valid_review_comment_status(&input.status) {
            return Err(ServiceError::Validation(format!(
                "Invalid review comment status: {}",
                input.status
            )));
        }
        let review_repo = ReviewRepo::new(&self.db);
        let comment = review_repo
            .find_comment_by_guid(&input.comment_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review comment {} not found", input.comment_guid))
            })?;
        let session = review_repo
            .find_session_by_guid(&comment.session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review session {} not found", comment.session_guid))
            })?;
        if comment.revision_guid != session.current_revision_guid {
            return Err(ServiceError::Validation(format!(
                "Cannot update comment on sealed revision {} (current is {})",
                comment.revision_guid, session.current_revision_guid
            )));
        }
        review_repo
            .update_comment_status(&input.comment_guid, &input.status)
            .await
            .map_err(ServiceError::Infra)
    }
}
