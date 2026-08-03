//! Process-tree helpers for Local Services stop escalation.
//!
//! Safety model:
//! - Never recommend or accept pid <= 1, tmux, or the Atmos API process as a stop root.
//! - Tree stop is an explicit user action; this module only builds candidates.

use std::path::{Path, PathBuf};

use core_engine::{orphan_hints, ProcessSnapshot};

use super::classification::{command_preview, display_path};

const MAX_CHAIN_DEPTH: usize = 16;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ProcessTreeNode {
    pub pid: u32,
    pub ppid: Option<u32>,
    pub pgid: Option<u32>,
    pub command_preview: String,
    pub cwd_display: Option<String>,
    pub is_listener: bool,
    pub stop_candidate: bool,
    pub protected: bool,
}

#[derive(Debug, Clone)]
pub(super) struct ProcessTreePlan {
    pub nodes: Vec<ProcessTreeNode>,
    pub orphan_hints: Vec<String>,
    pub recommended_root_pid: Option<u32>,
}

/// Build a UI-ready process tree plan from an ancestor chain (listener first).
pub(super) fn build_process_tree_plan(
    chain: &[ProcessSnapshot],
    listener_pid: u32,
    workspace_root: Option<&Path>,
    current_user: Option<&str>,
) -> ProcessTreePlan {
    let mut nodes = Vec::new();
    let mut hints = Vec::new();

    if let Some(listener) = chain.first() {
        hints.extend(orphan_hints(listener));
    }

    for snap in chain.iter().take(MAX_CHAIN_DEPTH) {
        let protected = is_protected_snapshot(snap);
        let same_user = match (current_user, snap.user_id.as_deref()) {
            (Some(expected), Some(actual)) => expected == actual,
            _ => true,
        };
        let under_workspace = workspace_root
            .zip(snap.cwd.as_deref())
            .is_some_and(|(root, cwd)| path_contains(root, cwd));
        let stop_candidate = !protected
            && snap.pid > 1
            && same_user
            && (is_reasonable_stop_root(snap) || under_workspace);

        nodes.push(ProcessTreeNode {
            pid: snap.pid,
            ppid: snap.ppid,
            pgid: snap.pgid,
            command_preview: command_preview(&snap.command_line)
                .unwrap_or_else(|| snap.process_name.clone().unwrap_or_else(|| "?".into())),
            cwd_display: snap.cwd.as_deref().map(display_path),
            is_listener: snap.pid == listener_pid,
            stop_candidate,
            protected,
        });
    }

    // Highest (furthest ancestor) stop candidate that is still safe.
    let recommended_root_pid = nodes
        .iter()
        .rev()
        .find(|node| node.stop_candidate && !node.protected && node.pid > 1)
        .map(|node| node.pid);

    ProcessTreePlan {
        nodes,
        orphan_hints: unique_preserve(hints),
        recommended_root_pid,
    }
}

pub(super) fn is_safe_tree_root(
    plan: &ProcessTreePlan,
    root_pid: u32,
    listener_pid: u32,
) -> bool {
    if root_pid <= 1 || root_pid == std::process::id() {
        return false;
    }
    if let Some(node) = plan.nodes.iter().find(|n| n.pid == root_pid) {
        return !node.protected && node.stop_candidate && node.pid > 1;
    }
    // If the ancestor walk failed (empty plan), allow only the current listener
    // itself when it is the requested root — never an out-of-band parent.
    plan.nodes.is_empty() && root_pid == listener_pid
}

fn is_protected_snapshot(snap: &ProcessSnapshot) -> bool {
    if snap.pid <= 1 || snap.pid == std::process::id() {
        return true;
    }
    let name = snap
        .process_name
        .as_deref()
        .or_else(|| {
            snap.command_line.first().and_then(|cmd| {
                Path::new(cmd)
                    .file_name()
                    .and_then(|v| v.to_str())
            })
        })
        .unwrap_or("")
        .to_ascii_lowercase();

    matches!(
        name.as_str(),
        "tmux"
            | "launchd"
            | "systemd"
            | "init"
            | "kernel_task"
            | "system"
            | "wininit.exe"
            | "services.exe"
            | "csrss.exe"
            | "smss.exe"
    ) || name.contains("atmos-server")
        || name == "atmos"
}

fn is_reasonable_stop_root(snap: &ProcessSnapshot) -> bool {
    let tokens: Vec<String> = snap
        .command_line
        .iter()
        .filter_map(|token| {
            Path::new(token)
                .file_name()
                .map(|v| v.to_string_lossy().to_ascii_lowercase())
        })
        .collect();
    if tokens.is_empty() {
        if let Some(name) = snap.process_name.as_deref() {
            return is_launcher_name(&name.to_ascii_lowercase());
        }
        return false;
    }

    let has_launcher = tokens.iter().any(|t| is_launcher_name(t));
    let has_dev_arg = snap
        .command_line
        .iter()
        .any(|t| matches!(t.as_str(), "dev" | "start" | "serve" | "preview"));
    has_launcher || (tokens.iter().any(|t| t == "node" || t == "python") && has_dev_arg)
}

