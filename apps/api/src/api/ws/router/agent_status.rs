use super::*;
use serde_json::{json, Value};

impl WsMessageService {
    pub(super) async fn handle_agent_session_status_list(
        &self,
        req: AgentSessionStatusListRequest,
    ) -> Result<Value> {
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
        let limit = if req.limit == 0 {
            core_service::AGENT_SESSION_PAGE_LIMIT
        } else {
            req.limit as usize
        };
        let page = core_service::page_agent_sessions(sessions, req.cursor.as_deref(), limit);
        Ok(json!({
            "sessions": page.sessions,
            "next_cursor": page.next_cursor,
            "total": page.total,
            "counts": page.counts,
        }))
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
