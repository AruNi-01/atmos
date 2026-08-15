use std::path::PathBuf;

use serde::Serialize;

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
    pub has_merge_conflicts: bool,
    pub has_unpushed_commits: bool,
    pub uncommitted_count: u32,
    pub unpushed_count: u32,
    pub upstream_behind_count: Option<u32>,
    pub default_branch: Option<String>,
    pub default_branch_ahead: Option<u32>,
    pub default_branch_behind: Option<u32>,
}

/// Information about a changed file
#[derive(Debug, Clone, Serialize)]
pub struct ChangedFileInfo {
    pub path: String,
    pub status: String,
    /// Line additions; 0 when `is_binary` (Git numstat uses `-`).
    pub additions: u32,
    /// Line deletions; 0 when `is_binary`.
    pub deletions: u32,
    /// True when Git reports a binary change (numstat `-`) or content is non-text.
    pub is_binary: bool,
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
    pub compare_ref: Option<String>,
}

/// How file content should be rendered in a diff surface.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DiffContentKind {
    Text,
    Binary,
    TooLarge,
}

/// Product preview affordance for non-text (or large) files.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DiffPreviewKind {
    None,
    Image,
    Media,
}

/// How the client can fetch raw bytes for a preview (never embedded in WS JSON).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum GitBlobLocator {
    Worktree { path: String },
    Git { rev: String, path: String },
}

/// File diff information — text sides only when `kind == text`.
#[derive(Debug, Clone, Serialize)]
pub struct FileDiffInfo {
    pub file_path: String,
    pub status: String,
    pub compare_ref: Option<String>,
    pub kind: DiffContentKind,
    pub preview_kind: DiffPreviewKind,
    /// Present only when `kind == text`.
    pub old_text: Option<String>,
    /// Present only when `kind == text`.
    pub new_text: Option<String>,
    pub old_size: Option<u64>,
    pub new_size: Option<u64>,
    pub old_sha256: Option<String>,
    pub new_sha256: Option<String>,
    pub old_blob: Option<GitBlobLocator>,
    pub new_blob: Option<GitBlobLocator>,
}

/// Public Git reference attached to a commit in the history graph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HistoryRefKind {
    Branch,
    Remote,
    Tag,
}

/// A branch, remote branch, or tag pointing at a history commit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HistoryRef {
    pub kind: HistoryRefKind,
    pub label: String,
}

/// One topologically ordered row in the repository history graph.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HistoryCommit {
    pub hash: String,
    pub short_hash: String,
    pub parent_hashes: Vec<String>,
    pub subject: String,
    pub author_name: String,
    pub author_email: String,
    /// Unix timestamp of the author date.
    pub timestamp: i64,
    pub refs: Vec<HistoryRef>,
}

/// Paged public commit history used by the center-tab graph.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HistoryPage {
    pub commits: Vec<HistoryCommit>,
    pub head_sha: Option<String>,
    pub next_cursor: Option<usize>,
    pub total_count: Option<usize>,
    pub head_commit_count: Option<usize>,
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
pub(super) fn parse_worktree_list(output: &str) -> Vec<WorktreeInfo> {
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
