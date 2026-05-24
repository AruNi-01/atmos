use super::*;
use core_service::service::review::{
    AddReviewMessageInput, CreateReviewAgentRunInput, CreateReviewCommentInput,
    CreateReviewSessionInput, DeleteReviewMessageInput, ReviewAnchor, ReviewTarget,
    SetReviewAgentRunStatusInput, SetReviewFileReviewedInput, UpdateReviewCommentStatusInput,
    UpdateReviewMessageInput,
};

impl WsMessageService {
    async fn send_review_notification(&self, event: WsEvent, data: Value) {
        if let Some(manager) = self.ws_manager.get() {
            let message = WsMessage::notification(event, data);
            let _ = manager.broadcast(&message).await;
        }
    }

    fn parse_target(
        workspace_guid: Option<String>,
        project_guid: Option<String>,
    ) -> Result<ReviewTarget> {
        // Normalize inputs: trim whitespace and treat empty strings as None
        let workspace_guid = workspace_guid.and_then(|s| {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });
        let project_guid = project_guid.and_then(|s| {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });

        match (workspace_guid, project_guid) {
            (Some(w), None) => Ok(ReviewTarget::Workspace { workspace_guid: w }),
            (None, Some(p)) => Ok(ReviewTarget::Project { project_guid: p }),
            (Some(_), Some(_)) => Err(ServiceError::Validation(
                "Specify exactly one of workspace_guid or project_guid".to_string(),
            )),
            (None, None) => Err(ServiceError::Validation(
                "workspace_guid or project_guid is required".to_string(),
            )),
        }
    }

    pub(super) async fn handle_review_session_list(
        &self,
        req: ReviewSessionListRequest,
    ) -> Result<Value> {
        let target = Self::parse_target(req.workspace_guid, req.project_guid)?;
        let sessions = match target {
            ReviewTarget::Workspace { workspace_guid } => {
                self.review_service
                    .list_sessions_by_workspace(workspace_guid, req.include_archived)
                    .await?
            }
            ReviewTarget::Project { project_guid } => {
                self.review_service
                    .list_sessions_by_project(project_guid, req.include_archived)
                    .await?
            }
        };
        Ok(json!(sessions))
    }

    pub(super) async fn handle_review_session_get(
        &self,
        req: ReviewSessionGetRequest,
    ) -> Result<Value> {
        let session = self.review_service.get_session(req.session_guid).await?;
        Ok(json!(session))
    }

