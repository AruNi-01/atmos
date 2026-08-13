//! Delete routing: Atmos workspace purge, git worktree remove, or trash.

use std::path::{Path, PathBuf};

use core_engine::{clear_path_cache, invalidate_path_cache, DiskAnalyzerEngine, GitEngine};
use serde_json::{json, Value};

use crate::service::workspace::WorkspaceDto;
use crate::{Result, ServiceError};

use super::DiskAnalyzerService;

impl DiskAnalyzerService {
    pub async fn delete_path(
        &self,
        owner_conn_id: &str,
        scan_id: &str,
        path: &str,
        permanent: bool,
    ) -> Result<Value> {
        let (entry_roots, _) = {
            let sessions = self.sessions.lock();
            let session = sessions
                .get(scan_id)
                .ok_or_else(|| ServiceError::NotFound(format!("scan {scan_id}")))?;
            Self::ensure_owner(session, owner_conn_id)?;
            (session.entry_roots.clone(), session.root_path.clone())
        };

        if path.starts_with("atmos://") {
            return Err(ServiceError::Validation(
                "cannot delete a synthetic disk-analyzer path".into(),
            ));
        }

        let path = self.fs_engine.expand_path(path)?;
        let allowed_root = entry_roots
            .iter()
            .find(|root| path == **root || path.starts_with(root))
            .cloned()
            .ok_or_else(|| {
                ServiceError::Validation(format!(
                    "path {} is outside scan entry roots",
                    path.display()
                ))
            })?;

        let freed = if let Some(workspace) = self.find_workspace_for_path(&path).await? {
            self.purge_atmos_workspace(&workspace, &path, &allowed_root)
                .await?
        } else {
            let path_for_task = path.clone();
            tokio::task::spawn_blocking(move || {
                delete_non_workspace_path(&path_for_task, permanent, &allowed_root)
            })
            .await
            .map_err(|e| ServiceError::Processing(format!("delete task join failed: {e}")))??
        };

        // Drop caches for deleted path and its parent so sizes refresh on next open.
        invalidate_path_cache(&path);
        if let Some(parent) = path.parent() {
            invalidate_path_cache(parent);
        }
        clear_path_cache(); // simple + correct: force full remeasure after delete

        {
            let mut sessions = self.sessions.lock();
            if let Some(session) = sessions.get_mut(scan_id) {
                session.tree = None;
                session.completed_at = None;
                if let Some(list) = session.suggestions.as_mut() {
                    let deleted = path.to_string_lossy();
                    let deleted = deleted.trim_end_matches('/');
                    list.retain(|item| {
                        let item_path = item.path.trim_end_matches('/');
                        item_path != deleted && !item_path.starts_with(&format!("{deleted}/"))
                    });
                }
            }
        }

        Ok(json!({
            "success": true,
            "path": path.to_string_lossy(),
            "freed_bytes": freed,
            "permanent": permanent,
        }))
    }

    async fn find_workspace_for_path(&self, path: &Path) -> Result<Option<WorkspaceDto>> {
        let Ok(projects) = self.project_service.list_projects().await else {
            return Ok(None);
        };
        let git_engine = GitEngine::new();
        for project in projects {
            let Ok(workspaces) = self
                .workspace_service
                .list_all_by_project(project.guid.clone())
                .await
            else {
                continue;
            };
            for workspace in workspaces {
                let Some(ws_path) = workspace_disk_path(&workspace, &git_engine) else {
                    continue;
                };
                if same_existing_path(path, &ws_path) {
                    return Ok(Some(workspace));
                }
            }
        }
        Ok(None)
    }

    /// Remove the on-disk worktree first, then run product workspace delete
    /// so the DB row is soft-deleted (including archived workspaces).
    async fn purge_atmos_workspace(
        &self,
        workspace: &WorkspaceDto,
        path: &Path,
        allowed_root: &Path,
    ) -> Result<u64> {
        let path = path.to_path_buf();
        let allowed_root = allowed_root.to_path_buf();
        let freed = if path.exists() {
            tokio::task::spawn_blocking(move || {
                delete_non_workspace_path(&path, true, &allowed_root)
            })
            .await
            .map_err(|e| ServiceError::Processing(format!("delete task join failed: {e}")))??
        } else {
            0
        };
        self.workspace_service
            .delete_workspace(workspace.model.guid.clone())
            .await?;
        Ok(freed)
    }
}

pub(super) fn canonicalize_or_clone(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

pub(super) fn same_existing_path(left: &Path, right: &Path) -> bool {
    canonicalize_or_clone(left) == canonicalize_or_clone(right)
}

pub(super) fn workspace_disk_path(
    workspace: &WorkspaceDto,
    git_engine: &GitEngine,
) -> Option<PathBuf> {
    if !workspace.local_path.is_empty() {
        return Some(PathBuf::from(&workspace.local_path));
    }
    git_engine.get_worktree_path(&workspace.model.name).ok()
}

/// Linked worktrees go through `git worktree remove`. Everything else uses
/// trash / permanent delete.
pub(super) fn delete_non_workspace_path(
    path: &Path,
    permanent: bool,
    allowed_root: &Path,
) -> std::result::Result<u64, core_engine::EngineError> {
    let git = GitEngine::new();
    if git.is_linked_worktree(path) {
        let engine = DiskAnalyzerEngine::new();
        let freed = engine.measure_path(path, None).map(|m| m.size).unwrap_or(0);
        git.remove_linked_worktree(path)?;
        return Ok(freed);
    }
    DiskAnalyzerEngine::new().delete_path(path, permanent, Some(allowed_root))
}
