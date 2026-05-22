use std::path::{Path, PathBuf};

use crate::error::{EngineError, Result};

use super::{GitEngine, WorktreeInfo, run_git, try_run_git, types::parse_worktree_list};

impl GitEngine {
    /// Get the atmos workspace base directory: ~/.atmos/workspaces
    pub fn get_workspaces_base_dir(&self) -> Result<PathBuf> {
        let home = dirs::home_dir()
            .ok_or_else(|| EngineError::Git("Unable to determine home directory".to_string()))?;
        Ok(home.join(".atmos").join("workspaces"))
    }

    /// Get the worktree path for a workspace: ~/.atmos/workspaces/{project_scope}/{workspace_name}
    /// Note: workspace_name may already include the project scope prefix.
    pub fn get_worktree_path(&self, workspace_name: &str) -> Result<PathBuf> {
        let base = self.get_workspaces_base_dir()?;
        Ok(base.join(workspace_name))
    }

    /// Create a git worktree for a new workspace
    ///
    /// # Arguments
    /// * `repo_path` - Path to the main git repository
    /// * `workspace_name` - Name of the workspace (e.g., "aruni/pikachu", used as branch name and path)
    /// * `base_branch` - The branch to base the new worktree on (e.g., "main")
    ///
    /// # Returns
    /// The path to the created worktree
    pub fn create_worktree(
        &self,
        repo_path: &Path,
        workspace_name: &str,
        branch_name: &str,
        base_branch: &str,
    ) -> Result<PathBuf> {
        let worktree_path = self.get_worktree_path(workspace_name)?;

        // Ensure parent directory exists
        if let Some(parent) = worktree_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                EngineError::Git(format!("Failed to create worktree directory: {}", e))
            })?;
        }

        if worktree_path.exists() {
            return Err(EngineError::Git(format!(
                "Worktree already exists at: {}",
                worktree_path.display()
            )));
        }

        // Fetch latest from remote (non-fatal)
        if let Err(e) = run_git(repo_path, &["fetch", "origin"]) {
            tracing::warn!("Git fetch warning: {}", e);
        }

        let base_ref = self.resolve_remote_branch_ref(repo_path, base_branch)?;

        let worktree_str = worktree_path
            .to_str()
            .ok_or_else(|| EngineError::Git("Non-UTF-8 worktree path".into()))?;

        run_git(
            repo_path,
            &[
                "worktree",
                "add",
                "-b",
                branch_name,
                worktree_str,
                &base_ref,
            ],
        )
        .map_err(|e| {
            EngineError::Git(format!(
                "Failed to create worktree (likely branch conflict): {}",
                e
            ))
        })?;

        tracing::info!(
            "Created worktree at {} with branch {} (not pushed to remote yet)",
            worktree_path.display(),
            branch_name
        );

        Ok(worktree_path)
    }

    /// Create a worktree that tracks an existing remote branch (e.g., a PR head branch).
    ///
    /// If the local branch already exists, checks it out as-is. Otherwise creates a
    /// local branch tracking `origin/<remote_branch>`.
    pub fn create_worktree_from_remote_branch(
        &self,
        repo_path: &Path,
        workspace_name: &str,
        remote_branch: &str,
    ) -> Result<PathBuf> {
        let worktree_path = self.get_worktree_path(workspace_name)?;

        if let Some(parent) = worktree_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                EngineError::Git(format!("Failed to create worktree directory: {}", e))
            })?;
        }

        if worktree_path.exists() {
            return Err(EngineError::Git(format!(
                "Worktree already exists at: {}",
                worktree_path.display()
            )));
        }

        if let Err(e) = run_git(repo_path, &["fetch", "origin", remote_branch]) {
            tracing::warn!("Git fetch warning for {}: {}", remote_branch, e);
        }

        let worktree_str = worktree_path
            .to_str()
            .ok_or_else(|| EngineError::Git("Non-UTF-8 worktree path".into()))?;

        let local_branches = self.list_branches(repo_path).unwrap_or_default();
        let result = if local_branches.iter().any(|b| b == remote_branch) {
            run_git(repo_path, &["worktree", "add", worktree_str, remote_branch])
        } else {
            let remote_ref = format!("origin/{}", remote_branch);
            run_git(
                repo_path,
                &[
                    "worktree",
                    "add",
                    "--track",
                    "-b",
                    remote_branch,
                    worktree_str,
                    &remote_ref,
                ],
            )
        };

        result.map_err(|e| {
            EngineError::Git(format!(
                "Failed to create worktree from remote branch `{}`: {}",
                remote_branch, e
            ))
        })?;

        tracing::info!(
            "Created worktree at {} tracking branch {}",
            worktree_path.display(),
            remote_branch
        );

        Ok(worktree_path)
    }

    /// Remove a git worktree
    ///
    /// # Arguments
    /// * `repo_path` - Path to the main git repository
    /// * `workspace_name` - Name of the workspace to remove (e.g., "aruni/pikachu")
    pub fn remove_worktree(
        &self,
        repo_path: &Path,
        workspace_name: &str,
        branch_name: &str,
        delete_remote_branch: bool,
    ) -> Result<()> {
        let worktree_path = self.get_worktree_path(workspace_name)?;

        if !worktree_path.exists() {
            tracing::warn!("Worktree does not exist: {}", worktree_path.display());
            return Ok(());
        }

        let worktree_str = worktree_path
            .to_str()
            .ok_or_else(|| EngineError::Git("Non-UTF-8 worktree path".into()))?;

        run_git(repo_path, &["worktree", "remove", "--force", worktree_str])?;

        // Delete local branch (non-fatal)
        if try_run_git(repo_path, &["branch", "-D", branch_name])?.is_some() {
            tracing::info!("Deleted local branch: {}", branch_name);
        }

        // Delete remote branch if configured (non-fatal)
        if delete_remote_branch {
            if let Some(_) = try_run_git(repo_path, &["push", "origin", "--delete", branch_name])? {
                tracing::info!("Deleted remote branch: origin/{}", branch_name);
            }
        }

        tracing::info!("Removed worktree for workspace {}", workspace_name);

        Ok(())
    }

    /// List all worktrees for a repository
    pub fn list_worktrees(&self, repo_path: &Path) -> Result<Vec<WorktreeInfo>> {
        let stdout = run_git(repo_path, &["worktree", "list", "--porcelain"])?;
        Ok(parse_worktree_list(&stdout))
    }
}
