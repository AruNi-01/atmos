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
    pub compare_ref: Option<String>,
}

/// File diff information with old and new content
#[derive(Debug, Clone, Serialize)]
pub struct FileDiffInfo {
    pub file_path: String,
    pub old_content: String,
    pub new_content: String,
    pub status: String,
    pub compare_ref: Option<String>,
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
