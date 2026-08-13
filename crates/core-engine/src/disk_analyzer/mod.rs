//! Disk usage analyzer — parallel walk, hierarchical size tree, trash/delete.

mod cache;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use jwalk::WalkDir;
use serde::{Deserialize, Serialize};

use crate::error::{EngineError, Result};

pub use cache::{
    clear_all as clear_path_cache, invalidate_path as invalidate_path_cache, CACHE_TTL,
};

const OTHER_NAME: &str = "__other__";
const DEFAULT_MAX_CHILDREN: usize = 30;
/// Structural depth kept in multi-level trees (legacy finalize). Level scans return depth 1.
pub const DEFAULT_TREE_DEPTH: usize = 2;
const PROGRESS_MIN_INTERVAL: Duration = Duration::from_millis(200);

/// Hierarchical disk usage node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskNode {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    /// Identified Atmos **project** root (not a workspace worktree).
    pub is_project: bool,
    /// Identified Atmos **workspace** worktree path.
    #[serde(default)]
    pub is_workspace: bool,
    /// Linked git worktree that is not an Atmos workspace.
    #[serde(default)]
    pub is_git_worktree: bool,
    /// Mainstream code-agent home / session directory.
    #[serde(default)]
    pub is_agent_data: bool,
    pub file_count: u64,
    pub dir_count: u64,
    /// When false, children are not expanded for visualization yet.
    #[serde(default = "default_children_loaded")]
    pub children_loaded: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<DiskNode>,
}

#[allow(dead_code)]
fn default_children_loaded() -> bool {
    true
}

/// Live scan progress snapshot.
#[derive(Debug, Clone, Serialize)]
pub struct ScanProgress {
    pub scan_id: String,
    pub status: ScanStatus,
    pub files_scanned: u64,
    pub bytes_scanned: u64,
    pub dirs_scanned: u64,
    pub error_count: u64,
    pub current_path: Option<String>,
    pub percent: Option<f32>,
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tree: Option<DiskNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level_path: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanStatus {
    Running,
    Completed,
    Cancelled,
    Failed,
}

/// Aggregate scan statistics.
#[derive(Debug, Clone, Serialize)]
pub struct ScanStats {
    pub root_path: String,
    pub total_size: u64,
    pub files_scanned: u64,
    pub dirs_scanned: u64,
    pub error_count: u64,
    pub elapsed_ms: u64,
}

/// Volume free/total space.
#[derive(Debug, Clone, Serialize)]
pub struct DiskVolumeInfo {
    pub path: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
}

/// Callback for throttled progress updates during a scan.
pub type ProgressCallback = Arc<dyn Fn(ScanProgress) + Send + Sync>;

/// Result of sizing a single path (file or whole directory tree).
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct PathMeasure {
    pub size: u64,
    pub file_count: u64,
    pub dir_count: u64,
    pub error_count: u64,
}

/// Roots used to badge directories during a scan.
#[derive(Debug, Clone, Default)]
pub struct DiskScanRoots {
    pub project_roots: Vec<PathBuf>,
    pub workspace_roots: Vec<PathBuf>,
    pub git_worktree_roots: Vec<PathBuf>,
    pub agent_data_roots: Vec<PathBuf>,
}

/// Exclusive path badge. Workspace wins over project; git worktree over agent data.
#[derive(Debug, Clone, Copy, Default)]
pub struct DiskPathKind {
    pub is_project: bool,
    pub is_workspace: bool,
    pub is_git_worktree: bool,
    pub is_agent_data: bool,
}

impl DiskPathKind {
    pub fn classify(path: &Path, roots: &DiskScanRoots) -> Self {
        let canon = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        let matches = |candidates: &[PathBuf]| {
            candidates.iter().any(|r| {
                let r = std::fs::canonicalize(r).unwrap_or_else(|_| r.clone());
                canon == r
            })
        };
        if matches(&roots.workspace_roots) {
            return Self {
                is_workspace: true,
                ..Self::default()
            };
        }
        if matches(&roots.project_roots) {
            return Self {
                is_project: true,
                ..Self::default()
            };
        }
        if matches(&roots.git_worktree_roots) || path.join(".git").is_file() {
            return Self {
                is_git_worktree: true,
                ..Self::default()
            };
        }
        if matches(&roots.agent_data_roots) {
            return Self {
                is_agent_data: true,
                ..Self::default()
            };
        }
        Self::default()
    }
}

fn canon_path_set(paths: &[PathBuf]) -> HashSet<PathBuf> {
    paths
        .iter()
        .map(|p| std::fs::canonicalize(p).unwrap_or_else(|_| p.clone()))
        .collect()
}

pub struct DiskAnalyzerEngine;

impl DiskAnalyzerEngine {
    pub fn new() -> Self {
        Self
    }

    /// Allocated disk usage for a path (Unix: blocks * 512; Windows: AllocationSize).
    pub fn allocated_size(path: &Path) -> Option<u64> {
        #[cfg(windows)]
        {
            windows_allocated_size(path)
        }
        #[cfg(not(windows))]
        {
            let meta = std::fs::symlink_metadata(path).ok()?;
            allocated_size_from_metadata(&meta)
        }
    }

    pub fn disk_info(&self, path: &Path) -> Result<DiskVolumeInfo> {
        let target = if path.exists() {
            path.to_path_buf()
        } else {
            path.parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| path.to_path_buf())
        };

        let available = fs4::available_space(&target).map_err(|e| {
            EngineError::FileSystem(format!(
                "Failed to read available space for {}: {}",
                target.display(),
                e
            ))
        })?;
        let total = fs4::total_space(&target).map_err(|e| {
            EngineError::FileSystem(format!(
                "Failed to read total space for {}: {}",
                target.display(),
                e
            ))
        })?;

        Ok(DiskVolumeInfo {
            path: target.to_string_lossy().to_string(),
            total_bytes: total,
            available_bytes: available,
        })
    }

    /// Scan one directory level: list immediate children and size each in parallel.
    ///
    /// Directory children keep `children_loaded = false` so the UI loads deeper
    /// levels only when the user drills in. Much faster than building a multi-level tree.
    #[allow(clippy::too_many_arguments)]
    pub fn scan_path(
        &self,
        scan_id: &str,
        root: &Path,
        roots: &DiskScanRoots,
        max_children: Option<usize>,
        cancel: Option<Arc<AtomicBool>>,
        on_progress: Option<ProgressCallback>,
    ) -> Result<(DiskNode, ScanStats, Vec<CleanupSuggestion>)> {
        self.scan_level(scan_id, root, roots, max_children, cancel, on_progress)
    }

    /// Return a valid on-disk measure cache entry (mtime + 3-day TTL), if any.
    /// Does not run `du` / walk — used to paint overview tiles instantly.
    pub fn try_cached_measure(&self, path: &Path) -> Option<PathMeasure> {
        if !path.exists() {
            return None;
        }
        let path = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        path.parent()?;
        cache::get_measure(&path)
    }

    /// Size a path only (no children). Used for overview entry roots.
    /// Hits on-disk path cache when mtime matches and age ≤ 3 days.
    pub fn measure_path(
        &self,
        path: &Path,
        cancel: Option<Arc<AtomicBool>>,
    ) -> Result<PathMeasure> {
        if !path.exists() {
            return Err(EngineError::FileSystem(format!(
                "Path does not exist: {}",
                path.display()
            )));
        }
        let path = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        if path.parent().is_none() {
            return Err(EngineError::FileSystem(
                "Refusing to measure filesystem root".into(),
            ));
        }

        if let Some(cached) = cache::get_measure(&path) {
            return Ok(cached);
        }

        let meta = std::fs::symlink_metadata(&path)
            .map_err(|e| EngineError::FileSystem(format!("stat {}: {e}", path.display())))?;

        let measure = if meta.file_type().is_file() || meta.file_type().is_symlink() {
            let size = Self::file_allocated_size(&path, &meta).unwrap_or(0);
            PathMeasure {
                size,
                file_count: 1,
                dir_count: 0,
                error_count: 0,
            }
        } else if !meta.file_type().is_dir() {
            PathMeasure::default()
        } else {
            measure_directory(&path, cancel.as_ref())
        };

        cache::put_measure(&path, &measure);
        Ok(measure)
    }

