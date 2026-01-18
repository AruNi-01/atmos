use std::sync::Arc;

use async_trait::async_trait;
use core_engine::TestEngine;
use infra::{TestMessageRepo, WsMessageHandler};
use sea_orm::DatabaseConnection;

use crate::error::{Result, ServiceError};
use crate::MessagePushService;

pub struct WsMessageService {
    engine: Arc<TestEngine>,
    db: DatabaseConnection,
    push_service: Arc<MessagePushService>,
}

impl WsMessageService {
    pub fn new(
        engine: Arc<TestEngine>,
        db: DatabaseConnection,
        push_service: Arc<MessagePushService>,
    ) -> Self {
        Self {
            engine,
            db,
            push_service,
        }
    }

    pub async fn process_ws_message(&self, message: &str) -> Result<String> {
        tracing::info!("[WsMessageService] Processing WebSocket message: {message}");

        let result = self.engine.process(message)?;

        let repo = TestMessageRepo::new(&self.db);
        repo.save_message(message)
            .await
            .map_err(|e| ServiceError::Repository(e.to_string()))?;

        self.push_service.update_latest_message(&result).await;

        Ok(result)
    }
}

/// Implement WsMessageHandler trait for dependency inversion
#[async_trait]
impl WsMessageHandler for WsMessageService {
    async fn handle_message(&self, conn_id: &str, message: &str) -> Option<String> {
        tracing::debug!(
            "[WsMessageHandler] Processing message from connection {}: {}",
            conn_id,
            message
        );

        match self.process_ws_message(message).await {
            Ok(result) => {
                tracing::debug!("[WsMessageHandler] Message processed successfully");
                Some(result)
            }
            Err(e) => {
                tracing::error!("[WsMessageHandler] Failed to process message: {}", e);
                None
            }
        }
    }

    async fn on_connect(&self, conn_id: &str) {
        tracing::info!("[WsMessageHandler] WebSocket client connected: {}", conn_id);
        // Can add connection initialization logic here:
        // - Send welcome message
        // - Load user preferences
        // - Join default channels
    }

    async fn on_disconnect(&self, conn_id: &str) {
        tracing::info!(
            "[WsMessageHandler] WebSocket client disconnected: {}",
            conn_id
        );
        // Can add cleanup logic here:
        // - Save user state
        // - Leave channels
        // - Clear cache
    }
}
