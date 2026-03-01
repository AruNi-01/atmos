use std::collections::HashSet;
use std::fs;
use std::io::{Cursor, Read as _};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use anyhow::Context;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::process::Command;

use crate::models::{
    AgentConfigState, AgentId, AgentInstallResult, AgentLaunchSpec, AgentStatus, KnownAgent,
    RegistryAgent, RegistryInstallResult,
};

const ACP_REGISTRY_URL: &str =
    "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
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
            fs::create_dir_all(parent).map_err(|e| {
                AgentError::Command(format!("failed to create registry cache dir: {}", e))
            })?;
        }
        let now = chrono::Utc::now().timestamp();
        let cache = RegistryCache {
            registry,
            cached_at: now,
        };
        let data = serde_json::to_string_pretty(&cache)
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

    pub async fn list_registry_agents(&self, force_refresh: bool) -> Result<Vec<RegistryAgent>> {
        let registry = fetch_acp_registry(force_refresh).await?;
        let installed_npm_result = list_global_npm_packages().await;
        let npm_scan_available = installed_npm_result.is_ok();
        let installed_npm = installed_npm_result.unwrap_or_default();
        let mut manifest = load_install_manifest().unwrap_or_default();

        // Remove entries that no longer exist: binary file deleted, or npx package uninstalled
        let before = manifest.registry.len();
        manifest.registry.retain(|e| {
            if e.install_method == "binary" {
                e.binary_path
                    .as_ref()
                    .map(|p| Path::new(p).exists())
                    .unwrap_or(false)
            } else if e.install_method == "npx" {
                // If npm scan failed, do NOT prune npx entries to avoid accidental manifest wipe.
                if !npm_scan_available {
                    return true;
                }
                // Prefer stored npm_package if available (handles registry package name changes)
                if let Some(ref pkg) = e.npm_package {
                    return installed_npm.contains_key(pkg);
                }
                // Fallback: look up by registry_id in the current registry (backward compatibility)
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
                    // Prefer stored npm_package if available (handles registry package name changes)
                    if let Some(ref pkg) = e.npm_package {
                        return installed_npm.contains_key(pkg);
                    }
                    // Fallback: look up by registry_id in the current registry (backward compatibility)
                    registry
                        .agents
                        .iter()
                        .find(|a| a.id == e.registry_id)
                        .and_then(|a| a.distribution.npx.as_ref())
                        .map(|npx| {
                            installed_npm.contains_key(&normalize_npm_package_name(&npx.package))
                        })
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
                let is_installed = installed_registry_ids.contains(&agent.id);
                let installed_version = if is_installed {
                    // Get the installed version from npm list
                    let pkg_name = normalize_npm_package_name(&npx.package);
                    installed_npm.get(&pkg_name).cloned()
                } else {
                    None
                };
                let default_config = if is_installed {
                    manifest
                        .registry
                        .iter()
                        .find(|e| e.registry_id == id && e.install_method == "npx")
                        .and_then(|e| e.default_config.clone())
                } else {
                    None
                };
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
                    installed: is_installed,
                    installed_version,
                    default_config,
                });
            } else if agent.distribution.binary.is_some() {
                let id = agent.id.clone();
                let is_installed = installed_registry_ids.contains(&agent.id);
                // Get installed version from manifest
                let (installed_version, default_config) = if is_installed {
                    let e = manifest
                        .registry
                        .iter()
                        .find(|e| e.registry_id == id && e.install_method == "binary");
                    (
                        e.and_then(|e| e.installed_version.clone()),
                        e.and_then(|e| e.default_config.clone()),
                    )
                } else {
                    (None, None)
                };
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
                    installed_version,
                    default_config,
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
        let registry = fetch_acp_registry(false).await?;
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
            if is_npm_package_installed_globally(&npx.package)
                .await
                .unwrap_or(false)
            {
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

        // Check if there's an old package to uninstall (package name changed)
        let mut uninstalled_old_package = None;
        let manifest = load_install_manifest().unwrap_or_default();
        let new_package_name = normalize_npm_package_name(&npx.package);
        if let Some(old_entry) = manifest.registry.iter().find(|e| e.registry_id == registry_id && e.install_method == "npx") {
            if let Some(ref old_package) = old_entry.npm_package {
                if old_package != &new_package_name {
                    // Package name changed, uninstall the old one first
                    let output = Command::new("npm")
                        .arg("uninstall")
                        .arg("-g")
                        .arg(old_package)
                        .output()
                        .await
                        .with_context(|| "failed to run npm uninstall for old package")
                        .map_err(|e| AgentError::Command(e.to_string()))?;

                    if output.status.success() {
                        uninstalled_old_package = Some(old_package.clone());
                    }
                    // Continue with installation even if uninstall failed
                }
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
            // Get the installed version from npm
            let installed_version = list_global_npm_packages().await
                .ok()
                .and_then(|pkgs| pkgs.get(&new_package_name).cloned());

            let mut manifest = load_install_manifest().unwrap_or_default();
            let existing_default = manifest.registry.iter()
                .find(|e| e.registry_id == registry_id && e.install_method == "npx")
                .and_then(|e| e.default_config.clone());

            upsert_manifest_entry(
                &mut manifest,
                ManifestEntry {
                    registry_id: registry_id.to_string(),
                    install_method: "npx".to_string(),
                    binary_path: None,
                    npm_package: Some(new_package_name),
                    installed_version,
                    default_config: existing_default,
                },
            );
            let _ = save_install_manifest(&manifest);

            let message = if let Some(old_package) = uninstalled_old_package {
                format!("Upgraded from {} to {}", old_package, npx.package)
            } else {
                format!("Installed {} ({})", entry.name, npx.package)
            };

            return Ok(RegistryInstallResult {
                registry_id: registry_id.to_string(),
                installed: true,
                install_method: "acp_registry".to_string(),
                message,
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
        // Load manifest first to get the stored npm_package (handles registry package name changes)
        let manifest = load_install_manifest().unwrap_or_default();
        let manifest_entry = manifest
            .registry
            .iter()
            .find(|e| e.registry_id == registry_id && e.install_method == "npx");

        let (package, registry_entry_for_message) = if let Some(entry) = manifest_entry {
            // Prefer stored npm_package if available (handles registry package name changes)
            if let Some(ref pkg) = entry.npm_package {
                let registry = fetch_acp_registry(false).await?;
                let registry_entry = registry.agents.iter().find(|a| a.id == registry_id);
                (pkg.clone(), registry_entry.cloned())
            } else {
                // Fallback: look up by registry_id in the current registry (backward compatibility)
                let registry = fetch_acp_registry(false).await?;
                let r_entry = registry
                    .agents
                    .into_iter()
                    .find(|a| a.id == registry_id)
                    .ok_or_else(|| AgentError::NotFound(format!("registry agent: {}", registry_id)))?;
                let npx = r_entry.distribution.npx.as_ref().ok_or_else(|| {
                    AgentError::Command(format!("registry agent '{}' has no npx distribution", registry_id))
                })?;
                (normalize_npm_package_name(&npx.package), Some(r_entry))
            }
        } else {
            return Err(AgentError::NotFound(format!("no npx install found for: {}", registry_id)));
        };

        let mut manifest = load_install_manifest().unwrap_or_default();
        manifest
            .registry
            .retain(|e| !(e.registry_id == registry_id && e.install_method == "npx"));
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
            // Use registry entry name if available for better messaging, otherwise fall back to registry_id
            let name = registry_entry_for_message
                .as_ref()
                .map(|e| e.name.as_str())
                .unwrap_or(registry_id);
            return Ok(RegistryInstallResult {
                registry_id: registry_id.to_string(),
                installed: false,
                install_method: "acp_registry".to_string(),
                message: format!("Removed {} ({})", name, package),
                needs_confirmation: None,
                overwrite_message: None,
            });
        }

        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let name = registry_entry_for_message
            .as_ref()
            .map(|e| e.name.as_str())
            .unwrap_or(registry_id);
        Err(AgentError::Command(format!(
            "registry remove failed for {}: {}",
            name, stderr
        )))
    }

    /// Returns the launch spec for an installed registry agent. Use when spawning the ACP agent process.
    /// Package, args, and env are read from the ACP registry (cached locally).
    pub async fn get_registry_agent_launch_spec(
        &self,
        registry_id: &str,
    ) -> Result<AgentLaunchSpec> {
        let manifest = load_install_manifest()?;
        let m_entry = manifest
            .registry
            .iter()
            .find(|e| e.registry_id == registry_id)
            .ok_or_else(|| AgentError::NotFound(format!("installed agent: {}", registry_id)))?;

        let registry = fetch_acp_registry(false).await?;
        let r_entry = registry
            .agents
            .iter()
            .find(|a| a.id == registry_id)
            .ok_or_else(|| {
                AgentError::NotFound(format!("agent '{}' not in registry", registry_id))
            })?;

        if m_entry.install_method == "npx" {
            let npx = r_entry.distribution.npx.as_ref().ok_or_else(|| {
                AgentError::Command("registry entry has no npx distribution".to_string())
            })?;
            let mut args = vec![npx.package.clone()];
            args.extend(npx.args.clone().unwrap_or_default());
            return Ok(AgentLaunchSpec {
                program: "npx".to_string(),
                args,
                env: npx.env.clone(),
            });
        }

        if m_entry.install_method == "binary" {
            let binary_path = m_entry.binary_path.as_deref().ok_or_else(|| {
                AgentError::Command("binary entry missing binary_path".to_string())
            })?;
            if !Path::new(binary_path).exists() {
                return Err(AgentError::Command(format!(
                    "binary not found: {}",
                    binary_path
                )));
            }
            let args = resolve_binary_args(&r_entry.distribution).unwrap_or_default();
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

    /// List all custom agents from the install manifest.
    pub fn list_custom_agents(&self) -> Result<Vec<crate::models::CustomAgent>> {
        let manifest = load_install_manifest()?;
        Ok(manifest
            .custom_agents
            .into_iter()
            .map(|(name, entry)| crate::models::CustomAgent {
                name,
                agent_type: entry.agent_type,
                command: entry.command,
                args: entry.args,
                env: entry.env,
                default_config: entry.default_config,
            })
            .collect())
    }

    pub fn set_agent_default_config(
        &self,
        registry_id: &str,
        config_id: &str,
        value: &str,
    ) -> Result<()> {
        let path = manifest_path()?;
        let mut manifest = load_install_manifest()?;
        tracing::info!("Attempting to set default config in {}: {}/{}={}", path.display(), registry_id, config_id, value);

        // Try registry agents first
        if let Some(entry) = manifest.registry.iter_mut().find(|e| e.registry_id == registry_id) {
            let mut defaults = entry.default_config.clone().unwrap_or_default();
            defaults.insert(config_id.to_string(), value.to_string());
            entry.default_config = Some(defaults);
            tracing::info!("Successfully updated registry agent default config");
            return save_install_manifest(&manifest);
        }

        // Try custom agents (exact match or normalized match)
        let found_custom = manifest.custom_agents.contains_key(registry_id);
        if found_custom {
            if let Some(entry) = manifest.custom_agents.get_mut(registry_id) {
                let mut defaults = entry.default_config.clone().unwrap_or_default();
                defaults.insert(config_id.to_string(), value.to_string());
                entry.default_config = Some(defaults);
                tracing::info!("Successfully updated custom agent default config via exact match");
                return save_install_manifest(&manifest);
            }
        }

        // Fallback for custom agents: try case-insensitive or name match if registry_id is from UI
        let mut found_by_name = None;
        for (name, _) in manifest.custom_agents.iter() {
            if name.to_lowercase() == registry_id.to_lowercase() {
                found_by_name = Some(name.clone());
                break;
            }
        }

        if let Some(name) = found_by_name {
            if let Some(entry) = manifest.custom_agents.get_mut(&name) {
                let mut defaults = entry.default_config.clone().unwrap_or_default();
                defaults.insert(config_id.to_string(), value.to_string());
                entry.default_config = Some(defaults);
                tracing::info!("Successfully updated custom agent default config via case-insensitive match: {}", name);
                return save_install_manifest(&manifest);
            }
        }

        tracing::warn!("Agent '{}' not found in manifest at {}", registry_id, path.display());
        Err(AgentError::NotFound(format!("agent not found: {}", registry_id)))
    }

    pub fn get_agent_default_config(&self, registry_id: &str) -> Option<std::collections::HashMap<String, String>> {
        let manifest = load_install_manifest().ok()?;

        if let Some(entry) = manifest.registry.iter().find(|e| e.registry_id == registry_id) {
            return entry.default_config.clone();
        }

        if let Some(entry) = manifest.custom_agents.get(registry_id) {
            return entry.default_config.clone();
        }

        None
    }

    /// Add or update a custom agent.
    pub fn add_custom_agent(&self, agent: &crate::models::CustomAgent) -> Result<()> {
        let mut manifest = load_install_manifest()?;
        let existing_default = manifest.custom_agents.get(&agent.name).and_then(|e| e.default_config.clone());
        manifest.custom_agents.insert(
            agent.name.clone(),
            CustomAgentEntry {
                agent_type: "custom".to_string(),
                command: agent.command.clone(),
                args: agent.args.clone(),
                env: agent.env.clone(),
                default_config: agent.default_config.clone().or(existing_default),
            },
        );
        save_install_manifest(&manifest)
    }

    /// Remove a custom agent by name.
    pub fn remove_custom_agent(&self, name: &str) -> Result<()> {
        let mut manifest = load_install_manifest()?;
        manifest.custom_agents.remove(name);
        save_install_manifest(&manifest)
    }

    /// Get launch spec for a custom agent.
    pub fn get_custom_agent_launch_spec(&self, name: &str) -> Result<AgentLaunchSpec> {
        let manifest = load_install_manifest()?;
        let entry = manifest
            .custom_agents
            .get(name)
            .ok_or_else(|| AgentError::NotFound(format!("custom agent: {}", name)))?;
        let program = if entry.command.starts_with("~/") {
            let home = dirs::home_dir()
                .ok_or_else(|| AgentError::Command("cannot resolve home directory".to_string()))?;
            home.join(&entry.command[2..]).to_string_lossy().to_string()
        } else {
            entry.command.clone()
        };
        Ok(AgentLaunchSpec {
            program,
            args: entry.args.clone(),
            env: if entry.env.is_empty() {
                None
            } else {
                Some(entry.env.clone())
            },
        })
    }

    /// Get the absolute path to the acp_servers.json manifest file.
    pub fn get_manifest_path(&self) -> Result<String> {
        manifest_path().map(|p| p.to_string_lossy().to_string())
    }

    /// Get the raw custom_agents section as a JSON string for manual editing.
    pub fn get_custom_agents_json(&self) -> Result<String> {
        let manifest = load_install_manifest()?;
        serde_json::to_string_pretty(&manifest.custom_agents)
            .map_err(|e| AgentError::Command(format!("failed to serialize custom_agents: {}", e)))
    }

    /// Set custom_agents from a raw JSON string. Validates the JSON before saving.
    pub fn set_custom_agents_json(&self, json_str: &str) -> Result<()> {
        let parsed: std::collections::HashMap<String, CustomAgentEntry> =
            serde_json::from_str(json_str).map_err(|e| {
                AgentError::Command(format!("invalid custom_agents JSON: {}", e))
            })?;
        let mut manifest = load_install_manifest()?;
        manifest.custom_agents = parsed;
        save_install_manifest(&manifest)
    }

    pub fn get_agent_config(&self, id: AgentId) -> Result<AgentConfigState> {
        let agent = self
            .list_supported_agents()
            .into_iter()
            .find(|a| a.id == id)
            .ok_or_else(|| AgentError::NotFound(id.as_str().to_string()))?;

        let (auth_detected, auth_source) = detect_auth_source(&agent.auth_paths);
        let has_stored_api_key =
            keyring_has_api_key(id).map_err(|e| AgentError::Command(e.to_string()))?;

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
        let registry = match fetch_acp_registry(false).await {
            Ok(value) => value,
            Err(_) => return Ok(None),
        };

        let entry = match registry
            .agents
            .into_iter()
            .find(|a| a.id == agent.registry_id)
        {
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

        fs::create_dir_all(&bin_dir)
            .map_err(|e| AgentError::Command(format!("failed to create bin dir: {}", e)))?;

        if looks_like_archive_url(&asset.url) {
            extract_archive(&asset.url, &bytes, &bin_dir, &file_name)?;
        } else {
            fs::write(&target_path, &bytes)
                .map_err(|e| AgentError::Command(format!("failed to write binary: {}", e)))?;
        }

        #[cfg(unix)]
        {
            let mut perms = fs::metadata(&target_path)
                .map_err(|e| AgentError::Command(format!("failed to read binary metadata: {}", e)))?
                .permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&target_path, perms).map_err(|e| {
                AgentError::Command(format!("failed to set binary permissions: {}", e))
            })?;
        }

        // Try to detect the installed version
        let installed_version = detect_binary_version(&target_path).await;

        let mut manifest = load_install_manifest().unwrap_or_default();
        let existing_default = manifest.registry.iter()
            .find(|e| e.registry_id == registry_id && e.install_method == "binary")
            .and_then(|e| e.default_config.clone());
            
        let bin_path_str = target_path.to_string_lossy().to_string();
        upsert_manifest_entry(
            &mut manifest,
            ManifestEntry {
                registry_id: registry_id.to_string(),
                install_method: "binary".to_string(),
                binary_path: Some(bin_path_str),
                npm_package: None,
                installed_version,
                default_config: existing_default,
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
            .registry
            .iter()
            .position(|e| e.registry_id == registry_id && e.install_method == "binary")
            .ok_or_else(|| {
                AgentError::Command(format!(
                    "no managed binary install found for '{}'",
                    registry_id
                ))
            })?;

        let entry = manifest.registry.remove(pos);
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

#[derive(Debug, Clone, Deserialize, Serialize)]
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

/// Registry cache wrapper that includes timestamp for auto-refresh
#[derive(Debug, Clone, Serialize, Deserialize)]
struct RegistryCache {
    #[serde(flatten)]
    registry: RegistryRoot,
    /// Unix timestamp (seconds) when this cache was last updated
    cached_at: i64,
}

const REGISTRY_CACHE_TTL_SECS: i64 = 12 * 60 * 60; // 12 hours

async fn fetch_acp_registry(force_refresh: bool) -> Result<RegistryRoot> {
    let path = acp_registry_cache_path()?;
    let now = chrono::Utc::now().timestamp();

    // Try to load from cache first
    if path.exists() && !force_refresh {
        if let Ok(data) = fs::read_to_string(&path) {
            // Try to parse as RegistryCache (new format with timestamp)
            if let Ok(cache) = serde_json::from_str::<RegistryCache>(&data) {
                let cache_age = now.saturating_sub(cache.cached_at);
                if cache_age < REGISTRY_CACHE_TTL_SECS {
                    // Cache is still valid
                    return Ok(cache.registry);
                }
                // Cache is too old, fall through to refresh
            } else if let Ok(registry) = serde_json::from_str::<RegistryRoot>(&data) {
                // Legacy format without timestamp - use it but will refresh on next call
                return Ok(registry);
            }
        }
    }

    // Fetch from CDN
    let registry = fetch_acp_registry_from_url().await?;
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    // Save with timestamp
    let cache = RegistryCache {
        registry,
        cached_at: now,
    };
    if let Ok(data) = serde_json::to_string_pretty(&cache) {
        let _ = fs::write(&path, data);
    }

    Ok(cache.registry)
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

async fn list_global_npm_packages() -> Result<std::collections::HashMap<String, String>> {
    let output = Command::new("npm")
        .arg("list")
        .arg("-g")
        .arg("--depth=0")
        .arg("--json")
        .output()
        .await
        .map_err(|e| AgentError::Command(format!("failed to run npm list -g: {}", e)))?;

    if !output.status.success() {
        return Ok(std::collections::HashMap::new());
    }

    let value: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AgentError::Command(format!("failed to parse npm list output: {}", e)))?;
    let mut map = std::collections::HashMap::new();
    if let Some(deps) = value.get("dependencies").and_then(|v| v.as_object()) {
        for (key, dep) in deps {
            if let Some(version) = dep.get("version").and_then(|v| v.as_str()) {
                map.insert(key.to_string(), version.to_string());
            } else {
                // Fallback: if no version field, still include the package name
                map.insert(key.to_string(), "unknown".to_string());
            }
        }
    }
    Ok(map)
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
    #[serde(alias = "entries")]
    registry: Vec<ManifestEntry>,
    /// User-defined custom ACP agents keyed by name.
    #[serde(default)]
    custom_agents: std::collections::HashMap<String, CustomAgentEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ManifestEntry {
    registry_id: String,
    install_method: String,
    /// Absolute path to binary; only set when install_method is "binary".
    #[serde(default)]
    binary_path: Option<String>,
    /// NPM package name (normalized); only set when install_method is "npx".
    /// Storing this allows us to track version changes in the registry without
    /// accidentally removing entries or leaving stale packages installed.
    #[serde(default)]
    npm_package: Option<String>,
    /// The version currently installed (if detectable); used for upgrade detection.
    #[serde(default)]
    installed_version: Option<String>,
    #[serde(
        default,
        rename = "default_option_configs",
        skip_serializing_if = "Option::is_none"
    )]
    pub default_config: Option<std::collections::HashMap<String, String>>,
}

/// Persisted custom agent entry within the install manifest.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct CustomAgentEntry {
    /// Fixed to "custom".
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
        .registry
        .iter_mut()
        .find(|e| e.registry_id == entry.registry_id && e.install_method == entry.install_method)
    {
        let mut entry = entry;
        let default_config = entry.default_config.take().or(existing.default_config.take());
        let installed_version = entry.installed_version.take().or(existing.installed_version.take());
        *existing = entry;
        existing.default_config = default_config;
        existing.installed_version = installed_version;
        return;
    }
    manifest.registry.push(entry);
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
            let cmd = platform_val
                .get("cmd")
                .and_then(|v| v.as_str())
                .map(String::from);
            let args = platform_val
                .get("args")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                });
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
                let cmd = candidate
                    .get("cmd")
                    .and_then(|v| v.as_str())
                    .map(String::from);
                return Some(BinaryAsset {
                    url,
                    cmd,
                    args: None,
                });
            }
        }
    }
    extract_url_recursive(root).map(|url| BinaryAsset {
        url,
        cmd: None,
        args: None,
    })
}

fn extract_url_recursive(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(url) = map
                .get("archive")
                .or_else(|| map.get("url"))
                .and_then(|v| v.as_str())
            {
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

/// Extract a binary from an archive (zip or tar.gz/tgz) into `dest_dir`.
///
/// The function looks for an executable whose name matches `binary_name` (with
/// or without an extension) inside the archive and copies it to
/// `dest_dir/binary_name`.  If no exact match is found it falls back to the
/// first file that looks like an executable.
fn extract_archive(
    url: &str,
    data: &[u8],
    dest_dir: &Path,
    binary_name: &str,
) -> Result<()> {
    let lower = url.to_ascii_lowercase();

    if lower.ends_with(".zip") {
        extract_zip(data, dest_dir, binary_name)
    } else if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") {
        extract_tar_gz(data, dest_dir, binary_name)
    } else {
        Err(AgentError::Command(format!(
            "unsupported archive format for url: {}",
            url
        )))
    }
}

fn is_target_binary(entry_name: &str, binary_name: &str) -> bool {
    let base = Path::new(entry_name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    base == binary_name
        || base == format!("{}.exe", binary_name)
        || base.strip_suffix(".exe").unwrap_or(base) == binary_name.strip_suffix(".exe").unwrap_or(binary_name)
}

fn extract_zip(data: &[u8], dest_dir: &Path, binary_name: &str) -> Result<()> {
    let reader = Cursor::new(data);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| AgentError::Command(format!("failed to open zip archive: {}", e)))?;

    // First pass: find the target binary
    let mut target_index: Option<usize> = None;
    let mut fallback_index: Option<usize> = None;

    for i in 0..archive.len() {
        let file = archive
            .by_index(i)
            .map_err(|e| AgentError::Command(format!("failed to read zip entry: {}", e)))?;
        let name = file.name().to_string();
        if file.is_dir() {
            continue;
        }
        if is_target_binary(&name, binary_name) {
            target_index = Some(i);
            break;
        }
        // Fallback: first non-directory entry that doesn't look like a metadata file
        if fallback_index.is_none()
            && !name.ends_with('/')
            && !name.starts_with("._")
            && !name.contains("__MACOSX")
        {
            fallback_index = Some(i);
        }
    }

    let idx = target_index.or(fallback_index).ok_or_else(|| {
        AgentError::Command("zip archive contains no extractable files".to_string())
    })?;

    let mut file = archive
        .by_index(idx)
        .map_err(|e| AgentError::Command(format!("failed to read zip entry: {}", e)))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)
        .map_err(|e| AgentError::Command(format!("failed to extract zip entry: {}", e)))?;

    let out_path = dest_dir.join(binary_name);
    fs::write(&out_path, &buf)
        .map_err(|e| AgentError::Command(format!("failed to write extracted binary: {}", e)))?;

    Ok(())
}

fn extract_tar_gz(data: &[u8], dest_dir: &Path, binary_name: &str) -> Result<()> {
    let gz = flate2::read::GzDecoder::new(Cursor::new(data));
    let mut archive = tar::Archive::new(gz);

    let entries = archive
        .entries()
        .map_err(|e| AgentError::Command(format!("failed to read tar.gz archive: {}", e)))?;

    let mut target_bytes: Option<Vec<u8>> = None;
    let mut fallback_bytes: Option<Vec<u8>> = None;

    for entry_result in entries {
        let mut entry = entry_result
            .map_err(|e| AgentError::Command(format!("failed to read tar entry: {}", e)))?;
        let path_str = entry
            .path()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        if entry.header().entry_type().is_dir() {
            continue;
        }

        let mut buf = Vec::new();
        entry
            .read_to_end(&mut buf)
            .map_err(|e| AgentError::Command(format!("failed to extract tar entry: {}", e)))?;

        if is_target_binary(&path_str, binary_name) {
            target_bytes = Some(buf);
            break;
        }

        if fallback_bytes.is_none() && !path_str.ends_with('/') {
            fallback_bytes = Some(buf);
        }
    }

    let content = target_bytes.or(fallback_bytes).ok_or_else(|| {
        AgentError::Command("tar.gz archive contains no extractable files".to_string())
    })?;

    let out_path = dest_dir.join(binary_name);
    fs::write(&out_path, &content)
        .map_err(|e| AgentError::Command(format!("failed to write extracted binary: {}", e)))?;

    Ok(())
}

/// Attempt to detect the version of an installed binary agent.
/// Tries common version flags like --version and -v.
/// Returns None if version detection fails or the binary doesn't support it.
async fn detect_binary_version(binary_path: &Path) -> Option<String> {
    let common_flags = ["--version", "-v", "version", "-V"];

    for flag in common_flags {
        let output = Command::new(binary_path)
            .arg(flag)
            .output()
            .await;

        if let Ok(output) = output {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let combined = format!("{} {}", stdout, stderr).trim().to_string();

                // Try to extract version number from output
                // Common patterns: "v1.2.3", "1.2.3", "version 1.2.3", etc.
                if let Some(captures) = regex::Regex::new(r"(?i)v?(\d+\.\d+[\d.]*)")
                    .ok()
                    .and_then(|re| re.captures(&combined))
                {
                    if let Some(version) = captures.get(1) {
                        return Some(version.as_str().to_string());
                    }
                }

                // If no version pattern found, return first line of output (some tools output just the version)
                let first_line = combined.lines().next();
                if let Some(line) = first_line {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() && trimmed.len() < 50 {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    }

    None
}
