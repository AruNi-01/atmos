//! Disk Analyzer business service — scan sessions, ownership, project roots.
//!
//! Default scans cover Atmos-related paths (`~/.atmos`, imported projects,
//! Atmos.app) plus linked git worktrees and code-agent **session**
//! directories (not whole agent homes). The first overview paint is
//! Atmos + session dirs; leftover worktrees are grouped in a second wave.
//! Opt-in `scan_all` walks the user home (+ Applications) and still badges
//! those paths.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use core_engine::{
    agent_data_roots, clear_path_cache, finalize_tree, invalidate_path_cache, CleanupSuggestion,
    DiskAnalyzerEngine, DiskNode, DiskPathKind, DiskScanRoots, DiskVolumeInfo, FsEngine, GitEngine,
    ProgressCallback, ScanProgress, ScanStats, ScanStatus, DEFAULT_TREE_DEPTH,
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

    fn user_home(&self) -> Result<PathBuf> {
        let home = self.fs_engine.get_home_dir()?;
        let home = std::fs::canonicalize(&home).unwrap_or(home);
        // Must be a real user home like /Users/<name> or /home/<name> — never `/`.
        if home.parent().is_none() {
            return Err(ServiceError::Validation(
                "Home directory resolves to filesystem root; set HOME to a user directory".into(),
            ));
        }
        let parts: Vec<_> = home
            .components()
            .filter_map(|c| match c {
                std::path::Component::Normal(s) => s.to_str(),
                _ => None,
            })
            .collect();
        // Prefer classic user home layouts so overview never becomes whole-disk.
        let looks_like_user_home = matches!(
            parts.as_slice(),
            ["Users", _] | ["home", _] | ["export", "home", _]
        );
        if !looks_like_user_home {
            tracing::warn!(
                home = %home.display(),
                "disk analyzer home is not under /Users or /home; still using it as scan root"
            );
        }
        Ok(home)
    }

    /// Full-home scan: home is the display root; Applications is grafted under it.
    fn home_entry_roots(&self) -> Result<Vec<EntryRoot>> {
        let mut entries = Vec::new();
        let home = self.user_home()?;
        tracing::info!(home = %home.display(), "disk analyzer scan-all root is user home");
        entries.push(EntryRoot {
            label: ENTRY_KEY_HOME.into(),
            path: home,
            kind: None,
        });

        let applications = PathBuf::from("/Applications");
        if applications.is_dir() {
            entries.push(EntryRoot {
                label: ENTRY_KEY_APPLICATIONS.into(),
                path: applications,
                kind: None,
            });
        }

        Ok(entries)
    }

    /// Atmos-scoped roots: `~/.atmos`, app bundle, app support, plus imported projects.
    fn atmos_static_entry_roots(&self) -> Result<Vec<EntryRoot>> {
        let home = self.user_home()?;
        let mut entries = Vec::new();
        let mut push_unique = |label: String, path: PathBuf| {
            if !path.exists() {
                return;
            }
            let canon = std::fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
            if entries.iter().any(|e: &EntryRoot| {
                std::fs::canonicalize(&e.path).unwrap_or_else(|_| e.path.clone()) == canon
            }) {
                return;
            }
            entries.push(EntryRoot {
                label,
                path,
                kind: None,
            });
        };

        push_unique(".atmos".into(), home.join(".atmos"));

        if let Ok(data_dir) = std::env::var("ATMOS_DATA_DIR") {
            let p = PathBuf::from(data_dir.trim());
            if !p.as_os_str().is_empty() {
                push_unique("Atmos data".into(), p);
            }
        }

        for candidate in [
            PathBuf::from("/Applications/Atmos.app"),
            home.join("Applications/Atmos.app"),
        ] {
            if candidate.exists() {
                push_unique("Atmos.app".into(), candidate);
                break;
            }
        }

        let app_support = home.join("Library/Application Support");
        for name in ["com.atmos.desktop", "com.atmos.desktop.dev"] {
            push_unique(name.into(), app_support.join(name));
        }

        // Caches / logs that Atmos may write outside ~/.atmos on some platforms.
        let caches = home.join("Library/Caches");
        for name in ["com.atmos.desktop", "com.atmos.desktop.dev"] {
            push_unique(format!("Caches/{name}"), caches.join(name));
        }

        Ok(entries)
    }

    /// Add identified project roots that are **not** already under a static Atmos entry
    /// (e.g. not under `~/.atmos`). Workspaces live under `~/.atmos/workspaces` and are
    /// tagged on drill-in instead of listed twice.
    fn push_identified_project_entries(
        entries: &mut Vec<EntryRoot>,
        projects: &[(String, PathBuf)],
    ) {
        for (i, (name, path)) in projects.iter().enumerate() {
            if !path.exists() {
                continue;
            }
            let canon = std::fs::canonicalize(path).unwrap_or_else(|_| path.clone());
            // Skip if already covered by a broader Atmos root (e.g. under ~/.atmos).
            if entries.iter().any(|e| {
                let er = std::fs::canonicalize(&e.path).unwrap_or_else(|_| e.path.clone());
                canon == er || canon.starts_with(&er)
            }) {
                continue;
            }
            let mut label = name.trim().to_string();
            if label.is_empty() {
                label = path
                    .file_name()
                    .map(|s| s.to_string_lossy().to_string())
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| format!("project-{i}"));
            }
            // Disambiguate duplicate display names.
            if entries.iter().any(|e| e.label == label) {
                label = format!("{label} ({i})");
            }
            entries.push(EntryRoot {
                label,
                path: path.clone(),
                kind: Some(AtmosEntryKind::Project),
            });
        }
    }

    #[allow(dead_code)]
    fn scan_roots(
        project_roots: &[PathBuf],
        workspace_roots: &[PathBuf],
        git_worktree_roots: &[PathBuf],
        agent_data_roots: &[PathBuf],
    ) -> DiskScanRoots {
        DiskScanRoots {
            project_roots: project_roots.to_vec(),
            workspace_roots: workspace_roots.to_vec(),
            git_worktree_roots: git_worktree_roots.to_vec(),
            agent_data_roots: agent_data_roots.to_vec(),
        }
    }

    fn kind_for_entry(
        kind: Option<AtmosEntryKind>,
        path: &str,
        roots: &DiskScanRoots,
    ) -> DiskPathKind {
        match kind {
            Some(AtmosEntryKind::Project) => DiskPathKind {
                is_project: true,
                ..DiskPathKind::default()
            },
            Some(AtmosEntryKind::Workspace) => DiskPathKind {
                is_workspace: true,
                ..DiskPathKind::default()
            },
            Some(AtmosEntryKind::GitWorktree) => DiskPathKind {
                is_git_worktree: true,
                ..DiskPathKind::default()
            },
            Some(AtmosEntryKind::AgentData) => DiskPathKind {
                is_agent_data: true,
                ..DiskPathKind::default()
            },
            None => DiskPathKind::classify(Path::new(path), roots),
        }
    }

    fn apply_kind(node: &mut DiskNode, kind: DiskPathKind) {
        node.is_project = kind.is_project;
        node.is_workspace = kind.is_workspace;
        node.is_git_worktree = kind.is_git_worktree;
        node.is_agent_data = kind.is_agent_data;
    }

    fn dir_shell(name: String, path: String, kind: DiskPathKind) -> DiskNode {
        DiskNode {
            name,
            path,
            size: 0,
            is_dir: true,
            is_project: kind.is_project,
            is_workspace: kind.is_workspace,
            is_git_worktree: kind.is_git_worktree,
            is_agent_data: kind.is_agent_data,
            file_count: 0,
            dir_count: 0,
            children_loaded: false,
            children: vec![],
        }
    }

    fn overview_entry_labels(entries: &[EntryRoot]) -> HashMap<String, String> {
        entries
            .iter()
            .map(|e| {
                let display = match e.label.as_str() {
                    ENTRY_KEY_HOME => "~".to_string(),
                    ENTRY_KEY_APPLICATIONS => "Applications".to_string(),
                    other => other.to_string(),
                };
                (e.label.clone(), display)
            })
            .collect()
    }

    fn path_covered_by_entries(path: &Path, entries: &[EntryRoot]) -> bool {
        let canon = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        entries.iter().any(|e| {
            let er = std::fs::canonicalize(&e.path).unwrap_or_else(|_| e.path.clone());
            canon == er || canon.starts_with(&er)
        })
    }

    fn unique_entry_label(base: String, entries: &[EntryRoot]) -> String {
        if !entries.iter().any(|e| e.label == base) {
            return base;
        }
        for i in 1..1000 {
            let candidate = format!("{base} ({i})");
            if !entries.iter().any(|e| e.label == candidate) {
                return candidate;
            }
        }
        format!("{base}-extra")
    }

    fn worktree_overview_label(path: &Path) -> String {
        let name = path
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.display().to_string());
        let mut parent = path.parent();
        if parent.and_then(|p| p.file_name()).and_then(|n| n.to_str()) == Some("worktrees") {
            parent = parent.and_then(|p| p.parent());
            if parent
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with('.'))
            {
                parent = parent.and_then(|p| p.parent());
            }
        }
        match parent.and_then(|p| p.file_name()) {
            Some(p) => format!("{name} ({})", p.to_string_lossy()),
            None => name,
        }
    }

    fn append_discovered_overview_entries(
        entries: &mut Vec<EntryRoot>,
        git_worktrees: &[PathBuf],
        agent_roots: &[(String, PathBuf)],
    ) {
        for (label, path) in agent_roots {
            if !path.exists() || Self::path_covered_by_entries(path, entries) {
                continue;
            }
            let label = Self::unique_entry_label(label.clone(), entries);
            entries.push(EntryRoot {
                label,
                path: path.clone(),
                kind: Some(AtmosEntryKind::AgentData),
            });
        }
        for path in git_worktrees {
            if !path.exists() || Self::path_covered_by_entries(path, entries) {
                continue;
            }
            let label = Self::unique_entry_label(Self::worktree_overview_label(path), entries);
            entries.push(EntryRoot {
                label,
                path: path.clone(),
                kind: Some(AtmosEntryKind::GitWorktree),
            });
        }
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
                        let mut cloned = node.clone();
                        let max = max_children.unwrap_or(session.max_children).max(1);
                        finalize_tree(&mut cloned, max, DEFAULT_TREE_DEPTH, true);
                        return Ok(json!({
                            "status": "ready",
                            "tree": cloned,
                            "stats": session.stats.clone(),
                        }));
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

        let engine = DiskAnalyzerEngine::new();
        let path_for_task = path.clone();

        let freed = tokio::task::spawn_blocking(move || {
            engine.delete_path(&path_for_task, permanent, Some(&allowed_root))
        })
        .await
        .map_err(|e| ServiceError::Processing(format!("delete task join failed: {e}")))??;

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
            }
        }

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
            _ => self.user_home()?,
        };
        Ok(self.engine.disk_info(&path)?)
    }

    /// Walk entry roots in parallel and merge into one overview tree.
    #[allow(clippy::too_many_arguments)]
    fn spawn_overview_walk(
        sessions: Arc<Mutex<HashMap<String, DiskAnalyzerSession>>>,
        event_tx: broadcast::Sender<DiskAnalyzerScanEvent>,
        scan_id: String,
        owner: String,
        mut entries: Vec<EntryRoot>,
        project_roots: Vec<PathBuf>,
        workspace_roots: Vec<PathBuf>,
        max_children: usize,
        cancel: Arc<AtomicBool>,
        kind: OverviewKind,
    ) {
        let (root_path_str, root_display_name) = match kind {
            OverviewKind::HomeWithApps => {
                let home_path = entries
                    .iter()
                    .find(|e| e.label == ENTRY_KEY_HOME)
                    .map(|e| e.path.clone());
                let Some(home_path) = home_path else {
                    return;
                };
                (path_key(&home_path), "~".to_string())
            }
            OverviewKind::AtmosSynthetic => (
                ATMOS_OVERVIEW_PATH.to_string(),
                ATMOS_OVERVIEW_NAME.to_string(),
            ),
        };

        tokio::task::spawn_blocking(move || {
            let started = Instant::now();
            // Cheap first paint: Atmos entries plus agent session dirs (exists() only).
            // Home-wide `.git` discovery waits until after this wave so ~/.atmos
            // is not blocked on walking the rest of the machine.
            let home = dirs::home_dir();
            let discovered_agents = home
                .as_ref()
                .map(|h| agent_data_roots(h))
                .unwrap_or_default();
            if matches!(kind, OverviewKind::AtmosSynthetic) {
                DiskAnalyzerService::append_discovered_overview_entries(
                    &mut entries,
                    &[],
                    &discovered_agents,
                );
            }
            let agent_paths: Vec<PathBuf> =
                discovered_agents.iter().map(|(_, p)| p.clone()).collect();
            if let Some(session) = sessions.lock().get_mut(&scan_id) {
                session.entry_roots = entries.iter().map(|e| e.path.clone()).collect();
                session.agent_data_roots = agent_paths.clone();
                // Drill-in can badge linked worktrees via `.git` files; skip a
                // duplicate home walk from spawn_walk while overview is in flight.
                session.marks_ready = true;
            }
            let mut roots = DiskScanRoots {
                project_roots,
                workspace_roots,
                git_worktree_roots: vec![],
                agent_data_roots: agent_paths,
            };
            let mut entry_labels = DiskAnalyzerService::overview_entry_labels(&entries);

            let parts: Arc<Mutex<HashMap<String, DiskNode>>> = Arc::new(Mutex::new(HashMap::new()));
            let files_scanned = Arc::new(AtomicU64::new(0));
            let bytes_scanned = Arc::new(AtomicU64::new(0));
            let dirs_scanned = Arc::new(AtomicU64::new(0));
            let error_count = Arc::new(AtomicU64::new(0));

            let emit_assembled =
                |status: ScanStatus,
                 current: Option<String>,
                 parts: &HashMap<String, DiskNode>,
                 suggestions: Option<&[CleanupSuggestion]>,
                 labels: &HashMap<String, String>| {
                    let Some(mut tree) =
                        assemble_overview(kind, parts, &root_path_str, &root_display_name, labels)
                    else {
                        return;
                    };
                    // Completed assembly prunes root; partial progress keeps all root children.
                    // Depth 3 keeps entry children (target / node_modules / .next / workspaces).
                    let prune_root = matches!(status, ScanStatus::Completed);
                    finalize_tree(&mut tree, max_children, OVERVIEW_TREE_DEPTH, prune_root);
                    bytes_scanned.store(tree.size, Ordering::Relaxed);

                    let stats = ScanStats {
                        root_path: root_path_str.clone(),
                        total_size: tree.size,
                        files_scanned: files_scanned.load(Ordering::Relaxed),
                        dirs_scanned: dirs_scanned.load(Ordering::Relaxed),
                        error_count: error_count.load(Ordering::Relaxed),
                        elapsed_ms: started.elapsed().as_millis() as u64,
                    };

                    if let Some(session) = sessions.lock().get_mut(&scan_id) {
                        session.tree = Some(Arc::new(tree.clone()));
                        // Avoid publishing empty stats at placeholder start (UI used to show 0 files · 0 dirs).
                        if matches!(status, ScanStatus::Completed | ScanStatus::Cancelled)
                            || stats.files_scanned > 0
                            || stats.dirs_scanned > 0
                        {
                            session.stats = Some(stats.clone());
                        }
                        if matches!(
                            status,
                            ScanStatus::Completed | ScanStatus::Cancelled | ScanStatus::Failed
                        ) {
                            session.inflight_root = None;
                            session.completed_at = Some(Instant::now());
                            if matches!(status, ScanStatus::Completed) {
                                if let Some(s) = suggestions {
                                    session.suggestions = Some(s.to_vec());
                                }
                            }
                        }
                    }

                    let payload = json!({
                        "scan_id": scan_id,
                        "status": status,
                        "files_scanned": stats.files_scanned,
                        "bytes_scanned": tree.size,
                        "dirs_scanned": stats.dirs_scanned,
                        "error_count": stats.error_count,
                        "current_path": current,
                        "percent": if matches!(status, ScanStatus::Completed) { json!(100.0) } else { Value::Null },
                        "error": Value::Null,
                        "tree": tree,
                        "level_path": root_path_str,
                        "stats": if matches!(status, ScanStatus::Completed)
                            || stats.files_scanned > 0
                            || stats.dirs_scanned > 0
                        {
                            json!(stats)
                        } else {
                            Value::Null
                        },
                        "suggestions": suggestions,
                    });
                    let _ = event_tx.send(DiskAnalyzerScanEvent {
                        owner_conn_id: owner.clone(),
                        payload,
                    });
                };

            // Placeholder shell so UI can mount immediately.
            {
                let mut map = HashMap::new();
                for entry in &entries {
                    let display = entry_labels
                        .get(&entry.label)
                        .cloned()
                        .unwrap_or_else(|| entry.label.clone());
                    let real_path = path_key(&entry.path);
                    let kind = DiskAnalyzerService::kind_for_entry(entry.kind, &real_path, &roots);
                    map.insert(
                        entry.label.clone(),
                        DiskAnalyzerService::dir_shell(display, real_path, kind),
                    );
                }
                emit_assembled(ScanStatus::Running, None, &map, None, &entry_labels);
            }

            // Phase 1: apply every valid cache hit synchronously (instant paint for
            // previously measured roots like ~/.atmos — no du, no I/O thrash).
            {
                let engine = DiskAnalyzerEngine::new();
                let mut any_hit = false;
                for entry in &entries {
                    if cancel.load(Ordering::Relaxed) {
                        break;
                    }
                    // Entries we expand with scan_level should not be painted from
                    // measure-only cache (that shell hides target/node_modules/.next).
                    let will_expand = matches!(kind, OverviewKind::HomeWithApps)
                        && entry.label == ENTRY_KEY_HOME
                        || matches!(
                            entry.kind,
                            Some(AtmosEntryKind::Project | AtmosEntryKind::Workspace)
                        )
                        || entry.label == ".atmos"
                        || entry
                            .path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .is_some_and(|n| n == ".atmos");
                    if will_expand {
                        continue;
                    }
                    let Some(m) = engine.try_cached_measure(&entry.path) else {
                        continue;
                    };
                    let real_path = path_key(&entry.path);
                    let display_name = entry_labels
                        .get(&entry.label)
                        .cloned()
                        .unwrap_or_else(|| entry.label.clone());
                    let kind = DiskAnalyzerService::kind_for_entry(entry.kind, &real_path, &roots);
                    let mut tree = DiskAnalyzerService::dir_shell(display_name, real_path, kind);
                    tree.size = m.size;
                    tree.file_count = m.file_count;
                    tree.dir_count = m.dir_count;
                    files_scanned.fetch_add(m.file_count, Ordering::Relaxed);
                    dirs_scanned.fetch_add(m.dir_count.saturating_add(1), Ordering::Relaxed);
                    parts.lock().insert(entry.label.clone(), tree);
                    any_hit = true;
                }
                if any_hit {
                    let map = parts.lock().clone();
                    emit_assembled(ScanStatus::Running, None, &map, None, &entry_labels);
                }
            }

            // Phase 2: cold measure / scan_level with limited concurrency.
            // Prioritize ~/.atmos so the dominant tile fills before small project paths.
            let mut ordered_entries = entries.clone();
            ordered_entries.sort_by_key(|e| {
                let is_primary_atmos = e.label == ".atmos"
                    || e.path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .is_some_and(|n| n == ".atmos");
                if is_primary_atmos {
                    0u8
                } else if matches!(kind, OverviewKind::HomeWithApps) && e.label == ENTRY_KEY_HOME {
                    1u8
                } else {
                    2u8
                }
            });

            let du_budget = Arc::new(AtomicUsize::new(OVERVIEW_DU_CONCURRENCY.max(1)));

            std::thread::scope(|scope| {
                for entry in ordered_entries {
                    // Skip entries already filled from cache (still remeasure home).
                    if !(matches!(kind, OverviewKind::HomeWithApps)
                        && entry.label == ENTRY_KEY_HOME)
                    {
                        let already = parts
                            .lock()
                            .get(&entry.label)
                            .is_some_and(|n| n.size > 0 || n.file_count > 0 || n.dir_count > 0);
                        if already {
                            continue;
                        }
                    }

                    let entry = entry.clone();
                    let parts = Arc::clone(&parts);
                    let files_scanned = Arc::clone(&files_scanned);
                    let dirs_scanned = Arc::clone(&dirs_scanned);
                    let error_count = Arc::clone(&error_count);
                    let sessions = Arc::clone(&sessions);
                    let event_tx = event_tx.clone();
                    let owner = owner.clone();
                    let scan_id = scan_id.clone();
                    let cancel = Arc::clone(&cancel);
                    let roots = roots.clone();
                    let entry_kind = entry.kind;
                    let root_path_str = root_path_str.clone();
                    let root_display_name = root_display_name.clone();
                    let entry_labels = entry_labels.clone();
                    let du_budget = Arc::clone(&du_budget);
                    let engine = DiskAnalyzerEngine::new();

                    scope.spawn(move || {
                        if cancel.load(Ordering::Relaxed) {
                            return;
                        }

                        let part_key = entry.label.clone();
                        let entry_path = entry.path.clone();
                        let real_path = path_key(&entry_path);
                        let display_name = entry_labels
                            .get(&part_key)
                            .cloned()
                            .unwrap_or_else(|| part_key.clone());

                        let on_progress: ProgressCallback = Arc::new({
                            let parts = Arc::clone(&parts);
                            let sessions = Arc::clone(&sessions);
                            let event_tx = event_tx.clone();
                            let owner = owner.clone();
                            let scan_id = scan_id.clone();
                            let part_key = part_key.clone();
                            let real_path = real_path.clone();
                            let display_name = display_name.clone();
                            let root_path_str = root_path_str.clone();
                            let root_display_name = root_display_name.clone();
                            let entry_labels = entry_labels.clone();
                            let cancel = Arc::clone(&cancel);
                            move |progress: ScanProgress| {
                                if cancel.load(Ordering::Relaxed) {
                                    return;
                                }
                                if let Some(mut subtree) = progress.tree {
                                    // Keep real filesystem path for drill/delete.
                                    subtree.path = real_path.clone();
                                    subtree.name = display_name.clone();
                                    let snapshot = {
                                        let mut map = parts.lock();
                                        map.insert(part_key.clone(), subtree);
                                        map.clone()
                                    };
                                    if let Some(mut tree) = assemble_overview(
                                        kind,
                                        &snapshot,
                                        &root_path_str,
                                        &root_display_name,
                                        &entry_labels,
                                    ) {
                                        finalize_tree(
                                            &mut tree,
                                            max_children,
                                            OVERVIEW_TREE_DEPTH,
                                            false,
                                        );
                                        if let Some(session) = sessions.lock().get_mut(&scan_id) {
                                            session.tree = Some(Arc::new(tree.clone()));
                                        }
                                        let payload = json!({
                                            "scan_id": scan_id,
                                            "status": "running",
                                            "files_scanned": progress.files_scanned,
                                            "bytes_scanned": tree.size,
                                            "dirs_scanned": progress.dirs_scanned,
                                            "error_count": progress.error_count,
                                            "current_path": progress.current_path,
                                            "percent": Value::Null,
                                            "error": Value::Null,
                                            "tree": tree,
                                            "level_path": root_path_str,
                                        });
                                        let _ = event_tx.send(DiskAnalyzerScanEvent {
                                            owner_conn_id: owner.clone(),
                                            payload,
                                        });
                                    }
                                } else {
                                    let payload = json!({
                                        "scan_id": scan_id,
                                        "status": "running",
                                        "files_scanned": progress.files_scanned,
                                        "bytes_scanned": progress.bytes_scanned,
                                        "dirs_scanned": progress.dirs_scanned,
                                        "error_count": progress.error_count,
                                        "current_path": progress.current_path,
                                        "percent": Value::Null,
                                        "error": Value::Null,
                                        "level_path": root_path_str,
                                    });
                                    let _ = event_tx.send(DiskAnalyzerScanEvent {
                                        owner_conn_id: owner.clone(),
                                        payload,
                                    });
                                }
                            }
                        });

                        // Cap concurrent `du` so large roots are not starved.
                        let acquire_du = || loop {
                            if cancel.load(Ordering::Relaxed) {
                                return false;
                            }
                            let cur = du_budget.load(Ordering::Relaxed);
                            if cur == 0 {
                                std::thread::yield_now();
                                continue;
                            }
                            if du_budget
                                .compare_exchange_weak(
                                    cur,
                                    cur - 1,
                                    Ordering::SeqCst,
                                    Ordering::Relaxed,
                                )
                                .is_ok()
                            {
                                return true;
                            }
                        };
                        let release_du = || {
                            du_budget.fetch_add(1, Ordering::SeqCst);
                        };

                        // Expand entries that hide the real bulk (projects, ~/.atmos,
                        // home). Measure-only shells never surface target/node_modules/.next.
                        let expand_children = matches!(kind, OverviewKind::HomeWithApps)
                            && part_key == ENTRY_KEY_HOME
                            || matches!(
                                entry_kind,
                                Some(AtmosEntryKind::Project | AtmosEntryKind::Workspace)
                            )
                            || part_key == ".atmos"
                            || entry_path
                                .file_name()
                                .and_then(|n| n.to_str())
                                .is_some_and(|n| n == ".atmos");

                        let result = if expand_children {
                            if !acquire_du() {
                                return;
                            }
                            // List immediate children and size each (includes hidden dirs
                            // and build artifacts — skip_hidden=false, no node_modules ban).
                            let out = engine.scan_level(
                                &format!("{scan_id}:{part_key}"),
                                &entry_path,
                                &roots,
                                Some(max_children),
                                Some(Arc::clone(&cancel)),
                                Some(on_progress),
                            );
                            release_du();
                            out
                        } else {
                            if !acquire_du() {
                                return;
                            }
                            let out =
                                match engine.measure_path(&entry_path, Some(Arc::clone(&cancel))) {
                                    Ok(m) => {
                                        let kind = DiskAnalyzerService::kind_for_entry(
                                            entry_kind, &real_path, &roots,
                                        );
                                        let mut tree = DiskAnalyzerService::dir_shell(
                                            display_name.clone(),
                                            real_path.clone(),
                                            kind,
                                        );
                                        tree.size = m.size;
                                        tree.file_count = m.file_count;
                                        tree.dir_count = m.dir_count;
                                        let stats = ScanStats {
                                            root_path: real_path.clone(),
                                            total_size: m.size,
                                            files_scanned: m.file_count,
                                            dirs_scanned: m.dir_count.saturating_add(1),
                                            error_count: m.error_count,
                                            elapsed_ms: 0,
                                        };
                                        on_progress(ScanProgress {
                                            scan_id: scan_id.clone(),
                                            status: ScanStatus::Running,
                                            files_scanned: m.file_count,
                                            bytes_scanned: m.size,
                                            dirs_scanned: m.dir_count.saturating_add(1),
                                            error_count: m.error_count,
                                            current_path: Some(real_path.clone()),
                                            percent: None,
                                            error: None,
                                            tree: Some(tree.clone()),
                                            level_path: Some(root_path_str.clone()),
                                        });
                                        Ok((tree, stats, Vec::new()))
                                    }
                                    Err(e) => Err(e),
                                };
                            release_du();
                            out
                        };

                        match result {
                            Ok((mut tree, stats, _suggestions)) => {
                                tree.path = real_path;
                                tree.name = display_name;
                                let kind = DiskAnalyzerService::kind_for_entry(
                                    entry_kind, &tree.path, &roots,
                                );
                                DiskAnalyzerService::apply_kind(&mut tree, kind);
                                // Keep children from scan_level so target/node_modules/.next
                                // appear under projects and workspaces under ~/.atmos.
                                // Only measure-only shells stay collapsed for drill-in.
                                if !expand_children {
                                    tree.children.clear();
                                    tree.children_loaded = false;
                                }
                                files_scanned.fetch_add(stats.files_scanned, Ordering::Relaxed);
                                dirs_scanned.fetch_add(stats.dirs_scanned, Ordering::Relaxed);
                                error_count.fetch_add(stats.error_count, Ordering::Relaxed);
                                parts.lock().insert(part_key, tree);
                            }
                            Err(e) if e.to_string().contains("cancelled") => {
                                cancel.store(true, Ordering::Relaxed);
                            }
                            Err(_) => {
                                error_count.fetch_add(1, Ordering::Relaxed);
                            }
                        }
                    });
                }
            });

            if matches!(kind, OverviewKind::AtmosSynthetic) && !cancel.load(Ordering::Relaxed) {
                let discovered_worktrees = home
                    .as_ref()
                    .map(|h| GitEngine::new().discover_linked_worktrees(h, Some(&cancel)))
                    .unwrap_or_default();
                roots.git_worktree_roots = discovered_worktrees.clone();
                let existing: HashSet<String> = entries.iter().map(|e| e.label.clone()).collect();
                DiskAnalyzerService::append_discovered_overview_entries(
                    &mut entries,
                    &discovered_worktrees,
                    &[],
                );
                entry_labels = DiskAnalyzerService::overview_entry_labels(&entries);
                let new_entries: Vec<EntryRoot> = entries
                    .iter()
                    .filter(|e| !existing.contains(&e.label))
                    .cloned()
                    .collect();
                if let Some(session) = sessions.lock().get_mut(&scan_id) {
                    session.entry_roots = entries.iter().map(|e| e.path.clone()).collect();
                    session.git_worktree_roots = discovered_worktrees;
                }
                if !new_entries.is_empty() {
                    {
                        let mut map = parts.lock();
                        for entry in &new_entries {
                            let real_path = path_key(&entry.path);
                            let display = entry_labels
                                .get(&entry.label)
                                .cloned()
                                .unwrap_or_else(|| entry.label.clone());
                            let kind =
                                DiskAnalyzerService::kind_for_entry(entry.kind, &real_path, &roots);
                            map.insert(
                                entry.label.clone(),
                                DiskAnalyzerService::dir_shell(display, real_path, kind),
                            );
                        }
                    }
                    {
                        let map = parts.lock().clone();
                        emit_assembled(ScanStatus::Running, None, &map, None, &entry_labels);
                    }

                    let engine = DiskAnalyzerEngine::new();
                    for entry in &new_entries {
                        if cancel.load(Ordering::Relaxed) {
                            break;
                        }
                        if let Some(m) = engine.try_cached_measure(&entry.path) {
                            let real_path = path_key(&entry.path);
                            let display_name = entry_labels
                                .get(&entry.label)
                                .cloned()
                                .unwrap_or_else(|| entry.label.clone());
                            let kind =
                                DiskAnalyzerService::kind_for_entry(entry.kind, &real_path, &roots);
                            let mut tree =
                                DiskAnalyzerService::dir_shell(display_name, real_path, kind);
                            tree.size = m.size;
                            tree.file_count = m.file_count;
                            tree.dir_count = m.dir_count;
                            files_scanned.fetch_add(m.file_count, Ordering::Relaxed);
                            dirs_scanned
                                .fetch_add(m.dir_count.saturating_add(1), Ordering::Relaxed);
                            parts.lock().insert(entry.label.clone(), tree);
                        }
                    }
                    {
                        let map = parts.lock().clone();
                        emit_assembled(ScanStatus::Running, None, &map, None, &entry_labels);
                    }

                    std::thread::scope(|scope| {
                        for entry in new_entries {
                            if cancel.load(Ordering::Relaxed) {
                                break;
                            }
                            let already = parts
                                .lock()
                                .get(&entry.label)
                                .is_some_and(|n| n.size > 0 || n.file_count > 0 || n.dir_count > 0);
                            if already {
                                continue;
                            }
                            let parts = Arc::clone(&parts);
                            let files_scanned = Arc::clone(&files_scanned);
                            let dirs_scanned = Arc::clone(&dirs_scanned);
                            let error_count = Arc::clone(&error_count);
                            let sessions = Arc::clone(&sessions);
                            let event_tx = event_tx.clone();
                            let owner = owner.clone();
                            let scan_id = scan_id.clone();
                            let cancel = Arc::clone(&cancel);
                            let roots = roots.clone();
                            let root_path_str = root_path_str.clone();
                            let root_display_name = root_display_name.clone();
                            let entry_labels = entry_labels.clone();
                            let du_budget = Arc::clone(&du_budget);
                            let engine = DiskAnalyzerEngine::new();
                            scope.spawn(move || {
                                if cancel.load(Ordering::Relaxed) {
                                    return;
                                }
                                let part_key = entry.label.clone();
                                let real_path = path_key(&entry.path);
                                let display_name = entry_labels
                                    .get(&part_key)
                                    .cloned()
                                    .unwrap_or_else(|| part_key.clone());
                                loop {
                                    if cancel.load(Ordering::Relaxed) {
                                        return;
                                    }
                                    let cur = du_budget.load(Ordering::Relaxed);
                                    if cur == 0 {
                                        std::thread::yield_now();
                                        continue;
                                    }
                                    if du_budget
                                        .compare_exchange_weak(
                                            cur,
                                            cur - 1,
                                            Ordering::SeqCst,
                                            Ordering::Relaxed,
                                        )
                                        .is_ok()
                                    {
                                        break;
                                    }
                                }
                                let out = engine.measure_path(&entry.path, Some(Arc::clone(&cancel)));
                                du_budget.fetch_add(1, Ordering::SeqCst);
                                match out {
                                    Ok(m) => {
                                        let path_kind = DiskAnalyzerService::kind_for_entry(
                                            entry.kind,
                                            &real_path,
                                            &roots,
                                        );
                                        let mut tree = DiskAnalyzerService::dir_shell(
                                            display_name.clone(),
                                            real_path.clone(),
                                            path_kind,
                                        );
                                        tree.size = m.size;
                                        tree.file_count = m.file_count;
                                        tree.dir_count = m.dir_count;
                                        files_scanned.fetch_add(m.file_count, Ordering::Relaxed);
                                        dirs_scanned.fetch_add(
                                            m.dir_count.saturating_add(1),
                                            Ordering::Relaxed,
                                        );
                                        error_count.fetch_add(m.error_count, Ordering::Relaxed);
                                        let snapshot = {
                                            let mut map = parts.lock();
                                            map.insert(part_key, tree);
                                            map.clone()
                                        };
                                        if let Some(mut tree) = assemble_overview(
                                            kind,
                                            &snapshot,
                                            &root_path_str,
                                            &root_display_name,
                                            &entry_labels,
                                        ) {
                                            finalize_tree(
                                                &mut tree,
                                                max_children,
                                                OVERVIEW_TREE_DEPTH,
                                                false,
                                            );
                                            let shared = Arc::new(tree.clone());
                                            if let Some(session) =
                                                sessions.lock().get_mut(&scan_id)
                                            {
                                                session.tree = Some(Arc::clone(&shared));
                                            }
                                            let payload = json!({
                                                "scan_id": scan_id,
                                                "status": "running",
                                                "files_scanned": files_scanned.load(Ordering::Relaxed),
                                                "bytes_scanned": tree.size,
                                                "dirs_scanned": dirs_scanned.load(Ordering::Relaxed),
                                                "error_count": error_count.load(Ordering::Relaxed),
                                                "current_path": real_path,
                                                "percent": Value::Null,
                                                "error": Value::Null,
                                                "tree": tree,
                                                "level_path": root_path_str,
                                            });
                                            let _ = event_tx.send(DiskAnalyzerScanEvent {
                                                owner_conn_id: owner,
                                                payload,
                                            });
                                        }
                                    }
                                    Err(e) if e.to_string().contains("cancelled") => {
                                        cancel.store(true, Ordering::Relaxed);
                                    }
                                    Err(_) => {
                                        error_count.fetch_add(1, Ordering::Relaxed);
                                    }
                                }
                            });
                        }
                    });
                }
            }

            if cancel.load(Ordering::Relaxed) {
                let map = parts.lock().clone();
                emit_assembled(ScanStatus::Cancelled, None, &map, None, &entry_labels);
                return;
            }

            let map = parts.lock().clone();
            let mut all_suggestions = Vec::new();
            for node in map.values() {
                all_suggestions.extend(core_engine::cleanup_suggestions(node));
            }
            all_suggestions.sort_by_key(|s| std::cmp::Reverse(s.size));
            all_suggestions.truncate(20);

            emit_assembled(
                ScanStatus::Completed,
                None,
                &map,
                Some(all_suggestions.as_slice()),
                &entry_labels,
            );
        });
    }

    #[allow(clippy::too_many_arguments)]
    fn spawn_walk(
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

    /// Returns `(project_roots, workspace_roots, project_labels)` where
    /// `project_labels` is `(display_name, path)` for overview tiles.
    async fn collect_atmos_locations_static(
        project_service: Arc<ProjectService>,
        workspace_service: Arc<WorkspaceService>,
        git_engine: GitEngine,
    ) -> (Vec<PathBuf>, Vec<PathBuf>, Vec<(String, PathBuf)>) {
        let mut project_roots: Vec<PathBuf> = Vec::new();
        let mut workspace_roots: Vec<PathBuf> = Vec::new();
        let mut project_labels: Vec<(String, PathBuf)> = Vec::new();
        let Ok(projects) = project_service.list_projects().await else {
            return (project_roots, workspace_roots, project_labels);
        };
        for project in projects {
            let mut root = PathBuf::from(&project.main_file_path);
            // main_file_path may be a file inside the repo — measure the directory.
            if root.is_file() {
                if let Some(parent) = root.parent() {
                    root = parent.to_path_buf();
                }
            }
            if root.exists() {
                project_roots.push(root.clone());
                project_labels.push((project.name.clone(), root));
            }
            if let Ok(workspaces) = workspace_service
                .list_by_project(project.guid.clone())
                .await
            {
                for workspace in workspaces {
                    let path = if !workspace.local_path.is_empty() {
                        PathBuf::from(&workspace.local_path)
                    } else if let Ok(p) = git_engine.get_worktree_path(&workspace.model.name) {
                        p
                    } else {
                        continue;
                    };
                    if !path.exists() {
                        continue;
                    }
                    workspace_roots.push(path);
                }
            }
        }
        (project_roots, workspace_roots, project_labels)
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

fn path_key(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

#[derive(Debug, Clone, Copy)]
enum OverviewKind {
    /// Home tree with `/Applications` grafted under home.
    HomeWithApps,
    /// Synthetic "Atmos" root; each entry is a top-level child.
    AtmosSynthetic,
}

fn synthetic_group(
    name: &str,
    path: &str,
    mut children: Vec<DiskNode>,
    is_git_worktree: bool,
    is_agent_data: bool,
) -> DiskNode {
    children.sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.name.cmp(&b.name)));
    let size: u64 = children.iter().map(|c| c.size).sum();
    let file_count: u64 = children.iter().map(|c| c.file_count).sum();
    let dir_count: u64 = children.len() as u64 + children.iter().map(|c| c.dir_count).sum::<u64>();
    DiskNode {
        name: name.to_string(),
        path: path.to_string(),
        size,
        is_dir: true,
        is_project: false,
        is_workspace: false,
        is_git_worktree,
        is_agent_data,
        file_count,
        dir_count,
        children_loaded: true,
        children,
    }
}

/// Merge parallel entry scans into one overview tree.
fn assemble_overview(
    kind: OverviewKind,
    parts: &HashMap<String, DiskNode>,
    root_path: &str,
    root_display_name: &str,
    entry_labels: &HashMap<String, String>,
) -> Option<DiskNode> {
    if parts.is_empty() {
        return None;
    }

    match kind {
        OverviewKind::HomeWithApps => {
            let mut root = parts
                .get(ENTRY_KEY_HOME)
                .cloned()
                .unwrap_or_else(|| DiskNode {
                    name: root_display_name.to_string(),
                    path: root_path.to_string(),
                    size: 0,
                    is_dir: true,
                    is_project: false,
                    is_workspace: false,
                    is_git_worktree: false,
                    is_agent_data: false,
                    file_count: 0,
                    dir_count: 0,
                    children_loaded: true,
                    children: vec![],
                });
            root.name = root_display_name.to_string();
            root.path = root_path.to_string();
            root.children_loaded = true;

            if let Some(mut apps) = parts.get(ENTRY_KEY_APPLICATIONS).cloned() {
                apps.name = "Applications".into();
                apps.path = "/Applications".into();
                root.children.retain(|c| c.path != apps.path);
                let apps_size = apps.size;
                root.children.push(apps);
                root.size = root.size.saturating_add(apps_size);
                root.dir_count = root.dir_count.saturating_add(1);
            }

            root.children
                .sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.name.cmp(&b.name)));
            Some(root)
        }
        OverviewKind::AtmosSynthetic => {
            let mut atmos_children = Vec::new();
            let mut agent_children = Vec::new();
            let mut worktree_children = Vec::new();
            for (key, node) in parts {
                let mut n = node.clone();
                if let Some(label) = entry_labels.get(key) {
                    n.name = label.clone();
                }
                if n.is_git_worktree {
                    worktree_children.push(n);
                } else if n.is_agent_data {
                    agent_children.push(n);
                } else {
                    atmos_children.push(n);
                }
            }

            let mut children = atmos_children;
            if !agent_children.is_empty() {
                children.push(synthetic_group(
                    AGENT_GROUP_NAME,
                    AGENT_GROUP_PATH,
                    agent_children,
                    false,
                    true,
                ));
            }
            if !worktree_children.is_empty() {
                children.push(synthetic_group(
                    WORKTREE_GROUP_NAME,
                    WORKTREE_GROUP_PATH,
                    worktree_children,
                    true,
                    false,
                ));
            }
            children.sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.name.cmp(&b.name)));

            let total_size: u64 = children.iter().map(|c| c.size).sum();
            let file_count: u64 = children.iter().map(|c| c.file_count).sum();
            let dir_count: u64 =
                children.len() as u64 + children.iter().map(|c| c.dir_count).sum::<u64>();

            Some(DiskNode {
                name: root_display_name.to_string(),
                path: root_path.to_string(),
                size: total_size,
                is_dir: true,
                is_project: false,
                is_workspace: false,
                is_git_worktree: false,
                is_agent_data: false,
                file_count,
                dir_count,
                children_loaded: true,
                children,
            })
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

fn merge_subtree(root: &mut DiskNode, patch: &DiskNode) -> bool {
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

#[cfg(test)]
mod tests {
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
}
