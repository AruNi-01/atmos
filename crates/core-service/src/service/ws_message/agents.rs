use super::*;
use crate::service::ws_message_support::parse_agent_id;
use agent::CustomAgent;

impl WsMessageService {
    pub(super) async fn handle_agent_list(&self) -> Result<Value> {
        let agents = self.agent_service.list_agents();
        Ok(json!({ "agents": agents }))
    }

    pub(super) async fn handle_agent_install(&self, req: AgentInstallRequest) -> Result<Value> {
        let id = parse_agent_id(&req.id)?;

        let result = self.agent_service.install_agent(id).await?;
        Ok(json!(result))
    }

    pub(super) async fn handle_agent_config_get(
        &self,
        req: AgentConfigGetRequest,
    ) -> Result<Value> {
        let id = parse_agent_id(&req.id)?;
        let state = self.agent_service.get_agent_config(id)?;
        Ok(json!(state))
    }

    pub(super) async fn handle_agent_config_set(
        &self,
        req: AgentConfigSetRequest,
    ) -> Result<Value> {
        let id = parse_agent_id(&req.id)?;
        self.agent_service.set_agent_api_key(id, &req.api_key)?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_agent_registry_list(
        &self,
        req: AgentRegistryListRequest,
    ) -> Result<Value> {
        let agents = self
            .agent_service
            .list_registry_agents(req.force_refresh)
            .await?;
        Ok(json!({ "agents": agents }))
    }

    pub(super) async fn handle_agent_registry_install(
        &self,
        req: AgentRegistryInstallRequest,
    ) -> Result<Value> {
        let result = self
            .agent_service
            .install_registry_agent(&req.registry_id, req.force_overwrite)
            .await?;
        Ok(json!(result))
    }

    pub(super) async fn handle_agent_registry_remove(
        &self,
        req: AgentRegistryRemoveRequest,
    ) -> Result<Value> {
        let result = self
            .agent_service
            .remove_registry_agent(&req.registry_id)
            .await?;
        Ok(json!(result))
    }

    pub(super) async fn handle_custom_agent_list(&self) -> Result<Value> {
        let agents = self.agent_service.list_custom_agents()?;
        Ok(json!({ "agents": agents }))
    }

    pub(super) async fn handle_custom_agent_add(
        &self,
        req: CustomAgentAddRequest,
    ) -> Result<Value> {
        let agent = CustomAgent {
            name: req.name,
            agent_type: "custom".to_string(),
            command: req.command,
            args: req.args,
            env: req.env,
            default_config: None,
        };
        self.agent_service.add_custom_agent(&agent)?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_custom_agent_remove(
        &self,
        req: CustomAgentRemoveRequest,
    ) -> Result<Value> {
        self.agent_service.remove_custom_agent(&req.name)?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_custom_agent_get_json(&self) -> Result<Value> {
        let json = self.agent_service.get_custom_agents_json()?;
        Ok(json!({ "json": json }))
    }

    pub(super) async fn handle_custom_agent_set_json(
        &self,
        req: CustomAgentSetJsonRequest,
    ) -> Result<Value> {
        self.agent_service.set_custom_agents_json(&req.json)?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_custom_agent_get_manifest_path(&self) -> Result<Value> {
        let path = self.agent_service.get_manifest_path()?;
        Ok(json!({ "path": path }))
    }
}
