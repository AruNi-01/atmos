//! Canvas terminal-agent relay state (APP-015).
//!
//! Owns two pieces of in-memory state:
//!
//! 1. **Bridge registry** — which browser WebSocket connections have announced
//!    themselves as "Canvas-eligible" via `canvas_bridge_register`.
//! 2. **Pending dispatch waiters** — oneshot channels that the HTTP invoke
//!    handler awaits, completed when the matching browser tab uplinks a
//!    `canvas_agent_dispatch_result`.
//!
//! Both pieces are pure in-memory; no persistence layer. State is purged on
//! WS disconnect / bridge unregister / process restart.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::oneshot;

/// Default relay timeout if the HTTP caller doesn't override it.
pub const DEFAULT_RELAY_TIMEOUT_MS: u64 = 45_000;
/// Hard ceiling so a misbehaving CLI cannot pin a server slot indefinitely.
pub const MAX_RELAY_TIMEOUT_MS: u64 = 5 * 60_000;

/// Result of a single relayed canvas-agent command, as reported by the browser.
#[derive(Debug, Clone)]
pub struct CanvasAgentDispatchOutcome {
    pub success: bool,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub recoverable: Option<bool>,
    pub data: Value,
}

#[derive(Debug, Clone)]
struct BridgeEntry {
    conn_id: String,
    client_id: String,
    label: Option<String>,
    accepts_commands: bool,
    capabilities: Vec<String>,
    updated_at: SystemTime,
}

/// Summary of a registered Canvas tab, exposed via `status`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasBridgeClientSummary {
    pub client_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub accepts_commands: bool,
    /// Seconds since the registry entry was last touched.
    pub age_secs: u64,
    pub capabilities: Vec<String>,
}

/// Aggregate state returned by `status`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasBridgeStatus {
    pub bridge_registered_count: usize,
    pub accepting_count: usize,
    pub ambiguous: bool,
    pub clients: Vec<CanvasBridgeClientSummary>,
}

/// Result of resolving a routing target before dispatching.
#[derive(Debug)]
pub enum ResolveTarget {
    /// Exactly one eligible client — proceed with dispatch.
    Single { conn_id: String, client_id: String },
    /// No clients are registered or accepting.
    Offline,
    /// More than one client and no `client_id` was supplied.
    Ambiguous { clients: Vec<CanvasBridgeClientSummary> },
    /// `client_id` was supplied but didn't match any registered client.
    NotFound,
    /// `client_id` matched a registered client that has `accepts_commands = false`.
    NotAccepting { client_id: String },
}

/// Shared, sendable handle to the relay.
#[derive(Default)]
pub struct CanvasAgentRelay {
    bridge: Mutex<Vec<BridgeEntry>>,
    pending: Mutex<HashMap<String, oneshot::Sender<CanvasAgentDispatchOutcome>>>,
}

impl CanvasAgentRelay {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register / refresh a browser-tab bridge entry.
    ///
    /// Called from the WS handler for `canvas_bridge_register`.
    pub fn register(
        &self,
        conn_id: impl Into<String>,
        client_id: impl Into<String>,
        label: Option<String>,
        accepts_commands: bool,
        capabilities: Vec<String>,
    ) {
        let conn_id = conn_id.into();
        let client_id = client_id.into();
        let mut bridge = self.bridge.lock().unwrap();
        // Replace any pre-existing entry on the same conn_id + client_id pair.
        bridge.retain(|entry| !(entry.conn_id == conn_id && entry.client_id == client_id));
        bridge.push(BridgeEntry {
            conn_id,
            client_id,
            label,
            accepts_commands,
            capabilities,
            updated_at: SystemTime::now(),
        });
    }

    /// Remove a specific (`conn_id`, `client_id`) registration.
    pub fn unregister(&self, conn_id: &str, client_id: &str) {
        let mut bridge = self.bridge.lock().unwrap();
        bridge.retain(|entry| !(entry.conn_id == conn_id && entry.client_id == client_id));
    }

    /// Purge every entry tied to a WebSocket connection.
    ///
    /// Called from `on_disconnect`.
    pub fn unregister_conn(&self, conn_id: &str) {
        let mut bridge = self.bridge.lock().unwrap();
        bridge.retain(|entry| entry.conn_id != conn_id);
    }

