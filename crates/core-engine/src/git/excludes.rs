use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::{EngineError, Result};

use super::{run_git, try_run_git};

/// Enumerate paths under `subpaths` (each relative to `repo_path`) that git
/// considers ignored AND that currently exist in the working tree.
///
/// Internally runs a single batched command:
///   `git ls-files --others --ignored --exclude-standard --directory -z -- <subpath>...`
///
/// Returned paths are repo-root-relative (matching git's output verbatim, with
/// any trailing `/` preserved so callers can distinguish dir entries if they
/// care). On any failure (git missing, not a git repo, etc.) returns an empty
/// vec — callers should treat "no ignored paths" as "nothing to compensate".
pub fn list_ignored_paths_for_many(repo_path: &Path, subpaths: &[PathBuf]) -> Vec<String> {
    if subpaths.is_empty() {
        return Vec::new();
    }

    let subpath_args: Vec<String> = subpaths
        .iter()
        .map(|subpath| subpath.to_string_lossy().into_owned())
        .collect();
    let subpath_refs: Vec<&str> = subpath_args.iter().map(String::as_str).collect();
    let mut args = vec![
        "ls-files",
        "--others",
        "--ignored",
        "--exclude-standard",
        "--directory",
        "-z",
        "--",
    ];
    args.extend(subpath_refs);
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(args)
        .output();

    let Ok(out) = output else { return Vec::new() };
    if !out.status.success() {
        return Vec::new();
    }

    out.stdout
        .split(|b| *b == 0)
        .filter(|chunk| !chunk.is_empty())
        .map(|chunk| String::from_utf8_lossy(chunk).into_owned())
        .collect()
}

/// Convenience wrapper for a single subpath.
pub fn list_ignored_paths(repo_path: &Path, subpath: &Path) -> Vec<String> {
    list_ignored_paths_for_many(repo_path, &[subpath.to_path_buf()])
}

pub(crate) const ATMOS_EXCLUDE_BLOCK_START: &str = "# atmos:gitignore-dirs-sync start";
const ATMOS_EXCLUDE_BLOCK_END: &str = "# atmos:gitignore-dirs-sync end";

fn strip_atmos_exclude_block(contents: &str) -> String {
    let mut result = Vec::new();
    let mut in_block = false;

    for line in contents.lines() {
        if line == ATMOS_EXCLUDE_BLOCK_START {
            in_block = true;
            continue;
        }
        if line == ATMOS_EXCLUDE_BLOCK_END {
            in_block = false;
            continue;
        }
        if !in_block {
            result.push(line);
        }
    }

    result.join("\n").trim().to_string()
}

fn ensure_worktree_config_enabled(repo_path: &Path) -> Result<()> {
    let enabled = try_run_git(repo_path, &["config", "--get", "extensions.worktreeConfig"])?
        .as_deref()
        .map(|value| value.trim() == "true")
        .unwrap_or(false);
    if enabled {
        return Ok(());
    }
    run_git(repo_path, &["config", "extensions.worktreeConfig", "true"])?;
    Ok(())
}

fn resolve_git_dir(repo_path: &Path) -> Result<PathBuf> {
    let stdout = run_git(repo_path, &["rev-parse", "--git-dir"])?;
    let resolved = stdout.trim();
    if resolved.is_empty() {
        return Err(EngineError::Git(
            "git rev-parse --git-dir returned an empty path".to_string(),
        ));
    }

    let path = PathBuf::from(resolved);
    if path.is_absolute() {
        Ok(path)
    } else {
        Ok(repo_path.join(path))
    }
}

/// Sync an Atmos-managed block inside the current worktree's `info/exclude`.
///
/// Callers must pass the linked worktree checkout path (not the main repo root).
///
/// For linked worktrees, Git still resolves `rev-parse --git-path info/exclude` to the *common*
/// repository exclude file, so patterns written only to the private worktree gitdir are ignored by
/// `git status`. We therefore store the block under the private gitdir and point this worktree at
/// it via `core.excludesFile` in `config.worktree`.
pub fn sync_worktree_local_excludes(repo_path: &Path, managed_paths: &[String]) -> Result<()> {
    let exclude_path = resolve_git_dir(repo_path)?.join("info").join("exclude");

    let mut normalized_paths: Vec<String> = managed_paths
        .iter()
        .map(|path| path.trim().trim_end_matches('/').to_string())
        .filter(|path| !path.is_empty())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    normalized_paths.sort();

    let existing = std::fs::read_to_string(&exclude_path).unwrap_or_default();
    let mut next = strip_atmos_exclude_block(&existing);

    if !normalized_paths.is_empty() {
        let block = format!(
            "{start}\n{paths}\n{end}",
            start = ATMOS_EXCLUDE_BLOCK_START,
            paths = normalized_paths.join("\n"),
            end = ATMOS_EXCLUDE_BLOCK_END,
        );

        if next.is_empty() {
            next = block;
        } else {
            next = format!("{next}\n\n{block}");
        }
    }

    if let Some(parent) = exclude_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            EngineError::Git(format!(
                "Failed to create parent directory for {}: {}",
                exclude_path.display(),
                e
            ))
        })?;
    }

    let final_contents = if next.is_empty() {
        String::new()
    } else {
        format!("{next}\n")
    };

    std::fs::write(&exclude_path, final_contents).map_err(|e| {
        EngineError::Git(format!(
            "Failed to write worktree exclude file {}: {}",
            exclude_path.display(),
            e
        ))
    })?;

    if normalized_paths.is_empty() {
        let _ = try_run_git(
            repo_path,
            &["config", "--worktree", "--unset", "core.excludesFile"],
        )?;
    } else {
        ensure_worktree_config_enabled(repo_path)?;
        let exclude_for_git = std::fs::canonicalize(&exclude_path).unwrap_or(exclude_path);
        let exclude_str = exclude_for_git.to_string_lossy();
        run_git(
            repo_path,
            &[
                "config",
                "--worktree",
                "core.excludesFile",
                exclude_str.as_ref(),
            ],
        )?;
    }

    Ok(())
}
