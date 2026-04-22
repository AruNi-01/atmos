use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use crate::error::Result;

pub const REVIEW_ROOT_DIR: &str = ".atmos/review";

fn safe_short_dir_id(id: &str) -> String {
    let safe_prefix: String = id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(12)
        .collect();
    let mut hasher = DefaultHasher::new();
    id.hash(&mut hasher);
    let hash = hasher.finish();
    format!("{}_{}", safe_prefix, format!("{hash:016x}"))
}

pub fn session_dir_id(session_guid: &str) -> String {
    safe_short_dir_id(session_guid)
}

pub fn revision_dir_id(revision_guid: &str) -> String {
    safe_short_dir_id(revision_guid)
}

pub fn run_dir_id(run_guid: &str) -> String {
    safe_short_dir_id(run_guid)
}

pub fn session_root_rel_path(session_guid: &str) -> PathBuf {
    PathBuf::from(REVIEW_ROOT_DIR)
        .join("sessions")
        .join(session_dir_id(session_guid))
}

pub fn revision_root_rel_path(session_guid: &str, revision_guid: &str) -> PathBuf {
    session_root_rel_path(session_guid)
        .join("revisions")
        .join(revision_dir_id(revision_guid))
}

pub fn run_root_rel_path(session_guid: &str, run_guid: &str) -> PathBuf {
    session_root_rel_path(session_guid)
        .join("runs")
        .join(run_dir_id(run_guid))
}

pub fn file_snapshot_root_rel_path(
    session_guid: &str,
    revision_guid: &str,
    file_snapshot_guid: &str,
) -> PathBuf {
    revision_root_rel_path(session_guid, revision_guid)
        .join("diff-files")
        .join(safe_short_dir_id(file_snapshot_guid))
}

pub fn anchor_file_snapshot_paths(
    session_guid: &str,
    revision_guid: &str,
    file_snapshot_guid: &str,
) -> (PathBuf, PathBuf, PathBuf) {
    let root = file_snapshot_root_rel_path(session_guid, revision_guid, file_snapshot_guid);
    (root.join("old"), root.join("new"), root.join("meta.json"))
}

pub fn manifest_rel_path(session_guid: &str) -> PathBuf {
    session_root_rel_path(session_guid).join("manifest.json")
}

pub fn revisions_manifest_rel_path(session_guid: &str) -> PathBuf {
    session_root_rel_path(session_guid).join("revisions.json")
}

pub async fn ensure_parent_dir(workspace_root: &Path, rel_path: &Path) -> Result<()> {
    if let Some(parent) = workspace_root.join(rel_path).parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    Ok(())
}

pub async fn write_bytes_atomic(workspace_root: &Path, rel_path: &Path, bytes: &[u8]) -> Result<()> {
    ensure_parent_dir(workspace_root, rel_path).await?;
    let full_path = workspace_root.join(rel_path);
    let tmp_path = full_path.with_extension("tmp");
    tokio::fs::write(&tmp_path, bytes).await?;
    tokio::fs::rename(&tmp_path, &full_path).await?;
    Ok(())
}

pub async fn write_text_atomic(workspace_root: &Path, rel_path: &Path, text: &str) -> Result<()> {
    write_bytes_atomic(workspace_root, rel_path, text.as_bytes()).await
}

pub async fn write_json_atomic<T: Serialize>(
    workspace_root: &Path,
    rel_path: &Path,
    value: &T,
) -> Result<()> {
    let text = serde_json::to_string_pretty(value)?;
    write_text_atomic(workspace_root, rel_path, &text).await
}

pub fn sha256_like_hex(content: &str) -> String {
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}