    /// List `path`'s immediate children; size each child (dirs fully) concurrently.
    #[allow(clippy::too_many_arguments)]
    pub fn scan_level(
        &self,
        scan_id: &str,
        path: &Path,
        roots: &DiskScanRoots,
        max_children: Option<usize>,
        cancel: Option<Arc<AtomicBool>>,
        on_progress: Option<ProgressCallback>,
    ) -> Result<(DiskNode, ScanStats, Vec<CleanupSuggestion>)> {
        if !path.exists() {
            return Err(EngineError::FileSystem(format!(
                "Path does not exist: {}",
                path.display()
            )));
        }
        if !path.is_dir() {
            return Err(EngineError::FileSystem(format!(
                "Path is not a directory: {}",
                path.display()
            )));
        }
        if path.parent().is_none() {
            return Err(EngineError::FileSystem(
                "Refusing to scan filesystem root; use a user directory (e.g. home)".into(),
            ));
        }

        let root = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        if root.parent().is_none() {
            return Err(EngineError::FileSystem(
                "Refusing to scan filesystem root after canonicalize".into(),
            ));
        }

        let started = Instant::now();
        let max_children = max_children.unwrap_or(DEFAULT_MAX_CHILDREN).max(1);
        let root_path_str = root.to_string_lossy().to_string();
        let project_set = canon_path_set(&roots.project_roots);
        let workspace_set = canon_path_set(&roots.workspace_roots);
        let worktree_set = canon_path_set(&roots.git_worktree_roots);
        let agent_set = canon_path_set(&roots.agent_data_roots);
        // Workspace > project > git worktree > agent data (exclusive badges).
        let classify = |p: &PathBuf| -> DiskPathKind {
            let p = std::fs::canonicalize(p).unwrap_or_else(|_| p.clone());
            if workspace_set.contains(&p) {
                DiskPathKind {
                    is_workspace: true,
                    ..DiskPathKind::default()
                }
            } else if project_set.contains(&p) {
                DiskPathKind {
                    is_project: true,
                    ..DiskPathKind::default()
                }
            } else if worktree_set.contains(&p) || p.join(".git").is_file() {
                DiskPathKind {
                    is_git_worktree: true,
                    ..DiskPathKind::default()
                }
            } else if agent_set.contains(&p) {
                DiskPathKind {
                    is_agent_data: true,
                    ..DiskPathKind::default()
                }
            } else {
                DiskPathKind::default()
            }
        };

        let files_scanned = Arc::new(AtomicU64::new(0));
        let bytes_scanned = Arc::new(AtomicU64::new(0));
        let dirs_scanned = Arc::new(AtomicU64::new(0));
        let error_count = Arc::new(AtomicU64::new(0));
        let last_emit = std::sync::Mutex::new(Instant::now() - PROGRESS_MIN_INTERVAL);

        let emit = |status: ScanStatus, current: Option<String>, tree: Option<DiskNode>| {
            let Some(cb) = on_progress.as_ref() else {
                return;
            };
            let now = Instant::now();
            if status == ScanStatus::Running {
                let mut guard = last_emit.lock().unwrap_or_else(|e| e.into_inner());
                if now.duration_since(*guard) < PROGRESS_MIN_INTERVAL {
                    return;
                }
                *guard = now;
            }
            cb(ScanProgress {
                scan_id: scan_id.to_string(),
                status,
                files_scanned: files_scanned.load(Ordering::Relaxed),
                bytes_scanned: bytes_scanned.load(Ordering::Relaxed),
                dirs_scanned: dirs_scanned.load(Ordering::Relaxed),
                error_count: error_count.load(Ordering::Relaxed),
                current_path: current,
                percent: None,
                error: None,
                tree,
                level_path: Some(root_path_str.clone()),
            });
        };

        // Path cache: valid only when mtime matches and age ≤ 3 days.
        if let Some(cached) = cache::get_level(&root, max_children) {
            let suggestions = cleanup_suggestions(&cached);
            let stats = ScanStats {
                root_path: root_path_str.clone(),
                total_size: cached.size,
                files_scanned: cached.file_count,
                dirs_scanned: cached.dir_count,
                error_count: 0,
                elapsed_ms: started.elapsed().as_millis() as u64,
            };
            emit(ScanStatus::Completed, None, Some(cached.clone()));
            return Ok((cached, stats, suggestions));
        }

        emit(ScanStatus::Running, Some(root_path_str.clone()), None);

        // Collect immediate children first (fast).
        let mut entries: Vec<(PathBuf, bool)> = Vec::new();
        match std::fs::read_dir(&root) {
            Ok(rd) => {
                for ent in rd {
                    if cancel
                        .as_ref()
                        .map(|c| c.load(Ordering::Relaxed))
                        .unwrap_or(false)
                    {
                        emit(ScanStatus::Cancelled, None, None);
                        return Err(EngineError::FileSystem("Scan cancelled".to_string()));
                    }
                    let ent = match ent {
                        Ok(e) => e,
                        Err(_) => {
                            error_count.fetch_add(1, Ordering::Relaxed);
                            continue;
                        }
                    };
                    let child = ent.path();
                    if should_skip_scan_entry(&child) {
                        continue;
                    }
                    let ft = match ent.file_type() {
                        Ok(t) => t,
                        Err(_) => {
                            error_count.fetch_add(1, Ordering::Relaxed);
                            continue;
                        }
                    };
                    // Skip symlinked dirs to avoid escaping the tree.
                    if ft.is_symlink() {
                        if ft.is_file() || child.is_file() {
                            entries.push((child, false));
                        }
                        continue;
                    }
                    if ft.is_dir() {
                        entries.push((child, true));
                    } else if ft.is_file() {
                        entries.push((child, false));
                    }
                }
            }
            Err(e) => {
                return Err(EngineError::FileSystem(format!(
                    "read_dir {}: {e}",
                    root.display()
                )));
            }
        }

        dirs_scanned.store(1, Ordering::Relaxed); // the root itself

        // Mole-style: size files immediately; size directories concurrently (prefer `du`).
        let children_map: Arc<std::sync::Mutex<HashMap<String, DiskNode>>> =
            Arc::new(std::sync::Mutex::new(HashMap::with_capacity(entries.len())));
        let sibling_file_ids: Arc<std::sync::Mutex<HashSet<(u64, u64)>>> =
            Arc::new(std::sync::Mutex::new(HashSet::new()));
        // Cap concurrent `du` like Mole (min(4, ncpu)) — each du is already I/O heavy.
        let du_budget = Arc::new(AtomicUsize::new(
            std::cmp::min(
                4,
                std::thread::available_parallelism()
                    .map(|n| n.get())
                    .unwrap_or(4),
            )
            .max(1),
        ));

        let root_name = root
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| root.to_string_lossy().to_string());
        let root_kind = classify(&root);

