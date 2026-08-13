//! Disk Analyzer business service — scan sessions, ownership, project roots.
//!
//! Default scans cover Atmos-related paths (`~/.atmos`, imported projects,
//! Atmos.app) plus linked git worktrees and code-agent **session**
//! directories (not whole agent homes). The first overview paint is
//! Atmos + session dirs; leftover worktrees are grouped in a second wave.
//! Opt-in `scan_all` walks the user home (+ Applications) and still badges
//! those paths.

mod delete;
mod overview;
mod walk;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use core_engine::{
    finalize_tree, node_needs_wider_children, CleanupSuggestion, DiskAnalyzerEngine, DiskNode,
    DiskScanRoots, DiskVolumeInfo, FsEngine, GitEngine, ScanStats, DEFAULT_TREE_DEPTH,
};
use parking_lot::Mutex;
use serde::Serialize;
use serde_json::{json, Value};
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::service::{project::ProjectService, workspace::WorkspaceService};
use crate::{Result, ServiceError};

use overview::OverviewKind;
use walk::find_node;

const MAX_SESSIONS: usize = 8;
const SESSION_TTL: Duration = Duration::from_secs(30 * 60);
const EVENT_CHANNEL_CAPACITY: usize = 64;
const DEFAULT_MAX_CHILDREN: usize = 30;
/// Key used in the partial-entry map for the user home tree (scan-all mode).
const ENTRY_KEY_HOME: &str = "home";
/// Key used in the partial-entry map for `/Applications` (scan-all mode).
const ENTRY_KEY_APPLICATIONS: &str = "applications";
/// Synthetic overview root for Atmos-scoped multi-entry scans.
const ATMOS_OVERVIEW_PATH: &str = "atmos://disk-usage";
const ATMOS_OVERVIEW_NAME: &str = "Atmos";
const AGENT_GROUP_PATH: &str = "atmos://disk-usage/agent-data";
const AGENT_GROUP_NAME: &str = "Agent data";
const WORKTREE_GROUP_PATH: &str = "atmos://disk-usage/git-worktrees";
const WORKTREE_GROUP_NAME: &str = "Git worktrees";
/// Cap concurrent `du` during overview (each is I/O heavy; unlimited thrashing made
/// large roots like `~/.atmos` finish last and take minutes).
const OVERVIEW_DU_CONCURRENCY: usize = 3;
/// Keep overview → entry → entry-children so Mole-like artifacts
/// (`target`, `node_modules`, `.next`, `workspaces`, …) stay visible without
/// an extra drill before anything useful appears.
const OVERVIEW_TREE_DEPTH: usize = 3;

