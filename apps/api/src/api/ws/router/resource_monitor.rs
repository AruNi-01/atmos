use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Value};
use tokio::time::{interval, Interval, MissedTickBehavior};

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

/// Delay missed ticks instead of bursting catch-up snapshots after a stall.
pub(crate) const RESOURCE_MONITOR_MISSED_TICKS: MissedTickBehavior = MissedTickBehavior::Delay;

pub(crate) fn new_resource_monitor_ticker() -> Interval {
    let mut ticker = interval(RESOURCE_MONITOR_INTERVAL);
    ticker.set_missed_tick_behavior(RESOURCE_MONITOR_MISSED_TICKS);
    ticker
}

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
        if !self
            .resource_monitor_subscriptions
            .commit_replace(&conn_id, generation, handle)
        {
            return Err(subscription_commit_error());
        }

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

pub(crate) fn subscription_commit_error() -> ServiceError {
    ServiceError::Processing("resource monitor subscription was replaced or cancelled".to_string())
}

async fn run_resource_monitor_loop(
    conn_id: String,
    generation: u64,
    monitor: Arc<core_service::ResourceMonitorService>,
    manager: Arc<WsManager>,
    subscriptions: Arc<ConnectionTaskRegistry>,
) {
    let mut ticker = new_resource_monitor_ticker();
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
                    subscriptions.take_if_generation(&conn_id, generation);
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
    use super::{
        new_resource_monitor_ticker, require_live_ws_connection, subscription_commit_error,
        RESOURCE_MONITOR_INTERVAL, RESOURCE_MONITOR_MISSED_TICKS,
    };
    use std::time::Duration;
    use tokio::time::MissedTickBehavior;

    #[test]
    fn interactive_interval_is_at_least_two_seconds() {
        assert!(RESOURCE_MONITOR_INTERVAL >= Duration::from_secs(2));
        assert_eq!(RESOURCE_MONITOR_INTERVAL, Duration::from_millis(2500));
    }

    #[test]
    fn resource_monitor_ticker_uses_delay_constant() {
        assert_eq!(RESOURCE_MONITOR_MISSED_TICKS, MissedTickBehavior::Delay);
        assert_ne!(RESOURCE_MONITOR_MISSED_TICKS, MissedTickBehavior::Burst);
    }

    #[tokio::test]
    async fn resource_monitor_ticker_constructs_with_delay() {
        let _ticker = new_resource_monitor_ticker();
    }

    #[test]
    fn stale_commit_returns_service_error_not_snapshot() {
        match subscription_commit_error() {
            core_service::ServiceError::Processing(message) => {
                assert!(message.contains("replaced or cancelled"));
            }
            other => panic!("expected Processing, got {other:?}"),
        }
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
            ResourceAttributionStatus, ResourceDiskMetrics, ResourceHostCpuCore,
            ResourceHostMemoryMetrics, ResourceHostMetrics, ResourceMemoryAccounting,
            ResourceMonitorSnapshot, ResourceUsage,
        };

        let snapshot = ResourceMonitorSnapshot {
            collected_at_ms: 1,
            host: ResourceHostMetrics {
                cpu_percent: 1.5,
                memory_used_bytes: 2,
                memory_total_bytes: 3,
                logical_cpu_count: 1,
                cores: vec![ResourceHostCpuCore {
                    index: 0,
                    cpu_percent: 1.5,
                }],
                memory: ResourceHostMemoryMetrics {
                    total_bytes: 3,
                    used_bytes: 2,
                    available_bytes: 1,
                    free_bytes: 1,
                    cached_bytes: None,
                    swap_total_bytes: 4,
                    swap_used_bytes: 1,
                    swap_free_bytes: 3,
                    accounting: ResourceMemoryAccounting::LinuxMemavailable,
                },
            },
            disks: vec![ResourceDiskMetrics {
                name: "root".into(),
                mount_point: "/".into(),
                total_bytes: 100,
                used_bytes: 40,
                available_bytes: 60,
                usage_percent: 40.0,
                removable: false,
            }],
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
            "disks",
            "server",
            "shared_runtime",
            "projects",
            "unattributed",
            "attribution_status",
        ] {
            assert!(object.contains_key(key), "missing {key}");
        }
        let host = value["host"].as_object().expect("host object");
        for key in [
            "cpu_percent",
            "memory_used_bytes",
            "memory_total_bytes",
            "logical_cpu_count",
            "cores",
            "memory",
        ] {
            assert!(host.contains_key(key), "missing host.{key}");
        }
        let memory = value["host"]["memory"].as_object().expect("memory object");
        for key in [
            "total_bytes",
            "used_bytes",
            "available_bytes",
            "free_bytes",
            "cached_bytes",
            "swap_total_bytes",
            "swap_used_bytes",
            "swap_free_bytes",
            "accounting",
        ] {
            assert!(memory.contains_key(key), "missing host.memory.{key}");
        }
        assert_eq!(value["attribution_status"], "partial");
        assert_eq!(value["host"]["memory_used_bytes"], 2);
        assert_eq!(value["host"]["memory_total_bytes"], 3);
        assert_eq!(value["host"]["memory"]["used_bytes"], 2);
        assert_eq!(value["host"]["memory"]["total_bytes"], 3);
        assert_eq!(
            value["host"]["memory_used_bytes"],
            value["host"]["memory"]["used_bytes"]
        );
        assert_eq!(
            value["host"]["memory_total_bytes"],
            value["host"]["memory"]["total_bytes"]
        );
        assert!(value["host"]["memory"]["cached_bytes"].is_null());
        assert_eq!(value["host"]["memory"]["accounting"], "linux_memavailable");
        assert_eq!(value["host"]["cores"][0]["index"], 0);
        assert_eq!(value["host"]["cores"][0]["cpu_percent"], 1.5);
        assert!(
            value["disks"].as_array().expect("disks array").len() <= 1,
            "snapshot may expose at most one disk"
        );
        let disk = value["disks"][0].as_object().expect("disk object");
        for key in [
            "name",
            "mount_point",
            "total_bytes",
            "used_bytes",
            "available_bytes",
            "usage_percent",
            "removable",
        ] {
            assert!(disk.contains_key(key), "missing disks[0].{key}");
        }
        for forbidden in [
            "device",
            "file_system",
            "filesystem",
            "uuid",
            "serial",
            "kind",
        ] {
            assert!(!disk.contains_key(forbidden), "disk leaked {forbidden}");
        }
        assert_eq!(value["disks"][0]["name"], "root");
        assert_eq!(value["disks"][0]["mount_point"], "/");
        assert_eq!(value["disks"][0]["total_bytes"], 100);
        assert_eq!(value["disks"][0]["used_bytes"], 40);
        assert_eq!(value["disks"][0]["available_bytes"], 60);
        assert_eq!(value["server"]["memory_rss_bytes"], 0);
        assert_eq!(value["server"]["process_count"], 0);
        assert_eq!(value["server"]["cpu_percent"], 0.0);
    }
}
