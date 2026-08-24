//! Connection-scoped background task registry.
//!
//! Used by APP-066 Resource Monitor so each WebSocket connection owns at most
//! one push task. Generation tokens prevent a finishing/aborted task from
//! deleting a newer replacement.

use std::collections::HashMap;
use std::sync::Mutex;

use tokio::task::JoinHandle;

struct RegisteredTask {
    generation: u64,
    handle: Option<JoinHandle<()>>,
}

/// `conn_id` → task map with replace/abort and generation-safe self-cleanup.
pub struct ConnectionTaskRegistry {
    inner: Mutex<HashMap<String, RegisteredTask>>,
}

impl Default for ConnectionTaskRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ConnectionTaskRegistry {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, RegisteredTask>> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Abort any existing task and reserve the next generation for `conn_id`.
    pub fn prepare_replace(&self, conn_id: &str) -> u64 {
        let mut map = self.lock();
        let generation = map
            .get(conn_id)
            .map(|task| task.generation.wrapping_add(1))
            .unwrap_or(1);
        if let Some(old) = map.insert(
            conn_id.to_string(),
            RegisteredTask {
                generation,
                handle: None,
            },
        ) {
            if let Some(handle) = old.handle {
                handle.abort();
            }
        }
        generation
    }

    /// Install `handle` only when `generation` is still current.
    ///
    /// A stale commit (unsubscribe, disconnect, or a newer replace) aborts
    /// `handle` so the replacement task is not leaked.
    pub fn commit_replace(&self, conn_id: &str, generation: u64, handle: JoinHandle<()>) -> bool {
        let mut map = self.lock();
        match map.get_mut(conn_id) {
            Some(slot) if slot.generation == generation => {
                if let Some(previous) = slot.handle.replace(handle) {
                    previous.abort();
                }
                true
            }
            _ => {
                handle.abort();
                false
            }
        }
    }

    /// Abort and remove the task for `conn_id`. Idempotent.
    pub fn abort_and_remove(&self, conn_id: &str) {
        let mut map = self.lock();
        if let Some(task) = map.remove(conn_id) {
            if let Some(handle) = task.handle {
                handle.abort();
            }
        }
    }

    /// Remove the entry only when `generation` still owns the slot.
    pub fn remove_if_generation(&self, conn_id: &str, generation: u64) -> bool {
        let mut map = self.lock();
        let matches = map
            .get(conn_id)
            .is_some_and(|task| task.generation == generation);
        if matches {
            if let Some(task) = map.remove(conn_id) {
                if let Some(handle) = task.handle {
                    handle.abort();
                }
            }
        }
        matches
    }

    /// Abort every remaining task. Safe to call from `Drop`.
    pub fn abort_all(&self) {
        let mut map = self.lock();
        for (_, task) in map.drain() {
            if let Some(handle) = task.handle {
                handle.abort();
            }
        }
    }

    #[cfg(test)]
    pub fn contains(&self, conn_id: &str) -> bool {
        self.lock().contains_key(conn_id)
    }

    #[cfg(test)]
    pub fn generation_of(&self, conn_id: &str) -> Option<u64> {
        self.lock().get(conn_id).map(|task| task.generation)
    }

    #[cfg(test)]
    pub fn is_empty(&self) -> bool {
        self.lock().is_empty()
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.lock().len()
    }
}

impl Drop for ConnectionTaskRegistry {
    fn drop(&mut self) {
        self.abort_all();
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use tokio::sync::oneshot;

    use super::ConnectionTaskRegistry;

    fn spawn_pending() -> (tokio::task::JoinHandle<()>, oneshot::Receiver<()>) {
        let (alive_tx, alive_rx) = oneshot::channel();
        let handle = tokio::spawn(async move {
            let _alive_tx = alive_tx;
            std::future::pending::<()>().await;
        });
        (handle, alive_rx)
    }

    async fn wait_cancelled(alive_rx: oneshot::Receiver<()>) {
        let result = tokio::time::timeout(Duration::from_secs(1), alive_rx)
            .await
            .expect("timed out waiting for task abort");
        assert!(
            result.is_err(),
            "aborted task should drop its oneshot sender"
        );
    }

    #[tokio::test]
    async fn resource_monitor_replace_aborts_previous_task() {
        let registry = ConnectionTaskRegistry::new();
        let first = registry.prepare_replace("conn-a");
        let (first_handle, first_alive) = spawn_pending();
        assert!(registry.commit_replace("conn-a", first, first_handle));

        let second = registry.prepare_replace("conn-a");
        assert_ne!(first, second);
        let (second_handle, _second_alive) = spawn_pending();
        assert!(registry.commit_replace("conn-a", second, second_handle));

        wait_cancelled(first_alive).await;
        assert_eq!(registry.generation_of("conn-a"), Some(second));
        assert_eq!(registry.len(), 1);
    }

    #[tokio::test]
    async fn resource_monitor_unsubscribe_is_idempotent() {
        let registry = ConnectionTaskRegistry::new();
        let generation = registry.prepare_replace("conn-b");
        let (handle, _alive) = spawn_pending();
        assert!(registry.commit_replace("conn-b", generation, handle));

        registry.abort_and_remove("conn-b");
        registry.abort_and_remove("conn-b");
        registry.abort_and_remove("missing");
        assert!(!registry.contains("conn-b"));
        assert!(registry.is_empty());
    }

    #[tokio::test]
    async fn resource_monitor_disconnect_clears_subscription() {
        let registry = ConnectionTaskRegistry::new();
        let generation = registry.prepare_replace("conn-c");
        let (handle, alive) = spawn_pending();
        assert!(registry.commit_replace("conn-c", generation, handle));

        registry.abort_and_remove("conn-c");
        wait_cancelled(alive).await;
        assert!(!registry.contains("conn-c"));
        assert!(registry.generation_of("conn-c").is_none());
    }

    #[tokio::test]
    async fn resource_monitor_stale_generation_cannot_remove_replacement() {
        let registry = ConnectionTaskRegistry::new();
        let first = registry.prepare_replace("conn-d");
        let (first_handle, _first_alive) = spawn_pending();
        assert!(registry.commit_replace("conn-d", first, first_handle));

        let second = registry.prepare_replace("conn-d");
        let (second_handle, _second_alive) = spawn_pending();
        assert!(registry.commit_replace("conn-d", second, second_handle));

        assert!(!registry.remove_if_generation("conn-d", first));
        assert!(registry.contains("conn-d"));
        assert_eq!(registry.generation_of("conn-d"), Some(second));
        assert!(registry.remove_if_generation("conn-d", second));
        assert!(!registry.contains("conn-d"));
    }

    #[tokio::test]
    async fn resource_monitor_stale_commit_aborts_new_handle() {
        let registry = ConnectionTaskRegistry::new();
        let first = registry.prepare_replace("conn-e");
        let _second = registry.prepare_replace("conn-e");

        let (handle, alive) = spawn_pending();
        assert!(!registry.commit_replace("conn-e", first, handle));
        wait_cancelled(alive).await;
        assert!(registry.contains("conn-e"));
    }
}
