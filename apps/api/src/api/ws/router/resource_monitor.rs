use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Value};

use core_service::{Result, ServiceError};

use super::{
    parse_request, ResourceMonitorGetRequest, ResourceMonitorSubscribeRequest,
    ResourceMonitorUnsubscribeRequest, WsMessageService,
};
use crate::api::ws::error::WsError;
use crate::api::ws::message::{WsEvent, WsMessage};
use crate::api::ws::subscription::ConnectionTaskRegistry;
use crate::api::ws::WsManager;

/// Interactive Resource Monitor push interval. Must stay at or above 2 seconds.
pub(crate) const RESOURCE_MONITOR_INTERVAL: Duration = Duration::from_millis(2500);

const CLI_DISPATCH_CONN_ID: &str = "cli";

pub(crate) fn require_live_ws_connection(conn_id: &str) -> Result<()> {
    if conn_id == CLI_DISPATCH_CONN_ID {
        return Err(ServiceError::Validation(
            "resource_monitor_subscribe requires a live WebSocket connection".to_string(),
        ));
    }
    Ok(())
}

impl WsMessageService {
    pub(super) async fn handle_resource_monitor_get(&self, data: Value) -> Result<Value> {
        let _: ResourceMonitorGetRequest = if data.is_null() {
            ResourceMonitorGetRequest::default()
        } else {
            parse_request(data)?
        };
        let snapshot = self.resource_monitor_service.snapshot().await?;
        serde_json::to_value(snapshot).map_err(|error| ServiceError::Processing(error.to_string()))
    }

    pub(super) async fn handle_resource_monitor_subscribe(
        &self,
        conn_id: &str,
        data: Value,
    ) -> Result<Value> {
        require_live_ws_connection(conn_id)?;
        let _: ResourceMonitorSubscribeRequest = if data.is_null() {
            ResourceMonitorSubscribeRequest::default()
        } else {
            parse_request(data)?
        };

        let Some(manager) = self.ws_manager.get().cloned() else {
            return Err(ServiceError::Processing("WS Manager not set".to_string()));
        };

        let generation = self.resource_monitor_subscriptions.prepare_replace(conn_id);
        let snapshot = match self.resource_monitor_service.snapshot().await {
            Ok(snapshot) => snapshot,
            Err(error) => {
                self.resource_monitor_subscriptions
                    .remove_if_generation(conn_id, generation);
                return Err(error);
            }
        };

        let conn_id = conn_id.to_string();
        let monitor = Arc::clone(&self.resource_monitor_service);
        let subscriptions = Arc::clone(&self.resource_monitor_subscriptions);
        let loop_conn_id = conn_id.clone();
        let handle = tokio::spawn(async move {
            run_resource_monitor_loop(loop_conn_id, generation, monitor, manager, subscriptions)
                .await;
        });
        self.resource_monitor_subscriptions
            .commit_replace(&conn_id, generation, handle);

        serde_json::to_value(snapshot).map_err(|error| ServiceError::Processing(error.to_string()))
    }

    pub(super) fn handle_resource_monitor_unsubscribe(
        &self,
        conn_id: &str,
        data: Value,
    ) -> Result<Value> {
        let _: ResourceMonitorUnsubscribeRequest = if data.is_null() {
            ResourceMonitorUnsubscribeRequest::default()
        } else {
            parse_request(data)?
        };
        self.resource_monitor_subscriptions
            .abort_and_remove(conn_id);
        Ok(json!({}))
    }

    pub(super) fn abort_resource_monitor_subscription(&self, conn_id: &str) {
        self.resource_monitor_subscriptions
            .abort_and_remove(conn_id);
    }
}

async fn run_resource_monitor_loop(
    conn_id: String,
    generation: u64,
    monitor: Arc<core_service::ResourceMonitorService>,
    manager: Arc<WsManager>,
    subscriptions: Arc<ConnectionTaskRegistry>,
) {
    let mut ticker = tokio::time::interval(RESOURCE_MONITOR_INTERVAL);
    ticker.tick().await;

    loop {
        ticker.tick().await;
        match monitor.snapshot().await {
            Ok(snapshot) => {
                let payload = match serde_json::to_value(&snapshot) {
                    Ok(payload) => payload,
                    Err(error) => {
                        tracing::warn!(
                            conn_id,
                            error = %error,
                            "resource monitor snapshot serialization failed"
                        );
                        continue;
                    }
                };
                let message = WsMessage::notification(WsEvent::ResourceMonitorUpdated, payload);
                if let Err(error) = manager.send_to(&conn_id, &message).await {
                    match error {
                        WsError::ConnectionNotFound(_) | WsError::ChannelClosed => {
                            tracing::debug!(
                                conn_id,
                                generation,
                                "resource monitor subscription ending: {error}"
                            );
                        }
                        other => {
                            tracing::warn!(
                                conn_id,
                                generation,
                                error = %other,
                                "resource monitor send_to failed"
                            );
                        }
                    }
                    subscriptions.remove_if_generation(&conn_id, generation);
                    break;
                }
            }
            Err(error) => {
                tracing::warn!(
                    conn_id,
                    generation,
                    error = %error,
                    "resource monitor snapshot failed"
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{require_live_ws_connection, RESOURCE_MONITOR_INTERVAL};
    use std::time::Duration;

    #[test]
    fn interactive_interval_is_at_least_two_seconds() {
        assert!(RESOURCE_MONITOR_INTERVAL >= Duration::from_secs(2));
        assert_eq!(RESOURCE_MONITOR_INTERVAL, Duration::from_millis(2500));
    }

    #[test]
    fn cli_dispatch_subscribe_is_rejected() {
        let error = require_live_ws_connection("cli").expect_err("cli subscribe must fail");
        match error {
            core_service::ServiceError::Validation(message) => {
                assert!(message.contains("live WebSocket connection"));
            }
            other => panic!("expected Validation, got {other:?}"),
        }
        require_live_ws_connection("ws-conn-1").expect("real connections may subscribe");
    }

    #[test]
    fn snapshot_serializes_core_service_snake_case_fields() {
        use core_service::{
            ResourceAttributionStatus, ResourceHostMetrics, ResourceMonitorSnapshot, ResourceUsage,
        };

        let snapshot = ResourceMonitorSnapshot {
            collected_at_ms: 1,
            host: ResourceHostMetrics {
                cpu_percent: 1.5,
                memory_used_bytes: 2,
                memory_total_bytes: 3,
                logical_cpu_count: 4,
            },
            server: ResourceUsage::zero(),
            shared_runtime: ResourceUsage::zero(),
            projects: Vec::new(),
            unattributed: ResourceUsage::zero(),
            attribution_status: ResourceAttributionStatus::Partial,
        };
        let value = serde_json::to_value(&snapshot).expect("serialize snapshot");
        let object = value.as_object().expect("object");
        for key in [
            "collected_at_ms",
            "host",
            "server",
            "shared_runtime",
            "projects",
            "unattributed",
            "attribution_status",
        ] {
            assert!(object.contains_key(key), "missing {key}");
        }
        assert_eq!(value["attribution_status"], "partial");
        assert_eq!(value["host"]["memory_used_bytes"], 2);
        assert_eq!(value["server"]["memory_rss_bytes"], 0);
        assert_eq!(value["server"]["process_count"], 0);
        assert_eq!(value["server"]["cpu_percent"], 0.0);
    }
}
