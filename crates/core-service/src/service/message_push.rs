use std::sync::Arc;
use tokio::sync::RwLock;

pub struct MessagePushService {
    latest_message: Arc<RwLock<String>>,
}

impl MessagePushService {
    pub fn new() -> Self {
        Self {
            latest_message: Arc::new(RwLock::new(String::new())),
        }
    }

    pub async fn update_latest_message(&self, msg: &str) {
        tracing::info!("[MessagePushService] Updating latest message: {msg}");
        let mut message = self.latest_message.write().await;
        *message = msg.to_string();
    }

    pub async fn get_latest_message(&self) -> String {
        self.latest_message.read().await.clone()
    }

    pub fn latest_message_handle(&self) -> Arc<RwLock<String>> {
        Arc::clone(&self.latest_message)
    }
}

impl Default for MessagePushService {
    fn default() -> Self {
        Self::new()
    }
}
