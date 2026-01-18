use std::sync::Arc;

use core_service::{MessagePushService, TestService, WsMessageService};
use infra::{WsService, WsServiceConfig};

#[derive(Clone)]
pub struct AppState {
    pub test_service: Arc<TestService>,
    pub message_push_service: Arc<MessagePushService>,
    pub ws_service: Arc<WsService>,
}

impl AppState {
    pub fn new(
        test_service: Arc<TestService>,
        ws_message_service: Arc<WsMessageService>,
        message_push_service: Arc<MessagePushService>,
        ws_service_config: WsServiceConfig,
    ) -> Self {
        // Create WsService with injected message handler (dependency inversion)
        let ws_service =
            WsService::with_config(ws_service_config).with_message_handler(ws_message_service);

        Self {
            test_service,
            message_push_service,
            ws_service: Arc::new(ws_service),
        }
    }
}
