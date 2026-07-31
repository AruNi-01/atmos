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
    ChangedFileInfo, ChangedFilesInfo, CommitInfo, DiffContentKind, DiffPreviewKind, FileDiffInfo,
    GitBlobLocator, GitStatus, WorktreeInfo,
};

/// Run a git command in the given repo directory and return stdout on success.
fn run_git(repo_path: &Path, args: &[&str]) -> Result<String> {
    let bytes = run_git_bytes(repo_path, args)?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

/// Run a git command and return raw stdout bytes on success.
fn run_git_bytes(repo_path: &Path, args: &[&str]) -> Result<Vec<u8>> {
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
    Ok(output.stdout)
}

/// Like `run_git` but returns Ok(None) instead of Err on non-zero exit.
fn try_run_git(repo_path: &Path, args: &[&str]) -> Result<Option<String>> {
    Ok(
        try_run_git_bytes(repo_path, args)?
            .map(|bytes| String::from_utf8_lossy(&bytes).to_string()),
    )
}

/// Like `run_git_bytes` but returns Ok(None) instead of Err on non-zero exit.
fn try_run_git_bytes(repo_path: &Path, args: &[&str]) -> Result<Option<Vec<u8>>> {
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
        Ok(Some(output.stdout))
    } else {
        Ok(None)
    }
}

/// Show a blob (`rev:path` or `:path`) as raw bytes.
///
/// Resolves the object with `rev-parse` then reads via `cat-file blob` so the
/// spec is never parsed as a `git show` option (e.g. `--output=...`).
pub fn show_git_blob_bytes(repo_path: &Path, rev_path_spec: &str) -> Result<Vec<u8>> {
    let spec = rev_path_spec.trim();
    if !is_safe_blob_show_spec(spec) {
        return Err(EngineError::Git("Invalid git blob show-spec".to_string()));
    }
    let oid = run_git(repo_path, &["rev-parse", "--verify", "--quiet", spec])?;
    let oid = oid.trim();
    if oid.is_empty() {
        return Err(EngineError::Git("Blob object not found".to_string()));
    }
    run_git_bytes(repo_path, &["cat-file", "blob", oid])
}

fn is_safe_blob_show_spec(spec: &str) -> bool {
    if spec.is_empty() || spec.contains('\0') || spec.starts_with('-') {
        return false;
    }
    // Reject shell-ish / multi-arg payloads.
    !spec.chars().any(|c| matches!(c, ' ' | '\n' | '\r' | '\t'))
}

pub(super) struct RemoteBranchFetchTarget {
    pub remote: String,
    pub branch: String,
}

impl RemoteBranchFetchTarget {
    fn refspec(&self) -> String {
        format!(
            "+refs/heads/{}:refs/remotes/{}/{}",
            self.branch, self.remote, self.branch
        )
    }

    pub(super) fn local_branch_name(&self) -> String {
        if self.remote == "origin" {
            self.branch.clone()
        } else {
            format!("{}/{}", self.remote, self.branch)
        }
    }
}

fn list_remotes(repo_path: &Path) -> Result<Vec<String>> {
    Ok(try_run_git(repo_path, &["remote"])?
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|remote| !remote.is_empty())
        .map(ToOwned::to_owned)
        .collect())
}

pub(super) fn remote_branch_fetch_target(
    repo_path: &Path,
    branch: &str,
) -> Result<Option<RemoteBranchFetchTarget>> {
    let branch = branch.trim();
    let branch = branch.strip_prefix("refs/heads/").unwrap_or(branch);
    if branch.is_empty() {
        return Ok(None);
    }

    if let Some(remote_ref) = branch.strip_prefix("refs/remotes/") {
        let Some((remote, branch)) = remote_ref.split_once('/') else {
            return Ok(None);
        };
        if remote.is_empty() || branch.is_empty() {
            return Ok(None);
        }
        return Ok(Some(RemoteBranchFetchTarget {
            remote: remote.to_string(),
            branch: branch.to_string(),
        }));
    }

    let remotes = list_remotes(repo_path)?;
    if let Some((remote, remote_branch)) = branch.split_once('/') {
        if !remote_branch.is_empty() && remotes.iter().any(|value| value == remote) {
            return Ok(Some(RemoteBranchFetchTarget {
                remote: remote.to_string(),
                branch: remote_branch.to_string(),
            }));
        }
    }

    Ok(Some(RemoteBranchFetchTarget {
        remote: "origin".to_string(),
        branch: branch.strip_prefix("origin/").unwrap_or(branch).to_string(),
    }))
}

pub(super) fn is_shallow_repository(repo_path: &Path) -> bool {
    try_run_git(repo_path, &["rev-parse", "--is-shallow-repository"])
        .ok()
        .flatten()
        .is_some_and(|stdout| stdout.trim() == "true")
}

pub(super) fn fetch_remote_branch(repo_path: &Path, branch: &str) -> Result<()> {
    let Some(target) = remote_branch_fetch_target(repo_path, branch)? else {
        return Ok(());
    };
    let refspec = target.refspec();

    let mut args = vec!["fetch".to_string(), "--no-tags".to_string()];
    if is_shallow_repository(repo_path) {
        args.push("--depth=1".to_string());
    }
    args.push(target.remote);
    args.push(refspec);
    let args: Vec<&str> = args.iter().map(String::as_str).collect();

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

    pub fn validate_branch_name(branch_name: &str) -> Result<()> {
        if branch_name.trim().is_empty() {
            return Err(EngineError::Git("Branch name cannot be empty".to_string()));
        }
        if branch_name != branch_name.trim() {
            return Err(EngineError::Git(format!(
                "{} is not a valid branch name: leading or trailing whitespace is not allowed",
                branch_name
            )));
        }

        let output = Command::new("git")
            .args(["check-ref-format", "--branch", branch_name])
            .output()
            .map_err(|e| {
                EngineError::Git(format!("Failed to execute git check-ref-format: {}", e))
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(EngineError::Git(format!(
                "{} is not a valid branch name: {}",
                branch_name,
                stderr.trim()
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.trim_end() != branch_name {
            return Err(EngineError::Git(format!(
                "{} is not a valid branch name: shorthand branch references are not allowed",
                branch_name
            )));
        }

        Ok(())
    }
}

impl Default for GitEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests;
