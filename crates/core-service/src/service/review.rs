use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::Arc;

use core_engine::GitEngine;
use infra::db::entities::{
    review_agent_run, review_comment, review_file_snapshot, review_file_state, review_message,
    review_revision, review_session,
};
use infra::db::repo::{ProjectRepo, ReviewRepo, WorkspaceRepo};
use infra::utils::review_artifacts::{
    anchor_file_snapshot_abs_paths, manifest_abs_path, revision_root_abs_path,
    revisions_manifest_abs_path, run_root_abs_path, session_root_abs_path, sha256_hex,
    write_json_atomic, write_text_atomic,
};
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use similar::TextDiff;
use uuid::Uuid;

use crate::error::{Result, ServiceError};

const MESSAGE_INLINE_LIMIT: usize = 16 * 1024;

fn is_open_review_comment_status(status: &str) -> bool {
    matches!(status, "open" | "agent_fixed")
}

fn is_valid_review_comment_status(status: &str) -> bool {
    matches!(status, "open" | "agent_fixed" | "fixed" | "dismissed")
}

fn normalize_review_file_path(value: &str) -> String {
    let normalized = value.replace('\\', "/");
    let without_prefix = normalized.strip_prefix("./").unwrap_or(&normalized);
    without_prefix.trim_start_matches('/').to_string()
}

fn count_review_snapshot_changes(snapshot: &review_file_snapshot::Model) -> (usize, usize) {
    if snapshot.is_binary {
        return (0, 0);
    }

    let old_content = match std::fs::read_to_string(&snapshot.old_rel_path) {
        Ok(content) => content,
        Err(_) => return (0, 0),
    };
    let new_content = match std::fs::read_to_string(&snapshot.new_rel_path) {
        Ok(content) => content,
        Err(_) => return (0, 0),
    };

    let mut additions = 0usize;
    let mut deletions = 0usize;
    for change in TextDiff::from_lines(&old_content, &new_content).iter_all_changes() {
        match change.tag() {
            similar::ChangeTag::Insert => additions += 1,
            similar::ChangeTag::Delete => deletions += 1,
            similar::ChangeTag::Equal => {}
        }
    }
    (additions, deletions)
}

fn review_message_visible_in_revision(
    message: &review_message::Model,
    comment_revision_guid: &str,
    target_revision_guid: &str,
    agent_runs: &[review_agent_run::Model],
) -> bool {
    let Some(run) = message
        .agent_run_guid
        .as_deref()
        .and_then(|guid| agent_runs.iter().find(|run| run.guid == guid))
    else {
        if message.author_type == "user" {
            return true;
        }
        return !agent_runs.iter().any(|run| {
            run.base_revision_guid == comment_revision_guid
                && target_revision_guid == run.base_revision_guid
                && message.created_at >= run.created_at
        });
    };

    if target_revision_guid == run.base_revision_guid {
        return false;
    }

    run.result_revision_guid
        .as_deref()
        .map(|result_revision_guid| target_revision_guid == result_revision_guid)
        .unwrap_or(false)
}

fn installed_review_fix_skill_path() -> String {
    std::env::var("HOME")
        .map(|home| {
            Path::new(&home)
                .join(".atmos/skills/.system/atmos-review-fix/SKILL.md")
                .to_string_lossy()
                .to_string()
        })
        .or_else(|_| {
            std::env::var("USER").map(|user| {
                Path::new("/Users")
                    .join(user)
                    .join(".atmos/skills/.system/atmos-review-fix/SKILL.md")
                    .to_string_lossy()
                    .to_string()
            })
        })
        .unwrap_or_else(|_| "~/.atmos/skills/.system/atmos-review-fix/SKILL.md".to_string())
}

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

#[derive(Debug, Clone, Deserialize)]
pub struct CreateReviewSessionInput {
    pub workspace_guid: String,
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
    #[serde(default)]
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
struct SessionManifest {
    schema_version: i32,
    session_guid: String,
    workspace_guid: String,
    repo_path: String,
    base_ref: Option<String>,
    base_commit: Option<String>,
    head_commit: String,
    created_at: String,
    file_count: usize,
}

#[derive(Debug, Clone, Serialize)]
struct RevisionManifestItem {
    revision_guid: String,
    parent_revision_guid: Option<String>,
    source_kind: String,
    agent_run_guid: Option<String>,
    storage_root_rel_path: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize)]
