//! `~/.atmos/runtime_manifest.json` — loopback API discovery (no auth token).

use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};

pub fn atmos_home_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Cannot determine home directory".to_string())?;
    Ok(home.join(".atmos"))
}

pub const RUNTIME_MANIFEST_VERSION: u32 = 1;
pub const RUNTIME_MANIFEST_FILE_NAME: &str = "runtime_manifest.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RuntimeManifest {
    pub version: u32,
    pub api: ApiEndpoint,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    pub started_at: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ApiEndpoint {
    pub host: String,
    pub port: u16,
    pub url: String,
    pub ws_url: String,
}

impl RuntimeManifest {
    pub fn new(
        host: impl Into<String>,
        port: u16,
        pid: Option<u32>,
        source: impl Into<String>,
    ) -> Self {
        let host = host.into();
        let client_host = client_loopback_host(&host);
        let url = http_base_url(&client_host, port);
        let ws_url = ws_base_url(&client_host, port);
        Self {
            version: RUNTIME_MANIFEST_VERSION,
            api: ApiEndpoint {
                host: client_host,
                port,
                url,
                ws_url,
            },
            pid,
            started_at: Utc::now().to_rfc3339(),
            source: source.into(),
        }
    }
}

/// Host clients should use to reach the API (normalize `0.0.0.0` bind address).
fn client_loopback_host(bind_host: &str) -> String {
    if bind_host == "0.0.0.0" || bind_host == "::" {
        "127.0.0.1".to_string()
    } else {
        bind_host.to_string()
    }
}

pub fn runtime_manifest_path() -> Result<PathBuf, String> {
    Ok(atmos_home_dir()?.join(RUNTIME_MANIFEST_FILE_NAME))
}

fn read_manifest_from_path(path: &Path) -> Result<RuntimeManifest, String> {
    let raw = fs::read_to_string(path)
        .map_err(|err| format!("Failed to read {}: {}", path.display(), err))?;
    let parsed: RuntimeManifest = serde_json::from_str(&raw)
        .map_err(|err| format!("Failed to parse {}: {}", path.display(), err))?;
    if parsed.version != RUNTIME_MANIFEST_VERSION {
        return Err(format!(
            "Unsupported runtime manifest version {} in {} (expected {})",
            parsed.version,
            path.display(),
            RUNTIME_MANIFEST_VERSION
        ));
    }
    Ok(parsed)
}

pub fn read_runtime_manifest() -> Result<Option<RuntimeManifest>, String> {
    let path = runtime_manifest_path()?;
    if !path.is_file() {
        return Ok(None);
    }
    Ok(Some(read_manifest_from_path(&path)?))
}

pub fn write_runtime_manifest(data: &RuntimeManifest) -> Result<PathBuf, String> {
    let path = runtime_manifest_path()?;
    let dir = path
        .parent()
        .ok_or_else(|| format!("runtime manifest path has no parent: {}", path.display()))?;
    fs::create_dir_all(dir)
        .map_err(|err| format!("Failed to create {}: {}", dir.display(), err))?;

    let payload = serde_json::to_string_pretty(data)
        .map_err(|err| format!("Failed to serialize runtime manifest: {}", err))?;
    fs::write(&path, format!("{payload}\n"))
        .map_err(|err| format!("Failed to write {}: {}", path.display(), err))?;
    Ok(path)
}

pub fn remove_runtime_manifest() -> Result<(), String> {
    let path = runtime_manifest_path()?;
    if path.is_file() {
        fs::remove_file(&path)
            .map_err(|err| format!("Failed to remove {}: {}", path.display(), err))?;
    }
    Ok(())
}

