//! Resource Monitor service — host sample + exclusive Project/Workspace attribution.

mod attribution;
mod projection;
mod types;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use core_engine::ResourceMetricsEngine;
use parking_lot::Mutex;
use tracing::warn;

use crate::service::project::ProjectService;
use crate::service::terminal::{TerminalResourceRoot, TerminalService};
use crate::service::workspace::WorkspaceService;
use crate::{Result, ServiceError};

use attribution::{
    attribute, normalize_path, resolve_terminal_claims, AttributionInput, PathContext,
    PathContextKind, TerminalRootInput, TmuxPaneInput,
};

pub use types::{
    ResourceAttributionStatus, ResourceHostMetrics, ResourceMonitorSnapshot,
    ResourceProjectMetrics, ResourceSessionMetrics, ResourceUsage, ResourceWorkspaceMetrics,
};

const SNAPSHOT_CACHE_TTL: Duration = Duration::from_millis(500);

pub struct ResourceMonitorService {
    project_service: Arc<ProjectService>,
    workspace_service: Arc<WorkspaceService>,
    terminal_service: Arc<TerminalService>,
    metrics_engine: Arc<ResourceMetricsEngine>,
    cache: Mutex<Option<(Instant, ResourceMonitorSnapshot)>>,
    collect_lock: tokio::sync::Mutex<()>,
}

impl ResourceMonitorService {
    pub fn new(
        project_service: Arc<ProjectService>,
        workspace_service: Arc<WorkspaceService>,
        terminal_service: Arc<TerminalService>,
        metrics_engine: Arc<ResourceMetricsEngine>,
    ) -> Self {
        Self {
            project_service,
            workspace_service,
            terminal_service,
            metrics_engine,
            cache: Mutex::new(None),
            collect_lock: tokio::sync::Mutex::new(()),
        }
    }

    /// Coalesced snapshot: 500 ms cache, lock, recheck, then one sample + pane list.
    pub async fn snapshot(&self) -> Result<ResourceMonitorSnapshot> {
        if let Some(snapshot) = self.cached_if_fresh() {
            return Ok(snapshot);
        }

        let _guard = self.collect_lock.lock().await;
        if let Some(snapshot) = self.cached_if_fresh() {
            return Ok(snapshot);
        }

        let snapshot = self.collect().await?;
        *self.cache.lock() = Some((Instant::now(), snapshot.clone()));
        Ok(snapshot)
    }

    fn cached_if_fresh(&self) -> Option<ResourceMonitorSnapshot> {
        let cache = self.cache.lock();
        let (collected_at, snapshot) = cache.as_ref()?;
        if collected_at.elapsed() < SNAPSHOT_CACHE_TTL {
            Some(snapshot.clone())
        } else {
            None
        }
    }

    async fn collect(&self) -> Result<ResourceMonitorSnapshot> {
        let metrics_engine = Arc::clone(&self.metrics_engine);
        let terminal_service = Arc::clone(&self.terminal_service);
        let sample_task = tokio::task::spawn_blocking(move || {
            let sample = metrics_engine.sample();
            let panes = terminal_service.list_pane_processes_best_effort();
            (sample, panes)
        });

        let (path_contexts, roots_partial) = self.collect_path_contexts().await;
        let terminal_roots = self.terminal_service.list_resource_roots().await;

        let (sample, panes) = sample_task.await.map_err(|error| {
            ServiceError::Processing(format!("resource sample join failed: {error}"))
        })?;

        let has_tmux_handles = terminal_roots
            .iter()
            .any(|root| root.tmux_session.is_some() && root.tmux_window_index.is_some());
        let tmux_unavailable = panes.is_none() && has_tmux_handles;

        let pane_inputs = panes.as_ref().map(|panes| {
            panes
                .iter()
                .map(|pane| TmuxPaneInput {
                    session_name: pane.session_name.clone(),
                    window_index: pane.window_index,
                    pane_pid: pane.pane_pid,
                })
                .collect::<Vec<_>>()
        });
        let root_inputs: Vec<TerminalRootInput> =
            terminal_roots.iter().map(terminal_root_input).collect();
        let (claims, join_partial) =
            resolve_terminal_claims(root_inputs.as_slice(), pane_inputs.as_deref());

        let output = attribute(AttributionInput {
            processes: sample.processes,
            server_pid: std::process::id(),
            path_contexts,
            terminals: claims,
        });

        Ok(ResourceMonitorSnapshot {
            collected_at_ms: sample.collected_at_ms,
            host: ResourceHostMetrics {
                cpu_percent: sample.host.cpu_percent,
                memory_used_bytes: sample.host.memory_used_bytes,
                memory_total_bytes: sample.host.memory_total_bytes,
                logical_cpu_count: sample.host.logical_cpu_count,
            },
            server: output.server,
            shared_runtime: output.shared_runtime,
            projects: output.projects,
            unattributed: output.unattributed,
            attribution_status: merge_status(
                output.attribution_status,
                roots_partial || join_partial || tmux_unavailable,
            ),
        })
    }

