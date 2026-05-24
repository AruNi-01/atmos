use super::*;
use infra::db::entities::{
    review_agent_run, review_comment, review_file_snapshot, review_message, review_revision,
    review_session,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewAnchor {
    pub file_path: String,
    pub side: String,
    pub start_line: i32,
    pub end_line: i32,
    pub line_range_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_text: Option<String>,
    #[serde(default)]
    pub before_context: Vec<String>,
    #[serde(default)]
    pub after_context: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hunk_header: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewMessageDto {
    #[serde(flatten)]
    pub model: review_message::Model,
    pub body_full: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewCommentDto {
    #[serde(flatten)]
    pub model: review_comment::Model,
    pub anchor: Value,
    pub messages: Vec<ReviewMessageDto>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewFileDto {
    pub snapshot: review_file_snapshot::Model,
    pub state: review_file_state::Model,
    pub changed_after_review: bool,
    pub open_comment_count: usize,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewRevisionDto {
    #[serde(flatten)]
    pub model: review_revision::Model,
    pub files: Vec<ReviewFileDto>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewSessionDto {
    #[serde(flatten)]
    pub model: review_session::Model,
    pub revisions: Vec<ReviewRevisionDto>,
    pub runs: Vec<review_agent_run::Model>,
    pub open_comment_count: usize,
    pub reviewed_file_count: usize,
    pub reviewed_then_changed_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ReviewTarget {
    Workspace { workspace_guid: String },
    Project { project_guid: String },
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateReviewSessionInput {
    pub target: ReviewTarget,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub created_by: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SetReviewFileReviewedInput {
    pub file_state_guid: String,
    pub reviewed: bool,
    #[serde(default)]
    pub reviewed_by: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateReviewCommentByFilePathInput {
    pub session_guid: String,
    pub revision_guid: String,
    pub file_path: String,
    pub side: String,
    pub start_line: i32,
    pub end_line: i32,
    pub body: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default = "super::support::default_author_type")]
    pub author_type: String,
    #[serde(default)]
    pub agent_run_guid: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateReviewCommentInput {
    pub session_guid: String,
    pub revision_guid: String,
    pub file_snapshot_guid: String,
    pub anchor: ReviewAnchor,
    pub body: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub created_by: Option<String>,
    #[serde(default)]
    pub parent_comment_guid: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AddReviewMessageInput {
    pub comment_guid: String,
    pub author_type: String,
    pub kind: String,
    pub body: String,
    #[serde(default)]
    pub agent_run_guid: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateReviewMessageInput {
    pub message_guid: String,
    pub body: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeleteReviewMessageInput {
    pub message_guid: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateReviewCommentStatusInput {
    pub comment_guid: String,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateReviewAgentRunInput {
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

#[derive(Debug, Clone, Deserialize)]
pub struct SetReviewAgentRunStatusInput {
    pub run_guid: String,
    pub status: String,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewAgentRunCreatedDto {
    pub run: review_agent_run::Model,
    pub revision: ReviewRevisionDto,
    pub prompt: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewCommentContextDto {
    pub session: review_session::Model,
    pub revision: review_revision::Model,
    pub file_snapshot: review_file_snapshot::Model,
    pub comment: ReviewCommentDto,
    pub workspace_root: String,
    pub old_file_abs_path: String,
    pub new_file_abs_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewAgentRunFinalizedDto {
    pub run: review_agent_run::Model,
    pub revision: review_revision::Model,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ReviewAgentRunStatusDto {
    Run { run: review_agent_run::Model },
    Finalized(ReviewAgentRunFinalizedDto),
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewFileContentDto {
    pub file_snapshot: review_file_snapshot::Model,
    pub old_content: String,
    pub new_content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewRunArtifactDto {
    pub run: review_agent_run::Model,
    pub kind: String,
    pub content: String,
}
