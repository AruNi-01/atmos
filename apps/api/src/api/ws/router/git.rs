use std::time::Instant;

use futures_util::{stream, StreamExt};
use serde_json::{json, Value};

use core_engine::{FsEngine, GitEngine};
use core_service::service::git_commit_message::GitCommitMessageGenerator;
use core_service::{Result, ServiceError};

use super::{
    DiffContentKind, DiffPreviewKind, GitBlobLocator, GitChangedFilesRequest, GitCommitRequest,
    GitDiscardUnstagedRequest, GitDiscardUntrackedRequest, GitFetchRequest, GitFileDiffRequest,
    GitFileDiffResponse, GitFilesDiffRequest, GitFilesDiffResponse, GitFilesDiffResult,
    GitGenerateCommitMessageRequest, GitGetCommitCountRequest, GitGetHeadCommitRequest,
    GitGetStatusBatchRequest, GitGetStatusBatchResponse, GitGetStatusBatchResult,
    GitGetStatusRequest, GitListBranchesRequest, GitLogRequest, GitPatchChunkRequest,
    GitPullRequest, GitPushRequest, GitRenameBranchRequest, GitStageRequest, GitStatusResponse,
    GitSyncRequest, GitUnstageRequest, WsEvent, WsMessage, WsMessageService,
};

const GIT_BATCH_CONCURRENCY: usize = 8;

fn file_diff_to_response(diff: core_engine::FileDiffInfo) -> GitFileDiffResponse {
    GitFileDiffResponse {
        file_path: diff.file_path,
        status: diff.status,
        compare_ref: diff.compare_ref,
        kind: match diff.kind {
            core_engine::DiffContentKind::Text => DiffContentKind::Text,
            core_engine::DiffContentKind::Binary => DiffContentKind::Binary,
            core_engine::DiffContentKind::TooLarge => DiffContentKind::TooLarge,
        },
        preview_kind: match diff.preview_kind {
            core_engine::DiffPreviewKind::None => DiffPreviewKind::None,
            core_engine::DiffPreviewKind::Image => DiffPreviewKind::Image,
            core_engine::DiffPreviewKind::Media => DiffPreviewKind::Media,
        },
        old_text: diff.old_text,
        new_text: diff.new_text,
        old_size: diff.old_size,
        new_size: diff.new_size,
        old_sha256: diff.old_sha256,
        new_sha256: diff.new_sha256,
        old_blob: diff.old_blob.map(map_blob_locator),
        new_blob: diff.new_blob.map(map_blob_locator),
    }
}

fn map_blob_locator(locator: core_engine::GitBlobLocator) -> GitBlobLocator {
    match locator {
        core_engine::GitBlobLocator::Worktree { path } => GitBlobLocator::Worktree { path },
        core_engine::GitBlobLocator::Git { rev, path } => GitBlobLocator::Git { rev, path },
    }
}

impl WsMessageService {
    fn get_git_status(
        fs_engine: &FsEngine,
        git_engine: &GitEngine,
        req: GitGetStatusRequest,
    ) -> Result<GitStatusResponse> {
        let path = fs_engine.expand_path(&req.path)?;
        let status = git_engine
            .get_git_status(&path)
            .map_err(|e| ServiceError::Validation(format!("Failed to get git status: {}", e)))?;

        let current_branch = git_engine.get_current_branch(&path).ok();

        let remote_url = git_engine.get_remote_url(&path).unwrap_or_default();
        let github_info = core_engine::GithubEngine::parse_github_remote(&remote_url);
        let github_owner = github_info.as_ref().map(|x| x.0.clone());
        let github_repo = github_info.as_ref().map(|x| x.1.clone());

        Ok(GitStatusResponse {
            has_uncommitted_changes: status.has_uncommitted_changes,
            has_merge_conflicts: status.has_merge_conflicts,
            has_unpushed_commits: status.has_unpushed_commits,
            uncommitted_count: status.uncommitted_count,
            unpushed_count: status.unpushed_count,
            upstream_behind_count: status.upstream_behind_count,
            default_branch: status.default_branch,
            default_branch_ahead: status.default_branch_ahead,
            default_branch_behind: status.default_branch_behind,
            current_branch,
            github_owner,
            github_repo,
        })
    }

    pub(super) fn handle_git_get_status(&self, req: GitGetStatusRequest) -> Result<Value> {
        Ok(json!(Self::get_git_status(
            &self.fs_engine,
            &self.git_engine,
            req
        )?))
    }

