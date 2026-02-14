use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::collections::HashSet;

use anyhow::Context;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::process::Command;

use crate::models::{
    AgentConfigState, AgentId, AgentInstallResult, AgentLaunchSpec, AgentStatus, KnownAgent,
    RegistryAgent, RegistryInstallResult,
};

const ACP_REGISTRY_URL: &str = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
const INSTALL_MANIFEST_REL_PATH: &str = ".atmos/agent/acp_servers.json";
const ACP_REGISTRY_CACHE_REL_PATH: &str = ".atmos/agent/acp_registry.json";

#[derive(Debug, Error)]
pub enum AgentError {
    #[error("agent not found: {0}")]
    NotFound(String),
    #[error("failed to execute command: {0}")]
    Command(String),
}

pub type Result<T> = std::result::Result<T, AgentError>;

#[derive(Debug, Default)]
pub struct AgentManager;

impl AgentManager {
    pub fn new() -> Self {
        Self
    }

    /// Fetch ACP registry from CDN and save to local cache. Call on service startup.
    pub async fn refresh_acp_registry_cache(&self) -> Result<()> {
        let registry = fetch_acp_registry_from_url().await?;
        let path = acp_registry_cache_path()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| AgentError::Command(format!("failed to create registry cache dir: {}", e)))?;
        }
        let data = serde_json::to_string_pretty(&registry)
            .map_err(|e| AgentError::Command(format!("failed to encode registry: {}", e)))?;
        fs::write(&path, data)
            .map_err(|e| AgentError::Command(format!("failed to write registry cache: {}", e)))?;
        Ok(())
    }

    pub fn list_supported_agents(&self) -> Vec<KnownAgent> {
        vec![
            KnownAgent {
                id: AgentId::ClaudeCode,
                registry_id: "claude-code-acp".to_string(),
                name: "Claude Code".to_string(),
                description: "Anthropic coding agent CLI (ACP compatible)".to_string(),
                npm_package: "@zed-industries/claude-code-acp".to_string(),
                executable: "claude-code-acp".to_string(),
                auth_paths: vec![".claude".to_string()],
            },
            KnownAgent {
                id: AgentId::Codex,
                registry_id: "codex-acp".to_string(),
                name: "Codex".to_string(),
                description: "OpenAI Codex CLI / ACP adapter".to_string(),
                npm_package: "@openai/codex".to_string(),
                executable: "codex".to_string(),
                auth_paths: vec![".codex".to_string()],
            },
            KnownAgent {
                id: AgentId::GeminiCli,
                registry_id: "gemini".to_string(),
                name: "Gemini CLI".to_string(),
                description: "Google Gemini command line agent".to_string(),
                npm_package: "@google/gemini-cli".to_string(),
                executable: "gemini".to_string(),
                auth_paths: vec![".config/gemini".to_string()],
            },
        ]
    }

    pub fn list_agent_status(&self) -> Vec<AgentStatus> {
        self.list_supported_agents()
            .into_iter()
            .map(|agent| {
                let executable_path = which::which(&agent.executable)
                    .ok()
                    .map(|p| p.to_string_lossy().to_string());
                let (auth_detected, auth_source) = detect_auth_source(&agent.auth_paths);

                AgentStatus {
                    id: agent.id,
                    registry_id: agent.registry_id,
                    name: agent.name,
                    description: agent.description,
                    npm_package: agent.npm_package,
                    executable: agent.executable,
                    installed: executable_path.is_some(),
                    executable_path,
                    auth_detected,
                    auth_source,
                }
            })
            .collect()
    }

    pub async fn install_agent(&self, id: AgentId) -> Result<AgentInstallResult> {
        let agent = self
            .list_supported_agents()
            .into_iter()
            .find(|a| a.id == id)
            .ok_or_else(|| AgentError::NotFound(id.as_str().to_string()))?;

        // Registry-first install strategy (official HTTP registry index)
        if let Some(result) = self.try_install_from_registry_index(&agent).await? {
            return Ok(result);
        }

        let output = Command::new("npm")
            .arg("install")
            .arg("-g")
            .arg(&agent.npm_package)
            .output()
            .await
            .with_context(|| "failed to run npm install")
            .map_err(|e| AgentError::Command(e.to_string()))?;

        if output.status.success() {
            return Ok(AgentInstallResult {
                id,
                installed: true,
                install_method: "npm".to_string(),
                message: format!("Installed {}", agent.name),
            });
        }

        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(AgentError::Command(format!(
            "npm install failed for {}: {}",
            agent.name, stderr
        )))
    }

    pub async fn list_registry_agents(&self) -> Result<Vec<RegistryAgent>> {
        let registry = fetch_acp_registry().await?;
        let installed_npm = list_global_npm_packages().await.unwrap_or_default();
        let mut manifest = load_install_manifest().unwrap_or_default();

        // Remove entries that no longer exist: binary file deleted, or npx package uninstalled
        let before = manifest.entries.len();
        manifest.entries.retain(|e| {
            if e.install_method == "binary" {
                e.binary_path
                    .as_ref()
                    .map(|p| Path::new(p).exists())
                    .unwrap_or(false)
            } else if e.install_method == "npx" {
                registry
                    .agents
                    .iter()
                    .find(|a| a.id == e.registry_id)
                    .and_then(|a| a.distribution.npx.as_ref())
                    .map(|npx| installed_npm.contains(&normalize_npm_package_name(&npx.package)))
                    .unwrap_or(false)
            } else {
                true
            }
        });
        if manifest.entries.len() != before {
            let _ = save_install_manifest(&manifest);
        }

        let installed_registry_ids: HashSet<String> = manifest
            .entries
            .iter()
            .filter(|e| {
                if e.install_method == "npx" {
                    registry
                        .agents
                        .iter()
                        .find(|a| a.id == e.registry_id)
                        .and_then(|a| a.distribution.npx.as_ref())
                        .map(|npx| installed_npm.contains(&normalize_npm_package_name(&npx.package)))
                        .unwrap_or(false)
                } else if e.install_method == "binary" {
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
            if let Some(npx) = &agent.distribution.npx {
                let id = agent.id.clone();
                out.push(RegistryAgent {
                    id,
                    name: agent.name,
                    version: agent.version,
                    description: agent.description,
                    repository: agent.repository,
                    icon: agent.icon,
                    cli_command: npx_command_preview(npx),
                    install_method: "npx".to_string(),
                    package: Some(npx.package.clone()),
                    installed: installed_registry_ids.contains(&agent.id),
                });
            } else if agent.distribution.binary.is_some() {
                let id = agent.id.clone();
                let is_installed = installed_registry_ids.contains(&agent.id);
                out.push(RegistryAgent {
                    id,
                    name: agent.name,
                    version: agent.version,
                    description: agent.description,
                    repository: agent.repository,
                    icon: agent.icon,
                    cli_command: "binary agent (platform package)".to_string(),
                    install_method: "binary".to_string(),
                    package: None,
                    installed: is_installed,
                });
            }
        }

        Ok(out)
    }

    pub async fn install_registry_agent(
        &self,
        registry_id: &str,
        force_overwrite: bool,
    ) -> Result<RegistryInstallResult> {
        let registry = fetch_acp_registry().await?;
        let entry = registry
            .agents
            .into_iter()
            .find(|a| a.id == registry_id)
            .ok_or_else(|| AgentError::NotFound(format!("registry agent: {}", registry_id)))?;

        let npx = if let Some(npx) = entry.distribution.npx.clone() {
            npx
        } else if entry.distribution.binary.is_some() {
            return self
                .install_registry_binary_agent(entry, registry_id, force_overwrite)
                .await;
        } else {
            return Err(AgentError::Command(format!(
                "registry agent '{}' has no supported distribution",
                registry_id
            )));
        };

        if !force_overwrite {
            if is_npm_package_installed_globally(&npx.package).await.unwrap_or(false) {
                return Ok(RegistryInstallResult {
                    registry_id: registry_id.to_string(),
                    installed: false,
                    install_method: "npx".to_string(),
                    message: String::new(),
                    needs_confirmation: Some(true),
                    overwrite_message: Some(format!(
                        "{} ({}) is already installed globally via npm. Install will overwrite/update. Continue?",
                        entry.name,
                        normalize_npm_package_name(&npx.package)
                    )),
                });
            }
        }

        let output = Command::new("npm")
            .arg("install")
            .arg("-g")
            .arg(&npx.package)
            .output()
            .await
            .with_context(|| "failed to run npm install from registry package")
            .map_err(|e| AgentError::Command(e.to_string()))?;

        if output.status.success() {
            let mut manifest = load_install_manifest().unwrap_or_default();
            upsert_manifest_entry(
                &mut manifest,
                ManifestEntry {
                    registry_id: registry_id.to_string(),
                    install_method: "npx".to_string(),
                    binary_path: None,
                },
            );
            let _ = save_install_manifest(&manifest);

            return Ok(RegistryInstallResult {
                registry_id: registry_id.to_string(),
                installed: true,
                install_method: "acp_registry".to_string(),
                message: format!("Installed {} ({})", entry.name, npx.package),
                needs_confirmation: None,
                overwrite_message: None,
            });
        }

        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(AgentError::Command(format!(
            "registry install failed for {}: {}",
            entry.name, stderr
        )))
    }

    pub async fn remove_registry_agent(&self, registry_id: &str) -> Result<RegistryInstallResult> {
        let registry = fetch_acp_registry().await?;
        let entry = registry
            .agents
            .into_iter()
            .find(|a| a.id == registry_id)
            .ok_or_else(|| AgentError::NotFound(format!("registry agent: {}", registry_id)))?;

        if let Some(npx) = entry.distribution.npx.as_ref() {
            let package = normalize_npm_package_name(&npx.package);

            let mut manifest = load_install_manifest().unwrap_or_default();
            manifest.entries.retain(|e| !(e.registry_id == registry_id && e.install_method == "npx"));
            let _ = save_install_manifest(&manifest);

            let output = Command::new("npm")
                .arg("uninstall")
                .arg("-g")
                .arg(&package)
                .output()
                .await
                .with_context(|| "failed to run npm uninstall from registry package")
                .map_err(|e| AgentError::Command(e.to_string()))?;

            if output.status.success() {
                return Ok(RegistryInstallResult {
                    registry_id: registry_id.to_string(),
                    installed: false,
                    install_method: "acp_registry".to_string(),
                    message: format!("Removed {} ({})", entry.name, package),
                    needs_confirmation: None,
                    overwrite_message: None,
                });
            }

            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(AgentError::Command(format!(
                "registry remove failed for {}: {}",
                entry.name, stderr
            )));
        }

        if entry.distribution.binary.is_some() {
            return self.remove_registry_binary_agent(&entry, registry_id);
        }

        Err(AgentError::Command(format!("registry agent '{}' has no supported distribution", registry_id)))
    }

    /// Returns the launch spec for an installed registry agent. Use when spawning the ACP agent process.
    /// Package, args, and env are read from the ACP registry (cached locally).
    pub async fn get_registry_agent_launch_spec(&self, registry_id: &str) -> Result<AgentLaunchSpec> {
        let manifest = load_install_manifest()?;
        let m_entry = manifest
            .entries
            .iter()
            .find(|e| e.registry_id == registry_id)
            .ok_or_else(|| AgentError::NotFound(format!("installed agent: {}", registry_id)))?;

        let registry = fetch_acp_registry().await?;
        let r_entry = registry
            .agents
            .iter()
            .find(|a| a.id == registry_id)
            .ok_or_else(|| AgentError::NotFound(format!("agent '{}' not in registry", registry_id)))?;

        if m_entry.install_method == "npx" {
            let npx = r_entry
                .distribution
                .npx
                .as_ref()
                .ok_or_else(|| AgentError::Command("registry entry has no npx distribution".to_string()))?;
            let mut args = vec![npx.package.clone()];
            args.extend(npx.args.clone().unwrap_or_default());
            return Ok(AgentLaunchSpec {
                program: "npx".to_string(),
                args,
                env: npx.env.clone(),
            });
        }

        if m_entry.install_method == "binary" {
            let binary_path = m_entry
                .binary_path
                .as_deref()
                .ok_or_else(|| AgentError::Command("binary entry missing binary_path".to_string()))?;
            if !Path::new(binary_path).exists() {
                return Err(AgentError::Command(format!(
                    "binary not found: {}",
                    binary_path
                )));
            }
            let args = resolve_binary_args(&r_entry.distribution)
                .unwrap_or_default();
            return Ok(AgentLaunchSpec {
                program: binary_path.to_string(),
                args,
                env: None,
            });
        }

        Err(AgentError::Command(format!(
            "unknown install_method: {}",
            m_entry.install_method
        )))
    }

    pub fn get_agent_config(&self, id: AgentId) -> Result<AgentConfigState> {
        let agent = self
            .list_supported_agents()
            .into_iter()
            .find(|a| a.id == id)
            .ok_or_else(|| AgentError::NotFound(id.as_str().to_string()))?;

        let (auth_detected, auth_source) = detect_auth_source(&agent.auth_paths);
        let has_stored_api_key = keyring_has_api_key(id).map_err(|e| AgentError::Command(e.to_string()))?;

        Ok(AgentConfigState {
            id,
            has_stored_api_key,
            auth_detected,
            auth_source,
        })
    }

    pub fn set_agent_api_key(&self, id: AgentId, api_key: &str) -> Result<()> {
        if api_key.trim().is_empty() {
            return Err(AgentError::Command("api_key cannot be empty".to_string()));
        }
        keyring_set_api_key(id, api_key).map_err(|e| AgentError::Command(e.to_string()))
    }

    /// Get env overrides (API key) for spawning a registry agent. Injects keyring-stored API key into env.
    /// Returns None if no key is stored for this registry agent.
    pub fn get_registry_agent_env_overrides(
        &self,
        registry_id: &str,
    ) -> Option<std::collections::HashMap<String, String>> {
        let (agent_id, env_var) = match registry_id {
            "claude-code-acp" => (AgentId::ClaudeCode, "ANTHROPIC_API_KEY"),
            "codex-acp" => (AgentId::Codex, "OPENAI_API_KEY"),
            "gemini" => (AgentId::GeminiCli, "GEMINI_API_KEY"),
            _ => return None,
        };
        let key = keyring_get_api_key(agent_id).ok()?;
        if key.is_empty() {
            return None;
        }
        let mut map = std::collections::HashMap::new();
        map.insert(env_var.to_string(), key);
        Some(map)
    }

    async fn try_install_from_registry_index(
        &self,
        agent: &KnownAgent,
    ) -> Result<Option<AgentInstallResult>> {
        let registry = match fetch_acp_registry().await {
            Ok(value) => value,
            Err(_) => return Ok(None),
        };

        let entry = match registry.agents.into_iter().find(|a| a.id == agent.registry_id) {
            Some(v) => v,
            None => return Ok(None),
        };

        if let Some(npx) = entry.distribution.npx {
            let output = Command::new("npm")
                .arg("install")
                .arg("-g")
                .arg(&npx.package)
                .output()
                .await
                .with_context(|| "failed to run npm install from registry package")
                .map_err(|e| AgentError::Command(e.to_string()))?;

            if output.status.success() {
                return Ok(Some(AgentInstallResult {
                    id: agent.id,
                    installed: true,
                    install_method: "acp_registry".to_string(),
                    message: format!(
                        "Installed {} via ACP Registry package {}",
                        agent.name, npx.package
                    ),
                }));
            }
        }

        Ok(None)
    }

    async fn install_registry_binary_agent(
        &self,
        entry: RegistryEntry,
        registry_id: &str,
        force_overwrite: bool,
    ) -> Result<RegistryInstallResult> {
        let asset = resolve_binary_asset(&entry.distribution.binary).ok_or_else(|| {
            AgentError::Command(format!(
                "registry agent '{}' binary distribution is not yet supported for this platform",
                registry_id
            ))
        })?;

        let bin_dir = user_bin_dir()?;
        let file_name = asset
            .cmd
            .as_ref()
            .and_then(|s| s.strip_prefix("./").map(String::from))
            .unwrap_or_else(|| sanitize_registry_id(registry_id));
        let target_path = bin_dir.join(&file_name);

        if !force_overwrite && target_path.exists() {
            return Ok(RegistryInstallResult {
                registry_id: registry_id.to_string(),
                installed: false,
                install_method: "binary".to_string(),
                message: String::new(),
                needs_confirmation: Some(true),
                overwrite_message: Some(format!(
                    "{} already exists at {}. Install will overwrite. Continue?",
                    entry.name,
                    target_path.to_string_lossy()
                )),
            });
        }

        let response = reqwest::Client::new()
            .get(&asset.url)
            .send()
            .await
            .map_err(|e| AgentError::Command(format!("failed to download binary: {}", e)))?;
        if !response.status().is_success() {
            return Err(AgentError::Command(format!(
                "binary download failed for {} with status {}",
                entry.name,
                response.status()
            )));
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|e| AgentError::Command(format!("failed to read binary bytes: {}", e)))?;

        if looks_like_archive_url(&asset.url) {
            return Err(AgentError::Command(format!(
                "binary asset appears to be an archive for '{}'; archive extraction is not implemented yet",
                registry_id
            )));
        }

        fs::create_dir_all(&bin_dir)
            .map_err(|e| AgentError::Command(format!("failed to create bin dir: {}", e)))?;

        fs::write(&target_path, &bytes)
            .map_err(|e| AgentError::Command(format!("failed to write binary: {}", e)))?;
        #[cfg(unix)]
        {
            let mut perms = fs::metadata(&target_path)
                .map_err(|e| AgentError::Command(format!("failed to read binary metadata: {}", e)))?
                .permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&target_path, perms)
                .map_err(|e| AgentError::Command(format!("failed to set binary permissions: {}", e)))?;
        }

        let mut manifest = load_install_manifest().unwrap_or_default();
        let bin_path_str = target_path.to_string_lossy().to_string();
        upsert_manifest_entry(
            &mut manifest,
            ManifestEntry {
                registry_id: registry_id.to_string(),
                install_method: "binary".to_string(),
                binary_path: Some(bin_path_str),
            },
        );
        save_install_manifest(&manifest)?;

        Ok(RegistryInstallResult {
            registry_id: registry_id.to_string(),
            installed: true,
            install_method: "binary".to_string(),
            message: format!(
                "Installed {} binary to {}",
                entry.name,
                target_path.to_string_lossy()
            ),
            needs_confirmation: None,
            overwrite_message: None,
        })
    }

    fn remove_registry_binary_agent(
        &self,
        _entry: &RegistryEntry,
        registry_id: &str,
    ) -> Result<RegistryInstallResult> {
        let mut manifest = load_install_manifest().unwrap_or_default();
        let pos = manifest
            .entries
            .iter()
            .position(|e| e.registry_id == registry_id && e.install_method == "binary")
            .ok_or_else(|| {
                AgentError::Command(format!(
                    "no managed binary install found for '{}'",
                    registry_id
                ))
            })?;

        let entry = manifest.entries.remove(pos);
        let path = entry
            .binary_path
            .as_ref()
            .map(PathBuf::from)
            .ok_or_else(|| AgentError::Command("binary entry missing binary_path".to_string()))?;
        let bin_dir = user_bin_dir()?;
        if path.exists() {
            if !path.starts_with(&bin_dir) {
                return Err(AgentError::Command(format!(
                    "refusing to delete path outside install dir: {}",
                    path.to_string_lossy()
                )));
            }
            fs::remove_file(&path)
                .map_err(|e| AgentError::Command(format!("failed to remove binary file: {}", e)))?;
        }
        save_install_manifest(&manifest)?;

        Ok(RegistryInstallResult {
            registry_id: registry_id.to_string(),
            installed: false,
            install_method: "binary".to_string(),
            message: format!("Removed managed binary for '{}'", registry_id),
            needs_confirmation: None,
            overwrite_message: None,
        })
    }
}

