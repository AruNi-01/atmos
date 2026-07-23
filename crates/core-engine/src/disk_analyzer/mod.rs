//! Disk usage analyzer — parallel walk, hierarchical size tree, trash/delete.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use jwalk::WalkDir;
use serde::Serialize;

use crate::error::{EngineError, Result};

const OTHER_NAME: &str = "__other__";
const DEFAULT_MAX_CHILDREN: usize = 30;
/// Structural depth kept in scan results: current root + 2 levels of children.
/// Deeper directories set `children_loaded = false` and load on drill-in.
pub const DEFAULT_TREE_DEPTH: usize = 3;
const PROGRESS_MIN_INTERVAL: Duration = Duration::from_millis(400);
/// How often to rebuild a pruned partial tree while walking (expensive; keep sparse).
const PARTIAL_TREE_INTERVAL: Duration = Duration::from_millis(1200);

/// Hierarchical disk usage node.
#[derive(Debug, Clone, Serialize)]
pub struct DiskNode {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub is_project: bool,
    pub file_count: u64,
    pub dir_count: u64,
    /// When false, children are not expanded for visualization yet.
    #[serde(default = "default_children_loaded")]
    pub children_loaded: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
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

    /// Parallel recursive scan of `root` into a pruned visualization tree.
    ///
    /// - One walk over the tree (multi-threaded via jwalk).
    /// - Global hard-link dedup for the whole scan (same file counted once).
    /// - Does not follow directory symlinks; stays on the root volume/device.
    /// - Marks nodes whose path is in `project_roots` as `is_project`.
    pub fn scan_path(
        &self,
        scan_id: &str,
        root: &Path,
        project_roots: &[PathBuf],
        max_children: Option<usize>,
        cancel: Option<Arc<AtomicBool>>,
        on_progress: Option<ProgressCallback>,
    ) -> Result<(DiskNode, ScanStats, Vec<CleanupSuggestion>)> {
        if !root.exists() {
            return Err(EngineError::FileSystem(format!(
                "Path does not exist: {}",
                root.display()
            )));
        }
        if !root.is_dir() {
            return Err(EngineError::FileSystem(format!(
                "Path is not a directory: {}",
                root.display()
            )));
        }
        // Never walk the entire filesystem root — UI expects a user-scoped tree (home).
        if root.parent().is_none() {
            return Err(EngineError::FileSystem(
                "Refusing to scan filesystem root; use a user directory (e.g. home)".into(),
            ));
        }

        let root = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
        if root.parent().is_none() {
            return Err(EngineError::FileSystem(
                "Refusing to scan filesystem root after canonicalize".into(),
            ));
        }
        let root_device = device_id_for_path(&root);
        let started = Instant::now();
        let max_children = max_children.unwrap_or(DEFAULT_MAX_CHILDREN).max(1);

        let files_scanned = Arc::new(AtomicU64::new(0));
        let bytes_scanned = Arc::new(AtomicU64::new(0));
        let dirs_scanned = Arc::new(AtomicU64::new(0));
        let error_count = Arc::new(AtomicU64::new(0));
        let last_emit = std::sync::Mutex::new(Instant::now() - PROGRESS_MIN_INTERVAL);
        let last_tree_emit = std::sync::Mutex::new(Instant::now() - PARTIAL_TREE_INTERVAL);

        let root_path_str = root.to_string_lossy().to_string();

        let emit = |status: ScanStatus,
                    current: Option<String>,
                    error: Option<String>,
                    tree: Option<DiskNode>| {
            let Some(cb) = on_progress.as_ref() else {
                return;
            };
            let now = Instant::now();
            if status == ScanStatus::Running {
                let mut guard = last_emit.lock().unwrap_or_else(|e| e.into_inner());
                if tree.is_none() && now.duration_since(*guard) < PROGRESS_MIN_INTERVAL {
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
                error,
                tree,
                level_path: Some(root_path_str.clone()),
            });
        };

        emit(
            ScanStatus::Running,
            Some(root_path_str.clone()),
            None,
            None,
        );

        let mut sizes: HashMap<PathBuf, u64> = HashMap::new();
        let mut file_counts: HashMap<PathBuf, u64> = HashMap::new();
        let mut dir_counts: HashMap<PathBuf, u64> = HashMap::new();
        let mut dirs: HashSet<PathBuf> = HashSet::new();
        let mut children_map: HashMap<PathBuf, HashSet<PathBuf>> = HashMap::new();
        // Global hard-link identity for this scan.
        let mut seen_file_ids: HashSet<(u64, u64)> = HashSet::new();

        dirs.insert(root.clone());
        sizes.insert(root.clone(), 0);

        // Pre-seed immediate children of the scan root so progressive UI shows
        // Library / own_space / … immediately (size grows as the walk continues).
        // Without this, Top-N prune mid-scan collapses still-zero dirs into `__other__`
        // and large folders disappear until late in the scan.
        if let Ok(entries) = std::fs::read_dir(&root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if should_skip_scan_entry(&path) {
                    continue;
                }
                let Ok(ft) = entry.file_type() else {
                    continue;
                };
                children_map
                    .entry(root.clone())
                    .or_default()
                    .insert(path.clone());
                if ft.is_dir() {
                    dirs.insert(path.clone());
                    sizes.entry(path).or_insert(0);
                    dirs_scanned.fetch_add(1, Ordering::Relaxed);
                } else if ft.is_file() {
                    sizes.entry(path).or_insert(0);
                }
            }
        }

