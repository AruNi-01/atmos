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
