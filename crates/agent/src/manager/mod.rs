mod binary;
mod keyring;
mod manifest;
mod npm;
mod registry;

use std::path::{Path, PathBuf};
use std::fs;

use thiserror::Error;

use crate::models::{
    AgentConfigState, AgentId, AgentInstallResult, AgentLaunchSpec, AgentStatus, KnownAgent,
    RegistryAgent, RegistryInstallResult,
};

// Re-export types that are used by other crates via `crate::manager::AgentError`
pub(crate) use self::manifest::CustomAgentEntry;

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

    pub async fn refresh_acp_registry_cache(&self) -> Result<()> {
        let reg = registry::fetch_acp_registry_from_url().await?;
        let path = registry::acp_registry_cache_path()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                AgentError::Command(format!("failed to create registry cache dir: {}", e))
            })?;
        }
        let now = chrono::Utc::now().timestamp();
        let cache = serde_json::json!({
            "agents": reg.agents,
            "cached_at": now,
        });
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

        if let Some(result) = npm::try_install_from_registry_index(&agent).await? {
            return Ok(result);
        }

        npm::install_npm_agent(&agent).await
    }

    pub async fn list_registry_agents(&self, force_refresh: bool) -> Result<Vec<RegistryAgent>> {
        let known = self.list_supported_agents();
        registry::list_registry_agents_impl(&known, force_refresh).await
    }

    pub async fn install_registry_agent(
        &self,
        registry_id: &str,
        force_overwrite: bool,
    ) -> Result<RegistryInstallResult> {
        let reg = registry::fetch_acp_registry(false).await?;
        let entry = reg
            .agents
            .into_iter()
            .find(|a| a.id == registry_id)
            .ok_or_else(|| AgentError::NotFound(format!("registry agent: {}", registry_id)))?;

        if let Some(npx) = entry.distribution.npx.clone() {
            return npm::install_registry_npx_agent(&entry, registry_id, &npx.package, force_overwrite)
                .await;
        }

        if entry.distribution.binary.is_some() {
            return binary::install_registry_binary_agent(entry, registry_id, force_overwrite)
                .await;
        }

        Err(AgentError::Command(format!(
            "registry agent '{}' has no supported distribution",
            registry_id
        )))
    }

    pub async fn remove_registry_agent(&self, registry_id: &str) -> Result<RegistryInstallResult> {
        let m = manifest::load_install_manifest().unwrap_or_default();

        let binary_entry = m
            .registry
            .iter()
            .find(|e| e.registry_id == registry_id && e.install_method == "binary");
        if binary_entry.is_some() {
            let reg = registry::fetch_acp_registry(false).await?;
            let r_entry = reg.agents.iter().find(|a| a.id == registry_id);
            return binary::remove_registry_binary_agent(r_entry.cloned().as_ref(), registry_id);
        }

        npm::remove_registry_npx_agent(registry_id).await
    }

    pub async fn get_registry_agent_launch_spec(
        &self,
        registry_id: &str,
    ) -> Result<AgentLaunchSpec> {
        let m = manifest::load_install_manifest()?;
        let m_entry = m
            .registry
            .iter()
            .find(|e| e.registry_id == registry_id)
            .ok_or_else(|| AgentError::NotFound(format!("installed agent: {}", registry_id)))?;

        let reg = registry::fetch_acp_registry(false).await?;
        let r_entry = reg
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
            let args = binary::resolve_binary_args(&r_entry.distribution).unwrap_or_default();
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

    pub fn list_custom_agents(&self) -> Result<Vec<crate::models::CustomAgent>> {
        let m = manifest::load_install_manifest()?;
        Ok(m.custom_agents
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
        let path = manifest::manifest_path()?;
        let mut m = manifest::load_install_manifest()?;
        tracing::info!(
            "Attempting to set default config in {}: {}/{}={}",
            path.display(),
            registry_id,
            config_id,
            value
        );

        if let Some(entry) = m
            .registry
            .iter_mut()
            .find(|e| e.registry_id == registry_id)
        {
            let mut defaults = entry.default_config.clone().unwrap_or_default();
            defaults.insert(config_id.to_string(), value.to_string());
            entry.default_config = Some(defaults);
            tracing::info!("Successfully updated registry agent default config");
            return manifest::save_install_manifest(&m);
        }

        let found_custom = m.custom_agents.contains_key(registry_id);
        if found_custom {
            if let Some(entry) = m.custom_agents.get_mut(registry_id) {
                let mut defaults = entry.default_config.clone().unwrap_or_default();
                defaults.insert(config_id.to_string(), value.to_string());
                entry.default_config = Some(defaults);
                tracing::info!("Successfully updated custom agent default config via exact match");
                return manifest::save_install_manifest(&m);
            }
        }

        let mut found_by_name = None;
        for (name, _) in m.custom_agents.iter() {
            if name.to_lowercase() == registry_id.to_lowercase() {
                found_by_name = Some(name.clone());
                break;
            }
        }

        if let Some(name) = found_by_name {
            if let Some(entry) = m.custom_agents.get_mut(&name) {
                let mut defaults = entry.default_config.clone().unwrap_or_default();
                defaults.insert(config_id.to_string(), value.to_string());
                entry.default_config = Some(defaults);
                tracing::info!(
                    "Successfully updated custom agent default config via case-insensitive match: {}",
                    name
                );
                return manifest::save_install_manifest(&m);
            }
        }

        tracing::warn!(
            "Agent '{}' not found in manifest at {}",
            registry_id,
            path.display()
        );
        Err(AgentError::NotFound(format!(
            "agent not found: {}",
            registry_id
        )))
    }

    pub fn get_agent_default_config(
        &self,
        registry_id: &str,
    ) -> Option<std::collections::HashMap<String, String>> {
        let m = manifest::load_install_manifest().ok()?;

        if let Some(entry) = m.registry.iter().find(|e| e.registry_id == registry_id) {
            return entry.default_config.clone();
        }

        if let Some(entry) = m.custom_agents.get(registry_id) {
            return entry.default_config.clone();
        }

        None
    }

    pub fn add_custom_agent(&self, agent: &crate::models::CustomAgent) -> Result<()> {
        let mut m = manifest::load_install_manifest()?;
        let existing_default = m
            .custom_agents
            .get(&agent.name)
            .and_then(|e| e.default_config.clone());
        m.custom_agents.insert(
            agent.name.clone(),
            CustomAgentEntry {
                agent_type: "custom".to_string(),
                command: agent.command.clone(),
                args: agent.args.clone(),
                env: agent.env.clone(),
                default_config: agent.default_config.clone().or(existing_default),
            },
        );
        manifest::save_install_manifest(&m)
    }

    pub fn remove_custom_agent(&self, name: &str) -> Result<()> {
        let mut m = manifest::load_install_manifest()?;
        m.custom_agents.remove(name);
        manifest::save_install_manifest(&m)
    }

    pub fn get_custom_agent_launch_spec(&self, name: &str) -> Result<AgentLaunchSpec> {
        let m = manifest::load_install_manifest()?;
        let entry = m
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

    pub fn get_manifest_path(&self) -> Result<String> {
        manifest::manifest_path().map(|p| p.to_string_lossy().to_string())
    }

    pub fn get_custom_agents_json(&self) -> Result<String> {
        let m = manifest::load_install_manifest()?;
        serde_json::to_string_pretty(&m.custom_agents)
            .map_err(|e| AgentError::Command(format!("failed to serialize custom_agents: {}", e)))
    }

    pub fn set_custom_agents_json(&self, json_str: &str) -> Result<()> {
        let parsed: std::collections::HashMap<String, CustomAgentEntry> =
            serde_json::from_str(json_str)
                .map_err(|e| AgentError::Command(format!("invalid custom_agents JSON: {}", e)))?;
        let mut m = manifest::load_install_manifest()?;
        m.custom_agents = parsed;
        manifest::save_install_manifest(&m)
    }

    pub fn get_agent_config(&self, id: AgentId) -> Result<AgentConfigState> {
        let agent = self
            .list_supported_agents()
            .into_iter()
            .find(|a| a.id == id)
            .ok_or_else(|| AgentError::NotFound(id.as_str().to_string()))?;

        let (auth_detected, auth_source) = detect_auth_source(&agent.auth_paths);
        let has_stored_api_key =
            keyring::keyring_has_api_key(id).map_err(|e| AgentError::Command(e.to_string()))?;

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
        keyring::keyring_set_api_key(id, api_key).map_err(|e| AgentError::Command(e.to_string()))
    }

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
        let key = keyring::keyring_get_api_key(agent_id).ok()?;
        if key.is_empty() {
            return None;
        }
        let mut map = std::collections::HashMap::new();
        map.insert(env_var.to_string(), key);
        Some(map)
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
