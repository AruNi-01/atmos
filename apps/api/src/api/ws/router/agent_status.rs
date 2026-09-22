use super::*;
use serde_json::{json, Value};

impl WsMessageService {
    pub(super) async fn handle_agent_session_status_list(&self) -> Result<Value> {
        let sessions = self
            .agent_status_service
            .list_agent_session_statuses()
            .await?;
        Ok(json!({ "sessions": sessions }))
    }

    pub(super) async fn handle_agent_session_archive(
        &self,
        req: AgentSessionArchiveRequest,
    ) -> Result<Value> {
        self.agent_status_service
            .archive_agent_session(&req.session_id)
            .await?;
        Ok(json!({ "ok": true }))
    }
}