        let walker = WalkDir::new(&root)
            .follow_links(false)
            .skip_hidden(false)
            .parallelism(jwalk::Parallelism::RayonDefaultPool {
                busy_timeout: Duration::from_secs(1),
            })
            .process_read_dir({
                let error_count = Arc::clone(&error_count);
                let root_device = root_device;
                move |_depth, _path, _state, children| {
                    let dropped = children.iter().filter(|e| e.is_err()).count() as u64;
                    if dropped > 0 {
                        error_count.fetch_add(dropped, Ordering::Relaxed);
                    }
                    for entry in children.iter_mut().flatten() {
                        if entry.file_type.is_dir() {
                            if should_skip_scan_entry(&entry.path()) {
                                entry.read_children_path = None;
                                continue;
                            }
                            // Stay on the same volume/device as the scan root.
                            if let Some(root_dev) = root_device {
                                if let Ok(meta) = std::fs::symlink_metadata(entry.path()) {
                                    if device_id_from_meta(&meta) != Some(root_dev) {
                                        entry.read_children_path = None;
                                    }
                                }
                            }
                        }
                    }
                    children.retain(|entry| entry.is_ok());
                }
            });

        for entry in walker {
            if cancel
                .as_ref()
                .map(|c| c.load(Ordering::Relaxed))
                .unwrap_or(false)
            {
                emit(ScanStatus::Cancelled, None, None, None);
                return Err(EngineError::FileSystem("Scan cancelled".to_string()));
            }

            let entry = match entry {
                Ok(e) => e,
                Err(_) => {
                    error_count.fetch_add(1, Ordering::Relaxed);
                    continue;
                }
            };

            let path = entry.path();
            if should_skip_scan_entry(&path) {
                continue;
            }

            let file_type = entry.file_type();

            if let Some(parent) = path.parent() {
                if parent.starts_with(&root) || parent == root {
                    children_map
                        .entry(parent.to_path_buf())
                        .or_default()
                        .insert(path.clone());
                }
            }

            if file_type.is_dir() {
                dirs.insert(path.clone());
                sizes.entry(path.clone()).or_insert(0);
                dirs_scanned.fetch_add(1, Ordering::Relaxed);

                if let Some(dir_size) = Self::allocated_size(&path) {
                    if dir_size > 0 {
                        add_size_to_ancestors(&mut sizes, &root, &path, dir_size);
                        bytes_scanned.fetch_add(dir_size, Ordering::Relaxed);
                    }
                }

                maybe_emit_partial(
                    &emit,
                    &last_tree_emit,
                    &root,
                    &sizes,
                    &file_counts,
                    &dir_counts,
                    &dirs,
                    &children_map,
                    project_roots,
                    max_children,
                    &path,
                );
                continue;
            }

            let meta = match std::fs::symlink_metadata(&path) {
                Ok(m) => m,
                Err(_) => {
                    error_count.fetch_add(1, Ordering::Relaxed);
                    continue;
                }
            };

            #[cfg(windows)]
            let allocated = windows_allocated_size(&path);
            #[cfg(not(windows))]
            let allocated = allocated_size_from_metadata(&meta);

            let size = match allocated {
                Some(s) => s,
                None => {
                    error_count.fetch_add(1, Ordering::Relaxed);
                    continue;
                }
            };

            let count_size = match file_identity(&path, &meta) {
                Some(id) => seen_file_ids.insert(id),
                None => true,
            };

            files_scanned.fetch_add(1, Ordering::Relaxed);
            if count_size {
                bytes_scanned.fetch_add(size, Ordering::Relaxed);
                add_size_to_ancestors(&mut sizes, &root, &path, size);
            } else {
                sizes.entry(path.clone()).or_insert(0);
            }

            let mut cursor = path.clone();
            while let Some(parent) = cursor.parent().map(Path::to_path_buf) {
                if !parent.starts_with(&root) && parent != root {
                    break;
                }
                *file_counts.entry(parent.clone()).or_default() += 1;
                if parent == root {
                    break;
                }
                cursor = parent;
            }

            maybe_emit_partial(
                &emit,
                &last_tree_emit,
                &root,
                &sizes,
                &file_counts,
                &dir_counts,
                &dirs,
                &children_map,
                project_roots,
                max_children,
                &path,
            );
        }