        let build_snapshot = |map: &HashMap<String, DiskNode>| -> DiskNode {
            let mut children: Vec<DiskNode> = map.values().cloned().collect();
            children.sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.name.cmp(&b.name)));
            let total_size = bytes_scanned.load(Ordering::Relaxed);
            let file_count: u64 = children
                .iter()
                .map(|c| c.file_count + if c.is_dir { 0 } else { 1 })
                .sum();
            let dir_count: u64 = children
                .iter()
                .map(|c| if c.is_dir { 1 + c.dir_count } else { 0 })
                .sum();
            let mut tree = DiskNode {
                name: root_name.clone(),
                path: root_path_str.clone(),
                size: total_size,
                is_dir: true,
                is_project: root_kind.is_project,
                is_workspace: root_kind.is_workspace,
                is_git_worktree: root_kind.is_git_worktree,
                is_agent_data: root_kind.is_agent_data,
                file_count,
                dir_count,
                children_loaded: true,
                children,
            };
            prune_tree(&mut tree, max_children);
            tree
        };

        // Seed: files sized now; directories pending at size 0 (Mole uses Size: -1).
        {
            let mut map = children_map.lock().unwrap_or_else(|e| e.into_inner());
            for (child_path, is_dir) in &entries {
                let name = child_path
                    .file_name()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| child_path.to_string_lossy().to_string());
                let path_str = child_path.to_string_lossy().to_string();
                let kind = classify(child_path);
                if *is_dir {
                    map.insert(
                        path_str.clone(),
                        DiskNode {
                            name,
                            path: path_str,
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
                        },
                    );
                } else {
                    let meta = match std::fs::symlink_metadata(child_path) {
                        Ok(m) => m,
                        Err(_) => {
                            error_count.fetch_add(1, Ordering::Relaxed);
                            continue;
                        }
                    };
                    let raw_size = Self::file_allocated_size(child_path, &meta).unwrap_or(0);
                    let count_size = match file_identity(child_path, &meta) {
                        Some(id) => sibling_file_ids
                            .lock()
                            .unwrap_or_else(|e| e.into_inner())
                            .insert(id),
                        None => true,
                    };
                    let size = if count_size { raw_size } else { 0 };
                    files_scanned.fetch_add(1, Ordering::Relaxed);
                    bytes_scanned.fetch_add(size, Ordering::Relaxed);
                    map.insert(
                        path_str.clone(),
                        DiskNode {
                            name,
                            path: path_str,
                            size: raw_size,
                            is_dir: false,
                            is_project: kind.is_project,
                            is_workspace: kind.is_workspace,
                            is_git_worktree: kind.is_git_worktree,
                            is_agent_data: kind.is_agent_data,
                            file_count: 0,
                            dir_count: 0,
                            children_loaded: true,
                            children: vec![],
                        },
                    );
                }
            }
            // Instant first paint (files sized, dirs pending) — Mole live_scan style.
            let snap = build_snapshot(&map);
            emit(ScanStatus::Running, Some(root_path_str.clone()), Some(snap));
        }

        std::thread::scope(|scope| {
            for (child_path, is_dir) in entries {
                if !is_dir {
                    continue;
                }
                let cancel = cancel.clone();
                let files_scanned = Arc::clone(&files_scanned);
                let bytes_scanned = Arc::clone(&bytes_scanned);
                let dirs_scanned = Arc::clone(&dirs_scanned);
                let error_count = Arc::clone(&error_count);
                let children_map = Arc::clone(&children_map);
                let du_budget = Arc::clone(&du_budget);
                let emit_progress = on_progress.clone();
                let scan_id = scan_id.to_string();
                let root_path_str = root_path_str.clone();
                let root_name = root_name.clone();
                let child_kind = classify(&child_path);
                let root_kind = root_kind;

                scope.spawn(move || {
                    if cancel
                        .as_ref()
                        .map(|c| c.load(Ordering::Relaxed))
                        .unwrap_or(false)
                    {
                        return;
                    }

                    let name = child_path
                        .file_name()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_else(|| child_path.to_string_lossy().to_string());
                    let path_str = child_path.to_string_lossy().to_string();
                    let is_project = child_kind.is_project;
                    let is_workspace = child_kind.is_workspace;
                    let is_git_worktree = child_kind.is_git_worktree;
                    let is_agent_data = child_kind.is_agent_data;

                    // Prefer system `du` (Mole); fall back to jwalk when du fails.
                    let m = {
                        // Simple semaphore for du concurrency.
                        loop {
                            let cur = du_budget.load(Ordering::Relaxed);
                            if cur == 0 {
                                std::thread::yield_now();
                                if cancel
                                    .as_ref()
                                    .map(|c| c.load(Ordering::Relaxed))
                                    .unwrap_or(false)
                                {
                                    return;
                                }
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
                        let measured = measure_directory(&child_path, cancel.as_ref());
                        du_budget.fetch_add(1, Ordering::SeqCst);
                        measured
                    };

                    files_scanned.fetch_add(m.file_count, Ordering::Relaxed);
                    dirs_scanned.fetch_add(m.dir_count.saturating_add(1), Ordering::Relaxed);
                    error_count.fetch_add(m.error_count, Ordering::Relaxed);
                    bytes_scanned.fetch_add(m.size, Ordering::Relaxed);

                    let node = DiskNode {
                        name,
                        path: path_str.clone(),
                        size: m.size,
                        is_dir: true,
                        is_project,
                        is_workspace,
                        is_git_worktree,
                        is_agent_data,
                        file_count: m.file_count,
                        dir_count: m.dir_count,
                        children_loaded: false,
                        children: vec![],
                    };

                    let snap = {
                        let mut map = children_map.lock().unwrap_or_else(|e| e.into_inner());
                        map.insert(path_str.clone(), node);
                        let mut children: Vec<DiskNode> = map.values().cloned().collect();
                        children
                            .sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.name.cmp(&b.name)));
                        let total_size = bytes_scanned.load(Ordering::Relaxed);
                        let file_count: u64 = children
                            .iter()
                            .map(|c| c.file_count + if c.is_dir { 0 } else { 1 })
                            .sum();
                        let dir_count: u64 = children
                            .iter()
                            .map(|c| if c.is_dir { 1 + c.dir_count } else { 0 })
                            .sum();
                        let mut tree = DiskNode {
                            name: root_name,
                            path: root_path_str.clone(),
                            size: total_size,
                            is_dir: true,
                            is_project: root_kind.is_project,
                            is_workspace: root_kind.is_workspace,
                            is_git_worktree: root_kind.is_git_worktree,
                            is_agent_data: root_kind.is_agent_data,
                            file_count,
                            dir_count,
                            children_loaded: true,
                            children,
                        };
                        prune_tree(&mut tree, max_children);
                        tree
                    };

                    if let Some(cb) = emit_progress.as_ref() {
                        cb(ScanProgress {
                            scan_id: scan_id.clone(),
                            status: ScanStatus::Running,
                            files_scanned: files_scanned.load(Ordering::Relaxed),
                            bytes_scanned: bytes_scanned.load(Ordering::Relaxed),
                            dirs_scanned: dirs_scanned.load(Ordering::Relaxed),
                            error_count: error_count.load(Ordering::Relaxed),
                            current_path: Some(path_str),
                            percent: None,
                            error: None,
                            tree: Some(snap),
                            level_path: Some(root_path_str),
                        });
                    }
                });
            }
        });

        if cancel
            .as_ref()
            .map(|c| c.load(Ordering::Relaxed))
            .unwrap_or(false)
        {
            emit(ScanStatus::Cancelled, None, None);
            return Err(EngineError::FileSystem("Scan cancelled".to_string()));
        }

        let map = children_map
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        // Suggestions from full sibling list before top-N prune.
        let mut tree = DiskNode {
            name: root_name,
            path: root_path_str.clone(),
            size: bytes_scanned.load(Ordering::Relaxed),
            is_dir: true,
            is_project: root_kind.is_project,
            is_workspace: root_kind.is_workspace,
            is_git_worktree: root_kind.is_git_worktree,
            is_agent_data: root_kind.is_agent_data,
            file_count: files_scanned.load(Ordering::Relaxed),
            dir_count: dirs_scanned.load(Ordering::Relaxed),
            children_loaded: true,
            children: map.values().cloned().collect(),
        };
        tree.children
            .sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.name.cmp(&b.name)));
        let suggestions = cleanup_suggestions(&tree);
        prune_tree(&mut tree, max_children);
        cache::put_level(&root, max_children, &tree);

        let stats = ScanStats {
            root_path: root_path_str.clone(),
            total_size: tree.size,
            files_scanned: files_scanned.load(Ordering::Relaxed),
            dirs_scanned: dirs_scanned.load(Ordering::Relaxed),
            error_count: error_count.load(Ordering::Relaxed),
            elapsed_ms: started.elapsed().as_millis() as u64,
        };

        emit(ScanStatus::Completed, None, Some(tree.clone()));
        Ok((tree, stats, suggestions))
    }

    fn file_allocated_size(path: &Path, meta: &std::fs::Metadata) -> Option<u64> {
        #[cfg(windows)]
        {
            let _ = meta;
            windows_allocated_size(path)
        }
        #[cfg(not(windows))]
        {
            let _ = path;
            allocated_size_from_metadata(meta)
        }
    }

    /// Move path to trash, or permanently delete when `permanent` is true.
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

