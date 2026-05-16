//! `~/.atmos/local/state.json` — optional client session hint (Web/Desktop).
//!
//! **Local mode:** file is cleared; CLI uses `runtime_manifest.json` from the running API.
//! **Relay mode:** client writes `connection_mode`, `server_id`, `url` (gateway base), `token` (client_token).

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::manifest::atmos_home_dir;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ClientState {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub connection_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_id: Option<String>,
}

pub fn client_state_path() -> PathBuf {
    atmos_home_dir()
        .unwrap_or_else(|_| PathBuf::from(".atmos"))
        .join("local")
        .join("state.json")
}

pub fn read_client_state() -> Result<Option<ClientState>, String> {
    let path = client_state_path();
    if !path.is_file() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|err| format!("Failed to read {}: {}", path.display(), err))?;
    let parsed: ClientState = serde_json::from_str(&raw)
        .map_err(|err| format!("Failed to parse {}: {}", path.display(), err))?;
    Ok(Some(parsed))
}

pub fn write_client_state(state: &ClientState) -> Result<PathBuf, String> {
    let path = client_state_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create {}: {}", parent.display(), err))?;
    }
    let payload = serde_json::to_string_pretty(state)
        .map_err(|err| format!("Failed to serialize client state: {}", err))?;
    fs::write(&path, format!("{payload}\n"))
        .map_err(|err| format!("Failed to write {}: {}", path.display(), err))?;
    Ok(path)
}

pub fn clear_client_state() -> Result<(), String> {
    let path = client_state_path();
    if path.is_file() {
        fs::remove_file(&path)
            .map_err(|err| format!("Failed to remove {}: {}", path.display(), err))?;
    }
    Ok(())
}
