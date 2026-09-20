//! Match a host session cwd onto an Atmos workspace or project path.

use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostSessionCwdKind {
    Workspace,
    Project,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostSessionCwdCandidate {
    pub kind: HostSessionCwdKind,
    pub id: String,
    pub project_id: Option<String>,
    pub path: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct HostSessionCwdTarget {
    pub workspace_id: Option<String>,
    pub project_id: Option<String>,
}

/// Cursor (and similar) slugs drop the Unix root slash. Resume TUI needs `/Users/...`.
pub fn ensure_absolute_host_cwd(path: &str) -> String {
    let normalized = normalize_host_session_path(path);
    if normalized.is_empty() {
        return normalized;
    }
    if Path::new(&normalized).is_absolute() {
        return normalized;
    }
    if normalized.len() >= 2
        && normalized.as_bytes()[1] == b':'
        && normalized.as_bytes()[0].is_ascii_alphabetic()
    {
        return normalized;
    }
    format!("/{normalized}")
}

pub fn normalize_host_session_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let mut normalized = trimmed.replace('\\', "/");
    while normalized.contains("//") {
        normalized = normalized.replace("//", "/");
    }
    if normalized.len() > 1 {
        normalized = normalized.trim_end_matches('/').to_string();
        if normalized.len() == 2
            && normalized.as_bytes()[1] == b':'
            && normalized.as_bytes()[0].is_ascii_alphabetic()
        {
            normalized.push('/');
        }
    }
    normalized
}

pub fn canonicalize_or_normalize_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    std::fs::canonicalize(trimmed)
        .map(|resolved| normalize_host_session_path(&resolved.to_string_lossy()))
        .unwrap_or_else(|_| normalize_host_session_path(trimmed))
}

fn comparable_path(path: &str) -> String {
    if path.len() >= 2 && path.as_bytes()[1] == b':' {
        path.to_ascii_lowercase()
    } else {
        path.to_string()
    }
}

fn match_len(cwd: &str, root: &str) -> Option<usize> {
    let cwd = normalize_host_session_path(cwd);
    let root = normalize_host_session_path(root);
    if cwd.is_empty() || root.is_empty() {
        return None;
    }
    let cwd = comparable_path(&cwd);
    let root = comparable_path(&root);
    if cwd == root {
        return Some(root.len());
    }
    let prefix = format!("{root}/");
    if cwd.starts_with(&prefix) {
        return Some(root.len());
    }
    None
}

/// Prefer the longest matching workspace path. If none, the longest project root.
pub fn match_host_session_cwd(
    cwd: &str,
    candidates: &[HostSessionCwdCandidate],
) -> HostSessionCwdTarget {
    let cwd = canonicalize_or_normalize_path(cwd);
    let mut best_workspace: Option<(usize, &HostSessionCwdCandidate)> = None;
    let mut best_project: Option<(usize, &HostSessionCwdCandidate)> = None;
    for candidate in candidates {
        let Some(len) = match_len(&cwd, &candidate.path) else {
            continue;
        };
        match candidate.kind {
            HostSessionCwdKind::Workspace => {
                if best_workspace.is_none_or(|(best_len, _)| len > best_len) {
                    best_workspace = Some((len, candidate));
                }
            }
            HostSessionCwdKind::Project => {
                if best_project.is_none_or(|(best_len, _)| len > best_len) {
                    best_project = Some((len, candidate));
                }
            }
        }
    }
    if let Some((_, workspace)) = best_workspace {
        return HostSessionCwdTarget {
            workspace_id: Some(workspace.id.clone()),
            project_id: workspace.project_id.clone(),
        };
    }
    if let Some((_, project)) = best_project {
        return HostSessionCwdTarget {
            workspace_id: None,
            project_id: Some(project.id.clone()),
        };
    }
    HostSessionCwdTarget::default()
}

pub fn path_for_candidate(path: impl AsRef<Path>) -> String {
    canonicalize_or_normalize_path(&path.as_ref().to_string_lossy())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workspace(id: &str, project_id: &str, path: &str) -> HostSessionCwdCandidate {
        HostSessionCwdCandidate {
            kind: HostSessionCwdKind::Workspace,
            id: id.into(),
            project_id: Some(project_id.into()),
            path: path.into(),
        }
    }

    fn project(id: &str, path: &str) -> HostSessionCwdCandidate {
        HostSessionCwdCandidate {
            kind: HostSessionCwdKind::Project,
            id: id.into(),
            project_id: None,
            path: path.into(),
        }
    }

    #[test]
    fn exact_workspace_path_wins() {
        let target = match_host_session_cwd(
            "/src/atmos",
            &[
                workspace("ws-1", "p-1", "/src/atmos"),
                project("p-1", "/src/atmos"),
            ],
        );
        assert_eq!(target.workspace_id.as_deref(), Some("ws-1"));
        assert_eq!(target.project_id.as_deref(), Some("p-1"));
    }

    #[test]
    fn nested_cwd_picks_longest_workspace() {
        let target = match_host_session_cwd(
            "/src/atmos/crates/agent",
            &[
                workspace("ws-root", "p-1", "/src"),
                workspace("ws-atmos", "p-1", "/src/atmos"),
                project("p-1", "/src/atmos"),
            ],
        );
        assert_eq!(target.workspace_id.as_deref(), Some("ws-atmos"));
    }

    #[test]
    fn project_root_when_no_workspace_matches() {
        let target = match_host_session_cwd(
            "/src/notes/today.md",
            &[
                workspace("ws-1", "p-1", "/src/atmos"),
                project("p-notes", "/src/notes"),
            ],
        );
        assert!(target.workspace_id.is_none());
        assert_eq!(target.project_id.as_deref(), Some("p-notes"));
    }

    #[test]
    fn unmatched_cwd_is_empty() {
        let target =
            match_host_session_cwd("/tmp/other", &[workspace("ws-1", "p-1", "/src/atmos")]);
        assert_eq!(target, HostSessionCwdTarget::default());
    }

    #[test]
    fn trailing_slash_and_backslash_normalize() {
        assert_eq!(
            normalize_host_session_path(r"C:\Users\me\proj\"),
            "C:/Users/me/proj"
        );
        let target =
            match_host_session_cwd("/src/atmos/", &[workspace("ws-1", "p-1", "/src/atmos")]);
        assert_eq!(target.workspace_id.as_deref(), Some("ws-1"));
    }

    #[test]
    fn ensure_absolute_restores_unix_root() {
        assert_eq!(
            ensure_absolute_host_cwd("Users/aarynlu/OpenSource/atmos"),
            "/Users/aarynlu/OpenSource/atmos"
        );
        assert_eq!(
            ensure_absolute_host_cwd("/Users/aarynlu/OpenSource/atmos"),
            "/Users/aarynlu/OpenSource/atmos"
        );
        assert_eq!(ensure_absolute_host_cwd("C:/Users/me"), "C:/Users/me");
        assert_eq!(ensure_absolute_host_cwd(""), "");
    }
}
