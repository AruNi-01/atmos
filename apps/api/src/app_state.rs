use std::sync::Arc;

use core_service::{
    AgentHooksService, AgentService, AgentSessionService, MessagePushService, NotificationService,
    ProjectService, TerminalService, TestService, WorkspaceService, WsMessageService,
};
use infra::{WsService, WsServiceConfig};
use token_usage::TokenUsageService;

pub struct AppServices {
    pub test_service: Arc<TestService>,
    pub project_service: Arc<ProjectService>,
    pub workspace_service: Arc<WorkspaceService>,
    pub agent_service: Arc<AgentService>,
    pub agent_session_service: Arc<AgentSessionService>,
    pub ws_message_service: Arc<WsMessageService>,
    pub message_push_service: Arc<MessagePushService>,
    pub terminal_service: Arc<TerminalService>,
    pub token_usage_service: Arc<TokenUsageService>,
    pub agent_hooks_service: Arc<AgentHooksService>,
    pub notification_service: Arc<NotificationService>,
}

pub struct AppState {
    pub test_service: Arc<TestService>,
    pub project_service: Arc<ProjectService>,
    pub workspace_service: Arc<WorkspaceService>,
    pub agent_service: Arc<AgentService>,
    pub agent_session_service: Arc<AgentSessionService>,
    pub message_push_service: Arc<MessagePushService>,
    pub terminal_service: Arc<TerminalService>,
    pub token_usage_service: Arc<TokenUsageService>,
    pub agent_hooks_service: Arc<AgentHooksService>,
    pub notification_service: Arc<NotificationService>,
    pub ws_service: Arc<WsService>,
    pub api_port: std::sync::atomic::AtomicU16,
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            test_service: Arc::clone(&self.test_service),
            project_service: Arc::clone(&self.project_service),
            workspace_service: Arc::clone(&self.workspace_service),
            agent_service: Arc::clone(&self.agent_service),
            agent_session_service: Arc::clone(&self.agent_session_service),
            message_push_service: Arc::clone(&self.message_push_service),
            terminal_service: Arc::clone(&self.terminal_service),
            token_usage_service: Arc::clone(&self.token_usage_service),
            agent_hooks_service: Arc::clone(&self.agent_hooks_service),
            notification_service: Arc::clone(&self.notification_service),
            ws_service: Arc::clone(&self.ws_service),
            api_port: std::sync::atomic::AtomicU16::new(self.api_port()),
        }
    }
}

impl AppState {
    pub fn new(
        services: AppServices,
        ws_service_config: WsServiceConfig,
        default_port: u16,
    ) -> Self {
        let ws_service = WsService::with_config(ws_service_config)
            .with_message_handler(services.ws_message_service);

        Self {
            test_service: services.test_service,
            project_service: services.project_service,
            workspace_service: services.workspace_service,
            agent_service: services.agent_service,
            agent_session_service: services.agent_session_service,
            message_push_service: services.message_push_service,
            terminal_service: services.terminal_service,
            token_usage_service: services.token_usage_service,
            agent_hooks_service: services.agent_hooks_service,
            notification_service: services.notification_service,
            ws_service: Arc::new(ws_service),
            api_port: std::sync::atomic::AtomicU16::new(default_port),
        }
    }

    pub fn api_port(&self) -> u16 {
        self.api_port.load(std::sync::atomic::Ordering::SeqCst)
    }
}