    /// Snapshot of the bridge registry for diagnostics.
    pub fn status(&self) -> CanvasBridgeStatus {
        let bridge = self.bridge.lock().unwrap();
        let now = SystemTime::now();
        let clients: Vec<CanvasBridgeClientSummary> = bridge
            .iter()
            .map(|entry| {
                let age_secs = now
                    .duration_since(entry.updated_at)
                    .unwrap_or_default()
                    .as_secs();
                CanvasBridgeClientSummary {
                    client_id: entry.client_id.clone(),
                    label: entry.label.clone(),
                    accepts_commands: entry.accepts_commands,
                    age_secs,
                    capabilities: entry.capabilities.clone(),
                }
            })
            .collect();
        let bridge_registered_count = clients.len();
        let accepting_count = clients.iter().filter(|c| c.accepts_commands).count();
        let ambiguous = accepting_count > 1;
        CanvasBridgeStatus {
            bridge_registered_count,
            accepting_count,
            ambiguous,
            clients,
        }
    }

    /// Resolve which registered tab should receive a dispatch.
    pub fn resolve_target(&self, client_id: Option<&str>) -> ResolveTarget {
        let bridge = self.bridge.lock().unwrap();
        let accepting: Vec<&BridgeEntry> =
            bridge.iter().filter(|e| e.accepts_commands).collect();

        if let Some(want) = client_id {
            // Exact match against any registered entry (accepting or not).
            if let Some(entry) = bridge.iter().find(|e| e.client_id == want) {
                if !entry.accepts_commands {
                    return ResolveTarget::NotAccepting {
                        client_id: entry.client_id.clone(),
                    };
                }
                return ResolveTarget::Single {
                    conn_id: entry.conn_id.clone(),
                    client_id: entry.client_id.clone(),
                };
            }
            return ResolveTarget::NotFound;
        }

        match accepting.as_slice() {
            [] => ResolveTarget::Offline,
            [only] => ResolveTarget::Single {
                conn_id: only.conn_id.clone(),
                client_id: only.client_id.clone(),
            },
            many => {
                let now = SystemTime::now();
                let clients = many
                    .iter()
                    .map(|entry| {
                        let age_secs = now
                            .duration_since(entry.updated_at)
                            .unwrap_or_default()
                            .as_secs();
                        CanvasBridgeClientSummary {
                            client_id: entry.client_id.clone(),
                            label: entry.label.clone(),
                            accepts_commands: entry.accepts_commands,
                            age_secs,
                            capabilities: entry.capabilities.clone(),
                        }
                    })
                    .collect();
                ResolveTarget::Ambiguous { clients }
            }
        }
    }

    /// Register a pending dispatch and return the receiver the HTTP handler
    /// must await.
    ///
    /// If a waiter already exists for `request_id` it is replaced (and the
    /// previous waiter never resolves — its caller will time out).
    pub fn begin_pending(&self, request_id: impl Into<String>) -> oneshot::Receiver<CanvasAgentDispatchOutcome> {
        let (tx, rx) = oneshot::channel();
        let request_id = request_id.into();
        let mut pending = self.pending.lock().unwrap();
        pending.insert(request_id, tx);
        rx
    }

    /// Drop a pending waiter without firing it (called from the HTTP handler
    /// on timeout / early bail-out).
    pub fn cancel_pending(&self, request_id: &str) {
        let mut pending = self.pending.lock().unwrap();
        pending.remove(request_id);
    }

    /// Browser uplink: complete a pending waiter.
    ///
    /// Returns `true` when a waiter was found, `false` when the result arrived
    /// after timeout / was a duplicate.
    pub fn complete_dispatch(&self, request_id: &str, outcome: CanvasAgentDispatchOutcome) -> bool {
        let mut pending = self.pending.lock().unwrap();
        if let Some(tx) = pending.remove(request_id) {
            // The receiver may have already been dropped (CLI timed out
            // before browser answered). Ignore the SendError in that case.
            let _ = tx.send(outcome);
            true
        } else {
            false
        }
    }

