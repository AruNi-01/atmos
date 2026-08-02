use serde::{Deserialize, Serialize};

pub use core_service::{
    GithubIssueAssigneePayload, GithubIssueLabelPayload, GithubIssuePayload, GithubPrPayload,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssueListRequest {
    pub owner: String,
    pub repo: String,
    #[serde(default = "default_github_issue_state")]
    pub state: String,
    #[serde(default = "default_github_issue_limit")]
    pub limit: usize,
    #[serde(default = "default_github_issue_sort")]
    pub sort: String,
    #[serde(default = "default_github_issue_direction")]
    pub direction: String,
    #[serde(default)]
    pub search: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssueGetRequest {
    #[serde(default)]
    pub owner: Option<String>,
    #[serde(default)]
    pub repo: Option<String>,
    #[serde(default)]
    pub issue_number: Option<u64>,
    #[serde(default)]
    pub issue_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssueTimelinePageRequest {
    pub owner: String,
    pub repo: String,
    pub issue_number: u64,
    pub page: u64,
    pub per_page: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssuePageRequest {
    pub owner: String,
    pub repo: String,
    pub state: String,
    pub page: u64,
    pub per_page: u64,
    #[serde(default = "default_github_issue_sort")]
    pub sort: String,
    #[serde(default = "default_github_issue_direction")]
    pub direction: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssueLinkedPrsRequest {
    pub owner: String,
    pub repo: String,
    pub issue_number: u64,
}

fn default_github_issue_state() -> String {
    "open".to_string()
}

fn default_github_issue_limit() -> usize {
    50
}

fn default_github_issue_sort() -> String {
    "created".to_string()
}

fn default_github_issue_direction() -> String {
    "desc".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrListRepoRequest {
    pub owner: String,
    pub repo: String,
    #[serde(default = "default_github_issue_state")]
    pub state: String,
    #[serde(default = "default_github_issue_limit")]
    pub limit: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrGetRequest {
    #[serde(default)]
    pub owner: Option<String>,
    #[serde(default)]
    pub repo: Option<String>,
    #[serde(default)]
    pub pr_number: Option<u64>,
    #[serde(default)]
    pub pr_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrListRequest {
    pub owner: String,
    pub repo: String,
    pub branch: String,
    pub state: Option<String>,
    #[serde(default)]
    pub emit_branch_status_refresh: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrBranchPageRequest {
    pub owner: String,
    pub repo: String,
    pub branch: String,
    pub state: String,
    pub page: u64,
    pub per_page: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrDetailRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrCreateRequest {
    pub owner: String,
    pub repo: String,
    pub branch: String,
    pub title: String,
    pub body: Option<String>,
    pub base_branch: String,
    pub draft: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrMergeRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
    pub strategy: String,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrCloseRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrReopenRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrCommentRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrReadyRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrDraftRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubRepoLabelsRequest {
    pub owner: String,
    pub repo: String,
    /// Max labels to return (clamped server-side).
    #[serde(default = "default_repo_labels_limit")]
    pub limit: usize,
}

fn default_repo_labels_limit() -> usize {
    200
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubRepoAssigneesRequest {
    pub owner: String,
    pub repo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrUpdateLabelsRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
    #[serde(default)]
    pub add: Vec<String>,
    #[serde(default)]
    pub remove: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrUpdateAssigneesRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
    #[serde(default)]
    pub add: Vec<String>,
    #[serde(default)]
    pub remove: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssueUpdateLabelsRequest {
    pub owner: String,
    pub repo: String,
    pub issue_number: u64,
    #[serde(default)]
    pub add: Vec<String>,
    #[serde(default)]
    pub remove: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssueUpdateAssigneesRequest {
    pub owner: String,
    pub repo: String,
    pub issue_number: u64,
    #[serde(default)]
    pub add: Vec<String>,
    #[serde(default)]
    pub remove: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssueActionRequest {
    pub owner: String,
    pub repo: String,
    pub issue_number: u64,
    #[serde(default)]
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrUpdateLinkedIssuesRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
    #[serde(default)]
    pub add: Vec<u64>,
    #[serde(default)]
    pub remove: Vec<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrOpenBrowserRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrTimelinePageRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
    pub page: u64,
    pub per_page: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubCiStatusRequest {
    pub owner: String,
    pub repo: String,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubCiOpenBrowserRequest {
    pub owner: String,
    pub repo: String,
    pub run_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubActionsListRequest {
    pub owner: String,
    pub repo: String,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubActionsRerunRequest {
    pub owner: String,
    pub repo: String,
    pub run_id: u64,
    pub failed_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrFilesRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
}

/// List files that would conflict when merging a PR into its base.
/// Uses local `git merge-tree` against the **current** base-branch tip and PR head
/// when `repo_path` is a clone. Optionally includes three-way merged contents with
/// conflict markers (for read-only PR conflict preview).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrConflictFilesRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
    /// Absolute path to a local git worktree/clone for this repository (optional).
    #[serde(default)]
    pub repo_path: Option<String>,
    /// When true, also return a `contents` map of path → conflict-marked text.
    #[serde(default = "default_true")]
    pub include_contents: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubActionsDetailRequest {
    pub owner: String,
    pub repo: String,
    pub run_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubCommitDetailRequest {
    pub owner: String,
    pub repo: String,
    pub sha: String,
}
