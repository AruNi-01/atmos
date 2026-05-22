use std::collections::{HashMap, HashSet};
use std::path::Path;

use infra::db::entities::{
    review_agent_run, review_file_snapshot, review_file_state, review_revision, review_session,
};
use infra::db::repo::ReviewRepo;
use infra::utils::review_artifacts::{
    anchor_file_snapshot_abs_paths, revisions_manifest_abs_path, run_root_abs_path, sha256_hex,
    write_json_atomic, write_text_atomic,
};
use similar::TextDiff;
use uuid::Uuid;

use crate::error::{Result, ServiceError};

use super::super::support::{FileSnapshotMeta, RevisionManifestItem};
use super::super::{ReviewAgentRunFinalizedDto, ReviewService};

impl ReviewService {
    pub(in crate::service::review) async fn finalize_fix_agent_run(
        &self,
        review_repo: &ReviewRepo<'_>,
        run: &review_agent_run::Model,
        session: &review_session::Model,
        base_revision: &review_revision::Model,
        revision: review_revision::Model,
        workspace_root: &Path,
        change_time: chrono::NaiveDateTime,
    ) -> Result<ReviewAgentRunFinalizedDto> {
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
            let prior_content = std::fs::read_to_string(&snapshot.new_rel_path).unwrap_or_default();
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
            .get_changed_files(workspace_root, session.base_ref.as_deref(), false)
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
            let current_content = std::fs::read_to_string(&current_file_path).unwrap_or_default();
            let file_identity = review_repo
                .find_or_create_file_identity(session.guid.clone(), file_path.clone())
                .await
                .map_err(ServiceError::Infra)?;
            let file_snapshot_guid = Uuid::new_v4().to_string();
            let (old_abs_path, new_abs_path, meta_abs_path) =
                anchor_file_snapshot_abs_paths(&session.guid, &revision.guid, &file_snapshot_guid)
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
}
