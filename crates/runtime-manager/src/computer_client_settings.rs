//! `~/.atmos/computer-client.json` — Hub device credential + relay settings (shared by Web/Desktop).
//!
//! APP-056: identity is Hub `user_id` + Hub-minted **device credential**.
//! There is no user-generated Relay Access Token / `POST /v1/tenants`.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::manifest::atmos_home_dir;
use crate::register::default_relay_url;

pub const COMPUTER_CLIENT_SETTINGS_VERSION: u32 = 1;
pub const COMPUTER_CLIENT_SETTINGS_FILE_NAME: &str = "computer-client.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ComputerClientSettings {
    pub version: u32,
    /// Hub-minted device credential (Relay Bearer).
    #[serde(default, alias = "access_token")]
    pub device_credential: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relay_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relay_secret_key: Option<String>,
}

impl Default for ComputerClientSettings {
    fn default() -> Self {
        Self {
            version: COMPUTER_CLIENT_SETTINGS_VERSION,
            device_credential: String::new(),
            device_id: None,
            relay_url: None,
            relay_secret_key: None,
        }
    }
}

impl ComputerClientSettings {
    pub fn new(device_credential: impl Into<String>, relay_url: Option<String>) -> Self {
        Self {
            version: COMPUTER_CLIENT_SETTINGS_VERSION,
            device_credential: device_credential.into(),
            device_id: None,
            relay_url,
            relay_secret_key: None,
        }
    }

    pub fn is_configured(&self) -> bool {
        self.device_credential.trim().len() >= 32
    }
}

pub fn computer_client_settings_path() -> PathBuf {
    atmos_home_dir()
        .unwrap_or_else(|_| PathBuf::from(".atmos"))
        .join(COMPUTER_CLIENT_SETTINGS_FILE_NAME)
}

pub fn read_computer_client_settings() -> Result<Option<ComputerClientSettings>, String> {
    let path = computer_client_settings_path();
    if !path.is_file() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|err| format!("Failed to read {}: {}", path.display(), err))?;
    let mut parsed: ComputerClientSettings = serde_json::from_str(&raw)
        .map_err(|err| format!("Failed to parse {}: {}", path.display(), err))?;
    if parsed.version != COMPUTER_CLIENT_SETTINGS_VERSION {
        return Err(format!(
            "Unsupported computer client settings version {} in {} (expected {})",
            parsed.version,
            path.display(),
            COMPUTER_CLIENT_SETTINGS_VERSION
        ));
    }
    if parsed
        .relay_url
        .as_ref()
        .is_some_and(|s| s.trim().is_empty())
    {
        parsed.relay_url = None;
    }
    if parsed
        .relay_secret_key
        .as_ref()
        .is_some_and(|s| s.trim().is_empty())
    {
        parsed.relay_secret_key = None;
    }
    if parsed
        .device_id
        .as_ref()
        .is_some_and(|s| s.trim().is_empty())
    {
        parsed.device_id = None;
    }
    Ok(Some(parsed))
}

pub fn write_computer_client_settings(
    settings: &ComputerClientSettings,
) -> Result<PathBuf, String> {
    if settings.version != COMPUTER_CLIENT_SETTINGS_VERSION {
        return Err(format!(
            "Unsupported computer client settings version {} (expected {})",
            settings.version, COMPUTER_CLIENT_SETTINGS_VERSION
        ));
    }
    let path = computer_client_settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create {}: {}", parent.display(), err))?;
    }
    let payload = serde_json::to_string_pretty(settings)
        .map_err(|err| format!("Failed to serialize computer client settings: {err}"))?;
    write_restricted_file(&path, &format!("{payload}\n"))?;
    Ok(path)
}

pub fn clear_computer_client_settings() -> Result<bool, String> {
    let path = computer_client_settings_path();
    if !path.is_file() {
        return Ok(false);
    }
    fs::remove_file(&path)
        .map_err(|err| format!("Failed to remove {}: {}", path.display(), err))?;
    Ok(true)
}

pub fn resolved_relay_url(settings: &ComputerClientSettings) -> String {
    settings
        .relay_url
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .map(crate::register::normalize_relay_url)
        .unwrap_or_else(|| default_relay_url().to_string())
}

fn write_restricted_file(path: &Path, contents: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
            .map_err(|err| format!("Failed to write {}: {}", path.display(), err))?;
        file.write_all(contents.as_bytes())
            .map_err(|err| format!("Failed to write {}: {}", path.display(), err))?;
        Ok(())
    }

    #[cfg(not(unix))]
    {
        fs::write(path, contents)
            .map_err(|err| format!("Failed to write {}: {}", path.display(), err))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_roundtrip_json() {
        let s = ComputerClientSettings::default();
        let raw = serde_json::to_string(&s).unwrap();
        let back: ComputerClientSettings = serde_json::from_str(&raw).unwrap();
        assert_eq!(back.version, COMPUTER_CLIENT_SETTINGS_VERSION);
        assert!(back.device_credential.is_empty());
    }

    #[test]
    fn reads_legacy_access_token_alias() {
        let raw = r#"{"version":1,"access_token":"legacy-token-at-least-32-chars-long!!"}"#;
        let back: ComputerClientSettings = serde_json::from_str(raw).unwrap();
        assert!(back.device_credential.starts_with("legacy-token"));
    }
}
