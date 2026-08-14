//! On-demand level walk for drill-in (`get_tree`).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::Instant;

use core_engine::{
    agent_data_roots, DiskAnalyzerEngine, DiskNode, DiskScanRoots, GitEngine, ProgressCallback,
    ScanProgress, ScanStatus,
};
use parking_lot::Mutex;
use serde_json::{json, Value};
use tokio::sync::broadcast;

use super::{path_key, DiskAnalyzerScanEvent, DiskAnalyzerService, DiskAnalyzerSession};

impl DiskAnalyzerService {
    #[allow(clippy::too_many_arguments)]
    pub(super) fn spawn_walk(
        sessions: Arc<Mutex<HashMap<String, DiskAnalyzerSession>>>,
        event_tx: broadcast::Sender<DiskAnalyzerScanEvent>,
        scan_id: String,
        owner: String,
        level_path: PathBuf,
        mut roots: DiskScanRoots,
        max_children: usize,
        cancel: Arc<AtomicBool>,
        is_session_root: bool,
    ) {
        let engine = DiskAnalyzerEngine::new();
        let level_key = path_key(&level_path);

        let on_progress: ProgressCallback = Arc::new({
            let event_tx = event_tx.clone();
            let owner = owner.clone();
            let sessions = Arc::clone(&sessions);
            let scan_id = scan_id.clone();
            move |progress: ScanProgress| {
                if let Some(tree) = progress.tree.as_ref() {
                    if let Some(session) = sessions.lock().get_mut(&scan_id) {
                        if is_session_root
                            || session.root_path.to_string_lossy().as_ref() == tree.path.as_str()
                        {
                            session.tree = Some(Arc::new(tree.clone()));
                        } else if let Some(existing) = session.tree.as_ref() {
                            let mut merged = (**existing).clone();
                            if merge_subtree(&mut merged, tree) {
                                session.tree = Some(Arc::new(merged));
                            }
                        } else {
                            session.tree = Some(Arc::new(tree.clone()));
                        }
                    }
                }
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
            let need_discover = sessions
                .lock()
                .get(&scan_id)
                .map(|s| !s.marks_ready)
                .unwrap_or(true);
            if need_discover {
                if let Some(home) = dirs::home_dir() {
                    roots.agent_data_roots = agent_data_roots(&home)
                        .into_iter()
                        .map(|(_, p)| p)
                        .collect();
                    roots.git_worktree_roots =
                        GitEngine::new().discover_linked_worktrees_fast(&home, Some(&cancel));
                }
                if let Some(session) = sessions.lock().get_mut(&scan_id) {
                    session.git_worktree_roots = roots.git_worktree_roots.clone();
                    session.agent_data_roots = roots.agent_data_roots.clone();
                    session.marks_ready = true;
                }
            } else if let Some(session) = sessions.lock().get(&scan_id) {
                roots.git_worktree_roots = session.git_worktree_roots.clone();
                roots.agent_data_roots = session.agent_data_roots.clone();
            }
            let result = engine.scan_path(
                &scan_id,
                &level_path,
                &roots,
                Some(max_children),
                Some(cancel),
                Some(on_progress),
            );

            match result {
                Ok((tree, stats, suggestions)) => {
                    let tree = Arc::new(tree);
                    let payload = json!({
                        "scan_id": scan_id,
                        "status": if is_session_root { "completed" } else { "level_completed" },
                        "files_scanned": stats.files_scanned,
                        "bytes_scanned": stats.total_size,
                        "dirs_scanned": stats.dirs_scanned,
                        "error_count": stats.error_count,
                        "current_path": Value::Null,
                        "percent": 100.0,
                        "error": Value::Null,
                        "tree": tree.as_ref(),
                        "level_path": level_key,
                        "stats": &stats,
                        "suggestions": if is_session_root { json!(&suggestions) } else { Value::Null },
                    });
                    if let Some(session) = sessions.lock().get_mut(&scan_id) {
                        if is_session_root
                            || session.root_path.to_string_lossy().as_ref() == tree.path.as_str()
                        {
                            session.tree = Some(Arc::clone(&tree));
                        } else if let Some(existing) = session.tree.as_ref() {
                            let mut merged = (**existing).clone();
                            if merge_subtree(&mut merged, tree.as_ref()) {
                                session.tree = Some(Arc::new(merged));
                            } else {
                                session.tree = Some(Arc::clone(&tree));
                            }
                        } else {
                            session.tree = Some(Arc::clone(&tree));
                        }
                        session.inflight_root = None;
                        session.stats = Some(stats);
                        if is_session_root {
                            session.suggestions = Some(suggestions);
                            session.completed_at = Some(Instant::now());
                        }
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
                    if let Some(session) = sessions.lock().get_mut(&scan_id) {
                        session.inflight_root = None;
                        if is_session_root {
                            session.completed_at = Some(Instant::now());
                        }
                    }
                    let payload = json!({
                        "scan_id": scan_id,
                        "status": status,
                        "files_scanned": 0,
                        "bytes_scanned": 0,
                        "dirs_scanned": 0,
                        "error_count": if cancelled { 0 } else { 1 },
                        "current_path": Value::Null,
                        "percent": Value::Null,
                        "error": if cancelled { Value::Null } else { json!(e.to_string()) },
                        "level_path": level_key,
                    });
                    let _ = event_tx.send(DiskAnalyzerScanEvent {
                        owner_conn_id: owner,
                        payload,
                    });
                }
            }
        });
    }
}

pub(super) fn find_node<'a>(node: &'a DiskNode, path: &str) -> Option<&'a DiskNode> {
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

pub(super) fn merge_subtree(root: &mut DiskNode, patch: &DiskNode) -> bool {
    if root.path == patch.path {
        *root = patch.clone();
        return true;
    }
    for child in &mut root.children {
        if merge_subtree(child, patch) {
            if !root.children.is_empty() {
                let child_sum: u64 = root.children.iter().map(|c| c.size).sum();
                if child_sum > root.size {
                    root.size = child_sum;
                }
            }
            return true;
        }
    }
    false
}
