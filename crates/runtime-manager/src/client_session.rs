//! `~/.atmos/client-session.json` — which Atmos Computer the UI (and CLI) target.
//!
//! **Absent:** CLI uses `runtime_manifest.json` (loopback API on this machine).
//! **Present:** UI is on relay; CLI uses `api_base_url` + `gateway_token` (same Computer as UI).

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::manifest::atmos_home_dir;

pub const CLIENT_SESSION_VERSION: u32 = 1;
pub const CLIENT_SESSION_FILE_NAME: &str = "client-session.json";

/// Written by Web/Desktop when the user connects via relay; cleared on local mode.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ClientSession {
    pub version: u32,
    pub server_id: String,
    pub api_base_url: String,
    pub gateway_token: String,
}

impl ClientSession {
    pub fn new(
        server_id: impl Into<String>,
        api_base_url: impl Into<String>,
        gateway_token: impl Into<String>,
    ) -> Self {
        Self {
            version: CLIENT_SESSION_VERSION,
            server_id: server_id.into(),
            api_base_url: api_base_url.into(),
            gateway_token: gateway_token.into(),
        }
    }
}

pub fn client_session_path() -> PathBuf {
    atmos_home_dir()
        .unwrap_or_else(|_| PathBuf::from(".atmos"))
        .join(CLIENT_SESSION_FILE_NAME)
}

pub fn read_client_session() -> Result<Option<ClientSession>, String> {
    let path = client_session_path();
    if !path.is_file() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|err| format!("Failed to read {}: {}", path.display(), err))?;
    let parsed: ClientSession = serde_json::from_str(&raw)
        .map_err(|err| format!("Failed to parse {}: {}", path.display(), err))?;
    if parsed.version != CLIENT_SESSION_VERSION {
        return Err(format!(
            "Unsupported client session version {} in {} (expected {})",
            parsed.version,
            path.display(),
            CLIENT_SESSION_VERSION
        ));
    }
    Ok(Some(parsed))
}

pub fn write_client_session(session: &ClientSession) -> Result<PathBuf, String> {
    if session.version != CLIENT_SESSION_VERSION {
        return Err(format!(
            "Unsupported client session version {} (expected {})",
            session.version, CLIENT_SESSION_VERSION
        ));
    }
    let path = client_session_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create {}: {}", parent.display(), err))?;
    }
    let payload = serde_json::to_string_pretty(session)
        .map_err(|err| format!("Failed to serialize client session: {}", err))?;
    fs::write(&path, format!("{payload}\n"))
        .map_err(|err| format!("Failed to write {}: {}", path.display(), err))?;
    Ok(path)
}

pub fn clear_client_session() -> Result<(), String> {
    let path = client_session_path();
    if path.is_file() {
        fs::remove_file(&path)
            .map_err(|err| format!("Failed to remove {}: {}", path.display(), err))?;
    }
    Ok(())
}