impl Default for DiskAnalyzerEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Size a directory: prefer system `du` (Mole-style, fast + accurate), else jwalk.
fn measure_directory(root: &Path, cancel: Option<&Arc<AtomicBool>>) -> PathMeasure {
    if cancel.map(|c| c.load(Ordering::Relaxed)).unwrap_or(false) {
        return PathMeasure::default();
    }
    if let Some(cached) = cache::get_measure(root) {
        return cached;
    }
    let measure = if let Some(size) = measure_with_du(root) {
        // `du` does not report file/dir counts; keep size accurate (primary UX metric).
        PathMeasure {
            size,
            file_count: 0,
            dir_count: 0,
            error_count: 0,
        }
    } else {
        measure_tree_size_walk(root, cancel)
    };
    cache::put_measure(root, &measure);
    measure
}

/// `du -sk` (macOS: `-skPx`) — same tool Mole uses for directory totals.
fn measure_with_du(path: &Path) -> Option<u64> {
    let mut cmd = Command::new("du");
    // -s summary, -k 1K blocks, -P no follow symlinks
    // macOS BSD: -x stay on one volume (helps avoid firmlink traps)
    #[cfg(target_os = "macos")]
    {
        cmd.args(["-skPx"]);
    }
    #[cfg(not(target_os = "macos"))]
    {
        cmd.args(["-skP"]);
    }
    let output = cmd.arg(path).output().ok()?;
    // BSD du may exit non-zero on permission errors while still printing a total.
    let stdout = String::from_utf8_lossy(&output.stdout);
    let kb = stdout.split_whitespace().next()?.parse::<u64>().ok()?;
    if kb == 0 && !output.status.success() {
        return None;
    }
    Some(kb.saturating_mul(1024))
}

/// Walk `root` only to sum allocated size / counts — does not build a nested tree.
/// Used for concurrent per-child sizing at one directory level.
fn measure_tree_size_walk(root: &Path, cancel: Option<&Arc<AtomicBool>>) -> PathMeasure {
    let mut measure = PathMeasure::default();
    let mut seen_file_ids: HashSet<(u64, u64)> = HashSet::new();
    // Do not filter by device id: APFS firmlinks / data volume edges must still count.
    let walker = WalkDir::new(root)
        .follow_links(false)
        .skip_hidden(false)
        .parallelism(jwalk::Parallelism::RayonDefaultPool {
            busy_timeout: Duration::from_secs(1),
        })
        .process_read_dir(|_depth, _path, _state, children| {
            for entry in children.iter_mut().flatten() {
                if entry.file_type.is_dir() && should_skip_scan_entry(&entry.path()) {
                    entry.read_children_path = None;
                }
            }
            children.retain(|e| e.is_ok());
        });

    for entry in walker {
        if cancel.map(|c| c.load(Ordering::Relaxed)).unwrap_or(false) {
            break;
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => {
                measure.error_count = measure.error_count.saturating_add(1);
                continue;
            }
        };
        let path = entry.path();
        if should_skip_scan_entry(&path) {
            continue;
        }
        let file_type = entry.file_type();
        if file_type.is_dir() {
            measure.dir_count = measure.dir_count.saturating_add(1);
            if let Some(sz) = DiskAnalyzerEngine::allocated_size(&path) {
                measure.size = measure.size.saturating_add(sz);
            }
            continue;
        }
        if file_type.is_symlink() {
            continue;
        }
        let meta = match std::fs::symlink_metadata(&path) {
            Ok(m) => m,
            Err(_) => {
                measure.error_count = measure.error_count.saturating_add(1);
                continue;
            }
        };
        if !meta.is_file() {
            continue;
        }
        let size = DiskAnalyzerEngine::file_allocated_size(&path, &meta).unwrap_or(meta.len());
        let count_size = match file_identity(&path, &meta) {
            Some(id) => seen_file_ids.insert(id),
            None => true,
        };
        measure.file_count = measure.file_count.saturating_add(1);
        if count_size {
            measure.size = measure.size.saturating_add(size);
        }
    }
    measure
}

fn should_skip_scan_entry(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    // Only skip pseudo-fs / mount noise. Never skip:
    // - hidden project dirs (`.next`, `.git`, `.cache`, …)
    // - build artifacts (`node_modules`, `target`, `dist`, …)
    // Those are the high-value cleanup tiles Mole surfaces.
    matches!(
        name.as_str(),
        "dev"
            | "proc"
            | "sys"
            | "system" // /System on macOS — sealed OS image, often hundreds of GB of walk work
            | "volumes" // other mounts / data volume entry points
            | "cores"
            | "network"
            | ".vol"
            | ".nofollow"
            | ".resolve"
            | ".file"
            | "fd"
            | "net"
            | "run"
    ) || name.starts_with(".volumeicon")
        // Time zone / locale data walked under system libraries is pure noise for cleanup.
        || name == "zoneinfo"
        || name == "cldr-data"
}

fn allocated_size_from_metadata(meta: &std::fs::Metadata) -> Option<u64> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let blocks = meta.blocks();
        if blocks > 0 || meta.len() == 0 {
            return Some(blocks.saturating_mul(512));
        }
        Some(meta.len())
    }
    #[cfg(not(unix))]
    {
        let _ = meta;
        None
    }
}

fn file_identity(path: &Path, meta: &std::fs::Metadata) -> Option<(u64, u64)> {
    #[cfg(unix)]
    {
        let _ = path;
        use std::os::unix::fs::MetadataExt;
        Some((meta.dev(), meta.ino()))
    }
    #[cfg(windows)]
    {
        // Avoid unstable `std::os::windows::fs::MetadataExt::{volume_serial_number,file_index}`
        // (`windows_by_handle`); use the stable Win32 handle path instead.
        let _ = meta;
        windows_file_identity(path)
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = (path, meta);
        None
    }
}

/// Open a path for Win32 file-information queries (works for files and directories).
#[cfg(windows)]
fn windows_open_for_info(path: &Path) -> Option<std::fs::File> {
    use std::os::windows::fs::OpenOptionsExt;
    use windows_sys::Win32::Storage::FileSystem::FILE_FLAG_BACKUP_SEMANTICS;

    std::fs::OpenOptions::new()
        .read(true)
        // Allow opening directories; required for allocated-size / identity on folders.
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
        .open(path)
        .ok()
}

#[cfg(windows)]
fn windows_file_identity(path: &Path) -> Option<(u64, u64)> {
    use std::mem::MaybeUninit;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
    };

    let file = windows_open_for_info(path)?;
    let handle = file.as_raw_handle() as windows_sys::Win32::Foundation::HANDLE;
    let mut info = MaybeUninit::<BY_HANDLE_FILE_INFORMATION>::uninit();
    let ok = unsafe { GetFileInformationByHandle(handle, info.as_mut_ptr()) };
    if ok == 0 {
        return None;
    }
    let info = unsafe { info.assume_init() };
    let volume = info.dwVolumeSerialNumber as u64;
    let index = ((info.nFileIndexHigh as u64) << 32) | (info.nFileIndexLow as u64);
    Some((volume, index))
}

#[cfg(windows)]
fn windows_allocated_size(path: &Path) -> Option<u64> {
    use std::mem::MaybeUninit;
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::Storage::FileSystem::{
        FileStandardInfo, GetCompressedFileSizeW, GetFileInformationByHandleEx, FILE_STANDARD_INFO,
        INVALID_FILE_SIZE,
    };

    // Prefer AllocationSize from FILE_STANDARD_INFO (stable Win32; no CreateFileW import).
    if let Some(file) = windows_open_for_info(path) {
        let handle = file.as_raw_handle() as windows_sys::Win32::Foundation::HANDLE;
        let mut info = MaybeUninit::<FILE_STANDARD_INFO>::uninit();
        let ok = unsafe {
            GetFileInformationByHandleEx(
                handle,
                FileStandardInfo,
                info.as_mut_ptr().cast(),
                std::mem::size_of::<FILE_STANDARD_INFO>() as u32,
            )
        };
        if ok != 0 {
            let info = unsafe { info.assume_init() };
            let allocated = info.AllocationSize;
            if allocated >= 0 {
                return Some(allocated as u64);
            }
        }
    }

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut high: u32 = 0;
    let low = unsafe { GetCompressedFileSizeW(wide.as_ptr(), &mut high) };
    if low != INVALID_FILE_SIZE || unsafe { GetLastError() } == 0 {
        return Some(((high as u64) << 32) | (low as u64));
    }

    None
}

