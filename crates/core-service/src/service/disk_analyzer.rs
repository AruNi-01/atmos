//! Disk Analyzer business service — scan sessions, ownership, project roots.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use core_engine::{
    prune_tree, CleanupSuggestion, DiskAnalyzerEngine, DiskNode, DiskVolumeInfo, FsEngine,
    GitEngine, ProgressCallback, ScanProgress, ScanStats, ScanStatus,
};
use parking_lot::Mutex;
use serde::Serialize;
use serde_json::{json, Value};
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::service::{project::ProjectService, workspace::WorkspaceService};
use crate::{Result, ServiceError};

const MAX_SESSIONS: usize = 8;
const SESSION_TTL: Duration = Duration::from_secs(30 * 60);
const EVENT_CHANNEL_CAPACITY: usize = 64;

#[derive(Debug, Clone, Serialize)]
pub struct DiskAnalyzerScanEvent {
    pub owner_conn_id: String,
    pub payload: Value,
}

struct DiskAnalyzerSession {
    owner_conn_id: String,
    cancel: Arc<AtomicBool>,
    tree: Option<Arc<DiskNode>>,
    stats: Option<ScanStats>,
    suggestions: Option<Vec<CleanupSuggestion>>,
    root_path: PathBuf,
    completed_at: Option<Instant>,
}

pub struct DiskAnalyzerService {
    engine: DiskAnalyzerEngine,
    fs_engine: FsEngine,
    git_engine: GitEngine,
    project_service: Arc<ProjectService>,
    workspace_service: Arc<WorkspaceService>,
    sessions: Arc<Mutex<HashMap<String, DiskAnalyzerSession>>>,
    event_tx: broadcast::Sender<DiskAnalyzerScanEvent>,
}

impl DiskAnalyzerService {
    pub fn new(
        project_service: Arc<ProjectService>,
        workspace_service: Arc<WorkspaceService>,
    ) -> Self {
        let (event_tx, _) = broadcast::channel(EVENT_CHANNEL_CAPACITY);
        Self {
            engine: DiskAnalyzerEngine::new(),
            fs_engine: FsEngine::new(),
            git_engine: GitEngine::new(),
            project_service,
            workspace_service,
            sessions: Arc::new(Mutex::new(HashMap::new())),
            event_tx,
        }
    }

    pub fn subscribe_events(&self) -> broadcast::Receiver<DiskAnalyzerScanEvent> {
        self.event_tx.subscribe()
    }

    pub async fn start_scan(
        &self,
        owner_conn_id: &str,
        path: Option<&str>,
        max_children: Option<usize>,
    ) -> Result<Value> {
        let root = match path {
            Some(p) if !p.is_empty() => self.fs_engine.expand_path(p)?,
            _ => self.fs_engine.get_home_dir()?,
        };

        let project_roots = self.collect_project_roots().await;

        let scan_id = Uuid::new_v4().to_string();
        let cancel = Arc::new(AtomicBool::new(false));

        {
            let mut sessions = self.sessions.lock();
            Self::evict_expired(&mut sessions);
            if sessions.len() >= MAX_SESSIONS {
                Self::evict_oldest_completed(&mut sessions);
            }
            if sessions.len() >= MAX_SESSIONS {
                return Err(ServiceError::Validation(
                    "Too many active disk analyzer scans; cancel one or wait for TTL cleanup"
                        .into(),
                ));
            }
            sessions.insert(
                scan_id.clone(),
                DiskAnalyzerSession {
                    owner_conn_id: owner_conn_id.to_string(),
                    cancel: Arc::clone(&cancel),
                    tree: None,
                    stats: None,
                    suggestions: None,
                    root_path: root.clone(),
                    completed_at: None,
                },
            );
        }

        let engine = DiskAnalyzerEngine::new();
        let sessions = Arc::clone(&self.sessions);
        let event_tx = self.event_tx.clone();
        let owner = owner_conn_id.to_string();
        let scan_id_task = scan_id.clone();
        let root_for_task = root.clone();

        let on_progress: ProgressCallback = Arc::new({
            let event_tx = event_tx.clone();
            let owner = owner.clone();
            move |progress: ScanProgress| {
                let Ok(payload) = serde_json::to_value(&progress) else {
                    return;
                };
                let _ = event_tx.send(DiskAnalyzerScanEvent {
                    owner_conn_id: owner.clone(),
                    payload,
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
                Ok((tree, stats, suggestions)) => {
                    // Store once under Arc; serialize from that reference (no deep clone).
                    let tree = Arc::new(tree);
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
                        "tree": tree.as_ref(),
                        "stats": &stats,
                        "suggestions": &suggestions,
                    });
                    if let Some(session) = sessions.lock().get_mut(&scan_id_task) {
                        session.tree = Some(Arc::clone(&tree));
                        session.stats = Some(stats);
                        session.suggestions = Some(suggestions);
                        session.completed_at = Some(Instant::now());
                    }
                    let _ = event_tx.send(DiskAnalyzerScanEvent {
                        owner_conn_id: owner,
                        payload,
                    });
                }
                Err(e) => {
                    let cancelled = e.to_string().contains("cancelled");
                    let status = if cancelled {
                        ScanStatus::Cancelled
                    } else {
                        ScanStatus::Failed
                    };
                    if let Some(session) = sessions.lock().get_mut(&scan_id_task) {
                        session.completed_at = Some(Instant::now());
                    }
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
                    let _ = event_tx.send(DiskAnalyzerScanEvent {
                        owner_conn_id: owner,
                        payload,
                    });
                }
            }
        });

        Ok(json!({
            "scan_id": scan_id,
            "root_path": root.to_string_lossy(),
            "status": "started",
        }))
    }

