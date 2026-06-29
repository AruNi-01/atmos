//! Git operations for workspace management.

use std::path::Path;
use std::process::Command;

use crate::error::{EngineError, Result};

mod actions;
mod changes;
mod commits;
mod excludes;
mod patches;
mod refs;
mod types;
mod worktrees;

pub use excludes::{list_ignored_paths, list_ignored_paths_for_many, sync_worktree_local_excludes};
pub use types::{
    ChangedFileInfo, ChangedFilesInfo, CommitInfo, FileDiffInfo, GitStatus, WorktreeInfo,
};

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

pub(super) fn normalize_remote_branch_name(branch: &str) -> &str {
    let branch = branch.trim();
    let branch = branch.strip_prefix("refs/heads/").unwrap_or(branch);
    branch.strip_prefix("origin/").unwrap_or(branch)
}

pub(super) fn remote_branch_fetch_refspec(branch: &str) -> Option<String> {
    let normalized = normalize_remote_branch_name(branch);
    (!normalized.is_empty())
        .then(|| format!("+refs/heads/{normalized}:refs/remotes/origin/{normalized}"))
}

pub(super) fn is_shallow_repository(repo_path: &Path) -> bool {
    try_run_git(repo_path, &["rev-parse", "--is-shallow-repository"])
        .ok()
        .flatten()
        .is_some_and(|stdout| stdout.trim() == "true")
}

pub(super) fn fetch_remote_branch(repo_path: &Path, branch: &str) -> Result<()> {
    let Some(refspec) = remote_branch_fetch_refspec(branch) else {
        return Ok(());
    };

    let mut args = vec!["fetch", "--no-tags"];
    if is_shallow_repository(repo_path) {
        args.push("--depth=1");
    }
    args.extend(["origin", &refspec]);

    run_git(repo_path, &args).map(|_| ())
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
}

impl Default for GitEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests;
