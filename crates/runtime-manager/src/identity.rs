//! `~/.atmos/relay_identity.json` — outbound relay credentials for this Computer.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::manifest::atmos_home_dir;

pub const RELAY_IDENTITY_FILE_NAME: &str = "relay_identity.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ServerIdentity {
    pub server_id: String,
    pub server_secret: String,
    pub relay_ws_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub control_plane_url: Option<String>,
    /// How this Computer was registered (client channel + optional client version).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub registration_meta: Option<Value>,
}

pub fn relay_identity_path() -> Result<PathBuf, String> {
    Ok(atmos_home_dir()?.join(RELAY_IDENTITY_FILE_NAME))
}

pub fn server_identity_env_path_override() -> Option<PathBuf> {
    std::env::var_os("ATMOS_SERVER_IDENTITY_PATH").map(PathBuf::from)
}

pub fn resolve_server_identity_path() -> PathBuf {
    server_identity_env_path_override().unwrap_or_else(|| {
        atmos_home_dir()
            .map(|p| p.join(RELAY_IDENTITY_FILE_NAME))
            .unwrap_or_else(|_| PathBuf::from(format!(".atmos/{RELAY_IDENTITY_FILE_NAME}")))
    })
}

pub fn read_server_identity() -> Result<Option<ServerIdentity>, String> {
    let path = resolve_server_identity_path();
    if !path.is_file() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|err| format!("Failed to read {}: {}", path.display(), err))?;
    let parsed: ServerIdentity = serde_json::from_str(&raw)
        .map_err(|err| format!("Failed to parse {}: {}", path.display(), err))?;
    Ok(Some(parsed))
}

pub fn clear_server_identity() -> Result<bool, String> {
    let path = resolve_server_identity_path();
    if !path.is_file() {
        return Ok(false);
    }
    fs::remove_file(&path)
        .map_err(|err| format!("Failed to remove {}: {}", path.display(), err))?;
    Ok(true)
}

pub fn write_server_identity(data: &ServerIdentity) -> Result<PathBuf, String> {
    let path = resolve_server_identity_path();
    let dir = path
        .parent()
        .ok_or_else(|| format!("identity path has no parent: {}", path.display()))?;
    fs::create_dir_all(dir)
        .map_err(|err| format!("Failed to create {}: {}", dir.display(), err))?;
    let payload = serde_json::to_string_pretty(data)
        .map_err(|err| format!("Failed to serialize {}: {}", RELAY_IDENTITY_FILE_NAME, err))?;
    write_identity_file_restricted(&path, &format!("{payload}\n"))?;
    Ok(path)
}

fn write_identity_file_restricted(path: &std::path::Path, contents: &str) -> Result<(), String> {
    use std::io::Write;

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
            .map_err(|err| format!("Failed to write {}: {}", path.display(), err))?;
        file.write_all(contents.as_bytes())
            .map_err(|err| format!("Failed to write {}: {}", path.display(), err))?;
        return Ok(());
    }

    #[cfg(not(unix))]
    {
        fs::write(path, contents)
            .map_err(|err| format!("Failed to write {}: {}", path.display(), err))?;
        Ok(())
    }
}