        for dir in &dirs {
            let mut cursor = dir.clone();
            while let Some(parent) = cursor.parent().map(Path::to_path_buf) {
                if !parent.starts_with(&root) && parent != root {
                    break;
                }
                if &parent != dir {
                    *dir_counts.entry(parent.clone()).or_default() += 1;
                }
                if parent == root {
                    break;
                }
                cursor = parent;
            }
        }

        let project_set: HashSet<PathBuf> = project_roots
            .iter()
            .filter_map(|p| std::fs::canonicalize(p).ok().or_else(|| Some(p.clone())))
            .collect();

        let mut tree = build_tree(
            &root,
            &sizes,
            &file_counts,
            &dir_counts,
            &dirs,
            &children_map,
            &project_set,
        );

        let suggestions = cleanup_suggestions(&tree);
        // Final result: full top-N prune at every level.
        finalize_tree(&mut tree, max_children, DEFAULT_TREE_DEPTH, true);

        let stats = ScanStats {
            root_path: root.to_string_lossy().to_string(),
            total_size: tree.size,
            files_scanned: files_scanned.load(Ordering::Relaxed),
            dirs_scanned: dirs_scanned.load(Ordering::Relaxed),
            error_count: error_count.load(Ordering::Relaxed),
            elapsed_ms: started.elapsed().as_millis() as u64,
        };

        emit(
            ScanStatus::Completed,
            None,
            None,
            Some(tree.clone()),
        );
        Ok((tree, stats, suggestions))
    }

    /// Scan a path for UI consumption (same as [`scan_path`]; full parallel walk).
    pub fn scan_level(
        &self,
        scan_id: &str,
        path: &Path,
        project_roots: &[PathBuf],
        max_children: Option<usize>,
        cancel: Option<Arc<AtomicBool>>,
        on_progress: Option<ProgressCallback>,
    ) -> Result<(DiskNode, ScanStats, Vec<CleanupSuggestion>)> {
        self.scan_path(
            scan_id,
            path,
            project_roots,
            max_children,
            cancel,
            on_progress,
        )
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

#[allow(clippy::too_many_arguments)]
fn maybe_emit_partial(
    emit: &impl Fn(ScanStatus, Option<String>, Option<String>, Option<DiskNode>),
    last_tree_emit: &std::sync::Mutex<Instant>,
    root: &Path,
    sizes: &HashMap<PathBuf, u64>,
    file_counts: &HashMap<PathBuf, u64>,
    dir_counts: &HashMap<PathBuf, u64>,
    dirs: &HashSet<PathBuf>,
    children_map: &HashMap<PathBuf, HashSet<PathBuf>>,
    project_roots: &[PathBuf],
    max_children: usize,
    current: &Path,
) {
    let now = Instant::now();
    {
        let mut guard = last_tree_emit.lock().unwrap_or_else(|e| e.into_inner());
        if now.duration_since(*guard) < PARTIAL_TREE_INTERVAL {
            emit(
                ScanStatus::Running,
                Some(current.to_string_lossy().to_string()),
                None,
                None,
            );
            return;
        }
        *guard = now;
    }

    let project_set: HashSet<PathBuf> = project_roots
        .iter()
        .filter_map(|p| std::fs::canonicalize(p).ok().or_else(|| Some(p.clone())))
        .collect();
    let mut tree = build_tree(
        root,
        sizes,
        file_counts,
        dir_counts,
        dirs,
        children_map,
        &project_set,
    );
    // Progressive: do not top-N-prune the scan root — zero-size siblings (still
    // being walked) must stay visible so Library/own_space are not collapsed away.
    finalize_tree(&mut tree, max_children, DEFAULT_TREE_DEPTH, false);
    emit(
        ScanStatus::Running,
        Some(current.to_string_lossy().to_string()),
        None,
        Some(tree),
    );
}

fn should_skip_scan_entry(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    // Pseudo-fs, firmlink noise, and sealed system volume (huge + low cleanup value).
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

fn device_id_for_path(path: &Path) -> Option<u64> {
    let meta = std::fs::symlink_metadata(path).ok()?;
    device_id_from_meta(&meta)
}

fn device_id_from_meta(meta: &std::fs::Metadata) -> Option<u64> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Some(meta.dev())
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        meta.volume_serial_number().map(|v| v as u64)
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = meta;
        None
    }
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
        let _ = meta;
        let opened = std::fs::metadata(path).ok()?;
        use std::os::windows::fs::MetadataExt;
        let volume = opened.volume_serial_number()? as u64;
        let index = opened.file_index()?;
        Some((volume, index))
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = (path, meta);
        None
    }
}

