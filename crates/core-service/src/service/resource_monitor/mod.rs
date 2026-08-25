//! Resource Monitor service — host sample + exclusive Project/Workspace attribution.

mod attribution;
mod projection;
mod types;

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use core_engine::ResourceMetricsEngine;
use parking_lot::Mutex;
use tracing::warn;

use crate::service::local_services::{LocalServicesScanResponse, LocalServicesService};
use crate::service::project::ProjectService;
use crate::service::terminal::{TerminalResourceRoot, TerminalService};
use crate::service::workspace::WorkspaceService;
use crate::{Result, ServiceError};

use attribution::{
    attribute, normalize_path, resolve_terminal_claims, AttributionInput, CachedListenerPort,
    PathContext, PathContextKind, TerminalRootInput, TmuxPaneInput,
};

pub use types::{
    ResourceAttributionStatus, ResourceHostMetrics, ResourceMonitorSnapshot,
    ResourceProcessMetrics, ResourceProjectMetrics, ResourceSessionMetrics, ResourceUsage,
    ResourceWorkspaceMetrics,
};

const SNAPSHOT_CACHE_TTL: Duration = Duration::from_millis(500);

struct SnapshotCache {
    slot: Mutex<Option<(Instant, ResourceMonitorSnapshot)>>,
}

impl SnapshotCache {
    fn new() -> Self {
        Self {
            slot: Mutex::new(None),
        }
    }

    fn get_if_fresh(&self) -> Option<ResourceMonitorSnapshot> {
        let cache = self.slot.lock();
        let (collected_at, snapshot) = cache.as_ref()?;
        if collected_at.elapsed() < SNAPSHOT_CACHE_TTL {
            Some(snapshot.clone())
        } else {
            None
        }
    }

    fn store(&self, snapshot: ResourceMonitorSnapshot) {
        *self.slot.lock() = Some((Instant::now(), snapshot));
    }
}

pub struct ResourceMonitorService {
    project_service: Arc<ProjectService>,
    workspace_service: Arc<WorkspaceService>,
    terminal_service: Arc<TerminalService>,
    local_services: Arc<LocalServicesService>,
    metrics_engine: Arc<ResourceMetricsEngine>,
    cache: SnapshotCache,
    collect_lock: tokio::sync::Mutex<()>,
}

impl ResourceMonitorService {
    pub fn new(
        project_service: Arc<ProjectService>,
        workspace_service: Arc<WorkspaceService>,
        terminal_service: Arc<TerminalService>,
        local_services: Arc<LocalServicesService>,
        metrics_engine: Arc<ResourceMetricsEngine>,
    ) -> Self {
        Self {
            project_service,
            workspace_service,
            terminal_service,
            local_services,
            metrics_engine,
            cache: SnapshotCache::new(),
            collect_lock: tokio::sync::Mutex::new(()),
        }
    }

    /// Coalesced snapshot: 500 ms cache, lock, recheck, then one sample + pane list.
    pub async fn snapshot(&self) -> Result<ResourceMonitorSnapshot> {
        if let Some(snapshot) = self.cache.get_if_fresh() {
            return Ok(snapshot);
        }

        let _guard = self.collect_lock.lock().await;
        if let Some(snapshot) = self.cache.get_if_fresh() {
            return Ok(snapshot);
        }

        let snapshot = self.collect().await?;
        self.cache.store(snapshot.clone());
        Ok(snapshot)
    }

