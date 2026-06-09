use chrono::Utc;
use core_engine::LocalServicesEngine;

use super::classification::{
    browser_url, can_stop, command_preview, connect_host, display_path, is_protected_listener,
    looks_like_container_proxy, looks_like_dependency, service_id,
};
use super::ownership::AttributedListener;
use super::{LocalServiceDto, LocalServiceKind, LocalServiceOwnerDto, LocalServiceStatus};

pub(super) async fn build_service_dto(
    engine: &LocalServicesEngine,
    attributed: AttributedListener,
) -> LocalServiceDto {
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
        match engine.probe_http(&probe_url).await {
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
