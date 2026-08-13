//! Atmos overview assembly and the two-wave overview walk.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;

use core_engine::{
    agent_data_roots, clear_suggestions, finalize_tree, CleanupSuggestion, DiskAnalyzerEngine,
    DiskNode, DiskPathKind, DiskScanRoots, GitEngine, ProgressCallback, ScanProgress, ScanStats,
    ScanStatus,
};
use parking_lot::Mutex;
use serde_json::{json, Value};
use tokio::sync::broadcast;

use crate::service::project::ProjectService;
use crate::service::workspace::WorkspaceService;
use crate::{Result, ServiceError};

use super::{
    path_key, AtmosEntryKind, DiskAnalyzerScanEvent, DiskAnalyzerService, DiskAnalyzerSession,
    EntryRoot, AGENT_GROUP_NAME, AGENT_GROUP_PATH, ATMOS_OVERVIEW_NAME, ATMOS_OVERVIEW_PATH,
    ENTRY_KEY_APPLICATIONS, ENTRY_KEY_HOME, OVERVIEW_DU_CONCURRENCY, OVERVIEW_TREE_DEPTH,
    WORKTREE_GROUP_NAME, WORKTREE_GROUP_PATH,
};

#[derive(Debug, Clone, Copy)]
pub(super) enum OverviewKind {
    /// Home tree with `/Applications` grafted under home.
    HomeWithApps,
    /// Synthetic "Atmos" root; each entry is a top-level child.
    AtmosSynthetic,
}

impl DiskAnalyzerService {
    pub(super) fn user_home(&self) -> Result<PathBuf> {
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
    pub(super) fn home_entry_roots(&self) -> Result<Vec<EntryRoot>> {
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
    pub(super) fn atmos_static_entry_roots(&self) -> Result<Vec<EntryRoot>> {
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
    pub(super) fn push_identified_project_entries(
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
    pub(super) fn scan_roots(
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

    pub(super) fn kind_for_entry(
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

    pub(super) fn apply_kind(node: &mut DiskNode, kind: DiskPathKind) {
        node.is_project = kind.is_project;
        node.is_workspace = kind.is_workspace;
        node.is_git_worktree = kind.is_git_worktree;
        node.is_agent_data = kind.is_agent_data;
    }

    pub(super) fn dir_shell(name: String, path: String, kind: DiskPathKind) -> DiskNode {
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

    pub(super) fn overview_entry_labels(entries: &[EntryRoot]) -> HashMap<String, String> {
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

    pub(super) fn path_covered_by_entries(path: &Path, entries: &[EntryRoot]) -> bool {
        let canon = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        entries.iter().any(|e| {
            let er = std::fs::canonicalize(&e.path).unwrap_or_else(|_| e.path.clone());
            canon == er || canon.starts_with(&er)
        })
    }

    pub(super) fn unique_entry_label(base: String, entries: &[EntryRoot]) -> String {
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

    pub(super) fn worktree_overview_label(path: &Path) -> String {
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

    pub(super) fn append_discovered_overview_entries(
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

    /// Walk entry roots in parallel and merge into one overview tree.
    #[allow(clippy::too_many_arguments)]
    pub(super) fn spawn_overview_walk(
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
                 labels: &HashMap<String, String>| {
                    let Some(mut tree) =
                        assemble_overview(kind, parts, &root_path_str, &root_display_name, labels)
                    else {
                        return;
                    };
                    // Completed assembly prunes root; partial progress keeps all root children.
                    // Depth 3 keeps entry children (target / node_modules / .next / workspaces).
                    let prune_root = matches!(status, ScanStatus::Completed);
                    // Score suggestions on the unpruned tree so caches collapsed
                    // into `__other__` still surface. Activity is read from disk.
                    let suggestions = clear_suggestions(&tree);
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
                            session.suggestions = Some(suggestions.clone());
                        } else if !suggestions.is_empty() {
                            session.suggestions = Some(suggestions.clone());
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
                emit_assembled(ScanStatus::Running, None, &map, &entry_labels);
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
                    emit_assembled(ScanStatus::Running, None, &map, &entry_labels);
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
                        emit_assembled(ScanStatus::Running, None, &map, &entry_labels);
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
                        emit_assembled(ScanStatus::Running, None, &map, &entry_labels);
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
                emit_assembled(ScanStatus::Cancelled, None, &map, &entry_labels);
                return;
            }

            let map = parts.lock().clone();
            emit_assembled(ScanStatus::Completed, None, &map, &entry_labels);
        });
    }

    /// Returns `(project_roots, workspace_roots, project_labels)` where
    /// `project_labels` is `(display_name, path)` for overview tiles.
    pub(super) async fn collect_atmos_locations_static(
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
                .list_all_by_project(project.guid.clone())
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
}

pub(super) fn synthetic_group(
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
pub(super) fn assemble_overview(
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
