use std::path::PathBuf;

use agent::acp_client::{
    logout_acp_agent, AgentCapabilitiesSnapshot, AgentCapabilityState, AgentLogoutResult,
};
use agent::{
    canonicalize_chat_provider_id, is_builtin_custom_agent_id, is_native_chat_agent_id,
    native_chat_launch_spec, AgentConfigState, AgentId, AgentInstallResult, AgentLaunchSpec,
    AgentManager, AgentStatus, CustomAgent, NativeChatAgent, RegistryAgent, RegistryInstallResult,
    DEEPSEEK_API_KEY_ENV, DEEPSEEK_HARNESS_ID,
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

    pub fn list_native_chat_agents(&self) -> Result<Vec<NativeChatAgent>> {
        Ok(self.manager.list_native_chat_agents()?)
    }

    pub fn set_native_chat_agent_enabled(&self, id: &str, enabled: bool) -> Result<()> {
        Ok(self.manager.set_native_chat_agent_enabled(id, enabled)?)
    }

    pub fn add_custom_agent(&self, agent: &CustomAgent) -> Result<()> {
        persist_shared_custom_agent_api_keys(agent);
        Ok(self.manager.add_custom_agent(agent)?)
    }

    pub fn remove_custom_agent(&self, name: &str) -> Result<()> {
        Ok(self.manager.remove_custom_agent(name)?)
    }

    pub fn get_custom_agent_launch_spec(&self, name: &str) -> Result<AgentLaunchSpec> {
        Ok(self.manager.get_custom_agent_launch_spec(name)?)
    }

    /// Chat / catalog spawn. Built-in custom ACP skips the public registry fetch.
    pub async fn get_chat_agent_launch_spec(&self, provider_id: &str) -> Result<AgentLaunchSpec> {
        if is_builtin_custom_agent_id(provider_id) {
            return self.get_custom_agent_launch_spec(provider_id);
        }
        if let Some(spec) = native_chat_launch_spec(provider_id) {
            return Ok(spec);
        }
        self.get_registry_agent_launch_spec(provider_id)
            .await
            .or_else(|_| self.get_custom_agent_launch_spec(provider_id))
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

    pub fn set_custom_agent_enabled(&self, name: &str, enabled: bool) -> Result<()> {
        Ok(self.manager.set_custom_agent_enabled(name, enabled)?)
    }

    pub async fn preload_custom_agent(&self, name: &str) -> Result<()> {
        Ok(self.manager.preload_custom_agent(name).await?)
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
        let mut env = self
            .manager
            .get_registry_agent_env_overrides(registry_id)
            .unwrap_or_default();
        if registry_id == DEEPSEEK_HARNESS_ID {
            if let Some(key) = quota_usage::stored_provider_api_key("deepseek") {
                env.insert(DEEPSEEK_API_KEY_ENV.to_string(), key);
            }
        }
        if env.is_empty() {
            None
        } else {
            Some(env)
        }
    }

    pub fn get_agent_default_config(
        &self,
        registry_id: &str,
    ) -> Option<std::collections::HashMap<String, String>> {
        self.manager.get_agent_default_config(registry_id)
    }

    pub async fn logout_agent(
        &self,
        registry_id: &str,
        cwd: Option<PathBuf>,
        auth_method_id: Option<String>,
    ) -> Result<AgentLogoutResult> {
        if is_native_chat_agent_id(canonicalize_chat_provider_id(registry_id)) {
            return Ok(native_logout_unsupported());
        }
        let launch_spec = self.get_chat_agent_launch_spec(registry_id).await?;
        let env_overrides = self.get_registry_agent_env_overrides(registry_id);
        logout_acp_agent(launch_spec, cwd, env_overrides, auth_method_id)
            .await
            .map_err(crate::error::ServiceError::Processing)
    }
}

fn native_logout_unsupported() -> AgentLogoutResult {
    let reason = Some("Native chat hosts do not use ACP logout".to_string());
    let cap = AgentCapabilityState::unsupported(reason.clone());
    AgentLogoutResult {
        agent_info: None,
        capabilities: AgentCapabilitiesSnapshot {
            session_list: cap.clone(),
            session_resume: cap.clone(),
            session_close: cap.clone(),
            logout: cap.clone(),
            config_options: cap.clone(),
            session_info_update: cap.clone(),
            load_session: cap,
        },
        logged_out: false,
        unsupported_reason: reason,
    }
}

fn persist_shared_custom_agent_api_keys(agent: &CustomAgent) {
    if agent.name != DEEPSEEK_HARNESS_ID {
        return;
    }
    let Some(key) = agent.env.get(DEEPSEEK_API_KEY_ENV) else {
        return;
    };
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return;
    }
    quota_usage::store_provider_api_key("deepseek", trimmed);
}
