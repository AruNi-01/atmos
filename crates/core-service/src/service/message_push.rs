use crate::types::SharedString;
use std::sync::Arc;
use tokio::sync::Notify;

pub struct MessagePushService {
    latest_message: SharedString,
    notify: Arc<Notify>,
}

impl MessagePushService {
    pub fn new() -> Self {
        Self {
            latest_message: SharedString::default(),
            notify: Arc::new(Notify::new()),
        }
    }

    pub async fn update_latest_message(&self, msg: &str) {
        tracing::info!("[MessagePushService] Updating latest message: {msg}");
        let mut message = self.latest_message.write().await;
        *message = msg.to_string();
        drop(message);
        self.notify.notify_waiters();
    }

    pub async fn get_latest_message(&self) -> String {
        self.latest_message.read().await.clone()
    }

    /// Wait until a new message is available (or timeout after 30s as a safety net).
    pub async fn wait_for_update(&self) {
        tokio::time::timeout(
            tokio::time::Duration::from_secs(30),
            self.notify.notified(),
        )
        .await
        .ok();
    }

    pub fn latest_message_handle(&self) -> SharedString {
        self.latest_message.clone()
    }
}

impl Default for MessagePushService {
    fn default() -> Self {
        Self::new()
    }
}
