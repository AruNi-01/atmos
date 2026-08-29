use std::collections::HashSet;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::models::{KnownAgent, RegistryAgent};

use super::manifest::{load_install_manifest, save_install_manifest};
use super::npm::{list_global_npm_packages, normalize_npm_package_name, npx_command_preview};
use super::provision::{
    classify_registry_agent, native_cli_command, overlay_registry_agent, which_executable,
    AcpProvisionKind, LOCAL_NATIVE_ACP_AGENTS,
};
use super::{AgentError, Result};

pub(crate) const ACP_REGISTRY_URL: &str =
    "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
pub(crate) const ACP_REGISTRY_CACHE_REL_PATH: &str = ".atmos/config/agent/acp_registry.json";

const REGISTRY_CACHE_TTL_SECS: i64 = 12 * 60 * 60; // 12 hours

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct RegistryRoot {
    pub agents: Vec<RegistryEntry>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct RegistryEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub repository: Option<String>,
    pub icon: Option<String>,
    pub distribution: RegistryDistribution,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct RegistryDistribution {
    pub npx: Option<RegistryPackageDistribution>,
    pub binary: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct RegistryPackageDistribution {
    pub package: String,
    pub args: Option<Vec<String>>,
    pub env: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RegistryCache {
    #[serde(flatten)]
    registry: RegistryRoot,
    cached_at: i64,
}

pub(crate) fn acp_registry_cache_path() -> Result<std::path::PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AgentError::Command("cannot resolve home directory".to_string()))?;
    Ok(home.join(ACP_REGISTRY_CACHE_REL_PATH))
}

pub(crate) async fn fetch_acp_registry_from_url() -> Result<RegistryRoot> {
    let client = reqwest::Client::new();
    let response = client
        .get(ACP_REGISTRY_URL)
        .send()
        .await
        .map_err(|e| AgentError::Command(format!("failed to fetch ACP registry: {}", e)))?;

    if !response.status().is_success() {
        return Err(AgentError::Command(format!(
            "ACP registry returned status {}",
            response.status()
        )));
    }

    response
        .json::<RegistryRoot>()
        .await
        .map_err(|e| AgentError::Command(format!("failed to parse ACP registry: {}", e)))
}

pub(crate) async fn fetch_acp_registry(force_refresh: bool) -> Result<RegistryRoot> {
    let path = acp_registry_cache_path()?;
    let now = chrono::Utc::now().timestamp();

    if path.exists() && !force_refresh {
        if let Ok(data) = fs::read_to_string(&path) {
            if let Ok(cache) = serde_json::from_str::<RegistryCache>(&data) {
                let cache_age = now.saturating_sub(cache.cached_at);
                if cache_age < REGISTRY_CACHE_TTL_SECS {
                    return Ok(cache.registry);
                }
            } else if let Ok(registry) = serde_json::from_str::<RegistryRoot>(&data) {
                return Ok(registry);
            }
        }
    }

    let registry = fetch_acp_registry_from_url().await?;
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let cache = RegistryCache {
        registry,
        cached_at: now,
    };
    if let Ok(data) = serde_json::to_string_pretty(&cache) {
        let _ = fs::write(&path, data);
    }

    Ok(cache.registry)
}

pub(crate) async fn list_registry_agents_impl(
    known_agents: &[KnownAgent],
    force_refresh: bool,
) -> Result<Vec<RegistryAgent>> {
    let _ = known_agents; // available if needed in the future
    let registry = fetch_acp_registry(force_refresh).await?;
    let installed_npm_result = list_global_npm_packages().await;
    let npm_scan_available = installed_npm_result.is_ok();
    let installed_npm = installed_npm_result.unwrap_or_default();
    let mut manifest = load_install_manifest().unwrap_or_default();

    // Remove entries that no longer exist
    let before = manifest.registry.len();
    manifest.registry.retain(|e| {
        if e.install_method == "binary" {
            e.binary_path
                .as_ref()
                .map(|p| Path::new(p).exists())
                .unwrap_or(false)
        } else if e.install_method == "npx" {
            if !npm_scan_available {
                return true;
            }
            if let Some(ref pkg) = e.npm_package {
                return installed_npm.contains_key(pkg);
            }
            registry
                .agents
                .iter()
                .find(|a| a.id == e.registry_id)
                .and_then(|a| a.distribution.npx.as_ref())
                .map(|npx| installed_npm.contains_key(&normalize_npm_package_name(&npx.package)))
                .unwrap_or(false)
        } else {
            true
        }
    });
    if manifest.registry.len() != before {
        let _ = save_install_manifest(&manifest);
    }

    let installed_registry_ids: HashSet<String> = manifest
        .registry
        .iter()
        .filter(|e| {
            if e.install_method == "npx" {
                if let Some(ref pkg) = e.npm_package {
                    return installed_npm.contains_key(pkg);
                }
                registry
                    .agents
                    .iter()
                    .find(|a| a.id == e.registry_id)
                    .and_then(|a| a.distribution.npx.as_ref())
                    .map(|npx| {
                        installed_npm.contains_key(&normalize_npm_package_name(&npx.package))
                    })
                    .unwrap_or(false)
            } else if e.install_method == "binary" || e.install_method == "native" {
                e.binary_path
                    .as_ref()
                    .map(|p| Path::new(p).exists())
                    .unwrap_or(false)
            } else {
                false
            }
        })
        .map(|e| e.registry_id.clone())
        .collect();

    let mut out = Vec::with_capacity(registry.agents.len());
    for agent in registry.agents {
        let has_npx = agent.distribution.npx.is_some();
        let has_binary = agent.distribution.binary.is_some();
        if !has_npx && !has_binary {
            continue;
        }

        let classified = classify_registry_agent(&agent);
        let path_exe = classified
            .native_executable
            .as_deref()
            .and_then(which_executable);
        let manifest_entry = manifest
            .registry
            .iter()
            .find(|entry| entry.registry_id == agent.id);
        let atmos_managed_download = manifest_entry
            .map(|entry| entry.install_method == "npx" || entry.install_method == "binary")
            .unwrap_or(false)
            && installed_registry_ids.contains(&agent.id);
        let native_bound = manifest_entry
            .map(|entry| {
                entry.install_method == "native"
                    && entry
                        .binary_path
                        .as_ref()
                        .map(|path| Path::new(path).exists())
                        .unwrap_or(false)
            })
            .unwrap_or(false);

        let is_installed = match classified.kind {
            AcpProvisionKind::Native => {
                path_exe.is_some() || native_bound || atmos_managed_download
            }
            AcpProvisionKind::Adapter => installed_registry_ids.contains(&agent.id),
        };
        let can_remove = match classified.kind {
            AcpProvisionKind::Native => atmos_managed_download && path_exe.is_none(),
            AcpProvisionKind::Adapter => is_installed,
        };

        let install_method = if classified.kind == AcpProvisionKind::Native && path_exe.is_some() {
            "native".to_string()
        } else if has_npx {
            "npx".to_string()
        } else {
            "binary".to_string()
        };

        let cli_command = if classified.kind == AcpProvisionKind::Native {
            let exe = classified.native_executable.as_deref().unwrap_or("agent");
            native_cli_command(exe, &classified.args)
        } else if let Some(npx) = &agent.distribution.npx {
            npx_command_preview(npx)
        } else {
            "binary agent (platform package)".to_string()
        };

        let installed_version = if !is_installed {
            None
        } else if let Some(npx) = &agent.distribution.npx {
            let pkg_name = normalize_npm_package_name(&npx.package);
            installed_npm
                .get(&pkg_name)
                .cloned()
                .or_else(|| manifest_entry.and_then(|entry| entry.installed_version.clone()))
        } else {
            manifest_entry.and_then(|entry| entry.installed_version.clone())
        };

        let default_config = if is_installed {
            manifest_entry.and_then(|entry| entry.default_config.clone())
        } else {
            None
        };

        out.push(RegistryAgent {
            id: agent.id,
            name: agent.name,
            version: agent.version,
            description: agent.description,
            repository: agent.repository,
            icon: agent.icon,
            cli_command,
            install_method,
            package: agent
                .distribution
                .npx
                .as_ref()
                .map(|npx| npx.package.clone()),
            installed: is_installed,
            installed_version,
            default_config,
            provision_kind: classified.kind.as_str().to_string(),
            native_executable: classified.native_executable,
            terminal_agent_id: classified.terminal_agent_id,
            can_remove,
        });
    }

    let existing_ids: HashSet<String> = out.iter().map(|agent| agent.id.clone()).collect();
    for local in LOCAL_NATIVE_ACP_AGENTS {
        if existing_ids.contains(local.id) {
            continue;
        }
        let listed = overlay_registry_agent(local, &manifest);
        if listed.installed {
            out.push(listed);
        }
    }

    Ok(out)
}
