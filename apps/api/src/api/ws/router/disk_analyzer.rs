use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use core_engine::{
    cleanup_suggestions, DiskAnalyzerEngine, DiskNode, ProgressCallback, ScanProgress, ScanStatus,
};
use serde_json::{json, Value};
use uuid::Uuid;

use core_service::{Result, ServiceError};

use super::{
    DiskAnalyzerCancelScanRequest, DiskAnalyzerDeleteRequest, DiskAnalyzerDiskInfoRequest,
    DiskAnalyzerGetTreeRequest, DiskAnalyzerStartScanRequest, DiskAnalyzerScanSession, WsEvent,
    WsMessage, WsMessageService,
};

impl WsMessageService {
    pub(super) async fn handle_disk_analyzer_start_scan(
        &self,
        _conn_id: &str,
        req: DiskAnalyzerStartScanRequest,
    ) -> Result<Value> {
        let root = match req.path.as_deref() {
            Some(p) if !p.is_empty() => self.fs_engine.expand_path(p)?,
            _ => self.fs_engine.get_home_dir()?,
        };

        let mut project_roots: Vec<PathBuf> = Vec::new();
        if let Ok(projects) = self.project_service.list_projects().await {
            for project in projects {
                project_roots.push(PathBuf::from(&project.main_file_path));
                if let Ok(workspaces) = self
                    .workspace_service
                    .list_by_project(project.guid.clone(), true)
                    .await
                {
                    for workspace in workspaces {
                        if let Ok(path) = self.git_engine.get_worktree_path(&workspace.model.name) {
                            project_roots.push(path);
                        }
                    }
                }
            }
        }

        let scan_id = Uuid::new_v4().to_string();
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let mut sessions = self
                .disk_analyzer_sessions
                .lock()
                .map_err(|_| ServiceError::Processing("disk scan lock poisoned".into()))?;
            sessions.insert(
                scan_id.clone(),
                DiskAnalyzerScanSession {
                    cancel: Arc::clone(&cancel),
                    tree: None,
                    stats: None,
                    root_path: root.to_string_lossy().to_string(),
                },
            );
        }

        let engine = DiskAnalyzerEngine::new();
        let ws_manager = self.ws_manager.get().cloned();
        let sessions = Arc::clone(&self.disk_analyzer_sessions);
        let scan_id_task = scan_id.clone();
        let max_children = req.max_children;
        let root_for_task = root.clone();

        let on_progress: ProgressCallback = Arc::new({
            let ws_manager = ws_manager.clone();
            move |progress: ScanProgress| {
                let ws_manager = ws_manager.clone();
                let payload = match serde_json::to_value(&progress) {
                    Ok(v) => v,
                    Err(_) => return,
                };
                tokio::spawn(async move {
                    if let Some(mgr) = ws_manager {
                        let notification =
                            WsMessage::notification(WsEvent::DiskAnalyzerScanProgress, payload);
                        let _ = mgr.broadcast(&notification).await;
                    }
                });
            }
        });

        tokio::task::spawn_blocking(move || {
            let result = engine.scan_path(
                &scan_id_task,
                &root_for_task,
                &project_roots,
                max_children,
                Some(cancel),
                Some(on_progress),
            );

            match result {
                Ok((tree, stats)) => {
                    let suggestions = cleanup_suggestions(&tree);
                    if let Ok(mut guard) = sessions.lock() {
                        if let Some(session) = guard.get_mut(&scan_id_task) {
                            session.tree = Some(tree.clone());
                            session.stats = Some(stats.clone());
                        }
                    }
                    if let Some(mgr) = ws_manager {
                        let payload = json!({
                            "scan_id": scan_id_task,
                            "status": "completed",
                            "files_scanned": stats.files_scanned,
                            "bytes_scanned": stats.total_size,
                            "dirs_scanned": stats.dirs_scanned,
                            "error_count": stats.error_count,
                            "current_path": Value::Null,
                            "percent": 100.0,
                            "error": Value::Null,
                            "tree": tree,
                            "stats": stats,
                            "suggestions": suggestions,
                        });
                        tokio::spawn(async move {
                            let notification =
                                WsMessage::notification(WsEvent::DiskAnalyzerScanProgress, payload);
                            let _ = mgr.broadcast(&notification).await;
                        });
                    }
                }
                Err(e) => {
                    let cancelled = e.to_string().contains("cancelled");
                    let status = if cancelled {
                        ScanStatus::Cancelled
                    } else {
                        ScanStatus::Failed
                    };
                    if let Some(mgr) = ws_manager {
                        let payload = json!({
                            "scan_id": scan_id_task,
                            "status": status,
                            "files_scanned": 0,
                            "bytes_scanned": 0,
                            "dirs_scanned": 0,
                            "error_count": if cancelled { 0 } else { 1 },
                            "current_path": Value::Null,
                            "percent": Value::Null,
                            "error": if cancelled { Value::Null } else { json!(e.to_string()) },
                        });
                        tokio::spawn(async move {
                            let notification =
                                WsMessage::notification(WsEvent::DiskAnalyzerScanProgress, payload);
                            let _ = mgr.broadcast(&notification).await;
                        });
                    }
                }
            }
        });

