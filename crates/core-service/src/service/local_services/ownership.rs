use std::path::{Path, PathBuf};

use core_engine::LocalTcpListener;

use super::classification::{dev_command_match, display_path};
use super::ServiceRoot;

#[derive(Debug, Clone)]
pub(super) struct AttributedListener {
    pub(super) listener: LocalTcpListener,
    pub(super) owner: ServiceRoot,
    pub(super) confidence: f32,
    pub(super) reasons: Vec<String>,
    pub(super) launch_dir_display: Option<String>,
}

pub(super) fn attribute_listener(
    listener: LocalTcpListener,
    roots: &[ServiceRoot],
) -> Option<AttributedListener> {
    let mut best: Option<(ServiceRoot, usize, String, PathBuf)> = None;
    for evidence in evidence_paths(&listener) {
        for root in roots {
            if path_contains(&root.root_path, &evidence) {
                let depth = path_depth(&root.root_path);
                let should_replace = best
                    .as_ref()
                    .map(|(_, best_depth, _, _)| depth > *best_depth)
                    .unwrap_or(true);
                if should_replace {
                    best = Some((
                        root.clone(),
                        depth,
                        evidence_reason(&listener, &evidence),
                        evidence.clone(),
                    ));
                }
            }
        }
    }

    let (owner, _, reason, evidence) = best?;
    let mut reasons = vec![reason];
    let mut confidence: f32 = 0.85;
    if dev_command_match(&listener) {
        reasons.push("dev command".into());
        confidence = 0.92;
    }
    if listener
        .cwd
        .as_ref()
        .is_some_and(|cwd| path_contains(&owner.root_path, cwd))
    {
        reasons.push("cwd under workspace".into());
        confidence = confidence.max(0.95);
    }

    Some(AttributedListener {
        listener,
        owner,
        confidence,
        reasons,
        launch_dir_display: Some(display_path(&evidence)),
    })
}

fn evidence_paths(listener: &LocalTcpListener) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(cwd) = listener.cwd.as_ref() {
        paths.push(cwd.clone());
    }
    if let Some(exe) = listener.exe.as_ref() {
        paths.push(exe.clone());
    }
    for token in &listener.command_line {
        let cleaned = token.trim_matches(['"', '\'']);
        if cleaned.starts_with('/') || cleaned.starts_with('~') {
            paths.push(PathBuf::from(cleaned));
        }
    }
    paths
}

fn evidence_reason(listener: &LocalTcpListener, evidence: &Path) -> String {
    if listener.cwd.as_deref() == Some(evidence) {
        "cwd under workspace".into()
    } else if listener.exe.as_deref() == Some(evidence) {
        "executable path under workspace".into()
    } else {
        "command path under workspace".into()
    }
}

fn path_contains(root: &Path, evidence: &Path) -> bool {
    let root = canonical_or_original(root);
    let evidence = canonical_or_original(evidence);
    evidence == root || evidence.starts_with(&root)
}

fn canonical_or_original(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn path_depth(path: &Path) -> usize {
    path.components().count()
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use core_engine::LocalTcpListener;

    use super::{attribute_listener, path_contains};
    use crate::service::local_services::ServiceRoot;

    #[test]
    fn descendant_path_matches_parent_root() {
        assert!(path_contains(
            &PathBuf::from("/repo"),
            &PathBuf::from("/repo/apps/web")
        ));
        assert!(!path_contains(
            &PathBuf::from("/repo"),
            &PathBuf::from("/repo-other/apps/web")
        ));
    }

    #[test]
    fn deepest_root_wins_for_nested_workspaces() {
        let listener = LocalTcpListener {
            pid: Some(42),
            process_name: Some("node".into()),
            local_addr: "127.0.0.1".into(),
            port: 5173,
            cwd: Some(PathBuf::from("/repo/apps/web")),
            exe: None,
            command_line: vec!["pnpm".into(), "dev".into()],
            parent_pids: Vec::new(),
            user_id: None,
        };
        let roots = vec![
            ServiceRoot {
                project_id: Some("project".into()),
                project_name: Some("Project".into()),
                workspace_id: None,
                workspace_name: None,
                root_path: PathBuf::from("/repo"),
                root_display: "/repo".into(),
            },
            ServiceRoot {
                project_id: Some("project".into()),
                project_name: Some("Project".into()),
                workspace_id: Some("workspace".into()),
                workspace_name: Some("Workspace".into()),
                root_path: PathBuf::from("/repo/apps"),
                root_display: "/repo/apps".into(),
            },
        ];
        let attributed = attribute_listener(listener, &roots).expect("attributed");
        assert_eq!(attributed.owner.workspace_id.as_deref(), Some("workspace"));
    }
}
