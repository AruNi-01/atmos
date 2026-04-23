use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;

use core_engine::GitEngine;
use infra::db::entities::{
    review_file_snapshot, review_file_state, review_fix_run, review_message, review_revision,
    review_session, review_thread,
};
use infra::db::repo::{ProjectRepo, ReviewRepo, WorkspaceRepo};
use infra::utils::review_artifacts::{
    anchor_file_snapshot_paths, manifest_rel_path, revision_root_rel_path,
    revisions_manifest_rel_path, run_root_rel_path, session_root_rel_path, sha256_hex,
    write_json_atomic, write_text_atomic,
};
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use similar::TextDiff;
use uuid::Uuid;

use crate::error::{Result, ServiceError};

const MESSAGE_INLINE_LIMIT: usize = 16 * 1024;

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
pub struct ReviewThreadDto {
    #[serde(flatten)]
    pub model: review_thread::Model,
    pub anchor: Value,
    pub messages: Vec<ReviewMessageDto>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewFileDto {
    pub snapshot: review_file_snapshot::Model,
    pub state: review_file_state::Model,
    pub changed_after_review: bool,
    pub open_thread_count: usize,
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
    pub runs: Vec<review_fix_run::Model>,
    pub open_thread_count: usize,
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
pub struct CreateReviewThreadInput {
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
    pub parent_thread_guid: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AddReviewMessageInput {
    pub thread_guid: String,
    pub author_type: String,
    pub kind: String,
    pub body: String,
    #[serde(default)]
    pub fix_run_guid: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateReviewThreadStatusInput {
    pub thread_guid: String,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateReviewFixRunInput {
    pub session_guid: String,
    pub base_revision_guid: String,
    pub execution_mode: String,
    #[serde(default)]
    pub selected_thread_guids: Vec<String>,
    #[serde(default)]
    pub created_by: Option<String>,
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
    fix_run_guid: Option<String>,
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
pub struct ReviewFixRunCreatedDto {
    pub run: review_fix_run::Model,
    pub prompt: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewThreadContextDto {
    pub session: review_session::Model,
    pub revision: review_revision::Model,
    pub file_snapshot: review_file_snapshot::Model,
    pub thread: ReviewThreadDto,
    pub workspace_root: String,
    pub old_file_abs_path: String,
    pub new_file_abs_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewFixRunFinalizedDto {
    pub run: review_fix_run::Model,
    pub revision: review_revision::Model,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewFileContentDto {
    pub file_snapshot: review_file_snapshot::Model,
    pub old_content: String,
    pub new_content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewRunArtifactDto {
    pub run: review_fix_run::Model,
    pub kind: String,
    pub content: String,
}

pub struct ReviewService {
    db: Arc<DatabaseConnection>,
    git_engine: GitEngine,
}

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
            .ok_or_else(|| ServiceError::NotFound(format!("Workspace {} not found", input.workspace_guid)))?;

        let project = project_repo
            .find_by_guid(&workspace.project_guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Project {} not found", workspace.project_guid)))?;

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
        let session_storage_root = session_root_rel_path(&session_guid)
            .to_string_lossy()
            .to_string();
        let revision_storage_root = revision_root_rel_path(&session_guid, &revision_guid)
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
        workspace_root: &PathBuf,
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
            let (old_rel_path, new_rel_path, meta_rel_path) =
                anchor_file_snapshot_paths(&session.guid, &revision.guid, &file_snapshot_guid);

            write_text_atomic(workspace_root, &old_rel_path, &diff.old_content)
                .await
                .map_err(ServiceError::Infra)?;
            write_text_atomic(workspace_root, &new_rel_path, &diff.new_content)
                .await
                .map_err(ServiceError::Infra)?;

            let meta = FileSnapshotMeta {
                schema_version: 1,
                file_path: file_path.clone(),
                git_status: status.clone(),
                is_binary: false,
                old_rel_path: old_rel_path.to_string_lossy().to_string(),
                new_rel_path: new_rel_path.to_string_lossy().to_string(),
                old_sha256: sha256_hex(&diff.old_content),
                new_sha256: sha256_hex(&diff.new_content),
                old_size: diff.old_content.len(),
                new_size: diff.new_content.len(),
            };
            write_json_atomic(workspace_root, &meta_rel_path, &meta)
                .await
                .map_err(ServiceError::Infra)?;

            let snapshot = review_repo
                .create_file_snapshot(
                    revision.guid.clone(),
                    file_identity.guid.clone(),
                    file_path.clone(),
                    status,
                    old_rel_path.to_string_lossy().to_string(),
                    new_rel_path.to_string_lossy().to_string(),
                    meta_rel_path.to_string_lossy().to_string(),
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
        write_json_atomic(workspace_root, &manifest_rel_path(&session.guid), &manifest)
            .await
            .map_err(ServiceError::Infra)?;
        let revisions_manifest = vec![RevisionManifestItem {
            revision_guid: revision.guid.clone(),
            parent_revision_guid: None,
            source_kind: revision.source_kind.clone(),
            fix_run_guid: None,
            storage_root_rel_path: revision.storage_root_rel_path.clone(),
            created_at: revision.created_at.to_string(),
        }];
        write_json_atomic(
            workspace_root,
            &revisions_manifest_rel_path(&session.guid),
            &revisions_manifest,
        )
        .await
        .map_err(ServiceError::Infra)?;

        self.build_session_dto(session.clone()).await
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

    pub async fn list_files_by_revision(&self, revision_guid: String) -> Result<Vec<ReviewFileDto>> {
        let review_repo = ReviewRepo::new(&self.db);
        let snapshots = review_repo.list_file_snapshots_by_revision(&revision_guid).await?;
        let states = review_repo.list_file_states_by_revision(&revision_guid).await?;
        let state_by_snapshot: HashMap<String, review_file_state::Model> = states
            .into_iter()
            .map(|item| (item.file_snapshot_guid.clone(), item))
            .collect();
        let threads = review_repo.list_threads_by_revision(&revision_guid).await?;
        let mut open_thread_count_by_snapshot: HashMap<String, usize> = HashMap::new();
        for thread in threads {
            if thread.status == "open" || thread.status == "in_progress" || thread.status == "needs_user_check" {
                *open_thread_count_by_snapshot
                    .entry(thread.file_snapshot_guid.clone())
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
                Ok(ReviewFileDto {
                    open_thread_count: *open_thread_count_by_snapshot
                        .get(&snapshot.guid)
                        .unwrap_or(&0),
                    snapshot,
                    state,
                    changed_after_review,
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

    pub async fn list_threads(
        &self,
        session_guid: String,
        revision_guid: Option<String>,
    ) -> Result<Vec<ReviewThreadDto>> {
        let review_repo = ReviewRepo::new(&self.db);
        let threads = if let Some(revision_guid) = revision_guid {
            review_repo.list_threads_by_revision(&revision_guid).await?
        } else {
            review_repo.list_threads_by_session(&session_guid).await?
        };
        let thread_guids: Vec<String> = threads.iter().map(|item| item.guid.clone()).collect();
        let messages = review_repo.list_messages_by_thread_guids(&thread_guids).await?;
        let mut messages_by_thread: HashMap<String, Vec<review_message::Model>> = HashMap::new();
        for message in messages {
            messages_by_thread
                .entry(message.thread_guid.clone())
                .or_default()
                .push(message);
        }

        let mut items = Vec::with_capacity(threads.len());
        for thread in threads {
            let thread_guid = thread.guid.clone();
            items.push(
                self.to_thread_dto(
                    thread,
                    messages_by_thread.remove(&thread_guid).unwrap_or_default(),
                    Some(session_guid.clone()),
                )
                .await?,
            );
        }
        Ok(items)
    }

    pub async fn create_thread(
        &self,
        input: CreateReviewThreadInput,
    ) -> Result<ReviewThreadDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let thread = review_repo
            .create_thread(
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
                input.parent_thread_guid,
                input.title,
                input.created_by,
            )
            .await
            .map_err(ServiceError::Infra)?;
        let message = self
            .create_message(AddReviewMessageInput {
                thread_guid: thread.guid.clone(),
                author_type: "user".to_string(),
                kind: "comment".to_string(),
                body: input.body,
                fix_run_guid: None,
            })
            .await?;
        Ok(ReviewThreadDto {
            anchor: serde_json::to_value(&input.anchor)
                .map_err(|error| ServiceError::Processing(error.to_string()))?,
            messages: vec![message],
            model: thread,
        })
    }

    pub async fn create_message(
        &self,
        input: AddReviewMessageInput,
    ) -> Result<ReviewMessageDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let thread = review_repo
            .find_thread_by_guid(&input.thread_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review thread {} not found", input.thread_guid)))?;
        let workspace_root = self.workspace_root_for_session(&thread.session_guid).await?;
        if let Some(run_guid) = input.fix_run_guid.as_deref() {
            if let Some(run) = review_repo
                .find_fix_run_by_guid(run_guid)
                .await
                .map_err(ServiceError::Infra)?
            {
                if run.status == "queued" {
                    review_repo
                        .update_fix_run_status(
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
            }
        }
        let (body_storage_kind, body, body_rel_path, body_full) = if input.body.len() > MESSAGE_INLINE_LIMIT {
            let rel_path = run_root_rel_path(&thread.session_guid, input.fix_run_guid.as_deref().unwrap_or("message"))
                .join("messages")
                .join(format!("{}.md", Uuid::new_v4()));
            write_text_atomic(&workspace_root, &rel_path, &input.body)
                .await
                .map_err(ServiceError::Infra)?;
            (
                "file".to_string(),
                input.body.chars().take(500).collect(),
                Some(rel_path.to_string_lossy().to_string()),
                input.body,
            )
        } else {
            ("inline".to_string(), input.body.clone(), None, input.body)
        };

        let message = review_repo
            .create_message(
                input.thread_guid,
                input.author_type,
                input.kind,
                body_storage_kind,
                body,
                body_rel_path,
                input.fix_run_guid,
            )
            .await
            .map_err(ServiceError::Infra)?;

        Ok(ReviewMessageDto {
            body_full,
            model: message,
        })
    }

    pub async fn update_thread_status(
        &self,
        input: UpdateReviewThreadStatusInput,
    ) -> Result<()> {
        ReviewRepo::new(&self.db)
            .update_thread_status(&input.thread_guid, &input.status)
            .await
            .map_err(ServiceError::Infra)
    }

    pub async fn create_fix_run(
        &self,
        input: CreateReviewFixRunInput,
    ) -> Result<ReviewFixRunCreatedDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let session = review_repo
            .find_session_by_guid(&input.session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review session {} not found", input.session_guid)))?;
        let workspace_root = self.workspace_root_for_session(&session.guid).await?;
        let threads = self
            .list_threads(
                session.guid.clone(),
                Some(input.base_revision_guid.clone()),
            )
            .await?;
        let selected_set: HashSet<String> = input.selected_thread_guids.into_iter().collect();
        let selected_threads: Vec<ReviewThreadDto> = threads
            .into_iter()
            .filter(|thread| {
                if !selected_set.is_empty() {
                    selected_set.contains(&thread.model.guid)
                } else {
                    thread.model.status == "open" || thread.model.status == "needs_user_check"
                }
            })
            .collect();
        if selected_threads.is_empty() {
            return Err(ServiceError::Validation(
                "No review threads selected for fix run".to_string(),
            ));
        }

        let run = review_repo
            .create_fix_run(
                session.guid.clone(),
                input.base_revision_guid.clone(),
                input.execution_mode.clone(),
                None,
                input.created_by.clone(),
            )
            .await
            .map_err(ServiceError::Infra)?;
        let prompt = self.render_fix_prompt(&session, &run, &selected_threads)?;
        let prompt_rel_path = run_root_rel_path(&session.guid, &run.guid).join("prompt.md");
        write_text_atomic(&workspace_root, &prompt_rel_path, &prompt)
            .await
            .map_err(ServiceError::Infra)?;
        review_repo
            .update_fix_run_prompt_rel_path(
                &run.guid,
                &prompt_rel_path.to_string_lossy().to_string(),
            )
            .await
            .map_err(ServiceError::Infra)?;
        review_repo
            .update_fix_run_status(
                &run.guid,
                "queued",
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                false,
            )
            .await
            .map_err(ServiceError::Infra)?;

        let updated_run = review_repo
            .find_fix_run_by_guid(&run.guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review fix run {} not found", run.guid)))?;

        Ok(ReviewFixRunCreatedDto {
            run: updated_run,
            prompt,
        })
    }

    pub async fn list_fix_runs(
        &self,
        session_guid: String,
    ) -> Result<Vec<review_fix_run::Model>> {
        ReviewRepo::new(&self.db)
            .list_fix_runs_by_session(&session_guid)
            .await
            .map_err(ServiceError::Infra)
    }

    pub async fn get_thread_context(
        &self,
        thread_guid: String,
    ) -> Result<ReviewThreadContextDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let thread = review_repo
            .find_thread_by_guid(&thread_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review thread {} not found", thread_guid)))?;
        let session = review_repo
            .find_session_by_guid(&thread.session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review session {} not found", thread.session_guid)))?;
        let revision = review_repo
            .find_revision_by_guid(&thread.revision_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review revision {} not found", thread.revision_guid)))?;
        let file_snapshot = review_repo
            .find_file_snapshot_by_guid(&thread.file_snapshot_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review file snapshot {} not found", thread.file_snapshot_guid)))?;
        let messages = review_repo
            .list_messages_by_thread_guids(std::slice::from_ref(&thread.guid))
            .await
            .map_err(ServiceError::Infra)?;
        let thread = self
            .to_thread_dto(thread, messages, Some(session.guid.clone()))
            .await?;
        let workspace_root = self.workspace_root_for_session(&session.guid).await?;
        Ok(ReviewThreadContextDto {
            old_file_abs_path: workspace_root
                .join(&file_snapshot.old_rel_path)
                .to_string_lossy()
                .to_string(),
            new_file_abs_path: workspace_root
                .join(&file_snapshot.new_rel_path)
                .to_string_lossy()
                .to_string(),
            workspace_root: workspace_root.to_string_lossy().to_string(),
            session,
            revision,
            file_snapshot,
            thread,
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
        let revision = review_repo
            .find_revision_by_guid(&file_snapshot.revision_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| {
                ServiceError::NotFound(format!(
                    "Review revision {} not found",
                    file_snapshot.revision_guid
                ))
            })?;
        let workspace_root = self.workspace_root_for_session(&revision.session_guid).await?;
        let old_content =
            std::fs::read_to_string(workspace_root.join(&file_snapshot.old_rel_path))
                .map_err(|error| ServiceError::Infra(infra::InfraError::Io(error)))?;
        let new_content =
            std::fs::read_to_string(workspace_root.join(&file_snapshot.new_rel_path))
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
            .find_fix_run_by_guid(&run_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review fix run {} not found", run_guid)))?;
        let workspace_root = self.workspace_root_for_session(&run.session_guid).await?;
        let rel_path = match kind.as_str() {
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
                "Review fix run {} has no {} artifact",
                run.guid, kind
            ))
        })?;
        let content = std::fs::read_to_string(workspace_root.join(&rel_path))
            .map_err(|error| ServiceError::Infra(infra::InfraError::Io(error)))?;

        Ok(ReviewRunArtifactDto { run, kind, content })
    }

    pub async fn write_run_summary(
        &self,
        run_guid: String,
        body: String,
    ) -> Result<review_fix_run::Model> {
        let review_repo = ReviewRepo::new(&self.db);
        let run = review_repo
            .find_fix_run_by_guid(&run_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review fix run {} not found", run_guid)))?;
        let workspace_root = self.workspace_root_for_session(&run.session_guid).await?;
        let summary_rel_path = run_root_rel_path(&run.session_guid, &run.guid).join("summary.md");
        write_text_atomic(&workspace_root, &summary_rel_path, &body)
            .await
            .map_err(ServiceError::Infra)?;
        review_repo
            .update_fix_run_status(
                &run.guid,
                "succeeded",
                None,
                None,
                None,
                Some(summary_rel_path.to_string_lossy().to_string()),
                if run.started_at.is_none() {
                    Some(chrono::Utc::now().naive_utc())
                } else {
                    None
                },
                Some(chrono::Utc::now().naive_utc()),
                None,
                false,
            )
            .await
            .map_err(ServiceError::Infra)?;
        review_repo
            .find_fix_run_by_guid(&run.guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review fix run {} not found", run.guid)))
    }

    pub async fn finalize_fix_run(
        &self,
        run_guid: String,
        title: Option<String>,
    ) -> Result<ReviewFixRunFinalizedDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let run = review_repo
            .find_fix_run_by_guid(&run_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review fix run {} not found", run_guid)))?;
        if run.result_revision_guid.is_some() {
            return Err(ServiceError::Validation(format!(
                "Review fix run {} has already been finalized",
                run.guid
            )));
        }

        let session = review_repo
            .find_session_by_guid(&run.session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review session {} not found", run.session_guid)))?;
        let base_revision = review_repo
            .find_revision_by_guid(&run.base_revision_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review revision {} not found", run.base_revision_guid)))?;
        let workspace_root = self.workspace_root_for_session(&session.guid).await?;

        review_repo
            .update_fix_run_status(
                &run.guid,
                "finalizing",
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
        let revision_storage_root = revision_root_rel_path(&session.guid, &revision_guid)
            .to_string_lossy()
            .to_string();
        let revisions_before = review_repo
            .list_revisions_by_session(&session.guid)
            .await
            .map_err(ServiceError::Infra)?;
        let revision = review_repo
            .create_revision(
                Some(revision_guid.clone()),
                session.guid.clone(),
                Some(base_revision.guid.clone()),
                "ai_run".to_string(),
                Some(run.guid.clone()),
                title.or_else(|| Some(format!("Fix Run {}", revisions_before.len()))),
                revision_storage_root.clone(),
                Some(base_revision.guid.clone()),
                run.created_by.clone(),
            )
            .await
            .map_err(ServiceError::Infra)?;

        let change_time = chrono::Utc::now().naive_utc();
        let mut patch_chunks = Vec::new();
        for (index, snapshot) in base_snapshots.into_iter().enumerate() {
            let prior_content = std::fs::read_to_string(workspace_root.join(&snapshot.new_rel_path))
                .unwrap_or_default();
            let current_file_path = workspace_root.join(&snapshot.file_path);
            let current_content = if current_file_path.exists() {
                std::fs::read_to_string(&current_file_path).unwrap_or_default()
            } else {
                String::new()
            };
            let file_snapshot_guid = Uuid::new_v4().to_string();
            let (old_rel_path, new_rel_path, meta_rel_path) =
                anchor_file_snapshot_paths(&session.guid, &revision.guid, &file_snapshot_guid);
            write_text_atomic(&workspace_root, &old_rel_path, &prior_content)
                .await
                .map_err(ServiceError::Infra)?;
            write_text_atomic(&workspace_root, &new_rel_path, &current_content)
                .await
                .map_err(ServiceError::Infra)?;

            let git_status = if current_file_path.exists() {
                if prior_content.is_empty() && !current_content.is_empty() {
                    "A".to_string()
                } else if prior_content == current_content {
                    snapshot.git_status.clone()
                } else {
                    "M".to_string()
                }
            } else {
                "D".to_string()
            };

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
                old_rel_path: old_rel_path.to_string_lossy().to_string(),
                new_rel_path: new_rel_path.to_string_lossy().to_string(),
                old_sha256: sha256_hex(&prior_content),
                new_sha256: sha256_hex(&current_content),
                old_size: prior_content.len(),
                new_size: current_content.len(),
            };
            write_json_atomic(&workspace_root, &meta_rel_path, &meta)
                .await
                .map_err(ServiceError::Infra)?;

            let next_snapshot = review_repo
                .create_file_snapshot(
                    revision.guid.clone(),
                    snapshot.file_identity_guid.clone(),
                    snapshot.file_path.clone(),
                    git_status,
                    old_rel_path.to_string_lossy().to_string(),
                    new_rel_path.to_string_lossy().to_string(),
                    meta_rel_path.to_string_lossy().to_string(),
                    Some(meta.old_sha256.clone()),
                    Some(meta.new_sha256.clone()),
                    meta.old_size as i64,
                    meta.new_size as i64,
                    false,
                    index as i32,
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
            review_repo
                .create_file_state(
                    revision.guid.clone(),
                    snapshot.file_identity_guid.clone(),
                    next_snapshot.guid.clone(),
                    prior_state.reviewed,
                    prior_state.reviewed_at,
                    prior_state.reviewed_by.clone(),
                    Some(prior_state.guid.clone()),
                    last_code_change_at,
                )
                .await
                .map_err(ServiceError::Infra)?;
        }

        review_repo
            .update_session_current_revision(&session.guid, &revision.guid)
            .await
            .map_err(ServiceError::Infra)?;

        let revisions_manifest = review_repo
            .list_revisions_by_session(&session.guid)
            .await
            .map_err(ServiceError::Infra)?
            .into_iter()
            .map(|item| RevisionManifestItem {
                revision_guid: item.guid,
                parent_revision_guid: item.parent_revision_guid,
                source_kind: item.source_kind,
                fix_run_guid: item.fix_run_guid,
                storage_root_rel_path: item.storage_root_rel_path,
                created_at: item.created_at.to_string(),
            })
            .collect::<Vec<_>>();
        write_json_atomic(
            &workspace_root,
            &revisions_manifest_rel_path(&session.guid),
            &revisions_manifest,
        )
        .await
        .map_err(ServiceError::Infra)?;

        let patch_rel_path = run_root_rel_path(&session.guid, &run.guid).join("fix.patch");
        let patch_text = if patch_chunks.is_empty() {
            String::new()
        } else {
            patch_chunks.join("\n")
        };
        write_text_atomic(&workspace_root, &patch_rel_path, &patch_text)
            .await
            .map_err(ServiceError::Infra)?;

        review_repo
            .update_fix_run_status(
                &run.guid,
                "succeeded",
                Some(revision.guid.clone()),
                Some(revision_storage_root),
                Some(patch_rel_path.to_string_lossy().to_string()),
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
            .find_fix_run_by_guid(&run.guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review fix run {} not found", run.guid)))?;

        Ok(ReviewFixRunFinalizedDto {
            run: updated_run,
            revision,
        })
    }

    fn render_fix_prompt(
        &self,
        session: &review_session::Model,
        run: &review_fix_run::Model,
        threads: &[ReviewThreadDto],
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
        for thread in threads {
            output.push_str(&format!(
                "  <thread guid=\"{}\" revision_guid=\"{}\" file_snapshot_guid=\"{}\">\n",
                xml_escape(&thread.model.guid),
                xml_escape(&thread.model.revision_guid),
                xml_escape(&thread.model.file_snapshot_guid)
            ));
            output.push_str(&format!(
                "    <anchor side=\"{}\" start_line=\"{}\" end_line=\"{}\" line_range_kind=\"{}\" />\n",
                xml_escape(&thread.model.anchor_side),
                thread.model.anchor_start_line,
                thread.model.anchor_end_line,
                xml_escape(&thread.model.anchor_line_range_kind)
            ));
            if let Some(message) = thread.messages.first() {
                output.push_str("    <comment>\n");
                output.push_str(&xml_escape(&message.body_full));
                output.push_str("\n    </comment>\n");
            }
            output.push_str("  </thread>\n");
        }
        output.push_str("</review-fix-run>\n\n");
        output.push_str("Before editing code, read and follow `~/.atmos/skills/.system/atmos-review-fix/SKILL.md`.\n");
        output.push_str("Use `atmos review` commands to reply to each handled thread and write a run summary. Do not mark threads resolved automatically; move them to `needs_user_check` after handling.\n");
        Ok(output)
    }

    async fn build_session_dto(&self, session: review_session::Model) -> Result<ReviewSessionDto> {
        let review_repo = ReviewRepo::new(&self.db);
        let revisions = review_repo
            .list_revisions_by_session(&session.guid)
            .await
            .map_err(ServiceError::Infra)?;
        let threads = review_repo
            .list_threads_by_session(&session.guid)
            .await
            .map_err(ServiceError::Infra)?;
        let runs = review_repo
            .list_fix_runs_by_session(&session.guid)
            .await
            .map_err(ServiceError::Infra)?;
        let mut revision_dtos = Vec::with_capacity(revisions.len());

        for revision in revisions {
            let files = self.list_files_by_revision(revision.guid.clone()).await?;
            revision_dtos.push(ReviewRevisionDto { model: revision, files });
        }
        let current_revision = revision_dtos
            .iter()
            .find(|revision| revision.model.guid == session.current_revision_guid);
        let reviewed_file_count = current_revision
            .map(|revision| revision.files.iter().filter(|item| item.state.reviewed).count())
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
            open_thread_count: threads
                .iter()
                .filter(|thread| {
                    thread.status == "open"
                        || thread.status == "in_progress"
                        || thread.status == "needs_user_check"
                })
                .count(),
            reviewed_file_count,
            reviewed_then_changed_count,
            revisions: revision_dtos,
            runs,
            model: session,
        })
    }

    async fn to_thread_dto(
        &self,
        thread: review_thread::Model,
        messages: Vec<review_message::Model>,
        session_guid: Option<String>,
    ) -> Result<ReviewThreadDto> {
        let anchor = serde_json::from_str::<Value>(&thread.anchor_json)
            .unwrap_or_else(|_| json!({}));
        let workspace_root = if let Some(session_guid) = session_guid.as_deref() {
            Some(self.workspace_root_for_session(session_guid).await?)
        } else {
            None
        };
        let messages = messages
            .into_iter()
            .map(|message| {
                let body_full = if message.body_storage_kind == "inline" {
                    message.body.clone()
                } else if let (Some(root), Some(rel_path)) =
                    (workspace_root.as_ref(), message.body_rel_path.as_ref())
                {
                    std::fs::read_to_string(root.join(rel_path))
                        .unwrap_or_else(|_| message.body.clone())
                } else {
                    message.body.clone()
                };
                ReviewMessageDto {
                    body_full,
                    model: message,
                }
            })
            .collect();
        Ok(ReviewThreadDto {
            anchor,
            messages,
            model: thread,
        })
    }

    async fn workspace_root_for_session(&self, session_guid: &str) -> Result<PathBuf> {
        let review_repo = ReviewRepo::new(&self.db);
        let session = review_repo
            .find_session_by_guid(session_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Review session {} not found", session_guid)))?;
        self.workspace_root_for_workspace_guid(&session.workspace_guid).await
    }

    async fn workspace_root_for_workspace_guid(&self, workspace_guid: &str) -> Result<PathBuf> {
        let workspace = WorkspaceRepo::new(&self.db)
            .find_by_guid(workspace_guid)
            .await
            .map_err(ServiceError::Infra)?
            .ok_or_else(|| ServiceError::NotFound(format!("Workspace {} not found", workspace_guid)))?;
        self.git_engine
            .get_worktree_path(&workspace.name)
            .map_err(ServiceError::Engine)
    }
}

fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
