use super::workspace_setup::WorkspaceSetupStep;
use super::*;

impl WsMessageService {
    pub(super) async fn handle_workspace_list(&self, req: WorkspaceListRequest) -> Result<Value> {
        let workspaces = self
            .workspace_service
            .list_by_project(req.project_guid, req.include_issue_only)
            .await?;
        Ok(json!(workspaces))
    }

    pub(super) async fn handle_workspace_create(
        &self,
        conn_id: &str,
        req: WorkspaceCreateRequest,
    ) -> Result<Value> {
        let workspace = self
            .workspace_service
            .create_workspace(
                req.project_guid.clone(),
                req.display_name.or_else(|| {
                    let trimmed = req.name.trim().to_string();
                    (!trimmed.is_empty()).then_some(trimmed)
                }),
                req.branch,
                req.base_branch.clone(),
                req.sidebar_order,
                req.github_issue.clone(),
                req.github_pr.clone(),
                req.auto_extract_todos,
                req.priority,
                req.workflow_status,
                req.label_guids,
            )
            .await?;

        if let Err(e) = self
            .project_service
            .update_target_branch_if_null(
                req.project_guid.clone(),
                workspace.model.base_branch.clone(),
            )
            .await
        {
            tracing::warn!("Failed to initialize target branch: {e}");
        }

        if let Err(error) = self
            .workspace_service
            .ensure_worktree_ready(workspace.model.guid.clone())
            .await
        {
            tracing::error!(
                "[handle_workspace_create] Failed to prepare worktree for {}: {}",
                workspace.model.guid,
                error
            );

            if let Err(cleanup_error) = self
                .workspace_service
                .soft_delete_workspace(&workspace.model.guid)
                .await
            {
                tracing::warn!(
                    "[handle_workspace_create] Failed to clean up workspace {} after worktree error: {}",
                    workspace.model.guid,
                    cleanup_error
                );
            }

            return Err(error.into());
        }

        if !req.attachments.is_empty() {
            if let Err(error) = self
                .workspace_service
                .write_workspace_attachments(workspace.model.guid.clone(), req.attachments.clone())
                .await
            {
                tracing::warn!(
                    "[handle_workspace_create] Failed to write attachments for {}: {}",
                    workspace.model.guid,
                    error
                );
            }
        }

        if req.github_issue.is_some()
            || req.github_pr.is_some()
            || req
                .initial_requirement
                .as_deref()
                .map(str::trim)
                .map(|value| !value.is_empty())
                .unwrap_or(false)
        {
            if let Err(error) = self
                .workspace_service
                .write_workspace_requirement(
                    workspace.model.guid.clone(),
                    req.initial_requirement.clone(),
                    req.github_issue.clone(),
                    req.github_pr.clone(),
                )
                .await
            {
                tracing::warn!(
                    "[handle_workspace_create] Failed to pre-fill requirement.md for {}: {}",
                    workspace.model.guid,
                    error
                );
            }
        }

        self.queue_workspace_gitignore_compensation(
            workspace.model.guid.clone(),
            req.project_guid.clone(),
            workspace.local_path.clone(),
        );

        let workspace_setup_plan = Self::build_workspace_setup_plan(
            &self.project_service,
            &req.project_guid,
            req.initial_requirement.as_deref(),
            workspace.github_issue.as_ref(),
            workspace.github_pr.is_some(),
            req.auto_extract_todos,
        )
        .await;
        let next_setup_step = workspace_setup_plan
            .as_ref()
            .and_then(|plan| {
                plan.steps
                    .iter()
                    .copied()
                    .find(|step| *step != WorkspaceSetupStep::CreateWorktree)
            })
            .or(Some(WorkspaceSetupStep::Ready));

        if let Some(manager) = self.ws_manager.get().cloned() {
            let project_service = self.project_service.clone();
            let workspace_id = workspace.model.guid.clone();
            let conn_id = conn_id.to_string();
            let project_guid = req.project_guid.clone();
            let workspace_name = workspace.model.name.clone();
            let initial_requirement = req.initial_requirement.clone();
            let github_issue = workspace.github_issue.clone();
            let has_github_pr = workspace.github_pr.is_some();
            let auto_extract_todos = req.auto_extract_todos;
            let cached_workspace_setup_plan = workspace_setup_plan.clone();

            let workspace_service = self.workspace_service.clone();
            tokio::spawn(async move {
                Self::execute_setup_state_machine(
                    manager,
                    project_service,
                    workspace_service,
                    conn_id,
                    project_guid,
                    workspace_id,
                    workspace_name,
                    initial_requirement,
                    github_issue,
                    has_github_pr,
                    auto_extract_todos,
                    next_setup_step,
                    cached_workspace_setup_plan,
                )
                .await;
            });
        } else {
            tracing::error!(
                "[handle_workspace_create] WsManager not available, cannot run workspace setup for {}",
                workspace.model.guid
            );
        }

        Ok(json!(workspace))
    }

