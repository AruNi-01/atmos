//! Canonical local API discovery written to `~/.atmos/runtime_manifest.json`.
//!
//! Any `apps/api` process that binds a listen socket should refresh this file so
//! CLI tools and the Next.js dev server can find the same host/port/token the
//! browser runtime uses.

mod register;
mod server_identity;

pub use register::{
    default_control_plane_url, normalize_control_plane_url, register_computer,
};
pub use server_identity::{
    read_server_identity, relay_identity_path, resolve_server_identity_path,
    server_identity_env_path_override, write_server_identity, ServerIdentity,
    RELAY_IDENTITY_FILE_NAME,
};
use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};

pub const RUNTIME_MANIFEST_VERSION: u32 = 1;
pub const RUNTIME_MANIFEST_FILE_NAME: &str = "runtime_manifest.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RuntimeManifest {
    pub version: u32,
    pub api: ApiEndpoint,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
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
        token: Option<String>,
        pid: Option<u32>,
        source: impl Into<String>,
    ) -> Self {
        let host = host.into();
        let url = http_base_url(&host, port);
        let ws_url = ws_base_url(&host, port);
        Self {
            version: RUNTIME_MANIFEST_VERSION,
            api: ApiEndpoint {
                host,
                port,
                url,
                ws_url,
            },
            token,
            pid,
            started_at: Utc::now().to_rfc3339(),
            source: source.into(),
        }
    }
}

pub fn atmos_home_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Cannot determine home directory".to_string())?;
    Ok(home.join(".atmos"))
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

/// Resolve the API base URL for native clients (CLI, scripts).
///
/// Precedence: explicit flag → `ATMOS_API_URL` → `runtime_manifest.json` →
/// `~/.atmos/local/state.json` (from `atmos local start`).
pub fn resolve_api_base_url(explicit: Option<&str>) -> Result<String, String> {
    if let Some(url) = explicit.filter(|value| !value.trim().is_empty()) {
        return Ok(url.trim().to_string());
    }
    if let Ok(env_url) = std::env::var("ATMOS_API_URL") {
        if !env_url.trim().is_empty() {
            return Ok(env_url.trim().to_string());
        }
    }
    if let Some(manifest) = read_runtime_manifest()? {
        return Ok(manifest.api.url);
    }
    if let Ok(url) = read_legacy_local_state_url() {
        return Ok(url);
    }
    Err(
        "API URL not found — pass --api-url, set ATMOS_API_URL, start `just dev-api` / Desktop, or run `atmos local start`."
            .into(),
    )
}

pub fn resolve_api_token(explicit: Option<&str>) -> Option<String> {
    if let Some(token) = explicit.filter(|value| !value.is_empty()) {
        return Some(token.to_string());
    }
    if let Ok(env_token) = std::env::var("ATMOS_API_TOKEN") {
        if !env_token.trim().is_empty() {
            return Some(env_token);
        }
    }
    if let Ok(Some(manifest)) = read_runtime_manifest() {
        if let Some(token) = manifest.token.filter(|value| !value.is_empty()) {
            return Some(token);
        }
    }
    None
}

fn read_legacy_local_state_url() -> Result<String, String> {
    let path = legacy_local_state_path();
    if !path.is_file() {
        return Err("legacy local state missing".into());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|err| format!("Failed to read {}: {}", path.display(), err))?;
    let value: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|err| format!("Failed to parse {}: {}", path.display(), err))?;
    value
        .get("url")
        .and_then(|url| url.as_str())
        .map(|url| url.to_string())
        .ok_or_else(|| format!("{} is missing a url field", path.display()))
}

fn legacy_local_state_path() -> PathBuf {
    atmos_home_dir()
        .unwrap_or_else(|_| PathBuf::from(".atmos"))
        .join("local")
        .join("state.json")
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
        let home = tmp.path().join("home");
        guard.set_home(&home);

        let data =
            RuntimeManifest::new("127.0.0.1", 30303, Some("secret".into()), Some(42), "api");
        write_runtime_manifest(&data).unwrap();

        let loaded = read_runtime_manifest()
            .unwrap()
            .expect("runtime manifest should exist");
        assert_eq!(loaded, data);
    }

    #[test]
    fn resolve_prefers_env_over_manifest_file() {
        let guard = EnvGuard::new();
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join("home");
        guard.set_home(&home);

        write_runtime_manifest(&RuntimeManifest::new(
            "127.0.0.1",
            30303,
            None,
            None,
            "api",
        ))
        .unwrap();
        unsafe { std::env::set_var("ATMOS_API_URL", "http://example.test:9") };

        let url = resolve_api_base_url(None).unwrap();
        assert_eq!(url, "http://example.test:9");
    }
}