fn detect_auth_source(auth_paths: &[String]) -> (bool, Option<String>) {
    let home = match dirs::home_dir() {
        Some(home) => home,
        None => return (false, None),
    };

    for rel in auth_paths {
        let full_path = home.join(PathBuf::from(rel));
        if full_path.exists() {
            return (true, Some(full_path.to_string_lossy().to_string()));
        }
    }

    (false, None)
}

fn keyring_entry(id: AgentId) -> std::result::Result<Entry, keyring::Error> {
    Entry::new("atmos-agent", id.as_str())
}

fn keyring_has_api_key(id: AgentId) -> std::result::Result<bool, keyring::Error> {
    let entry = keyring_entry(id)?;
    match entry.get_password() {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(e),
    }
}

fn keyring_get_api_key(id: AgentId) -> std::result::Result<String, keyring::Error> {
    let entry = keyring_entry(id)?;
    entry.get_password()
}

fn keyring_set_api_key(id: AgentId, api_key: &str) -> std::result::Result<(), keyring::Error> {
    let entry = keyring_entry(id)?;
    entry.set_password(api_key)
}

#[derive(Debug, Deserialize, Serialize)]
struct RegistryRoot {
    agents: Vec<RegistryEntry>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct RegistryEntry {
    id: String,
    name: String,
    version: String,
    description: String,
    repository: Option<String>,
    icon: Option<String>,
    distribution: RegistryDistribution,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct RegistryDistribution {
    npx: Option<RegistryPackageDistribution>,
    binary: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct RegistryPackageDistribution {
    package: String,
    args: Option<Vec<String>>,
    env: Option<std::collections::HashMap<String, String>>,
}

fn acp_registry_cache_path() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AgentError::Command("cannot resolve home directory".to_string()))?;
    Ok(home.join(ACP_REGISTRY_CACHE_REL_PATH))
}

async fn fetch_acp_registry_from_url() -> Result<RegistryRoot> {
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

async fn fetch_acp_registry() -> Result<RegistryRoot> {
    let path = acp_registry_cache_path()?;
    if path.exists() {
        if let Ok(data) = fs::read_to_string(&path) {
            if let Ok(parsed) = serde_json::from_str::<RegistryRoot>(&data) {
                return Ok(parsed);
            }
        }
    }
    let registry = fetch_acp_registry_from_url().await?;
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(data) = serde_json::to_string_pretty(&registry) {
        let _ = fs::write(&path, data);
    }
    Ok(registry)
}

/// Check if a specific package is installed globally (as a direct top-level install).
/// Uses exact package name to avoid false positives (e.g. @anthropic-ai/claude-code
/// vs @zed-industries/claude-code-acp are different packages).
async fn is_npm_package_installed_globally(package_spec: &str) -> Result<bool> {
    let pkg_name = normalize_npm_package_name(package_spec);
    // Only check top-level; avoid matching when it's a dep of another package (e.g.
    // @anthropic-ai/claude-code does NOT provide @zed-industries/claude-code-acp)
    let output = Command::new("npm")
        .arg("list")
        .arg("-g")
        .arg("--depth=0")
        .arg("--json")
        .output()
        .await
        .map_err(|e| AgentError::Command(format!("failed to run npm list -g: {}", e)))?;

    if !output.status.success() {
        return Ok(false);
    }

    let value: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AgentError::Command(format!("failed to parse npm list output: {}", e)))?;
    if let Some(map) = value.get("dependencies").and_then(|v| v.as_object()) {
        if map.contains_key(&pkg_name) {
            return Ok(true);
        }
    }
    Ok(false)
}

async fn list_global_npm_packages() -> Result<HashSet<String>> {
    let output = Command::new("npm")
        .arg("list")
        .arg("-g")
        .arg("--depth=0")
        .arg("--json")
        .output()
        .await
        .map_err(|e| AgentError::Command(format!("failed to run npm list -g: {}", e)))?;

    if !output.status.success() {
        return Ok(HashSet::new());
    }

    let value: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AgentError::Command(format!("failed to parse npm list output: {}", e)))?;
    let mut set = HashSet::new();
    if let Some(map) = value.get("dependencies").and_then(|v| v.as_object()) {
        for key in map.keys() {
            set.insert(key.to_string());
        }
    }
    Ok(set)
}

