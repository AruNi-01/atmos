//! Disk usage analyzer — parallel walk, hierarchical size tree, trash/delete.

mod activity;
mod agent_roots;
mod cache;
mod delete;
mod prune;
mod scan;
mod suggestions;
mod types;

pub use agent_roots::agent_data_roots;
pub use cache::{
    clear_all as clear_path_cache, invalidate_path as invalidate_path_cache, CACHE_TTL,
};
pub use prune::{finalize_tree, limit_tree_depth, node_needs_wider_children, prune_tree};
pub use suggestions::{cleanup_suggestions, clear_suggestions, CleanupKind, CleanupSuggestion};
pub use types::{
    DiskAnalyzerEngine, DiskNode, DiskPathKind, DiskScanRoots, DiskVolumeInfo, PathMeasure,
    ProgressCallback, ScanProgress, ScanStats, ScanStatus, DEFAULT_TREE_DEPTH, OTHER_NAME,
};

impl Default for DiskAnalyzerEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

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
        assert!(node_needs_wider_children(&node, 3));
        assert!(node_needs_wider_children(&node, 5));
        assert!(!node_needs_wider_children(&node, 2));
        assert!(!node_needs_wider_children(&node, 1));
    }

    #[test]
    fn complete_directory_does_not_need_wider_children() {
        let node = DiskNode {
            name: "root".into(),
            path: "/tmp/root".into(),
            size: 40,
            is_dir: true,
            is_project: false,
            is_workspace: false,
            is_git_worktree: false,
            is_agent_data: false,
            file_count: 2,
            dir_count: 0,
            children_loaded: true,
            children: (0..2)
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
        assert!(!node_needs_wider_children(&node, 30));
        assert!(!node_needs_wider_children(&node, 100));
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
    fn cleanup_suggestions_skip_bare_build_output_names() {
        let tree = DiskNode {
            name: "root".into(),
            path: "/r".into(),
            size: 20,
            is_dir: true,
            is_project: false,
            is_workspace: false,
            is_git_worktree: false,
            is_agent_data: false,
            file_count: 1,
            dir_count: 5,
            children_loaded: true,
            children: ["dist", "build", "out", "output", "tmp"]
                .into_iter()
                .map(|name| DiskNode {
                    name: name.into(),
                    path: format!("/r/{name}"),
                    size: 4,
                    is_dir: true,
                    is_project: false,
                    is_workspace: false,
                    is_git_worktree: false,
                    is_agent_data: false,
                    file_count: 0,
                    dir_count: 0,
                    children_loaded: false,
                    children: vec![],
                })
                .collect(),
        };
        let tips = cleanup_suggestions(&tree);
        for name in ["dist", "build", "out", "output", "tmp"] {
            assert!(
                tips.iter().all(|t| t.name != name),
                "bare {name} must not be a cleanup hint: {tips:?}"
            );
        }
    }

    fn suggestion_node(name: &str, path: &str, size: u64) -> DiskNode {
        DiskNode {
            name: name.into(),
            path: path.into(),
            size,
            is_dir: true,
            is_project: false,
            is_workspace: false,
            is_git_worktree: false,
            is_agent_data: false,
            file_count: 0,
            dir_count: 0,
            children_loaded: true,
            children: vec![],
        }
    }

    #[test]
    fn clear_suggestions_skips_synthetic_and_project_roots() {
        let mut project = suggestion_node("app", "/proj/app", 80);
        project.is_project = true;
        project.is_git_worktree = true;
        project.children = vec![suggestion_node(
            "node_modules",
            "/proj/app/node_modules",
            70,
        )];

        let mut group = suggestion_node("Git worktrees", "atmos://disk-usage/git-worktrees", 80);
        group.is_git_worktree = true;
        group.children = vec![project.clone()];

        let mut other = suggestion_node("__other__", "/proj/__other__", 9);
        other.children = vec![suggestion_node("target", "/proj/__other__/target", 8)];

        let tree = DiskNode {
            name: "Atmos".into(),
            path: "atmos://disk-usage".into(),
            size: 160,
            is_dir: true,
            is_project: false,
            is_workspace: false,
            is_git_worktree: false,
            is_agent_data: false,
            file_count: 0,
            dir_count: 2,
            children_loaded: true,
            children: vec![group, other],
        };

        let tips = clear_suggestions(&tree);
        assert!(
            tips.iter().all(|t| !t.path.starts_with("atmos://")),
            "synthetic paths must not be suggested: {tips:?}"
        );
        assert!(
            tips.iter().all(|t| t.path != "/proj/app"),
            "project roots must not be suggested: {tips:?}"
        );
        assert!(
            tips.iter().any(|t| t.path == "/proj/app/node_modules"),
            "rebuildable caches under a project should still surface: {tips:?}"
        );
        assert!(
            tips.iter().all(|t| t.name != "__other__"),
            "__other__ itself must not be suggested: {tips:?}"
        );
    }

    #[test]
    fn clear_suggestions_skips_project_root_even_when_hint_named() {
        let mut project = suggestion_node("target", "/proj/target", 80);
        project.is_project = true;
        project.children = vec![suggestion_node(
            "node_modules",
            "/proj/target/node_modules",
            70,
        )];
        let tree = DiskNode {
            name: "root".into(),
            path: "/proj".into(),
            size: 80,
            is_dir: true,
            is_project: false,
            is_workspace: false,
            is_git_worktree: false,
            is_agent_data: false,
            file_count: 0,
            dir_count: 1,
            children_loaded: true,
            children: vec![project],
        };
        let tips = clear_suggestions(&tree);
        assert!(
            tips.iter().all(|t| t.path != "/proj/target"),
            "project root named like a cache must not be suggested: {tips:?}"
        );
        assert!(
            tips.iter().any(|t| t.path == "/proj/target/node_modules"),
            "caches under that project should still surface: {tips:?}"
        );
    }

    #[test]
    fn clear_suggestions_keeps_every_cache_hit() {
        let children = (0..45)
            .map(|i| suggestion_node("node_modules", &format!("/r/p{i}/node_modules"), 8))
            .collect();
        let tree = DiskNode {
            name: "root".into(),
            path: "/r".into(),
            size: 360,
            is_dir: true,
            is_project: false,
            is_workspace: false,
            is_git_worktree: false,
            is_agent_data: false,
            file_count: 0,
            dir_count: 45,
            children_loaded: true,
            children,
        };
        let tips = clear_suggestions(&tree);
        assert_eq!(
            tips.len(),
            45,
            "clear suggest must not cap the list: {tips:?}"
        );
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
        let agent = root.join("agent-sessions");
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
            .find(|c| c.name == "agent-sessions")
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
    fn scan_does_not_mark_submodule_as_worktree() {
        let root = tempfile_dir("disk-analyzer-submodule");
        let sub = root.join("vendor");
        fs::create_dir_all(&sub).unwrap();
        fs::write(sub.join(".git"), "gitdir: ../.git/modules/vendor\n").unwrap();
        write_file(&sub.join("a.txt"), 40);
        let engine = DiskAnalyzerEngine::new();
        let (tree, _, _) = engine
            .scan_path("s", &root, &DiskScanRoots::default(), Some(40), None, None)
            .unwrap();
        let sub_node = tree
            .children
            .iter()
            .find(|c| c.name == "vendor")
            .expect("submodule child");
        assert!(!sub_node.is_git_worktree);
        assert!(!sub_node.is_project);
    }

    #[test]
    fn agent_data_roots_only_existing_dirs() {
        let root = tempfile_dir("disk-analyzer-agent-roots");
        for home in [
            ".cursor",
            ".claude",
            ".grok",
            ".factory",
            ".opencode",
            ".crush",
            ".hermes",
            ".devin",
        ] {
            fs::create_dir_all(root.join(home)).unwrap();
        }
        fs::create_dir_all(root.join(".cursor").join("worktrees").join("feat")).unwrap();
        fs::create_dir_all(root.join("Library/Application Support/Cursor")).unwrap();
        let empty: Vec<_> = agent_data_roots(&root)
            .into_iter()
            .filter(|(_, p)| p.starts_with(&root))
            .collect();
        assert!(
            empty.is_empty(),
            "whole agent homes and worktrees must not be session roots: {empty:?}"
        );

        fs::create_dir_all(root.join(".cursor").join("projects")).unwrap();
        fs::create_dir_all(root.join(".claude").join("projects")).unwrap();
        fs::create_dir_all(root.join(".grok").join("sessions")).unwrap();
        fs::create_dir_all(root.join(".factory").join("sessions")).unwrap();
        fs::create_dir_all(root.join(".local").join("share").join("opencode")).unwrap();
        fs::create_dir_all(root.join(".local").join("share").join("devin").join("cli")).unwrap();
        fs::create_dir_all(
            root.join(".local")
                .join("share")
                .join("amp")
                .join("threads"),
        )
        .unwrap();
        fs::create_dir_all(root.join(".pi").join("agent").join("sessions")).unwrap();
        let found: Vec<_> = agent_data_roots(&root)
            .into_iter()
            .filter(|(_, p)| p.starts_with(&root))
            .collect();
        let names: Vec<_> = found.iter().map(|(n, _)| n.as_str()).collect();
        assert!(names.contains(&"cursor"));
        assert!(names.contains(&"claude"));
        assert!(names.contains(&"grok"));
        assert!(names.contains(&"droid"));
        assert!(names.contains(&"opencode"));
        assert!(names.contains(&"devin"));
        assert!(names.contains(&"amp"));
        assert!(names.contains(&"pi"));
        assert!(!names.iter().any(|n| [
            ".cursor",
            ".claude",
            ".grok",
            ".factory",
            ".opencode",
            ".crush",
            ".hermes",
            ".devin"
        ]
        .contains(n)));
        assert!(!names.contains(&"codex"));
    }
}
