//! Public types and badge classification for the disk analyzer.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};

pub const OTHER_NAME: &str = "__other__";
/// Structural depth kept in multi-level trees (legacy finalize). Level scans return depth 1.
pub const DEFAULT_TREE_DEPTH: usize = 2;
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
    /// Mainstream code-agent session / transcript directory.
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
        if matches(&roots.git_worktree_roots) || crate::git::is_linked_worktree(path) {
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

pub(super) fn canon_path_set(paths: &[PathBuf]) -> HashSet<PathBuf> {
    paths
        .iter()
        .map(|p| std::fs::canonicalize(p).unwrap_or_else(|_| p.clone()))
        .collect()
}

pub struct DiskAnalyzerEngine;
