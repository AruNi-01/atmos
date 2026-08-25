#![allow(dead_code)]

use serde::{Deserialize, Serialize};

/// Empty request body for `resource_monitor_get`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ResourceMonitorGetRequest {}

/// Empty request body for `resource_monitor_subscribe`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ResourceMonitorSubscribeRequest {}

/// Empty request body for `resource_monitor_unsubscribe`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ResourceMonitorUnsubscribeRequest {}

/// Kill leftover automation-browser processes for one other-process group.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceMonitorKillLeakedRequest {
    pub name: String,
    pub project_id: String,
    #[serde(default)]
    pub workspace_id: Option<String>,
}

/// Number of leak-family trees signaled. PIDs stay off the wire.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceMonitorKillLeakedResponse {
    pub killed_count: u32,
}