    pub fn cancel_scan(&self, owner_conn_id: &str, scan_id: &str) -> Result<Value> {
        let sessions = self.sessions.lock();
        let session = sessions
            .get(scan_id)
            .ok_or_else(|| ServiceError::NotFound(format!("scan {scan_id}")))?;
        Self::ensure_owner(session, owner_conn_id)?;
        session.cancel.store(true, Ordering::Relaxed);
        Ok(json!({ "ok": true, "scan_id": scan_id }))
    }

    pub fn get_tree(
        &self,
        owner_conn_id: &str,
        scan_id: &str,
        path: Option<&str>,
        max_children: Option<usize>,
    ) -> Result<Value> {
        let (tree, stats) = {
            let sessions = self.sessions.lock();
            let session = sessions
                .get(scan_id)
                .ok_or_else(|| ServiceError::NotFound(format!("scan {scan_id}")))?;
            Self::ensure_owner(session, owner_conn_id)?;
            let tree = session
                .tree
                .clone()
                .ok_or_else(|| ServiceError::Validation("scan not completed yet".into()))?;
            (tree, session.stats.clone())
        };

        let selected = if let Some(path) = path {
            find_node(tree.as_ref(), path)
                .ok_or_else(|| ServiceError::NotFound(path.to_string()))?
                .clone()
        } else {
            (*tree).clone()
        };

        let mut cloned = selected;
        if let Some(max) = max_children {
            prune_tree(&mut cloned, max.max(1));
        }

        Ok(json!({
            "tree": cloned,
            "stats": stats,
        }))
    }

    pub async fn delete_path(
        &self,
        owner_conn_id: &str,
        scan_id: &str,
        path: &str,
        permanent: bool,
    ) -> Result<Value> {
        let root = {
            let sessions = self.sessions.lock();
            let session = sessions
                .get(scan_id)
                .ok_or_else(|| ServiceError::NotFound(format!("scan {scan_id}")))?;
            Self::ensure_owner(session, owner_conn_id)?;
            session.root_path.clone()
        };

        let path = self.fs_engine.expand_path(path)?;
        let engine = DiskAnalyzerEngine::new();
        let root_for_task = root.clone();
        let path_for_task = path.clone();

        let freed = tokio::task::spawn_blocking(move || {
            engine.delete_path(&path_for_task, permanent, Some(&root_for_task))
        })
        .await
        .map_err(|e| ServiceError::Processing(format!("delete task join failed: {e}")))??;

        Ok(json!({
            "success": true,
            "path": path.to_string_lossy(),
            "freed_bytes": freed,
            "permanent": permanent,
        }))
    }

    pub fn disk_info(&self, path: Option<&str>) -> Result<DiskVolumeInfo> {
        let path = match path {
            Some(p) if !p.is_empty() => self.fs_engine.expand_path(p)?,
            _ => self.fs_engine.get_home_dir()?,
        };
        Ok(self.engine.disk_info(&path)?)
    }

    async fn collect_project_roots(&self) -> Vec<PathBuf> {
        let mut project_roots: Vec<PathBuf> = Vec::new();
        let Ok(projects) = self.project_service.list_projects().await else {
            return project_roots;
        };
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
        project_roots
    }

    fn ensure_owner(session: &DiskAnalyzerSession, owner_conn_id: &str) -> Result<()> {
        if session.owner_conn_id != owner_conn_id {
            return Err(ServiceError::Validation(
                "scan session belongs to another connection".into(),
            ));
        }
        Ok(())
    }

    fn evict_expired(sessions: &mut HashMap<String, DiskAnalyzerSession>) {
        let now = Instant::now();
        sessions.retain(|_, session| match session.completed_at {
            // Never TTL-evict an in-flight scan (large drives can exceed SESSION_TTL).
            Some(completed) => now.duration_since(completed) < SESSION_TTL,
            None => true,
        });
    }

    fn evict_oldest_completed(sessions: &mut HashMap<String, DiskAnalyzerSession>) {
        let oldest = sessions
            .iter()
            .filter_map(|(id, s)| s.completed_at.map(|t| (id.clone(), t)))
            .min_by_key(|(_, t)| *t);
        if let Some((id, _)) = oldest {
            sessions.remove(&id);
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_node_walks_children() {
        let tree = DiskNode {
            name: "root".into(),
            path: "/r".into(),
            size: 1,
            is_dir: true,
            is_project: false,
            file_count: 0,
            dir_count: 1,
            children: vec![DiskNode {
                name: "a".into(),
                path: "/r/a".into(),
                size: 1,
                is_dir: false,
                is_project: false,
                file_count: 0,
                dir_count: 0,
                children: vec![],
            }],
        };
        assert!(find_node(&tree, "/r/a").is_some());
        assert!(find_node(&tree, "/missing").is_none());
    }
}
