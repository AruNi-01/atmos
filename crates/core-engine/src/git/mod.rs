//! Git operations for workspace management.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

use crate::error::{EngineError, Result};

/// Run a git command in the given repo directory and return stdout on success.
fn run_git(repo_path: &Path, args: &[&str]) -> Result<String> {
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(args)
        .output()
        .map_err(|e| {
            EngineError::Git(format!(
                "Failed to execute git {}: {}",
                args.first().unwrap_or(&""),
                e
            ))
        })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(EngineError::Git(format!(
            "git {} failed: {}",
            args.first().unwrap_or(&""),
            stderr
        )));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Like `run_git` but returns Ok(None) instead of Err on non-zero exit.
fn try_run_git(repo_path: &Path, args: &[&str]) -> Result<Option<String>> {
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(args)
        .output()
        .map_err(|e| {
            EngineError::Git(format!(
                "Failed to execute git {}: {}",
                args.first().unwrap_or(&""),
                e
            ))
        })?;
    if output.status.success() {
        Ok(Some(String::from_utf8_lossy(&output.stdout).to_string()))
    } else {
        Ok(None)
    }
}

/// Like `try_run_git` but also returns stderr on failure.
fn try_run_git_with_stderr(
    repo_path: &Path,
    args: &[&str],
) -> Result<std::result::Result<String, String>> {
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(args)
        .output()
        .map_err(|e| {
            EngineError::Git(format!(
                "Failed to execute git {}: {}",
                args.first().unwrap_or(&""),
                e
            ))
        })?;
    if output.status.success() {
        Ok(Ok(String::from_utf8_lossy(&output.stdout).to_string()))
    } else {
        Ok(Err(String::from_utf8_lossy(&output.stderr).to_string()))
    }
}

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

    fn resolve_remote_branch_ref(&self, repo_path: &Path, base_branch: &str) -> Result<String> {
        let normalized = base_branch.trim().trim_start_matches("origin/");
        if normalized.is_empty() {
            return Err(EngineError::Git("Base branch cannot be empty".to_string()));
        }

        let remote_branches = self.list_remote_branches(repo_path)?;
        if remote_branches.iter().any(|branch| branch == normalized) {
            return Ok(format!("origin/{}", normalized));
        }

        Err(EngineError::Git(format!(
            "Remote branch origin/{} does not exist",
            normalized
        )))
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

        // Delete remote branch if exists (non-fatal)
        if let Some(_) = try_run_git(repo_path, &["push", "origin", "--delete", branch_name])? {
            tracing::info!("Deleted remote branch: origin/{}", branch_name);
        }

        tracing::info!("Removed worktree for workspace {}", workspace_name);

        Ok(())
    }

    /// List all worktrees for a repository
    pub fn list_worktrees(&self, repo_path: &Path) -> Result<Vec<WorktreeInfo>> {
        let stdout = run_git(repo_path, &["worktree", "list", "--porcelain"])?;
        Ok(parse_worktree_list(&stdout))
    }

    /// Get the default branch of a repository from locally available refs only.
    pub fn get_default_branch(&self, repo_path: &Path) -> Result<Option<String>> {
        // 1. Try origin/HEAD symbolic ref (set by git clone)
        if let Some(stdout) = try_run_git(
            repo_path,
            &["symbolic-ref", "refs/remotes/origin/HEAD", "--short"],
        )? {
            let branch = stdout
                .trim()
                .strip_prefix("origin/")
                .unwrap_or(stdout.trim());
            if !branch.is_empty() {
                return Ok(Some(branch.to_string()));
            }
        }

        // 2. Prefer well-known default branches if we already have the remote refs locally.
        if let Ok(branches) = self.list_remote_branches(repo_path) {
            for candidate in &["main", "master"] {
                if branches.iter().any(|b| b == candidate) {
                    return Ok(Some(candidate.to_string()));
                }
            }
        }

        // 3. Fall back to well-known local branches.
        if let Some(stdout) = try_run_git(
            repo_path,
            &[
                "for-each-ref",
                "refs/heads/main",
                "refs/heads/master",
                "--format=%(refname:short)",
            ],
        )? {
            if let Some(branch) = stdout
                .lines()
                .map(str::trim)
                .find(|branch| !branch.is_empty())
            {
                return Ok(Some(branch.to_string()));
            }
        }

        // 4. Last resort: whatever local HEAD points to, if not detached.
        if let Some(stdout) = try_run_git(repo_path, &["symbolic-ref", "--short", "HEAD"])? {
            let branch = stdout.trim();
            if !branch.is_empty() && branch != "HEAD" {
                return Ok(Some(branch.to_string()));
            }
        }

        Ok(None)
    }

    /// Get the remote default branch from locally available origin refs only.
    pub fn get_remote_default_branch(&self, repo_path: &Path) -> Result<Option<String>> {
        // 1. Try origin/HEAD symbolic ref (set by git clone)
        if let Some(stdout) = try_run_git(
            repo_path,
            &["symbolic-ref", "refs/remotes/origin/HEAD", "--short"],
        )? {
            let branch = stdout
                .trim()
                .strip_prefix("origin/")
                .unwrap_or(stdout.trim());
            if !branch.is_empty() {
                return Ok(Some(branch.to_string()));
            }
        }

        // 2. Fall back to common remote default branches if we already have them locally.
        if let Ok(branches) = self.list_remote_branches(repo_path) {
            for candidate in &["main", "master"] {
                if branches.iter().any(|b| b == candidate) {
                    return Ok(Some(candidate.to_string()));
                }
            }
        }

        Ok(None)
    }

    /// Compare `head_ref` with `base_ref` and return `(ahead, behind)` for the head ref.
    fn get_branch_divergence(
        &self,
        repo_path: &Path,
        base_ref: &str,
        head_ref: &str,
    ) -> Result<Option<(u32, u32)>> {
        let range = format!("{}...{}", base_ref, head_ref);
        let Some(stdout) =
            try_run_git(repo_path, &["rev-list", "--left-right", "--count", &range])?
        else {
            return Ok(None);
        };

        let mut counts = stdout.split_whitespace();
        let behind = counts
            .next()
            .ok_or_else(|| EngineError::Git("Missing behind count".to_string()))?
            .parse::<u32>()
            .map_err(|_| EngineError::Git("Invalid behind count".to_string()))?;
        let ahead = counts
            .next()
            .ok_or_else(|| EngineError::Git("Missing ahead count".to_string()))?
            .parse::<u32>()
            .map_err(|_| EngineError::Git("Invalid ahead count".to_string()))?;

        Ok(Some((ahead, behind)))
    }

    /// Check the git status of a worktree/repository
    pub fn get_git_status(&self, repo_path: &Path) -> Result<GitStatus> {
        let status_stdout = run_git(repo_path, &["status", "--porcelain", "-uall"])?;
        let uncommitted_count = status_stdout.lines().filter(|l| !l.is_empty()).count() as u32;
        let has_uncommitted_changes = uncommitted_count > 0;

        let (has_unpushed_commits, unpushed_count) =
            match try_run_git(repo_path, &["rev-list", "@{u}..HEAD", "--count"])? {
                Some(count_str) => {
                    let count = count_str.trim().parse::<u32>().unwrap_or(0);
                    (count > 0, count)
                }
                None => (false, 0),
            };

        let default_branch = self.get_remote_default_branch(repo_path)?;
        let (default_branch_ahead, default_branch_behind) =
            if let Some(branch) = default_branch.as_deref() {
                let default_branch_ref = format!("origin/{}", branch);
                match self.get_branch_divergence(repo_path, &default_branch_ref, "HEAD")? {
                    Some((ahead, behind)) => (Some(ahead), Some(behind)),
                    None => (None, None),
                }
            } else {
                (None, None)
            };

        Ok(GitStatus {
            has_uncommitted_changes,
            has_unpushed_commits,
            uncommitted_count,
            unpushed_count,
            default_branch,
            default_branch_ahead,
            default_branch_behind,
        })
    }

    /// Get the current branch name of a repository
    pub fn get_current_branch(&self, repo_path: &Path) -> Result<String> {
        let stdout = run_git(repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])?;
        Ok(stdout.trim().to_string())
    }

    /// Get remote origin url
    pub fn get_remote_url(&self, repo_path: &Path) -> Result<String> {
        match try_run_git(repo_path, &["config", "--get", "remote.origin.url"])? {
            Some(stdout) => Ok(stdout.trim().to_string()),
            None => Ok(String::new()),
        }
    }

    /// Count commits between base and head (exclusive of base)
    pub fn get_commit_count(
        &self,
        repo_path: &Path,
        base_commit: &str,
        head_commit: &str,
    ) -> Result<u32> {
        let range = format!("{}..{}", base_commit, head_commit);
        let stdout = run_git(repo_path, &["rev-list", "--count", &range])?;
        stdout
            .trim()
            .parse::<u32>()
            .map_err(|_| EngineError::Git("Invalid commit count".to_string()))
    }

    /// Get the current HEAD commit hash (full SHA)
    pub fn get_head_commit(&self, repo_path: &Path) -> Result<String> {
        let stdout = run_git(repo_path, &["rev-parse", "HEAD"])?;
        Ok(stdout.trim().to_string())
    }

    /// List only remote branches (origin) for a repository
    pub fn list_remote_branches(&self, repo_path: &Path) -> Result<Vec<String>> {
        let stdout = run_git(
            repo_path,
            &["for-each-ref", "refs/remotes/origin", "--format=%(refname)"],
        )?;

        let mut branches: Vec<String> = stdout
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty() && !l.ends_with("/HEAD"))
            .filter_map(|l| {
                l.strip_prefix("refs/remotes/origin/")
                    .map(|s| s.to_string())
            })
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();
        branches.sort();

        Ok(branches)
    }

    /// List both local and remote branches for a repository
    pub fn list_branches(&self, repo_path: &Path) -> Result<Vec<String>> {
        let stdout = run_git(
            repo_path,
            &[
                "for-each-ref",
                "refs/heads",
                "refs/remotes/origin",
                "--format=%(refname)",
            ],
        )?;

        let mut branches: Vec<String> = stdout
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty() && !l.ends_with("/HEAD"))
            .filter_map(|l| {
                l.strip_prefix("refs/heads/")
                    .or_else(|| l.strip_prefix("refs/remotes/origin/"))
                    .map(|s| s.to_string())
            })
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();
        branches.sort();

        Ok(branches)
    }

    /// Rename a branch in a repository
    pub fn rename_branch(&self, repo_path: &Path, old_name: &str, new_name: &str) -> Result<()> {
        run_git(repo_path, &["branch", "-m", old_name, new_name])?;
        Ok(())
    }

    /// Get list of changed files with additions and deletions count
    /// Categorizes files as staged, unstaged, or untracked
    pub fn get_changed_files(
        &self,
        repo_path: &Path,
        base_branch: Option<&str>,
    ) -> Result<ChangedFilesInfo> {
        let status_stdout = run_git(
            repo_path,
            &[
                "-c",
                "core.quotePath=false",
                "status",
                "--porcelain",
                "-uall",
            ],
        )?;

        let compare_numstat =
            if let Some(base_branch) = base_branch.filter(|value| !value.trim().is_empty()) {
                let base_ref = self.resolve_remote_branch_ref(repo_path, base_branch)?;
                Some(Self::build_numstat_map(
                    try_run_git(
                        repo_path,
                        &["-c", "core.quotePath=false", "diff", "--numstat", &base_ref],
                    )?
                    .as_deref(),
                ))
            } else {
                None
            };

        let (staged_numstat, unstaged_numstat) = if let Some(compare_numstat) = compare_numstat {
            (compare_numstat, HashMap::new())
        } else {
            (
                Self::build_numstat_map(
                    try_run_git(
                        repo_path,
                        &[
                            "-c",
                            "core.quotePath=false",
                            "diff",
                            "--cached",
                            "--numstat",
                        ],
                    )?
                    .as_deref(),
                ),
                Self::build_numstat_map(
                    try_run_git(
                        repo_path,
                        &["-c", "core.quotePath=false", "diff", "--numstat"],
                    )?
                    .as_deref(),
                ),
            )
        };

        let is_base_branch_mode = base_branch.filter(|v| !v.trim().is_empty()).is_some();
        let mut staged_files: Vec<ChangedFileInfo> = Vec::new();
        let mut unstaged_files: Vec<ChangedFileInfo> = Vec::new();
        let mut untracked_files: Vec<ChangedFileInfo> = Vec::new();
        let mut total_additions = 0u32;
        let mut total_deletions = 0u32;
        let mut seen_in_base_mode: HashSet<String> = HashSet::new();

        for line in status_stdout.lines() {
            if line.len() < 3 {
                continue;
            }
            let x = line.chars().next().unwrap_or(' ');
            let y = line.chars().nth(1).unwrap_or(' ');
            let file_path = Self::unquote_path(&line[3..]);

            if x == '?' && y == '?' {
                // Untracked file – count lines as additions
                let additions = Self::count_file_lines(repo_path, &file_path);
                total_additions += additions;
                untracked_files.push(ChangedFileInfo {
                    path: file_path,
                    status: "?".to_string(),
                    additions,
                    deletions: 0,
                    staged: false,
                });
            } else if is_base_branch_mode {
                // In base-branch mode, emit each file exactly once using
                // the unified diff stats against the base branch.
                if seen_in_base_mode.insert(file_path.clone()) {
                    let (additions, deletions) =
                        staged_numstat.get(&file_path).copied().unwrap_or((0, 0));
                    total_additions += additions;
                    total_deletions += deletions;

                    let status_char = if x != ' ' && x != '?' { x } else { y };
                    let status = match status_char {
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
                        path: file_path,
                        status,
                        additions,
                        deletions,
                        staged: true,
                    });
                }
            } else {
                // Staged changes (X is not space and not ?)
                if x != ' ' && x != '?' {
                    let (additions, deletions) =
                        staged_numstat.get(&file_path).copied().unwrap_or((0, 0));
                    total_additions += additions;
                    total_deletions += deletions;

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

                // Unstaged changes (Y is not space)
                if y != ' ' {
                    let (additions, deletions) =
                        unstaged_numstat.get(&file_path).copied().unwrap_or((0, 0));
                    total_additions += additions;
                    total_deletions += deletions;

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

    /// Parse `git diff --numstat` output into a map of file_path → (additions, deletions).
    fn build_numstat_map(output: Option<&str>) -> HashMap<String, (u32, u32)> {
        let Some(output) = output else {
            return HashMap::new();
        };
        output
            .lines()
            .filter_map(|line| {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 3 {
                    let additions = parts[0].parse().unwrap_or(0);
                    let deletions = parts[1].parse().unwrap_or(0);
                    Some((parts[2].to_string(), (additions, deletions)))
                } else {
                    None
                }
            })
            .collect()
    }

    /// Count lines in a file (used for untracked file additions count).
    fn count_file_lines(repo_path: &Path, file_path: &str) -> u32 {
        let full_path = repo_path.join(file_path);
        if full_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&full_path) {
                return content.lines().count() as u32;
            }
        }
        0
    }

    /// Helper to unquote path from git output, handling common escape sequences.
    fn unquote_path(path: &str) -> String {
        if path.starts_with('"') && path.ends_with('"') {
            let inner = &path[1..path.len() - 1];
            let mut result = String::with_capacity(inner.len());
            let mut chars = inner.chars();
            while let Some(c) = chars.next() {
                if c == '\\' {
                    match chars.next() {
                        Some('"') => result.push('"'),
                        Some('\\') => result.push('\\'),
                        Some('n') => result.push('\n'),
                        Some('t') => result.push('\t'),
                        Some(other) => {
                            result.push('\\');
                            result.push(other);
                        }
                        None => result.push('\\'),
                    }
                } else {
                    result.push(c);
                }
            }
            result
        } else {
            path.to_string()
        }
    }

    /// Get file diff content (old vs new)
    pub fn get_file_diff(
        &self,
        repo_path: &Path,
        file_path: &str,
        base_branch: Option<&str>,
    ) -> Result<FileDiffInfo> {
        let status_stdout = run_git(
            repo_path,
            &[
                "-c",
                "core.quotePath=false",
                "status",
                "--porcelain",
                "--",
                file_path,
            ],
        )?;

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

        let old_content = if status == "A" {
            String::new()
        } else {
            let show_ref =
                if let Some(base_branch) = base_branch.filter(|value| !value.trim().is_empty()) {
                    let base_ref = self.resolve_remote_branch_ref(repo_path, base_branch)?;
                    format!("{}:{}", base_ref, file_path)
                } else {
                    format!("HEAD:{}", file_path)
                };
            try_run_git(repo_path, &["show", &show_ref])?.unwrap_or_default()
        };

        let new_content = if status == "D" {
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
        run_git(repo_path, &["add", "-A"])?;
        run_git(repo_path, &["commit", "-m", message])?;
        let hash_stdout = run_git(repo_path, &["rev-parse", "HEAD"])?;
        let hash = hash_stdout.trim().to_string();
        tracing::info!("Committed changes with hash: {}", hash);
        Ok(hash)
    }

    /// Push to remote
    pub fn push(&self, repo_path: &Path) -> Result<()> {
        match try_run_git_with_stderr(repo_path, &["push"])? {
            Ok(_) => {
                tracing::info!("Pushed changes to remote");
                Ok(())
            }
            Err(stderr) => {
                if stderr.contains("no upstream")
                    || stderr.contains("set-upstream")
                    || stderr.contains("does not match")
                {
                    let branch = self.get_current_branch(repo_path)?;
                    run_git(repo_path, &["push", "--set-upstream", "origin", &branch])?;
                    tracing::info!("Pushed changes to remote (with set-upstream)");
                    Ok(())
                } else {
                    Err(EngineError::Git(format!("Failed to push: {}", stderr)))
                }
            }
        }
    }

    /// Stage specific files
    pub fn stage_files(&self, repo_path: &Path, paths: &[String]) -> Result<()> {
        if paths.is_empty() {
            return Ok(());
        }

        let mut args = vec!["add", "--"];
        let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
        args.extend(path_refs);

        run_git(repo_path, &args)?;

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

        run_git(repo_path, &args)?;

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

        run_git(repo_path, &args)?;

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
        let remote_ref = format!("origin/{}", branch);
        Ok(try_run_git(repo_path, &["rev-parse", "--verify", &remote_ref])?.is_some())
    }

    /// Pull from remote
    pub fn pull(&self, repo_path: &Path) -> Result<()> {
        run_git(repo_path, &["pull"])?;
        tracing::info!("Pulled from remote");
        Ok(())
    }

    /// Fetch from remote
    pub fn fetch(&self, repo_path: &Path) -> Result<()> {
        run_git(repo_path, &["fetch", "origin"])?;
        tracing::info!("Fetched from remote");
        Ok(())
    }

    /// Sync local and remote branch state.
    ///
    /// For published branches, this pulls remote changes first and then pushes
    /// local commits so both sides end up aligned. For unpublished branches,
    /// this falls back to push, which publishes the branch.
    pub fn sync(&self, repo_path: &Path) -> Result<()> {
        if self.is_branch_published(repo_path)? {
            self.pull(repo_path)?;
        }
        self.push(repo_path)?;
        Ok(())
    }

    /// Get commit log for the current branch (paginated)
    pub fn get_commit_log(
        &self,
        repo_path: &Path,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<CommitInfo>> {
        let upstream_exists =
            try_run_git(repo_path, &["rev-parse", "--abbrev-ref", "@{u}"])?.is_some();

        let mut all_commits = Vec::new();

        if upstream_exists {
            if offset == 0 {
                let unpushed = self.fetch_raw_commits(repo_path, "@{u}..HEAD", 0, 100, false)?;
                all_commits.extend(unpushed);
            }

            let pushed = self.fetch_raw_commits(repo_path, "@{u}", offset, limit, true)?;
            all_commits.extend(pushed);
        } else {
            let local = self.fetch_raw_commits(repo_path, "HEAD", offset, limit, false)?;
            all_commits.extend(local);
        }

        if let Ok(repo_info) = self.get_github_repo_info(repo_path) {
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
        let separator = "\x1f";
        let record_sep = "\x1e";
        let format = format!(
            "--format={}%H{}%an{}%ae{}%at{}%s{}%b{}",
            record_sep, separator, separator, separator, separator, separator, separator
        );

        let skip_arg = format!("--skip={}", skip);
        let limit_arg = format!("-n{}", limit);
        let stdout = match try_run_git(
            repo_path,
            &["log", &format, &skip_arg, &limit_arg, rev_range],
        )? {
            Some(s) => s,
            None => return Ok(Vec::new()),
        };

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
            let body = if parts.len() > 5 {
                parts[5].trim().to_string()
            } else {
                String::new()
            };

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
        let remote_url = run_git(path, &["remote", "get-url", "origin"])?;

        if !remote_url.contains("github.com") {
            return Err(EngineError::Git("Not a GitHub repository".to_string()));
        }

        let output = Command::new("gh")
            .current_dir(path)
            .args([
                "repo",
                "view",
                "--json",
                "owner,name",
                "--template",
                "{{.owner.login}}/{{.name}}",
            ])
            .output()
            .map_err(|e| EngineError::Git(format!("gh-cli not found: {}", e)))?;

        if !output.status.success() {
            return Err(EngineError::Git(
                "gh-cli error or not authenticated".to_string(),
            ));
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    fn fetch_github_avatars(
        &self,
        path: &Path,
        repo_info: &str,
        offset: usize,
    ) -> Result<HashMap<String, String>> {
        let gh_limit = 100;
        let page = (offset / gh_limit) + 1;

        let url = format!(
            "repos/{}/commits?per_page={}&page={}",
            repo_info, gh_limit, page
        );
        let output = Command::new("gh")
            .current_dir(path)
            .args([
                "api",
                &url,
                "--jq",
                ".[] | {sha: .sha, avatar: (.author.avatar_url // .committer.avatar_url)}",
            ])
            .output()
            .map_err(|e| EngineError::Git(format!("gh api failed: {}", e)))?;

        if !output.status.success() {
            return Err(EngineError::Git("gh api error".to_string()));
        }

        let mut avatars = HashMap::new();
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
#[derive(Debug, Clone, Serialize)]
pub struct WorktreeInfo {
    pub path: PathBuf,
    pub head: String,
    pub branch: Option<String>,
}

/// Git status information for a workspace
#[derive(Debug, Clone, Serialize)]
pub struct GitStatus {
    pub has_uncommitted_changes: bool,
    pub has_unpushed_commits: bool,
    pub uncommitted_count: u32,
    pub unpushed_count: u32,
    pub default_branch: Option<String>,
    pub default_branch_ahead: Option<u32>,
    pub default_branch_behind: Option<u32>,
}

/// Information about a changed file
#[derive(Debug, Clone, Serialize)]
pub struct ChangedFileInfo {
    pub path: String,
    pub status: String,
    pub additions: u32,
    pub deletions: u32,
    /// Whether the file is staged (in index)
    pub staged: bool,
}

/// Aggregate information about all changed files
#[derive(Debug, Clone, Serialize)]
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
#[derive(Debug, Clone, Serialize)]
pub struct FileDiffInfo {
    pub file_path: String,
    pub old_content: String,
    pub new_content: String,
    pub status: String,
}

/// Information about a single git commit
#[derive(Debug, Clone, Serialize)]
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

    if let (Some(path), Some(head)) = (current_path, current_head) {
        worktrees.push(WorktreeInfo {
            path,
            head,
            branch: current_branch,
        });
    }

    worktrees
}

#[cfg(test)]
mod tests {
    use super::GitEngine;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("atmos-git-engine-{name}-{suffix}"));
        fs::create_dir_all(&dir).expect("temp dir should be created");
        dir
    }

    fn git(current_dir: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(current_dir)
            .args(args)
            .output()
            .expect("git command should run");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn write_file(path: &Path, content: &str) {
        fs::write(path, content).expect("file should be written");
    }

    fn commit_file(repo_path: &Path, file_name: &str, content: &str, message: &str) {
        write_file(&repo_path.join(file_name), content);
        git(repo_path, &["add", file_name]);
        git(repo_path, &["commit", "-m", message]);
    }

    fn configure_repo(repo_path: &Path) {
        git(repo_path, &["config", "user.name", "Atmos Test"]);
        git(repo_path, &["config", "user.email", "atmos@example.com"]);
    }

    fn setup_remote_repo(name: &str) -> (PathBuf, PathBuf) {
        let root = unique_temp_dir(name);
        let origin_path = root.join("origin.git");
        let seed_path = root.join("seed");

        git(
            &root,
            &["init", "--bare", origin_path.to_str().expect("valid path")],
        );

        fs::create_dir_all(&seed_path).expect("seed dir should be created");
        git(&seed_path, &["init"]);
        configure_repo(&seed_path);
        git(&seed_path, &["branch", "-m", "main"]);
        commit_file(&seed_path, "README.md", "hello\n", "initial");
        git(
            &seed_path,
            &[
                "remote",
                "add",
                "origin",
                origin_path.to_str().expect("valid path"),
            ],
        );
        git(&seed_path, &["push", "-u", "origin", "main"]);
        git(&origin_path, &["symbolic-ref", "HEAD", "refs/heads/main"]);

        (root, origin_path)
    }

    fn clone_repo(root: &Path, origin_path: &Path, name: &str) -> PathBuf {
        let clone_path = root.join(name);
        git(
            root,
            &[
                "clone",
                origin_path.to_str().expect("valid path"),
                clone_path.to_str().expect("valid path"),
            ],
        );
        configure_repo(&clone_path);
        clone_path
    }

    #[test]
    fn git_status_reports_equal_remote_default_branch() {
        let (root, origin_path) = setup_remote_repo("equal");
        let repo_path = clone_repo(&root, &origin_path, "work");
        let engine = GitEngine::new();

        let status = engine
            .get_git_status(&repo_path)
            .expect("git status should be available");

        assert_eq!(status.default_branch.as_deref(), Some("main"));
        assert_eq!(status.default_branch_ahead, Some(0));
        assert_eq!(status.default_branch_behind, Some(0));

        fs::remove_dir_all(root).expect("temp repo should be removed");
    }

    #[test]
    fn git_status_reports_branch_ahead_of_remote_default_branch() {
        let (root, origin_path) = setup_remote_repo("ahead");
        let repo_path = clone_repo(&root, &origin_path, "work");
        let engine = GitEngine::new();

        git(&repo_path, &["checkout", "-b", "feature"]);
        commit_file(&repo_path, "feature.txt", "feature\n", "feature work");

        let status = engine
            .get_git_status(&repo_path)
            .expect("git status should be available");

        assert_eq!(status.default_branch.as_deref(), Some("main"));
        assert_eq!(status.default_branch_ahead, Some(1));
        assert_eq!(status.default_branch_behind, Some(0));

        fs::remove_dir_all(root).expect("temp repo should be removed");
    }

    #[test]
    fn git_status_reports_branch_behind_remote_default_branch() {
        let (root, origin_path) = setup_remote_repo("behind");
        let repo_path = clone_repo(&root, &origin_path, "work");
        let other_clone_path = clone_repo(&root, &origin_path, "other");
        let engine = GitEngine::new();

        commit_file(&other_clone_path, "remote.txt", "remote\n", "remote update");
        git(&other_clone_path, &["push", "origin", "main"]);
        git(&repo_path, &["fetch", "origin"]);

        let status = engine
            .get_git_status(&repo_path)
            .expect("git status should be available");

        assert_eq!(status.default_branch.as_deref(), Some("main"));
        assert_eq!(status.default_branch_ahead, Some(0));
        assert_eq!(status.default_branch_behind, Some(1));

        fs::remove_dir_all(root).expect("temp repo should be removed");
    }
}
