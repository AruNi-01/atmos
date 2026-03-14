use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use super::{AgentError, Result};

static MANIFEST_LOCK: std::sync::LazyLock<Mutex<()>> = std::sync::LazyLock::new(|| Mutex::new(()));

const INSTALL_MANIFEST_REL_PATH: &str = ".atmos/agent/acp_servers.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub(crate) struct InstallManifest {
    #[serde(alias = "entries")]
    pub registry: Vec<ManifestEntry>,
    #[serde(default)]
    pub custom_agents: std::collections::HashMap<String, CustomAgentEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ManifestEntry {
    pub registry_id: String,
    pub install_method: String,
    #[serde(default)]
    pub binary_path: Option<String>,
    #[serde(default)]
    pub npm_package: Option<String>,
    #[serde(default)]
    pub installed_version: Option<String>,
    #[serde(
        default,
        rename = "default_option_configs",
        skip_serializing_if = "Option::is_none"
    )]
    pub default_config: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct CustomAgentEntry {
    #[serde(rename = "type")]
    pub agent_type: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: std::collections::HashMap<String, String>,
    #[serde(
        default,
        rename = "default_option_configs",
        skip_serializing_if = "Option::is_none"
    )]
    pub default_config: Option<std::collections::HashMap<String, String>>,
}

pub(crate) fn manifest_path() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AgentError::Command("cannot resolve home directory".to_string()))?;
    Ok(home.join(INSTALL_MANIFEST_REL_PATH))
}

pub(crate) fn load_install_manifest() -> Result<InstallManifest> {
    let _guard = MANIFEST_LOCK
        .lock()
        .map_err(|e| AgentError::Command(format!("manifest lock poisoned: {}", e)))?;

    load_install_manifest_unlocked()
}

pub(crate) fn save_install_manifest(manifest: &InstallManifest) -> Result<()> {
    let _guard = MANIFEST_LOCK
        .lock()
        .map_err(|e| AgentError::Command(format!("manifest lock poisoned: {}", e)))?;

    save_install_manifest_unlocked(manifest)
}

/// Execute a read-modify-write operation on the manifest atomically.
/// The lock is held for the entire duration, preventing TOCTOU races.
pub(crate) fn with_manifest<F>(f: F) -> Result<()>
where
    F: FnOnce(&mut InstallManifest) -> Result<()>,
{
    let _guard = MANIFEST_LOCK
        .lock()
        .map_err(|e| AgentError::Command(format!("manifest lock poisoned: {}", e)))?;

    let mut manifest = load_install_manifest_unlocked()?;
    f(&mut manifest)?;
    save_install_manifest_unlocked(&manifest)
}

fn load_install_manifest_unlocked() -> Result<InstallManifest> {
    let path = manifest_path()?;
    if !path.exists() {
        let legacy = path
            .parent()
            .map(|agent_dir| agent_dir.join("installs.json"));
        if let Some(legacy_path) = legacy {
            if legacy_path.exists() {
                let _ = fs::rename(&legacy_path, &path);
            }
        }
        if !path.exists() {
            return Ok(InstallManifest::default());
        }
    }
    let data = fs::read_to_string(&path)
        .map_err(|e| AgentError::Command(format!("failed to read install manifest: {}", e)))?;
    serde_json::from_str(&data)
        .map_err(|e| AgentError::Command(format!("failed to parse install manifest: {}", e)))
}

fn save_install_manifest_unlocked(manifest: &InstallManifest) -> Result<()> {
    let path = manifest_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AgentError::Command(format!("failed to create manifest dir: {}", e)))?;
    }
    let data = serde_json::to_string_pretty(manifest)
        .map_err(|e| AgentError::Command(format!("failed to encode install manifest: {}", e)))?;
    fs::write(&path, data)
        .map_err(|e| AgentError::Command(format!("failed to write install manifest: {}", e)))
}

pub(crate) fn upsert_manifest_entry(manifest: &mut InstallManifest, entry: ManifestEntry) {
    if let Some(existing) = manifest
        .registry
        .iter_mut()
        .find(|e| e.registry_id == entry.registry_id && e.install_method == entry.install_method)
    {
        let mut entry = entry;
        let default_config = entry
            .default_config
            .take()
            .or(existing.default_config.take());
        let installed_version = entry
            .installed_version
            .take()
            .or(existing.installed_version.take());
        *existing = entry;
        existing.default_config = default_config;
        existing.installed_version = installed_version;
        return;
    }
    manifest.registry.push(entry);
}
