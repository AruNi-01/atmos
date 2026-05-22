use std::collections::HashMap;

use infra::db::entities::{review_agent_run, review_file_state, review_revision, review_session};
use infra::db::repo::ReviewRepo;
use infra::utils::review_artifacts::{
    anchor_file_snapshot_abs_paths, sha256_hex, write_json_atomic, write_text_atomic,
};
use uuid::Uuid;

use crate::error::{Result, ServiceError};

use super::super::support::FileSnapshotMeta;
use super::super::{ReviewRevisionDto, ReviewService};

impl ReviewService {
    pub(super) async fn create_agent_run_revision(
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
        let revision_storage_root =
            infra::utils::review_artifacts::revision_root_abs_path(&session.guid, &revision_guid)
                .map_err(ServiceError::Infra)?
                .to_string_lossy()
                .to_string();
        let revisions_before = review_repo
            .list_revisions_by_session(&session.guid)
            .await
            .map_err(ServiceError::Infra)?;
        let (source_kind, title) = match run.run_kind.as_str() {
            "review" => (
                "agent_review",
                format!("Review Checkpoint {}", revisions_before.len()),
            ),
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
}