        Ok(json!({
            "scan_id": scan_id,
            "root_path": root.to_string_lossy(),
            "status": "started",
        }))
    }

    pub(super) fn handle_disk_analyzer_cancel_scan(
        &self,
        req: DiskAnalyzerCancelScanRequest,
    ) -> Result<Value> {
        let sessions = self
            .disk_analyzer_sessions
            .lock()
            .map_err(|_| ServiceError::Processing("disk scan lock poisoned".into()))?;
        let session = sessions
            .get(&req.scan_id)
            .ok_or_else(|| ServiceError::NotFound(format!("scan {}", req.scan_id)))?;
        session.cancel.store(true, Ordering::Relaxed);
        Ok(json!({ "ok": true, "scan_id": req.scan_id }))
    }

    pub(super) fn handle_disk_analyzer_get_tree(
        &self,
        req: DiskAnalyzerGetTreeRequest,
    ) -> Result<Value> {
        let sessions = self
            .disk_analyzer_sessions
            .lock()
            .map_err(|_| ServiceError::Processing("disk scan lock poisoned".into()))?;
        let session = sessions
            .get(&req.scan_id)
            .ok_or_else(|| ServiceError::NotFound(format!("scan {}", req.scan_id)))?;
        let tree = session
            .tree
            .as_ref()
            .ok_or_else(|| ServiceError::Validation("scan not completed yet".into()))?;
        let stats = session.stats.clone();

        let selected = if let Some(path) = req.path.as_deref() {
            find_node(tree, path).ok_or_else(|| ServiceError::NotFound(path.to_string()))?
        } else {
            tree
        };

        let mut cloned = selected.clone();
        if let Some(max) = req.max_children {
            core_engine::prune_tree(&mut cloned, max.max(1));
        }

        Ok(json!({
            "tree": cloned,
            "stats": stats,
        }))
    }

    pub(super) fn handle_disk_analyzer_delete(
        &self,
        req: DiskAnalyzerDeleteRequest,
    ) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let engine = DiskAnalyzerEngine::new();
        let freed = engine.delete_path(&path, req.permanent)?;
        Ok(json!({
            "success": true,
            "path": path.to_string_lossy(),
            "freed_bytes": freed,
            "permanent": req.permanent,
        }))
    }

    pub(super) fn handle_disk_analyzer_disk_info(
        &self,
        req: DiskAnalyzerDiskInfoRequest,
    ) -> Result<Value> {
        let path = match req.path.as_deref() {
            Some(p) if !p.is_empty() => self.fs_engine.expand_path(p)?,
            _ => self.fs_engine.get_home_dir()?,
        };
        let engine = DiskAnalyzerEngine::new();
        let info = engine.disk_info(&path)?;
        serde_json::to_value(info).map_err(|e| ServiceError::Processing(e.to_string()))
    }
}

fn find_node<'a>(node: &'a DiskNode, path: &str) -> Option<&'a DiskNode> {
    if node.path == path {
        return Some(node);
    }
    for child in &node.children {
        if let Some(found) = find_node(child, path) {
            return Some(found);
        }
    }
    None
}
