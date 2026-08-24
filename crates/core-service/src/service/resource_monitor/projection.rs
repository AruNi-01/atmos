//! Hierarchy projection: exclusive assignments become Project / Workspace / session rows.

use std::collections::{HashMap, HashSet};

use super::attribution::{PathContext, PathContextKind};
use super::types::{
    ResourceProjectMetrics, ResourceSessionMetrics, ResourceUsage, ResourceWorkspaceMetrics,
};

#[derive(Clone)]
pub(crate) struct SessionRow {
    pub session_id: String,
    pub name: Option<String>,
    pub terminal_kind: String,
    pub project_id: Option<String>,
    pub workspace_id: Option<String>,
}

pub(crate) fn build_projects(
    contexts: &[PathContext],
    session_rows: &[SessionRow],
    session_usage: &HashMap<String, ResourceUsage>,
    workspace_usage: &HashMap<(String, String), ResourceUsage>,
    project_usage: &HashMap<String, ResourceUsage>,
    project_direct: &HashMap<String, ResourceUsage>,
) -> Vec<ResourceProjectMetrics> {
    let mut names: HashMap<String, String> = HashMap::new();
    let mut workspace_names: HashMap<(String, String), String> = HashMap::new();
    for context in contexts {
        match context.kind {
            PathContextKind::Project => {
                names.insert(context.id.clone(), context.name.clone());
            }
            PathContextKind::Workspace => {
                names
                    .entry(context.project_id.clone())
                    .or_insert_with(|| context.project_id.clone());
                workspace_names.insert(
                    (context.project_id.clone(), context.id.clone()),
                    context.name.clone(),
                );
            }
        }
    }

    let mut project_ids: HashSet<String> = HashSet::new();
    project_ids.extend(project_usage.keys().cloned());
    project_ids.extend(project_direct.keys().cloned());
    for row in session_rows {
        if let Some(project_id) = &row.project_id {
            project_ids.insert(project_id.clone());
        }
    }
    for (project_id, _) in workspace_usage.keys() {
        project_ids.insert(project_id.clone());
    }

    let mut projects: Vec<ResourceProjectMetrics> = project_ids
        .into_iter()
        .map(|project_id| {
            let mut sessions: Vec<ResourceSessionMetrics> = session_rows
                .iter()
                .filter(|row| {
                    row.project_id.as_deref() == Some(project_id.as_str())
                        && row.workspace_id.is_none()
                })
                .map(|row| ResourceSessionMetrics {
                    session_id: row.session_id.clone(),
                    name: row.name.clone(),
                    terminal_kind: row.terminal_kind.clone(),
                    usage: session_usage
                        .get(&row.session_id)
                        .cloned()
                        .unwrap_or_else(ResourceUsage::zero),
                })
                .collect();
            sort_sessions(&mut sessions);

            let mut workspace_ids: HashSet<String> = HashSet::new();
            for (pid, workspace_id) in workspace_usage.keys() {
                if pid == &project_id {
                    workspace_ids.insert(workspace_id.clone());
                }
            }
            for row in session_rows {
                if row.project_id.as_deref() == Some(project_id.as_str()) {
                    if let Some(workspace_id) = &row.workspace_id {
                        workspace_ids.insert(workspace_id.clone());
                    }
                }
            }

            let mut workspaces: Vec<ResourceWorkspaceMetrics> = workspace_ids
                .into_iter()
                .map(|workspace_id| {
                    let mut sessions: Vec<ResourceSessionMetrics> = session_rows
                        .iter()
                        .filter(|row| {
                            row.project_id.as_deref() == Some(project_id.as_str())
                                && row.workspace_id.as_deref() == Some(workspace_id.as_str())
                        })
                        .map(|row| ResourceSessionMetrics {
                            session_id: row.session_id.clone(),
                            name: row.name.clone(),
                            terminal_kind: row.terminal_kind.clone(),
                            usage: session_usage
                                .get(&row.session_id)
                                .cloned()
                                .unwrap_or_else(ResourceUsage::zero),
                        })
                        .collect();
                    sort_sessions(&mut sessions);
                    ResourceWorkspaceMetrics {
                        name: workspace_names
                            .get(&(project_id.clone(), workspace_id.clone()))
                            .cloned()
                            .unwrap_or_else(|| workspace_id.clone()),
                        usage: workspace_usage
                            .get(&(project_id.clone(), workspace_id.clone()))
                            .cloned()
                            .unwrap_or_else(ResourceUsage::zero),
                        workspace_id,
                        sessions,
                    }
                })
                .collect();
            workspaces.sort_by(|left, right| {
                left.name
                    .cmp(&right.name)
                    .then_with(|| left.workspace_id.cmp(&right.workspace_id))
            });

            ResourceProjectMetrics {
                name: names
                    .get(&project_id)
                    .cloned()
                    .unwrap_or_else(|| project_id.clone()),
                usage: project_usage
                    .get(&project_id)
                    .cloned()
                    .unwrap_or_else(ResourceUsage::zero),
                direct_usage: project_direct
                    .get(&project_id)
                    .cloned()
                    .unwrap_or_else(ResourceUsage::zero),
                project_id,
                workspaces,
                sessions,
            }
        })
        .collect();

    projects.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then_with(|| left.project_id.cmp(&right.project_id))
    });
    projects
}

fn sort_sessions(sessions: &mut [ResourceSessionMetrics]) {
    sessions.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then_with(|| left.session_id.cmp(&right.session_id))
    });
}
