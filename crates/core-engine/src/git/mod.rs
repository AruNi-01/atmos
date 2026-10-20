//! Git operations for workspace management.

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::{EngineError, Result};

mod actions;
mod blame;
mod changes;
mod commits;
mod excludes;
mod history;
mod patches;
mod refs;
mod types;
mod worktrees;

pub use blame::{clear_file_blame_cache, file_blame_compute_count, last_file_blame_was_cache_hit};
pub use excludes::{list_ignored_paths, list_ignored_paths_for_many, sync_worktree_local_excludes};
pub use types::{
    BlameCommit, BlameRange, ChangedFileInfo, ChangedFilesInfo, CommitDetailInfo, CommitInfo,
    DiffContentKind, DiffPreviewKind, FileBlameInfo, FileBlameKind, FileDiffInfo, GitBlobLocator,
    GitStatus, HistoryCommit, HistoryPage, HistoryRef, HistoryRefKind, WorktreeInfo,
};
pub(crate) use worktrees::is_linked_worktree;

/// Run a git command in the given repo directory and return stdout on success.
fn run_git(repo_path: &Path, args: &[&str]) -> Result<String> {
    run_git_with_ceiling(repo_path, args, None)
}

fn run_git_with_ceiling(repo_path: &Path, args: &[&str], ceiling: Option<&Path>) -> Result<String> {
    let bytes = run_git_bytes_with_ceiling(repo_path, args, ceiling)?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

/// Config overrides for the git-blob subprocesses.
///
/// `protocol.allow` does not override a local `protocol.<name>.allow`, so the
/// built-in transports are locked individually. That includes `ftp`, `ftps`,
/// and `fd`, which git ships as remote helpers. `core.fsmonitor=false`
/// overrides a command in the repository config. An arbitrary `foo::` helper
/// is not in this list; git-blob refuses promisor and partial-clone repos
/// before any object command instead of trying to name every helper.
const GIT_BLOB_LOCKED_CONFIG: &[&str] = &[
    "protocol.allow=never",
    "protocol.file.allow=never",
    "protocol.ext.allow=never",
    "protocol.ssh.allow=never",
    "protocol.http.allow=never",
    "protocol.https.allow=never",
    "protocol.git.allow=never",
    "protocol.ftp.allow=never",
    "protocol.ftps.allow=never",
    "protocol.fd.allow=never",
    "core.fsmonitor=false",
];

/// Test seam. When this is `1`, git-blob subprocesses do not export
/// `GIT_NO_LAZY_FETCH`. Git before 2.44 ignores that variable, so tests set
/// this to prove the promisor rejection does not depend on it. Production
/// does not set it.
const GIT_BLOB_OMIT_NO_LAZY_FETCH: &str = "ATMOS_GIT_BLOB_OMIT_NO_LAZY_FETCH";

struct GitCommandOutput {
    status: std::process::ExitStatus,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

fn git_blob_command(repo_path: &Path, ceiling: Option<&Path>) -> Command {
    let mut command = Command::new("git");
    command.current_dir(repo_path);
    if let Some(ceiling) = ceiling {
        // Git stops the upward repository search before entering this directory.
        // The git-blob path is the only caller that sets a ceiling. It also drops
        // inherited repository-location variables so a parent `GIT_DIR` cannot
        // redirect the read. Following a `.git` gitdir file is not a ceiling walk.
        // `GIT_NO_LAZY_FETCH` is defense in depth for git 2.44+. Older git ignores
        // it. The `-c` values override repository config for the locked transports
        // and fsmonitor, and they sit before the subcommand.
        command.env("GIT_CEILING_DIRECTORIES", ceiling);
        if std::env::var(GIT_BLOB_OMIT_NO_LAZY_FETCH).ok().as_deref() == Some("1") {
            command.env_remove("GIT_NO_LAZY_FETCH");
        } else {
            command.env("GIT_NO_LAZY_FETCH", "1");
        }
        for key in [
            "GIT_DIR",
            "GIT_WORK_TREE",
            "GIT_COMMON_DIR",
            "GIT_OBJECT_DIRECTORY",
            "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        ] {
            command.env_remove(key);
        }
        for setting in GIT_BLOB_LOCKED_CONFIG {
            command.arg("-c").arg(*setting);
        }
    }
    command
}

fn run_git_command_with_ceiling(
    repo_path: &Path,
    args: &[&str],
    ceiling: Option<&Path>,
) -> Result<GitCommandOutput> {
    let mut command = git_blob_command(repo_path, ceiling);
    command.args(args);
    let output = command.output().map_err(|e| {
        EngineError::Git(format!(
            "Failed to execute git {}: {}",
            args.first().unwrap_or(&""),
            e
        ))
    })?;
    Ok(GitCommandOutput {
        status: output.status,
        stdout: output.stdout,
        stderr: output.stderr,
    })
}

/// Run a git command and return raw stdout bytes on success.
fn run_git_bytes_with_ceiling(
    repo_path: &Path,
    args: &[&str],
    ceiling: Option<&Path>,
) -> Result<Vec<u8>> {
    let output = run_git_command_with_ceiling(repo_path, args, ceiling)?;
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

/// Whether local or worktree config marks this repository as a partial clone
/// or a promisor remote.
///
/// Called before any git command that can fetch. The read is
/// `git config --local/--worktree --includes` from `repo_path`, so `include`,
/// `includeIf`, and `config.worktree` match the repository a later object
/// command would see. Global and system config are not consulted. A missing
/// key is `Ok(false)`. `extensions.partialClone` with any value, or any
/// `remote.*.promisor` boolean that is true, is `Ok(true)`. A failed read is
/// `Err` so the caller can fail closed.
pub fn git_blob_repo_has_promisor(repo_path: &Path, ceiling: &Path) -> Result<bool> {
    if config_scope_has_promisor(repo_path, ceiling, "--local")? {
        return Ok(true);
    }
    config_scope_has_promisor(repo_path, ceiling, "--worktree")
}

fn config_scope_has_promisor(repo_path: &Path, ceiling: &Path, scope: &str) -> Result<bool> {
    let partial = run_git_command_with_ceiling(
        repo_path,
        &[
            "config",
            scope,
            "--includes",
            "--get",
            "extensions.partialclone",
        ],
        Some(ceiling),
    )?;
    if partial.status.success() {
        return Ok(true);
    }
    if !config_key_absent(&partial) {
        return Err(config_read_error(scope, &partial));
    }

    let promisor = run_git_command_with_ceiling(
        repo_path,
        &[
            "config",
            scope,
            "--includes",
            "--type=bool",
            "--get-regexp",
            r"^remote\..*\.promisor$",
        ],
        Some(ceiling),
    )?;
    if promisor.status.success() {
        return promisor_values_include_true(&promisor.stdout);
    }
    if config_key_absent(&promisor) {
        return Ok(false);
    }
    Err(config_read_error(scope, &promisor))
}

/// Exit 1 with no key is "not set".
///
/// A linked worktree without `extensions.worktreeConfig` makes
/// `git config --worktree` exit 128 and print that the extension is required.
/// That is "no worktree promisor", not a broken config file.
fn config_key_absent(output: &GitCommandOutput) -> bool {
    if !output.stdout.iter().all(|byte| byte.is_ascii_whitespace()) {
        return false;
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let trimmed = stderr.trim();
    match output.status.code() {
        Some(1) => trimmed.is_empty(),
        Some(128) => worktree_config_extension_disabled(trimmed),
        _ => false,
    }
}

fn worktree_config_extension_disabled(stderr: &str) -> bool {
    let lower = stderr.to_ascii_lowercase();
    lower.contains("multiple working trees") && lower.contains("worktreeconfig")
}

fn config_read_error(scope: &str, output: &GitCommandOutput) -> EngineError {
    let stderr = String::from_utf8_lossy(&output.stderr);
    EngineError::Git(format!(
        "git config {scope} failed ({}): {}",
        output.status.code().unwrap_or(-1),
        stderr.trim()
    ))
}

fn promisor_values_include_true(stdout: &[u8]) -> Result<bool> {
    let text = std::str::from_utf8(stdout)
        .map_err(|_| EngineError::Git("git config promisor output was not utf-8".to_string()))?;
    let mut saw_line = false;
    let mut any_true = false;
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        saw_line = true;
        let Some((key, value)) = line.rsplit_once(' ') else {
            return Err(EngineError::Git(format!(
                "git config promisor line was not a key and a bool: {line}"
            )));
        };
        if !is_remote_promisor_key(key) {
            return Err(EngineError::Git(format!(
                "git config returned an unexpected promisor key: {key}"
            )));
        }
        match value {
            "true" => any_true = true,
            "false" => {}
            other => {
                return Err(EngineError::Git(format!(
                    "git config promisor bool was {other}"
                )));
            }
        }
    }
    if !saw_line {
        return Err(EngineError::Git(
            "git config reported a promisor key with empty output".to_string(),
        ));
    }
    Ok(any_true)
}

fn is_remote_promisor_key(key: &str) -> bool {
    let Some(rest) = key.strip_prefix("remote.") else {
        return false;
    };
    let Some((name, field)) = rest.rsplit_once('.') else {
        return false;
    };
    field == "promisor" && !name.is_empty()
}

/// Toplevel checkout, git directory, and common directory from `rev-parse`.
///
/// `common_dir` is where objects live. For a linked worktree it is the main
/// repository's git dir, which may differ from `git_dir`. A normal repository
/// often reports it as a relative `.git`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitRepoIdentity {
    pub toplevel: PathBuf,
    pub git_dir: PathBuf,
    pub common_dir: PathBuf,
}

/// `rev-parse --show-toplevel --absolute-git-dir --git-common-dir` with an upward-search ceiling.
///
/// `ceiling` is `GIT_CEILING_DIRECTORIES`. Git will not walk into that directory
/// or above it while discovering a repository. A `gitdir:` file under the
/// starting directory is still followed.
pub fn resolve_git_repo_identity(repo_path: &Path, ceiling: &Path) -> Result<GitRepoIdentity> {
    let text = run_git_with_ceiling(
        repo_path,
        &[
            "rev-parse",
            "--show-toplevel",
            "--absolute-git-dir",
            "--git-common-dir",
        ],
        Some(ceiling),
    )?;
    let mut lines = text.lines().map(str::trim).filter(|line| !line.is_empty());
    let Some(toplevel) = lines.next() else {
        return Err(EngineError::Git(
            "git rev-parse returned no toplevel".to_string(),
        ));
    };
    let Some(git_dir) = lines.next() else {
        return Err(EngineError::Git(
            "git rev-parse returned no git dir".to_string(),
        ));
    };
    let Some(common_dir) = lines.next() else {
        return Err(EngineError::Git(
            "git rev-parse returned no common dir".to_string(),
        ));
    };
    if lines.next().is_some() {
        return Err(EngineError::Git(
            "git rev-parse returned extra lines".to_string(),
        ));
    }
    Ok(GitRepoIdentity {
        toplevel: PathBuf::from(toplevel),
        git_dir: PathBuf::from(git_dir),
        common_dir: PathBuf::from(common_dir),
    })
}

/// Show a blob (`rev:path` or `:path`) as raw bytes.
///
/// Resolves the object with `rev-parse` then reads via `cat-file blob` so the
/// spec is never parsed as a `git show` option (e.g. `--output=...`).
pub fn show_git_blob_bytes(repo_path: &Path, rev_path_spec: &str) -> Result<Vec<u8>> {
    read_git_blob(repo_path, rev_path_spec, None)
}

/// Same as [`show_git_blob_bytes`], but git will not search above `ceiling`.
pub fn show_git_blob_bytes_with_ceiling(
    repo_path: &Path,
    rev_path_spec: &str,
    ceiling: &Path,
) -> Result<Vec<u8>> {
    read_git_blob(repo_path, rev_path_spec, Some(ceiling))
}

fn read_git_blob(repo_path: &Path, rev_path_spec: &str, ceiling: Option<&Path>) -> Result<Vec<u8>> {
    let spec = rev_path_spec.trim();
    if !is_safe_blob_show_spec(spec) {
        return Err(EngineError::Git("Invalid git blob show-spec".to_string()));
    }
    let oid = run_git_with_ceiling(
        repo_path,
        &["rev-parse", "--verify", "--quiet", spec],
        ceiling,
    )?;
    let oid = oid.trim();
    if oid.is_empty() {
        return Err(EngineError::Git("Blob object not found".to_string()));
    }
    run_git_bytes_with_ceiling(repo_path, &["cat-file", "blob", oid], ceiling)
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

pub(super) fn git_ref_exists(repo_path: &Path, git_ref: &str) -> bool {
    let git_ref = git_ref.trim();
    if git_ref.is_empty() || git_ref.starts_with('-') {
        return false;
    }
    try_run_git(repo_path, &["rev-parse", "--verify", "--quiet", git_ref])
        .ok()
        .flatten()
        .is_some()
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

/// Resolve a local commit-ish for `git worktree add` without a network round-trip
/// when `origin/<branch>` or the local branch already exists.
pub(super) fn resolve_worktree_base_ref(repo_path: &Path, base_branch: &str) -> Result<String> {
    let normalized = base_branch
        .trim()
        .trim_start_matches("origin/")
        .trim_start_matches("refs/heads/")
        .trim_start_matches("refs/remotes/origin/");
    if normalized.is_empty() {
        return Err(EngineError::Git("Base branch cannot be empty".to_string()));
    }

    let origin_ref = format!("refs/remotes/origin/{normalized}");
    if git_ref_exists(repo_path, &origin_ref) {
        return Ok(format!("origin/{normalized}"));
    }

    let local_ref = format!("refs/heads/{normalized}");
    if git_ref_exists(repo_path, &local_ref) {
        return Ok(normalized.to_string());
    }

    if let Err(error) = fetch_remote_branch(repo_path, normalized) {
        tracing::warn!("Git fetch warning for {normalized}: {error}");
    }

    if git_ref_exists(repo_path, &origin_ref) {
        return Ok(format!("origin/{normalized}"));
    }
    if git_ref_exists(repo_path, &local_ref) {
        return Ok(normalized.to_string());
    }

    Err(EngineError::Git(format!(
        "Remote branch origin/{normalized} does not exist"
    )))
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
