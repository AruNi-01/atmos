use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

pub type SharedString = Arc<RwLock<String>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssueLabelPayload {
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssueAssigneePayload {
    pub login: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
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
    pub comments_count: u64,
    #[serde(default)]
    pub labels: Vec<GithubIssueLabelPayload>,
    /// Issue opener (author), not assignees.
    #[serde(default)]
    pub author: Option<GithubIssueAssigneePayload>,
    #[serde(default)]
    pub assignees: Vec<GithubIssueAssigneePayload>,
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
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub author: Option<GithubIssueAssigneePayload>,
    #[serde(default)]
    pub assignees: Vec<GithubIssueAssigneePayload>,
}

/// CI / status check node for Task GitHub list rings.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GithubStatusCheckPayload {
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub conclusion: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub context: Option<String>,
    #[serde(default)]
    pub details_url: Option<String>,
    #[serde(default)]
    pub target_url: Option<String>,
    #[serde(default)]
    pub workflow_name: Option<String>,
}

/// Multi-repo GitHub Search hit (Task surface).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubSearchItemPayload {
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
    pub comments_count: u64,
    #[serde(default)]
    pub labels: Vec<GithubIssueLabelPayload>,
    #[serde(default)]
    pub author: Option<GithubIssueAssigneePayload>,
    #[serde(default)]
    pub assignees: Vec<GithubIssueAssigneePayload>,
    #[serde(default)]
    pub is_draft: bool,
    #[serde(default)]
    pub head_ref: Option<String>,
    #[serde(default)]
    pub base_ref: Option<String>,
    /// `"issue"` or `"pr"`.
    pub kind: String,
    /// PR CI rollup (empty for issues).
    #[serde(default)]
    pub status_checks: Vec<GithubStatusCheckPayload>,
    /// Linked issues (on PR rows) or linked PRs (on issue rows).
    #[serde(default)]
    pub linked_refs: Vec<GithubLinkedRefPayload>,
}

/// Cross-link chip for Task list (issue ↔ PR).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubLinkedRefPayload {
    /// `"issue"` | `"pr"`
    pub kind: String,
    pub number: u64,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubSearchPagePayload {
    pub items: Vec<GithubSearchItemPayload>,
    pub has_more: bool,
    pub total_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceAttachmentPayload {
    pub filename: String,
    #[serde(default)]
    pub mime: Option<String>,
    pub data_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillFile {
    pub name: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub content: Option<String>,
    pub is_main: bool,
    #[serde(default)]
    pub is_symlink: bool,
    #[serde(default)]
    pub symlink_target: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillPlacement {
    pub id: String,
    pub agent: String,
    pub scope: String,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub path: String,
    pub original_path: String,
    pub resolved_path: Option<String>,
    pub status: String,
    pub entry_kind: String,
    pub symlink_target: Option<String>,
    pub can_delete: bool,
    pub can_toggle: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub agents: Vec<String>,
    pub scope: String,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub path: String,
    pub files: Vec<SkillFile>,
    pub title: Option<String>,
    pub status: String,
    pub manageable: bool,
    pub can_delete: bool,
    pub can_toggle: bool,
    pub placements: Vec<SkillPlacement>,
}
