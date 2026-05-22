use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssueLabelPayload {
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssuePayload {
    pub owner: String,
    pub repo: String,
    pub number: u64,
    pub title: String,
    #[serde(default)]
    pub body: Option<String>,
    pub url: String,
    pub state: String,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub labels: Vec<GithubIssueLabelPayload>,
}

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
pub struct GithubPrPayload {
    pub owner: String,
    pub repo: String,
    pub number: u64,
    pub title: String,
    #[serde(default)]
    pub body: Option<String>,
    pub url: String,
    pub state: String,
    pub head_ref: String,
    pub base_ref: String,
    #[serde(default)]
    pub is_draft: bool,
    #[serde(default)]
    pub labels: Vec<GithubIssueLabelPayload>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubActionsDetailRequest {
    pub owner: String,
    pub repo: String,
    pub run_id: u64,
}