fn is_launcher_name(name: &str) -> bool {
    matches!(
        name,
        "just"
            | "make"
            | "npm"
            | "pnpm"
            | "yarn"
            | "bun"
            | "npx"
            | "node"
            | "next"
            | "next-server"
            | "vite"
            | "webpack"
            | "astro"
            | "nuxt"
            | "cargo"
            | "go"
            | "python"
            | "uvicorn"
            | "flask"
            | "django"
            | "rails"
            | "puma"
            | "gradle"
            | "mvn"
            | "deno"
    )
}

fn path_contains(root: &Path, evidence: &Path) -> bool {
    let root = canonical_or_original(root);
    let evidence = canonical_or_original(evidence);
    evidence == root || evidence.starts_with(&root)
}

fn canonical_or_original(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn unique_preserve(items: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    for item in items {
        if !out.contains(&item) {
            out.push(item);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_engine::ProcessSnapshot;
    use std::path::PathBuf;

    fn snap(
        pid: u32,
        ppid: Option<u32>,
        name: &str,
        cmd: &[&str],
        cwd: Option<&str>,
    ) -> ProcessSnapshot {
        ProcessSnapshot {
            pid,
            ppid,
            pgid: Some(pid),
            process_name: Some(name.into()),
            command_line: cmd.iter().map(|s| (*s).to_string()).collect(),
            cwd: cwd.map(PathBuf::from),
            user_id: Some("dev".into()),
            tty: Some("??".into()),
        }
    }

    #[test]
    fn recommends_just_over_listener_for_next_stack() {
        let chain = vec![
            snap(
                300,
                Some(200),
                "next-server",
                &["next-server"],
                Some("/repo/apps/web"),
            ),
            snap(200, Some(100), "node", &["node", "next", "dev"], Some("/repo")),
            snap(100, Some(50), "just", &["just", "dev-web"], Some("/repo")),
            snap(50, Some(1), "zsh", &["-zsh"], Some("/Users/dev")),
        ];
        let plan = build_process_tree_plan(&chain, 300, Some(Path::new("/repo")), Some("dev"));
        assert_eq!(plan.recommended_root_pid, Some(100));
        assert!(plan.orphan_hints.iter().any(|h| h == "no_tty"));
        let just = plan.nodes.iter().find(|n| n.pid == 100).unwrap();
        assert!(just.stop_candidate);
        assert!(!just.protected);
        let zsh = plan.nodes.iter().find(|n| n.pid == 50).unwrap();
        // bare shell is not a launcher; not recommended even if under home
        assert!(!zsh.stop_candidate || plan.recommended_root_pid != Some(50));
    }

    #[test]
    fn never_recommends_pid_one_or_tmux() {
        let chain = vec![
            snap(10, Some(2), "node", &["node", "server.js"], Some("/repo")),
            snap(2, Some(1), "tmux", &["tmux"], None),
        ];
        let plan = build_process_tree_plan(&chain, 10, Some(Path::new("/repo")), Some("dev"));
        assert_ne!(plan.recommended_root_pid, Some(1));
        assert_ne!(plan.recommended_root_pid, Some(2));
        let tmux = plan.nodes.iter().find(|n| n.pid == 2).unwrap();
        assert!(tmux.protected);
        assert!(!tmux.stop_candidate);
    }

    #[test]
    fn tree_root_must_be_stop_candidate_in_chain() {
        let chain = vec![
            snap(10, Some(9), "node", &["node"], Some("/repo")),
            snap(9, Some(1), "just", &["just", "dev"], Some("/repo")),
        ];
        let plan = build_process_tree_plan(&chain, 10, Some(Path::new("/repo")), Some("dev"));
        assert!(is_safe_tree_root(&plan, 9, 10));
        assert!(!is_safe_tree_root(&plan, 1, 10));
        assert!(!is_safe_tree_root(&plan, 999, 10));
        // Empty plan only allows the listener pid as a last-resort root.
        let empty = ProcessTreePlan {
            nodes: vec![],
            orphan_hints: vec![],
            recommended_root_pid: None,
        };
        assert!(is_safe_tree_root(&empty, 10, 10));
        assert!(!is_safe_tree_root(&empty, 9, 10));
    }

    #[test]
    fn command_preview_redacts_secrets_in_tree() {
        let chain = vec![snap(
            10,
            Some(1),
            "node",
            &["node", "API_TOKEN=secret"],
            Some("/repo"),
        )];
        let plan = build_process_tree_plan(&chain, 10, Some(Path::new("/repo")), Some("dev"));
        assert!(plan.nodes[0].command_preview.contains("[redacted]"));
    }
}
