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
const DEFAULT_MAX_CHILDREN: usize = 40;
const PROGRESS_MIN_INTERVAL: Duration = Duration::from_millis(250);

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
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<DiskNode>,
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
    /// Falls back to logical length when the platform size is unavailable.
    pub fn allocated_size(path: &Path) -> u64 {
        #[cfg(windows)]
        {
            if let Some(size) = windows_allocated_size(path) {
                return size;
            }
        }
        match std::fs::symlink_metadata(path) {
            Ok(meta) => allocated_size_from_metadata(&meta),
            Err(_) => 0,
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

    /// Scan `root` into a pruned visualization tree.
    ///
    /// - Does **not** skip cache directories.
    /// - Does **not** follow directory symlinks.
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

        let root = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
        let started = Instant::now();
        let files_scanned = Arc::new(AtomicU64::new(0));
        let bytes_scanned = Arc::new(AtomicU64::new(0));
        let dirs_scanned = Arc::new(AtomicU64::new(0));
        let error_count = Arc::new(AtomicU64::new(0));
        let last_emit = std::sync::Mutex::new(Instant::now() - PROGRESS_MIN_INTERVAL);

        let emit = |status: ScanStatus, current: Option<String>, error: Option<String>| {
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
                error,
            });
        };

        emit(
            ScanStatus::Running,
            Some(root.to_string_lossy().to_string()),
            None,
        );

        // path -> aggregated allocated size
        let mut sizes: HashMap<PathBuf, u64> = HashMap::new();
        let mut file_counts: HashMap<PathBuf, u64> = HashMap::new();
        let mut dir_counts: HashMap<PathBuf, u64> = HashMap::new();
        let mut dirs: HashSet<PathBuf> = HashSet::new();
        let mut children_map: HashMap<PathBuf, HashSet<PathBuf>> = HashMap::new();

        dirs.insert(root.clone());
        sizes.insert(root.clone(), 0);

        let walker = WalkDir::new(&root)
            .follow_links(false)
            .skip_hidden(false)
            .process_read_dir({
                let error_count = Arc::clone(&error_count);
                move |_depth, _path, _state, children| {
                    // Count unreadable entries here — retained-out Err values never reach the loop.
                    let dropped = children.iter().filter(|e| e.is_err()).count() as u64;
                    if dropped > 0 {
                        error_count.fetch_add(dropped, Ordering::Relaxed);
                    }
                    children.retain(|entry| entry.is_ok());
                }
            });

        // (device/volume, inode/file-index) — skip double-counting hard links.
        let mut seen_file_ids: HashSet<(u64, u64)> = HashSet::new();

        for entry in walker {
            if cancel
                .as_ref()
                .map(|c| c.load(Ordering::Relaxed))
                .unwrap_or(false)
            {
                emit(ScanStatus::Cancelled, None, None);
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
            let file_type = entry.file_type();

            // Register parent → child relationship for tree assembly.
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

                // Directory inode itself occupies blocks.
                let dir_size = Self::allocated_size(&path);
                if dir_size > 0 {
                    add_size_to_ancestors(&mut sizes, &root, &path, dir_size);
                    bytes_scanned.fetch_add(dir_size, Ordering::Relaxed);
                }

                emit(
                    ScanStatus::Running,
                    Some(path.to_string_lossy().to_string()),
                    None,
                );
                continue;
            }

            // Files and non-directory symlinks.
            let meta = match std::fs::symlink_metadata(&path) {
                Ok(m) => m,
                Err(_) => {
                    error_count.fetch_add(1, Ordering::Relaxed);
                    continue;
                }
            };
            #[cfg(windows)]
            let size = windows_allocated_size(&path)
                .unwrap_or_else(|| allocated_size_from_metadata(&meta));
            #[cfg(not(windows))]
            let size = allocated_size_from_metadata(&meta);

            let count_size = match file_identity(&path, &meta) {
                Some(id) => seen_file_ids.insert(id),
                // Identity unavailable: count this path (best-effort).
                None => true,
            };

            files_scanned.fetch_add(1, Ordering::Relaxed);
            if count_size {
                bytes_scanned.fetch_add(size, Ordering::Relaxed);
                add_size_to_ancestors(&mut sizes, &root, &path, size);
            } else {
                // Hard link already counted: keep the path in the tree with zero incremental size.
                sizes.entry(path.clone()).or_insert(0);
            }

            // Count this file against every ancestor directory.
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

            emit(
                ScanStatus::Running,
                Some(path.to_string_lossy().to_string()),
                None,
            );
        }

        // dir_count: number of descendant directories under each dir.
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

        // Suggestions must be computed before prune collapses cache dirs into `__other__`.
        let suggestions = cleanup_suggestions(&tree);

        let max_children = max_children.unwrap_or(DEFAULT_MAX_CHILDREN).max(1);
        prune_tree(&mut tree, max_children);

        let stats = ScanStats {
            root_path: root.to_string_lossy().to_string(),
            total_size: tree.size,
            files_scanned: files_scanned.load(Ordering::Relaxed),
            dirs_scanned: dirs_scanned.load(Ordering::Relaxed),
            error_count: error_count.load(Ordering::Relaxed),
            elapsed_ms: started.elapsed().as_millis() as u64,
        };

        emit(ScanStatus::Completed, None, None);
        Ok((tree, stats, suggestions))
    }

    /// Move path to trash, or permanently delete when `permanent` is true.
    ///
    /// When `allowed_root` is set, the path must canonicalize under that root.
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
            // Best-effort: sum allocated sizes under the directory before delete.
            self.quick_size(&canonical)
        } else {
            Self::allocated_size(&canonical)
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
        for entry in WalkDir::new(root).follow_links(false).skip_hidden(false) {
            let Ok(entry) = entry else {
                continue;
            };
            total = total.saturating_add(Self::allocated_size(&entry.path()));
        }
        total
    }
}

