use std::collections::HashSet;
use std::path::Path;

use infra::db::entities::review_session;
use infra::db::repo::{ProjectRepo, ReviewRepo, WorkspaceRepo};
use infra::utils::review_artifacts::{
    anchor_file_snapshot_abs_paths, manifest_abs_path, revision_root_abs_path,
    revisions_manifest_abs_path, session_root_abs_path, sha256_hex, write_json_atomic,
    write_text_atomic,
};
use uuid::Uuid;

use crate::error::{Result, ServiceError};

use super::{
    BaseRefOrigin, CreateReviewSessionInput, FileSnapshotMeta, RepoContext, ReviewService,
    ReviewSessionDto, ReviewTarget, RevisionManifestItem, SessionManifest,
};

impl ReviewService {
    pub(super) async fn resolve_repo_context(&self, target: &ReviewTarget) -> Result<RepoContext> {
        match target {
            ReviewTarget::Workspace { workspace_guid } => {
                let workspace = WorkspaceRepo::new(&self.db)
                    .find_by_guid(workspace_guid)
                    .await?
                    .ok_or_else(|| {
                        ServiceError::NotFound(format!("Workspace {} not found", workspace_guid))
                    })?;
                let project = ProjectRepo::new(&self.db)
                    .find_by_guid(&workspace.project_guid)
                    .await?
                    .ok_or_else(|| {
                        ServiceError::NotFound(format!(
                            "Project {} not found",
                            workspace.project_guid
                        ))
                    })?;
                let repo_path = self
                    .git_engine
                    .get_worktree_path(&workspace.name)
                    .map_err(ServiceError::Engine)?;
                Ok(RepoContext {
                    project_guid: project.guid,
                    workspace_guid: Some(workspace.guid),
                    repo_path,
                    base_ref: Some(workspace.base_branch),
                    base_ref_origin: BaseRefOrigin::WorkspaceBaseBranch,
                })
            }
            ReviewTarget::Project { project_guid } => {
                let project = ProjectRepo::new(&self.db)
                    .find_by_guid(project_guid)
                    .await?
                    .ok_or_else(|| {
                        ServiceError::NotFound(format!("Project {} not found", project_guid))
                    })?;
                let repo_path = std::path::PathBuf::from(&project.main_file_path);
                let (base_ref, base_ref_origin) = if let Some(branch) = project.target_branch {
                    (Some(branch), BaseRefOrigin::ProjectTargetBranch)
                } else {
                    match self.git_engine.get_default_branch(&repo_path) {
                        Ok(Some(branch)) => {
                            tracing::warn!(
                                target: "review",
                                project_guid = %project_guid,
                                "target_branch missing, falling back to repo default branch"
                            );
                            (Some(branch), BaseRefOrigin::DefaultBranchFallback)
                        }
                        _ => {
                            return Err(ServiceError::Validation(
                                "Project has no target branch configured. Set one from the topbar before starting a review session.".to_string(),
                            ));
                        }
                    }
                };
                Ok(RepoContext {
                    project_guid: project.guid,
                    workspace_guid: None,
                    repo_path,
                    base_ref,
                    base_ref_origin,
                })
            }
        }
    }

    pub async fn create_session(
        &self,
        input: CreateReviewSessionInput,
    ) -> Result<ReviewSessionDto> {
        let review_repo = ReviewRepo::new(&self.db);

        let ctx = self.resolve_repo_context(&input.target).await?;

        let changed = self
            .git_engine
            .get_changed_files(&ctx.repo_path, ctx.base_ref.as_deref(), false)
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
            .get_head_commit(&ctx.repo_path)
            .unwrap_or_else(|_| "HEAD".to_string());

        let session = review_repo
            .create_session(
                Some(session_guid.clone()),
                ctx.workspace_guid.clone(),
                ctx.project_guid.clone(),
                ctx.repo_path.to_string_lossy().to_string(),
                session_storage_root,
                ctx.base_ref.clone().or_else(|| changed.compare_ref.clone()),
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
        let repo_path_str = ctx.repo_path.to_string_lossy().to_string();
        let base_ref_str = ctx.base_ref.clone().unwrap_or_default();
        let build_result = self
            .populate_initial_session(
                &review_repo,
                &session,
                &revision_guid,
                &revision_storage_root,
                &ctx.repo_path,
                ordered_paths,
                &base_ref_str,
                input.created_by.clone(),
                &repo_path_str,
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
                .get_file_diff(workspace_root, &file_path, Some(base_branch), false)
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
}