    /// Clamp a CLI-supplied timeout into the supported window.
    pub fn clamp_timeout(timeout_ms: Option<u64>) -> Duration {
        let raw = timeout_ms.unwrap_or(DEFAULT_RELAY_TIMEOUT_MS);
        let clamped = raw.clamp(1_000, MAX_RELAY_TIMEOUT_MS);
        Duration::from_millis(clamped)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_and_status_count() {
        let relay = CanvasAgentRelay::new();
        relay.register("conn-1", "client-a", Some("Tab A".into()), true, vec![]);
        relay.register("conn-2", "client-b", None, true, vec![]);

        let status = relay.status();
        assert_eq!(status.bridge_registered_count, 2);
        assert_eq!(status.accepting_count, 2);
        assert!(status.ambiguous);
        assert!(status.clients.iter().any(|c| c.client_id == "client-a"));
    }

    #[test]
    fn resolve_target_single() {
        let relay = CanvasAgentRelay::new();
        relay.register("conn-1", "client-a", None, true, vec![]);
        match relay.resolve_target(None) {
            ResolveTarget::Single { client_id, .. } => assert_eq!(client_id, "client-a"),
            other => panic!("expected Single, got {:?}", other),
        }
    }

    #[test]
    fn resolve_target_ambiguous_without_hint() {
        let relay = CanvasAgentRelay::new();
        relay.register("conn-1", "client-a", None, true, vec![]);
        relay.register("conn-2", "client-b", None, true, vec![]);
        match relay.resolve_target(None) {
            ResolveTarget::Ambiguous { clients } => assert_eq!(clients.len(), 2),
            other => panic!("expected Ambiguous, got {:?}", other),
        }
    }

    #[test]
    fn resolve_target_pinned_by_client_id() {
        let relay = CanvasAgentRelay::new();
        relay.register("conn-1", "client-a", None, true, vec![]);
        relay.register("conn-2", "client-b", None, true, vec![]);
        match relay.resolve_target(Some("client-b")) {
            ResolveTarget::Single { conn_id, .. } => assert_eq!(conn_id, "conn-2"),
            other => panic!("expected Single, got {:?}", other),
        }
    }

    #[test]
    fn resolve_target_unknown_client_id() {
        let relay = CanvasAgentRelay::new();
        relay.register("conn-1", "client-a", None, true, vec![]);
        assert!(matches!(
            relay.resolve_target(Some("nope")),
            ResolveTarget::NotFound
        ));
    }

    #[test]
    fn resolve_target_offline_when_empty() {
        let relay = CanvasAgentRelay::new();
        assert!(matches!(relay.resolve_target(None), ResolveTarget::Offline));
    }

    #[test]
    fn unregister_conn_purges_all_clients_for_connection() {
        let relay = CanvasAgentRelay::new();
        relay.register("conn-1", "client-a", None, true, vec![]);
        relay.register("conn-1", "client-b", None, true, vec![]);
        relay.unregister_conn("conn-1");
        assert_eq!(relay.status().bridge_registered_count, 0);
    }

    #[tokio::test]
    async fn pending_round_trip_completes() {
        let relay = CanvasAgentRelay::new();
        let rx = relay.begin_pending("req-1");
        assert!(relay.complete_dispatch(
            "req-1",
            CanvasAgentDispatchOutcome {
                success: true,
                error_code: None,
                error_message: None,
                recoverable: None,
                data: serde_json::Value::Null,
            },
        ));
        let outcome = rx.await.expect("oneshot must succeed");
        assert!(outcome.success);
    }

    #[test]
    fn complete_dispatch_without_pending_returns_false() {
        let relay = CanvasAgentRelay::new();
        let res = relay.complete_dispatch(
            "missing",
            CanvasAgentDispatchOutcome {
                success: true,
                error_code: None,
                error_message: None,
                recoverable: None,
                data: serde_json::Value::Null,
            },
        );
        assert!(!res);
    }

    #[test]
    fn clamp_timeout_default_when_none() {
        assert_eq!(
            CanvasAgentRelay::clamp_timeout(None),
            Duration::from_millis(DEFAULT_RELAY_TIMEOUT_MS)
        );
    }

    #[test]
    fn clamp_timeout_caps_at_max() {
        assert_eq!(
            CanvasAgentRelay::clamp_timeout(Some(MAX_RELAY_TIMEOUT_MS * 10)),
            Duration::from_millis(MAX_RELAY_TIMEOUT_MS)
        );
    }

    #[test]
    fn clamp_timeout_floor_at_one_second() {
        assert_eq!(
            CanvasAgentRelay::clamp_timeout(Some(0)),
            Duration::from_millis(1_000)
        );
    }
}
