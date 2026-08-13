//! Top-N prune and depth capping for emitted trees.

use super::types::{DiskNode, OTHER_NAME};

/// True when this node was top-N pruned below `max_children` (`__other__` holds the rest).
/// A wider `get_tree` must re-walk instead of returning the pruned snapshot.
pub fn node_needs_wider_children(node: &DiskNode, max_children: usize) -> bool {
    let max = max_children.max(1);
    let real = node
        .children
        .iter()
        .filter(|child| child.name != OTHER_NAME)
        .count();
    let has_other = node.children.iter().any(|child| child.name == OTHER_NAME);
    has_other && real < max
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
