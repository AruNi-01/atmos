use infra::db::entities::{review_agent_run, review_file_snapshot, review_message};
use serde::Serialize;
use similar::TextDiff;

pub(super) const MESSAGE_INLINE_LIMIT: usize = 16 * 1024;

pub(super) fn is_open_review_comment_status(status: &str) -> bool {
    matches!(status, "open" | "agent_fixed")
}

pub(super) fn is_valid_review_comment_status(status: &str) -> bool {
    matches!(status, "open" | "agent_fixed" | "fixed" | "dismissed")
}

pub(super) fn default_author_type() -> String {
    "user".to_string()
}

pub(super) fn normalize_review_file_path(value: &str) -> String {
    let normalized = value.replace('\\', "/");
    let without_prefix = normalized.strip_prefix("./").unwrap_or(&normalized);
    without_prefix.trim_start_matches('/').to_string()
}

pub(super) fn count_review_snapshot_changes(
    snapshot: &review_file_snapshot::Model,
) -> (usize, usize) {
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

pub(super) fn review_message_visible_in_revision(
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

#[derive(Debug, Clone, Serialize)]
pub(super) struct SessionManifest {
    pub(super) schema_version: i32,
    pub(super) session_guid: String,
    pub(super) workspace_guid: Option<String>,
    pub(super) repo_path: String,
    pub(super) base_ref: Option<String>,
    pub(super) base_commit: Option<String>,
    pub(super) head_commit: String,
    pub(super) created_at: String,
    pub(super) file_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub(super) struct RevisionManifestItem {
    pub(super) revision_guid: String,
    pub(super) parent_revision_guid: Option<String>,
    pub(super) source_kind: String,
    pub(super) agent_run_guid: Option<String>,
    pub(super) storage_root_rel_path: String,
    pub(super) created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub(super) struct FileSnapshotMeta {
    pub(super) schema_version: i32,
    pub(super) file_path: String,
    pub(super) git_status: String,
    pub(super) is_binary: bool,
    pub(super) old_rel_path: String,
    pub(super) new_rel_path: String,
    pub(super) old_sha256: String,
    pub(super) new_sha256: String,
    pub(super) old_size: usize,
    pub(super) new_size: usize,
}