/// Keep top `max_children` by size; collapse the rest into `__other__`.
pub fn prune_tree(node: &mut DiskNode, max_children: usize) {
    if node.children.is_empty() {
        return;
    }

    for child in &mut node.children {
        prune_tree(child, max_children);
    }

    // Keep synthetic remainder last when sorting for display.
    node.children.sort_by(|a, b| {
        let a_other = a.name == OTHER_NAME;
        let b_other = b.name == OTHER_NAME;
        if a_other != b_other {
            return a_other.cmp(&b_other);
        }
        b.size.cmp(&a.size).then_with(|| a.name.cmp(&b.name))
    });

    if node.children.len() <= max_children {
        return;
    }

    let rest: Vec<DiskNode> = node.children.drain(max_children..).collect();
    let other_size: u64 = rest.iter().map(|n| n.size).sum();
    let other_files: u64 = rest
        .iter()
        .map(|n| n.file_count + if n.is_dir { 0 } else { 1 })
        .sum();
    let other_dirs: u64 = rest.iter().filter(|n| n.is_dir).count() as u64
        + rest.iter().map(|n| n.dir_count).sum::<u64>();

    node.children.push(DiskNode {
        name: OTHER_NAME.to_string(),
        path: format!("{}/{}", node.path.trim_end_matches('/'), OTHER_NAME),
        size: other_size,
        is_dir: true,
        is_project: false,
        is_workspace: false,
        is_git_worktree: false,
        is_agent_data: false,
        file_count: other_files,
        dir_count: other_dirs,
        children_loaded: true,
        children: vec![],
    });
}

/// Cap structural nesting so the UI only receives current + N-1 child levels.
///
/// `depth` counts this node: `depth == 3` keeps root → children → grandchildren.
/// Directories past the leaf level keep accurate `size` but set
/// `children_loaded = false` so the client can load them on drill-in.
///
/// Overview shells measured with `du` often have `size > 0` but `file_count` /
/// `dir_count` = 0 (du does not report counts). Those must stay
/// `children_loaded = false` so drill-in still spawns `scan_level`.
pub fn limit_tree_depth(node: &mut DiskNode, depth: usize) {
    if !node.is_dir {
        node.children_loaded = true;
        return;
    }
    if node.name == OTHER_NAME {
        node.children.clear();
        node.children_loaded = true;
        return;
    }
    // Intentionally unloaded shell (measure-only overview entry) — keep the flag.
    if !node.children_loaded && node.children.is_empty() {
        return;
    }
    if depth <= 1 {
        let expandable = !node.children.is_empty()
            || node.dir_count > 0
            || node.file_count > 0
            // `du` totals have size without counts; still expandable on drill-in.
            || node.size > 0;
        node.children.clear();
        // Empty leaf dirs stay "loaded"; anything that may have content reloads on drill.
        node.children_loaded = !expandable;
        return;
    }
    for child in &mut node.children {
        limit_tree_depth(child, depth - 1);
    }
    node.children_loaded = true;
}

/// Top-N prune + depth cap applied to every emitted/returned tree.
///
/// When `prune_root` is false (progressive updates), only nested levels are
/// top-N pruned so still-zero root children remain listed until the walk finishes.
pub fn finalize_tree(node: &mut DiskNode, max_children: usize, max_depth: usize, prune_root: bool) {
    let max = max_children.max(1);
    if prune_root {
        prune_tree(node, max);
    } else {
        for child in &mut node.children {
            prune_tree(child, max);
        }
        node.children.sort_by(|a, b| {
            let a_other = a.name == OTHER_NAME;
            let b_other = b.name == OTHER_NAME;
            if a_other != b_other {
                return a_other.cmp(&b_other);
            }
            b.size.cmp(&a.size).then_with(|| a.name.cmp(&b.name))
        });
        node.children_loaded = true;
    }
    limit_tree_depth(node, max_depth.max(1));
}

/// Common cleanup suggestion heuristics from a scanned tree.
///
/// Matches **directory/file basenames** already present in the scan tree
/// (case-insensitive). This is intentionally broad for developer rebuildable
/// artifacts — never source. Safe to delete ≠ auto-delete.
pub fn cleanup_suggestions(tree: &DiskNode) -> Vec<CleanupSuggestion> {
    let mut out = Vec::new();
    collect_suggestions(tree, CLEANUP_HINTS, &mut out);
    // Prefer larger first; de-dupe same path if tree has aliases.
    out.sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.path.cmp(&b.path)));
    out.dedup_by(|a, b| a.path == b.path);
    out.truncate(40);
    out
}

