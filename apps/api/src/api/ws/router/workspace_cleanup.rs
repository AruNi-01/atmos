use super::*;

impl WsMessageService {
    pub(super) async fn execute_workspace_cleanup(
        manager: Arc<WsManager>,
        workspace_id: String,
        repo_path_str: String,
        workspace_name: String,
        branch: String,
        delete_remote_branch: bool,
    ) {
        Self::send_workspace_delete_progress(
            &manager,
            WorkspaceDeleteProgressNotification {
                workspace_id: workspace_id.clone(),
                step: "removing_worktree".into(),
                message: "Removing worktree files...".into(),
                success: false,
            },
        )
        .await;

        let cleanup_result = tokio::task::spawn_blocking({
            let repo_path = std::path::PathBuf::from(&repo_path_str);
            let workspace_name = workspace_name.clone();
            let branch = branch.clone();
            move || {
                GitEngine::new().remove_worktree(
                    &repo_path,
                    &workspace_name,
                    &branch,
                    delete_remote_branch,
                )
            }
        })
        .await
        .unwrap_or_else(|e| Err(core_engine::EngineError::Git(e.to_string())));

        match cleanup_result {
            Ok(()) => {
                Self::send_workspace_delete_progress(
                    &manager,
                    WorkspaceDeleteProgressNotification {
                        workspace_id: workspace_id.clone(),
                        step: "completed".into(),
                        message: "Workspace cleanup completed".into(),
                        success: true,
                    },
                )
                .await;
            }
            Err(e) => {
                tracing::warn!(
                    "Failed to remove worktree for workspace {}: {}",
                    workspace_name,
                    e
                );
                Self::send_workspace_delete_progress(
                    &manager,
                    WorkspaceDeleteProgressNotification {
                        workspace_id: workspace_id.clone(),
                        step: "error".into(),
                        message: format!("{}", e),
                        success: false,
                    },
                )
                .await;
            }
        }

        tracing::info!(
            "Background workspace cleanup completed for {}",
            workspace_name
        );
    }

    pub(super) async fn cleanup_github_on_delete(
        &self,
        settings: &WorkspaceDeleteSettings,
        pr_data: Option<&str>,
        issue_data: Option<&str>,
    ) {
        if settings.close_pr_on_delete {
            if let Some(raw) = pr_data {
                if let Ok(pr) = serde_json::from_str::<GithubPrPayload>(raw) {
                    let pr_num = pr.number.to_string();
                    let repo = format!("{}/{}", pr.owner, pr.repo);
                    let args = vec!["pr", "close", &pr_num, "--repo", &repo];
                    match self.github_engine.run_gh(&args).await {
                        Ok(_) => tracing::info!("Closed GitHub PR #{} on delete", pr.number),
                        Err(e) => tracing::warn!("Failed to close GitHub PR #{}: {}", pr.number, e),
                    }
                }
            }
        }

        if settings.close_issue_on_delete {
            if let Some(raw) = issue_data {
                if let Ok(issue) = serde_json::from_str::<GithubIssuePayload>(raw) {
                    let issue_num = issue.number.to_string();
                    let repo = format!("{}/{}", issue.owner, issue.repo);
                    let args = vec!["issue", "close", &issue_num, "--repo", &repo];
                    match self.github_engine.run_gh(&args).await {
                        Ok(_) => tracing::info!("Closed GitHub Issue #{} on delete", issue.number),
                        Err(e) => {
                            tracing::warn!("Failed to close GitHub Issue #{}: {}", issue.number, e)
                        }
                    }
                }
            }
        }
    }
}
