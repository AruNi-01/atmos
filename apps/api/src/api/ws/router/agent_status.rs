use super::*;
use serde_json::{json, Value};

impl WsMessageService {
    pub(super) async fn handle_agent_session_status_list(&self) -> Result<Value> {
        let chats = self.agent_chat_service.live_session_chats()?;
        let open_terminal_panes = self.terminal_service.list_open_stable_pane_ids().await?;
        let commands = core_service::terminal_agent_command_names();
        let shell_terminal_panes = self.terminal_service.shell_agent_pane_ids(&commands);
        let sessions = self
            .agent_status_service
            .list_live_agent_sessions(core_service::AgentSessionLiveSet {
                chats,
                open_terminal_panes,
                shell_terminal_panes,
            })
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
