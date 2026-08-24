//! Connection-scoped background task registry.
//!
//! Used by APP-066 Resource Monitor so each WebSocket connection owns at most
//! one push task. Generation tokens prevent a finishing/aborted task from
//! deleting a newer replacement.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use tokio::task::JoinHandle;

struct RegisteredTask {
    generation: u64,
    handle: Option<JoinHandle<()>>,
}

/// `conn_id` → task map with replace/abort and generation-safe self-cleanup.
///
/// Generations come from a process-wide counter so `prepare_replace` never
/// reuses a value after abort/remove. A stale closer therefore cannot delete a
/// newer reserved slot.
pub struct ConnectionTaskRegistry {
    inner: Mutex<HashMap<String, RegisteredTask>>,
    next_generation: AtomicU64,
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
            next_generation: AtomicU64::new(1),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, RegisteredTask>> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn allocate_generation(&self) -> u64 {
        self.next_generation.fetch_add(1, Ordering::Relaxed)
    }

    /// Abort any existing task and reserve a unique generation for `conn_id`.
    ///
    /// The reserved generation is never reused, including after abort/remove.
    pub fn prepare_replace(&self, conn_id: &str) -> u64 {
        let generation = self.allocate_generation();
        let mut map = self.lock();
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
    ///
    /// Aborts the stored handle. Use [`Self::take_if_generation`] from the
    /// running task so it does not abort itself.
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

    /// Remove the matching slot without aborting its handle.
    ///
    /// The running task calls this for self-cleanup, then exits. Dropping the
    /// `JoinHandle` detaches rather than aborting.
    pub fn take_if_generation(&self, conn_id: &str, generation: u64) -> bool {
        let mut map = self.lock();
        let matches = map
            .get(conn_id)
            .is_some_and(|task| task.generation == generation);
        if matches {
            let _ = map.remove(conn_id);
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

    #[cfg(test)]
    pub fn has_handle(&self, conn_id: &str) -> bool {
        self.lock()
            .get(conn_id)
            .is_some_and(|task| task.handle.is_some())
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

    #[tokio::test]
    async fn resource_monitor_prepare_replace_never_reuses_generation_after_abort() {
        let registry = ConnectionTaskRegistry::new();
        let first = registry.prepare_replace("conn-reuse");
        registry.abort_and_remove("conn-reuse");
        assert!(!registry.contains("conn-reuse"));

        let second = registry.prepare_replace("conn-reuse");
        assert!(
            second > first,
            "generation must stay unique after abort/remove, got first={first} second={second}"
        );
        assert_eq!(registry.generation_of("conn-reuse"), Some(second));
        assert!(!registry.remove_if_generation("conn-reuse", first));
        assert_eq!(registry.generation_of("conn-reuse"), Some(second));
    }

    #[tokio::test]
    async fn resource_monitor_failed_cleanup_cannot_delete_newer_reserved_slot() {
        let registry = ConnectionTaskRegistry::new();
        let first = registry.prepare_replace("conn-cleanup");
        let second = registry.prepare_replace("conn-cleanup");
        assert_ne!(first, second);
        assert!(!registry.has_handle("conn-cleanup"));

        assert!(
            !registry.remove_if_generation("conn-cleanup", first),
            "stale snapshot-fail cleanup must not delete a newer reserved slot"
        );
        assert_eq!(registry.generation_of("conn-cleanup"), Some(second));
        assert_eq!(registry.len(), 1);
    }

    #[tokio::test]
    async fn resource_monitor_unsubscribe_then_resubscribe_rejects_stale_generation() {
        let registry = ConnectionTaskRegistry::new();

        let gen1 = registry.prepare_replace("conn-race");
        let (first_handle, _first_alive) = spawn_pending();
        assert!(registry.commit_replace("conn-race", gen1, first_handle));

        registry.abort_and_remove("conn-race");
        assert!(!registry.contains("conn-race"));

        let gen2 = registry.prepare_replace("conn-race");
        assert_ne!(gen1, gen2, "unsubscribe must not reset generation");
        assert_eq!(registry.generation_of("conn-race"), Some(gen2));

        assert!(
            !registry.remove_if_generation("conn-race", gen1),
            "gen1 remove must not delete the gen2 reserved slot"
        );
        assert_eq!(registry.generation_of("conn-race"), Some(gen2));

        let (stale_handle, stale_alive) = spawn_pending();
        assert!(
            !registry.commit_replace("conn-race", gen1, stale_handle),
            "stale gen1 commit must fail"
        );
        wait_cancelled(stale_alive).await;

        let (gen2_handle, _gen2_alive) = spawn_pending();
        assert!(registry.commit_replace("conn-race", gen2, gen2_handle));
        assert_eq!(registry.len(), 1);
        assert!(registry.has_handle("conn-race"));
        assert_eq!(registry.generation_of("conn-race"), Some(gen2));
    }

    #[tokio::test]
    async fn resource_monitor_take_if_generation_does_not_abort_running_task() {
        let registry = std::sync::Arc::new(ConnectionTaskRegistry::new());
        let gen = registry.prepare_replace("conn-self");
        let (start_tx, start_rx) = oneshot::channel();
        let (continued_tx, continued_rx) = oneshot::channel();
        let registry_task = std::sync::Arc::clone(&registry);
        let handle = tokio::spawn(async move {
            let _ = start_rx.await;
            assert!(registry_task.take_if_generation("conn-self", gen));
            tokio::task::yield_now().await;
            let _ = continued_tx.send(());
        });
        assert!(registry.commit_replace("conn-self", gen, handle));
        start_tx.send(()).expect("start self-cleanup");

        tokio::time::timeout(Duration::from_secs(1), continued_rx)
            .await
            .expect("self-cleanup aborted the running task")
            .expect("continued sender dropped");
        assert!(!registry.contains("conn-self"));
    }
}
