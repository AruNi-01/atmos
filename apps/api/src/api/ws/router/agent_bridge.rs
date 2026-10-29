use serde_json::Value;

use core_service::{Result, ServiceError};

use super::{
    AgentBridgeReplyRequest, AgentBridgeSendRequest, AgentBridgeStatusRequest, WsMessageService,
};

impl WsMessageService {
    pub(super) async fn handle_agent_bridge_send(
        &self,
        req: AgentBridgeSendRequest,
    ) -> Result<Value> {
        serde_json::to_value(self.agent_bridge_service.send(req).await?)
            .map_err(|e| ServiceError::Processing(e.to_string()))
    }

    pub(super) async fn handle_agent_bridge_request(
        &self,
        req: AgentBridgeSendRequest,
    ) -> Result<Value> {
        serde_json::to_value(self.agent_bridge_service.request(req).await?)
            .map_err(|e| ServiceError::Processing(e.to_string()))
    }

    pub(super) async fn handle_agent_bridge_reply(
        &self,
        req: AgentBridgeReplyRequest,
    ) -> Result<Value> {
        serde_json::to_value(self.agent_bridge_service.reply(req).await?)
            .map_err(|e| ServiceError::Processing(e.to_string()))
    }

    pub(super) async fn handle_agent_bridge_status(
        &self,
        req: AgentBridgeStatusRequest,
    ) -> Result<Value> {
        serde_json::to_value(self.agent_bridge_service.status(req).await?)
            .map_err(|e| ServiceError::Processing(e.to_string()))
    }
}
