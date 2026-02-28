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

        // Check if worktree directory already exists
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
                "Failed to create worktree (likely branch conflict): {}",
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
    pub fn remove_worktree(&self, repo_path: &Path, workspace_name: &str) -> Result<()> {
        let worktree_path = self.get_worktree_path(workspace_name)?;

        if !worktree_path.exists() {
            tracing::warn!("Worktree does not exist: {}", worktree_path.display());
            return Ok(());
        }

        // Remove the worktree using git
        let output = Command::new("git")
            .current_dir(repo_path)
            .args([
                "worktree",
                "remove",
                "--force",
                worktree_path.to_str().unwrap(),
            ])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to remove worktree: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(EngineError::Git(format!(
                "Failed to remove worktree: {}",
                stderr
            )));
        }

        // Delete local branch
        let local_result = Command::new("git")
            .current_dir(repo_path)
            .args(["branch", "-D", workspace_name])
            .output();

        if local_result.is_ok() {
            tracing::info!("Deleted local branch: {}", workspace_name);
        }

        // Delete remote branch if exists
        let remote_result = Command::new("git")
            .current_dir(repo_path)
            .args(["push", "origin", "--delete", workspace_name])
            .output();

        if let Ok(output) = remote_result {
            if output.status.success() {
                tracing::info!("Deleted remote branch: origin/{}", workspace_name);
            }
        }

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
            .args(["status", "--porcelain", "-uall"])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to get git status: {}", e)))?;

        if !status_output.status.success() {
            let stderr = String::from_utf8_lossy(&status_output.stderr);
            return Err(EngineError::Git(format!(
                "Failed to get git status: {}",
                stderr
            )));
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

    /// Get the current branch name of a repository
    pub fn get_current_branch(&self, repo_path: &Path) -> Result<String> {
        let output = Command::new("git")
            .current_dir(repo_path)
            .args(["rev-parse", "--abbrev-ref", "HEAD"])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to get current branch: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(EngineError::Git(format!(
                "Failed to get current branch: {}",
                stderr
            )));
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    /// Get remote origin url
    pub fn get_remote_url(&self, repo_path: &Path) -> Result<String> {
        let output = Command::new("git")
            .current_dir(repo_path)
            .args(["config", "--get", "remote.origin.url"])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to get remote url: {}", e)))?;

        if !output.status.success() {
            return Ok(String::new());
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    /// Count commits between base and head (exclusive of base): git rev-list --count base..head
    pub fn get_commit_count(
        &self,
        repo_path: &Path,
        base_commit: &str,
        head_commit: &str,
    ) -> Result<u32> {
        let output = Command::new("git")
            .current_dir(repo_path)
            .args([
                "rev-list",
                "--count",
                &format!("{}..{}", base_commit, head_commit),
            ])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to get commit count: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(EngineError::Git(format!(
                "Failed to get commit count: {}",
                stderr
            )));
        }

        let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
        s.parse::<u32>()
            .map_err(|_| EngineError::Git("Invalid commit count".to_string()))
    }

    /// Get the current HEAD commit hash (full SHA)
    pub fn get_head_commit(&self, repo_path: &Path) -> Result<String> {
        let output = Command::new("git")
            .current_dir(repo_path)
            .args(["rev-parse", "HEAD"])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to get HEAD commit: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(EngineError::Git(format!(
                "Failed to get HEAD commit: {}",
                stderr
            )));
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    /// List only remote branches (origin) for a repository
    pub fn list_remote_branches(&self, repo_path: &Path) -> Result<Vec<String>> {
        let output = Command::new("git")
            .current_dir(repo_path)
            .args([
                "for-each-ref",
                "refs/remotes/origin",
                "--format=%(refname)",
            ])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to list remote branches: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(EngineError::Git(format!(
                "Failed to list remote branches: {}",
                stderr
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let branches = stdout
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty() && !l.ends_with("/HEAD"))
            .filter_map(|l| {
                // refs/remotes/origin/main -> main
                l.strip_prefix("refs/remotes/origin/")
                    .map(|s| s.to_string())
            })
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();

        Ok(branches)
    }

    /// List both local and remote branches for a repository
    pub fn list_branches(&self, repo_path: &Path) -> Result<Vec<String>> {
        let output = Command::new("git")
            .current_dir(repo_path)
            .args([
                "for-each-ref",
                "refs/heads",
                "refs/remotes/origin",
                "--format=%(refname)",
            ])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to list branches: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(EngineError::Git(format!(
                "Failed to list branches: {}",
                stderr
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let branches = stdout
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty() && !l.ends_with("/HEAD"))
            .filter_map(|l| {
                // refs/heads/main -> main
                // refs/remotes/origin/main -> main
                l.strip_prefix("refs/heads/")
                    .or_else(|| l.strip_prefix("refs/remotes/origin/"))
                    .map(|s| s.to_string())
            })
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();

        Ok(branches)
    }

    /// Rename a branch in a repository
    pub fn rename_branch(&self, repo_path: &Path, old_name: &str, new_name: &str) -> Result<()> {
        let output = Command::new("git")
            .current_dir(repo_path)
            .args(["branch", "-m", old_name, new_name])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to rename branch: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(EngineError::Git(format!(
                "Failed to rename branch: {}",
                stderr
            )));
        }

        Ok(())
    }

    /// Get list of changed files with additions and deletions count
    /// Categorizes files as staged, unstaged, or untracked
    pub fn get_changed_files(&self, repo_path: &Path) -> Result<ChangedFilesInfo> {
        // Get list of changed files with status
        let status_output = Command::new("git")
            .current_dir(repo_path)
            .args([
                "-c",
                "core.quotePath=false",
                "status",
                "--porcelain",
                "-uall",
            ])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to get git status: {}", e)))?;

        if !status_output.status.success() {
            let stderr = String::from_utf8_lossy(&status_output.stderr);
            return Err(EngineError::Git(format!(
                "Failed to get git status: {}",
                stderr
            )));
        }

        let status_stdout = String::from_utf8_lossy(&status_output.stdout);
        let mut staged_files: Vec<ChangedFileInfo> = Vec::new();
        let mut unstaged_files: Vec<ChangedFileInfo> = Vec::new();
        let mut untracked_files: Vec<ChangedFileInfo> = Vec::new();
        let mut total_additions = 0u32;
        let mut total_deletions = 0u32;

        for line in status_stdout.lines() {
            if line.len() < 3 {
                continue;
            }
            // XY format: X=index status, Y=worktree status
            let x = line.chars().next().unwrap_or(' ');
            let y = line.chars().nth(1).unwrap_or(' ');
            let file_path = Self::unquote_path(&line[3..]);

            // Get numstat for this specific file
            let (additions, deletions) = self.get_file_numstat(repo_path, &file_path);
            total_additions += additions;
            total_deletions += deletions;

            // Parse based on XY format:
            // X shows the status of the index (staged area)
            // Y shows the status of the work tree (unstaged/working directory)

            if x == '?' && y == '?' {
                // Untracked file
                untracked_files.push(ChangedFileInfo {
                    path: file_path,
                    status: "?".to_string(),
                    additions,
                    deletions,
                    staged: false,
                });
            } else {
                // Check for staged changes (X is not space and not ?)
                if x != ' ' && x != '?' {
                    let status = match x {
                        'M' => "M",
                        'A' => "A",
                        'D' => "D",
                        'R' => "R",
                        'C' => "C",
                        'U' => "U",
                        _ => "M",
                    }
                    .to_string();

                    staged_files.push(ChangedFileInfo {
                        path: file_path.clone(),
                        status,
                        additions,
                        deletions,
                        staged: true,
                    });
                }

                // Check for unstaged changes (Y is not space)
                if y != ' ' {
                    let status = match y {
                        'M' => "M",
                        'D' => "D",
                        'U' => "U",
                        _ => "M",
                    }
                    .to_string();

                    unstaged_files.push(ChangedFileInfo {
                        path: file_path,
                        status,
                        additions,
                        deletions,
                        staged: false,
                    });
                }
            }
        }

        Ok(ChangedFilesInfo {
            staged_files,
            unstaged_files,
            untracked_files,
            total_additions,
            total_deletions,
        })
    }

    /// Helper to unquote path from git output
    fn unquote_path(path: &str) -> String {
        if path.starts_with('"') && path.ends_with('"') {
            path[1..path.len() - 1]
                .replace("\\\"", "\"")
                .replace("\\\\", "\\")
        } else {
            path.to_string()
        }
    }

    /// Get numstat for a specific file
    fn get_file_numstat(&self, repo_path: &Path, file_path: &str) -> (u32, u32) {
        // Try to get diff numstat for tracked files
        let output = Command::new("git")
            .current_dir(repo_path)
            .args([
                "-c",
                "core.quotePath=false",
                "diff",
                "--numstat",
                "--",
                file_path,
            ])
            .output();

        if let Ok(output) = output {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Some(line) = stdout.lines().next() {
                    let parts: Vec<&str> = line.split('\t').collect();
                    if parts.len() >= 2 {
                        let additions = parts[0].parse::<u32>().unwrap_or(0);
                        let deletions = parts[1].parse::<u32>().unwrap_or(0);
                        return (additions, deletions);
                    }
                }
            }
        }

        // For untracked files, count the lines
        let full_path = repo_path.join(file_path);
        if full_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&full_path) {
                let line_count = content.lines().count() as u32;
                return (line_count, 0);
            }
        }

        (0, 0)
    }

    /// Get file diff content (old vs new)
    pub fn get_file_diff(&self, repo_path: &Path, file_path: &str) -> Result<FileDiffInfo> {
        // Determine file status first
        let status_output = Command::new("git")
            .current_dir(repo_path)
            .args([
                "-c",
                "core.quotePath=false",
                "status",
                "--porcelain",
                "--",
                file_path,
            ])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to get file status: {}", e)))?;

        let status_stdout = String::from_utf8_lossy(&status_output.stdout);
        let status = if let Some(line) = status_stdout.lines().next() {
            let code = &line[0..2];
            match code.trim() {
                "M" | " M" | "MM" => "M",
                "A" | " A" | "AM" => "A",
                "D" | " D" => "D",
                "??" => "A",
                _ => "M",
            }
            .to_string()
        } else {
            "M".to_string()
        };

        // Get old content (HEAD version)
        let old_content = if status == "A" {
            // New file, no old content
            String::new()
        } else {
            let output = Command::new("git")
                .current_dir(repo_path)
                .args(["show", &format!("HEAD:{}", file_path)])
                .output()
                .map_err(|e| EngineError::Git(format!("Failed to get old content: {}", e)))?;

            if output.status.success() {
                String::from_utf8_lossy(&output.stdout).to_string()
            } else {
                String::new()
            }
        };

        // Get new content (working directory version)
        let new_content = if status == "D" {
            // Deleted file, no new content
            String::new()
        } else {
            let full_path = repo_path.join(file_path);
            std::fs::read_to_string(&full_path).unwrap_or_default()
        };

        Ok(FileDiffInfo {
            file_path: file_path.to_string(),
            old_content,
            new_content,
            status,
        })
    }

    /// Commit all staged and unstaged changes
    pub fn commit_all(&self, repo_path: &Path, message: &str) -> Result<String> {
        // Stage all changes
        let add_output = Command::new("git")
            .current_dir(repo_path)
            .args(["add", "-A"])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to stage changes: {}", e)))?;

        if !add_output.status.success() {
            let stderr = String::from_utf8_lossy(&add_output.stderr);
            return Err(EngineError::Git(format!(
                "Failed to stage changes: {}",
                stderr
            )));
        }

        // Commit
        let commit_output = Command::new("git")
            .current_dir(repo_path)
            .args(["commit", "-m", message])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to commit: {}", e)))?;

        if !commit_output.status.success() {
            let stderr = String::from_utf8_lossy(&commit_output.stderr);
            return Err(EngineError::Git(format!("Failed to commit: {}", stderr)));
        }

        // Get commit hash
        let hash_output = Command::new("git")
            .current_dir(repo_path)
            .args(["rev-parse", "HEAD"])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to get commit hash: {}", e)))?;

        let hash = String::from_utf8_lossy(&hash_output.stdout)
            .trim()
            .to_string();
        tracing::info!("Committed changes with hash: {}", hash);
        Ok(hash)
    }

    /// Push to remote
    pub fn push(&self, repo_path: &Path) -> Result<()> {
        let output = Command::new("git")
            .current_dir(repo_path)
            .args(["push"])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to push: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);

            // Try push with set-upstream for new branches
            if stderr.contains("no upstream") || stderr.contains("set-upstream") {
                let branch = self.get_current_branch(repo_path)?;
                let upstream_output = Command::new("git")
                    .current_dir(repo_path)
                    .args(["push", "--set-upstream", "origin", &branch])
                    .output()
                    .map_err(|e| {
                        EngineError::Git(format!("Failed to push with upstream: {}", e))
                    })?;

                if !upstream_output.status.success() {
                    let stderr = String::from_utf8_lossy(&upstream_output.stderr);
                    return Err(EngineError::Git(format!("Failed to push: {}", stderr)));
                }
            } else {
                return Err(EngineError::Git(format!("Failed to push: {}", stderr)));
            }
        }

        tracing::info!("Pushed changes to remote");
        Ok(())
    }

    /// Stage specific files
    pub fn stage_files(&self, repo_path: &Path, paths: &[String]) -> Result<()> {
        if paths.is_empty() {
            return Ok(());
        }

        let mut args = vec!["add", "--"];
        let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
        args.extend(path_refs);

        let output = Command::new("git")
            .current_dir(repo_path)
            .args(&args)
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to stage files: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(EngineError::Git(format!(
                "Failed to stage files: {}",
                stderr
            )));
        }

        tracing::info!("Staged {} files", paths.len());
        Ok(())
    }

    /// Unstage specific files from staged area
    pub fn unstage_files(&self, repo_path: &Path, paths: &[String]) -> Result<()> {
        if paths.is_empty() {
            return Ok(());
        }

        let mut args = vec!["reset", "HEAD", "--"];
        let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
        args.extend(path_refs);

        let output = Command::new("git")
            .current_dir(repo_path)
            .args(&args)
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to unstage files: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(EngineError::Git(format!(
                "Failed to unstage files: {}",
                stderr
            )));
        }

        tracing::info!("Unstaged {} files", paths.len());
        Ok(())
    }

    /// Discard changes to unstaged files (restore to HEAD)
    pub fn discard_unstaged(&self, repo_path: &Path, paths: &[String]) -> Result<()> {
        if paths.is_empty() {
            return Ok(());
        }

        let mut args = vec!["checkout", "--"];
        let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
        args.extend(path_refs);

        let output = Command::new("git")
            .current_dir(repo_path)
            .args(&args)
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to discard changes: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(EngineError::Git(format!(
                "Failed to discard changes: {}",
                stderr
            )));
        }

        tracing::info!("Discarded changes to {} files", paths.len());
        Ok(())
    }

    /// Discard untracked files
    pub fn discard_untracked(&self, repo_path: &Path, paths: &[String]) -> Result<()> {
        if paths.is_empty() {
            return Ok(());
        }

        for path in paths {
            let full_path = repo_path.join(path);
            if full_path.exists() {
                if full_path.is_dir() {
                    std::fs::remove_dir_all(&full_path).map_err(|e| {
                        EngineError::Git(format!("Failed to remove directory {}: {}", path, e))
                    })?;
                } else {
                    std::fs::remove_file(&full_path).map_err(|e| {
                        EngineError::Git(format!("Failed to remove file {}: {}", path, e))
                    })?;
                }
            }
        }

        tracing::info!("Removed {} untracked files", paths.len());
        Ok(())
    }

    /// Check if the current branch has been published to remote
    pub fn is_branch_published(&self, repo_path: &Path) -> Result<bool> {
        let branch = self.get_current_branch(repo_path)?;

        // Check if remote tracking branch exists
        let output = Command::new("git")
            .current_dir(repo_path)
            .args(["rev-parse", "--verify", &format!("origin/{}", branch)])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to check remote branch: {}", e)))?;

        Ok(output.status.success())
    }

    /// Pull from remote
    pub fn pull(&self, repo_path: &Path) -> Result<()> {
        let output = Command::new("git")
            .current_dir(repo_path)
            .args(["pull"])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to pull: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(EngineError::Git(format!("Failed to pull: {}", stderr)));
        }

        tracing::info!("Pulled from remote");
        Ok(())
    }

    /// Fetch from remote
    pub fn fetch(&self, repo_path: &Path) -> Result<()> {
        let output = Command::new("git")
            .current_dir(repo_path)
            .args(["fetch", "origin"])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to fetch: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(EngineError::Git(format!("Failed to fetch: {}", stderr)));
        }

        tracing::info!("Fetched from remote");
        Ok(())
    }

    /// Sync (fetch + pull)
    pub fn sync(&self, repo_path: &Path) -> Result<()> {
        self.fetch(repo_path)?;
        self.pull(repo_path)?;
        Ok(())
    }

    /// Get commit log for the current branch (paginated)
    pub fn get_commit_log(&self, repo_path: &Path, limit: usize, offset: usize) -> Result<Vec<CommitInfo>> {
        // Check if there is an upstream branch
        let upstream_exists = Command::new("git")
            .current_dir(repo_path)
            .args(["rev-parse", "--abbrev-ref", "@{u}"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        let mut all_commits = Vec::new();

        if upstream_exists {
            // First page: prepend ALL unpushed commits
            if offset == 0 {
                let unpushed = self.fetch_raw_commits(repo_path, "@{u}..HEAD", 0, 100, false)?;
                all_commits.extend(unpushed);
            }

            // Fetch current page of PUSHED commits
            // We fetch from the upstream branch directly to ensure pagination index aligns with GitHub API
            let pushed = self.fetch_raw_commits(repo_path, "@{u}", offset, limit, true)?;
            all_commits.extend(pushed);
        } else {
            // No upstream: fetch everything locally, everything is marking as unpushed
            let local = self.fetch_raw_commits(repo_path, "HEAD", offset, limit, false)?;
            all_commits.extend(local);
        }

        // Try to enrich with GitHub avatars if gh-cli is available
        // GitHub API only knows about pushed commits on the server.
        if let Ok(repo_info) = self.get_github_repo_info(repo_path) {
            // Mapping: GitHub API's "pushed" page directly matches our pushed-only offset
            if let Ok(avatars) = self.fetch_github_avatars(repo_path, &repo_info, offset) {
                for commit in &mut all_commits {
                    if commit.is_pushed {
                        if let Some(avatar_url) = avatars.get(&commit.hash) {
                            commit.author_avatar_url = Some(avatar_url.clone());
                        }
                    }
                }
            }
        }

        Ok(all_commits)
    }

    fn fetch_raw_commits(
        &self,
        repo_path: &Path,
        rev_range: &str,
        skip: usize,
        limit: usize,
        is_pushed: bool,
    ) -> Result<Vec<CommitInfo>> {
        let separator = "\x1f"; // unit separator
        let record_sep = "\x1e"; // record separator
        let format = format!(
            "--format={}%H{}%an{}%ae{}%at{}%s{}%b{}",
            record_sep, separator, separator, separator, separator, separator, separator
        );

        let output = Command::new("git")
            .current_dir(repo_path)
            .args([
                "log",
                &format,
                &format!("--skip={}", skip),
                &format!("-n{}", limit),
                rev_range,
            ])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to fetch raw commits for {}: {}", rev_range, e)))?;

        if !output.status.success() {
            // If the range is empty (e.g. @{u}..HEAD when identical), it might return success or harmless error
            return Ok(Vec::new());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut result = Vec::new();

        for block in stdout.split(record_sep) {
            let block = block.trim();
            if block.is_empty() {
                continue;
            }
            let parts: Vec<&str> = block.splitn(7, separator).collect();
            if parts.len() < 6 {
                continue;
            }
            let hash = parts[0].trim().to_string();
            let author_name = parts[1].trim().to_string();
            let author_email = parts[2].trim().to_string();
            let timestamp: i64 = parts[3].trim().parse().unwrap_or(0);
            let subject = parts[4].trim().to_string();
            let body = if parts.len() > 5 { parts[5].trim().to_string() } else { String::new() };

            if hash.is_empty() || hash.len() < 7 {
                continue;
            }

            result.push(CommitInfo {
                short_hash: hash[..7].to_string(),
                hash,
                author_name,
                author_email,
                timestamp,
                subject,
                body,
                is_pushed,
                author_avatar_url: None,
            });
        }
        Ok(result)
    }

    fn get_github_repo_info(&self, path: &Path) -> Result<String> {
        // First check if the remote URL actually contains github.com
        let remote_output = Command::new("git")
            .current_dir(path)
            .args(["remote", "get-url", "origin"])
            .output()
            .map_err(|e| EngineError::Git(format!("Failed to get remote URL: {}", e)))?;

        if !remote_output.status.success() {
            return Err(EngineError::Git("No remote origin found".to_string()));
        }

        let remote_url = String::from_utf8_lossy(&remote_output.stdout);
        if !remote_url.contains("github.com") {
            return Err(EngineError::Git("Not a GitHub repository".to_string()));
        }

        let output = Command::new("gh")
            .current_dir(path)
            .args(["repo", "view", "--json", "owner,name", "--template", "{{.owner.login}}/{{.name}}"])
            .output()
            .map_err(|e| EngineError::Git(format!("gh-cli not found: {}", e)))?;

        if !output.status.success() {
            return Err(EngineError::Git("gh-cli error or not authenticated".to_string()));
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    fn fetch_github_avatars(
        &self,
        path: &Path,
        repo_info: &str,
        offset: usize,
    ) -> Result<std::collections::HashMap<String, String>> {
        // Since we are now fetching pushed commits from @{u} directly,
        // our 'offset' corresponds 1:1 with GitHub's commit ordering.
        let gh_limit = 100;
        let page = (offset / gh_limit) + 1;
        
        let url = format!("repos/{}/commits?per_page={}&page={}", repo_info, gh_limit, page);
        let output = Command::new("gh")
            .current_dir(path)
            .args([
                "api",
                &url,
                "--jq",
                // Fallback from author to committer if author is null
                ".[] | {sha: .sha, avatar: (.author.avatar_url // .committer.avatar_url)}",
            ])
            .output()
            .map_err(|e| EngineError::Git(format!("gh api failed: {}", e)))?;

        if !output.status.success() {
            return Err(EngineError::Git("gh api error".to_string()));
        }

        let mut avatars = std::collections::HashMap::new();
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
                if let (Some(sha), Some(avatar)) = (val["sha"].as_str(), val["avatar"].as_str()) {
                    avatars.insert(sha.to_string(), avatar.to_string());
                }
            }
        }
        Ok(avatars)
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

/// Information about a changed file
#[derive(Debug, Clone)]
pub struct ChangedFileInfo {
    pub path: String,
    pub status: String,
    pub additions: u32,
    pub deletions: u32,
    /// Whether the file is staged (in index)
    pub staged: bool,
}

/// Aggregate information about all changed files
#[derive(Debug, Clone)]
pub struct ChangedFilesInfo {
    /// Files staged for commit
    pub staged_files: Vec<ChangedFileInfo>,
    /// Files with unstaged modifications
    pub unstaged_files: Vec<ChangedFileInfo>,
    /// Untracked files
    pub untracked_files: Vec<ChangedFileInfo>,
    pub total_additions: u32,
    pub total_deletions: u32,
}

/// File diff information with old and new content
#[derive(Debug, Clone)]
pub struct FileDiffInfo {
    pub file_path: String,
    pub old_content: String,
    pub new_content: String,
    pub status: String,
}

/// Information about a single git commit
#[derive(Debug, Clone)]
pub struct CommitInfo {
    /// Full commit hash (40 chars)
    pub hash: String,
    /// Short hash (7 chars)
    pub short_hash: String,
    /// Author display name
    pub author_name: String,
    /// Author email
    pub author_email: String,
    /// Unix timestamp of the commit
    pub timestamp: i64,
    /// Commit subject (first line of message)
    pub subject: String,
    /// Commit body (rest of message, may be empty)
    pub body: String,
    /// Whether this commit has been pushed to the remote tracking branch
    pub is_pushed: bool,
    /// URL to the author's avatar (e.g. from GitHub)
    pub author_avatar_url: Option<String>,
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
            let branch = line
                .strip_prefix("branch refs/heads/")
                .unwrap_or(line.strip_prefix("branch ").unwrap());
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
