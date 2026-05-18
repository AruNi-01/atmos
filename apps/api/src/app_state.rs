use std::sync::Arc;

use core_service::{
    AgentHooksService, AgentService, AgentSessionService, CanvasAgentRelay, CanvasService,
    MessagePushService, NotificationService, ProjectService, ReviewService, TerminalService,
    TestService, WorkspaceService, WsMessageService,
};
use infra::WsService;
use token_usage::TokenUsageService;

use crate::relay::RelaySupervisor;

pub struct AppServices {
    pub test_service: Arc<TestService>,
    pub project_service: Arc<ProjectService>,
    pub canvas_service: Arc<CanvasService>,
    pub workspace_service: Arc<WorkspaceService>,
    pub agent_service: Arc<AgentService>,
    pub agent_session_service: Arc<AgentSessionService>,
    pub ws_message_service: Arc<WsMessageService>,
    pub message_push_service: Arc<MessagePushService>,
    pub terminal_service: Arc<TerminalService>,
    pub token_usage_service: Arc<TokenUsageService>,
    pub agent_hooks_service: Arc<AgentHooksService>,
    pub notification_service: Arc<NotificationService>,
    pub canvas_agent_relay: Arc<CanvasAgentRelay>,
    pub review_service: Arc<ReviewService>,
}

pub struct AppState {
    pub test_service: Arc<TestService>,
    pub project_service: Arc<ProjectService>,
    pub canvas_service: Arc<CanvasService>,
    pub workspace_service: Arc<WorkspaceService>,
    pub agent_service: Arc<AgentService>,
    pub agent_session_service: Arc<AgentSessionService>,
    pub message_push_service: Arc<MessagePushService>,
    pub terminal_service: Arc<TerminalService>,
    pub token_usage_service: Arc<TokenUsageService>,
    pub agent_hooks_service: Arc<AgentHooksService>,
    pub notification_service: Arc<NotificationService>,
    pub canvas_agent_relay: Arc<CanvasAgentRelay>,
    pub review_service: Arc<ReviewService>,
    pub ws_service: Arc<WsService>,
    pub api_port: std::sync::atomic::AtomicU16,
    pub relay_supervisor: RelaySupervisor,
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            test_service: Arc::clone(&self.test_service),
            project_service: Arc::clone(&self.project_service),
            canvas_service: Arc::clone(&self.canvas_service),
            workspace_service: Arc::clone(&self.workspace_service),
            agent_service: Arc::clone(&self.agent_service),
            agent_session_service: Arc::clone(&self.agent_session_service),
            message_push_service: Arc::clone(&self.message_push_service),
            terminal_service: Arc::clone(&self.terminal_service),
            token_usage_service: Arc::clone(&self.token_usage_service),
            agent_hooks_service: Arc::clone(&self.agent_hooks_service),
            notification_service: Arc::clone(&self.notification_service),
            canvas_agent_relay: Arc::clone(&self.canvas_agent_relay),
            review_service: Arc::clone(&self.review_service),
            ws_service: Arc::clone(&self.ws_service),
            api_port: std::sync::atomic::AtomicU16::new(self.api_port()),
            relay_supervisor: self.relay_supervisor.clone(),
        }
    }
}

impl AppState {
    pub fn new(services: AppServices, default_port: u16) -> Self {
        let ws_service = WsService::new().with_message_handler(services.ws_message_service);

        Self {
            test_service: services.test_service,
            project_service: services.project_service,
            canvas_service: services.canvas_service,
            workspace_service: services.workspace_service,
            agent_service: services.agent_service,
            agent_session_service: services.agent_session_service,
            message_push_service: services.message_push_service,
            terminal_service: services.terminal_service,
            token_usage_service: services.token_usage_service,
            agent_hooks_service: services.agent_hooks_service,
            notification_service: services.notification_service,
            canvas_agent_relay: services.canvas_agent_relay,
            review_service: services.review_service,
            ws_service: Arc::new(ws_service),
            api_port: std::sync::atomic::AtomicU16::new(default_port),
            relay_supervisor: RelaySupervisor::new(),
        }
    }

    pub fn api_port(&self) -> u16 {
        self.api_port.load(std::sync::atomic::Ordering::SeqCst)
    }
}
