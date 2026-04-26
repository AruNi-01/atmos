use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::Result;

static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Returns the global review root directory: `~/.atmos/review`
pub fn global_review_root() -> Result<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| {
        crate::error::InfraError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Cannot determine home directory",
        ))
    })?;
    Ok(home.join(".atmos").join("review"))
}

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

pub fn session_root_abs_path(session_guid: &str) -> Result<PathBuf> {
    Ok(global_review_root()?
        .join("sessions")
        .join(session_dir_id(session_guid)))
}

pub fn revision_root_abs_path(session_guid: &str, revision_guid: &str) -> Result<PathBuf> {
    Ok(session_root_abs_path(session_guid)?
        .join("revisions")
        .join(revision_dir_id(revision_guid)))
}

pub fn run_root_abs_path(session_guid: &str, run_guid: &str) -> Result<PathBuf> {
    Ok(session_root_abs_path(session_guid)?
        .join("runs")
        .join(run_dir_id(run_guid)))
}

pub fn file_snapshot_root_abs_path(
    session_guid: &str,
    revision_guid: &str,
    file_snapshot_guid: &str,
) -> Result<PathBuf> {
    Ok(revision_root_abs_path(session_guid, revision_guid)?
        .join("diff-files")
        .join(safe_short_dir_id(file_snapshot_guid)))
}

pub fn anchor_file_snapshot_abs_paths(
    session_guid: &str,
    revision_guid: &str,
    file_snapshot_guid: &str,
) -> Result<(PathBuf, PathBuf, PathBuf)> {
    let root = file_snapshot_root_abs_path(session_guid, revision_guid, file_snapshot_guid)?;
    Ok((root.join("old"), root.join("new"), root.join("meta.json")))
}

pub fn manifest_abs_path(session_guid: &str) -> Result<PathBuf> {
    Ok(session_root_abs_path(session_guid)?.join("manifest.json"))
}

pub fn revisions_manifest_abs_path(session_guid: &str) -> Result<PathBuf> {
    Ok(session_root_abs_path(session_guid)?.join("revisions.json"))
}

pub async fn ensure_parent_dir(abs_path: &Path) -> Result<()> {
    if let Some(parent) = abs_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    Ok(())
}

pub async fn write_bytes_atomic(abs_path: &Path, bytes: &[u8]) -> Result<()> {
    ensure_parent_dir(abs_path).await?;
    let tmp_path = unique_tmp_path(abs_path);
    let write_result = tokio::fs::write(&tmp_path, bytes).await;
    if let Err(err) = write_result {
        let _ = tokio::fs::remove_file(&tmp_path).await;
        return Err(err.into());
    }
    if let Err(err) = tokio::fs::rename(&tmp_path, abs_path).await {
        let _ = tokio::fs::remove_file(&tmp_path).await;
        return Err(err.into());
    }
    Ok(())
}

fn unique_tmp_path(full_path: &Path) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let counter = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();
    let suffix = format!("tmp.{pid}.{nanos}.{counter}");
    let file_name = match full_path.file_name() {
        Some(name) => {
            let mut n = name.to_os_string();
            n.push(".");
            n.push(&suffix);
            n
        }
        None => std::ffi::OsString::from(suffix),
    };
    match full_path.parent() {
        Some(parent) => parent.join(file_name),
        None => PathBuf::from(file_name),
    }
}

pub async fn write_text_atomic(abs_path: &Path, text: &str) -> Result<()> {
    write_bytes_atomic(abs_path, text.as_bytes()).await
}

pub async fn write_json_atomic<T: Serialize>(abs_path: &Path, value: &T) -> Result<()> {
    let text = serde_json::to_string_pretty(value)?;
    write_text_atomic(abs_path, &text).await
}

pub fn sha256_hex(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    hex::encode(hasher.finalize())
}
