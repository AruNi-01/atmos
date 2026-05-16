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

/// Returned by [`CanvasAgentRelay::begin_pending`] when a waiter already
/// exists for the same `request_id`. The handler should surface this back to
/// the caller (typically as a 409) rather than silently overwriting.
#[derive(Debug, Clone)]
pub struct DuplicateRequestError {
    pub request_id: String,
}

impl std::fmt::Display for DuplicateRequestError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "duplicate canvas-agent request_id '{}' already in flight",
            self.request_id
        )
    }
}

impl std::error::Error for DuplicateRequestError {}

/// Outcome of [`CanvasAgentRelay::complete_dispatch`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompleteDispatchResult {
    /// Pending waiter found and signalled.
    Completed,
    /// No waiter — the result arrived after timeout or was a duplicate.
    Unknown,
    /// A waiter exists for `request_id` but it belongs to a different
    /// `conn_id`. The result was rejected; the original waiter is preserved.
    ConnMismatch,
}

struct PendingEntry {
    /// Connection that received the dispatch. Only this connection is allowed
    /// to complete the request — without this guard, another (possibly
    /// hostile or simply stale) tab could uplink a `dispatch_result` with the
    /// matching `request_id` and feed an arbitrary payload back to the CLI.
    conn_id: String,
    tx: oneshot::Sender<CanvasAgentDispatchOutcome>,
}

/// Shared, sendable handle to the relay.
#[derive(Default)]
pub struct CanvasAgentRelay {
    bridge: Mutex<Vec<BridgeEntry>>,
    pending: Mutex<HashMap<String, PendingEntry>>,
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
        // `client_id` is globally unique within the registry: drop any prior
        // entry with the same `client_id` regardless of the (possibly stale)
        // `conn_id` it was associated with. Otherwise a browser reconnect on
        // a new WS conn would leave a ghost entry that `resolve_target` could
        // pick first and dispatch to a dead connection.
        bridge.retain(|entry| entry.client_id != client_id);
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
    /// Duplicate `request_id`s are rejected: silently overwriting would drop
    /// the original waiter and let two concurrent CLI invocations race for the
    /// same browser response. Callers should treat this as a client bug and
    /// surface it back to the caller (CLIs mint a fresh UUID per invoke, so a
    /// duplicate almost certainly means a retry against an in-flight request).
    pub fn begin_pending(
        &self,
        request_id: impl Into<String>,
        conn_id: impl Into<String>,
    ) -> Result<oneshot::Receiver<CanvasAgentDispatchOutcome>, DuplicateRequestError> {
        let request_id = request_id.into();
        let mut pending = self.pending.lock().unwrap();
        if pending.contains_key(&request_id) {
            return Err(DuplicateRequestError { request_id });
        }
        let (tx, rx) = oneshot::channel();
        pending.insert(
            request_id,
            PendingEntry {
                conn_id: conn_id.into(),
                tx,
            },
        );
        Ok(rx)
    }

    /// Drop a pending waiter without firing it (called from the HTTP handler
    /// on timeout / early bail-out).
    pub fn cancel_pending(&self, request_id: &str) {
        let mut pending = self.pending.lock().unwrap();
        pending.remove(request_id);
    }

