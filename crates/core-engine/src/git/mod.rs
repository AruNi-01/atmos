//! Git operations for workspace management.

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::EngineError;

pub type Result<T> = std::result::Result<T, EngineError>;

/// Git engine for repository operations
pub struct GitEngine;

impl GitEngine {
    pub fn new() -> Self {
        Self
    }

    /// Get the atmos workspace base directory: ~/.atmos/workspaces
    pub fn get_workspaces_base_dir(&self) -> Result<PathBuf> {
        let home = dirs::home_dir()
            .ok_or_else(|| EngineError::Git("Unable to determine home directory".to_string()))?;
        Ok(home.join(".atmos").join("workspaces"))
    }

    /// Get the worktree path for a workspace: ~/.atmos/workspaces/{workspace_name}
    /// Note: workspace_name already includes the prefix (e.g., "aruni/pikachu")
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
        base_branch: &str,
    ) -> Result<PathBuf> {
        let worktree_path = self.get_worktree_path(workspace_name)?;

        // Ensure parent directory exists
        if let Some(parent) = worktree_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                EngineError::Git(format!("Failed to create worktree directory: {}", e))
            })?;
        }

        // Check if worktree already exists
        if worktree_path.exists() {
            return Err(EngineError::Git(format!(
                "Worktree already exists at: {}",
                worktree_path.display()
            )));
        }

        // Fetch latest from remote to ensure we have the base branch
        let fetch_output = Command::new("git")
            .current_dir(repo_path)
            .args(["fetch", "origin"])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to fetch from remote: {}", e)))?;

        if !fetch_output.status.success() {
            tracing::warn!(
                "Git fetch warning: {}",
                String::from_utf8_lossy(&fetch_output.stderr)
            );
        }

        // Create the worktree with a new branch based on the base branch
        // git worktree add -b <new_branch> <path> <base_branch>
        let output = Command::new("git")
            .current_dir(repo_path)
            .args([
                "worktree",
                "add",
                "-b",
                workspace_name,
                worktree_path.to_str().unwrap(),
                base_branch,
            ])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to create worktree: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(EngineError::Git(format!(
                "Failed to create worktree: {}",
                stderr
            )));
        }

        tracing::info!(
            "Created worktree at {} with branch {} (not pushed to remote yet)",
            worktree_path.display(),
            workspace_name
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
    ) -> Result<()> {
        let worktree_path = self.get_worktree_path(workspace_name)?;

        if !worktree_path.exists() {
            tracing::warn!("Worktree does not exist: {}", worktree_path.display());
            return Ok(());
        }

        // Remove the worktree using git
        let output = Command::new("git")
            .current_dir(repo_path)
            .args(["worktree", "remove", "--force", worktree_path.to_str().unwrap()])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to remove worktree: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(EngineError::Git(format!(
                "Failed to remove worktree: {}",
                stderr
            )));
        }

        // Optionally delete the branch
        let _ = Command::new("git")
            .current_dir(repo_path)
            .args(["branch", "-D", workspace_name])
            .output();

        tracing::info!("Removed worktree for workspace {}", workspace_name);

        Ok(())
    }

    /// List all worktrees for a repository
    pub fn list_worktrees(&self, repo_path: &Path) -> Result<Vec<WorktreeInfo>> {
        let output = Command::new("git")
            .current_dir(repo_path)
            .args(["worktree", "list", "--porcelain"])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to list worktrees: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(EngineError::Git(format!(
                "Failed to list worktrees: {}",
                stderr
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let worktrees = parse_worktree_list(&stdout);

        Ok(worktrees)
    }

    /// Get the default branch of a repository
    pub fn get_default_branch(&self, repo_path: &Path) -> Result<String> {
        // Try to get the default branch from remote
        let output = Command::new("git")
            .current_dir(repo_path)
            .args(["symbolic-ref", "refs/remotes/origin/HEAD", "--short"])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to get default branch: {}", e)))?;

        if output.status.success() {
            let branch = String::from_utf8_lossy(&output.stdout)
                .trim()
                .strip_prefix("origin/")
                .unwrap_or("main")
                .to_string();
            return Ok(branch);
        }

        // Fallback: read HEAD
        let head_output = Command::new("git")
            .current_dir(repo_path)
            .args(["rev-parse", "--abbrev-ref", "HEAD"])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to get HEAD: {}", e)))?;

        if head_output.status.success() {
            return Ok(String::from_utf8_lossy(&head_output.stdout)
                .trim()
                .to_string());
        }

        // Default fallback
        Ok("main".to_string())
    }

    /// Check the git status of a worktree/repository
    /// Returns information about uncommitted and unpushed changes
    pub fn get_git_status(&self, repo_path: &Path) -> Result<GitStatus> {
        // Use git status --porcelain to check for uncommitted changes
        let status_output = Command::new("git")
            .current_dir(repo_path)
            .args(["status", "--porcelain"])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to get git status: {}", e)))?;

        if !status_output.status.success() {
            let stderr = String::from_utf8_lossy(&status_output.stderr);
            return Err(EngineError::Git(format!("Failed to get git status: {}", stderr)));
        }

        let status_stdout = String::from_utf8_lossy(&status_output.stdout);
        let uncommitted_count = status_stdout.lines().filter(|l| !l.is_empty()).count() as u32;
        let has_uncommitted_changes = uncommitted_count > 0;

        // Use git rev-list @{u}..HEAD --count to check for unpushed commits
        let unpushed_output = Command::new("git")
            .current_dir(repo_path)
            .args(["rev-list", "@{u}..HEAD", "--count"])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to check unpushed commits: {}", e)))?;

        let (has_unpushed_commits, unpushed_count) = if unpushed_output.status.success() {
            let count_str = String::from_utf8_lossy(&unpushed_output.stdout);
            let count = count_str.trim().parse::<u32>().unwrap_or(0);
            (count > 0, count)
        } else {
            // No upstream configured, treat as no unpushed commits
            (false, 0)
        };

        Ok(GitStatus {
            has_uncommitted_changes,
            has_unpushed_commits,
            uncommitted_count,
            unpushed_count,
        })
    }
}

impl Default for GitEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Information about a git worktree
#[derive(Debug, Clone)]
pub struct WorktreeInfo {
    pub path: PathBuf,
    pub head: String,
    pub branch: Option<String>,
}

/// Git status information for a workspace
#[derive(Debug, Clone)]
pub struct GitStatus {
    pub has_uncommitted_changes: bool,
    pub has_unpushed_commits: bool,
    pub uncommitted_count: u32,
    pub unpushed_count: u32,
}

/// Parse the output of `git worktree list --porcelain`
fn parse_worktree_list(output: &str) -> Vec<WorktreeInfo> {
    let mut worktrees = Vec::new();
    let mut current_path: Option<PathBuf> = None;
    let mut current_head: Option<String> = None;
    let mut current_branch: Option<String> = None;

    for line in output.lines() {
        if line.starts_with("worktree ") {
            // Save previous worktree if exists
            if let (Some(path), Some(head)) = (current_path.take(), current_head.take()) {
                worktrees.push(WorktreeInfo {
                    path,
                    head,
                    branch: current_branch.take(),
                });
            }
            current_path = Some(PathBuf::from(line.strip_prefix("worktree ").unwrap()));
        } else if line.starts_with("HEAD ") {
            current_head = Some(line.strip_prefix("HEAD ").unwrap().to_string());
        } else if line.starts_with("branch ") {
            let branch = line.strip_prefix("branch refs/heads/").unwrap_or(
                line.strip_prefix("branch ").unwrap(),
            );
            current_branch = Some(branch.to_string());
        }
    }

    // Don't forget the last one
    if let (Some(path), Some(head)) = (current_path, current_head) {
        worktrees.push(WorktreeInfo {
            path,
            head,
            branch: current_branch,
        });
    }

    worktrees
}
