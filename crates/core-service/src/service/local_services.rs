use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::Utc;
use core_engine::LocalServicesEngine;
use infra::jobs::{IntervalSpec, JobError, JobId, LocalScheduler, RetryPolicy};
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, warn};

use crate::service::{project::ProjectService, workspace::WorkspaceService};
use crate::{Result, ServiceError};

mod classification;
mod dto;
mod ownership;
mod process_tree;

use classification::{is_default_visible, owner_sort_key, service_kind_rank};
use dto::build_service_dto;
use ownership::attribute_listener;
use process_tree::{build_process_tree_plan, is_safe_tree_root, ProcessTreeNode};

const CACHE_TTL: Duration = Duration::from_secs(5);
/// Backend auto-refresh interval (replaces former frontend 30s polling).
const AUTO_REFRESH_INTERVAL: Duration = Duration::from_secs(30);
/// Wait after listener TERM before verifying the port is free.
const LISTENER_STOP_VERIFY_WAIT: Duration = Duration::from_millis(1600);
/// Wait after tree TERM before escalating to KILL.
const TREE_TERM_VERIFY_WAIT: Duration = Duration::from_millis(1600);
/// Wait after tree KILL before final verification.
const TREE_KILL_VERIFY_WAIT: Duration = Duration::from_millis(1000);

/// Product job id for local-services auto-refresh (APP-051 LocalScheduler).
pub const LOCAL_SERVICES_AUTO_REFRESH_JOB_ID: &str = "local_services.auto_refresh";