#[cfg(windows)]
fn windows_allocated_size(path: &Path) -> Option<u64> {
    use std::mem::MaybeUninit;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FileStandardInfo, GetCompressedFileSizeW, GetFileInformationByHandleEx,
        FILE_FLAG_BACKUP_SEMANTICS, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
        FILE_STANDARD_INFO, INVALID_FILE_SIZE, OPEN_EXISTING,
    };

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let handle = unsafe {
        CreateFileW(
            wide.as_ptr(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            std::ptr::null_mut(),
        )
    };
    if handle != INVALID_HANDLE_VALUE {
        let mut info = MaybeUninit::<FILE_STANDARD_INFO>::uninit();
        let ok = unsafe {
            GetFileInformationByHandleEx(
                handle,
                FileStandardInfo,
                info.as_mut_ptr().cast(),
                std::mem::size_of::<FILE_STANDARD_INFO>() as u32,
            )
        };
        unsafe {
            CloseHandle(handle);
        }
        if ok != 0 {
            let info = unsafe { info.assume_init() };
            let allocated = info.AllocationSize;
            if allocated >= 0 {
                return Some(allocated as u64);
            }
        }
    }

    let mut high: u32 = 0;
    let low = unsafe { GetCompressedFileSizeW(wide.as_ptr(), &mut high) };
    if low != INVALID_FILE_SIZE || unsafe { GetLastError() } == 0 {
        return Some(((high as u64) << 32) | (low as u64));
    }

    None
}