    pub(super) async fn handle_workspace_import_github_issues(
        &self,
        req: WorkspaceImportGithubIssuesRequest,
    ) -> Result<Value> {
        let mut created_workspaces = Vec::new();
        let mut skipped_issues = Vec::new();

        let existing_workspaces = self
            .workspace_service
            .list_by_project(req.project_guid.clone(), true)
            .await?;

        use std::collections::HashSet;
        let mut seen_urls: HashSet<String> = existing_workspaces
            .iter()
            .filter(|w| w.model.create_source == "issue_only")
            .filter_map(|w| w.model.github_issue_url.clone())
            .collect();

        for issue in req.issues {
            let is_duplicate = existing_workspaces.iter().any(|w| {
                w.model.github_issue_url.as_ref() == Some(&issue.url)
                    && w.model.create_source == "issue_only"
            }) || seen_urls.contains(&issue.url);

            if is_duplicate {
                skipped_issues.push(json!({
                    "issue_url": issue.url,
                    "reason": "duplicate",
                }));
                tracing::warn!(
                    "Skipping duplicate issue import: project={}, issue_url={}",
                    req.project_guid,
                    issue.url
                );
                continue;
            }

            let mut label_guids = Vec::new();
            for issue_label in &issue.labels {
                let label_color = issue_label
                    .color
                    .clone()
                    .unwrap_or_else(|| "94a3b8".to_string());
                let label = self
                    .workspace_service
                    .create_label(
                        issue_label.name.clone(),
                        label_color,
                        "gitHub_issue".to_string(),
                    )
                    .await?;
                label_guids.push(label.guid);
            }

            let issue_data = serde_json::to_string(&issue).map_err(|e| {
                ServiceError::Validation(format!("Failed to serialize issue data: {e}"))
            })?;

            let workspace = self
                .workspace_service
                .create_issue_only_workspace(
                    req.project_guid.clone(),
                    Some(issue.title.clone()),
                    issue.url.clone(),
                    issue_data,
                    req.workflow_status.clone(),
                    req.priority.clone(),
                    Some(label_guids),
                )
                .await?;

            seen_urls.insert(issue.url.clone());
            created_workspaces.push(workspace);
        }

        Ok(json!({
            "created": created_workspaces,
            "skipped": skipped_issues,
        }))
    }