struct FileSnapshotMeta {
    schema_version: i32,
    file_path: String,
    git_status: String,
    is_binary: bool,
    old_rel_path: String,
    new_rel_path: String,
    old_sha256: String,
    new_sha256: String,
    old_size: usize,
    new_size: usize,
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

pub struct ReviewService {
    db: Arc<DatabaseConnection>,
    git_engine: GitEngine,
}

const VALID_RUN_KINDS: &[&str] = &["review", "fix"];
const VALID_EXECUTION_MODES: &[&str] = &["copy_prompt", "agent_chat", "terminal_cli"];

impl ReviewService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self {
            db,
            git_engine: GitEngine::new(),
        }
    }

    pub async fn list_sessions_by_workspace(
        &self,
        workspace_guid: String,
        include_archived: bool,
    ) -> Result<Vec<ReviewSessionDto>> {
        let repo = ReviewRepo::new(&self.db);
        let sessions = repo
            .list_sessions_by_workspace(&workspace_guid, include_archived)
            .await?;
        let mut items = Vec::with_capacity(sessions.len());
        for session in sessions {
            items.push(self.build_session_dto(session).await?);
        }
        Ok(items)
    }

    pub async fn get_session(&self, session_guid: String) -> Result<Option<ReviewSessionDto>> {
        let repo = ReviewRepo::new(&self.db);
        let Some(session) = repo.find_session_by_guid(&session_guid).await? else {
            return Ok(None);
        };
        Ok(Some(self.build_session_dto(session).await?))
    }

    pub async fn create_session(
        &self,
        input: CreateReviewSessionInput,
    ) -> Result<ReviewSessionDto> {
        let workspace_repo = WorkspaceRepo::new(&self.db);
        let project_repo = ProjectRepo::new(&self.db);
        let review_repo = ReviewRepo::new(&self.db);

        let workspace = workspace_repo
            .find_by_guid(&input.workspace_guid)
            .await?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Workspace {} not found", input.workspace_guid))
            })?;

        let project = project_repo
            .find_by_guid(&workspace.project_guid)
            .await?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Project {} not found", workspace.project_guid))
            })?;

        let workspace_root = self
            .git_engine
            .get_worktree_path(&workspace.name)
            .map_err(ServiceError::Engine)?;

        let changed = self
            .git_engine
            .get_changed_files(&workspace_root, Some(&workspace.base_branch), false)
            .map_err(ServiceError::Engine)?;

        let mut ordered_paths = Vec::new();
        let mut seen = HashSet::new();
        for file in changed
            .staged_files
            .iter()
            .chain(changed.unstaged_files.iter())
            .chain(changed.untracked_files.iter())
        {
            if seen.insert(file.path.clone()) {
                ordered_paths.push((file.path.clone(), file.status.clone()));
            }
        }

        if ordered_paths.is_empty() {
            return Err(ServiceError::Validation(
                "Cannot create a review session with no changed files".to_string(),
            ));
        }

        let session_guid = Uuid::new_v4().to_string();
        let revision_guid = Uuid::new_v4().to_string();
        let session_storage_root = session_root_abs_path(&session_guid)
            .map_err(ServiceError::Infra)?
            .to_string_lossy()
            .to_string();
        let revision_storage_root = revision_root_abs_path(&session_guid, &revision_guid)
            .map_err(ServiceError::Infra)?
            .to_string_lossy()
            .to_string();
        let head_commit = self
            .git_engine
            .get_head_commit(&workspace_root)
            .unwrap_or_else(|_| "HEAD".to_string());

        let session = review_repo
            .create_session(
                Some(session_guid.clone()),
                workspace.guid.clone(),
                project.guid.clone(),
                project.main_file_path.clone(),
                session_storage_root,
                changed.compare_ref.clone(),
                None,
                head_commit.clone(),
                revision_guid.clone(),
                "active".to_string(),
                input.title.clone(),
                input.created_by.clone(),
            )
            .await?;

        // From this point the `review_session` row already references a
        // `current_revision_guid` that does not yet exist on disk or in the DB.
        // If any step below fails we must soft-delete the session to avoid
        // leaving an orphaned row with a dangling forward reference.
        let build_result = self
            .populate_initial_session(
                &review_repo,
                &session,
                &revision_guid,
                &revision_storage_root,
                &workspace_root,
                ordered_paths,
                &workspace.base_branch,
                input.created_by.clone(),
                &project.main_file_path,
                &head_commit,
            )
            .await;

        match build_result {
            Ok(dto) => Ok(dto),
            Err(err) => {
                if let Err(cleanup_err) = review_repo.soft_delete_session(&session.guid).await {
                    tracing::warn!(
                        session_guid = %session.guid,
                        error = %cleanup_err,
                        "Failed to soft-delete review session after initial population error",
                    );
                }
                Err(err)
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    async fn populate_initial_session(
        &self,
        review_repo: &ReviewRepo<'_>,
        session: &review_session::Model,
        revision_guid: &str,
        revision_storage_root: &str,
        workspace_root: &Path,
        ordered_paths: Vec<(String, String)>,
        base_branch: &str,
        created_by: Option<String>,
        repo_path: &str,
        head_commit: &str,
    ) -> Result<ReviewSessionDto> {
        let revision = review_repo
            .create_revision(
                Some(revision_guid.to_string()),
                session.guid.clone(),
                None,
                "initial".to_string(),
                None,
                Some("Initial Review".to_string()),
                revision_storage_root.to_string(),
                None,
                created_by.clone(),
            )
            .await?;

        let mut file_count = 0usize;
        for (index, (file_path, status)) in ordered_paths.into_iter().enumerate() {
            let diff = self
                .git_engine
                .get_file_diff(workspace_root, &file_path, Some(base_branch))
                .map_err(ServiceError::Engine)?;
            let file_identity = review_repo
                .find_or_create_file_identity(session.guid.clone(), file_path.clone())
                .await?;
            let file_snapshot_guid = Uuid::new_v4().to_string();
            let (old_abs_path, new_abs_path, meta_abs_path) =
                anchor_file_snapshot_abs_paths(&session.guid, &revision.guid, &file_snapshot_guid)
                    .map_err(ServiceError::Infra)?;

            write_text_atomic(&old_abs_path, &diff.old_content)
                .await
                .map_err(ServiceError::Infra)?;
            write_text_atomic(&new_abs_path, &diff.new_content)
                .await
                .map_err(ServiceError::Infra)?;

            let meta = FileSnapshotMeta {
                schema_version: 1,
                file_path: file_path.clone(),
                git_status: status.clone(),
                is_binary: false,
                old_rel_path: old_abs_path.to_string_lossy().to_string(),
                new_rel_path: new_abs_path.to_string_lossy().to_string(),
                old_sha256: sha256_hex(&diff.old_content),
                new_sha256: sha256_hex(&diff.new_content),
                old_size: diff.old_content.len(),
                new_size: diff.new_content.len(),
            };
            write_json_atomic(&meta_abs_path, &meta)
                .await
                .map_err(ServiceError::Infra)?;

            let snapshot = review_repo
                .create_file_snapshot(
                    revision.guid.clone(),
                    file_identity.guid.clone(),
                    file_path.clone(),
                    status,
                    old_abs_path.to_string_lossy().to_string(),
                    new_abs_path.to_string_lossy().to_string(),
                    meta_abs_path.to_string_lossy().to_string(),
                    Some(meta.old_sha256.clone()),
                    Some(meta.new_sha256.clone()),
                    meta.old_size as i64,
                    meta.new_size as i64,
                    false,
                    index as i32,
                )
                .await?;

            review_repo
                .create_file_state(
                    revision.guid.clone(),
                    file_identity.guid.clone(),
                    snapshot.guid.clone(),
                    false,
                    None,
                    None,
                    None,
                    None,
                )
                .await?;
            file_count += 1;
        }

        let manifest = SessionManifest {
            schema_version: 1,
            session_guid: session.guid.clone(),
            workspace_guid: session.workspace_guid.clone(),
            repo_path: repo_path.to_string(),
            base_ref: session.base_ref.clone(),
            base_commit: session.base_commit.clone(),
            head_commit: head_commit.to_string(),
            created_at: session.created_at.to_string(),
            file_count,
        };
        let manifest_path = manifest_abs_path(&session.guid).map_err(ServiceError::Infra)?;
        write_json_atomic(&manifest_path, &manifest)
            .await
            .map_err(ServiceError::Infra)?;
        let revisions_manifest = vec![RevisionManifestItem {
            revision_guid: revision.guid.clone(),
            parent_revision_guid: None,
            source_kind: revision.source_kind.clone(),
            agent_run_guid: None,
            storage_root_rel_path: revision.storage_root_rel_path.clone(),
            created_at: revision.created_at.to_string(),
        }];
        let revisions_manifest_path =
            revisions_manifest_abs_path(&session.guid).map_err(ServiceError::Infra)?;
        write_json_atomic(&revisions_manifest_path, &revisions_manifest)
            .await
            .map_err(ServiceError::Infra)?;

        self.build_session_dto(session.clone()).await
    }

    async fn create_agent_run_revision(
        &self,
        review_repo: &ReviewRepo<'_>,
        session: &review_session::Model,
        base_revision: &review_revision::Model,
        run: &review_agent_run::Model,
    ) -> Result<ReviewRevisionDto> {
        let base_snapshots = review_repo
            .list_file_snapshots_by_revision(&base_revision.guid)
            .await
            .map_err(ServiceError::Infra)?;
        let base_states = review_repo
            .list_file_states_by_revision(&base_revision.guid)
            .await
            .map_err(ServiceError::Infra)?;
        let state_by_file_identity: HashMap<String, review_file_state::Model> = base_states
            .into_iter()
            .map(|state| (state.file_identity_guid.clone(), state))
            .collect();

        let revision_guid = Uuid::new_v4().to_string();
        let revision_storage_root = revision_root_abs_path(&session.guid, &revision_guid)
            .map_err(ServiceError::Infra)?
            .to_string_lossy()
            .to_string();
        let revisions_before = review_repo
            .list_revisions_by_session(&session.guid)
            .await
            .map_err(ServiceError::Infra)?;
        let (source_kind, title) = match run.run_kind.as_str() {
            "review" => ("agent_review", format!("Review Checkpoint {}", revisions_before.len())),
            "fix" => ("agent_fix", format!("Fix Run {}", revisions_before.len())),
            _ => ("agent_run", format!("Agent Run {}", revisions_before.len())),
        };
        let revision = review_repo
            .create_revision(
                Some(revision_guid.clone()),
                session.guid.clone(),
                Some(base_revision.guid.clone()),
                source_kind.to_string(),
                Some(run.guid.clone()),
                Some(title),
                revision_storage_root.clone(),
                Some(base_revision.guid.clone()),
                run.created_by.clone(),
            )
            .await
            .map_err(ServiceError::Infra)?;

        let mut snapshot_guid_map: HashMap<String, String> = HashMap::new();
        for (index, snapshot) in base_snapshots.into_iter().enumerate() {
            let old_content = std::fs::read_to_string(&snapshot.old_rel_path).unwrap_or_default();
            let new_content = std::fs::read_to_string(&snapshot.new_rel_path).unwrap_or_default();
            let file_snapshot_guid = Uuid::new_v4().to_string();
            let (old_abs_path, new_abs_path, meta_abs_path) =
                anchor_file_snapshot_abs_paths(&session.guid, &revision.guid, &file_snapshot_guid)
                    .map_err(ServiceError::Infra)?;
            write_text_atomic(&old_abs_path, &old_content)
                .await
                .map_err(ServiceError::Infra)?;
            write_text_atomic(&new_abs_path, &new_content)
                .await
                .map_err(ServiceError::Infra)?;

            let meta = FileSnapshotMeta {
                schema_version: 1,
                file_path: snapshot.file_path.clone(),
                git_status: snapshot.git_status.clone(),
                is_binary: snapshot.is_binary,
                old_rel_path: old_abs_path.to_string_lossy().to_string(),
                new_rel_path: new_abs_path.to_string_lossy().to_string(),
                old_sha256: sha256_hex(&old_content),
                new_sha256: sha256_hex(&new_content),
                old_size: old_content.len(),
                new_size: new_content.len(),
            };
            write_json_atomic(&meta_abs_path, &meta)
                .await
                .map_err(ServiceError::Infra)?;

            let next_snapshot = review_repo
                .create_file_snapshot(
                    revision.guid.clone(),
                    snapshot.file_identity_guid.clone(),
                    snapshot.file_path.clone(),
                    snapshot.git_status.clone(),
                    old_abs_path.to_string_lossy().to_string(),
                    new_abs_path.to_string_lossy().to_string(),
                    meta_abs_path.to_string_lossy().to_string(),
                    Some(meta.old_sha256.clone()),
                    Some(meta.new_sha256.clone()),
                    meta.old_size as i64,
                    meta.new_size as i64,
                    snapshot.is_binary,
                    index as i32,
                )
                .await
                .map_err(ServiceError::Infra)?;
            snapshot_guid_map.insert(snapshot.guid.clone(), next_snapshot.guid.clone());

            let prior_state = state_by_file_identity
                .get(&snapshot.file_identity_guid)
                .ok_or_else(|| {
                    ServiceError::Processing(format!(
                        "Missing base file state for identity {}",
                        snapshot.file_identity_guid
                    ))
                })?;
            review_repo
                .create_file_state(
                    revision.guid.clone(),
                    snapshot.file_identity_guid.clone(),
                    next_snapshot.guid,
                    prior_state.reviewed,
                    prior_state.reviewed_at,
                    prior_state.reviewed_by.clone(),
                    Some(prior_state.guid.clone()),
                    prior_state.last_code_change_at,
                )
                .await
                .map_err(ServiceError::Infra)?;
        }

        let base_comments = review_repo
            .list_comments_by_revision(&base_revision.guid)
            .await
            .map_err(ServiceError::Infra)?;
        for base_comment in &base_comments {
            let Some(new_snapshot_guid) = snapshot_guid_map.get(&base_comment.file_snapshot_guid)
            else {
                continue;
            };
            review_repo
                .create_comment(
                    session.guid.clone(),
                    revision.guid.clone(),
                    new_snapshot_guid.clone(),
                    base_comment.anchor_side.clone(),
                    base_comment.anchor_start_line,
                    base_comment.anchor_end_line,
                    base_comment.anchor_line_range_kind.clone(),
                    base_comment.anchor_json.clone(),
                    base_comment.status.clone(),
                    Some(base_comment.guid.clone()),
                    base_comment.title.clone(),
                    base_comment.created_by.clone(),
                )
                .await
                .map_err(ServiceError::Infra)?;
        }

        review_repo
            .update_agent_run_status(
                &run.guid,
                &run.status,
                Some(revision.guid.clone()),
                Some(revision_storage_root),
                None,
                None,
                None,
                None,
                None,
                false,
            )
            .await
            .map_err(ServiceError::Infra)?;
        review_repo
            .update_session_current_revision(&session.guid, &revision.guid)
            .await
            .map_err(ServiceError::Infra)?;

        Ok(ReviewRevisionDto {
            files: self.list_files_by_revision(revision.guid.clone()).await?,
            model: revision,
        })
    }

    pub async fn close_session(&self, session_guid: String) -> Result<()> {
        ReviewRepo::new(&self.db)
            .update_session_status(&session_guid, "closed")
            .await
            .map_err(ServiceError::Infra)
    }

    pub async fn archive_session(&self, session_guid: String) -> Result<()> {
        ReviewRepo::new(&self.db)
            .update_session_status(&session_guid, "archived")
            .await
            .map_err(ServiceError::Infra)
    }

    pub async fn activate_session(&self, session_guid: String) -> Result<()> {
        ReviewRepo::new(&self.db)
            .update_session_status(&session_guid, "active")
            .await
            .map_err(ServiceError::Infra)
    }

    pub async fn rename_session(&self, session_guid: String, title: String) -> Result<()> {
        ReviewRepo::new(&self.db)
            .update_session_title(&session_guid, &title)
            .await
            .map_err(ServiceError::Infra)
    }

    pub async fn list_files_by_revision(
        &self,
        revision_guid: String,
    ) -> Result<Vec<ReviewFileDto>> {
        let review_repo = ReviewRepo::new(&self.db);
        let snapshots = review_repo
            .list_file_snapshots_by_revision(&revision_guid)
            .await?;
        let states = review_repo
            .list_file_states_by_revision(&revision_guid)
            .await?;
        let state_by_snapshot: HashMap<String, review_file_state::Model> = states
            .into_iter()
            .map(|item| (item.file_snapshot_guid.clone(), item))
            .collect();
        let comments = review_repo
            .list_comments_by_revision(&revision_guid)
            .await?;
        let mut open_comment_count_by_snapshot: HashMap<String, usize> = HashMap::new();
        for comment in comments {
            if is_open_review_comment_status(&comment.status) {
                *open_comment_count_by_snapshot
                    .entry(comment.file_snapshot_guid.clone())
                    .or_default() += 1;
            }
        }

        snapshots
            .into_iter()
            .map(|snapshot| {
                let state = state_by_snapshot
                    .get(&snapshot.guid)
                    .cloned()
                    .ok_or_else(|| {
                        ServiceError::Processing(format!(
                            "Missing review_file_state for snapshot {}",
                            snapshot.guid
                        ))
                    })?;
                let changed_after_review = state
                    .reviewed_at
                    .zip(state.last_code_change_at)
                    .map(|(reviewed_at, changed_at)| changed_at > reviewed_at)
                    .unwrap_or(false);
                let (additions, deletions) = count_review_snapshot_changes(&snapshot);
                Ok(ReviewFileDto {
                    open_comment_count: *open_comment_count_by_snapshot
                        .get(&snapshot.guid)
                        .unwrap_or(&0),
                    snapshot,
                    state,
                    changed_after_review,
                    additions,
                    deletions,
                })
            })
            .collect()
    }

    pub async fn set_file_reviewed(&self, input: SetReviewFileReviewedInput) -> Result<()> {
        ReviewRepo::new(&self.db)
            .update_file_reviewed(&input.file_state_guid, input.reviewed, input.reviewed_by)
            .await
            .map_err(ServiceError::Infra)
    }

    pub async fn list_comments(
        &self,
        session_guid: String,
        revision_guid: Option<String>,
    ) -> Result<Vec<ReviewCommentDto>> {
        let review_repo = ReviewRepo::new(&self.db);
        let target_revision_guid = revision_guid.clone();
        let comments = if let Some(revision_guid) = revision_guid.as_deref() {
            review_repo.list_comments_by_revision(revision_guid).await?
        } else {
            review_repo.list_comments_by_session(&session_guid).await?
        };
        let agent_runs = if target_revision_guid.is_some() {
            review_repo
                .list_agent_runs_by_session(&session_guid)
                .await
                .map_err(ServiceError::Infra)?
        } else {
            Vec::new()
        };
        let comment_guids: Vec<String> = comments.iter().map(|item| item.guid.clone()).collect();
        let messages = review_repo
            .list_messages_by_comment_guids(&comment_guids)
            .await?;
        let mut messages_by_comment: HashMap<String, Vec<review_message::Model>> = HashMap::new();
        for message in messages {
            messages_by_comment
                .entry(message.comment_guid.clone())
                .or_default()
                .push(message);
        }

        let parent_guids: Vec<String> = comments
            .iter()
            .filter_map(|t| t.parent_comment_guid.clone())
            .collect();
        let mut ancestor_comment_cache: HashMap<String, review_comment::Model> = HashMap::new();
        for parent_guid in &parent_guids {
            Self::resolve_ancestor_comments(
                parent_guid.clone(),
                &review_repo,
                &mut ancestor_comment_cache,
            )
            .await?;
        }
        let all_ancestor_guids: Vec<String> = ancestor_comment_cache.keys().cloned().collect();
        let mut ancestor_messages: HashMap<String, Vec<review_message::Model>> = HashMap::new();
        if !all_ancestor_guids.is_empty() {
            let ancestor_msgs = review_repo
                .list_messages_by_comment_guids(&all_ancestor_guids)
                .await?;
            for msg in ancestor_msgs {
                ancestor_messages
                    .entry(msg.comment_guid.clone())
                    .or_default()
                    .push(msg);
            }
        }

        let mut items = Vec::with_capacity(comments.len());
        for comment in comments {
            let comment_guid = comment.guid.clone();
            let mut comment_messages = messages_by_comment
                .remove(&comment_guid)
                .unwrap_or_default();
            if let Some(target_revision) = target_revision_guid.as_deref() {
                comment_messages.retain(|message| {
                    review_message_visible_in_revision(
                        message,
                        &comment.revision_guid,
                        target_revision,
                        &agent_runs,
                    )
                });
            }
            if let Some(ref parent_guid) = comment.parent_comment_guid {
                let mut chain_guids = vec![parent_guid.clone()];
                let mut cursor = parent_guid.clone();
                loop {
                    if let Some(ancestor) = ancestor_comment_cache.get(&cursor) {
                        if let Some(ref pg) = ancestor.parent_comment_guid {
                            if !chain_guids.contains(pg) {
                                chain_guids.push(pg.clone());
                                cursor = pg.clone();
                                continue;
                            }
                        }
                    }
                    break;
                }
                for guid in &chain_guids {
                    if let Some(ancestor_msgs) = ancestor_messages.get(guid).cloned() {
                        let ancestor_revision_guid = ancestor_comment_cache
                            .get(guid)
                            .map(|ancestor| ancestor.revision_guid.as_str())
                            .unwrap_or(comment.revision_guid.as_str());
                        if let Some(target_revision) = target_revision_guid.as_deref() {
                            comment_messages.extend(ancestor_msgs.into_iter().filter(|message| {
                                review_message_visible_in_revision(
                                    message,
                                    ancestor_revision_guid,
                                    target_revision,
                                    &agent_runs,
                                )
                            }));
                        } else {
                            comment_messages.extend(ancestor_msgs);
                        }
                    }
                }
            }
            comment_messages.sort_by_key(|m| m.created_at);
            items.push(
                self.to_comment_dto(comment, comment_messages, Some(session_guid.clone()))
                    .await?,
            );
        }
        Ok(items)
    }

    async fn resolve_ancestor_comments(
        parent_guid: String,
        repo: &ReviewRepo<'_>,
        cache: &mut HashMap<String, review_comment::Model>,
    ) -> Result<()> {
        if cache.contains_key(&parent_guid) {
            return Ok(());
        }
        if let Some(comment) = repo
            .find_comment_by_guid(&parent_guid)
            .await
            .map_err(ServiceError::Infra)?
        {
            if let Some(ref pg) = comment.parent_comment_guid {
                Box::pin(Self::resolve_ancestor_comments(pg.clone(), repo, cache)).await?;
            }
            cache.insert(parent_guid, comment);
        }
        Ok(())
    }

    pub async fn create_comment_by_file_path(
        &self,
        input: CreateReviewCommentByFilePathInput,
    ) -> Result<ReviewCommentDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let session = review_repo
            .find_session_by_guid(&input.session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review session {} not found", input.session_guid))
            })?;
        if input.revision_guid != session.current_revision_guid {
            return Err(ServiceError::Validation(format!(
                "Cannot create comment on sealed revision {} (current is {})",
                input.revision_guid, session.current_revision_guid
            )));
        }
        if input.side != "new" && input.side != "old" {
            return Err(ServiceError::Validation(
                "Review comment side must be either 'new' or 'old'".to_string(),
            ));
        }
        if input.start_line <= 0 || input.end_line < input.start_line {
            return Err(ServiceError::Validation(
                "Review comment line range must be positive and end_line must be >= start_line"
                    .to_string(),
            ));
        }

        let file_snapshots = review_repo
            .list_file_snapshots_by_revision(&input.revision_guid)
            .await
            .map_err(ServiceError::Infra)?;
        let requested_path = if let Ok(path) =
            Path::new(&input.file_path).strip_prefix(Path::new(&session.repo_path))
        {
            normalize_review_file_path(&path.to_string_lossy())
        } else {
            normalize_review_file_path(&input.file_path)
        };
        let file_snapshot = file_snapshots
            .into_iter()
            .find(|fs| normalize_review_file_path(&fs.file_path) == requested_path)
            .ok_or_else(|| {
                ServiceError::NotFound(format!(
                    "File snapshot not found for path '{}' in revision {}",
                    input.file_path, input.revision_guid
                ))
            })?;

        let comment = review_repo
            .create_comment(
                input.session_guid,
                input.revision_guid,
                file_snapshot.guid.clone(),
                input.side.clone(),
                input.start_line,
                input.end_line,
                "line".to_string(),
                serde_json::to_string(&json!({
                    "side": input.side,
                    "start_line": input.start_line,
                    "end_line": input.end_line,
                    "line_range_kind": "line"
                }))
                .map_err(|error| ServiceError::Processing(error.to_string()))?,
                "open".to_string(),
                None,
                input.title,
                Some(input.author_type.clone()),
            )
            .await
            .map_err(ServiceError::Infra)?;
        let message = self
            .create_message(AddReviewMessageInput {
                comment_guid: comment.guid.clone(),
                author_type: input.author_type,
                kind: "comment".to_string(),
                body: input.body,
                agent_run_guid: input.agent_run_guid,
            })
            .await?;
        Ok(ReviewCommentDto {
            anchor: serde_json::to_value(&json!({
                "side": input.side,
                "start_line": input.start_line,
                "end_line": input.end_line,
                "line_range_kind": "line"
            }))
            .map_err(|error| ServiceError::Processing(error.to_string()))?,
            messages: vec![message],
            model: comment,
        })
    }

    pub async fn create_comment(
        &self,
        input: CreateReviewCommentInput,
    ) -> Result<ReviewCommentDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let session = review_repo
            .find_session_by_guid(&input.session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review session {} not found", input.session_guid))
            })?;
        if input.revision_guid != session.current_revision_guid {
            return Err(ServiceError::Validation(format!(
                "Cannot create comment on sealed revision {} (current is {})",
                input.revision_guid, session.current_revision_guid
            )));
        }
        let comment = review_repo
            .create_comment(
                input.session_guid,
                input.revision_guid,
                input.file_snapshot_guid,
                input.anchor.side.clone(),
                input.anchor.start_line,
                input.anchor.end_line,
                input.anchor.line_range_kind.clone(),
                serde_json::to_string(&input.anchor)
                    .map_err(|error| ServiceError::Processing(error.to_string()))?,
                "open".to_string(),
                input.parent_comment_guid,
                input.title,
                input.created_by,
            )
            .await
            .map_err(ServiceError::Infra)?;
        let message = self
            .create_message(AddReviewMessageInput {
                comment_guid: comment.guid.clone(),
                author_type: "user".to_string(),
                kind: "comment".to_string(),
                body: input.body,
                agent_run_guid: None,
            })
            .await?;
        Ok(ReviewCommentDto {
            anchor: serde_json::to_value(&input.anchor)
                .map_err(|error| ServiceError::Processing(error.to_string()))?,
            messages: vec![message],
            model: comment,
        })
    }

    pub async fn create_message(&self, input: AddReviewMessageInput) -> Result<ReviewMessageDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let comment = review_repo
            .find_comment_by_guid(&input.comment_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review comment {} not found", input.comment_guid))
            })?;
        let session = review_repo
            .find_session_by_guid(&comment.session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review session {} not found", comment.session_guid))
            })?;
        if comment.revision_guid != session.current_revision_guid {
            return Err(ServiceError::Validation(format!(
                "Cannot add message to comment on sealed revision {} (current is {})",
                comment.revision_guid, session.current_revision_guid
            )));
        }
        let effective_agent_run_guid = if input.agent_run_guid.is_none() && input.author_type != "user"
        {
            let active_runs = review_repo
                .list_agent_runs_by_session(&comment.session_guid)
                .await
                .map_err(ServiceError::Infra)?
                .into_iter()
                .filter(|run| {
                    let matches_revision = run.base_revision_guid == comment.revision_guid
                        || run.result_revision_guid.as_deref() == Some(&comment.revision_guid);
                    matches_revision && (run.status == "pending" || run.status == "running")
                })
                .collect::<Vec<_>>();
            if active_runs.len() == 1 {
                Some(active_runs[0].guid.clone())
            } else {
                None
            }
        } else {
            input.agent_run_guid.clone()
        };

        if let Some(run_guid) = effective_agent_run_guid.as_deref() {
            if let Some(run) = review_repo
                .find_agent_run_by_guid(run_guid)
                .await
                .map_err(ServiceError::Infra)?
            {
                if run.status == "pending" {
                    self.mark_agent_run_running(run.guid.clone()).await?;
                }
            }
        }
        let (body_storage_kind, body, body_rel_path, body_full) =
            if input.body.len() > MESSAGE_INLINE_LIMIT {
                let abs_path = run_root_abs_path(
                    &comment.session_guid,
                    effective_agent_run_guid.as_deref().unwrap_or("message"),
                )
                .map_err(ServiceError::Infra)?
                .join("messages")
                .join(format!("{}.md", Uuid::new_v4()));
                write_text_atomic(&abs_path, &input.body)
                    .await
                    .map_err(ServiceError::Infra)?;
                (
                    "file".to_string(),
                    input.body.chars().take(500).collect(),
                    Some(abs_path.to_string_lossy().to_string()),
                    input.body,
                )
            } else {
                ("inline".to_string(), input.body.clone(), None, input.body)
            };

        let message = review_repo
            .create_message(
                input.comment_guid,
                input.author_type,
                input.kind,
                body_storage_kind,
                body,
                body_rel_path,
                effective_agent_run_guid,
            )
            .await
            .map_err(ServiceError::Infra)?;

        Ok(ReviewMessageDto {
            body_full,
            model: message,
        })
    }

    pub async fn update_message(
        &self,
        input: UpdateReviewMessageInput,
    ) -> Result<ReviewMessageDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let message = review_repo
            .find_message_by_guid(&input.message_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review message {} not found", input.message_guid,))
            })?;
        let comment = review_repo
            .find_comment_by_guid(&message.comment_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review comment {} not found", message.comment_guid))
            })?;

        let (body_storage_kind, body, body_rel_path, body_full) =
            if input.body.len() > MESSAGE_INLINE_LIMIT {
                let abs_path = run_root_abs_path(
                    &comment.session_guid,
                    message.agent_run_guid.as_deref().unwrap_or("message"),
                )
                .map_err(ServiceError::Infra)?
                .join("messages")
                .join(format!("{}.md", Uuid::new_v4()));
                write_text_atomic(&abs_path, &input.body)
                    .await
                    .map_err(ServiceError::Infra)?;
                (
                    "file".to_string(),
                    input.body.chars().take(500).collect(),
                    Some(abs_path.to_string_lossy().to_string()),
                    input.body,
                )
            } else {
                ("inline".to_string(), input.body.clone(), None, input.body)
            };

        let message = review_repo
            .update_message_body(&message.guid, body_storage_kind, body, body_rel_path)
            .await
            .map_err(ServiceError::Infra)?;
        review_repo
            .touch_comment(&message.comment_guid)
            .await
            .map_err(ServiceError::Infra)?;

        Ok(ReviewMessageDto {
            body_full,
            model: message,
        })
    }

    pub async fn delete_message(&self, input: DeleteReviewMessageInput) -> Result<String> {
        let review_repo = ReviewRepo::new(&self.db);
        let message = review_repo
            .find_message_by_guid(&input.message_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review message {} not found", input.message_guid,))
            })?;

        let mut messages = review_repo
            .list_messages_by_comment_guids(&[message.comment_guid.clone()])
            .await
            .map_err(ServiceError::Infra)?;
        messages.sort_by_key(|item| item.created_at);

        review_repo
            .soft_delete_message(&message.guid)
            .await
            .map_err(ServiceError::Infra)?;

        // Get the comment to check if it has a parent (for inheritance chain)
        let comment = review_repo
            .find_comment_by_guid(&message.comment_guid)
            .await
            .map_err(ServiceError::Infra)?;

        // Only soft-delete the comment if:
        // 1. It has only 1 message (the one being deleted)
        // 2. AND it has no parent_comment_guid (not part of an inheritance chain)
        // Child comments with parent_comment_guid should be preserved to maintain the chain
        let should_delete_comment = messages.len() == 1
            && comment
                .as_ref()
                .map_or(true, |c| c.parent_comment_guid.is_none());

        if should_delete_comment {
            review_repo
                .soft_delete_comment(&message.comment_guid)
                .await
                .map_err(ServiceError::Infra)?;
        } else {
            review_repo
                .touch_comment(&message.comment_guid)
                .await
                .map_err(ServiceError::Infra)?;
        }

        Ok(message.comment_guid)
    }

    pub async fn update_comment_status(&self, input: UpdateReviewCommentStatusInput) -> Result<()> {
        if !is_valid_review_comment_status(&input.status) {
            return Err(ServiceError::Validation(format!(
                "Invalid review comment status: {}",
                input.status
            )));
        }
        let review_repo = ReviewRepo::new(&self.db);
        let comment = review_repo
            .find_comment_by_guid(&input.comment_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review comment {} not found", input.comment_guid))
            })?;
        let session = review_repo
            .find_session_by_guid(&comment.session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review session {} not found", comment.session_guid))
            })?;
        if comment.revision_guid != session.current_revision_guid {
            return Err(ServiceError::Validation(format!(
                "Cannot update comment on sealed revision {} (current is {})",
                comment.revision_guid, session.current_revision_guid
            )));
        }
        review_repo
            .update_comment_status(&input.comment_guid, &input.status)
            .await
            .map_err(ServiceError::Infra)
    }

    pub async fn set_agent_run_status(
        &self,
        input: SetReviewAgentRunStatusInput,
    ) -> Result<ReviewAgentRunStatusDto> {
        match input.status.as_str() {
            "running" => self
                .mark_agent_run_running(input.run_guid)
                .await
                .map(|run| ReviewAgentRunStatusDto::Run { run }),
            "succeeded" => {
                self.mark_agent_run_running(input.run_guid.clone()).await?;
                if let Some(summary) = input.summary.filter(|value| !value.trim().is_empty()) {
                    self.write_run_summary(input.run_guid.clone(), summary)
                        .await?;
                }
                self.finalize_agent_run(input.run_guid, input.title)
                    .await
                    .map(ReviewAgentRunStatusDto::Finalized)
            }
            "failed" => self
                .mark_agent_run_failed(input.run_guid, input.message)
                .await
                .map(|run| ReviewAgentRunStatusDto::Run { run }),
            status => Err(ServiceError::Validation(format!(
                "Invalid review agent run status: {}",
                status
            ))),
        }
    }

    pub async fn mark_agent_run_running(&self, run_guid: String) -> Result<review_agent_run::Model> {
        let review_repo = ReviewRepo::new(&self.db);
        let run = review_repo
            .find_agent_run_by_guid(&run_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run_guid))
            })?;
        if run.status == "succeeded" || run.status == "failed" {
            return Ok(run);
        }
        let has_other_running_run = review_repo
            .list_agent_runs_by_session(&run.session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .into_iter()
            .any(|item| item.guid != run.guid && item.status == "running");
        if has_other_running_run {
            return Err(ServiceError::Validation(
                "A review agent run is already running for this session".to_string(),
            ));
        }
        review_repo
            .update_agent_run_status(
                &run.guid,
                "running",
                None,
                None,
                None,
                None,
                if run.started_at.is_none() {
                    Some(chrono::Utc::now().naive_utc())
                } else {
                    None
                },
                None,
                None,
                false,
            )
            .await
            .map_err(ServiceError::Infra)?;
        review_repo
            .find_agent_run_by_guid(&run.guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review agent run {} not found", run.guid)))
    }

    pub async fn mark_agent_run_failed(
        &self,
        run_guid: String,
        message: Option<String>,
    ) -> Result<review_agent_run::Model> {
        let review_repo = ReviewRepo::new(&self.db);
        let run = review_repo
            .find_agent_run_by_guid(&run_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run_guid))
            })?;
        if run.status == "succeeded" || run.status == "failed" {
            return Ok(run);
        }
        let now = chrono::Utc::now().naive_utc();
        review_repo
            .update_agent_run_status(
                &run.guid,
                "failed",
                None,
                None,
                None,
                None,
                if run.started_at.is_none() {
                    Some(now)
                } else {
                    None
                },
                Some(now),
                Some(
                    message
                        .filter(|value| !value.trim().is_empty())
                        .unwrap_or_else(|| "Review agent run failed".to_string()),
                ),
                false,
            )
            .await
            .map_err(ServiceError::Infra)?;
        review_repo
            .find_agent_run_by_guid(&run.guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review agent run {} not found", run.guid)))
    }

    pub async fn create_agent_run(
        &self,
        input: CreateReviewAgentRunInput,
    ) -> Result<ReviewAgentRunCreatedDto> {
        // Validate run_kind
        if !VALID_RUN_KINDS.contains(&input.run_kind.as_str()) {
            return Err(ServiceError::Validation(
                format!("Invalid run_kind: {}. Must be one of: {:?}", input.run_kind, VALID_RUN_KINDS)
            ));
        }
        
        // Validate execution_mode
        if !VALID_EXECUTION_MODES.contains(&input.execution_mode.as_str()) {
            return Err(ServiceError::Validation(
                format!("Invalid execution_mode: {}. Must be one of: {:?}", input.execution_mode, VALID_EXECUTION_MODES)
            ));
        }
        if input.run_kind == "review"
            && input
                .skill_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_none()
        {
            return Err(ServiceError::Validation(
                "Review agent runs require skill_id".to_string(),
            ));
        }
        
        let review_repo = ReviewRepo::new(&self.db);
        let session = review_repo
            .find_session_by_guid(&input.session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review session {} not found", input.session_guid))
            })?;
        if input.execution_mode != "copy_prompt" {
            let has_running_run = review_repo
                .list_agent_runs_by_session(&session.guid)
                .await
                .map_err(ServiceError::Infra)?
                .into_iter()
                .any(|run| run.status == "running");
            if has_running_run {
                return Err(ServiceError::Validation(
                    "A review agent run is already running for this session".to_string(),
                ));
            }
        }
        let base_revision = review_repo
            .find_revision_by_guid(&input.base_revision_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!(
                    "Review revision {} not found",
                    input.base_revision_guid
                ))
            })?;
        let base_comments = self
            .list_comments(session.guid.clone(), Some(input.base_revision_guid.clone()))
            .await?;
        let selected_set: HashSet<String> = input.selected_comment_guids.into_iter().collect();
        let selected_base_comment_guids: HashSet<String> = base_comments
            .iter()
            .filter_map(|comment| {
                if !selected_set.is_empty() {
                    selected_set
                        .contains(&comment.model.guid)
                        .then(|| comment.model.guid.clone())
                } else if is_open_review_comment_status(&comment.model.status) {
                    Some(comment.model.guid.clone())
                } else {
                    None
                }
            })
            .collect();
        
        // Only fix runs require selected comments
        if input.run_kind == "fix" && selected_base_comment_guids.is_empty() {
            return Err(ServiceError::Validation(
                "No review comments selected for fix run".to_string(),
            ));
        }

        let run = review_repo
            .create_agent_run(
                session.guid.clone(),
                input.base_revision_guid.clone(),
                input.run_kind.clone(),
                input.execution_mode.clone(),
                input.skill_id.clone(),
                None,
                input.created_by.clone(),
            )
            .await
            .map_err(ServiceError::Infra)?;
        let revision = self
            .create_agent_run_revision(&review_repo, &session, &base_revision, &run)
            .await?;
        let mut session_for_prompt = session.clone();
        session_for_prompt.current_revision_guid = revision.model.guid.clone();
        let run = review_repo
            .find_agent_run_by_guid(&run.guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run.guid))
            })?;
        
        // Dispatch prompt rendering based on run_kind
        let prompt = match input.run_kind.as_str() {
            "review" => self.render_review_prompt(&session_for_prompt, &run, &base_revision, &base_comments)?,
            "fix" => {
                let selected_comments: Vec<ReviewCommentDto> = self
                    .list_comments(session.guid.clone(), Some(revision.model.guid.clone()))
                    .await?
                    .into_iter()
                    .filter(|comment| {
                        comment
                            .model
                            .parent_comment_guid
                            .as_ref()
                            .map(|parent_guid| selected_base_comment_guids.contains(parent_guid))
                            .unwrap_or_else(|| selected_base_comment_guids.contains(&comment.model.guid))
                    })
                    .collect();
                self.render_fix_prompt(&session_for_prompt, &run, &selected_comments)?
            }
            _ => return Err(ServiceError::Validation(
                format!("Invalid run_kind: {}", input.run_kind)
            )),
        };
        let prompt_abs_path = run_root_abs_path(&session.guid, &run.guid)
            .map_err(ServiceError::Infra)?
            .join("prompt.md");
        write_text_atomic(&prompt_abs_path, &prompt)
            .await
            .map_err(ServiceError::Infra)?;
        review_repo
            .update_agent_run_prompt_rel_path(
                &run.guid,
                &prompt_abs_path.to_string_lossy().to_string(),
            )
            .await
            .map_err(ServiceError::Infra)?;
        if input.execution_mode != "copy_prompt" {
            review_repo
                .update_agent_run_status(
                    &run.guid,
                    "running",
                    None,
                    None,
                    None,
                    None,
                    Some(chrono::Utc::now().naive_utc()),
                    None,
                    None,
                    false,
                )
                .await
                .map_err(ServiceError::Infra)?;
        }

        let updated_run = review_repo
            .find_agent_run_by_guid(&run.guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run.guid))
            })?;

        Ok(ReviewAgentRunCreatedDto {
            run: updated_run,
            revision,
            prompt,
        })
    }

    pub async fn list_agent_runs(&self, session_guid: String) -> Result<Vec<review_agent_run::Model>> {
        ReviewRepo::new(&self.db)
            .list_agent_runs_by_session(&session_guid)
            .await
            .map_err(ServiceError::Infra)
    }

    pub async fn get_comment_context(
        &self,
        comment_guid: String,
    ) -> Result<ReviewCommentContextDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let comment = review_repo
            .find_comment_by_guid(&comment_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review comment {} not found", comment_guid))
            })?;
        let session = review_repo
            .find_session_by_guid(&comment.session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review session {} not found", comment.session_guid))
            })?;
        let revision = review_repo
            .find_revision_by_guid(&comment.revision_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!(
                    "Review revision {} not found",
                    comment.revision_guid
                ))
            })?;
        let file_snapshot = review_repo
            .find_file_snapshot_by_guid(&comment.file_snapshot_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!(
                    "Review file snapshot {} not found",
                    comment.file_snapshot_guid
                ))
            })?;
        let messages = review_repo
            .list_messages_by_comment_guids(std::slice::from_ref(&comment.guid))
            .await
            .map_err(ServiceError::Infra)?;
        let comment = self
            .to_comment_dto(comment, messages, Some(session.guid.clone()))
            .await?;
        Ok(ReviewCommentContextDto {
            old_file_abs_path: file_snapshot.old_rel_path.clone(),
            new_file_abs_path: file_snapshot.new_rel_path.clone(),
            workspace_root: "".to_string(), // No longer needed as paths are absolute
            session,
            revision,
            file_snapshot,
            comment,
        })
    }

    pub async fn get_file_content(
        &self,
        file_snapshot_guid: String,
    ) -> Result<ReviewFileContentDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let file_snapshot = review_repo
            .find_file_snapshot_by_guid(&file_snapshot_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!(
                    "Review file snapshot {} not found",
                    file_snapshot_guid
                ))
            })?;
        let old_content = std::fs::read_to_string(&file_snapshot.old_rel_path)
            .map_err(|error| ServiceError::Infra(infra::InfraError::Io(error)))?;
        let new_content = std::fs::read_to_string(&file_snapshot.new_rel_path)
            .map_err(|error| ServiceError::Infra(infra::InfraError::Io(error)))?;

        Ok(ReviewFileContentDto {
            file_snapshot,
            old_content,
            new_content,
        })
    }

    pub async fn get_run_artifact(
        &self,
        run_guid: String,
        kind: String,
    ) -> Result<ReviewRunArtifactDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let run = review_repo
            .find_agent_run_by_guid(&run_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run_guid))
            })?;
        let abs_path = match kind.as_str() {
            "prompt" => run.prompt_rel_path.clone(),
            "patch" => run.patch_rel_path.clone(),
            "summary" => run.summary_rel_path.clone(),
            _ => {
                return Err(ServiceError::Validation(format!(
                    "Unsupported review run artifact kind: {}",
                    kind
                )))
            }
        }
        .ok_or_else(|| {
            ServiceError::NotFound(format!(
                "Review agent run {} has no {} artifact",
                run.guid, kind
            ))
        })?;
        let content = std::fs::read_to_string(&abs_path)
            .map_err(|error| ServiceError::Infra(infra::InfraError::Io(error)))?;

        Ok(ReviewRunArtifactDto { run, kind, content })
    }

    pub async fn write_run_summary(
        &self,
        run_guid: String,
        body: String,
    ) -> Result<review_agent_run::Model> {
        let review_repo = ReviewRepo::new(&self.db);
        let run = review_repo
            .find_agent_run_by_guid(&run_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run_guid))
            })?;
        let summary_abs_path = run_root_abs_path(&run.session_guid, &run.guid)
            .map_err(ServiceError::Infra)?
            .join("summary.md");
        write_text_atomic(&summary_abs_path, &body)
            .await
            .map_err(ServiceError::Infra)?;
        if run.status == "pending" {
            self.mark_agent_run_running(run.guid.clone()).await?;
        }
        // Persist only the summary artifact path. The run's lifecycle status
        // must remain the caller's current status (typically "running") — only
        // `finalize_agent_run` is allowed to transition the run to a terminal
        // state (`succeeded` / `failed`), and only once the result revision
        // and patch artifact are also persisted.
        review_repo
            .update_agent_run_summary_path(
                &run.guid,
                summary_abs_path.to_string_lossy().to_string(),
                if run.started_at.is_none() {
                    Some(chrono::Utc::now().naive_utc())
                } else {
                    None
                },
                None,
            )
            .await
            .map_err(ServiceError::Infra)?;
        review_repo
            .find_agent_run_by_guid(&run.guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review agent run {} not found", run.guid)))
    }

    pub async fn finalize_agent_run(
        &self,
        run_guid: String,
        _title: Option<String>,
    ) -> Result<ReviewAgentRunFinalizedDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let run = review_repo
            .find_agent_run_by_guid(&run_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Review agent run {} not found", run_guid))
            })?;
        if run.status == "succeeded" {
            let target_revision_guid = run.result_revision_guid.clone().ok_or_else(|| {
                ServiceError::Validation(format!(
                    "Review agent run {} is succeeded but has no result revision",
                    run.guid
                ))
            })?;
            let revision = review_repo
                .find_revision_by_guid(&target_revision_guid)
                .await
                .map_err(ServiceError::Infra)?
                .ok_or_else(|| {
                    ServiceError::NotFound(format!(
                        "Review revision {} not found",
                        target_revision_guid
                    ))
                })?;
            return Ok(ReviewAgentRunFinalizedDto { run, revision });
        }
        if run.status == "failed" {
            return Err(ServiceError::Validation(format!(
                "Review agent run {} has already failed",
                run.guid
            )));
        }
        if run.status == "pending" {
            self.mark_agent_run_running(run.guid.clone()).await?;
        }

        let finalize_result: Result<ReviewAgentRunFinalizedDto> = async {
            let session = review_repo
                .find_session_by_guid(&run.session_guid)
                .await
                .map_err(ServiceError::Infra)?
                .ok_or_else(|| {
                    ServiceError::NotFound(format!("Review session {} not found", run.session_guid))
                })?;
            let workspace = WorkspaceRepo::new(&self.db)
                .find_by_guid(&session.workspace_guid)
                .await?
                .ok_or_else(|| {
                    ServiceError::NotFound(format!(
                        "Workspace {} not found",
                        session.workspace_guid
                    ))
                })?;
            let workspace_root = self
                .git_engine
                .get_worktree_path(&workspace.name)
                .map_err(ServiceError::Engine)?;
            let base_revision = review_repo
                .find_revision_by_guid(&run.base_revision_guid)
                .await
                .map_err(ServiceError::Infra)?
                .ok_or_else(|| {
                    ServiceError::NotFound(format!(
                        "Review revision {} not found",
                        run.base_revision_guid
                    ))
                })?;
            let target_revision_guid = run.result_revision_guid.clone().ok_or_else(|| {
                ServiceError::Validation(format!(
                    "Review agent run {} has no target revision",
                    run.guid
                ))
            })?;
            let revision = review_repo
                .find_revision_by_guid(&target_revision_guid)
                .await
                .map_err(ServiceError::Infra)?
                .ok_or_else(|| {
                    ServiceError::NotFound(format!(
                        "Review revision {} not found",
                        target_revision_guid
                    ))
                })?;
            let change_time = chrono::Utc::now().naive_utc();

            if run.run_kind == "review" {
                review_repo
                    .update_session_current_revision(&session.guid, &revision.guid)
                    .await
                    .map_err(ServiceError::Infra)?;
                review_repo
                    .update_revision_title_and_source_kind(
                        &revision.guid,
                        Some("Review Checkpoint"),
                        "agent_review",
                    )
                    .await
                    .map_err(ServiceError::Infra)?;
                review_repo
                    .update_agent_run_status(
                        &run.guid,
                        "succeeded",
                        Some(revision.guid.clone()),
                        Some(revision.storage_root_rel_path.clone()),
                        None,
                        None,
                        if run.started_at.is_none() {
                            Some(change_time)
                        } else {
                            None
                        },
                        Some(change_time),
                        None,
                        true,
                    )
                    .await
                    .map_err(ServiceError::Infra)?;
                let updated_run = review_repo
                    .find_agent_run_by_guid(&run.guid)
                    .await
                    .map_err(ServiceError::Infra)?
                    .ok_or_else(|| {
                        ServiceError::NotFound(format!("Review agent run {} not found", run.guid))
                    })?;
                let updated_revision = review_repo
                    .find_revision_by_guid(&revision.guid)
                    .await
                    .map_err(ServiceError::Infra)?
                    .ok_or_else(|| {
                        ServiceError::NotFound(format!("Review revision {} not found", revision.guid))
                    })?;
                return Ok(ReviewAgentRunFinalizedDto {
                    run: updated_run,
                    revision: updated_revision,
                });
            }

            let base_snapshots = review_repo
                .list_file_snapshots_by_revision(&base_revision.guid)
                .await
                .map_err(ServiceError::Infra)?;
            let base_states = review_repo
                .list_file_states_by_revision(&base_revision.guid)
                .await
                .map_err(ServiceError::Infra)?;
            let state_by_file_identity: HashMap<String, review_file_state::Model> = base_states
                .into_iter()
                .map(|state| (state.file_identity_guid.clone(), state))
                .collect();
            let target_snapshots = review_repo
                .list_file_snapshots_by_revision(&revision.guid)
                .await
                .map_err(ServiceError::Infra)?;
            let mut target_snapshot_by_file_identity: HashMap<String, review_file_snapshot::Model> =
                target_snapshots
                    .into_iter()
                    .map(|snapshot| (snapshot.file_identity_guid.clone(), snapshot))
                    .collect();
            let target_states = review_repo
                .list_file_states_by_revision(&revision.guid)
                .await
                .map_err(ServiceError::Infra)?;
            let target_state_by_file_identity: HashMap<String, review_file_state::Model> =
                target_states
                    .into_iter()
                    .map(|state| (state.file_identity_guid.clone(), state))
                    .collect();

            let mut patch_chunks = Vec::new();
            let mut seen_file_paths: HashSet<String> = base_snapshots
                .iter()
                .map(|snapshot| snapshot.file_path.clone())
                .collect();
            let mut next_display_order = base_snapshots.len();
            for snapshot in base_snapshots.into_iter() {
                // Baseline content is preserved across all revisions so that every
                // revision's review diff shows the cumulative `baseline -> current`
                // change set rather than the per-revision delta. Since V1's `old`
                // is the git baseline and every subsequent revision copies the
                // previous `old` into its own `old`, reading `snapshot.old_rel_path`
                // transitively gives us the baseline.
                let baseline_content =
                    std::fs::read_to_string(&snapshot.old_rel_path).unwrap_or_default();
                // Prior content (the previous revision's `new`) is still needed to
                // compute the per-fix-run patch artifact and to detect whether the
                // fix run actually touched this file.
                let prior_content =
                    std::fs::read_to_string(&snapshot.new_rel_path).unwrap_or_default();
                let current_file_path = workspace_root.join(&snapshot.file_path);
                let current_content = if current_file_path.exists() {
                    std::fs::read_to_string(&current_file_path).unwrap_or_default()
                } else {
                    String::new()
                };
                let target_snapshot = target_snapshot_by_file_identity
                    .remove(&snapshot.file_identity_guid)
                    .ok_or_else(|| {
                        ServiceError::Processing(format!(
                            "Missing target snapshot for identity {}",
                            snapshot.file_identity_guid
                        ))
                    })?;
                write_text_atomic(Path::new(&target_snapshot.old_rel_path), &baseline_content)
                    .await
                    .map_err(ServiceError::Infra)?;
                write_text_atomic(Path::new(&target_snapshot.new_rel_path), &current_content)
                    .await
                    .map_err(ServiceError::Infra)?;

                // Cumulative file status: baseline -> current.
                let git_status = if current_file_path.exists() {
                    if baseline_content.is_empty() && !current_content.is_empty() {
                        "A".to_string()
                    } else if baseline_content == current_content {
                        snapshot.git_status.clone()
                    } else {
                        "M".to_string()
                    }
                } else {
                    "D".to_string()
                };

                // The fix.patch artifact represents what THIS run changed
                // (prior -> current), independent of the cumulative review diff.
                if prior_content != current_content {
                    let old_label = format!("a/{}", snapshot.file_path);
                    let new_label = format!("b/{}", snapshot.file_path);
                    let diff = TextDiff::from_lines(&prior_content, &current_content);
                    let unified = diff
                        .unified_diff()
                        .context_radius(3)
                        .header(&old_label, &new_label)
                        .to_string();
                    if !unified.trim().is_empty() {
                        patch_chunks.push(unified);
                    }
                }

                let meta = FileSnapshotMeta {
                    schema_version: 1,
                    file_path: snapshot.file_path.clone(),
                    git_status: git_status.clone(),
                    is_binary: false,
                    old_rel_path: target_snapshot.old_rel_path.clone(),
                    new_rel_path: target_snapshot.new_rel_path.clone(),
                    old_sha256: sha256_hex(&baseline_content),
                    new_sha256: sha256_hex(&current_content),
                    old_size: baseline_content.len(),
                    new_size: current_content.len(),
                };
                write_json_atomic(Path::new(&target_snapshot.meta_rel_path), &meta)
                    .await
                    .map_err(ServiceError::Infra)?;

                review_repo
                    .update_file_snapshot_content(
                        &target_snapshot.guid,
                        git_status,
                        Some(meta.old_sha256.clone()),
                        Some(meta.new_sha256.clone()),
                        meta.old_size as i64,
                        meta.new_size as i64,
                        false,
                    )
                    .await
                    .map_err(ServiceError::Infra)?;

                let prior_state = state_by_file_identity
                    .get(&snapshot.file_identity_guid)
                    .ok_or_else(|| {
                        ServiceError::Processing(format!(
                            "Missing base file state for identity {}",
                            snapshot.file_identity_guid
                        ))
                    })?;
                let last_code_change_at = if prior_content != current_content {
                    Some(change_time)
                } else {
                    prior_state.last_code_change_at
                };
                let target_state = target_state_by_file_identity
                    .get(&snapshot.file_identity_guid)
                    .ok_or_else(|| {
                        ServiceError::Processing(format!(
                            "Missing target file state for identity {}",
                            snapshot.file_identity_guid
                        ))
                    })?;
                review_repo
                    .update_file_state_code_change(&target_state.guid, last_code_change_at)
                    .await
                    .map_err(ServiceError::Infra)?;
            }

            let changed = self
                .git_engine
                .get_changed_files(&workspace_root, Some(&workspace.base_branch), false)
                .map_err(ServiceError::Engine)?;
            let mut ordered_new_paths = Vec::new();
            for file in changed
                .staged_files
                .iter()
                .chain(changed.unstaged_files.iter())
                .chain(changed.untracked_files.iter())
            {
                if seen_file_paths.insert(file.path.clone()) {
                    ordered_new_paths.push((file.path.clone(), file.status.clone()));
                }
            }

            for (file_path, status) in ordered_new_paths {
                let current_file_path = workspace_root.join(&file_path);
                if !current_file_path.exists() {
                    continue;
                }
                let current_content =
                    std::fs::read_to_string(&current_file_path).unwrap_or_default();
                let file_identity = review_repo
                    .find_or_create_file_identity(session.guid.clone(), file_path.clone())
                    .await
                    .map_err(ServiceError::Infra)?;
                let file_snapshot_guid = Uuid::new_v4().to_string();
                let (old_abs_path, new_abs_path, meta_abs_path) = anchor_file_snapshot_abs_paths(
                    &session.guid,
                    &revision.guid,
                    &file_snapshot_guid,
                )
                .map_err(ServiceError::Infra)?;
                write_text_atomic(&old_abs_path, "")
                    .await
                    .map_err(ServiceError::Infra)?;
                write_text_atomic(&new_abs_path, &current_content)
                    .await
                    .map_err(ServiceError::Infra)?;

                if !current_content.is_empty() {
                    let old_label = format!("a/{}", file_path);
                    let new_label = format!("b/{}", file_path);
                    let diff = TextDiff::from_lines("", &current_content);
                    let unified = diff
                        .unified_diff()
                        .context_radius(3)
                        .header(&old_label, &new_label)
                        .to_string();
                    if !unified.trim().is_empty() {
                        patch_chunks.push(unified);
                    }
                }

                let git_status = if status == "?" {
                    "A".to_string()
                } else {
                    status
                };
                let meta = FileSnapshotMeta {
                    schema_version: 1,
                    file_path: file_path.clone(),
                    git_status: git_status.clone(),
                    is_binary: false,
                    old_rel_path: old_abs_path.to_string_lossy().to_string(),
                    new_rel_path: new_abs_path.to_string_lossy().to_string(),
                    old_sha256: sha256_hex(""),
                    new_sha256: sha256_hex(&current_content),
                    old_size: 0,
                    new_size: current_content.len(),
                };
                write_json_atomic(&meta_abs_path, &meta)
                    .await
                    .map_err(ServiceError::Infra)?;

                let next_snapshot = review_repo
                    .create_file_snapshot(
                        revision.guid.clone(),
                        file_identity.guid.clone(),
                        file_path,
                        git_status,
                        old_abs_path.to_string_lossy().to_string(),
                        new_abs_path.to_string_lossy().to_string(),
                        meta_abs_path.to_string_lossy().to_string(),
                        Some(meta.old_sha256.clone()),
                        Some(meta.new_sha256.clone()),
                        0,
                        meta.new_size as i64,
                        false,
                        next_display_order as i32,
                    )
                    .await
                    .map_err(ServiceError::Infra)?;
                next_display_order += 1;

                review_repo
                    .create_file_state(
                        revision.guid.clone(),
                        file_identity.guid,
                        next_snapshot.guid,
                        false,
                        None,
                        None,
                        None,
                        Some(change_time),
                    )
                    .await
                    .map_err(ServiceError::Infra)?;
            }

            let revisions_manifest = review_repo
                .list_revisions_by_session(&session.guid)
                .await
                .map_err(ServiceError::Infra)?
                .into_iter()
                .map(|item| RevisionManifestItem {
                    revision_guid: item.guid,
                    parent_revision_guid: item.parent_revision_guid,
                    source_kind: item.source_kind,
                    agent_run_guid: item.agent_run_guid,
                    storage_root_rel_path: item.storage_root_rel_path,
                    created_at: item.created_at.to_string(),
                })
                .collect::<Vec<_>>();
            let revisions_manifest_path =
                revisions_manifest_abs_path(&session.guid).map_err(ServiceError::Infra)?;
            write_json_atomic(&revisions_manifest_path, &revisions_manifest)
                .await
                .map_err(ServiceError::Infra)?;

            let patch_abs_path = run_root_abs_path(&session.guid, &run.guid)
                .map_err(ServiceError::Infra)?
                .join(if run.run_kind == "review" {
                    "review.patch"
                } else {
                    "fix.patch"
                });
            let patch_text = if patch_chunks.is_empty() {
                String::new()
            } else {
                patch_chunks.join("\n")
            };
            write_text_atomic(&patch_abs_path, &patch_text)
                .await
                .map_err(ServiceError::Infra)?;

            review_repo
                .update_session_current_revision(&session.guid, &revision.guid)
                .await
                .map_err(ServiceError::Infra)?;

            let (revision_title, source_kind) = match run.run_kind.as_str() {
                "review" => ("Review Checkpoint".to_string(), "agent_review".to_string()),
                "fix" => ("Fix Result".to_string(), "agent_fix".to_string()),
                _ => ("Agent Run Result".to_string(), "agent_run".to_string()),
            };
            
            review_repo
                .update_revision_title_and_source_kind(
                    &revision.guid,
                    Some(&revision_title),
                    &source_kind,
                )
                .await
                .map_err(ServiceError::Infra)?;

            review_repo
                .update_agent_run_status(
                    &run.guid,
                    "succeeded",
                    Some(revision.guid.clone()),
                    Some(revision.storage_root_rel_path.clone()),
                    Some(patch_abs_path.to_string_lossy().to_string()),
                    None,
                    if run.started_at.is_none() {
                        Some(change_time)
                    } else {
                        None
                    },
                    Some(change_time),
                    None,
                    true,
                )
                .await
                .map_err(ServiceError::Infra)?;
            let updated_run = review_repo
                .find_agent_run_by_guid(&run.guid)
                .await
                .map_err(ServiceError::Infra)?
                .ok_or_else(|| {
                    ServiceError::NotFound(format!("Review agent run {} not found", run.guid))
                })?;

            Ok(ReviewAgentRunFinalizedDto {
                run: updated_run,
                revision,
            })
        }
        .await;

        if let Err(error) = &finalize_result {
            if let Err(update_error) = review_repo
                .update_agent_run_status(
                    &run.guid,
                    "failed",
                    None,
                    None,
                    None,
                    None,
                    if run.started_at.is_none() {
                        Some(chrono::Utc::now().naive_utc())
                    } else {
                        None
                    },
                    Some(chrono::Utc::now().naive_utc()),
                    Some(error.to_string()),
                    true,
                )
                .await
            {
                tracing::warn!(
                    run_guid = %run.guid,
                    error = %update_error,
                    "Failed to mark review fix run failed after finalize error",
                );
            }
        }

        finalize_result
    }

    fn render_fix_prompt(
        &self,
        session: &review_session::Model,
        run: &review_agent_run::Model,
        comments: &[ReviewCommentDto],
    ) -> Result<String> {
        let mut output = String::new();
        output.push_str("<review-fix-run>\n");
        output.push_str(&format!(
            "  <session guid=\"{}\" current_revision_guid=\"{}\" />\n",
            xml_escape(&session.guid),
            xml_escape(&session.current_revision_guid)
        ));
        output.push_str(&format!(
            "  <run guid=\"{}\" execution_mode=\"{}\" />\n",
            xml_escape(&run.guid),
            xml_escape(&run.execution_mode)
        ));
        for comment in comments {
            output.push_str(&format!(
                "  <comment guid=\"{}\" revision_guid=\"{}\" file_snapshot_guid=\"{}\">\n",
                xml_escape(&comment.model.guid),
                xml_escape(&comment.model.revision_guid),
                xml_escape(&comment.model.file_snapshot_guid)
            ));
            output.push_str(&format!(
                "    <anchor side=\"{}\" start_line=\"{}\" end_line=\"{}\" line_range_kind=\"{}\" />\n",
                xml_escape(&comment.model.anchor_side),
                comment.model.anchor_start_line,
                comment.model.anchor_end_line,
                xml_escape(&comment.model.anchor_line_range_kind)
            ));
            if let Some(message) = comment.messages.first() {
                output.push_str("    <comment>\n");
                output.push_str(&xml_escape(&message.body_full));
                output.push_str("\n    </comment>\n");
            }
            output.push_str("  </comment>\n");
        }
        output.push_str("</review-fix-run>\n\n");
        output.push_str("This is an Atmos Agent Review Fix run. Fix the code according to the user review comments above, but first verify that each reported issue exists and is reasonable; do not edit blindly.\n");
        output.push_str(&format!(
            "Before editing code, read and follow `{}`.\n",
            installed_review_fix_skill_path()
        ));
        Ok(output)
    }

    fn render_review_prompt(
        &self,
        session: &review_session::Model,
        run: &review_agent_run::Model,
        base_revision: &review_revision::Model,
        all_comments: &[ReviewCommentDto],
    ) -> Result<String> {
        let mut output = String::new();
        output.push_str("<review-agent-run>\n");
        output.push_str(&format!(
            "  <session guid=\"{}\" current_revision_guid=\"{}\" />\n",
            xml_escape(&session.guid),
            xml_escape(&session.current_revision_guid)
        ));
        output.push_str(&format!(
            "  <run guid=\"{}\" run_kind=\"{}\" execution_mode=\"{}\" skill_id=\"{}\" />\n",
            xml_escape(&run.guid),
            xml_escape(&run.run_kind),
            xml_escape(&run.execution_mode),
            xml_escape(&run.skill_id.as_deref().unwrap_or("default"))
        ));
        output.push_str(&format!(
            "  <base_revision guid=\"{}\" title=\"{}\" />\n",
            xml_escape(&base_revision.guid),
            xml_escape(&base_revision.title.as_deref().unwrap_or("Untitled"))
        ));
        
        // Include existing comments in the prompt
        if !all_comments.is_empty() {
            output.push_str("  <existing_comments>\n");
            for comment in all_comments {
                output.push_str(&format!(
                    "    <comment guid=\"{}\" file_snapshot_guid=\"{}\">\n",
                    xml_escape(&comment.model.guid),
                    xml_escape(&comment.model.file_snapshot_guid)
                ));
                output.push_str(&format!(
                    "      <anchor side=\"{}\" start_line=\"{}\" end_line=\"{}\" />\n",
                    xml_escape(&comment.model.anchor_side),
                    comment.model.anchor_start_line,
                    comment.model.anchor_end_line
                ));
                if let Some(message) = comment.messages.first() {
                    output.push_str("      <comment>\n");
                    output.push_str(&xml_escape(&message.body_full));
                    output.push_str("\n      </comment>\n");
                }
                output.push_str("    </comment>\n");
            }
            output.push_str("  </existing_comments>\n");
        }
        
        output.push_str("</review-agent-run>\n\n");
        output.push_str("This is an Atmos Agent Review run. Analyze the code in the specified revision and identify issues, bugs, or improvements.\n");
        output.push_str("Use the `atmos review create-comment` CLI command to create inline comments for each issue you find.\n");
        if let Some(skill_id) = &run.skill_id {
            output.push_str(&format!("Use the {} skill for this review.\n", skill_id));
        }
        output.push_str("After completing the review, use `atmos review set-status --status succeeded --summary-stdin` to mark the run as complete.\n");
        Ok(output)
    }

    async fn build_session_dto(&self, session: review_session::Model) -> Result<ReviewSessionDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let revisions = review_repo
            .list_revisions_by_session(&session.guid)
            .await
            .map_err(ServiceError::Infra)?;
        let comments = review_repo
            .list_comments_by_session(&session.guid)
            .await
            .map_err(ServiceError::Infra)?;
        let runs = review_repo
            .list_agent_runs_by_session(&session.guid)
            .await
            .map_err(ServiceError::Infra)?;
        let mut revision_dtos = Vec::with_capacity(revisions.len());

        for revision in revisions {
            let files = self.list_files_by_revision(revision.guid.clone()).await?;
            revision_dtos.push(ReviewRevisionDto {
                model: revision,
                files,
            });
        }
        let current_revision = revision_dtos
            .iter()
            .find(|revision| revision.model.guid == session.current_revision_guid);
        let reviewed_file_count = current_revision
            .map(|revision| {
                revision
                    .files
                    .iter()
                    .filter(|item| item.state.reviewed)
                    .count()
            })
            .unwrap_or(0);
        let reviewed_then_changed_count = current_revision
            .map(|revision| {
                revision
                    .files
                    .iter()
                    .filter(|item| item.changed_after_review)
                    .count()
            })
            .unwrap_or(0);

        Ok(ReviewSessionDto {
            open_comment_count: comments
                .iter()
                .filter(|comment| is_open_review_comment_status(&comment.status))
                .count(),
            reviewed_file_count,
            reviewed_then_changed_count,
            revisions: revision_dtos,
            runs,
            model: session,
        })
    }

    async fn to_comment_dto(
        &self,
        comment: review_comment::Model,
        messages: Vec<review_message::Model>,
        _session_guid: Option<String>,
    ) -> Result<ReviewCommentDto> {
        let anchor =
            serde_json::from_str::<Value>(&comment.anchor_json).unwrap_or_else(|_| json!({}));
        let messages = messages
            .into_iter()
            .map(|message| {
                let body_full = if message.body_storage_kind == "inline" {
                    message.body.clone()
                } else if let Some(abs_path) = message.body_rel_path.as_ref() {
                    std::fs::read_to_string(abs_path).unwrap_or_else(|_| message.body.clone())
                } else {
                    message.body.clone()
                };
                ReviewMessageDto {
                    body_full,
                    model: message,
                }
            })
            .collect();
        Ok(ReviewCommentDto {
            anchor,
            messages,
            model: comment,
        })
    }
}

fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
