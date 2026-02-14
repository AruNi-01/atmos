use agent::{
    AgentConfigState, AgentId, AgentInstallResult, AgentManager, AgentStatus, RegistryAgent,
    RegistryInstallResult,
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

    pub async fn list_registry_agents(&self) -> Result<Vec<RegistryAgent>> {
        self.manager
            .list_registry_agents()
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
}
