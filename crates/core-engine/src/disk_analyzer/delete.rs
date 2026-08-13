//! Trash / permanent delete for ordinary files and directories.

use std::collections::HashSet;
use std::path::Path;

use jwalk::WalkDir;

use crate::error::{EngineError, Result};

use super::scan::file_identity;
use super::types::DiskAnalyzerEngine;

impl DiskAnalyzerEngine {
    pub fn delete_path(
        &self,
        path: &Path,
        permanent: bool,
        allowed_root: Option<&Path>,
    ) -> Result<u64> {
        if path.as_os_str().is_empty() {
            return Err(EngineError::FileSystem("Empty path".to_string()));
        }
        let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        if canonical.parent().is_none() {
            return Err(EngineError::FileSystem(
                "Refusing to delete filesystem root".to_string(),
            ));
        }
        if let Some(root) = allowed_root {
            let root = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
            if !(canonical == root || canonical.starts_with(&root)) {
                return Err(EngineError::FileSystem(format!(
                    "Path {} is outside scan root {}",
                    canonical.display(),
                    root.display()
                )));
            }
        }
        if !canonical.exists() {
            return Err(EngineError::FileSystem(format!(
                "Path does not exist: {}",
                canonical.display()
            )));
        }

        let freed = if canonical.is_dir() {
            self.quick_size(&canonical)
        } else {
            Self::allocated_size(&canonical).unwrap_or(0)
        };

        if permanent {
            if canonical.is_dir() {
                std::fs::remove_dir_all(&canonical).map_err(|e| {
                    EngineError::FileSystem(format!(
                        "Failed to permanently delete {}: {}",
                        canonical.display(),
                        e
                    ))
                })?;
            } else {
                std::fs::remove_file(&canonical).map_err(|e| {
                    EngineError::FileSystem(format!(
                        "Failed to permanently delete {}: {}",
                        canonical.display(),
                        e
                    ))
                })?;
            }
        } else {
            trash::delete(&canonical).map_err(|e| {
                EngineError::FileSystem(format!(
                    "Failed to move {} to trash: {}",
                    canonical.display(),
                    e
                ))
            })?;
        }

        Ok(freed)
    }

    fn quick_size(&self, root: &Path) -> u64 {
        let mut total = 0u64;
        let mut seen: HashSet<(u64, u64)> = HashSet::new();
        for entry in WalkDir::new(root)
            .follow_links(false)
            .skip_hidden(false)
            .parallelism(jwalk::Parallelism::Serial)
        {
            let Ok(entry) = entry else {
                continue;
            };
            let path = entry.path();
            let Ok(meta) = std::fs::symlink_metadata(&path) else {
                continue;
            };
            if let Some(id) = file_identity(&path, &meta) {
                if !seen.insert(id) {
                    continue;
                }
            }
            if let Some(sz) = Self::allocated_size(&path) {
                total = total.saturating_add(sz);
            }
        }
        total
    }
}