/// Rebuildable / cache basenames across common languages and frameworks.
/// Matched case-insensitively against the node basename only (not full path).
///
/// Intentionally **omits** ultra-generic names that collide with OS or app data
/// when scanning home (`Library`, `Logs`, `bin`, `.env` secrets, etc.).
const CLEANUP_HINTS: &[(&str, &str)] = &[
    // ── JavaScript / TypeScript / Node ──────────────────────────────
    (
        "node_modules",
        "Node.js dependencies (reinstall with npm/pnpm/yarn)",
    ),
    (".npm", "npm cache"),
    (".pnpm-store", "pnpm content-addressable store"),
    (".yarn", "Yarn cache / releases"),
    (".yarn-cache", "Yarn classic cache"),
    ("bower_components", "Bower packages (legacy)"),
    (".next", "Next.js build output"),
    (".nuxt", "Nuxt build output"),
    (".output", "Nuxt/Nitro/framework output"),
    (".vercel", "Vercel build cache"),
    (".turbo", "Turborepo remote/local cache"),
    (".svelte-kit", "SvelteKit build output"),
    (".angular", "Angular CLI cache"),
    (".vite", "Vite prebundle cache"),
    (".webpack", "Webpack cache"),
    (".parcel-cache", "Parcel bundler cache"),
    (".eslintcache", "ESLint cache"),
    (".stylelintcache", "Stylelint cache"),
    (".rpt2_cache", "rollup-plugin-typescript2 cache"),
    (".rts2_cache_cjs", "rollup-plugin-typescript2 CJS cache"),
    (".rts2_cache_es", "rollup-plugin-typescript2 ESM cache"),
    (".rts2_cache_umd", "rollup-plugin-typescript2 UMD cache"),
    ("storybook-static", "Storybook static build"),
    (".storybook-out", "Storybook output"),
    (".docusaurus", "Docusaurus build cache"),
    (".astro", "Astro build cache"),
    (".remix", "Remix build cache"),
    ("coverage", "Test coverage reports"),
    (".nyc_output", "Istanbul/nyc coverage temp"),
    (".jest", "Jest cache"),
    (".vitest", "Vitest cache"),
    (".swc", "SWC compiler cache"),
    ("jspm_packages", "JSPM packages"),
    (".nx", "Nx computation cache"),
    // ── Generic build outputs (project-local names) ─────────────────
    ("dist", "Build distribution output"),
    ("build", "Build output (Gradle/CMake/web/etc.)"),
    ("out", "Compile/export output"),
    ("output", "Generic build output"),
    (".cache", "Tool cache directory"),
    (".tmp", "Temporary build files"),
    (".temp", "Temporary build files"),
    ("tmp", "Temporary files (project-local)"),
    // ── Rust ────────────────────────────────────────────────────────
    ("target", "Rust/Cargo or sbt/Scala build artifacts"),
    // ── Python ──────────────────────────────────────────────────────
    ("__pycache__", "Python bytecode cache"),
    (".pytest_cache", "pytest cache"),
    (".mypy_cache", "mypy type-check cache"),
    (".ruff_cache", "Ruff linter cache"),
    (".tox", "tox virtualenvs"),
    (".nox", "nox virtualenvs"),
    (".venv", "Python virtual environment"),
    ("venv", "Python virtual environment"),
    (".virtualenv", "virtualenv directory"),
    (".pdm-cache", "PDM package cache"),
    (".pdm-build", "PDM build directory"),
    (".ipynb_checkpoints", "Jupyter notebook checkpoints"),
    (".pytype", "pytype cache"),
    (".pyre", "Pyre type-checker cache"),
    ("htmlcov", "coverage.py HTML report"),
    (".hypothesis", "Hypothesis example database"),
    (".eggs", "Python eggs"),
    ("wheels", "Local Python wheel cache"),
    // ── Java / Kotlin / JVM ─────────────────────────────────────────
    (".gradle", "Gradle cache"),
    (".m2", "Maven local repository"),
    (".ivy2", "Ivy dependency cache"),
    ("kotlin-js-store", "Kotlin/JS dependency store"),
    (".kotlin", "Kotlin compiler daemon/cache"),
    // Note: do NOT flag `vendor` — often real project deps (Go/PHP) that are
    // committed or locally patched, not pure regenerable cache.
    // ── C / C++ / CMake ─────────────────────────────────────────────
    ("CMakeFiles", "CMake generated files"),
    ("cmake-build-debug", "CLion/CMake debug build"),
    ("cmake-build-release", "CLion/CMake release build"),
    (
        "cmake-build-relwithdebinfo",
        "CLion/CMake RelWithDebInfo build",
    ),
    ("cmake-build-minsizerel", "CLion/CMake MinSizeRel build"),
    (".cxx", "Android NDK / CMake CXX cache"),
    // ── Apple / iOS / macOS ─────────────────────────────────────────
    ("DerivedData", "Xcode DerivedData"),
    ("Pods", "CocoaPods dependencies"),
    (".build", "SwiftPM / generic dot-build output"),
    ("Carthage", "Carthage checkouts/build"),
    ("xcuserdata", "Xcode per-user data"),
    (".swiftpm", "Swift Package Manager cache"),
    // ── Android ─────────────────────────────────────────────────────
    ("captures", "Android Studio layout captures"),
    (".externalNativeBuild", "Android NDK external build"),
    // ── Flutter / Dart ──────────────────────────────────────────────
    (".dart_tool", "Dart/Flutter tool cache"),
    (".pub-cache", "Pub global package cache"),
    (".pub", "Pub temporary data"),
    ("ephemeral", "Flutter ephemeral generated files"),
    // ── .NET / C# ───────────────────────────────────────────────────
    ("obj", ".NET intermediate build objects"),
    (".nuget", "NuGet package cache"),
    ("TestResults", ".NET / VS test results"),
    // ── PHP ─────────────────────────────────────────────────────────
    (".phpunit.result.cache", "PHPUnit result cache"),
    (".php-cs-fixer.cache", "PHP-CS-Fixer cache"),
    // ── Ruby ────────────────────────────────────────────────────────
    (".bundle", "Bundler cache/config"),
    (".sass-cache", "Sass cache"),
    // ── Elixir / Erlang ─────────────────────────────────────────────
    ("_build", "Mix/Elixir or Dune/OCaml build"),
    ("deps", "Mix dependencies"),
    (".elixir_ls", "ElixirLS cache"),
    ("cover", "Elixir test coverage"),
    // ── Haskell ─────────────────────────────────────────────────────
    (".stack-work", "Stack work directory"),
    ("dist-newstyle", "Cabal new-style build"),
    (".cabal-sandbox", "Cabal sandbox (legacy)"),
    // ── Scala / LSP ─────────────────────────────────────────────────
    (".bloop", "Bloop BSP cache"),
    (".metals", "Metals language server cache"),
    (".bsp", "Build Server Protocol metadata"),
    // ── Zig / Nim / OCaml / Esy ─────────────────────────────────────
    ("zig-cache", "Zig build cache"),
    ("zig-out", "Zig build output"),
    ("nimcache", "Nim compiler cache"),
    ("_esy", "Esy package builds"),
    ("_opam", "opam local switch"),
    (".opam", "opam root / package cache"),
    // ── Terraform / IaC / cloud ─────────────────────────────────────
    (".terraform", "Terraform providers and modules"),
    (".terragrunt-cache", "Terragrunt download cache"),
    (".pulumi", "Pulumi plugins/cache"),
    (".serverless", "Serverless Framework package"),
    (".aws-sam", "AWS SAM build artifacts"),
    (".cdk.staging", "AWS CDK staging"),
    ("cdk.out", "AWS CDK cloud assembly"),
    // ── Containers / VMs (project-local only; still rebuildable) ───
    (".vagrant", "Vagrant machine data"),
    // ── Unity (prefer specific names; avoid bare Library on macOS) ─
    ("MemoryCaptures", "Unity memory captures"),
    // ── Unreal ──────────────────────────────────────────────────────
    ("Intermediate", "Unreal Engine intermediate"),
    ("Binaries", "Unreal Engine binaries"),
    ("DerivedDataCache", "Unreal derived data cache"),
    // ── Bazel / Buck / Pants ────────────────────────────────────────
    ("bazel-bin", "Bazel bin outputs"),
    ("bazel-out", "Bazel output tree"),
    ("bazel-testlogs", "Bazel test logs"),
    (".bazel-cache", "Bazel disk cache"),
    (".pants.d", "Pants build cache"),
    ("buck-out", "Buck build output"),
    // ── DevEnv ──────────────────────────────────────────────────────
    (".direnv", "direnv layout cache"),
    (".devenv", "devenv cache"),
    // ── AI / ML caches (often multi‑GB) ─────────────────────────────
    (".ollama", "Ollama local models"),
    (".huggingface", "Hugging Face hub cache"),
    ("huggingface", "Hugging Face cache"),
    ("transformers_cache", "Transformers model cache"),
    (".torch", "PyTorch hub cache"),
    (".keras", "Keras datasets/models"),
    (".paddlepaddle", "PaddlePaddle cache"),
    // Nested under `.cache` (basename still matches when that folder is a node)
    ("ms-playwright", "Playwright browser binaries"),
    ("puppeteer", "Puppeteer Chromium"),
    ("Cypress", "Cypress binary cache"),
    ("pip", "pip download cache (under .cache)"),
    ("typescript", "TypeScript cache (under .cache)"),
    ("prisma", "Prisma engines cache (under .cache)"),
    // ── Browser automation / e2e ────────────────────────────────────
    (".playwright", "Playwright cache"),
    ("playwright-report", "Playwright HTML report"),
    ("test-results", "E2E/test artifacts"),
    ("allure-results", "Allure raw results"),
    ("allure-report", "Allure HTML report"),
    // ── Docs static generators ──────────────────────────────────────
    ("_site", "Jekyll / static site output"),
    (".vuepress", "VuePress cache/dist"),
    // ── IDE / editor test hosts ─────────────────────────────────────
    (".vscode-test", "VS Code extension test host"),
    (".history", "Local History IDE plugin data"),
    // ── Code agent homes / sessions (often multi‑GB) ───────────────
    (".claude", "Claude Code sessions and project transcripts"),
    (".cursor", "Cursor agent chats, projects, and worktrees"),
    (".codex", "Codex sessions and worktrees"),
    (".copilot", "GitHub Copilot CLI sessions"),
    (".gemini", "Gemini CLI / Antigravity conversations"),
    (".kimi-code", "Kimi Code sessions"),
    (".continue", "Continue agent data"),
    (".codeium", "Codeium / Windsurf data"),
    (".windsurf", "Windsurf agent data"),
    (".aider", "Aider session data"),
];

/// Known code-agent home / session directories under the user home (existing only).
pub fn agent_data_roots(home: &Path) -> Vec<(String, PathBuf)> {
    let mut out = Vec::new();
    let mut push = |label: &str, path: PathBuf| {
        if path.is_dir() {
            out.push((label.to_string(), path));
        }
    };
    push(".claude", home.join(".claude"));
    push(".cursor", home.join(".cursor"));
    push(".codex", home.join(".codex"));
    drop(push);
    if let Ok(codex_home) = std::env::var("CODEX_HOME") {
        let p = PathBuf::from(codex_home.trim());
        if !p.as_os_str().is_empty() {
            let already = out.iter().any(|(_, existing)| {
                std::fs::canonicalize(existing).ok() == std::fs::canonicalize(&p).ok()
                    && std::fs::canonicalize(&p).is_ok()
            });
            if !already && p.is_dir() {
                out.push(("CODEX_HOME".into(), p));
            }
        }
    }
    let mut push = |label: &str, path: PathBuf| {
        if path.is_dir() {
            out.push((label.to_string(), path));
        }
    };
    push(".copilot", home.join(".copilot"));
    push(".gemini", home.join(".gemini"));
    push(".kimi-code", home.join(".kimi-code"));
    push(".continue", home.join(".continue"));
    push(".codeium", home.join(".codeium"));
    push(".windsurf", home.join(".windsurf"));
    push(".aider", home.join(".aider"));
    let app_support = home.join("Library/Application Support");
    push("Cursor", app_support.join("Cursor"));
    push("Claude", app_support.join("Claude"));
    push("Windsurf", app_support.join("Windsurf"));
    push("Codeium", app_support.join("Codeium"));
    out
}

