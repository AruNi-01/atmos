use std::path::PathBuf;

use super::*;

impl WsMessageService {
    async fn send_workspace_gitignore_sync_failed(
        manager: &Arc<infra::WsManager>,
        payload: WorkspaceGitignoreSyncFailedNotification,
    ) {
        let message =
            WsMessage::notification(WsEvent::WorkspaceGitignoreSyncFailed, json!(payload));
        let _ = manager.broadcast(&message).await;
    }

    pub(super) fn queue_workspace_gitignore_compensation(
        &self,
        workspace_id: String,
        project_guid: String,
        worktree_path: String,
    ) {
        let Some(manager) = self.ws_manager.get().cloned() else {
            tracing::warn!(
                "[gitignore_dirs] WsManager unavailable; skipping async compensation notification path for {}",
                workspace_id
            );
            return;
        };
        let project_service = self.project_service.clone();

        tokio::spawn(async move {
            let project = match project_service.get_project(project_guid.clone()).await {
                Ok(Some(project)) => project,
                Ok(None) => {
                    tracing::warn!(
                        "[gitignore_dirs] Project {} not found while compensating workspace {}",
                        project_guid,
                        workspace_id
                    );
                    Self::send_workspace_gitignore_sync_failed(
                        &manager,
                        WorkspaceGitignoreSyncFailedNotification {
                            workspace_id,
                            message: "Could not load project settings for GitIgnore sync."
                                .to_string(),
                        },
                    )
                    .await;
                    return;
                }
                Err(error) => {
                    tracing::warn!(
                        "[gitignore_dirs] Failed to load project {} while compensating workspace {}: {}",
                        project_guid,
                        workspace_id,
                        error
                    );
                    Self::send_workspace_gitignore_sync_failed(
                        &manager,
                        WorkspaceGitignoreSyncFailedNotification {
                            workspace_id,
                            message: "Could not load project settings for GitIgnore sync."
                                .to_string(),
                        },
                    )
                    .await;
                    return;
                }
            };

            let repo_path = PathBuf::from(project.main_file_path);
            let worktree_path_buf = PathBuf::from(&worktree_path);
            let workspace_id_for_task = workspace_id.clone();
            let report = tokio::task::spawn_blocking(move || {
                crate::service::workspace_gitignore_dirs::compensate(&repo_path, &worktree_path_buf)
            })
            .await;

            match report {
                Ok(report) => {
                    tracing::info!(
                        "[gitignore_dirs] async compensation for {}: applied={}, skipped={}, failed={}, disabled={}",
                        workspace_id_for_task,
                        report.applied,
                        report.skipped,
                        report.failed,
                        report.skipped_disabled
                    );

                    if report.failed > 0 {
                        Self::send_workspace_gitignore_sync_failed(
                            &manager,
                            WorkspaceGitignoreSyncFailedNotification {
                                workspace_id,
                                message: format!(
                                    "GitIgnore sync finished with {} failure(s). Some ignored symlinks may be missing or not ignored yet.",
                                    report.failed
                                ),
                            },
                        )
                        .await;
                    }
                }
                Err(error) => {
                    tracing::warn!(
                        "[gitignore_dirs] async compensation task join failed for {}: {}",
                        workspace_id,
                        error
                    );
                    Self::send_workspace_gitignore_sync_failed(
                        &manager,
                        WorkspaceGitignoreSyncFailedNotification {
                            workspace_id,
                            message: "GitIgnore sync failed in the background.".to_string(),
                        },
                    )
                    .await;
                }
            }
        });
    }
}