    pub(super) async fn handle_workspace_update_name(
        &self,
        req: WorkspaceUpdateNameRequest,
    ) -> Result<Value> {
        self.workspace_service
            .update_display_name(req.guid, req.name)
            .await?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_update_branch(
        &self,
        req: WorkspaceUpdateBranchRequest,
    ) -> Result<Value> {
        self.workspace_service
            .update_branch(req.guid, req.branch)
            .await?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_update_workflow_status(
        &self,
        req: WorkspaceUpdateWorkflowStatusRequest,
    ) -> Result<Value> {
        self.workspace_service
            .update_workflow_status(req.guid, req.workflow_status)
            .await?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_update_priority(
        &self,
        req: WorkspaceUpdatePriorityRequest,
    ) -> Result<Value> {
        self.workspace_service
            .update_priority(req.guid, req.priority)
            .await?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_label_list(
        &self,
        req: WorkspaceLabelListRequest,
    ) -> Result<Value> {
        let labels = self.workspace_service.list_labels(req.deleted_only).await?;
        Ok(json!(labels))
    }

    pub(super) async fn handle_workspace_label_create(
        &self,
        req: WorkspaceLabelCreateRequest,
    ) -> Result<Value> {
        let label = self
            .workspace_service
            .create_label(req.name, req.color, req.source)
            .await?;
        Ok(json!(label))
    }

    pub(super) async fn handle_workspace_label_update(
        &self,
        req: WorkspaceLabelUpdateRequest,
    ) -> Result<Value> {
        let source = req.source.unwrap_or_else(|| "manual".to_string());
        let label = self
            .workspace_service
            .update_label(req.guid, req.name, req.color, source)
            .await?;
        Ok(json!(label))
    }

    pub(super) async fn handle_workspace_label_delete(
        &self,
        req: WorkspaceLabelDeleteRequest,
    ) -> Result<Value> {
        self.workspace_service.delete_label(&req.guid).await?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_label_restore(
        &self,
        req: WorkspaceLabelRestoreRequest,
    ) -> Result<Value> {
        self.workspace_service.restore_label(&req.guid).await?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_update_labels(
        &self,
        req: WorkspaceUpdateLabelsRequest,
    ) -> Result<Value> {
        self.workspace_service
            .update_labels(req.guid, req.label_guids)
            .await?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_update_order(
        &self,
        req: WorkspaceUpdateOrderRequest,
    ) -> Result<Value> {
        self.workspace_service
            .update_order(req.guid, req.sidebar_order)
            .await?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_mark_visited(
        &self,
        req: WorkspaceMarkVisitedRequest,
    ) -> Result<Value> {
        self.workspace_service.mark_visited(req.guid).await?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_delete(
        &self,
        req: WorkspaceDeleteRequest,
    ) -> Result<Value> {
        let guid = req.guid;
        let settings = WorkspaceDeleteSettings::load();

        let tmux_session = self
            .workspace_service
            .resolve_tmux_session_name(&guid, &self.terminal_service.tmux_engine())
            .await
            .ok();

        let cleanup_info = self
            .workspace_service
            .get_workspace_cleanup_info(&guid)
            .await?;

        let workspace_data = self
            .workspace_service
            .get_workspace_for_github_cleanup(&guid)
            .await
            .ok()
            .flatten();

        self.workspace_service.soft_delete_workspace(&guid).await?;

        if let Some(session_name) = tmux_session {
            self.terminal_service
                .cleanup_workspace_terminal_state(&guid, &session_name)
                .await;
        }

        if let Some((pr_data, issue_data)) = workspace_data {
            self.cleanup_github_on_delete(&settings, pr_data.as_deref(), issue_data.as_deref())
                .await;
        }

        if let Some(manager) = self.ws_manager.get().cloned() {
            let workspace_id = guid.clone();

            if let Some((repo_path_str, workspace_name, branch)) = cleanup_info {
                let delete_remote_branch = settings.delete_remote_branch;
                tokio::spawn(async move {
                    Self::execute_workspace_cleanup(
                        manager,
                        workspace_id,
                        repo_path_str,
                        workspace_name,
                        branch,
                        delete_remote_branch,
                    )
                    .await;
                });
            } else {
                Self::send_workspace_delete_progress(
                    &manager,
                    WorkspaceDeleteProgressNotification {
                        workspace_id,
                        step: "completed".into(),
                        message: "Workspace cleanup completed".into(),
                        success: true,
                    },
                )
                .await;
            }
        }

        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_pin(&self, req: WorkspacePinRequest) -> Result<Value> {
        self.workspace_service.pin_workspace(req.guid).await?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_unpin(&self, req: WorkspaceUnpinRequest) -> Result<Value> {
        self.workspace_service.unpin_workspace(req.guid).await?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_update_pin_order(
        &self,
        req: WorkspaceUpdatePinOrderRequest,
    ) -> Result<Value> {
        self.workspace_service
            .update_workspace_pin_order(req.workspace_ids)
            .await?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_archive(
        &self,
        req: WorkspaceArchiveRequest,
    ) -> Result<Value> {
        let guid = req.guid;
        let settings = WorkspaceArchiveSettings::load();

        let tmux_session = if settings.kill_tmux_on_archive {
            self.workspace_service
                .resolve_tmux_session_name(&guid, &self.terminal_service.tmux_engine())
                .await
                .ok()
        } else {
            None
        };

        self.workspace_service
            .archive_workspace(guid.clone())
            .await?;

        if let Some(session_name) = tmux_session {
            self.terminal_service
                .cleanup_workspace_terminal_state(&guid, &session_name)
                .await;
        }

        if settings.close_acp_on_archive {
            self.agent_session_service
                .close_workspace_sessions(&guid)
                .await;
        }

        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_unarchive(
        &self,
        req: WorkspaceUnarchiveRequest,
    ) -> Result<Value> {
        self.workspace_service.unarchive_workspace(req.guid).await?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_list_archived(&self) -> Result<Value> {
        let workspaces = self.workspace_service.list_archived_workspaces().await?;

        let mut workspace_entries = Vec::new();
        for ws in workspaces {
            let project = self
                .project_service
                .get_project(ws.model.project_guid.clone())
                .await?;
            let Some(project) = project else {
                continue;
            };

            workspace_entries.push(json!({
                "guid": ws.model.guid,
                "name": ws.model.name,
                "display_name": ws.model.display_name,
                "branch": ws.model.branch,
                "base_branch": ws.model.base_branch,
                "project_guid": ws.model.project_guid,
                "project_name": project.name,
                "archived_at": ws.model.archived_at,
            }));
        }

        Ok(json!({ "workspaces": workspace_entries }))
    }

    pub(super) async fn handle_project_check_can_delete(
        &self,
        req: ProjectCheckCanDeleteRequest,
    ) -> Result<Value> {
        let response = self
            .project_service
            .check_can_delete_from_archive_modal(req.guid)
            .await?;
        Ok(json!(response))
    }

    pub(super) async fn handle_workspace_retry_setup(
        &self,
        conn_id: &str,
        req: WorkspaceRetrySetupRequest,
    ) -> Result<Value> {
        let workspace = self
            .workspace_service
            .get_workspace(req.guid.clone())
            .await?
            .ok_or_else(|| ServiceError::Validation("Workspace not found".to_string()))?;

        let failed_step = WorkspaceSetupStep::from_key(&req.failed_step_key).ok_or_else(|| {
            ServiceError::Validation(format!(
                "Unsupported setup step `{}` for retry",
                req.failed_step_key
            ))
        })?;

        if let Some(manager) = self.ws_manager.get().cloned() {
            let project_service = self.project_service.clone();
            let workspace_id = workspace.model.guid.clone();
            let conn_id = conn_id.to_string();
            let project_guid = workspace.model.project_guid.clone();
            let workspace_name = workspace.model.name.clone();

            let workspace_service = self.workspace_service.clone();
            tokio::spawn(async move {
                Self::execute_setup_state_machine(
                    manager,
                    project_service,
                    workspace_service,
                    conn_id,
                    project_guid,
                    workspace_id,
                    workspace_name,
                    req.initial_requirement,
                    req.github_issue,
                    false,
                    req.auto_extract_todos,
                    Some(failed_step),
                    None,
                )
                .await;
            });
        }

        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_skip_setup_script(
        &self,
        conn_id: &str,
        req: WorkspaceSkipSetupScriptRequest,
    ) -> Result<Value> {
        let workspace = self
            .workspace_service
            .get_workspace(req.guid.clone())
            .await?
            .ok_or_else(|| ServiceError::Validation("Workspace not found".to_string()))?;

        if let Some(manager) = self.ws_manager.get().cloned() {
            let project_service = self.project_service.clone();
            let workspace_service = self.workspace_service.clone();
            let conn_id = conn_id.to_string();
            let workspace_id = workspace.model.guid.clone();
            let project_guid = workspace.model.project_guid.clone();
            let workspace_name = workspace.model.name.clone();
            let github_issue = workspace.github_issue.clone();
            let has_github_pr = workspace.github_pr.is_some();
            let auto_extract_todos = workspace.model.auto_extract_todos;

            tokio::spawn(async move {
                Self::execute_setup_state_machine(
                    manager,
                    project_service,
                    workspace_service,
                    conn_id,
                    project_guid,
                    workspace_id,
                    workspace_name,
                    None,
                    github_issue,
                    has_github_pr,
                    auto_extract_todos,
                    Some(WorkspaceSetupStep::Ready),
                    None,
                )
                .await;
            });
        }

        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_skip_setup_step(
        &self,
        conn_id: &str,
        req: WorkspaceSkipSetupStepRequest,
    ) -> Result<Value> {
        let workspace = self
            .workspace_service
            .get_workspace(req.guid.clone())
            .await?
            .ok_or_else(|| ServiceError::Validation("Workspace not found".to_string()))?;

        let failed_step = WorkspaceSetupStep::from_key(&req.failed_step_key).ok_or_else(|| {
            ServiceError::Validation(format!(
                "Unsupported setup step `{}` for skip",
                req.failed_step_key
            ))
        })?;

        if failed_step == WorkspaceSetupStep::CreateWorktree {
            return Err(ServiceError::Validation(
                "Cannot skip workspace creation because the workspace directory is required"
                    .to_string(),
            ));
        }

        if let Some(manager) = self.ws_manager.get().cloned() {
            let project_service = self.project_service.clone();
            let workspace_service = self.workspace_service.clone();
            let conn_id = conn_id.to_string();
            let workspace_id = workspace.model.guid.clone();
            let project_guid = workspace.model.project_guid.clone();
            let workspace_name = workspace.model.name.clone();
            let initial_requirement = req.initial_requirement.clone();
            let github_issue = req.github_issue.or(workspace.github_issue.clone());
            let has_github_pr = workspace.github_pr.is_some();
            let auto_extract_todos = req.auto_extract_todos || workspace.model.auto_extract_todos;

            tokio::spawn(async move {
                let start_step = Self::build_workspace_setup_plan(
                    &project_service,
                    &project_guid,
                    initial_requirement.as_deref(),
                    github_issue.as_ref(),
                    has_github_pr,
                    auto_extract_todos,
                )
                .await
                .and_then(|plan| {
                    plan.steps
                        .iter()
                        .position(|candidate| *candidate == failed_step)
                        .and_then(|index| plan.steps.get(index + 1).copied())
                })
                .unwrap_or(WorkspaceSetupStep::Ready);

                Self::execute_setup_state_machine(
                    manager,
                    project_service,
                    workspace_service,
                    conn_id,
                    project_guid,
                    workspace_id,
                    workspace_name,
                    initial_requirement,
                    github_issue,
                    has_github_pr,
                    auto_extract_todos,
                    Some(start_step),
                    None,
                )
                .await;
            });
        }

        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_workspace_confirm_todos(
        &self,
        conn_id: &str,
        req: WorkspaceConfirmTodosRequest,
    ) -> Result<Value> {
        let workspace = self
            .workspace_service
            .get_workspace(req.guid.clone())
            .await?
            .ok_or_else(|| ServiceError::Validation("Workspace not found".to_string()))?;

        self.workspace_service
            .write_workspace_task_markdown(req.guid.clone(), req.markdown)
            .await?;

        if let Some(manager) = self.ws_manager.get().cloned() {
            let project_service = self.project_service.clone();
            let workspace_service = self.workspace_service.clone();
            let conn_id = conn_id.to_string();
            let project_guid = workspace.model.project_guid.clone();
            let workspace_id = workspace.model.guid.clone();
            let workspace_name = workspace.model.name.clone();
            let github_issue = workspace.github_issue.clone();
            let has_github_pr = workspace.github_pr.is_some();
            let auto_extract_todos = workspace.model.auto_extract_todos;

            tokio::spawn(async move {
                Self::execute_setup_state_machine(
                    manager,
                    project_service,
                    workspace_service,
                    conn_id,
                    project_guid,
                    workspace_id,
                    workspace_name,
                    None,
                    github_issue,
                    has_github_pr,
                    auto_extract_todos,
                    Some(WorkspaceSetupStep::RunSetupScript),
                    None,
                )
                .await;
            });
        }

        Ok(json!({ "success": true }))
    }
}