    async fn collect_path_contexts(&self) -> (Vec<PathContext>, bool) {
        let mut contexts = Vec::new();
        let mut partial = false;
        let projects = match self.project_service.list_projects().await {
            Ok(projects) => projects,
            Err(error) => {
                warn!(%error, "resource monitor failed to list projects");
                return (contexts, true);
            }
        };

        for project in projects {
            contexts.push(PathContext {
                id: project.guid.clone(),
                name: project.name.clone(),
                kind: PathContextKind::Project,
                project_id: project.guid.clone(),
                path: usable_root_path(&project.main_file_path),
            });
            match self
                .workspace_service
                .list_by_project(project.guid.clone())
                .await
            {
                Ok(workspaces) => {
                    for workspace in workspaces {
                        contexts.push(PathContext {
                            id: workspace.model.guid.clone(),
                            name: workspace
                                .model
                                .display_name
                                .clone()
                                .unwrap_or_else(|| workspace.model.name.clone()),
                            kind: PathContextKind::Workspace,
                            project_id: project.guid.clone(),
                            path: usable_root_path(&workspace.local_path),
                        });
                    }
                }
                Err(error) => {
                    warn!(
                        %error,
                        project_id = %project.guid,
                        "resource monitor failed to list workspaces"
                    );
                    partial = true;
                }
            }
        }
        (contexts, partial)
    }
}

fn terminal_root_input(root: &TerminalResourceRoot) -> TerminalRootInput {
    TerminalRootInput {
        session_id: root.session_id.clone(),
        name: root.display_name.clone(),
        terminal_kind: root.terminal_kind.as_str().to_string(),
        context_id: root.context_id.clone(),
        simple_root_pid: root.simple_root_pid,
        tmux_session: root.tmux_session.clone(),
        tmux_window_index: root.tmux_window_index,
    }
}

fn usable_root_path(raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut path = normalize_path(Path::new(trimmed));
    if path.as_os_str().is_empty() {
        return None;
    }
    if path.is_file() {
        path = path.parent()?.to_path_buf();
    }
    Some(path)
}

fn merge_status(
    status: ResourceAttributionStatus,
    extra_partial: bool,
) -> ResourceAttributionStatus {
    match status {
        ResourceAttributionStatus::Unsupported => ResourceAttributionStatus::Unsupported,
        ResourceAttributionStatus::Partial => ResourceAttributionStatus::Partial,
        ResourceAttributionStatus::Complete if extra_partial => ResourceAttributionStatus::Partial,
        ResourceAttributionStatus::Complete => ResourceAttributionStatus::Complete,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cache_is_fresh(collected_at: Instant, now: Instant) -> bool {
        now.duration_since(collected_at) < SNAPSHOT_CACHE_TTL
    }

    #[test]
    fn snapshot_cache_ttl_is_500ms() {
        let start = Instant::now();
        assert!(cache_is_fresh(start, start + Duration::from_millis(499)));
        assert!(!cache_is_fresh(start, start + Duration::from_millis(500)));
    }

    #[test]
    fn merge_status_keeps_unsupported_and_promotes_partial() {
        assert_eq!(
            merge_status(ResourceAttributionStatus::Unsupported, true),
            ResourceAttributionStatus::Unsupported
        );
        assert_eq!(
            merge_status(ResourceAttributionStatus::Complete, true),
            ResourceAttributionStatus::Partial
        );
        assert_eq!(
            merge_status(ResourceAttributionStatus::Complete, false),
            ResourceAttributionStatus::Complete
        );
    }
}