#[derive(Debug, Clone, Serialize)]
pub struct DiskAnalyzerScanEvent {
    pub owner_conn_id: String,
    pub payload: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
enum AtmosEntryKind {
    Project,
    Workspace,
    GitWorktree,
    AgentData,
}

#[derive(Clone)]
struct EntryRoot {
    /// Display label under the overview root (e.g. Home, Applications, project name).
    label: String,
    path: PathBuf,
    /// Set when this entry is an identified Atmos project or workspace root.
    kind: Option<AtmosEntryKind>,
}

struct DiskAnalyzerSession {
    owner_conn_id: String,
    cancel: Arc<AtomicBool>,
    tree: Option<Arc<DiskNode>>,
    inflight_root: Option<String>,
    stats: Option<ScanStats>,
    suggestions: Option<Vec<CleanupSuggestion>>,
    /// Session logical root (overview synthetic path, or a single real path).
    root_path: PathBuf,
    /// Real filesystem roots allowed for delete / get_tree (home, Applications, …).
    entry_roots: Vec<PathBuf>,
    max_children: usize,
    /// Identified Atmos project roots (main repo paths).
    project_roots: Vec<PathBuf>,
    /// Identified Atmos workspace worktree paths.
    workspace_roots: Vec<PathBuf>,
    /// Linked git worktrees discovered on this machine (not Atmos workspaces).
    git_worktree_roots: Vec<PathBuf>,
    /// Code-agent session / transcript directories.
    agent_data_roots: Vec<PathBuf>,
    /// True after home discovery has populated worktree / agent roots (may be empty).
    marks_ready: bool,
    started_at: Instant,
    completed_at: Option<Instant>,
    #[allow(dead_code)]
    is_overview: bool,
}

pub struct DiskAnalyzerService {
    engine: DiskAnalyzerEngine,
    fs_engine: FsEngine,
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
        scan_all: bool,
    ) -> Result<Value> {
        let max_children = max_children.unwrap_or(DEFAULT_MAX_CHILDREN).max(1);
        let scan_id = Uuid::new_v4().to_string();
        let cancel = Arc::new(AtomicBool::new(false));

        // Collect identified Atmos projects + workspaces for tagging / overview entries.
        let (project_roots, workspace_roots, project_labels) =
            Self::collect_atmos_locations_static(
                Arc::clone(&self.project_service),
                Arc::clone(&self.workspace_service),
                GitEngine::new(),
            )
            .await;

        let (is_overview, overview_kind, root_path, entry_specs) = match path {
            Some(p) if !p.is_empty() => {
                let mut root = self.fs_engine.expand_path(p)?;
                if root.parent().is_none() {
                    let home = self.user_home()?;
                    tracing::warn!(
                        "disk analyzer refused filesystem root; using home {}",
                        home.display()
                    );
                    root = home;
                }
                let label = root
                    .file_name()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| root.to_string_lossy().to_string());
                (
                    false,
                    OverviewKind::HomeWithApps,
                    root.clone(),
                    vec![EntryRoot {
                        label,
                        path: root,
                        kind: None,
                    }],
                )
            }
            _ if scan_all => {
                let entries = self.home_entry_roots()?;
                if entries.is_empty() {
                    return Err(ServiceError::Validation(
                        "No scannable entry paths found".into(),
                    ));
                }
                let home = entries
                    .iter()
                    .find(|e| e.label == ENTRY_KEY_HOME)
                    .map(|e| e.path.clone())
                    .ok_or_else(|| ServiceError::Validation("Home path missing".into()))?;
                (true, OverviewKind::HomeWithApps, home, entries)
            }
            _ => {
                let mut entries = self.atmos_static_entry_roots()?;
                Self::push_identified_project_entries(&mut entries, &project_labels);
                if entries.is_empty() {
                    return Err(ServiceError::Validation(
                        "No Atmos paths found to scan (expected ~/.atmos or imported projects)"
                            .into(),
                    ));
                }
                tracing::info!(
                    entries = entries.len(),
                    projects = project_roots.len(),
                    workspaces = workspace_roots.len(),
                    "disk analyzer default scan is Atmos-scoped"
                );
                (
                    true,
                    OverviewKind::AtmosSynthetic,
                    PathBuf::from(ATMOS_OVERVIEW_PATH),
                    entries,
                )
            }
        };

        let entry_roots: Vec<PathBuf> = entry_specs.iter().map(|e| e.path.clone()).collect();

        // Keep the 3-day path cache across scans. Entries revalidate via directory
        // mtime (any change → miss). Clearing here made every Rescan/auto-start cold
        // and re-ran multi-minute `du` on ~/.atmos every time.
        // Cache is still cleared after delete (see delete_path).

