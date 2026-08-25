//! Canonical Server wire model for APP-066 Resource Monitor.

use serde::{Deserialize, Serialize};

/// CPU, RSS, and process count for one exclusive assignment projection.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ResourceUsage {
    pub cpu_percent: f32,
    pub memory_rss_bytes: u64,
    pub process_count: u32,
}

impl Default for ResourceUsage {
    fn default() -> Self {
        Self::zero()
    }
}

impl ResourceUsage {
    pub fn zero() -> Self {
        Self {
            cpu_percent: 0.0,
            memory_rss_bytes: 0,
            process_count: 0,
        }
    }

    /// Add one process sample using saturating / finite-safe aggregation.
    ///
    /// `cpu_percent` is a share of total host capacity and stays in `0..=100`.
    /// Memory and process count are not clamped.
    pub fn add_process(&mut self, cpu_percent: f32, memory_rss_bytes: u64) {
        self.cpu_percent = clamp_host_cpu(saturating_cpu_add(
            self.cpu_percent,
            finite_non_negative(cpu_percent),
        ));
        self.memory_rss_bytes = self.memory_rss_bytes.saturating_add(memory_rss_bytes);
        self.process_count = self.process_count.saturating_add(1);
    }
}

/// Process-name group inside one exclusive session or cwd leaf.
///
/// Wire fields are basename, aggregated usage, and cached local ports only.
/// Never serialize PID, start time, command line, executable, user, env, or cwd.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ResourceProcessMetrics {
    pub name: String,
    pub usage: ResourceUsage,
    #[serde(default)]
    pub ports: Vec<u16>,
}

/// Active terminal session projection. Usage is display-only at this row.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ResourceSessionMetrics {
    pub session_id: String,
    pub name: Option<String>,
    pub terminal_kind: String,
    pub usage: ResourceUsage,
    #[serde(default)]
    pub processes: Vec<ResourceProcessMetrics>,
}

/// Workspace row. Usage is the exclusive assignment projection, not a sum of session rows.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ResourceWorkspaceMetrics {
    pub workspace_id: String,
    pub name: String,
    pub usage: ResourceUsage,
    pub sessions: Vec<ResourceSessionMetrics>,
    #[serde(default)]
    pub other_usage: ResourceUsage,
    #[serde(default)]
    pub other_processes: Vec<ResourceProcessMetrics>,
}

/// Project row. `usage` is unique direct + workspace assignments.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ResourceProjectMetrics {
    pub project_id: String,
    pub name: String,
    pub usage: ResourceUsage,
    pub direct_usage: ResourceUsage,
    pub workspaces: Vec<ResourceWorkspaceMetrics>,
    pub sessions: Vec<ResourceSessionMetrics>,
    #[serde(default)]
    pub other_usage: ResourceUsage,
    #[serde(default)]
    pub other_processes: Vec<ResourceProcessMetrics>,
}

/// Host totals for the active Computer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ResourceHostMetrics {
    pub cpu_percent: f32,
    pub memory_used_bytes: u64,
    pub memory_total_bytes: u64,
    pub logical_cpu_count: u32,
}

/// One coalesced Computer snapshot. Wire shape is serde snake_case.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ResourceMonitorSnapshot {
    pub collected_at_ms: u64,
    pub host: ResourceHostMetrics,
    pub server: ResourceUsage,
    pub shared_runtime: ResourceUsage,
    pub projects: Vec<ResourceProjectMetrics>,
    pub unattributed: ResourceUsage,
    pub attribution_status: ResourceAttributionStatus,
}

/// Best-effort attribution health.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResourceAttributionStatus {
    Complete,
    Partial,
    Unsupported,
}

pub(crate) fn finite_non_negative(value: f32) -> f32 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        0.0
    }
}

fn saturating_cpu_add(left: f32, right: f32) -> f32 {
    let sum = finite_non_negative(left) + finite_non_negative(right);
    if sum.is_finite() {
        sum
    } else {
        f32::MAX
    }
}

fn clamp_host_cpu(value: f32) -> f32 {
    finite_non_negative(value).clamp(0.0, 100.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usage_ignores_non_finite_cpu_and_saturates_memory() {
        let mut usage = ResourceUsage::zero();
        usage.add_process(f32::NAN, 10);
        usage.add_process(f32::INFINITY, 20);
        usage.add_process(-4.0, 30);
        usage.add_process(1.5, u64::MAX);
        assert_eq!(usage.cpu_percent, 1.5);
        assert_eq!(usage.memory_rss_bytes, u64::MAX);
        assert_eq!(usage.process_count, 4);
    }

    #[test]
    fn usage_clamps_aggregated_cpu_to_host_capacity() {
        let mut usage = ResourceUsage::zero();
        usage.add_process(60.0, 10);
        usage.add_process(60.0, 20);
        usage.add_process(150.0, 30);
        assert_eq!(usage.cpu_percent, 100.0);
        assert!(usage.cpu_percent.is_finite());
        assert_eq!(usage.memory_rss_bytes, 60);
        assert_eq!(usage.process_count, 3);
    }

    #[test]
    fn attribution_status_serializes_snake_case() {
        let json = serde_json::to_string(&ResourceAttributionStatus::Partial).unwrap();
        assert_eq!(json, "\"partial\"");
        let parsed: ResourceAttributionStatus = serde_json::from_str("\"unsupported\"").unwrap();
        assert_eq!(parsed, ResourceAttributionStatus::Unsupported);
    }

    #[test]
    fn process_metrics_serialize_only_name_usage_ports() {
        let process = ResourceProcessMetrics {
            name: "node".into(),
            usage: ResourceUsage {
                cpu_percent: 1.5,
                memory_rss_bytes: 20,
                process_count: 2,
            },
            ports: vec![3000, 4173],
        };
        let value = serde_json::to_value(&process).unwrap();
        let object = value.as_object().unwrap();
        let keys: std::collections::HashSet<_> = object.keys().cloned().collect();
        assert_eq!(
            keys,
            ["name", "usage", "ports"]
                .into_iter()
                .map(str::to_string)
                .collect()
        );
        assert_eq!(value["name"], "node");
        assert_eq!(value["ports"], serde_json::json!([3000, 4173]));
    }
}
