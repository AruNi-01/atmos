use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::Utc;
use core_engine::{LocalServicesEngine, LocalTcpListener};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::service::{project::ProjectService, workspace::WorkspaceService};
use crate::{Result, ServiceError};

const CACHE_TTL: Duration = Duration::from_secs(5);
const HIGH_CONFIDENCE: f32 = 0.75;

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
struct ServiceRoot {
    project_id: Option<String>,
    project_name: Option<String>,
    workspace_id: Option<String>,
    workspace_name: Option<String>,
    root_path: PathBuf,
    root_display: String,
}

#[derive(Debug, Clone)]
struct AttributedListener {
    listener: LocalTcpListener,
    owner: ServiceRoot,
    confidence: f32,
    reasons: Vec<String>,
    launch_dir_display: Option<String>,
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
            let dto = self.build_service_dto(attributed).await;
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

    async fn build_service_dto(&self, attributed: AttributedListener) -> LocalServiceDto {
        let listener = attributed.listener;
        let protected = is_protected_listener(&listener);
        let dependency = looks_like_dependency(&listener);
        let container_proxy = looks_like_container_proxy(&listener);
        let connect_host = connect_host(&listener.local_addr);
        let probe_url = format!("http://{}:{}", connect_host, listener.port);
        let browser_url = browser_url(&connect_host, listener.port);
        let mut status = if protected {
            LocalServiceStatus::Protected
        } else {
            LocalServiceStatus::Probing
        };
        let mut kind = if protected {
            LocalServiceKind::ProtectedAtmosInternal
        } else if dependency {
            LocalServiceKind::WorkspaceDependency
        } else if container_proxy {
            LocalServiceKind::WorkspaceContainerProxy
        } else {
            LocalServiceKind::LikelyWorkspaceServer
        };
        let mut title = None;
        let mut url = None;
        let mut can_open = false;

        if !protected && !dependency {
            match self.engine.probe_http(&probe_url).await {
                Ok(probe) if probe.browser_openable => {
                    status = LocalServiceStatus::Online;
                    kind = if container_proxy {
                        LocalServiceKind::WorkspaceContainerProxy
                    } else {
                        LocalServiceKind::WorkspaceDevServer
                    };
                    title = probe.title;
                    url = Some(browser_url.clone());
                    can_open = !container_proxy;
                }
                Ok(_) | Err(_) => {
                    status = LocalServiceStatus::NotHttp;
                }
            }
        } else if dependency {
            status = LocalServiceStatus::NotHttp;
        }

        let owner = LocalServiceOwnerDto {
            project_id: attributed.owner.project_id,
            project_name: attributed.owner.project_name,
            workspace_id: attributed.owner.workspace_id,
            workspace_name: attributed.owner.workspace_name,
            root_path: attributed.owner.root_display,
        };
        let can_stop = can_stop(&listener, protected, attributed.confidence, &status, &kind);
        let id = service_id(&owner, listener.pid, listener.port, &connect_host, &kind);

        LocalServiceDto {
            id,
            owner,
            kind,
            status,
            confidence: attributed.confidence,
            reasons: attributed.reasons,
            url,
            display_url: format!("localhost:{}", listener.port),
            port: listener.port,
            pid: listener.pid,
            process_name: listener.process_name,
            command_preview: command_preview(&listener.command_line),
            cwd_display: listener.cwd.as_deref().map(display_path),
            launch_dir_display: attributed.launch_dir_display,
            title,
            can_open,
            can_stop,
            protected,
            last_seen_at: Utc::now().to_rfc3339(),
        }
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

fn attribute_listener(
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

fn connect_host(local_addr: &str) -> String {
    match local_addr.trim_matches(['[', ']']) {
        "*" | "0.0.0.0" | "::" | "" => "127.0.0.1".into(),
        value => value.to_string(),
    }
}

fn browser_url(connect_host: &str, port: u16) -> String {
    let normalized = connect_host.trim_matches(['[', ']']);
    let host = if normalized == "127.0.0.1" || normalized == "::1" {
        "localhost"
    } else {
        connect_host
    };
    format!("http://{}:{}", host, port)
}

fn is_default_visible(service: &LocalServiceDto) -> bool {
    matches!(
        service.kind,
        LocalServiceKind::WorkspaceDevServer | LocalServiceKind::LikelyWorkspaceServer
    )
}

fn is_protected_listener(listener: &LocalTcpListener) -> bool {
    if listener.pid == Some(std::process::id()) {
        return true;
    }
    listener
        .process_name
        .as_deref()
        .map(|name| name.eq_ignore_ascii_case("tmux"))
        .unwrap_or(false)
}

fn looks_like_dependency(listener: &LocalTcpListener) -> bool {
    let name = listener
        .process_name
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(listener.port, 5432 | 3306 | 6379 | 27017)
        || ["redis", "postgres", "mysql", "mongod"]
            .iter()
            .any(|needle| name.contains(needle))
}

fn looks_like_container_proxy(listener: &LocalTcpListener) -> bool {
    let haystack = listener.command_line.join(" ").to_ascii_lowercase();
    ["docker", "colima", "kubectl", "podman"]
        .iter()
        .any(|needle| haystack.contains(needle))
}

fn dev_command_match(listener: &LocalTcpListener) -> bool {
    let tokens = listener
        .command_line
        .iter()
        .filter_map(|token| {
            Path::new(token)
                .file_name()
                .map(|value| value.to_string_lossy().to_ascii_lowercase())
        })
        .collect::<Vec<_>>();
    let dev_commands = [
        "npm",
        "pnpm",
        "yarn",
        "bun",
        "node",
        "vite",
        "next",
        "webpack",
        "astro",
        "nuxt",
        "storybook",
        "python",
        "uvicorn",
        "flask",
        "django",
        "rails",
        "puma",
        "cargo",
        "go",
        "gradle",
        "mvn",
    ];
    tokens
        .iter()
        .any(|token| dev_commands.iter().any(|candidate| token == candidate))
}

fn command_preview(tokens: &[String]) -> Option<String> {
    if tokens.is_empty() {
        return None;
    }
    let redacted = tokens
        .iter()
        .take(8)
        .map(|token| redact_token(token))
        .collect::<Vec<_>>()
        .join(" ");
    Some(redacted.chars().take(220).collect())
}

fn redact_token(token: &str) -> String {
    let lower = token.to_ascii_lowercase();
    let secretish = [
        "token", "secret", "password", "passwd", "apikey", "api_key", "bearer",
    ];
    if secretish.iter().any(|needle| lower.contains(needle)) || token.len() > 96 {
        "[redacted]".into()
    } else {
        token.to_string()
    }
}

fn can_stop(
    listener: &LocalTcpListener,
    protected: bool,
    confidence: f32,
    status: &LocalServiceStatus,
    kind: &LocalServiceKind,
) -> bool {
    if protected || listener.pid.is_none() || confidence < HIGH_CONFIDENCE {
        return false;
    }
    if !matches!(
        kind,
        LocalServiceKind::WorkspaceDevServer | LocalServiceKind::LikelyWorkspaceServer
    ) {
        return false;
    }
    if matches!(
        status,
        LocalServiceStatus::Protected | LocalServiceStatus::Stale
    ) {
        return false;
    }
    listener
        .user_id
        .as_deref()
        .map(is_current_user)
        .unwrap_or(true)
}

fn is_current_user(user_id: &str) -> bool {
    if let Ok(user) = std::env::var("USER") {
        if user_id == user {
            return true;
        }
    }
    if let Ok(output) = Command::new("id").arg("-u").output() {
        if output.status.success() {
            return user_id == String::from_utf8_lossy(&output.stdout).trim();
        }
    }
    false
}

fn service_id(
    owner: &LocalServiceOwnerDto,
    pid: Option<u32>,
    port: u16,
    connect_host: &str,
    kind: &LocalServiceKind,
) -> String {
    format!(
        "{}:{}:{}:{}:{:?}",
        owner
            .workspace_id
            .as_ref()
            .or(owner.project_id.as_ref())
            .map(String::as_str)
            .unwrap_or("unknown"),
        pid.map(|pid| pid.to_string())
            .unwrap_or_else(|| "nopid".into()),
        connect_host,
        port,
        kind
    )
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn owner_sort_key(service: &LocalServiceDto) -> String {
    format!(
        "{}:{}",
        service.owner.project_name.as_deref().unwrap_or_default(),
        service.owner.workspace_name.as_deref().unwrap_or_default()
    )
}

fn service_kind_rank(service: &LocalServiceDto) -> u8 {
    match service.kind {
        LocalServiceKind::WorkspaceDevServer => 0,
        LocalServiceKind::LikelyWorkspaceServer => 1,
        LocalServiceKind::WorkspaceContainerProxy => 2,
        LocalServiceKind::WorkspaceDependency => 3,
        LocalServiceKind::ProtectedAtmosInternal => 4,
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use core_engine::LocalTcpListener;

    use super::{attribute_listener, browser_url, command_preview, path_contains, ServiceRoot};

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

    #[test]
    fn command_preview_redacts_secretish_values() {
        assert_eq!(
            command_preview(&["node".into(), "API_TOKEN=abc".into()]).as_deref(),
            Some("node [redacted]")
        );
    }

    #[test]
    fn browser_url_uses_localhost_for_loopback_services() {
        assert_eq!(browser_url("127.0.0.1", 3030), "http://localhost:3030");
        assert_eq!(browser_url("::1", 3030), "http://localhost:3030");
        assert_eq!(
            browser_url("192.168.1.10", 3030),
            "http://192.168.1.10:3030"
        );
    }
}