    pub(super) async fn handle_git_get_status_batch(
        &self,
        req: GitGetStatusBatchRequest,
    ) -> Result<Value> {
        let results = stream::iter(req.paths.into_iter().map(|path| async move {
            let result_path = path.clone();
            let result = tokio::task::spawn_blocking(move || {
                Self::get_git_status(
                    &FsEngine::new(),
                    &GitEngine::new(),
                    GitGetStatusRequest { path },
                )
            })
            .await;

            match result {
                Ok(Ok(status)) => GitGetStatusBatchResult {
                    path: result_path,
                    status: Some(status),
                    error: None,
                },
                Ok(Err(error)) => GitGetStatusBatchResult {
                    path: result_path,
                    status: None,
                    error: Some(error.to_string()),
                },
                Err(error) => GitGetStatusBatchResult {
                    path: result_path,
                    status: None,
                    error: Some(format!("Git status task failed: {error}")),
                },
            }
        }))
        .buffered(GIT_BATCH_CONCURRENCY)
        .collect()
        .await;

        Ok(json!(GitGetStatusBatchResponse { results }))
    }

    pub(super) fn handle_git_get_head_commit(&self, req: GitGetHeadCommitRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let commit_hash = self
            .git_engine
            .get_head_commit(&path)
            .map_err(|e| ServiceError::Validation(format!("Failed to get HEAD commit: {}", e)))?;
        Ok(json!({ "commit_hash": commit_hash }))
    }

