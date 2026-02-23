use agent::{
    AgentConfigState, AgentId, AgentInstallResult, AgentLaunchSpec, AgentManager, AgentStatus,
    CustomAgent, RegistryAgent, RegistryInstallResult,
};

use crate::error::Result;

#[derive(Debug, Default)]
pub struct AgentService {
    manager: AgentManager,
}

impl AgentService {
    pub fn new() -> Self {
        Self {
            manager: AgentManager::new(),
        }
    }

    pub fn list_agents(&self) -> Vec<AgentStatus> {
        self.manager.list_agent_status()
    }

    pub async fn install_agent(&self, id: AgentId) -> Result<AgentInstallResult> {
        self.manager
            .install_agent(id)
            .await
            .map_err(|e| crate::ServiceError::Processing(e.to_string()))
    }

    pub fn get_agent_config(&self, id: AgentId) -> Result<AgentConfigState> {
        self.manager
            .get_agent_config(id)
            .map_err(|e| crate::ServiceError::Processing(e.to_string()))
    }

    pub fn set_agent_api_key(&self, id: AgentId, api_key: &str) -> Result<()> {
        self.manager
            .set_agent_api_key(id, api_key)
            .map_err(|e| crate::ServiceError::Processing(e.to_string()))
    }

    pub async fn list_registry_agents(&self, force_refresh: bool) -> Result<Vec<RegistryAgent>> {
        self.manager
            .list_registry_agents(force_refresh)
            .await
            .map_err(|e| crate::ServiceError::Processing(e.to_string()))
    }

    pub async fn install_registry_agent(
        &self,
        registry_id: &str,
        force_overwrite: bool,
    ) -> Result<RegistryInstallResult> {
        self.manager
            .install_registry_agent(registry_id, force_overwrite)
            .await
            .map_err(|e| crate::ServiceError::Processing(e.to_string()))
    }

    pub async fn remove_registry_agent(&self, registry_id: &str) -> Result<RegistryInstallResult> {
        self.manager
            .remove_registry_agent(registry_id)
            .await
            .map_err(|e| crate::ServiceError::Processing(e.to_string()))
    }

    /// Refresh ACP registry from CDN and save to local cache. Call on service startup.
    pub async fn refresh_acp_registry_cache(&self) -> Result<()> {
        self.manager
            .refresh_acp_registry_cache()
            .await
            .map_err(|e| crate::ServiceError::Processing(e.to_string()))
    }

    /// Get launch spec for an installed registry agent (for spawning ACP session).
    pub async fn get_registry_agent_launch_spec(
        &self,
        registry_id: &str,
    ) -> Result<AgentLaunchSpec> {
        self.manager
            .get_registry_agent_launch_spec(registry_id)
            .await
            .map_err(|e| crate::ServiceError::Processing(e.to_string()))
    }

    pub fn list_custom_agents(&self) -> Result<Vec<CustomAgent>> {
        self.manager
            .list_custom_agents()
            .map_err(|e| crate::ServiceError::Processing(e.to_string()))
    }

    pub fn add_custom_agent(&self, agent: &CustomAgent) -> Result<()> {
        self.manager
            .add_custom_agent(agent)
            .map_err(|e| crate::ServiceError::Processing(e.to_string()))
    }

    pub fn remove_custom_agent(&self, name: &str) -> Result<()> {
        self.manager
            .remove_custom_agent(name)
            .map_err(|e| crate::ServiceError::Processing(e.to_string()))
    }

    pub fn get_custom_agent_launch_spec(&self, name: &str) -> Result<AgentLaunchSpec> {
        self.manager
            .get_custom_agent_launch_spec(name)
            .map_err(|e| crate::ServiceError::Processing(e.to_string()))
    }

    pub fn get_manifest_path(&self) -> Result<String> {
        self.manager
            .get_manifest_path()
            .map_err(|e| crate::ServiceError::Processing(e.to_string()))
    }

    pub fn get_custom_agents_json(&self) -> Result<String> {
        self.manager
            .get_custom_agents_json()
            .map_err(|e| crate::ServiceError::Processing(e.to_string()))
    }

    pub fn set_custom_agents_json(&self, json_str: &str) -> Result<()> {
        self.manager
            .set_custom_agents_json(json_str)
            .map_err(|e| crate::ServiceError::Processing(e.to_string()))
    }

    pub fn set_agent_default_config(
        &self,
        registry_id: &str,
        config_id: &str,
        value: &str,
    ) -> Result<()> {
        self.manager
            .set_agent_default_config(registry_id, config_id, value)
            .map_err(|e| crate::ServiceError::Processing(e.to_string()))
    }

    /// Get env overrides (API key from keyring) for spawning a registry agent.
    pub fn get_registry_agent_env_overrides(
        &self,
        registry_id: &str,
    ) -> Option<std::collections::HashMap<String, String>> {
        self.manager.get_registry_agent_env_overrides(registry_id)
    }

    pub fn get_agent_default_config(
        &self,
        registry_id: &str,
    ) -> Option<std::collections::HashMap<String, String>> {
        self.manager.get_agent_default_config(registry_id)
    }
}