fn normalize_npm_package_name(spec: &str) -> String {
    if spec.starts_with('@') {
        if let Some(pos) = spec.rfind('@') {
            if pos > 0 && spec[..pos].contains('/') {
                return spec[..pos].to_string();
            }
        }
        return spec.to_string();
    }
    spec.split('@').next().unwrap_or(spec).to_string()
}

fn npx_command_preview(spec: &RegistryPackageDistribution) -> String {
    let mut parts = vec!["npx".to_string(), spec.package.clone()];
    if let Some(args) = &spec.args {
        parts.extend(args.iter().cloned());
    }
    parts.join(" ")
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct InstallManifest {
    entries: Vec<ManifestEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ManifestEntry {
    registry_id: String,
    install_method: String,
    /// Absolute path to binary; only set when install_method is "binary".
    #[serde(default)]
    binary_path: Option<String>,
}

#[derive(Debug, Clone)]
struct BinaryAsset {
    url: String,
    /// From registry cmd, e.g. "./kimi" -> "kimi"
    cmd: Option<String>,
    args: Option<Vec<String>>,
}

fn user_bin_dir() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AgentError::Command("cannot resolve home directory".to_string()))?;
    Ok(home.join(".local").join("bin"))
}

fn manifest_path() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AgentError::Command("cannot resolve home directory".to_string()))?;
    Ok(home.join(INSTALL_MANIFEST_REL_PATH))
}

