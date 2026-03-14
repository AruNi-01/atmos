use crate::types::SharedString;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::sync::watch;

pub struct MessagePushService {
    latest_message: SharedString,
    version: AtomicU64,
    version_tx: watch::Sender<u64>,
}

impl MessagePushService {
    pub fn new() -> Self {
        let (version_tx, _) = watch::channel(0);
        Self {
            latest_message: SharedString::default(),
            version: AtomicU64::new(0),
            version_tx,
        }
    }

    pub async fn update_latest_message(&self, msg: &str) {
        tracing::info!("[MessagePushService] Updating latest message: {msg}");
        let mut message = self.latest_message.write().await;
        *message = msg.to_string();
        // Increment version while still holding the write lock so that
        // get_latest_snapshot (which acquires a read lock) always sees a
        // consistent (version, message) pair.
        let version = self.version.fetch_add(1, Ordering::SeqCst) + 1;
        drop(message);

        let _ = self.version_tx.send(version);
    }

    pub async fn get_latest_message(&self) -> String {
        self.latest_message.read().await.clone()
    }

    pub async fn get_latest_snapshot(&self) -> (u64, String) {
        // Hold the read lock while loading both version and message to ensure
        // they are consistent (no concurrent update_latest_message can interleave).
        let message_guard = self.latest_message.read().await;
        let version = self.version.load(Ordering::SeqCst);
        let message = message_guard.clone();
        drop(message_guard);
        (version, message)
    }

    pub fn current_version(&self) -> u64 {
        self.version.load(Ordering::SeqCst)
    }

    pub fn subscribe(&self) -> watch::Receiver<u64> {
        self.version_tx.subscribe()
    }

    /// Wait until a new message is available (or timeout after 30s as a safety net).
    pub async fn wait_for_update(
        &self,
        updates: &mut watch::Receiver<u64>,
    ) -> Result<bool, watch::error::RecvError> {
        match tokio::time::timeout(tokio::time::Duration::from_secs(30), updates.changed()).await {
            Ok(Ok(())) => Ok(true),
            Ok(Err(err)) => Err(err),
            Err(_) => Ok(false),
        }
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

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::MessagePushService;

    #[tokio::test]
    async fn subscribe_does_not_miss_updates_before_wait_starts() {
        let service = MessagePushService::new();
        let mut updates = service.subscribe();

        service.update_latest_message("hello").await;

        let changed = tokio::time::timeout(Duration::from_millis(50), updates.changed()).await;
        assert!(matches!(changed, Ok(Ok(()))));

        let (version, latest) = service.get_latest_snapshot().await;
        assert_eq!(version, 1);
        assert_eq!(latest, "hello");
    }
}
