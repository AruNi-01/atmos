use std::sync::Arc;

use core_service::{
    AgentService, AgentSessionService, MessagePushService, ProjectService, TerminalService,
    TestService, WorkspaceService, WsMessageService,
};
use infra::{WsService, WsServiceConfig};

#[derive(Clone)]
pub struct AppState {
    pub test_service: Arc<TestService>,
    pub project_service: Arc<ProjectService>,
    pub workspace_service: Arc<WorkspaceService>,
    pub agent_service: Arc<AgentService>,
    pub agent_session_service: Arc<AgentSessionService>,
    pub message_push_service: Arc<MessagePushService>,
    pub terminal_service: Arc<TerminalService>,
    pub ws_service: Arc<WsService>,
}

impl AppState {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        test_service: Arc<TestService>,
        project_service: Arc<ProjectService>,
        workspace_service: Arc<WorkspaceService>,
        agent_service: Arc<AgentService>,
        ws_message_service: Arc<WsMessageService>,
        message_push_service: Arc<MessagePushService>,
        terminal_service: Arc<TerminalService>,
        ws_service_config: WsServiceConfig,
        db: Arc<infra::DatabaseConnection>,
    ) -> Self {
        let agent_session_service =
            Arc::new(AgentSessionService::new(Arc::clone(&agent_service), db));

        // Create WsService with injected message handler (dependency inversion)
        let ws_service =
            WsService::with_config(ws_service_config).with_message_handler(ws_message_service);

        Self {
            test_service,
            project_service,
            workspace_service,
            agent_service,
            agent_session_service,
            message_push_service,
            terminal_service,
            ws_service: Arc::new(ws_service),
        }
    }
}
