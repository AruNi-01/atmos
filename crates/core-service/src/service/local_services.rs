use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::Utc;
use core_engine::LocalServicesEngine;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::service::{project::ProjectService, workspace::WorkspaceService};
use crate::{Result, ServiceError};

mod classification;
mod dto;
mod ownership;

use classification::{is_default_visible, owner_sort_key, service_kind_rank};
use dto::build_service_dto;
use ownership::attribute_listener;

const CACHE_TTL: Duration = Duration::from_secs(5);

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalServiceStopRequest {
    pub service_id: String,
    pub pid: u32,
    pub port: u16,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalServiceStopResponse {
    pub ok: bool,
    pub service_id: String,
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

pub struct LocalServicesService {
    engine: LocalServicesEngine,
    project_service: Arc<ProjectService>,
    workspace_service: Arc<WorkspaceService>,
    cache: RwLock<Option<CacheEntry>>,
}

impl LocalServicesService {
    pub fn new(
        project_service: Arc<ProjectService>,
        workspace_service: Arc<WorkspaceService>,
    ) -> Self {
        Self {
            engine: LocalServicesEngine::new(),
            project_service,
            workspace_service,
            cache: RwLock::new(None),
        }
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
        *self.cache.write().await = Some(CacheEntry {
            key,
            created_at: Instant::now(),
            response: response.clone(),
        });
        Ok(response)
    }

    pub async fn stop(&self, request: LocalServiceStopRequest) -> Result<LocalServiceStopResponse> {
        let scan = self
            .scan(LocalServicesScanRequest {
                scope: LocalServicesScope::AllAtmosProjects,
                force: true,
                include_diagnostics: true,
                project_id: request.project_id.clone(),
                workspace_id: request.workspace_id.clone(),
            })
            .await?;

        let service = scan
            .services
            .into_iter()
            .find(|service| {
                service.pid == Some(request.pid)
                    && service.port == request.port
                    && service.id == request.service_id
            })
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

        self.engine.terminate_process(request.pid).await?;
        *self.cache.write().await = None;
        Ok(LocalServiceStopResponse {
            ok: true,
            service_id: request.service_id,
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

        let mut services = Vec::new();
        for listener in listeners {
            let Some(attributed) = attribute_listener(listener, &roots) else {
                continue;
            };
            let dto = build_service_dto(&self.engine, attributed).await;
            if !request.include_diagnostics && !is_default_visible(&dto) {
                continue;
            }
            services.push(dto);
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
            .list_by_project(project_id.to_string(), false)
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
