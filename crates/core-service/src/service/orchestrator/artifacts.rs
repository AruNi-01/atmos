//! Artifact paths + atomic JSON publish under run dir.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{Result, ServiceError};

pub fn ensure_run_layout(artifact_dir: &Path) -> Result<()> {
    for sub in [
        "specs",
        "evidence",
        "verdicts",
        "prompts",
        "attempts",
        "nodes",
        "workspaces",
    ] {
        fs::create_dir_all(artifact_dir.join(sub))
            .map_err(|e| ServiceError::Processing(format!("create artifact dir {sub}: {e}")))?;
    }
    Ok(())
}

pub fn write_json_atomic(path: &Path, value: &impl Serialize) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| ServiceError::Processing(format!("mkdir parent: {e}")))?;
    }
    let tmp = path.with_extension("json.tmp");
    let data = serde_json::to_vec_pretty(value)
        .map_err(|e| ServiceError::Processing(format!("serialize json: {e}")))?;
    fs::write(&tmp, &data).map_err(|e| ServiceError::Processing(format!("write tmp: {e}")))?;
    // Validate re-parse before rename
    let _: serde_json::Value = serde_json::from_slice(&data)
        .map_err(|e| ServiceError::Processing(format!("invalid json before rename: {e}")))?;
    fs::rename(&tmp, path).map_err(|e| ServiceError::Processing(format!("rename atomic: {e}")))?;
    Ok(())
}

pub fn read_json_file<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    let data = fs::read(path)
        .map_err(|e| ServiceError::Processing(format!("read {}: {e}", path.display())))?;
    serde_json::from_slice(&data)
        .map_err(|e| ServiceError::Processing(format!("parse {}: {e}", path.display())))
}

/// Reject partial/truncated JSON (must parse fully as T).
pub fn accept_artifact<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    if !path.exists() {
        return Err(ServiceError::Validation(format!(
            "artifact missing: {}",
            path.display()
        )));
    }
    // Refuse .tmp
    if path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e == "tmp" || e.ends_with("tmp"))
    {
        return Err(ServiceError::Validation(
            "refusing temporary artifact path".into(),
        ));
    }
    read_json_file(path)
}

pub fn orchestrator_root() -> PathBuf {
    if let Ok(dir) = std::env::var("ATMOS_ORCHESTRATOR_DIR") {
        return PathBuf::from(dir);
    }
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".atmos").join("orchestrator")
}

pub fn assert_not_canvas_path(path: &Path) -> Result<()> {
    let s = path.to_string_lossy();
    if s.contains("/.atmos/canvas/") || s.contains("\\.atmos\\canvas\\") {
        return Err(ServiceError::Validation(
            "orchestrator must not write under ordinary canvas directory".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;

    #[test]
    fn atomic_write_and_accept() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("mode_proposal.json");
        write_json_atomic(&path, &json!({"mode": "loop", "reason": "x"})).unwrap();
        let v: serde_json::Value = accept_artifact(&path).unwrap();
        assert_eq!(v["mode"], "loop");
    }

    #[test]
    fn reject_missing() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("nope.json");
        assert!(accept_artifact::<serde_json::Value>(&path).is_err());
    }

    #[test]
    fn canvas_path_forbidden() {
        let p = PathBuf::from("/Users/x/.atmos/canvas/Default.atmos.tldr");
        assert!(assert_not_canvas_path(&p).is_err());
        let p2 = PathBuf::from("/Users/x/.atmos/orchestrator/boards/x.atmos.tldr");
        assert!(assert_not_canvas_path(&p2).is_ok());
    }
}