#[derive(Debug, Clone, Serialize)]
pub struct CleanupSuggestion {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub reason: String,
}

fn collect_suggestions(node: &DiskNode, hints: &[(&str, &str)], out: &mut Vec<CleanupSuggestion>) {
    if node.size > 0 {
        let node_name = node.name.as_str();
        // Exact / case-insensitive basename match.
        for (name, reason) in hints {
            // Skip pattern placeholders that aren't real basenames.
            if name.contains('/') || name.contains('*') {
                continue;
            }
            if node_name.eq_ignore_ascii_case(name) {
                out.push(CleanupSuggestion {
                    path: node.path.clone(),
                    name: node.name.clone(),
                    size: node.size,
                    reason: (*reason).to_string(),
                });
                break; // one reason per node
            }
        }
        // Suffix patterns: Python egg-info, TypeScript buildinfo files, etc.
        if node_name.ends_with(".egg-info")
            || node_name.ends_with(".eggs")
            || node_name.ends_with(".tsbuildinfo")
            || node_name.eq_ignore_ascii_case(".DS_Store")
        {
            // Only flag sizable egg-info / tsbuildinfo dirs/files.
            if node_name.ends_with(".egg-info") {
                out.push(CleanupSuggestion {
                    path: node.path.clone(),
                    name: node.name.clone(),
                    size: node.size,
                    reason: "Python package egg-info (rebuildable)".into(),
                });
            } else if node_name.ends_with(".tsbuildinfo") && node.size > 1024 {
                out.push(CleanupSuggestion {
                    path: node.path.clone(),
                    name: node.name.clone(),
                    size: node.size,
                    reason: "TypeScript incremental build info".into(),
                });
            }
        }
    }
    for child in &node.children {
        collect_suggestions(child, hints, out);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    fn write_file(path: &Path, bytes: usize) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut f = fs::File::create(path).unwrap();
        f.write_all(&vec![b'x'; bytes]).unwrap();
    }

    fn tempfile_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("{label}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn scan_aggregates_child_sizes() {
        let root = tempfile_dir("disk-analyzer-agg");
        write_file(&root.join("a.txt"), 1000);
        write_file(&root.join("sub/b.txt"), 2000);
        write_file(&root.join("sub/deep/c.txt"), 3000);

        let engine = DiskAnalyzerEngine::new();
        let (tree, stats, _) = engine
            .scan_path("t1", &root, &DiskScanRoots::default(), Some(40), None, None)
            .expect("scan");

        // Size is authoritative (via `du` or walk); file counts may be 0 when `du` is used.
        assert!(tree.size >= 6000, "size={}", tree.size);
        assert!(stats.files_scanned >= 1, "files={}", stats.files_scanned);
        let sub = tree.children.iter().find(|c| c.name == "sub").expect("sub");
        assert!(sub.size >= 5000, "sub.size={}", sub.size);
        // Level scan: directories are sized but not expanded until drill-in.
        assert!(!sub.children_loaded);
        assert!(sub.children.is_empty());
    }

    #[test]
    fn caches_are_not_skipped_and_projects_marked() {
        let root = tempfile_dir("disk-analyzer-cache");
        write_file(&root.join("node_modules/pkg/index.js"), 4000);
        write_file(&root.join("target/debug/app"), 5000);
        let project = root.join("my-project");
        fs::create_dir_all(&project).unwrap();
        write_file(&project.join("src/main.rs"), 100);

        let engine = DiskAnalyzerEngine::new();
        let (tree, _, _) = engine
            .scan_path(
                "t2",
                &root,
                &DiskScanRoots {
                    project_roots: vec![project.clone()],
                    ..DiskScanRoots::default()
                },
                Some(40),
                None,
                None,
            )
            .expect("scan");

        assert!(tree.children.iter().any(|c| c.name == "node_modules"));
        assert!(tree.children.iter().any(|c| c.name == "target"));
        let proj = tree
            .children
            .iter()
            .find(|c| c.name == "my-project")
            .expect("project");
        assert!(proj.is_project);
    }

    #[cfg(unix)]
    #[test]
    fn hardlinks_counted_once() {
        let root = tempfile_dir("disk-analyzer-hardlink");
        let a = root.join("a.txt");
        let b = root.join("b.txt");
        write_file(&a, 8192);
        std::fs::hard_link(&a, &b).expect("hard link");

        let engine = DiskAnalyzerEngine::new();
        let (tree, stats, _) = engine
            .scan_path("hl", &root, &DiskScanRoots::default(), Some(40), None, None)
            .expect("scan");

        assert_eq!(stats.files_scanned, 2);
        let single = DiskAnalyzerEngine::allocated_size(&a).expect("allocated size");
        assert!(
            tree.size < single.saturating_mul(2),
            "tree.size={} single={}",
            tree.size,
            single
        );
        assert!(tree.size >= single);
    }

    #[test]
    fn suggestions_computed_before_prune() {
        let root = tempfile_dir("disk-analyzer-suggest-prune");
        for i in 0..8 {
            write_file(&root.join(format!("big{i}/data.bin")), 50_000);
        }
        write_file(&root.join("node_modules/pkg/index.js"), 10_000);

        let engine = DiskAnalyzerEngine::new();
        let (tree, _, suggestions) = engine
            .scan_path("sug", &root, &DiskScanRoots::default(), Some(3), None, None)
            .expect("scan");

        assert!(suggestions.iter().any(|s| s.name == "node_modules"));
        assert!(tree.children.iter().any(|c| c.name == OTHER_NAME));
    }

    #[test]
    fn prune_preserves_parent_total() {
        let mut node = DiskNode {
            name: "root".into(),
            path: "/tmp/root".into(),
            size: 100,
            is_dir: true,
            is_project: false,
            is_workspace: false,
            is_git_worktree: false,
            is_agent_data: false,
            file_count: 5,
            dir_count: 5,
            children_loaded: true,
            children: (0..5)
                .map(|i| DiskNode {
                    name: format!("c{i}"),
                    path: format!("/tmp/root/c{i}"),
                    size: 20,
                    is_dir: false,
                    is_project: false,
                    is_workspace: false,
                    is_git_worktree: false,
                    is_agent_data: false,
                    file_count: 0,
                    dir_count: 0,
                    children_loaded: true,
                    children: vec![],
                })
                .collect(),
        };
        prune_tree(&mut node, 2);
        assert_eq!(node.children.len(), 3);
        let other = node.children.iter().find(|c| c.name == OTHER_NAME).unwrap();
        assert_eq!(other.size, 60);
        assert_eq!(node.size, 100);
    }

    #[test]
    fn limit_tree_depth_keeps_three_levels_and_marks_leaves() {
        let mut root = DiskNode {
            name: "root".into(),
            path: "/r".into(),
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
                name: "a".into(),
                path: "/r/a".into(),
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
                    name: "b".into(),
                    path: "/r/a/b".into(),
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
                        name: "c".into(),
                        path: "/r/a/b/c".into(),
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
                            name: "d.txt".into(),
                            path: "/r/a/b/c/d.txt".into(),
                            size: 100,
                            is_dir: false,
                            is_project: false,
                            is_workspace: false,
                            is_git_worktree: false,
                            is_agent_data: false,
                            file_count: 0,
                            dir_count: 0,
                            children_loaded: true,
                            children: vec![],
                        }],
                    }],
                }],
            }],
        };
        limit_tree_depth(&mut root, DEFAULT_TREE_DEPTH);
        // DEFAULT_TREE_DEPTH=2: root → a kept; a is truncated leaf
        assert!(root.children_loaded);
        let a = &root.children[0];
        assert_eq!(a.name, "a");
        assert!(!a.children_loaded);
        assert!(a.children.is_empty());
        assert_eq!(a.size, 100);
    }

    #[test]
    fn limit_tree_depth_preserves_measure_only_shells() {
        // Overview entries measured with `du` have size but zero counts and no children.
        let mut root = DiskNode {
            name: "Atmos".into(),
            path: "atmos://disk-usage".into(),
            size: 45 * 1024 * 1024 * 1024,
            is_dir: true,
            is_project: false,
            is_workspace: false,
            is_git_worktree: false,
            is_agent_data: false,
            file_count: 0,
            dir_count: 0,
            children_loaded: true,
            children: vec![DiskNode {
                name: ".atmos".into(),
                path: "/Users/x/.atmos".into(),
                size: 45 * 1024 * 1024 * 1024,
                is_dir: true,
                is_project: false,
                is_workspace: false,
                is_git_worktree: false,
                is_agent_data: false,
                file_count: 0,
                dir_count: 0,
                children_loaded: false,
                children: vec![],
            }],
        };
        limit_tree_depth(&mut root, DEFAULT_TREE_DEPTH);
        let atmos = &root.children[0];
        assert!(
            !atmos.children_loaded,
            "du shells must stay unloaded so drill-in spawns scan_level"
        );
        assert!(atmos.children.is_empty());
        assert!(atmos.size > 0);
    }

    #[test]
    fn cancel_flag_stops_scan() {
        let root = tempfile_dir("disk-analyzer-cancel");
        for i in 0..200 {
            write_file(&root.join(format!("f{i}.txt")), 10);
        }
        let cancel = Arc::new(AtomicBool::new(true));
        let engine = DiskAnalyzerEngine::new();
        let err = engine
            .scan_path(
                "t3",
                &root,
                &DiskScanRoots::default(),
                Some(40),
                Some(cancel),
                None,
            )
            .expect_err("should cancel");
        assert!(err.to_string().contains("cancelled"));
    }

    #[test]
    fn permanent_delete_removes_file() {
        let root = tempfile_dir("disk-analyzer-del");
        let file = root.join("gone.txt");
        write_file(&file, 32);
        let engine = DiskAnalyzerEngine::new();
        let freed = engine
            .delete_path(&file, true, Some(&root))
            .expect("delete");
        assert!(freed > 0);
        assert!(!file.exists());
    }

    #[test]
    fn delete_outside_scan_root_rejected() {
        let root = tempfile_dir("disk-analyzer-bound");
        let outsider = tempfile_dir("disk-analyzer-outside");
        let file = outsider.join("secret.txt");
        write_file(&file, 16);
        let engine = DiskAnalyzerEngine::new();
        let err = engine
            .delete_path(&file, true, Some(&root))
            .expect_err("must reject outside root");
        assert!(err.to_string().contains("outside scan root"));
        assert!(file.exists());
    }

    #[test]
    fn delete_refuses_filesystem_root() {
        let engine = DiskAnalyzerEngine::new();
        let err = engine
            .delete_path(Path::new("/"), true, None)
            .expect_err("must refuse root");
        assert!(err.to_string().to_lowercase().contains("root"));
    }

    #[test]
    fn trash_delete_does_not_fallback_to_permanent() {
        let missing =
            std::env::temp_dir().join(format!("disk-analyzer-missing-{}", uuid::Uuid::new_v4()));
        let engine = DiskAnalyzerEngine::new();
        let err = engine
            .delete_path(&missing, false, None)
            .expect_err("trash of missing path must fail");
        assert!(
            err.to_string().contains("does not exist") || err.to_string().contains("trash"),
            "unexpected err: {err}"
        );
        assert!(!missing.exists());
    }

    #[test]
    fn cleanup_suggestions_find_node_modules() {
        let tree = DiskNode {
            name: "root".into(),
            path: "/r".into(),
            size: 10,
            is_dir: true,
            is_project: false,
            is_workspace: false,
            is_git_worktree: false,
            is_agent_data: false,
            file_count: 1,
            dir_count: 1,
            children_loaded: true,
            children: vec![
                DiskNode {
                    name: "node_modules".into(),
                    path: "/r/node_modules".into(),
                    size: 9,
                    is_dir: true,
                    is_project: false,
                    is_workspace: false,
                    is_git_worktree: false,
                    is_agent_data: false,
                    file_count: 1,
                    dir_count: 0,
                    children_loaded: false,
                    children: vec![],
                },
                DiskNode {
                    name: ".NEXT".into(),
                    path: "/r/.NEXT".into(),
                    size: 5,
                    is_dir: true,
                    is_project: false,
                    is_workspace: false,
                    is_git_worktree: false,
                    is_agent_data: false,
                    file_count: 0,
                    dir_count: 0,
                    children_loaded: false,
                    children: vec![],
                },
                DiskNode {
                    name: "pkg.egg-info".into(),
                    path: "/r/pkg.egg-info".into(),
                    size: 2,
                    is_dir: true,
                    is_project: false,
                    is_workspace: false,
                    is_git_worktree: false,
                    is_agent_data: false,
                    file_count: 0,
                    dir_count: 0,
                    children_loaded: false,
                    children: vec![],
                },
            ],
        };
        let tips = cleanup_suggestions(&tree);
        assert!(tips.iter().any(|t| t.name == "node_modules"));
        assert!(
            tips.iter().any(|t| t.name.eq_ignore_ascii_case(".next")),
            "case-insensitive framework dirs"
        );
        assert!(tips.iter().any(|t| t.name.ends_with(".egg-info")));
    }

    #[test]
    fn scan_level_matches_scan_path() {
        let root = tempfile_dir("disk-analyzer-level-alias");
        write_file(&root.join("x.txt"), 500);
        let engine = DiskAnalyzerEngine::new();
        let (a, _, _) = engine
            .scan_path("a", &root, &DiskScanRoots::default(), Some(30), None, None)
            .unwrap();
        let (b, _, _) = engine
            .scan_level("b", &root, &DiskScanRoots::default(), Some(30), None, None)
            .unwrap();
        assert_eq!(a.size, b.size);
        assert!(a.children_loaded);
    }

    #[test]
    fn scan_marks_git_worktree_and_agent_data() {
        let root = tempfile_dir("disk-analyzer-kinds");
        let wt = root.join("linked-wt");
        let agent = root.join(".cursor");
        fs::create_dir_all(&wt).unwrap();
        fs::create_dir_all(&agent).unwrap();
        write_file(&wt.join("a.txt"), 100);
        write_file(&agent.join("chat.json"), 100);
        let engine = DiskAnalyzerEngine::new();
        let (tree, _, _) = engine
            .scan_path(
                "k",
                &root,
                &DiskScanRoots {
                    git_worktree_roots: vec![wt],
                    agent_data_roots: vec![agent],
                    ..DiskScanRoots::default()
                },
                Some(40),
                None,
                None,
            )
            .unwrap();
        let wt_node = tree
            .children
            .iter()
            .find(|c| c.name == "linked-wt")
            .expect("worktree child");
        assert!(wt_node.is_git_worktree);
        assert!(!wt_node.is_workspace);
        let agent_node = tree
            .children
            .iter()
            .find(|c| c.name == ".cursor")
            .expect("agent child");
        assert!(agent_node.is_agent_data);
    }

    #[test]
    fn scan_marks_gitdir_file_as_worktree_without_roots() {
        let root = tempfile_dir("disk-analyzer-gitdir");
        let wt = root.join("linked-wt");
        fs::create_dir_all(&wt).unwrap();
        fs::write(wt.join(".git"), "gitdir: /tmp/example.git/worktrees/x").unwrap();
        write_file(&wt.join("a.txt"), 40);
        let engine = DiskAnalyzerEngine::new();
        let (tree, _, _) = engine
            .scan_path("g", &root, &DiskScanRoots::default(), Some(40), None, None)
            .unwrap();
        let wt_node = tree
            .children
            .iter()
            .find(|c| c.name == "linked-wt")
            .expect("worktree child");
        assert!(wt_node.is_git_worktree);
        assert!(!wt_node.is_project);
    }

    #[test]
    fn agent_data_roots_only_existing_dirs() {
        let root = tempfile_dir("disk-analyzer-agent-roots");
        fs::create_dir_all(root.join(".cursor")).unwrap();
        fs::create_dir_all(root.join(".claude")).unwrap();
        let found = agent_data_roots(&root);
        let names: Vec<_> = found.iter().map(|(n, _)| n.as_str()).collect();
        assert!(names.contains(&".cursor"));
        assert!(names.contains(&".claude"));
        assert!(!names.contains(&".codex"));
    }
}