    async fn collect(&self) -> Result<ResourceMonitorSnapshot> {
        let (raw_contexts, roots_partial) = self.collect_path_contexts().await;
        let terminal_roots = self.terminal_service.list_resource_roots().await;
        let root_inputs: Vec<TerminalRootInput> =
            terminal_roots.iter().map(terminal_root_input).collect();

        let metrics_engine = Arc::clone(&self.metrics_engine);
        let terminal_service = Arc::clone(&self.terminal_service);
        let server_pid = std::process::id();
        let port_cache = peek_resource_port_annotations(&self.local_services).await;

        tokio::task::spawn_blocking(move || {
            let sample = metrics_engine.sample();
            let panes = terminal_service.list_pane_processes_best_effort();

            let path_contexts = raw_contexts
                .into_iter()
                .map(finalize_path_context)
                .collect();

            let has_tmux_handles = root_inputs
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
            let (claims, join_partial) =
                resolve_terminal_claims(root_inputs.as_slice(), pane_inputs.as_deref());

            let output = attribute(AttributionInput {
                processes: sample.processes,
                server_pid,
                path_contexts,
                terminals: claims,
                port_cache,
            });

            ResourceMonitorSnapshot {
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
            }
        })
        .await
        .map_err(|error| ServiceError::Processing(format!("resource sample join failed: {error}")))
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
                path: raw_root_path(&project.main_file_path),
            });
            match self
                .workspace_service
                .list_all_by_project(project.guid.clone())
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
                            path: raw_root_path(&workspace.local_path),
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

fn raw_root_path(raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(PathBuf::from(trimmed))
    }
}

fn finalize_path_context(mut context: PathContext) -> PathContext {
    context.path = context.path.and_then(finalize_root_path);
    context
}

fn finalize_root_path(raw: PathBuf) -> Option<PathBuf> {
    let mut path = normalize_path(&raw);
    if path.as_os_str().is_empty() {
        return None;
    }
    if path.is_file() {
        path = path.parent()?.to_path_buf();
    }
    Some(path)
}

/// Resource Monitor collection may only peek this surface. It never calls scan.
pub(crate) async fn peek_resource_port_annotations(
    local_services: &LocalServicesService,
) -> Option<Vec<CachedListenerPort>> {
    local_services
        .peek_latest_all_projects()
        .await
        .map(listener_ports_from_snapshot)
}