fn add_size_to_ancestors(sizes: &mut HashMap<PathBuf, u64>, root: &Path, path: &Path, size: u64) {
    let mut cursor = path.to_path_buf();
    loop {
        *sizes.entry(cursor.clone()).or_default() += size;
        if cursor == root {
            break;
        }
        match cursor.parent() {
            Some(parent) => {
                if !parent.starts_with(root) && parent != root {
                    break;
                }
                cursor = parent.to_path_buf();
            }
            None => break,
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn build_tree(
    path: &Path,
    sizes: &HashMap<PathBuf, u64>,
    file_counts: &HashMap<PathBuf, u64>,
    dir_counts: &HashMap<PathBuf, u64>,
    dirs: &HashSet<PathBuf>,
    children_map: &HashMap<PathBuf, HashSet<PathBuf>>,
    project_set: &HashSet<PathBuf>,
) -> DiskNode {
    let is_dir = dirs.contains(path);
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());

    let mut children = Vec::new();
    if is_dir {
        if let Some(kids) = children_map.get(path) {
            let mut sorted: Vec<_> = kids.iter().collect();
            sorted.sort_by_key(|p| p.to_string_lossy().to_lowercase());
            for child in sorted {
                children.push(build_tree(
                    child,
                    sizes,
                    file_counts,
                    dir_counts,
                    dirs,
                    children_map,
                    project_set,
                ));
            }
        }
    }

    DiskNode {
        name,
        path: path.to_string_lossy().to_string(),
        size: *sizes.get(path).unwrap_or(&0),
        is_dir,
        is_project: project_set.contains(path),
        file_count: *file_counts.get(path).unwrap_or(&0),
        dir_count: *dir_counts.get(path).unwrap_or(&0),
        children_loaded: true,
        children,
    }
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
    if depth <= 1 {
        let expandable = !node.children.is_empty() || node.dir_count > 0 || node.file_count > 0;
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
pub fn cleanup_suggestions(tree: &DiskNode) -> Vec<CleanupSuggestion> {
    const HINTS: &[(&str, &str)] = &[
        ("node_modules", "Node.js package cache"),
        ("target", "Rust/Cargo build artifacts"),
        (".next", "Next.js build output"),
        ("dist", "Build distribution output"),
        ("__pycache__", "Python bytecode cache"),
        (".cache", "Generic tool cache"),
        ("DerivedData", "Xcode derived data"),
    ];

    let mut out = Vec::new();
    collect_suggestions(tree, HINTS, &mut out);
    out.sort_by_key(|b| std::cmp::Reverse(b.size));
    out.truncate(20);
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
    for (name, reason) in hints {
        if node.name == *name && node.size > 0 {
            out.push(CleanupSuggestion {
                path: node.path.clone(),
                name: node.name.clone(),
                size: node.size,
                reason: (*reason).to_string(),
            });
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
            .scan_path("t1", &root, &[], Some(40), None, None)
            .expect("scan");

        assert!(tree.size >= 6000, "size={}", tree.size);
        assert_eq!(stats.files_scanned, 3);
        let sub = tree.children.iter().find(|c| c.name == "sub").expect("sub");
        assert!(sub.size >= 5000, "sub.size={}", sub.size);
        assert!(sub.children_loaded);
        assert!(sub.children.iter().any(|c| c.name == "deep"));
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
                std::slice::from_ref(&project),
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
            .scan_path("hl", &root, &[], Some(40), None, None)
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
            .scan_path("sug", &root, &[], Some(3), None, None)
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
            file_count: 1,
            dir_count: 1,
            children_loaded: true,
            children: vec![DiskNode {
                name: "a".into(),
                path: "/r/a".into(),
                size: 100,
                is_dir: true,
                is_project: false,
                file_count: 1,
                dir_count: 1,
                children_loaded: true,
                children: vec![DiskNode {
                    name: "b".into(),
                    path: "/r/a/b".into(),
                    size: 100,
                    is_dir: true,
                    is_project: false,
                    file_count: 1,
                    dir_count: 1,
                    children_loaded: true,
                    children: vec![DiskNode {
                        name: "c".into(),
                        path: "/r/a/b/c".into(),
                        size: 100,
                        is_dir: true,
                        is_project: false,
                        file_count: 1,
                        dir_count: 0,
                        children_loaded: true,
                        children: vec![DiskNode {
                            name: "d.txt".into(),
                            path: "/r/a/b/c/d.txt".into(),
                            size: 100,
                            is_dir: false,
                            is_project: false,
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
        // root → a → b kept; c stripped
        assert!(root.children_loaded);
        let a = &root.children[0];
        assert!(a.children_loaded);
        let b = &a.children[0];
        assert_eq!(b.name, "b");
        assert!(!b.children_loaded);
        assert!(b.children.is_empty());
        // size preserved on truncated leaf
        assert_eq!(b.size, 100);
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
            .scan_path("t3", &root, &[], Some(40), Some(cancel), None)
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
            file_count: 1,
            dir_count: 1,
            children_loaded: true,
            children: vec![DiskNode {
                name: "node_modules".into(),
                path: "/r/node_modules".into(),
                size: 9,
                is_dir: true,
                is_project: false,
                file_count: 1,
                dir_count: 0,
                children_loaded: false,
                children: vec![],
            }],
        };
        let tips = cleanup_suggestions(&tree);
        assert_eq!(tips.len(), 1);
        assert_eq!(tips[0].name, "node_modules");
    }

    #[test]
    fn scan_level_matches_scan_path() {
        let root = tempfile_dir("disk-analyzer-level-alias");
        write_file(&root.join("x.txt"), 500);
        let engine = DiskAnalyzerEngine::new();
        let (a, _, _) = engine
            .scan_path("a", &root, &[], Some(30), None, None)
            .unwrap();
        let (b, _, _) = engine
            .scan_level("b", &root, &[], Some(30), None, None)
            .unwrap();
        assert_eq!(a.size, b.size);
        assert!(a.children_loaded);
    }
}
