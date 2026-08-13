//! Level scan, path measure, and allocated-size helpers.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use jwalk::WalkDir;

use crate::error::{EngineError, Result};

use super::cache;
use super::prune_tree;
use super::types::{
    canon_path_set, DiskAnalyzerEngine, DiskNode, DiskPathKind, DiskScanRoots, DiskVolumeInfo,
    PathMeasure, ProgressCallback, ScanProgress, ScanStats, ScanStatus,
};
use super::{cleanup_suggestions, CleanupSuggestion};

pub(super) const DEFAULT_MAX_CHILDREN: usize = 30;
const PROGRESS_MIN_INTERVAL: Duration = Duration::from_millis(200);

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
            } else if worktree_set.contains(&p) || crate::git::is_linked_worktree(&p) {
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

pub(super) fn file_identity(path: &Path, meta: &std::fs::Metadata) -> Option<(u64, u64)> {
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