/// Precedence: explicit → `ATMOS_API_URL` → `client-session.json` → `runtime_manifest.json`.
pub fn resolve_api_base_url(explicit: Option<&str>) -> Result<String, String> {
    if let Some(url) = explicit.filter(|value| !value.trim().is_empty()) {
        return Ok(url.trim().to_string());
    }
    if let Ok(env_url) = std::env::var("ATMOS_API_URL") {
        if !env_url.trim().is_empty() {
            return Ok(env_url.trim().to_string());
        }
    }
    if let Some(session) = crate::client_session::read_client_session()? {
        if session.api_base_url.trim().is_empty() {
            return Err(
                "client-session.json is missing api_base_url — reconnect via Settings → Atmos Computer, or pass --api-url."
                    .into(),
            );
        }
        return Ok(session.api_base_url.trim().to_string());
    }
    if let Some(manifest) = read_runtime_manifest()? {
        return Ok(manifest.api.url);
    }
    Err(
        "No API URL — start the local API (`atmos runtime ensure`), open Web/Desktop, or pass --api-url."
            .into(),
    )
}

/// Bearer token for non-loopback / hardened API.
pub fn resolve_api_bearer_token(explicit: Option<&str>) -> Option<String> {
    if let Some(token) = explicit.filter(|t| !t.is_empty()) {
        return Some(token.to_string());
    }
    for key in ["ATMOS_API_TOKEN", "ATMOS_LOCAL_TOKEN"] {
        if let Ok(token) = std::env::var(key) {
            if !token.trim().is_empty() {
                return Some(token);
            }
        }
    }
    crate::client_session::read_client_session()
        .ok()
        .flatten()
        .map(|s| s.gateway_token)
        .filter(|t| !t.is_empty())
}

fn http_base_url(host: &str, port: u16) -> String {
    format!("http://{}:{}", host, port)
}

fn ws_base_url(host: &str, port: u16) -> String {
    format!("ws://{}:{}", host, port)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, MutexGuard};
    use tempfile::TempDir;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    struct EnvGuard {
        _lock: MutexGuard<'static, ()>,
        saved_home: Option<std::ffi::OsString>,
        saved_api_url: Result<String, std::env::VarError>,
    }

    impl EnvGuard {
        fn new() -> Self {
            let _lock = ENV_LOCK.lock().unwrap();
            Self {
                _lock,
                saved_home: std::env::var_os("HOME"),
                saved_api_url: std::env::var("ATMOS_API_URL"),
            }
        }

        fn set_home(&self, home: &std::path::Path) {
            unsafe { std::env::set_var("HOME", home) };
        }
    }

    impl Drop for EnvGuard {
        fn drop(&mut self) {
            match &self.saved_home {
                Some(value) => unsafe { std::env::set_var("HOME", value) },
                None => unsafe { std::env::remove_var("HOME") },
            }
            match &self.saved_api_url {
                Ok(value) => unsafe { std::env::set_var("ATMOS_API_URL", value) },
                Err(_) => unsafe { std::env::remove_var("ATMOS_API_URL") },
            }
        }
    }

    #[test]
    fn round_trips_runtime_manifest() {
        let guard = EnvGuard::new();
        let tmp = TempDir::new().unwrap();
        guard.set_home(tmp.path());

        let data = RuntimeManifest::new("127.0.0.1", 30303, Some(42), "api");
        write_runtime_manifest(&data).unwrap();

        let loaded = read_runtime_manifest()
            .unwrap()
            .expect("runtime manifest should exist");
        assert_eq!(loaded, data);
    }

    #[test]
    fn bind_all_interfaces_maps_to_loopback_in_manifest() {
        let m = RuntimeManifest::new("0.0.0.0", 30303, None, "api");
        assert_eq!(m.api.host, "127.0.0.1");
    }

    #[test]
    fn resolve_api_base_url_uses_relay_gateway_from_client_session() {
        let guard = EnvGuard::new();
        let tmp = TempDir::new().unwrap();
        guard.set_home(tmp.path());

        crate::client_session::write_client_session(&crate::client_session::ClientSession::new(
            "sid",
            "https://relay.example/v1/computers/sid/proxy",
            "client-token",
        ))
        .unwrap();

        let url = resolve_api_base_url(None).unwrap();
        assert_eq!(url, "https://relay.example/v1/computers/sid/proxy");
    }
}