    pub(super) async fn handle_review_session_create(
        &self,
        req: ReviewSessionCreateRequest,
    ) -> Result<Value> {
        let target = Self::parse_target(req.workspace_guid, req.project_guid)?;
        let session = self
            .review_service
            .create_session(CreateReviewSessionInput {
                target,
                title: req.title,
                created_by: req.created_by,
            })
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "kind": "session_created",
                "session_guid": session.model.guid,
                "workspace_guid": session.model.workspace_guid,
                "changed_fields": ["status", "current_revision_guid", "updated_at"],
            }),
        )
        .await;
        Ok(json!(session))
    }

    pub(super) async fn handle_review_session_close(
        &self,
        req: ReviewSessionCloseRequest,
    ) -> Result<Value> {
        self.review_service
            .close_session(req.session_guid.clone())
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "kind": "session_closed",
                "session_guid": req.session_guid,
                "changed_fields": ["status", "updated_at"],
            }),
        )
        .await;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_review_session_archive(
        &self,
        req: ReviewSessionArchiveRequest,
    ) -> Result<Value> {
        self.review_service
            .archive_session(req.session_guid.clone())
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "kind": "session_archived",
                "session_guid": req.session_guid,
                "changed_fields": ["status", "updated_at"],
            }),
        )
        .await;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_review_session_activate(
        &self,
        req: ReviewSessionActivateRequest,
    ) -> Result<Value> {
        self.review_service
            .activate_session(req.session_guid.clone())
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "kind": "session_activated",
                "session_guid": req.session_guid,
                "changed_fields": ["status", "closed_at", "archived_at", "updated_at"],
            }),
        )
        .await;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_review_session_rename(
        &self,
        req: ReviewSessionRenameRequest,
    ) -> Result<Value> {
        self.review_service
            .rename_session(req.session_guid.clone(), req.title.clone())
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "kind": "session_renamed",
                "session_guid": req.session_guid,
                "changed_fields": ["title", "updated_at"],
            }),
        )
        .await;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_review_file_list(
        &self,
        req: ReviewFileListRequest,
    ) -> Result<Value> {
        let files = self
            .review_service
            .list_files_by_revision(req.revision_guid)
            .await?;
        Ok(json!(files))
    }

    pub(super) async fn handle_review_file_content_get(
        &self,
        req: ReviewFileContentGetRequest,
    ) -> Result<Value> {
        let content = self
            .review_service
            .get_file_content(req.file_snapshot_guid)
            .await?;
        Ok(json!(content))
    }

    pub(super) async fn handle_review_file_set_reviewed(
        &self,
        req: ReviewFileSetReviewedRequest,
    ) -> Result<Value> {
        self.review_service
            .set_file_reviewed(SetReviewFileReviewedInput {
                file_state_guid: req.file_state_guid.clone(),
                reviewed: req.reviewed,
                reviewed_by: req.reviewed_by,
            })
            .await?;
        self.send_review_notification(
            WsEvent::ReviewFileUpdated,
            json!({
                "file_state_guid": req.file_state_guid,
                "changed_fields": ["reviewed", "reviewed_at", "reviewed_by", "updated_at"],
            }),
        )
        .await;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_review_comment_list(
        &self,
        req: ReviewCommentListRequest,
    ) -> Result<Value> {
        let comments = self
            .review_service
            .list_comments(req.session_guid, req.revision_guid)
            .await?;
        Ok(json!(comments))
    }

    pub(super) async fn handle_review_comment_create(
        &self,
        req: ReviewCommentCreateRequest,
    ) -> Result<Value> {
        let anchor: ReviewAnchor = serde_json::from_value(req.anchor).map_err(|error| {
            ServiceError::Validation(format!("Invalid review comment anchor: {}", error))
        })?;
        let comment = self
            .review_service
            .create_comment(CreateReviewCommentInput {
                session_guid: req.session_guid,
                revision_guid: req.revision_guid,
                file_snapshot_guid: req.file_snapshot_guid,
                anchor,
                body: req.body,
                title: req.title,
                created_by: req.created_by,
                parent_comment_guid: req.parent_comment_guid,
            })
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "comment_guid": comment.model.guid,
                "session_guid": comment.model.session_guid,
                "revision_guid": comment.model.revision_guid,
                "changed_fields": ["status", "updated_at", "created_at"],
                "comment": comment,
            }),
        )
        .await;
        Ok(json!(comment))
    }

    pub(super) async fn handle_review_comment_update_status(
        &self,
        req: ReviewCommentUpdateStatusRequest,
    ) -> Result<Value> {
        self.review_service
            .update_comment_status(UpdateReviewCommentStatusInput {
                comment_guid: req.comment_guid.clone(),
                status: req.status.clone(),
            })
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "comment_guid": req.comment_guid,
                "changed_fields": ["status", "updated_at"],
                "status": req.status,
            }),
        )
        .await;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_review_message_add(
        &self,
        req: ReviewMessageAddRequest,
    ) -> Result<Value> {
        let message = self
            .review_service
            .create_message(AddReviewMessageInput {
                comment_guid: req.comment_guid,
                author_type: req.author_type,
                kind: req.kind,
                body: req.body,
                agent_run_guid: req.agent_run_guid,
            })
            .await?;
        self.send_review_notification(
            WsEvent::ReviewMessageCreated,
            json!({
                "comment_guid": message.model.comment_guid,
                "message_guid": message.model.guid,
                "changed_fields": ["created_at"],
                "message": message,
            }),
        )
        .await;
        Ok(json!(message))
    }

    pub(super) async fn handle_review_message_delete(
        &self,
        req: ReviewMessageDeleteRequest,
    ) -> Result<Value> {
        let comment_guid = self
            .review_service
            .delete_message(DeleteReviewMessageInput {
                message_guid: req.message_guid.clone(),
            })
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "comment_guid": comment_guid,
                "message_guid": req.message_guid,
                "changed_fields": ["messages", "updated_at"],
            }),
        )
        .await;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_review_message_update(
        &self,
        req: ReviewMessageUpdateRequest,
    ) -> Result<Value> {
        let message = self
            .review_service
            .update_message(UpdateReviewMessageInput {
                message_guid: req.message_guid,
                body: req.body,
            })
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "comment_guid": message.model.comment_guid,
                "message_guid": message.model.guid,
                "changed_fields": ["messages", "updated_at"],
                "message": message,
            }),
        )
        .await;
        Ok(json!(message))
    }

    pub(super) async fn handle_review_agent_run_list(
        &self,
        req: ReviewAgentRunListRequest,
    ) -> Result<Value> {
        let runs = self
            .review_service
            .list_agent_runs(req.session_guid)
            .await?;
        Ok(json!(runs))
    }

    pub(super) async fn handle_review_agent_run_create(
        &self,
        req: ReviewAgentRunCreateRequest,
    ) -> Result<Value> {
        let run = self
            .review_service
            .create_agent_run(CreateReviewAgentRunInput {
                session_guid: req.session_guid,
                base_revision_guid: req.base_revision_guid,
                run_kind: req.run_kind,
                execution_mode: req.execution_mode,
                skill_id: req.skill_id,
                selected_comment_guids: req.selected_comment_guids,
                created_by: req.created_by,
            })
            .await?;
        self.send_review_notification(
            WsEvent::ReviewAgentRunUpdated,
            json!({
                "run_guid": run.run.guid,
                "session_guid": run.run.session_guid,
                "changed_fields": ["status", "updated_at", "prompt_rel_path"],
                "run": run.run,
            }),
        )
        .await;
        Ok(json!(run))
    }

    pub(super) async fn handle_review_agent_run_artifact_get(
        &self,
        req: ReviewAgentRunArtifactGetRequest,
    ) -> Result<Value> {
        let artifact = self
            .review_service
            .get_run_artifact(req.run_guid, req.kind)
            .await?;
        Ok(json!(artifact))
    }

    pub(super) async fn handle_review_agent_run_finalize(
        &self,
        req: ReviewAgentRunFinalizeRequest,
    ) -> Result<Value> {
        let finalized = self
            .review_service
            .finalize_agent_run(req.run_guid.clone(), req.title)
            .await?;
        self.send_review_notification(
            WsEvent::ReviewAgentRunUpdated,
            json!({
                "run_guid": finalized.run.guid,
                "session_guid": finalized.run.session_guid,
                "changed_fields": ["status", "result_revision_guid", "patch_rel_path", "result_rel_path", "finished_at", "updated_at"],
                "run": finalized.run,
                "revision_guid": finalized.revision.guid,
            }),
        )
        .await;
        Ok(json!(finalized))
    }

    pub(super) async fn handle_review_agent_run_set_status(
        &self,
        req: ReviewAgentRunSetStatusRequest,
    ) -> Result<Value> {
        let status_result = self
            .review_service
            .set_agent_run_status(SetReviewAgentRunStatusInput {
                run_guid: req.run_guid,
                status: req.status,
                message: req.message,
                title: req.title,
                summary: req.summary,
            })
            .await?;
        let payload = serde_json::to_value(&status_result)
            .map_err(|error| ServiceError::Processing(error.to_string()))?;
        let run = match &status_result {
            core_service::service::review::ReviewAgentRunStatusDto::Run { run } => run,
            core_service::service::review::ReviewAgentRunStatusDto::Finalized(finalized) => {
                &finalized.run
            }
        };
        self.send_review_notification(
            WsEvent::ReviewAgentRunUpdated,
            json!({
                "run_guid": run.guid,
                "session_guid": run.session_guid,
                "changed_fields": ["status", "updated_at"],
                "run": run,
                "payload": payload,
            }),
        )
        .await;
        Ok(json!(status_result))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── S10: parse_target unit tests ──────────────────────────────────────────

    #[test]
    fn s10_parse_target_workspace_only() {
        let result = WsMessageService::parse_target(Some("ws-1".into()), None);
        match result.unwrap() {
            ReviewTarget::Workspace { workspace_guid } => assert_eq!(workspace_guid, "ws-1"),
            _ => panic!("expected Workspace variant"),
        }
    }

    #[test]
    fn s10_parse_target_project_only() {
        let result = WsMessageService::parse_target(None, Some("pj-1".into()));
        match result.unwrap() {
            ReviewTarget::Project { project_guid } => assert_eq!(project_guid, "pj-1"),
            _ => panic!("expected Project variant"),
        }
    }

    #[test]
    fn s10_parse_target_both_set_returns_error() {
        let result = WsMessageService::parse_target(Some("ws-1".into()), Some("pj-1".into()));
        let err = result.unwrap_err();
        assert!(err.to_string().contains("Specify exactly one"));
    }

    #[test]
    fn s10_parse_target_neither_set_returns_error() {
        let result = WsMessageService::parse_target(None, None);
        let err = result.unwrap_err();
        assert!(err.to_string().contains("required"));
    }
}
