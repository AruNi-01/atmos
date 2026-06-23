use std::path::Path;
use std::process::Command;

use core_engine::LocalTcpListener;

use super::{LocalServiceDto, LocalServiceKind, LocalServiceOwnerDto, LocalServiceStatus};

const HIGH_CONFIDENCE: f32 = 0.75;

pub(super) fn connect_host(local_addr: &str) -> String {
    match local_addr.trim_matches(['[', ']']) {
        "*" | "0.0.0.0" | "::" | "" => "127.0.0.1".into(),
        value => value.to_string(),
    }
}

pub(super) fn browser_url(connect_host: &str, port: u16) -> String {
    let normalized = connect_host.trim_matches(['[', ']']);
    let host = if normalized == "127.0.0.1" || normalized == "::1" {
        "localhost"
    } else {
        connect_host
    };
    format!("http://{}:{}", host, port)
}

pub(super) fn probe_url(connect_host: &str, port: u16) -> String {
    let normalized = connect_host.trim_matches(['[', ']']);
    let host = if normalized.contains(':') {
        format!("[{}]", normalized)
    } else {
        normalized.to_string()
    };
    format!("http://{}:{}", host, port)
}

pub(super) fn is_default_visible(service: &LocalServiceDto) -> bool {
    matches!(
        service.kind,
        LocalServiceKind::WorkspaceDevServer | LocalServiceKind::LikelyWorkspaceServer
    )
}

pub(super) fn is_protected_listener(listener: &LocalTcpListener) -> bool {
    if listener.pid == Some(std::process::id()) {
        return true;
    }
    listener
        .process_name
        .as_deref()
        .map(|name| name.eq_ignore_ascii_case("tmux"))
        .unwrap_or(false)
}

pub(super) fn looks_like_dependency(listener: &LocalTcpListener) -> bool {
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

pub(super) fn looks_like_container_proxy(listener: &LocalTcpListener) -> bool {
    let haystack = listener.command_line.join(" ").to_ascii_lowercase();
    ["docker", "colima", "kubectl", "podman"]
        .iter()
        .any(|needle| haystack.contains(needle))
}

pub(super) fn dev_command_match(listener: &LocalTcpListener) -> bool {
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

pub(super) fn command_preview(tokens: &[String]) -> Option<String> {
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

pub(super) fn can_stop(
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

pub(super) fn service_id(
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

pub(super) fn display_path(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

pub(super) fn owner_sort_key(service: &LocalServiceDto) -> String {
    format!(
        "{}:{}",
        service.owner.project_name.as_deref().unwrap_or_default(),
        service.owner.workspace_name.as_deref().unwrap_or_default()
    )
}

pub(super) fn service_kind_rank(service: &LocalServiceDto) -> u8 {
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
    use super::{browser_url, command_preview, probe_url};

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

    #[test]
    fn probe_url_brackets_ipv6_hosts() {
        assert_eq!(probe_url("127.0.0.1", 3031), "http://127.0.0.1:3031");
        assert_eq!(probe_url("::1", 5173), "http://[::1]:5173");
        assert_eq!(probe_url("[::1]", 5173), "http://[::1]:5173");
    }
}