fn listener_ports_from_snapshot(snapshot: LocalServicesScanResponse) -> Vec<CachedListenerPort> {
    snapshot
        .services
        .into_iter()
        .filter_map(|dto| {
            dto.pid.map(|pid| CachedListenerPort {
                pid,
                process_name: dto.process_name,
                port: dto.port,
            })
        })
        .collect()
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
    use crate::service::local_services::{
        LocalServiceDto, LocalServiceKind, LocalServiceOwnerDto, LocalServiceStatus,
        LocalServicesScanResponse, LocalServicesScope, LocalServicesService,
    };
    use crate::service::project::ProjectService;
    use crate::service::workspace::WorkspaceService;
    use infra::Migrator;
    use sea_orm::Database;
    use sea_orm_migration::MigratorTrait;

    fn empty_snapshot(collected_at_ms: u64) -> ResourceMonitorSnapshot {
        ResourceMonitorSnapshot {
            collected_at_ms,
            host: ResourceHostMetrics {
                cpu_percent: 0.0,
                memory_used_bytes: 0,
                memory_total_bytes: 0,
                logical_cpu_count: 0,
            },
            server: ResourceUsage::zero(),
            shared_runtime: ResourceUsage::zero(),
            projects: Vec::new(),
            unattributed: ResourceUsage::zero(),
            attribution_status: ResourceAttributionStatus::Unsupported,
        }
    }

    async fn monitor_service() -> ResourceMonitorService {
        let db = Database::connect("sqlite::memory:")
            .await
            .expect("sqlite memory");
        Migrator::up(&db, None).await.expect("migrate");
        let db = Arc::new(db);
        let project_service = Arc::new(ProjectService::new(Arc::clone(&db)));
        let workspace_service = Arc::new(WorkspaceService::new(db));
        ResourceMonitorService::new(
            Arc::clone(&project_service),
            Arc::clone(&workspace_service),
            Arc::new(TerminalService::new()),
            Arc::new(LocalServicesService::new(
                project_service,
                workspace_service,
            )),
            Arc::new(ResourceMetricsEngine::new()),
        )
    }

    fn dummy_scan(port: u16, pid: u32, name: &str) -> LocalServicesScanResponse {
        LocalServicesScanResponse {
            scanned_at: "2026-08-25T00:00:00Z".into(),
            cache_ttl_ms: 5_000,
            services: vec![LocalServiceDto {
                id: format!("svc-{port}"),
                owner: LocalServiceOwnerDto {
                    project_id: Some("other".into()),
                    project_name: Some("Ignored".into()),
                    workspace_id: None,
                    workspace_name: None,
                    root_path: "/ignored".into(),
                },
                kind: LocalServiceKind::WorkspaceDevServer,
                status: LocalServiceStatus::Online,
                confidence: 1.0,
                reasons: Vec::new(),
                url: None,
                display_url: format!("http://127.0.0.1:{port}"),
                port,
                pid: Some(pid),
                process_name: Some(name.into()),
                command_preview: None,
                cwd_display: None,
                launch_dir_display: None,
                title: None,
                can_open: true,
                can_stop: true,
                protected: false,
                last_seen_at: "2026-08-25T00:00:00Z".into(),
            }],
            unavailable: None,
        }
    }

    #[test]
    fn snapshot_cache_is_fresh_until_ttl() {
        let cache = SnapshotCache::new();
        cache.store(empty_snapshot(11));
        assert_eq!(cache.get_if_fresh().unwrap().collected_at_ms, 11);
        std::thread::sleep(SNAPSHOT_CACHE_TTL + Duration::from_millis(10));
        assert!(cache.get_if_fresh().is_none());
    }

    #[tokio::test]
    async fn concurrent_snapshots_share_coalesced_collected_at() {
        let service = monitor_service().await;
        let (a, b, c) = tokio::join!(service.snapshot(), service.snapshot(), service.snapshot());
        let a = a.expect("snapshot a");
        let b = b.expect("snapshot b");
        let c = c.expect("snapshot c");
        assert_eq!(a.collected_at_ms, b.collected_at_ms);
        assert_eq!(a.collected_at_ms, c.collected_at_ms);
    }

    #[tokio::test]
    async fn snapshot_path_peeks_latest_all_and_ignores_context_cache() {
        let db = Database::connect("sqlite::memory:")
            .await
            .expect("sqlite memory");
        Migrator::up(&db, None).await.expect("migrate");
        let db = Arc::new(db);
        let project_service = Arc::new(ProjectService::new(Arc::clone(&db)));
        let workspace_service = Arc::new(WorkspaceService::new(db));
        let local_services = Arc::new(LocalServicesService::new(
            Arc::clone(&project_service),
            Arc::clone(&workspace_service),
        ));
        local_services
            .store_scan_result_for_test(
                LocalServicesScope::CurrentContext,
                dummy_scan(4173, 22, "vite"),
            )
            .await;
        assert!(
            peek_resource_port_annotations(&local_services)
                .await
                .is_none(),
            "context cache must not become the Resource Monitor port snapshot"
        );

        local_services
            .store_scan_result_for_test(
                LocalServicesScope::AllAtmosProjects,
                dummy_scan(3000, 11, "node"),
            )
            .await;
        local_services
            .store_scan_result_for_test(
                LocalServicesScope::CurrentContext,
                dummy_scan(4173, 22, "vite"),
            )
            .await;

        let peeked = peek_resource_port_annotations(&local_services)
            .await
            .expect("peek latest-all");
        assert_eq!(peeked.len(), 1);
        assert_eq!(peeked[0].pid, 11);
        assert_eq!(peeked[0].port, 3000);
        assert_eq!(peeked[0].process_name.as_deref(), Some("node"));
    }

    #[test]
    fn listener_ports_skip_missing_pid() {
        let mut snapshot = dummy_scan(3000, 11, "node");
        snapshot.services[0].pid = None;
        assert!(listener_ports_from_snapshot(snapshot).is_empty());
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
