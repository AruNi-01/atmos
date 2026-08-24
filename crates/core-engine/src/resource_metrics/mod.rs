//! Host and process resource sampling.
//!
//! Process samples are independent from stop-oriented [`crate::ProcessSnapshot`].
//! CPU values use total-host 0–100 semantics.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use sysinfo::{
    CpuRefreshKind, MemoryRefreshKind, ProcessRefreshKind, RefreshKind, System, UpdateKind,
};

/// Persistent sampler. Process CPU is delta-based, so the inner [`System`] is reused.
pub struct ResourceMetricsEngine {
    system: Mutex<SystemState>,
}

struct SystemState {
    system: System,
    primed: bool,
}

/// One host + process-table collection.
#[derive(Debug, Clone, PartialEq)]
pub struct ResourceSample {
    pub collected_at_ms: u64,
    pub host: ResourceHostSample,
    pub processes: Vec<ResourceProcessSample>,
}

/// Host totals for the active Computer.
#[derive(Debug, Clone, PartialEq)]
pub struct ResourceHostSample {
    pub collected_at_ms: u64,
    pub cpu_percent: f32,
    pub memory_used_bytes: u64,
    pub memory_total_bytes: u64,
    pub logical_cpu_count: u32,
}

/// One OS process visible to the current user.
#[derive(Debug, Clone, PartialEq)]
pub struct ResourceProcessSample {
    pub collected_at_ms: u64,
    pub pid: u32,
    pub parent_pid: Option<u32>,
    pub start_time: u64,
    pub cwd: Option<PathBuf>,
    pub name: Option<String>,
    /// CPU as a share of total logical host capacity (0–100).
    pub cpu_percent: f32,
    pub memory_rss_bytes: u64,
}

impl Default for ResourceMetricsEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl ResourceMetricsEngine {
    pub fn new() -> Self {
        Self {
            system: Mutex::new(SystemState {
                system: System::new(),
                primed: false,
            }),
        }
    }

    /// Refresh host and process counters and return one sample.
    ///
    /// The first call primes delta CPU counters (sleeping
    /// [`sysinfo::MINIMUM_CPU_UPDATE_INTERVAL`]) before collecting.
    pub fn sample(&self) -> ResourceSample {
        let mut state = self
            .system
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if !state.primed {
            refresh_system(&mut state.system);
            drop(state);
            std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
            state = self
                .system
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            state.primed = true;
        }

        refresh_system(&mut state.system);
        collect_sample(&state.system)
    }
}

fn sample_refresh_kind() -> RefreshKind {
    RefreshKind::nothing()
        .with_cpu(CpuRefreshKind::everything())
        .with_memory(MemoryRefreshKind::everything())
        .with_processes(
            ProcessRefreshKind::nothing()
                .with_cpu()
                .with_memory()
                .with_cwd(UpdateKind::Always)
                .without_tasks(),
        )
}

fn refresh_system(system: &mut System) {
    system.refresh_specifics(sample_refresh_kind());
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

fn collect_sample(system: &System) -> ResourceSample {
    let collected_at_ms = now_unix_ms();
    let logical_cpu_count = logical_cpu_count(system);
    let host = ResourceHostSample {
        collected_at_ms,
        cpu_percent: normalize_host_cpu(system.global_cpu_usage()),
        memory_used_bytes: system.used_memory(),
        memory_total_bytes: system.total_memory(),
        logical_cpu_count,
    };

    let processes = system
        .processes()
        .values()
        .filter_map(|process| {
            let pid = process.pid().as_u32();
            if pid == 0 {
                return None;
            }
            let name = process.name().to_string_lossy();
            Some(ResourceProcessSample {
                collected_at_ms,
                pid,
                parent_pid: process.parent().map(|parent| parent.as_u32()),
                start_time: process.start_time(),
                cwd: process.cwd().map(PathBuf::from),
                name: if name.is_empty() {
                    None
                } else {
                    Some(name.into_owned())
                },
                cpu_percent: normalize_process_cpu(process.cpu_usage(), logical_cpu_count),
                memory_rss_bytes: process.memory(),
            })
        })
        .collect();

    ResourceSample {
        collected_at_ms,
        host,
        processes,
    }
}

fn logical_cpu_count(system: &System) -> u32 {
    let counted = system.cpus().len() as u32;
    if counted > 0 {
        return counted;
    }
    std::thread::available_parallelism()
        .map(|count| count.get() as u32)
        .unwrap_or(1)
}

fn normalize_host_cpu(raw_percent: f32) -> f32 {
    if !raw_percent.is_finite() || raw_percent <= 0.0 {
        return 0.0;
    }
    raw_percent.clamp(0.0, 100.0)
}

/// Convert a sysinfo per-core process CPU percentage into total-host 0–100.
pub fn normalize_process_cpu(raw_percent: f32, logical_cpu_count: u32) -> f32 {
    if !raw_percent.is_finite() || raw_percent <= 0.0 || logical_cpu_count == 0 {
        return 0.0;
    }
    (raw_percent / logical_cpu_count as f32).clamp(0.0, 100.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_process_cpu_uses_total_host_capacity() {
        assert_eq!(normalize_process_cpu(200.0, 4), 50.0);
        assert_eq!(normalize_process_cpu(400.0, 4), 100.0);
        assert_eq!(normalize_process_cpu(50.0, 1), 50.0);
        assert_eq!(normalize_process_cpu(0.0, 8), 0.0);
        assert_eq!(normalize_process_cpu(80.0, 0), 0.0);
        assert_eq!(normalize_process_cpu(f32::NAN, 8), 0.0);
        assert_eq!(normalize_process_cpu(-10.0, 4), 0.0);
        assert_eq!(normalize_process_cpu(1000.0, 4), 100.0);
    }

    #[test]
    fn first_sample_is_primed_and_satisfies_invariants() {
        let engine = ResourceMetricsEngine::new();
        let sample = engine.sample();

        assert!(
            sample.collected_at_ms > 0,
            "first sample must carry a real timestamp, not a placeholder"
        );
        assert_eq!(sample.host.collected_at_ms, sample.collected_at_ms);
        assert!(sample.host.logical_cpu_count > 0);
        assert!(sample.host.memory_total_bytes > 0);
        assert!(sample.host.memory_used_bytes <= sample.host.memory_total_bytes);
        assert!(sample.host.cpu_percent >= 0.0 && sample.host.cpu_percent <= 100.0);
        assert!(
            !sample.processes.is_empty(),
            "supported hosts should expose at least the current process"
        );

        let self_pid = std::process::id();
        assert!(
            sample
                .processes
                .iter()
                .any(|process| process.pid == self_pid),
            "current process must appear in the process table"
        );

        for process in &sample.processes {
            assert_eq!(process.collected_at_ms, sample.collected_at_ms);
            assert!(process.pid > 0);
            assert!(process.cpu_percent >= 0.0 && process.cpu_percent <= 100.0);
        }
    }

    #[test]
    fn second_sample_reuses_primed_counters() {
        let engine = ResourceMetricsEngine::new();
        let first = engine.sample();
        let second = engine.sample();
        assert!(second.collected_at_ms >= first.collected_at_ms);
        assert!(second.host.logical_cpu_count > 0);
        assert!(!second.processes.is_empty());
    }
}
