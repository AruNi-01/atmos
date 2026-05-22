use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSessionListRequest {
    #[serde(default)]
    pub workspace_guid: Option<String>,
    #[serde(default)]
    pub project_guid: Option<String>,
    #[serde(default)]
    pub include_archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSessionGetRequest {
    pub session_guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSessionCreateRequest {
    #[serde(default)]
    pub workspace_guid: Option<String>,
    #[serde(default)]
    pub project_guid: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub created_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSessionCloseRequest {
    pub session_guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSessionArchiveRequest {
    pub session_guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSessionActivateRequest {
    pub session_guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSessionRenameRequest {
    pub session_guid: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewFileListRequest {
    pub revision_guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewFileContentGetRequest {
    pub file_snapshot_guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewFileSetReviewedRequest {
    pub file_state_guid: String,
    pub reviewed: bool,
    #[serde(default)]
    pub reviewed_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewCommentListRequest {
    pub session_guid: String,
    #[serde(default)]
    pub revision_guid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewCommentCreateRequest {
    pub session_guid: String,
    pub revision_guid: String,
    pub file_snapshot_guid: String,
    pub anchor: Value,
    pub body: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub created_by: Option<String>,
    #[serde(default)]
    pub parent_comment_guid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewCommentUpdateStatusRequest {
    pub comment_guid: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewMessageAddRequest {
    pub comment_guid: String,
    pub author_type: String,
    pub kind: String,
    pub body: String,
    #[serde(default)]
    pub agent_run_guid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewMessageUpdateRequest {
    pub message_guid: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewMessageDeleteRequest {
    pub message_guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewAgentRunListRequest {
    pub session_guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewAgentRunCreateRequest {
    pub session_guid: String,
    pub base_revision_guid: String,
    pub run_kind: String,
    pub execution_mode: String,
    #[serde(default)]
    pub skill_id: Option<String>,
    #[serde(default)]
    pub selected_comment_guids: Vec<String>,
    #[serde(default)]
    pub created_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewAgentRunArtifactGetRequest {
    pub run_guid: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewAgentRunFinalizeRequest {
    pub run_guid: String,
    #[serde(default)]
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewAgentRunSetStatusRequest {
    pub run_guid: String,
    pub status: String,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub summary: Option<String>,
}