fn load_install_manifest() -> Result<InstallManifest> {
    let path = manifest_path()?;
    if !path.exists() {
        // Migrate from legacy installs.json
        let legacy = path.parent().map(|agent_dir| agent_dir.join("installs.json"));
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

fn save_install_manifest(manifest: &InstallManifest) -> Result<()> {
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

fn upsert_manifest_entry(manifest: &mut InstallManifest, entry: ManifestEntry) {
    if let Some(existing) = manifest
        .entries
        .iter_mut()
        .find(|e| e.registry_id == entry.registry_id && e.install_method == entry.install_method)
    {
        *existing = entry;
        return;
    }
    manifest.entries.push(entry);
}

fn sanitize_registry_id(id: &str) -> String {
    id.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect()
}

fn current_platform_key() -> String {
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        o => o,
    };
    let arch = std::env::consts::ARCH;
    format!("{}-{}", os, arch)
}

fn resolve_binary_args(distribution: &RegistryDistribution) -> Option<Vec<String>> {
    resolve_binary_asset(&distribution.binary).and_then(|a| a.args)
}

fn resolve_binary_asset(binary: &Option<serde_json::Value>) -> Option<BinaryAsset> {
    let root = binary.as_ref()?;

    // ACP registry: { "darwin-aarch64": { "archive": "url", "cmd": "./x", "args": ["acp"] }, ... }
    let platform = current_platform_key();
    if let Some(platform_val) = root.get(&platform) {
        if let Some(url) = extract_url_recursive(platform_val) {
            let cmd = platform_val.get("cmd").and_then(|v| v.as_str()).map(String::from);
            let args = platform_val
                .get("args")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect());
            return Some(BinaryAsset { url, cmd, args });
        }
    }

    // Fallback: try legacy keys and recursive url extraction
    let current_os_keys: &[&str] = match std::env::consts::OS {
        "macos" => &["macos", "darwin", "apple-darwin"],
        "linux" => &["linux", "gnu-linux", "unknown-linux-gnu"],
        "windows" => &["windows", "win32", "pc-windows-msvc"],
        _ => &[],
    };
    for os_key in current_os_keys {
        if let Some(candidate) = root.get(*os_key) {
            if let Some(url) = extract_url_recursive(candidate) {
                let cmd = candidate.get("cmd").and_then(|v| v.as_str()).map(String::from);
                return Some(BinaryAsset { url, cmd, args: None });
            }
        }
    }
    extract_url_recursive(root).map(|url| BinaryAsset { url, cmd: None, args: None })
}

fn extract_url_recursive(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(url) = map.get("archive").or_else(|| map.get("url")).and_then(|v| v.as_str()) {
                return Some(url.to_string());
            }
            for v in map.values() {
                if let Some(url) = extract_url_recursive(v) {
                    return Some(url);
                }
            }
            None
        }
        serde_json::Value::Array(arr) => {
            for v in arr {
                if let Some(url) = extract_url_recursive(v) {
                    return Some(url);
                }
            }
            None
        }
        _ => None,
    }
}

fn looks_like_archive_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.ends_with(".zip")
        || lower.ends_with(".tar.gz")
        || lower.ends_with(".tgz")
        || lower.ends_with(".tar.xz")
}