impl Default for DiskAnalyzerEngine {
    fn default() -> Self {
        Self::new()
    }
}

fn allocated_size_from_metadata(meta: &std::fs::Metadata) -> u64 {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let blocks = meta.blocks();
        if blocks > 0 {
            return blocks.saturating_mul(512);
        }
    }
    meta.len()
}

/// Stable file identity for hard-link deduplication across a scan.
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
        // symlink_metadata / FindFirstFile does not populate file index — open by path.
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
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FileStandardInfo, GetFileInformationByHandleEx, FILE_FLAG_BACKUP_SEMANTICS,
        FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, FILE_STANDARD_INFO, OPEN_EXISTING,
    };

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    // BACKUP_SEMANTICS allows opening directories; FILE_SHARE_* keeps scan non-disruptive.
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
    if handle == INVALID_HANDLE_VALUE {
        return None;
    }

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
    if ok == 0 {
        return None;
    }
    let info = unsafe { info.assume_init() };
    // AllocationSize is a LARGE_INTEGER (i64).
    let allocated = info.AllocationSize;
    if allocated < 0 {
        return None;
    }
    Some(allocated as u64)
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
                // Skip if child was only a file path already accounted — still include.
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

    if node.children.len() <= max_children {
        return;
    }

    node.children
        .sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.name.cmp(&b.name)));
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
        children: vec![],
    });
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

        assert!(
            tree.children.iter().any(|c| c.name == "node_modules"),
            "node_modules missing"
        );
        assert!(
            tree.children.iter().any(|c| c.name == "target"),
            "target missing"
        );
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
        // Allocated blocks should be counted once, not twice.
        let single = DiskAnalyzerEngine::allocated_size(&a);
        assert!(
            tree.size < single.saturating_mul(2),
            "tree.size={} single={}",
            tree.size,
            single
        );
        assert!(
            tree.size >= single,
            "tree.size={} single={}",
            tree.size,
            single
        );
    }

    #[test]
    fn suggestions_computed_before_prune() {
        let root = tempfile_dir("disk-analyzer-suggest-prune");
        // Many large siblings so node_modules would collapse into __other__ if pruned first.
        for i in 0..8 {
            write_file(&root.join(format!("big{i}/data.bin")), 50_000);
        }
        write_file(&root.join("node_modules/pkg/index.js"), 10_000);

        let engine = DiskAnalyzerEngine::new();
        let (tree, _, suggestions) = engine
            .scan_path("sug", &root, &[], Some(3), None, None)
            .expect("scan");

        assert!(
            suggestions.iter().any(|s| s.name == "node_modules"),
            "suggestions missing node_modules: {suggestions:?}"
        );
        assert!(
            tree.children.iter().any(|c| c.name == OTHER_NAME),
            "expected prune to create __other__"
        );
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
            children: (0..5)
                .map(|i| DiskNode {
                    name: format!("c{i}"),
                    path: format!("/tmp/root/c{i}"),
                    size: 20,
                    is_dir: false,
                    is_project: false,
                    file_count: 0,
                    dir_count: 0,
                    children: vec![],
                })
                .collect(),
        };
        prune_tree(&mut node, 2);
        assert_eq!(node.children.len(), 3); // 2 + __other__
        let other = node.children.iter().find(|c| c.name == OTHER_NAME).unwrap();
        assert_eq!(other.size, 60);
        assert_eq!(node.size, 100);
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
        // Non-existent path: trash/permanent both fail; ensure no silent "success".
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
            children: vec![DiskNode {
                name: "node_modules".into(),
                path: "/r/node_modules".into(),
                size: 9,
                is_dir: true,
                is_project: false,
                file_count: 1,
                dir_count: 0,
                children: vec![],
            }],
        };
        let tips = cleanup_suggestions(&tree);
        assert_eq!(tips.len(), 1);
        assert_eq!(tips[0].name, "node_modules");
    }

    fn tempfile_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("{label}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }
}
