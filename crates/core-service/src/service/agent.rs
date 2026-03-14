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
        Ok(self.manager.install_agent(id).await?)
    }

    pub fn get_agent_config(&self, id: AgentId) -> Result<AgentConfigState> {
        Ok(self.manager.get_agent_config(id)?)
    }

    pub fn set_agent_api_key(&self, id: AgentId, api_key: &str) -> Result<()> {
        Ok(self.manager.set_agent_api_key(id, api_key)?)
    }

    pub async fn list_registry_agents(&self, force_refresh: bool) -> Result<Vec<RegistryAgent>> {
        Ok(self.manager.list_registry_agents(force_refresh).await?)
    }

    pub async fn install_registry_agent(
        &self,
        registry_id: &str,
        force_overwrite: bool,
    ) -> Result<RegistryInstallResult> {
        Ok(self
            .manager
            .install_registry_agent(registry_id, force_overwrite)
            .await?)
    }

    pub async fn remove_registry_agent(&self, registry_id: &str) -> Result<RegistryInstallResult> {
        Ok(self.manager.remove_registry_agent(registry_id).await?)
    }

    pub async fn refresh_acp_registry_cache(&self) -> Result<()> {
        Ok(self.manager.refresh_acp_registry_cache().await?)
    }

    pub async fn get_registry_agent_launch_spec(
        &self,
        registry_id: &str,
    ) -> Result<AgentLaunchSpec> {
        Ok(self
            .manager
            .get_registry_agent_launch_spec(registry_id)
            .await?)
    }

    pub fn list_custom_agents(&self) -> Result<Vec<CustomAgent>> {
        Ok(self.manager.list_custom_agents()?)
    }

    pub fn add_custom_agent(&self, agent: &CustomAgent) -> Result<()> {
        Ok(self.manager.add_custom_agent(agent)?)
    }

    pub fn remove_custom_agent(&self, name: &str) -> Result<()> {
        Ok(self.manager.remove_custom_agent(name)?)
    }

    pub fn get_custom_agent_launch_spec(&self, name: &str) -> Result<AgentLaunchSpec> {
        Ok(self.manager.get_custom_agent_launch_spec(name)?)
    }

    pub fn get_manifest_path(&self) -> Result<String> {
        Ok(self.manager.get_manifest_path()?)
    }

    pub fn get_custom_agents_json(&self) -> Result<String> {
        Ok(self.manager.get_custom_agents_json()?)
    }

    pub fn set_custom_agents_json(&self, json_str: &str) -> Result<()> {
        Ok(self.manager.set_custom_agents_json(json_str)?)
    }

    pub fn set_agent_default_config(
        &self,
        registry_id: &str,
        config_id: &str,
        value: &str,
    ) -> Result<()> {
        Ok(self
            .manager
            .set_agent_default_config(registry_id, config_id, value)?)
    }

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