    /// Browser uplink: complete a pending waiter.
    ///
    /// `conn_id` is the WS connection that delivered the result; it must
    /// match the connection that originally received the dispatch, otherwise
    /// the call is rejected (returns [`CompleteDispatchResult::ConnMismatch`])
    /// without disturbing the pending waiter. This prevents one tab from
    /// completing another tab's request.
    pub fn complete_dispatch(
        &self,
        request_id: &str,
        conn_id: &str,
        outcome: CanvasAgentDispatchOutcome,
    ) -> CompleteDispatchResult {
        let mut pending = self.pending.lock().unwrap();
        match pending.get(request_id) {
            Some(entry) if entry.conn_id != conn_id => CompleteDispatchResult::ConnMismatch,
            Some(_) => {
                // Safe because we just checked the key exists.
                let entry = pending.remove(request_id).unwrap();
                // The receiver may have already been dropped (CLI timed out
                // before browser answered). Ignore the SendError in that case.
                let _ = entry.tx.send(outcome);
                CompleteDispatchResult::Completed
            }
            None => CompleteDispatchResult::Unknown,
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
        let rx = relay
            .begin_pending("req-1", "conn-1")
            .expect("first begin_pending");
        assert_eq!(
            relay.complete_dispatch(
                "req-1",
                "conn-1",
                CanvasAgentDispatchOutcome {
                    success: true,
                    error_code: None,
                    error_message: None,
                    recoverable: None,
                    data: serde_json::Value::Null,
                },
            ),
            CompleteDispatchResult::Completed
        );
        let outcome = rx.await.expect("oneshot must succeed");
        assert!(outcome.success);
    }

    #[test]
    fn complete_dispatch_without_pending_returns_unknown() {
        let relay = CanvasAgentRelay::new();
        let res = relay.complete_dispatch(
            "missing",
            "conn-x",
            CanvasAgentDispatchOutcome {
                success: true,
                error_code: None,
                error_message: None,
                recoverable: None,
                data: serde_json::Value::Null,
            },
        );
        assert_eq!(res, CompleteDispatchResult::Unknown);
    }

    #[tokio::test]
    async fn complete_dispatch_rejects_mismatched_conn_id() {
        let relay = CanvasAgentRelay::new();
        let rx = relay
            .begin_pending("req-cross", "conn-owner")
            .expect("begin_pending");
        let res = relay.complete_dispatch(
            "req-cross",
            "conn-attacker",
            CanvasAgentDispatchOutcome {
                success: true,
                error_code: None,
                error_message: None,
                recoverable: None,
                data: serde_json::json!({"poison": true}),
            },
        );
        assert_eq!(res, CompleteDispatchResult::ConnMismatch);
        // Original waiter must still be live and resolvable by the right conn.
        assert_eq!(
            relay.complete_dispatch(
                "req-cross",
                "conn-owner",
                CanvasAgentDispatchOutcome {
                    success: true,
                    error_code: None,
                    error_message: None,
                    recoverable: None,
                    data: serde_json::Value::Null,
                },
            ),
            CompleteDispatchResult::Completed
        );
        let outcome = rx.await.expect("oneshot");
        assert!(outcome.success);
        assert_eq!(outcome.data, serde_json::Value::Null);
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
    fn register_dedupes_by_client_id_across_conn_ids() {
        // A browser tab that reconnects gets a new conn_id but the same
        // client_id; resolve_target(Some(client_id)) must route to the live
        // connection, never the stale one.
        let relay = CanvasAgentRelay::new();
        relay.register("conn-old", "client-a", None, true, vec![]);
        relay.register("conn-new", "client-a", None, true, vec![]);
        let status = relay.status();
        assert_eq!(status.bridge_registered_count, 1);
        match relay.resolve_target(Some("client-a")) {
            ResolveTarget::Single { conn_id, .. } => assert_eq!(conn_id, "conn-new"),
            other => panic!("expected Single on live conn, got {:?}", other),
        }
    }

    #[test]
    fn begin_pending_rejects_duplicate_request_id() {
        let relay = CanvasAgentRelay::new();
        let _rx = relay
            .begin_pending("req-x", "conn-1")
            .expect("first call must succeed");
        let err = relay
            .begin_pending("req-x", "conn-1")
            .expect_err("duplicate must be rejected");
        assert_eq!(err.request_id, "req-x");
    }

    #[test]
    fn clamp_timeout_floor_at_one_second() {
        assert_eq!(
            CanvasAgentRelay::clamp_timeout(Some(0)),
            Duration::from_millis(1_000)
        );
    }
}
