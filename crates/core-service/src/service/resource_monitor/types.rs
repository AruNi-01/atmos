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
///
/// Headline `memory_*` fields match [`ResourceHostMemoryMetrics`] used/total.
/// `cores.len()` equals `logical_cpu_count` when the engine enumerated
/// `system.cpus()`. If that list is empty, `cores` stays empty while
/// `logical_cpu_count` may still fall back to `available_parallelism`.
/// Downstream validators should treat that mismatch as an unsupported edge
/// and must not invent synthetic core rows.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ResourceHostMetrics {
    pub cpu_percent: f32,
    pub memory_used_bytes: u64,
    pub memory_total_bytes: u64,
    pub logical_cpu_count: u32,
    pub cores: Vec<ResourceHostCpuCore>,
    pub memory: ResourceHostMemoryMetrics,
}

/// One logical core on the wire. `cpu_percent` is already 0–100 for that core.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ResourceHostCpuCore {
    pub index: u32,
    pub cpu_percent: f32,
}

/// Nested host memory breakdown. Cached and free are informational and are
/// never added to used as if they summed to total.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ResourceHostMemoryMetrics {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub free_bytes: u64,
    pub cached_bytes: Option<u64>,
    pub swap_total_bytes: u64,
    pub swap_used_bytes: u64,
    pub swap_free_bytes: u64,
    pub accounting: ResourceMemoryAccounting,
}

/// Platform formula that produced host used/available.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResourceMemoryAccounting {
    BtopMach,
    LinuxMemavailable,
    WindowsAvailPhys,
    FallbackTotalMinusAvailable,
}

/// One filtered local volume. Mount root is the only path allowed on the wire.
///
/// Never serialize device path, filesystem type, UUID, serial, kind, or I/O.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ResourceDiskMetrics {
    pub name: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub usage_percent: f32,
    pub removable: bool,
}

/// One coalesced Computer snapshot. Wire shape is serde snake_case.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ResourceMonitorSnapshot {
    pub collected_at_ms: u64,
    pub host: ResourceHostMetrics,
    pub disks: Vec<ResourceDiskMetrics>,
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
    fn host_metrics_nested_memory_matches_headline_and_invariants() {
        let host = ResourceHostMetrics {
            cpu_percent: 12.5,
            memory_used_bytes: 40,
            memory_total_bytes: 100,
            logical_cpu_count: 2,
            cores: vec![
                ResourceHostCpuCore {
                    index: 0,
                    cpu_percent: 10.0,
                },
                ResourceHostCpuCore {
                    index: 1,
                    cpu_percent: 15.0,
                },
            ],
            memory: ResourceHostMemoryMetrics {
                total_bytes: 100,
                used_bytes: 40,
                available_bytes: 60,
                free_bytes: 20,
                cached_bytes: Some(8),
                swap_total_bytes: 50,
                swap_used_bytes: 10,
                swap_free_bytes: 40,
                accounting: ResourceMemoryAccounting::BtopMach,
            },
        };
        assert_eq!(host.memory_used_bytes, host.memory.used_bytes);
        assert_eq!(host.memory_total_bytes, host.memory.total_bytes);
        assert_eq!(
            host.memory.used_bytes + host.memory.available_bytes,
            host.memory.total_bytes
        );
        assert_eq!(
            host.memory.swap_used_bytes + host.memory.swap_free_bytes,
            host.memory.swap_total_bytes
        );
        assert_eq!(host.cores.len(), host.logical_cpu_count as usize);
    }

    #[test]
    fn host_metrics_serialize_snake_case_cores_memory_and_null_cached() {
        let host = ResourceHostMetrics {
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
        };
        let value = serde_json::to_value(&host).unwrap();
        let object = value.as_object().unwrap();
        for key in [
            "cpu_percent",
            "memory_used_bytes",
            "memory_total_bytes",
            "logical_cpu_count",
            "cores",
            "memory",
        ] {
            assert!(object.contains_key(key), "missing {key}");
        }
        let memory = value["memory"].as_object().unwrap();
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
            assert!(memory.contains_key(key), "missing memory.{key}");
        }
        assert_eq!(value["memory"]["accounting"], "linux_memavailable");
        assert!(value["memory"]["cached_bytes"].is_null());
        assert_eq!(value["cores"][0]["index"], 0);
        assert_eq!(value["cores"][0]["cpu_percent"], 1.5);
    }

    #[test]
    fn memory_accounting_serializes_snake_case() {
        let cases = [
            (ResourceMemoryAccounting::BtopMach, "btop_mach"),
            (
                ResourceMemoryAccounting::LinuxMemavailable,
                "linux_memavailable",
            ),
            (
                ResourceMemoryAccounting::WindowsAvailPhys,
                "windows_avail_phys",
            ),
            (
                ResourceMemoryAccounting::FallbackTotalMinusAvailable,
                "fallback_total_minus_available",
            ),
        ];
        for (value, expected) in cases {
            let json = serde_json::to_string(&value).unwrap();
            assert_eq!(json, format!("\"{expected}\""));
            let parsed: ResourceMemoryAccounting =
                serde_json::from_str(&format!("\"{expected}\"")).unwrap();
            assert_eq!(parsed, value);
        }
    }

    #[test]
    fn disk_metrics_serialize_only_capacity_fields() {
        let disk = ResourceDiskMetrics {
            name: "root".into(),
            mount_point: "/".into(),
            total_bytes: 100,
            used_bytes: 40,
            available_bytes: 60,
            usage_percent: 40.0,
            removable: false,
        };
        let value = serde_json::to_value(&disk).unwrap();
        let object = value.as_object().unwrap();
        let keys: std::collections::HashSet<_> = object.keys().cloned().collect();
        assert_eq!(
            keys,
            [
                "name",
                "mount_point",
                "total_bytes",
                "used_bytes",
                "available_bytes",
                "usage_percent",
                "removable"
            ]
            .into_iter()
            .map(str::to_string)
            .collect()
        );
        for forbidden in [
            "device",
            "device_name",
            "file_system",
            "filesystem",
            "fs",
            "uuid",
            "kind",
            "serial",
            "io",
            "usage",
        ] {
            assert!(!object.contains_key(forbidden), "leaked {forbidden}");
        }
        assert_eq!(value["name"], "root");
        assert_eq!(value["mount_point"], "/");
        assert_eq!(value["total_bytes"], 100);
        assert_eq!(value["used_bytes"], 40);
        assert_eq!(value["available_bytes"], 60);
        assert_eq!(value["usage_percent"], 40.0);
        assert_eq!(value["removable"], false);
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