/// Ambient process owner for tree-stop authorization.
/// Unix: `$USER`; Windows: `$USERNAME` (then `$USER` as fallback).
fn ambient_user() -> Option<String> {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .ok()
        .filter(|s| !s.is_empty())
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LocalServicesScope {
    #[default]
    AllAtmosProjects,
    CurrentContext,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LocalServicesScanRequest {
    #[serde(default)]
    pub scope: LocalServicesScope,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub force: bool,
    #[serde(default)]
    pub include_diagnostics: bool,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LocalServiceStopMode {
    #[default]
    Listener,
    Tree,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalServiceStopRequest {
    pub service_id: String,
    pub pid: u32,
    pub port: u16,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
    /// Stop mode. Default `listener` = single-pid graceful TERM + verify.
    /// `tree` requires `root_pid` and is only used after explicit user confirmation.
    #[serde(default)]
    pub mode: LocalServiceStopMode,
    /// Required when `mode = tree`. Must be a revalidated stop candidate in the
    /// current listener's ancestor chain (never pid 1 / protected processes).
    #[serde(default)]
    pub root_pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LocalServiceStopEscalationReason {
    StillListening,
    Respawned,
    TermIgnored,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalServiceProcessNodeDto {
    pub pid: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ppid: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pgid: Option<u32>,
    pub command_preview: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd_display: Option<String>,
    pub is_listener: bool,
    pub stop_candidate: bool,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub protected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalServiceStopResponse {
    pub ok: bool,
    pub service_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<LocalServiceStopMode>,
    /// When `ok = false` after a listener-mode stop that left the port listening.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub needs_escalation: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<LocalServiceStopEscalationReason>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attempted_pid: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_listener_pid: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub orphan_hints: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub process_tree: Option<Vec<LocalServiceProcessNodeDto>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recommended_root_pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalServicesScanResponse {
    pub scanned_at: String,
    pub cache_ttl_ms: u64,
    pub services: Vec<LocalServiceDto>,
    pub unavailable: Option<LocalServicesUnavailableDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalServicesUnavailableDto {
    pub reason: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalServiceDto {
    pub id: String,
    pub owner: LocalServiceOwnerDto,
    pub kind: LocalServiceKind,
    pub status: LocalServiceStatus,
    pub confidence: f32,
    pub reasons: Vec<String>,
    pub url: Option<String>,
    pub display_url: String,
    pub port: u16,
    pub pid: Option<u32>,
    pub process_name: Option<String>,
    pub command_preview: Option<String>,
    pub cwd_display: Option<String>,
    pub launch_dir_display: Option<String>,
    pub title: Option<String>,
    pub can_open: bool,
    pub can_stop: bool,
    pub protected: bool,
    pub last_seen_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalServiceOwnerDto {
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub workspace_id: Option<String>,
    pub workspace_name: Option<String>,
    pub root_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LocalServiceKind {
    WorkspaceDevServer,
    LikelyWorkspaceServer,
    WorkspaceDependency,
    WorkspaceContainerProxy,
    ProtectedAtmosInternal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LocalServiceStatus {
    Online,
    Probing,
    NotHttp,
    Stale,
    Protected,
    Unsupported,
}

#[derive(Debug, Clone)]
pub(super) struct ServiceRoot {
    project_id: Option<String>,
    project_name: Option<String>,
    workspace_id: Option<String>,
    workspace_name: Option<String>,
    root_path: PathBuf,
    root_display: String,
}

#[derive(Debug, Clone)]
struct CacheEntry {
    key: String,
    created_at: Instant,
    response: LocalServicesScanResponse,
}

#[derive(Debug, Clone)]
struct LatestAllEntry {
    recorded_at: Instant,
    response: LocalServicesScanResponse,
}

pub struct LocalServicesService {
    engine: LocalServicesEngine,
    project_service: Arc<ProjectService>,
    workspace_service: Arc<WorkspaceService>,
    cache: RwLock<Option<CacheEntry>>,
    /// Latest non-diagnostic AllAtmosProjects snapshot. Independent of `cache`.
    latest_all: RwLock<Option<LatestAllEntry>>,
    update_tx: broadcast::Sender<LocalServicesScanResponse>,
}

impl LocalServicesService {
    pub fn new(
        project_service: Arc<ProjectService>,
        workspace_service: Arc<WorkspaceService>,
    ) -> Self {
        let (update_tx, _) = broadcast::channel(32);
        Self {
            engine: LocalServicesEngine::new(),
            project_service,
            workspace_service,
            cache: RwLock::new(None),
            latest_all: RwLock::new(None),
            update_tx,
        }
    }

    /// Register the 30s all-projects scan job on the process LocalScheduler.
    pub async fn start_auto_refresh(self: Arc<Self>, jobs: Arc<LocalScheduler>) {
        let service = Arc::clone(&self);
        if let Err(error) = jobs
            .set_interval_job(
                JobId::new(LOCAL_SERVICES_AUTO_REFRESH_JOB_ID),
                auto_refresh_interval_spec(),
                RetryPolicy::none(),
                move || {
                    let service = Arc::clone(&service);
                    async move {
                        debug!("Running scheduled local-services scan");
                        if let Err(error) = service.refresh_all_and_publish().await {
                            warn!(error = %error, "Scheduled local-services scan failed");
                            return Err(JobError::Retryable(error.to_string()));
                        }
                        Ok(())
                    }
                },
            )
            .await
        {
            warn!(
                "Failed to register local-services auto-refresh job: {}",
                error
            );
        }
    }

    pub fn subscribe_updates(&self) -> broadcast::Receiver<LocalServicesScanResponse> {
        self.update_tx.subscribe()
    }

    /// Peek the latest non-diagnostic AllAtmosProjects snapshot.
    ///
    /// Resource Monitor must only call this. It never scans, probes, or refreshes.
    /// Expired entries (older than `2 * AUTO_REFRESH_INTERVAL`) return `None`.
    pub async fn peek_latest_all_projects(&self) -> Option<LocalServicesScanResponse> {
        let guard = self.latest_all.read().await;
        let entry = guard.as_ref()?;
        latest_all_is_fresh(entry.recorded_at, Instant::now(), latest_all_ttl())
            .then(|| entry.response.clone())
    }

    #[cfg(test)]
    pub(crate) async fn store_scan_result_for_test(
        &self,
        scope: LocalServicesScope,
        response: LocalServicesScanResponse,
    ) {
        let key = format!("{scope:?}");
        let request = LocalServicesScanRequest {
            scope,
            include_diagnostics: false,
            ..Default::default()
        };
        self.store_scan_result(&request, key, response).await;
    }

    #[cfg(test)]
    pub(crate) async fn store_latest_all_at_for_test(
        &self,
        response: LocalServicesScanResponse,
        recorded_at: Instant,
    ) {
        *self.latest_all.write().await = Some(LatestAllEntry {
            recorded_at,
            response,
        });
    }

    /// Force-scan all Atmos projects and push the snapshot to WS subscribers.
    pub async fn refresh_all_and_publish(&self) -> Result<LocalServicesScanResponse> {
        let response = self
            .scan(LocalServicesScanRequest {
                scope: LocalServicesScope::AllAtmosProjects,
                force: true,
                include_diagnostics: false,
                project_id: None,
                workspace_id: None,
            })
            .await?;
        self.publish_update(&response);
        Ok(response)
    }

    /// Broadcast an existing all-projects scan snapshot (e.g. after a forced API scan).
    pub fn publish_scan_snapshot(&self, response: &LocalServicesScanResponse) {
        self.publish_update(response);
    }

    fn publish_update(&self, response: &LocalServicesScanResponse) {
        let _ = self.update_tx.send(response.clone());
    }

    pub async fn scan(
        &self,
        request: LocalServicesScanRequest,
    ) -> Result<LocalServicesScanResponse> {
        let key = scan_cache_key(&request);
        if !request.force {
            if let Some(entry) = self.cache.read().await.as_ref() {
                if entry.key == key && entry.created_at.elapsed() <= CACHE_TTL {
                    return Ok(entry.response.clone());
                }
            }
        }

        let response = self.scan_uncached(&request).await?;
        self.store_scan_result(&request, key, response.clone())
            .await;
        Ok(response)
    }

    async fn store_scan_result(
        &self,
        request: &LocalServicesScanRequest,
        key: String,
        response: LocalServicesScanResponse,
    ) {
        *self.cache.write().await = Some(CacheEntry {
            key,
            created_at: Instant::now(),
            response: response.clone(),
        });
        if records_latest_all(request, &response) {
            *self.latest_all.write().await = Some(LatestAllEntry {
                recorded_at: Instant::now(),
                response,
            });
        }
    }

    pub async fn stop(
        self: &Arc<Self>,
        request: LocalServiceStopRequest,
    ) -> Result<LocalServiceStopResponse> {
        let response = match request.mode {
            LocalServiceStopMode::Listener => self.stop_listener(request).await?,
            LocalServiceStopMode::Tree => self.stop_tree(request).await?,
        };
        // After a successful stop, push a fresh snapshot in the background so
        // the stop RPC is not blocked by a full rescan (clients may also refetch).
        if response.ok {
            let service = Arc::clone(self);
            tokio::spawn(async move {
                if let Err(error) = service.refresh_all_and_publish().await {
                    warn!(error = %error, "Local-services post-stop refresh failed");
                }
            });
        }
        Ok(response)
    }

    async fn stop_listener(
        &self,
        request: LocalServiceStopRequest,
    ) -> Result<LocalServiceStopResponse> {
        let service = self.revalidate_stop_target(&request, true).await?;

        // Graceful signal on the listening leaf only.
        self.engine.terminate_process(request.pid).await?;
        tokio::time::sleep(LISTENER_STOP_VERIFY_WAIT).await;
        *self.cache.write().await = None;

        // Success only when the port is no longer LISTEN for this service.
        if !self.port_still_listening(request.port).await? {
            return Ok(LocalServiceStopResponse {
                ok: true,
                service_id: request.service_id,
                mode: Some(LocalServiceStopMode::Listener),
                needs_escalation: None,
                reason: None,
                port: None,
                attempted_pid: None,
                current_listener_pid: None,
                orphan_hints: None,
                process_tree: None,
                recommended_root_pid: None,
            });
        }

        // Still listening — build escalation payload (pid may have changed via respawn).
        let remaining = self
            .find_stoppable_on_port(
                request.port,
                request.project_id.as_deref(),
                request.workspace_id.as_deref(),
            )
            .await?;
        let raw_listener_pid = self.listener_pid_on_port(request.port).await?;

        let current_listener_pid = remaining
            .as_ref()
            .and_then(|s| s.pid)
            .or(raw_listener_pid)
            .or(Some(request.pid));
        let reason = match (current_listener_pid, request.pid) {
            (Some(current), attempted) if current != attempted => {
                LocalServiceStopEscalationReason::Respawned
            }
            _ => LocalServiceStopEscalationReason::StillListening,
        };

        let escalation = self
            .build_escalation(
                remaining.as_ref().unwrap_or(&service),
                request.pid,
                current_listener_pid,
                reason,
            )
            .await?;

        Ok(escalation)
    }

    async fn stop_tree(
        &self,
        request: LocalServiceStopRequest,
    ) -> Result<LocalServiceStopResponse> {
        let root_pid = request
            .root_pid
            .ok_or_else(|| ServiceError::Validation("local_service_tree_root_required".into()))?;
        if root_pid <= 1 {
            return Err(ServiceError::Validation(
                "local_service_tree_root_protected".into(),
            ));
        }

        // Revalidate by port + owner (service_id/pid may have changed after respawn).
        let service = self.revalidate_stop_target(&request, false).await?;
        let listener_pid = service
            .pid
            .ok_or_else(|| ServiceError::Validation("local_service_stop_not_allowed".into()))?;

        let chain = self
            .engine
            .process_ancestor_chain(listener_pid)
            .await
            .unwrap_or_default();
        let workspace_root = PathBuf::from(&service.owner.root_path);
        let current_user = ambient_user();
        let plan = build_process_tree_plan(
            &chain,
            listener_pid,
            Some(workspace_root.as_path()),
            current_user.as_deref(),
        );

        if !is_safe_tree_root(&plan, root_pid, listener_pid) {
            return Err(ServiceError::Validation(
                "local_service_tree_root_not_allowed".into(),
            ));
        }

        // Graceful tree stop, then force if the port is still listening.
        let _ = self.engine.terminate_process_tree(root_pid).await;
        tokio::time::sleep(TREE_TERM_VERIFY_WAIT).await;
        *self.cache.write().await = None;

        if self.port_still_listening(request.port).await? {
            let _ = self.engine.kill_process_tree(root_pid).await;
            tokio::time::sleep(TREE_KILL_VERIFY_WAIT).await;
            *self.cache.write().await = None;
        }

        if self.port_still_listening(request.port).await? {
            return Err(ServiceError::Processing(
                "local_service_still_listening".into(),
            ));
        }

        Ok(LocalServiceStopResponse {
            ok: true,
            service_id: service.id,
            mode: Some(LocalServiceStopMode::Tree),
            needs_escalation: None,
            reason: None,
            port: None,
            attempted_pid: None,
            current_listener_pid: None,
            orphan_hints: None,
            process_tree: None,
            recommended_root_pid: None,
        })
    }

    /// Revalidate that a stoppable workspace service still owns the request port.
    /// When `require_exact_identity` is true, also require matching service_id + pid
    /// (listener-mode Step 1). Tree mode correlates by port + owner only.
    async fn revalidate_stop_target(
        &self,
        request: &LocalServiceStopRequest,
        require_exact_identity: bool,
    ) -> Result<LocalServiceDto> {
        let scan = self
            .scan(LocalServicesScanRequest {
                scope: LocalServicesScope::AllAtmosProjects,
                force: true,
                include_diagnostics: true,
                project_id: request.project_id.clone(),
                workspace_id: request.workspace_id.clone(),
            })
            .await?;

        let service = if require_exact_identity {
            scan.services.into_iter().find(|service| {
                service.pid == Some(request.pid)
                    && service.port == request.port
                    && service.id == request.service_id
            })
        } else {
            scan.services.into_iter().find(|service| {
                service.port == request.port
                    && service.owner.project_id == request.project_id
                    && service.owner.workspace_id == request.workspace_id
                    && service.can_stop
                    && !service.protected
            })
        }
        .ok_or_else(|| ServiceError::Validation("local_service_stale".into()))?;

        if !service.can_stop || service.protected {
            return Err(ServiceError::Validation(
                "local_service_stop_not_allowed".into(),
            ));
        }
        if service.owner.project_id != request.project_id
            || service.owner.workspace_id != request.workspace_id
        {
            return Err(ServiceError::Validation(
                "local_service_owner_changed".into(),
            ));
        }
        Ok(service)
    }

    async fn find_stoppable_on_port(
        &self,
        port: u16,
        project_id: Option<&str>,
        workspace_id: Option<&str>,
    ) -> Result<Option<LocalServiceDto>> {
        let scan = self
            .scan(LocalServicesScanRequest {
                scope: LocalServicesScope::AllAtmosProjects,
                force: true,
                include_diagnostics: true,
                project_id: project_id.map(ToOwned::to_owned),
                workspace_id: workspace_id.map(ToOwned::to_owned),
            })
            .await?;
        Ok(scan.services.into_iter().find(|service| {
            service.port == port
                && service.owner.project_id.as_deref() == project_id
                && service.owner.workspace_id.as_deref() == workspace_id
                && service.can_stop
                && !service.protected
        }))
    }

    async fn port_still_listening(&self, port: u16) -> Result<bool> {
        Ok(self.listener_pid_on_port(port).await?.is_some())
    }

    async fn listener_pid_on_port(&self, port: u16) -> Result<Option<u32>> {
        let listeners = self
            .engine
            .scan_listeners()
            .await
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        Ok(listeners
            .into_iter()
            .find(|listener| listener.port == port)
            .and_then(|listener| listener.pid))
    }

    async fn build_escalation(
        &self,
        service: &LocalServiceDto,
        attempted_pid: u32,
        current_listener_pid: Option<u32>,
        reason: LocalServiceStopEscalationReason,
    ) -> Result<LocalServiceStopResponse> {
        let listener_pid = current_listener_pid.unwrap_or(attempted_pid);
        let chain = self
            .engine
            .process_ancestor_chain(listener_pid)
            .await
            .unwrap_or_default();
        let workspace_root = PathBuf::from(&service.owner.root_path);
        let current_user = ambient_user();
        let plan = build_process_tree_plan(
            &chain,
            listener_pid,
            Some(workspace_root.as_path()),
            current_user.as_deref(),
        );

        let mut orphan_hints = plan.orphan_hints;
        if matches!(reason, LocalServiceStopEscalationReason::Respawned) {
            orphan_hints.push("respawned".into());
        } else {
            orphan_hints.push("term_ignored_or_still_listening".into());
        }
        if matches!(service.status, LocalServiceStatus::NotHttp) {
            orphan_hints.push("not_http_still_listen".into());
        }

        Ok(LocalServiceStopResponse {
            ok: false,
            service_id: service.id.clone(),
            mode: Some(LocalServiceStopMode::Listener),
            needs_escalation: Some(true),
            reason: Some(reason),
            port: Some(service.port),
            attempted_pid: Some(attempted_pid),
            current_listener_pid: Some(listener_pid),
            orphan_hints: Some(unique_strings(orphan_hints)),
            process_tree: Some(plan.nodes.into_iter().map(process_node_dto).collect()),
            recommended_root_pid: plan.recommended_root_pid,
        })
    }

    async fn scan_uncached(
        &self,
        request: &LocalServicesScanRequest,
    ) -> Result<LocalServicesScanResponse> {
        let roots = self.resolve_roots(request).await?;
        if roots.is_empty() {
            return Ok(empty_response(None));
        }

        let listeners = match self.engine.scan_listeners().await {
            Ok(listeners) => listeners,
            Err(error) => {
                return Ok(empty_response(Some(LocalServicesUnavailableDto {
                    reason: "scanner_unavailable".into(),
                    message: error.to_string(),
                })));
            }
        };

        let mut tasks = Vec::new();
        for listener in listeners {
            let Some(attributed) = attribute_listener(listener, &roots) else {
                continue;
            };
            let engine = self.engine.clone();
            tasks.push(tokio::spawn(async move {
                build_service_dto(&engine, attributed).await
            }));
        }

        let mut services = Vec::new();
        for task in tasks {
            if let Ok(dto) = task.await {
                if !request.include_diagnostics && !is_default_visible(&dto) {
                    continue;
                }
                services.push(dto);
            }
        }

        services.sort_by(|a, b| {
            owner_sort_key(a)
                .cmp(&owner_sort_key(b))
                .then_with(|| service_kind_rank(a).cmp(&service_kind_rank(b)))
                .then_with(|| a.port.cmp(&b.port))
        });

        Ok(LocalServicesScanResponse {
            scanned_at: Utc::now().to_rfc3339(),
            cache_ttl_ms: CACHE_TTL.as_millis() as u64,
            services,
            unavailable: None,
        })
    }

    async fn resolve_roots(&self, request: &LocalServicesScanRequest) -> Result<Vec<ServiceRoot>> {
        match request.scope {
            LocalServicesScope::CurrentContext => self.resolve_context_roots(request).await,
            LocalServicesScope::AllAtmosProjects => self.resolve_all_roots().await,
        }
    }

    async fn resolve_context_roots(
        &self,
        request: &LocalServicesScanRequest,
    ) -> Result<Vec<ServiceRoot>> {
        if let Some(workspace_id) = request.workspace_id.as_ref() {
            let workspace = self
                .workspace_service
                .get_workspace(workspace_id.clone())
                .await?
                .ok_or_else(|| {
                    ServiceError::NotFound(format!("Workspace {workspace_id} not found"))
                })?;
            let project = self
                .project_service
                .get_project(workspace.model.project_guid.clone())
                .await?
                .ok_or_else(|| {
                    ServiceError::NotFound(format!(
                        "Project {} not found",
                        workspace.model.project_guid
                    ))
                })?;
            return Ok(vec![ServiceRoot {
                project_id: Some(project.guid),
                project_name: Some(project.name),
                workspace_id: Some(workspace.model.guid),
                workspace_name: Some(
                    workspace
                        .model
                        .display_name
                        .clone()
                        .unwrap_or(workspace.model.name),
                ),
                root_path: PathBuf::from(&workspace.local_path),
                root_display: workspace.local_path,
            }]);
        }

        if let Some(project_id) = request.project_id.as_ref() {
            let project = self
                .project_service
                .get_project(project_id.clone())
                .await?
                .ok_or_else(|| ServiceError::NotFound(format!("Project {project_id} not found")))?;
            let mut roots = vec![ServiceRoot {
                project_id: Some(project.guid.clone()),
                project_name: Some(project.name.clone()),
                workspace_id: None,
                workspace_name: None,
                root_path: PathBuf::from(&project.main_file_path),
                root_display: project.main_file_path.clone(),
            }];
            roots.extend(
                self.workspace_roots_for_project(&project.guid, &project.name)
                    .await?,
            );
            return Ok(roots);
        }

        self.resolve_all_roots().await
    }

    async fn resolve_all_roots(&self) -> Result<Vec<ServiceRoot>> {
        let projects = self.project_service.list_projects().await?;
        let mut roots = Vec::new();
        for project in projects {
            roots.push(ServiceRoot {
                project_id: Some(project.guid.clone()),
                project_name: Some(project.name.clone()),
                workspace_id: None,
                workspace_name: None,
                root_path: PathBuf::from(&project.main_file_path),
                root_display: project.main_file_path.clone(),
            });
            roots.extend(
                self.workspace_roots_for_project(&project.guid, &project.name)
                    .await?,
            );
        }
        Ok(roots)
    }

    async fn workspace_roots_for_project(
        &self,
        project_id: &str,
        project_name: &str,
    ) -> Result<Vec<ServiceRoot>> {
        let workspaces = self
            .workspace_service
            .list_by_project(project_id.to_string())
            .await?;
        Ok(workspaces
            .into_iter()
            .filter(|workspace| !workspace.local_path.trim().is_empty())
            .map(|workspace| ServiceRoot {
                project_id: Some(project_id.to_string()),
                project_name: Some(project_name.to_string()),
                workspace_id: Some(workspace.model.guid),
                workspace_name: Some(workspace.model.display_name.unwrap_or(workspace.model.name)),
                root_path: PathBuf::from(&workspace.local_path),
                root_display: workspace.local_path,
            })
            .collect())
    }
}

pub(crate) fn auto_refresh_interval_spec() -> IntervalSpec {
    IntervalSpec {
        every: AUTO_REFRESH_INTERVAL,
        skip_if_running: true,
        fire_immediately: true,
    }
}

fn latest_all_ttl() -> Duration {
    AUTO_REFRESH_INTERVAL * 2
}

fn latest_all_is_fresh(recorded_at: Instant, now: Instant, ttl: Duration) -> bool {
    now.saturating_duration_since(recorded_at) <= ttl
}

fn records_latest_all(
    request: &LocalServicesScanRequest,
    response: &LocalServicesScanResponse,
) -> bool {
    request.scope == LocalServicesScope::AllAtmosProjects
        && !request.include_diagnostics
        && response.unavailable.is_none()
}

fn empty_response(unavailable: Option<LocalServicesUnavailableDto>) -> LocalServicesScanResponse {
    LocalServicesScanResponse {
        scanned_at: Utc::now().to_rfc3339(),
        cache_ttl_ms: CACHE_TTL.as_millis() as u64,
        services: Vec::new(),
        unavailable,
    }
}

fn scan_cache_key(request: &LocalServicesScanRequest) -> String {
    format!(
        "{:?}:{:?}:{:?}:{}",
        request.scope, request.project_id, request.workspace_id, request.include_diagnostics
    )
}

fn process_node_dto(node: ProcessTreeNode) -> LocalServiceProcessNodeDto {
    LocalServiceProcessNodeDto {
        pid: node.pid,
        ppid: node.ppid,
        pgid: node.pgid,
        command_preview: node.command_preview,
        cwd_display: node.cwd_display,
        is_listener: node.is_listener,
        stop_candidate: node.stop_candidate,
        protected: node.protected,
    }
}

fn unique_strings(items: Vec<String>) -> Vec<String> {
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
    use crate::service::project::ProjectService;
    use crate::service::workspace::WorkspaceService;
    use infra::Migrator;
    use sea_orm::Database;
    use sea_orm_migration::MigratorTrait;

    fn dummy_response(port: u16) -> LocalServicesScanResponse {
        LocalServicesScanResponse {
            scanned_at: "2026-08-25T00:00:00Z".into(),
            cache_ttl_ms: 5_000,
            services: vec![LocalServiceDto {
                id: format!("svc-{port}"),
                owner: LocalServiceOwnerDto {
                    project_id: Some("proj".into()),
                    project_name: Some("Demo".into()),
                    workspace_id: Some("ws".into()),
                    workspace_name: Some("Feature".into()),
                    root_path: "/proj/ws".into(),
                },
                kind: LocalServiceKind::WorkspaceDevServer,
                status: LocalServiceStatus::Online,
                confidence: 1.0,
                reasons: Vec::new(),
                url: None,
                display_url: format!("http://127.0.0.1:{port}"),
                port,
                pid: Some(4242),
                process_name: Some("node".into()),
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

    fn empty_available_response() -> LocalServicesScanResponse {
        LocalServicesScanResponse {
            scanned_at: "2026-08-25T00:00:00Z".into(),
            cache_ttl_ms: 5_000,
            services: Vec::new(),
            unavailable: None,
        }
    }

    fn unavailable_response() -> LocalServicesScanResponse {
        LocalServicesScanResponse {
            scanned_at: "2026-08-25T00:00:01Z".into(),
            cache_ttl_ms: 5_000,
            services: Vec::new(),
            unavailable: Some(LocalServicesUnavailableDto {
                reason: "scanner_unavailable".into(),
                message: "lsof failed".into(),
            }),
        }
    }

    async fn service() -> LocalServicesService {
        let db = Database::connect("sqlite::memory:")
            .await
            .expect("sqlite memory");
        Migrator::up(&db, None).await.expect("migrate");
        let db = Arc::new(db);
        LocalServicesService::new(
            Arc::new(ProjectService::new(Arc::clone(&db))),
            Arc::new(WorkspaceService::new(db)),
        )
    }

    #[test]
    fn auto_refresh_fires_immediately() {
        let spec = auto_refresh_interval_spec();
        assert!(spec.fire_immediately);
        assert_eq!(spec.every, Duration::from_secs(30));
        assert!(spec.skip_if_running);
    }

    #[test]
    fn latest_all_records_only_non_diagnostic_available_all_projects() {
        let available = dummy_response(3000);
        let empty_available = empty_available_response();
        let unavailable = unavailable_response();
        assert!(records_latest_all(
            &LocalServicesScanRequest {
                scope: LocalServicesScope::AllAtmosProjects,
                include_diagnostics: false,
                ..Default::default()
            },
            &available
        ));
        assert!(
            records_latest_all(
                &LocalServicesScanRequest {
                    scope: LocalServicesScope::AllAtmosProjects,
                    include_diagnostics: false,
                    ..Default::default()
                },
                &empty_available
            ),
            "empty roots with unavailable=None may refresh latest-all"
        );
        assert!(!records_latest_all(
            &LocalServicesScanRequest {
                scope: LocalServicesScope::AllAtmosProjects,
                include_diagnostics: false,
                ..Default::default()
            },
            &unavailable
        ));
        assert!(!records_latest_all(
            &LocalServicesScanRequest {
                scope: LocalServicesScope::AllAtmosProjects,
                include_diagnostics: true,
                ..Default::default()
            },
            &available
        ));
        assert!(!records_latest_all(
            &LocalServicesScanRequest {
                scope: LocalServicesScope::CurrentContext,
                include_diagnostics: false,
                project_id: Some("proj".into()),
                ..Default::default()
            },
            &available
        ));
    }

    #[test]
    fn latest_all_freshness_expires_after_two_refresh_intervals() {
        let recorded = Instant::now();
        let ttl = latest_all_ttl();
        assert_eq!(ttl, Duration::from_secs(60));
        assert!(latest_all_is_fresh(recorded, recorded, ttl));
        assert!(latest_all_is_fresh(recorded, recorded + ttl, ttl));
        assert!(!latest_all_is_fresh(
            recorded,
            recorded + ttl + Duration::from_nanos(1),
            ttl
        ));
    }

    #[tokio::test]
    async fn latest_all_is_not_overwritten_by_context_cache() {
        let service = service().await;
        let all = dummy_response(3000);
        let context = dummy_response(4173);
        service
            .store_scan_result(
                &LocalServicesScanRequest {
                    scope: LocalServicesScope::AllAtmosProjects,
                    include_diagnostics: false,
                    ..Default::default()
                },
                "all".into(),
                all.clone(),
            )
            .await;
        service
            .store_scan_result(
                &LocalServicesScanRequest {
                    scope: LocalServicesScope::CurrentContext,
                    include_diagnostics: false,
                    project_id: Some("proj".into()),
                    workspace_id: Some("ws".into()),
                    ..Default::default()
                },
                "context".into(),
                context,
            )
            .await;

        let peeked = service
            .peek_latest_all_projects()
            .await
            .expect("latest-all snapshot");
        assert_eq!(peeked.services[0].port, 3000);
        assert_eq!(peeked.services[0].pid, Some(4242));

        let cache = service.cache.read().await;
        assert_eq!(cache.as_ref().unwrap().key, "context");
        assert_eq!(cache.as_ref().unwrap().response.services[0].port, 4173);
    }

    #[tokio::test]
    async fn peek_does_not_write_or_require_request_cache() {
        let service = service().await;
        assert!(service.peek_latest_all_projects().await.is_none());
        service
            .store_scan_result(
                &LocalServicesScanRequest {
                    scope: LocalServicesScope::AllAtmosProjects,
                    include_diagnostics: true,
                    ..Default::default()
                },
                "diag".into(),
                dummy_response(9),
            )
            .await;
        assert!(
            service.peek_latest_all_projects().await.is_none(),
            "diagnostic all-projects must not become the Resource Monitor snapshot"
        );
    }

    #[tokio::test]
    async fn unavailable_scan_keeps_previous_good_latest_all() {
        let service = service().await;
        service
            .store_scan_result(
                &LocalServicesScanRequest {
                    scope: LocalServicesScope::AllAtmosProjects,
                    include_diagnostics: false,
                    ..Default::default()
                },
                "all".into(),
                dummy_response(3000),
            )
            .await;
        service
            .store_scan_result(
                &LocalServicesScanRequest {
                    scope: LocalServicesScope::AllAtmosProjects,
                    include_diagnostics: false,
                    ..Default::default()
                },
                "all".into(),
                unavailable_response(),
            )
            .await;

        let peeked = service
            .peek_latest_all_projects()
            .await
            .expect("previous good snapshot");
        assert_eq!(peeked.services[0].port, 3000);
        assert!(peeked.unavailable.is_none());
    }

    #[tokio::test]
    async fn empty_available_all_projects_can_record_latest_all() {
        let service = service().await;
        service
            .store_scan_result(
                &LocalServicesScanRequest {
                    scope: LocalServicesScope::AllAtmosProjects,
                    include_diagnostics: false,
                    ..Default::default()
                },
                "all".into(),
                dummy_response(3000),
            )
            .await;
        service
            .store_scan_result(
                &LocalServicesScanRequest {
                    scope: LocalServicesScope::AllAtmosProjects,
                    include_diagnostics: false,
                    ..Default::default()
                },
                "all".into(),
                empty_available_response(),
            )
            .await;

        let peeked = service
            .peek_latest_all_projects()
            .await
            .expect("empty available snapshot");
        assert!(peeked.services.is_empty());
        assert!(peeked.unavailable.is_none());
    }

    #[tokio::test]
    async fn peek_returns_none_when_latest_all_is_expired() {
        let service = service().await;
        let recorded_at = Instant::now()
            .checked_sub(latest_all_ttl() + Duration::from_secs(1))
            .expect("clock can subtract latest-all ttl");
        service
            .store_latest_all_at_for_test(dummy_response(3000), recorded_at)
            .await;
        assert!(service.peek_latest_all_projects().await.is_none());
    }
}