    pub(super) fn handle_git_get_commit_count(
        &self,
        req: GitGetCommitCountRequest,
    ) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let count = self
            .git_engine
            .get_commit_count(&path, &req.base_commit, &req.head_commit)
            .map_err(|e| ServiceError::Validation(format!("Failed to get commit count: {}", e)))?;
        Ok(json!({ "count": count }))
    }

    pub(super) fn handle_git_list_branches(&self, req: GitListBranchesRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let branches = self
            .git_engine
            .list_branches(&path)
            .map_err(|e| ServiceError::Validation(format!("Failed to list branches: {}", e)))?;

        Ok(json!({ "branches": branches }))
    }

    pub(super) fn handle_git_list_remote_branches(
        &self,
        req: GitListBranchesRequest,
    ) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let branches = self.git_engine.list_remote_branches(&path).map_err(|e| {
            ServiceError::Validation(format!("Failed to list remote branches: {}", e))
        })?;

        Ok(json!({ "branches": branches }))
    }

    pub(super) fn handle_git_rename_branch(&self, req: GitRenameBranchRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .rename_branch(&path, &req.old_name, &req.new_name)
            .map_err(|e| ServiceError::Validation(format!("Failed to rename branch: {}", e)))?;

        Ok(json!({ "success": true }))
    }

    pub(super) fn handle_git_changed_files(&self, req: GitChangedFilesRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let info = if let Some(commit_ref) = req
            .commit_ref
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            self.git_engine
                .get_changed_files_for_commit(&path, commit_ref)
                .map_err(|e| {
                    ServiceError::Validation(format!("Failed to get changed files: {}", e))
                })?
        } else {
            let base_ref = req
                .base_ref
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .or_else(|| {
                    req.base_branch
                        .as_deref()
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                });
            self.git_engine
                .get_changed_files(&path, base_ref, req.use_preferred_compare)
                .map_err(|e| {
                    ServiceError::Validation(format!("Failed to get changed files: {}", e))
                })?
        };

        let convert_file = |f: core_engine::ChangedFileInfo| -> Value {
            json!({
                "path": f.path,
                "status": f.status,
                "additions": f.additions,
                "deletions": f.deletions,
                "is_binary": f.is_binary,
                "staged": f.staged,
            })
        };

        let staged_files: Vec<Value> = info.staged_files.into_iter().map(convert_file).collect();
        let unstaged_files: Vec<Value> =
            info.unstaged_files.into_iter().map(convert_file).collect();
        let untracked_files: Vec<Value> =
            info.untracked_files.into_iter().map(convert_file).collect();

        let is_branch_published = self.git_engine.is_branch_published(&path).unwrap_or(true);

        Ok(json!({
            "staged_files": staged_files,
            "unstaged_files": unstaged_files,
            "untracked_files": untracked_files,
            "total_additions": info.total_additions,
            "total_deletions": info.total_deletions,
            "is_branch_published": is_branch_published,
            "compare_ref": info.compare_ref,
        }))
    }

    fn get_git_file_diff(
        fs_engine: &FsEngine,
        git_engine: &GitEngine,
        req: GitFileDiffRequest,
    ) -> Result<GitFileDiffResponse> {
        let path = fs_engine.expand_path(&req.path)?;
        let diff = if let Some(commit_ref) = req.commit_ref.as_deref() {
            git_engine
                .get_file_diff_for_commit(&path, &req.file_path, commit_ref)
                .map_err(|e| ServiceError::Validation(format!("Failed to get file diff: {}", e)))?
        } else {
            let base_ref = req.base_ref.as_deref().or(req.base_branch.as_deref());
            git_engine
                .get_file_diff(&path, &req.file_path, base_ref, req.against_index)
                .map_err(|e| ServiceError::Validation(format!("Failed to get file diff: {}", e)))?
        };

        Ok(file_diff_to_response(diff))
    }

    pub(super) fn handle_git_file_diff(&self, req: GitFileDiffRequest) -> Result<Value> {
        Ok(json!(Self::get_git_file_diff(
            &self.fs_engine,
            &self.git_engine,
            req
        )?))
    }

    pub(super) async fn handle_git_files_diff(&self, req: GitFilesDiffRequest) -> Result<Value> {
        let GitFilesDiffRequest {
            path,
            file_paths,
            base_branch,
            base_ref,
            commit_ref,
            against_index,
        } = req;
        let results = stream::iter(file_paths.into_iter().map(|file_path| {
            let path = path.clone();
            let base_branch = base_branch.clone();
            let base_ref = base_ref.clone();
            let commit_ref = commit_ref.clone();

            async move {
                let result_file_path = file_path.clone();
                let result = tokio::task::spawn_blocking(move || {
                    Self::get_git_file_diff(
                        &FsEngine::new(),
                        &GitEngine::new(),
                        GitFileDiffRequest {
                            path,
                            file_path,
                            base_branch,
                            base_ref,
                            commit_ref,
                            against_index,
                        },
                    )
                })
                .await;

                match result {
                    Ok(Ok(diff)) => GitFilesDiffResult {
                        file_path: result_file_path,
                        diff: Some(diff),
                        error: None,
                    },
                    Ok(Err(error)) => GitFilesDiffResult {
                        file_path: result_file_path,
                        diff: None,
                        error: Some(error.to_string()),
                    },
                    Err(error) => GitFilesDiffResult {
                        file_path: result_file_path,
                        diff: None,
                        error: Some(format!("Git file diff task failed: {error}")),
                    },
                }
            }
        }))
        .buffered(GIT_BATCH_CONCURRENCY)
        .collect();
        let results = results.await;

        Ok(json!(GitFilesDiffResponse { results }))
    }

    pub(super) fn handle_git_stage_patch_chunk(&self, req: GitPatchChunkRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .apply_patch_to_index(&path, &req.patch)
            .map_err(|e| ServiceError::Validation(format!("Failed to stage patch chunk: {}", e)))?;
        Ok(json!({ "success": true }))
    }

    pub(super) fn handle_git_restore_patch_chunk(
        &self,
        req: GitPatchChunkRequest,
    ) -> Result<Value> {
        if req.file_status == "A" {
            return Ok(json!({
                "success": false,
                "error": "Cannot restore an untracked/new file chunk; use discard untracked instead.",
            }));
        }
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .apply_patch_to_worktree_reverse(&path, &req.patch)
            .map_err(|e| {
                ServiceError::Validation(format!("Failed to restore patch chunk: {}", e))
            })?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_git_generate_commit_message(
        &self,
        conn_id: &str,
        req: GitGenerateCommitMessageRequest,
    ) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let changes = self
            .git_engine
            .get_changed_files(&path, None, false)
            .map_err(|e| ServiceError::Validation(format!("Failed to get changed files: {}", e)))?;

        let repo_name = path.file_name().and_then(|value| value.to_str());
        let generator = GitCommitMessageGenerator::new()?;

        tracing::info!(
            conn_id,
            repo_path = %path.display(),
            repo_name = repo_name.unwrap_or("unknown"),
            staged_files = changes.staged_files.len(),
            unstaged_files = changes.unstaged_files.len(),
            untracked_files = changes.untracked_files.len(),
            "starting git commit message generation"
        );

        let ws_manager = self.ws_manager.get().cloned();

        let mut rx = match generator.generate_stream(repo_name, &changes).await {
            Ok(rx) => rx,
            Err(error) => {
                tracing::error!(
                    conn_id,
                    repo_path = %path.display(),
                    repo_name = repo_name.unwrap_or("unknown"),
                    "failed to start git commit message stream: {}",
                    error
                );
                return Err(error);
            }
        };
        let mut full_message = String::new();
        let started_at = Instant::now();
        let mut chunk_count = 0usize;

        tracing::info!(
            conn_id,
            repo_path = %path.display(),
            repo_name = repo_name.unwrap_or("unknown"),
            "git commit message stream receiver ready"
        );

        while let Some(chunk_result) = rx.recv().await {
            match chunk_result {
                Ok(chunk) => {
                    chunk_count += 1;
                    full_message.push_str(&chunk);
                    if let Some(ref mgr) = ws_manager {
                        let notification = WsMessage::notification(
                            WsEvent::GitCommitMessageChunk,
                            json!({ "chunk": chunk }),
                        );
                        let _ = mgr.send_to(conn_id, &notification).await;
                    }
                }
                Err(e) => {
                    tracing::error!(
                        conn_id,
                        repo_path = %path.display(),
                        repo_name = repo_name.unwrap_or("unknown"),
                        chunk_count,
                        partial_chars = full_message.chars().count(),
                        elapsed_ms = started_at.elapsed().as_millis(),
                        "git commit message streaming failed: {}",
                        e
                    );
                    return Err(ServiceError::Validation(format!(
                        "Failed to generate git commit message: {e}"
                    )));
                }
            }
        }

        let message = full_message.trim().to_string();
        if message.is_empty() {
            tracing::error!(
                conn_id,
                repo_path = %path.display(),
                repo_name = repo_name.unwrap_or("unknown"),
                chunk_count,
                partial_chars = full_message.chars().count(),
                elapsed_ms = started_at.elapsed().as_millis(),
                "git commit message stream completed with empty output"
            );
            return Err(ServiceError::Validation(
                "LLM provider returned an empty git commit message".to_string(),
            ));
        }

        tracing::info!(
            conn_id,
            repo_path = %path.display(),
            repo_name = repo_name.unwrap_or("unknown"),
            chunk_count,
            message_chars = message.chars().count(),
            elapsed_ms = started_at.elapsed().as_millis(),
            "git commit message stream completed"
        );

        Ok(json!({
            "message": message,
        }))
    }

    pub(super) fn handle_git_commit(&self, req: GitCommitRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let hash = self
            .git_engine
            .commit_all(&path, &req.message)
            .map_err(|e| ServiceError::Validation(format!("Failed to commit: {}", e)))?;

        Ok(json!({
            "success": true,
            "commit_hash": hash,
        }))
    }

    pub(super) fn handle_git_push(&self, req: GitPushRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .push(&path)
            .map_err(|e| ServiceError::Validation(format!("Failed to push: {}", e)))?;

        Ok(json!({ "success": true }))
    }

    pub(super) fn handle_git_stage(&self, req: GitStageRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .stage_files(&path, &req.files)
            .map_err(|e| ServiceError::Validation(format!("Failed to stage files: {}", e)))?;

        Ok(json!({ "success": true }))
    }

    pub(super) fn handle_git_unstage(&self, req: GitUnstageRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .unstage_files(&path, &req.files)
            .map_err(|e| ServiceError::Validation(format!("Failed to unstage files: {}", e)))?;

        Ok(json!({ "success": true }))
    }

    pub(super) fn handle_git_discard_unstaged(
        &self,
        req: GitDiscardUnstagedRequest,
    ) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .discard_unstaged(&path, &req.files)
            .map_err(|e| {
                ServiceError::Validation(format!("Failed to discard unstaged changes: {}", e))
            })?;

        Ok(json!({ "success": true }))
    }

    pub(super) fn handle_git_discard_untracked(
        &self,
        req: GitDiscardUntrackedRequest,
    ) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .discard_untracked(&path, &req.files)
            .map_err(|e| {
                ServiceError::Validation(format!("Failed to discard untracked files: {}", e))
            })?;

        Ok(json!({ "success": true }))
    }

    pub(super) fn handle_git_pull(&self, req: GitPullRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .pull(&path)
            .map_err(|e| ServiceError::Validation(format!("Failed to pull: {}", e)))?;

        Ok(json!({ "success": true }))
    }

    pub(super) fn handle_git_fetch(&self, req: GitFetchRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .fetch(&path)
            .map_err(|e| ServiceError::Validation(format!("Failed to fetch: {}", e)))?;

        Ok(json!({ "success": true }))
    }

    pub(super) fn handle_git_sync(&self, req: GitSyncRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .sync(&path)
            .map_err(|e| ServiceError::Validation(format!("Failed to sync: {}", e)))?;

        Ok(json!({ "success": true }))
    }

    pub(super) fn handle_git_log(&self, req: GitLogRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let commits = self
            .git_engine
            .get_commit_log(&path, req.limit, req.offset)
            .map_err(|e| ServiceError::Validation(format!("Failed to get git log: {}", e)))?;

        let commits_json: Vec<Value> = commits
            .into_iter()
            .map(|c| {
                json!({
                    "hash": c.hash,
                    "short_hash": c.short_hash,
                    "author_name": c.author_name,
                    "author_email": c.author_email,
                    "timestamp": c.timestamp,
                    "subject": c.subject,
                    "body": c.body,
                    "is_pushed": c.is_pushed,
                    "author_avatar_url": c.author_avatar_url,
                })
            })
            .collect();

        Ok(json!({ "commits": commits_json }))
    }
}