        {
            let mut sessions = self.sessions.lock();
            // Rescan / scope switch: drop this connection's previous sessions so the
            // MAX_SESSIONS cap cannot trap the user after Cancel/Rescan loops.
            Self::cancel_and_purge_owner(&mut sessions, owner_conn_id);
            Self::evict_expired(&mut sessions);
            if sessions.len() >= MAX_SESSIONS {
                Self::evict_oldest_completed(&mut sessions);
            }
            // Last resort: drop oldest in-flight sessions (already cancelled above for this owner).
            while sessions.len() >= MAX_SESSIONS {
                if !Self::evict_oldest_any(&mut sessions) {
                    break;
                }
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
                    inflight_root: Some(path_key(&root_path)),
                    stats: None,
                    suggestions: None,
                    root_path: root_path.clone(),
                    entry_roots: entry_roots.clone(),
                    max_children,
                    project_roots: project_roots.clone(),
                    workspace_roots: workspace_roots.clone(),
                    git_worktree_roots: vec![],
                    agent_data_roots: vec![],
                    marks_ready: false,
                    started_at: Instant::now(),
                    completed_at: None,
                    is_overview,
                },
            );
        }

        let owner = owner_conn_id.to_string();
        let scan_id_task = scan_id.clone();
        let root_path_for_task = root_path.clone();
        let sessions = Arc::clone(&self.sessions);
        let event_tx = self.event_tx.clone();

        tokio::spawn(async move {
            let root_path = root_path_for_task;
            tokio::task::yield_now().await;

            if is_overview {
                Self::spawn_overview_walk(
                    sessions,
                    event_tx,
                    scan_id_task,
                    owner,
                    entry_specs,
                    project_roots,
                    workspace_roots,
                    max_children,
                    cancel,
                    overview_kind,
                );
            } else {
                let single = entry_specs
                    .into_iter()
                    .next()
                    .map(|e| e.path)
                    .unwrap_or_else(|| root_path.clone());
                Self::spawn_walk(
                    sessions,
                    event_tx,
                    scan_id_task,
                    owner,
                    single,
                    DiskScanRoots {
                        project_roots,
                        workspace_roots,
                        git_worktree_roots: vec![],
                        agent_data_roots: vec![],
                    },
                    max_children,
                    cancel,
                    true,
                );
            }
        });

        Ok(json!({
            "scan_id": scan_id,
            "root_path": root_path.to_string_lossy(),
            "status": "started",
            "overview": is_overview,
            "scan_all": scan_all,
        }))
    }

    pub fn cancel_scan(&self, owner_conn_id: &str, scan_id: &str) -> Result<Value> {
        let mut sessions = self.sessions.lock();
        let session = sessions
            .get(scan_id)
            .ok_or_else(|| ServiceError::NotFound(format!("scan {scan_id}")))?;
        Self::ensure_owner(session, owner_conn_id)?;
        // Signal the walk to stop, then free the session slot immediately.
        session.cancel.store(true, Ordering::Relaxed);
        sessions.remove(scan_id);
        Ok(json!({ "ok": true, "scan_id": scan_id }))
    }

    pub fn get_tree(
        &self,
        owner_conn_id: &str,
        scan_id: &str,
        path: Option<&str>,
        max_children: Option<usize>,
    ) -> Result<Value> {
        let (target_key, scan_roots, session_max, cancel, entry_roots, inflight) = {
            let sessions = self.sessions.lock();
            let session = sessions
                .get(scan_id)
                .ok_or_else(|| ServiceError::NotFound(format!("scan {scan_id}")))?;
            Self::ensure_owner(session, owner_conn_id)?;

            let target_key = match path {
                Some(p)
                    if !p.is_empty() && (p == ATMOS_OVERVIEW_PATH || p.starts_with("atmos://")) =>
                {
                    // Synthetic Atmos overview root — not a real filesystem path.
                    p.to_string()
                }
                Some(p) if !p.is_empty() => {
                    let expanded = self.fs_engine.expand_path(p)?;
                    Self::ensure_under_any(&expanded, &session.entry_roots)?;
                    path_key(&expanded)
                }
                _ => path_key(&session.root_path),
            };

            if let Some(tree) = session.tree.as_ref() {
                if let Some(node) = find_node(tree.as_ref(), &target_key) {
                    // Truncated leaves need a fresh walk; only return cache when expanded.
                    if !node.is_dir || node.children_loaded {
                        let max = max_children.unwrap_or(session.max_children).max(1);
                        let synthetic =
                            target_key == ATMOS_OVERVIEW_PATH || target_key.starts_with("atmos://");
                        // Pruned snapshots cannot grow past the original cap. Re-walk
                        // when the UI asks for more than the cached real children.
                        let serve_cache =
                            !node.is_dir || synthetic || !node_needs_wider_children(node, max);
                        if serve_cache {
                            let mut cloned = node.clone();
                            finalize_tree(&mut cloned, max, DEFAULT_TREE_DEPTH, true);
                            return Ok(json!({
                                "status": "ready",
                                "tree": cloned,
                                "stats": session.stats.clone(),
                            }));
                        }
                    }
                }
            }

            // Only skip spawn when this exact path is already being scanned.
            // Having session.tree (overview cache) must NOT block drill-in expansion —
            // overview entries are often measure-only shells with children_loaded=false.
            let inflight = session
                .inflight_root
                .as_ref()
                .map(|p| p == &target_key)
                .unwrap_or(false);
            (
                target_key,
                DiskScanRoots {
                    project_roots: session.project_roots.clone(),
                    workspace_roots: session.workspace_roots.clone(),
                    git_worktree_roots: session.git_worktree_roots.clone(),
                    agent_data_roots: session.agent_data_roots.clone(),
                },
                session.max_children,
                Arc::clone(&session.cancel),
                session.entry_roots.clone(),
                inflight,
            )
        };

        if inflight {
            return Ok(json!({
                "status": "loading",
                "path": target_key,
                "stats": Value::Null,
            }));
        }

        // Synthetic overview roots cannot be walk()'d on disk.
        if target_key == ATMOS_OVERVIEW_PATH || target_key.starts_with("atmos://") {
            return Ok(json!({
                "status": "loading",
                "path": target_key,
                "stats": Value::Null,
            }));
        }

        let target_path = PathBuf::from(&target_key);
        Self::ensure_under_any(&target_path, &entry_roots)?;
        let max = max_children.unwrap_or(session_max).max(1);
        {
            let mut sessions = self.sessions.lock();
            if let Some(session) = sessions.get_mut(scan_id) {
                session.inflight_root = Some(target_key.clone());
                if max > session.max_children {
                    session.max_children = max;
                }
            }
        }

        Self::spawn_walk(
            Arc::clone(&self.sessions),
            self.event_tx.clone(),
            scan_id.to_string(),
            owner_conn_id.to_string(),
            target_path,
            scan_roots,
            max,
            cancel,
            false,
        );

        Ok(json!({
            "status": "loading",
            "path": target_key,
            "stats": Value::Null,
        }))
    }

    pub fn disk_info(&self, path: Option<&str>) -> Result<DiskVolumeInfo> {
        let path = match path {
            Some(p) if !p.is_empty() => self.fs_engine.expand_path(p)?,
            _ => self.user_home()?,
        };
        Ok(self.engine.disk_info(&path)?)
    }

    pub fn remove_connection_sessions(&self, owner_conn_id: &str) {
        let mut sessions = self.sessions.lock();
        Self::cancel_and_purge_owner(&mut sessions, owner_conn_id);
    }

    fn ensure_owner(session: &DiskAnalyzerSession, owner_conn_id: &str) -> Result<()> {
        if session.owner_conn_id != owner_conn_id {
            return Err(ServiceError::Validation(
                "scan session belongs to another connection".into(),
            ));
        }
        Ok(())
    }

    fn ensure_under_any(path: &Path, roots: &[PathBuf]) -> Result<()> {
        let path = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        for root in roots {
            let root = std::fs::canonicalize(root).unwrap_or_else(|_| root.clone());
            if path == root || path.starts_with(&root) {
                return Ok(());
            }
        }
        Err(ServiceError::Validation(format!(
            "path {} is outside scan entry roots",
            path.display()
        )))
    }

    /// Cancel in-flight walks and remove every session owned by `owner_conn_id`.
    fn cancel_and_purge_owner(
        sessions: &mut HashMap<String, DiskAnalyzerSession>,
        owner_conn_id: &str,
    ) {
        sessions.retain(|_, session| {
            if session.owner_conn_id == owner_conn_id {
                session.cancel.store(true, Ordering::Relaxed);
                false
            } else {
                true
            }
        });
    }

    fn evict_expired(sessions: &mut HashMap<String, DiskAnalyzerSession>) {
        let now = Instant::now();
        sessions.retain(|_, session| match session.completed_at {
            Some(completed) => now.duration_since(completed) < SESSION_TTL,
            None => {
                if now.duration_since(session.started_at) >= SESSION_TTL * 2 {
                    session.cancel.store(true, Ordering::Relaxed);
                    false
                } else {
                    true
                }
            }
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

    /// Evict the oldest session of any kind (completed preferred, else oldest start).
    /// Returns false when the map is empty.
    fn evict_oldest_any(sessions: &mut HashMap<String, DiskAnalyzerSession>) -> bool {
        if sessions.is_empty() {
            return false;
        }
        // Prefer completed sessions first.
        if sessions.values().any(|s| s.completed_at.is_some()) {
            Self::evict_oldest_completed(sessions);
            return true;
        }
        let oldest = sessions
            .iter()
            .min_by_key(|(_, s)| s.started_at)
            .map(|(id, _)| id.clone());
        if let Some(id) = oldest {
            if let Some(session) = sessions.remove(&id) {
                session.cancel.store(true, Ordering::Relaxed);
            }
            true
        } else {
            false
        }
    }
}

pub(super) fn path_key(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::delete::{delete_non_workspace_path, same_existing_path};
    use super::overview::assemble_overview;
    use super::*;

    #[test]
    fn remove_connection_sessions_cancels_and_purges() {
        let cancel = Arc::new(AtomicBool::new(false));
        let mut sessions = HashMap::new();
        sessions.insert(
            "s1".to_string(),
            DiskAnalyzerSession {
                owner_conn_id: "conn-123".to_string(),
                cancel: Arc::clone(&cancel),
                tree: None,
                inflight_root: None,
                stats: None,
                suggestions: None,
                root_path: PathBuf::from("/tmp/home"),
                entry_roots: vec![PathBuf::from("/tmp/home"), PathBuf::from("/Applications")],
                max_children: 30,
                project_roots: vec![],
                workspace_roots: vec![],
                git_worktree_roots: vec![],
                agent_data_roots: vec![],
                marks_ready: false,
                started_at: Instant::now(),
                completed_at: None,
                is_overview: true,
            },
        );

        let db = Arc::new(sea_orm::DatabaseConnection::default());
        let service = DiskAnalyzerService {
            engine: DiskAnalyzerEngine::new(),
            fs_engine: FsEngine::new(),
            project_service: Arc::new(ProjectService::new(Arc::clone(&db))),
            workspace_service: Arc::new(WorkspaceService::new(Arc::clone(&db))),
            sessions: Arc::new(Mutex::new(sessions)),
            event_tx: broadcast::channel(16).0,
        };

        service.remove_connection_sessions("conn-123");
        assert!(cancel.load(Ordering::Relaxed));
        assert!(service.sessions.lock().is_empty());
    }

    #[test]
    fn evict_expired_removes_old_in_flight_sessions() {
        let mut sessions = HashMap::new();
        let cancel = Arc::new(AtomicBool::new(false));
        sessions.insert(
            "s1".to_string(),
            DiskAnalyzerSession {
                owner_conn_id: "conn-1".to_string(),
                cancel: Arc::clone(&cancel),
                tree: None,
                inflight_root: None,
                stats: None,
                suggestions: None,
                root_path: PathBuf::from("/tmp"),
                entry_roots: vec![PathBuf::from("/tmp")],
                max_children: 30,
                project_roots: vec![],
                workspace_roots: vec![],
                git_worktree_roots: vec![],
                agent_data_roots: vec![],
                marks_ready: false,
                started_at: Instant::now() - (SESSION_TTL * 2 + Duration::from_secs(1)),
                completed_at: None,
                is_overview: false,
            },
        );

        DiskAnalyzerService::evict_expired(&mut sessions);
        assert!(cancel.load(Ordering::Relaxed));
        assert!(sessions.is_empty());
    }

    #[test]
    fn ensure_under_any_accepts_child() {
        let tmp = std::env::temp_dir();
        let nested = tmp.join("disk-analyzer-root-check");
        let _ = std::fs::create_dir_all(&nested);
        assert!(DiskAnalyzerService::ensure_under_any(&nested, &[tmp]).is_ok());
    }

    /// Drill-in must spawn a level walk even when session.tree already exists
    /// (overview shells use children_loaded=false). Regression for the
    /// `if inflight || cached { return loading }` short-circuit bug.
    #[tokio::test]
    async fn get_tree_spawns_walk_for_unloaded_directory() {
        let base =
            std::env::temp_dir().join(format!("disk-analyzer-get-tree-{}", std::process::id()));
        let entry = base.join(".atmos");
        let nested = entry.join("cache");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&nested).expect("mkdir");
        std::fs::write(nested.join("blob.bin"), vec![0u8; 4096]).expect("write");

        let entry_key = path_key(&entry);
        let overview = DiskNode {
            name: "Atmos".into(),
            path: ATMOS_OVERVIEW_PATH.into(),
            size: 4096,
            is_dir: true,
            is_project: false,
            is_workspace: false,
            is_git_worktree: false,
            is_agent_data: false,
            file_count: 1,
            dir_count: 1,
            children_loaded: true,
            children: vec![DiskNode {
                name: ".atmos".into(),
                path: entry_key.clone(),
                size: 4096,
                is_dir: true,
                is_project: false,
                is_workspace: false,
                is_git_worktree: false,
                is_agent_data: false,
                file_count: 1,
                dir_count: 1,
                children_loaded: false,
                children: vec![],
            }],
        };

        let mut sessions = HashMap::new();
        sessions.insert(
            "scan-1".to_string(),
            DiskAnalyzerSession {
                owner_conn_id: "conn-1".to_string(),
                cancel: Arc::new(AtomicBool::new(false)),
                tree: Some(Arc::new(overview)),
                inflight_root: None,
                stats: None,
                suggestions: None,
                root_path: PathBuf::from(ATMOS_OVERVIEW_PATH),
                entry_roots: vec![entry.clone()],
                max_children: 30,
                project_roots: vec![],
                workspace_roots: vec![],
                git_worktree_roots: vec![],
                agent_data_roots: vec![],
                marks_ready: false,
                started_at: Instant::now(),
                completed_at: Some(Instant::now()),
                is_overview: true,
            },
        );

        let db = Arc::new(sea_orm::DatabaseConnection::default());
        let service = DiskAnalyzerService {
            engine: DiskAnalyzerEngine::new(),
            fs_engine: FsEngine::new(),
            project_service: Arc::new(ProjectService::new(Arc::clone(&db))),
            workspace_service: Arc::new(WorkspaceService::new(Arc::clone(&db))),
            sessions: Arc::new(Mutex::new(sessions)),
            event_tx: broadcast::channel(16).0,
        };

        let resp = service
            .get_tree("conn-1", "scan-1", Some(&entry_key), Some(30))
            .expect("get_tree");
        assert_eq!(resp["status"], "loading");
        assert_eq!(
            service
                .sessions
                .lock()
                .get("scan-1")
                .unwrap()
                .inflight_root
                .as_deref(),
            Some(entry_key.as_str()),
            "unloaded dir must mark inflight so a walk is spawned"
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn get_tree_returns_ready_for_loaded_directory() {
        let base = std::env::temp_dir().join(format!(
            "disk-analyzer-get-tree-ready-{}",
            std::process::id()
        ));
        let entry = base.join(".atmos");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&entry).expect("mkdir");

        let entry_key = path_key(&entry);
        let overview = DiskNode {
            name: "Atmos".into(),
            path: ATMOS_OVERVIEW_PATH.into(),
            size: 100,
            is_dir: true,
            is_project: false,
            is_workspace: false,
            is_git_worktree: false,
            is_agent_data: false,
            file_count: 1,
            dir_count: 1,
            children_loaded: true,
            children: vec![DiskNode {
                name: ".atmos".into(),
                path: entry_key.clone(),
                size: 100,
                is_dir: true,
                is_project: false,
                is_workspace: false,
                is_git_worktree: false,
                is_agent_data: false,
                file_count: 1,
                dir_count: 0,
                children_loaded: true,
                children: vec![DiskNode {
                    name: "blob.bin".into(),
                    path: format!("{entry_key}/blob.bin"),
                    size: 100,
                    is_dir: false,
                    is_project: false,
                    is_workspace: false,
                    is_git_worktree: false,
                    is_agent_data: false,
                    file_count: 1,
                    dir_count: 0,
                    children_loaded: true,
                    children: vec![],
                }],
            }],
        };

        let mut sessions = HashMap::new();
        sessions.insert(
            "scan-1".to_string(),
            DiskAnalyzerSession {
                owner_conn_id: "conn-1".to_string(),
                cancel: Arc::new(AtomicBool::new(false)),
                tree: Some(Arc::new(overview)),
                inflight_root: None,
                stats: None,
                suggestions: None,
                root_path: PathBuf::from(ATMOS_OVERVIEW_PATH),
                entry_roots: vec![entry.clone()],
                max_children: 30,
                project_roots: vec![],
                workspace_roots: vec![],
                git_worktree_roots: vec![],
                agent_data_roots: vec![],
                marks_ready: false,
                started_at: Instant::now(),
                completed_at: Some(Instant::now()),
                is_overview: true,
            },
        );

        let db = Arc::new(sea_orm::DatabaseConnection::default());
        let service = DiskAnalyzerService {
            engine: DiskAnalyzerEngine::new(),
            fs_engine: FsEngine::new(),
            project_service: Arc::new(ProjectService::new(Arc::clone(&db))),
            workspace_service: Arc::new(WorkspaceService::new(Arc::clone(&db))),
            sessions: Arc::new(Mutex::new(sessions)),
            event_tx: broadcast::channel(16).0,
        };

        let resp = service
            .get_tree("conn-1", "scan-1", Some(&entry_key), Some(30))
            .expect("get_tree");
        assert_eq!(resp["status"], "ready");
        assert_eq!(resp["tree"]["name"], ".atmos");
        assert!(
            resp["tree"]["children"]
                .as_array()
                .map(|a| !a.is_empty())
                .unwrap_or(false),
            "loaded dir should include children"
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    fn test_leaf(name: &str, path: &str, size: u64) -> DiskNode {
        DiskNode {
            name: name.into(),
            path: path.into(),
            size,
            is_dir: false,
            is_project: false,
            is_workspace: false,
            is_git_worktree: false,
            is_agent_data: false,
            file_count: 1,
            dir_count: 0,
            children_loaded: true,
            children: vec![],
        }
    }

    #[tokio::test]
    async fn get_tree_rewalks_when_requested_max_exceeds_pruned_cache() {
        let base = std::env::temp_dir().join(format!(
            "disk-analyzer-get-tree-wider-{}",
            std::process::id()
        ));
        let entry = base.join(".atmos");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&entry).expect("mkdir");
        for i in 0..5 {
            std::fs::write(entry.join(format!("f{i}.bin")), vec![0u8; 64]).expect("write");
        }

        let entry_key = path_key(&entry);
        let pruned = DiskNode {
            name: ".atmos".into(),
            path: entry_key.clone(),
            size: 320,
            is_dir: true,
            is_project: false,
            is_workspace: false,
            is_git_worktree: false,
            is_agent_data: false,
            file_count: 5,
            dir_count: 0,
            children_loaded: true,
            children: vec![
                test_leaf("f0.bin", &format!("{entry_key}/f0.bin"), 64),
                test_leaf("f1.bin", &format!("{entry_key}/f1.bin"), 64),
                DiskNode {
                    name: "__other__".into(),
                    path: format!("{entry_key}/__other__"),
                    size: 192,
                    is_dir: true,
                    is_project: false,
                    is_workspace: false,
                    is_git_worktree: false,
                    is_agent_data: false,
                    file_count: 3,
                    dir_count: 0,
                    children_loaded: true,
                    children: vec![],
                },
            ],
        };

        let mut sessions = HashMap::new();
        sessions.insert(
            "scan-1".to_string(),
            DiskAnalyzerSession {
                owner_conn_id: "conn-1".to_string(),
                cancel: Arc::new(AtomicBool::new(false)),
                tree: Some(Arc::new(pruned)),
                inflight_root: None,
                stats: None,
                suggestions: None,
                root_path: PathBuf::from(ATMOS_OVERVIEW_PATH),
                entry_roots: vec![entry.clone()],
                max_children: 2,
                project_roots: vec![],
                workspace_roots: vec![],
                git_worktree_roots: vec![],
                agent_data_roots: vec![],
                marks_ready: false,
                started_at: Instant::now(),
                completed_at: Some(Instant::now()),
                is_overview: true,
            },
        );

        let db = Arc::new(sea_orm::DatabaseConnection::default());
        let service = DiskAnalyzerService {
            engine: DiskAnalyzerEngine::new(),
            fs_engine: FsEngine::new(),
            project_service: Arc::new(ProjectService::new(Arc::clone(&db))),
            workspace_service: Arc::new(WorkspaceService::new(Arc::clone(&db))),
            sessions: Arc::new(Mutex::new(sessions)),
            event_tx: broadcast::channel(16).0,
        };

        let same_cap = service
            .get_tree("conn-1", "scan-1", Some(&entry_key), Some(2))
            .expect("get_tree same cap");
        assert_eq!(same_cap["status"], "ready");
        assert_eq!(
            service
                .sessions
                .lock()
                .get("scan-1")
                .unwrap()
                .inflight_root
                .as_deref(),
            None,
            "same cap should serve the pruned snapshot"
        );

        let wider = service
            .get_tree("conn-1", "scan-1", Some(&entry_key), Some(5))
            .expect("get_tree wider");
        assert_eq!(wider["status"], "loading");
        assert_eq!(
            service
                .sessions
                .lock()
                .get("scan-1")
                .unwrap()
                .inflight_root
                .as_deref(),
            Some(entry_key.as_str()),
            "wider cap must re-walk instead of returning the pruned snapshot"
        );
        assert_eq!(
            service.sessions.lock().get("scan-1").unwrap().max_children,
            5
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn append_discovered_skips_covered_paths_and_labels_worktrees() {
        let tmp = std::env::temp_dir().join(format!(
            "disk-analyzer-discover-entries-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&tmp);
        let atmos = tmp.join(".atmos");
        let cursor_sessions = tmp.join(".cursor").join("projects");
        let nested_wt = tmp.join(".cursor").join("worktrees").join("feat");
        let extra_wt = tmp.join("extra-wt");
        std::fs::create_dir_all(&atmos).expect("atmos");
        std::fs::create_dir_all(&cursor_sessions).expect("cursor sessions");
        std::fs::create_dir_all(&nested_wt).expect("nested wt");
        std::fs::create_dir_all(&extra_wt).expect("extra wt");

        let mut entries = vec![EntryRoot {
            label: ".atmos".into(),
            path: atmos,
            kind: None,
        }];
        DiskAnalyzerService::append_discovered_overview_entries(
            &mut entries,
            &[nested_wt.clone(), extra_wt.clone()],
            &[("cursor".into(), cursor_sessions)],
        );

        let labels: Vec<_> = entries.iter().map(|e| e.label.as_str()).collect();
        assert!(labels.contains(&".atmos"));
        assert!(labels.contains(&"cursor"));
        assert!(
            entries
                .iter()
                .any(|e| e.path == extra_wt && e.kind == Some(AtmosEntryKind::GitWorktree)),
            "uncovered worktree should become an overview tile: {labels:?}"
        );
        assert!(
            entries
                .iter()
                .any(|e| e.path == nested_wt && e.kind == Some(AtmosEntryKind::GitWorktree)),
            "worktree under .cursor/worktrees is not covered by session dir: {labels:?}"
        );
        assert!(
            DiskAnalyzerService::worktree_overview_label(&extra_wt).starts_with("extra-wt"),
            "worktree label should start with the directory name"
        );

        let _ = std::fs::remove_dir_all(&tmp);
    }

    fn overview_part(
        name: &str,
        path: &str,
        size: u64,
        is_git_worktree: bool,
        is_agent_data: bool,
    ) -> DiskNode {
        DiskNode {
            name: name.into(),
            path: path.into(),
            size,
            is_dir: true,
            is_project: false,
            is_workspace: false,
            is_git_worktree,
            is_agent_data,
            file_count: 1,
            dir_count: 1,
            children_loaded: false,
            children: vec![],
        }
    }

    #[test]
    fn assemble_overview_groups_agent_and_worktree_entries() {
        let mut parts = HashMap::new();
        parts.insert(
            ".atmos".into(),
            overview_part(".atmos", "/home/u/.atmos", 100, false, false),
        );
        parts.insert(
            "cursor".into(),
            overview_part("cursor", "/home/u/.cursor/projects", 50, false, true),
        );
        parts.insert(
            "feat".into(),
            overview_part("feat", "/tmp/feat", 80, true, false),
        );

        let tree = assemble_overview(
            OverviewKind::AtmosSynthetic,
            &parts,
            ATMOS_OVERVIEW_PATH,
            ATMOS_OVERVIEW_NAME,
            &HashMap::new(),
        )
        .expect("overview");

        let names: Vec<_> = tree.children.iter().map(|c| c.name.as_str()).collect();
        assert!(
            names.contains(&".atmos"),
            "Atmos runtime stays at root: {names:?}"
        );
        assert!(
            !names.contains(&"cursor") && !names.contains(&"feat"),
            "agent/worktree tiles must nest under groups: {names:?}"
        );

        let agent = tree
            .children
            .iter()
            .find(|c| c.path == AGENT_GROUP_PATH)
            .expect("agent group");
        assert!(agent.is_agent_data);
        assert!(agent.children_loaded);
        assert!(agent.children.iter().any(|c| c.name == "cursor"));

        let worktrees = tree
            .children
            .iter()
            .find(|c| c.path == WORKTREE_GROUP_PATH)
            .expect("worktree group");
        assert!(worktrees.is_git_worktree);
        assert!(worktrees.children_loaded);
        assert!(worktrees.children.iter().any(|c| c.name == "feat"));
        assert_eq!(tree.size, 230);
    }

    #[test]
    fn same_existing_path_matches_canonical_forms() {
        let dir =
            std::env::temp_dir().join(format!("disk-analyzer-same-path-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("mkdir");
        assert!(same_existing_path(&dir, &dir));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_non_workspace_path_removes_linked_worktree() {
        use std::process::Command;

        let root =
            std::env::temp_dir().join(format!("disk-analyzer-wt-del-{}", uuid::Uuid::new_v4()));
        let repo = root.join("repo");
        let linked = root.join("linked-wt");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&repo).expect("mkdir");

        let git = |args: &[&str]| {
            let output = Command::new("git")
                .current_dir(&repo)
                .args(args)
                .output()
                .expect("git");
            assert!(
                output.status.success(),
                "git {args:?} failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        };
        git(&["init"]);
        git(&["config", "user.email", "test@example.com"]);
        git(&["config", "user.name", "Test"]);
        std::fs::write(repo.join("README.md"), "hi").unwrap();
        git(&["add", "README.md"]);
        git(&["commit", "-m", "init"]);
        git(&[
            "worktree",
            "add",
            "-b",
            "feature",
            linked.to_str().expect("utf8"),
        ]);

        let freed = delete_non_workspace_path(&linked, false, &root).expect("remove worktree");
        assert!(freed > 0);
        assert!(!linked.exists());

        let list = GitEngine::new().list_worktrees(&repo).expect("list");
        let _ = std::fs::remove_dir_all(&root);
        assert!(
            list.iter().all(|info| info.path != linked),
            "git still lists removed worktree: {list:?}"
        );
    }
}
