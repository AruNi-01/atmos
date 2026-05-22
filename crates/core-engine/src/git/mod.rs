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
