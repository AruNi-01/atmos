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

#[cfg(target_os = "macos")]
mod macos;

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
///
/// `memory_used_bytes` is platform host-used, not process RSS sum and not
/// sysinfo `used_memory()` (macOS committed / app+wired+compressed):
/// - macOS: btop `(active + wired) * page_size` via Mach
///   `host_statistics64(HOST_VM_INFO64)`. If that call fails, fall back to
///   `total − available`. That fallback is not btop: sysinfo
///   `available_memory()` on macOS includes active pages, so the subtraction
///   only coincidentally approximates btop used.
/// - other OS: `total − available` (Linux `MemAvailable` / Windows avail phys).
#[derive(Debug, Clone, PartialEq)]
pub struct ResourceHostSample {
    pub collected_at_ms: u64,
    pub cpu_percent: f32,
    /// Platform host-used memory. See [`ResourceHostSample`].
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
    /// Process resident set. Independent of host `memory_used_bytes`.
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
    let (memory_used_bytes, memory_total_bytes) = collect_host_memory(system);
    let host = ResourceHostSample {
        collected_at_ms,
        cpu_percent: normalize_host_cpu(system.global_cpu_usage()),
        memory_used_bytes,
        memory_total_bytes,
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

/// macOS: Mach/btop used first; on `None`, `total − available` (not btop —
/// sysinfo available includes active). Other OS: `total − available`.
fn collect_host_memory(system: &System) -> (u64, u64) {
    let total_bytes = system.total_memory();
    #[cfg(target_os = "macos")]
    let preferred = macos::btop_used_memory();
    #[cfg(not(target_os = "macos"))]
    let preferred = None;
    let used_bytes = resolve_host_memory_used(preferred, total_bytes, system.available_memory());
    (used_bytes, total_bytes)
}

/// Prefer a platform used value (macOS Mach/btop). If missing, `total − available`.
/// Result never exceeds `total` (`available > total` saturates to 0).
fn resolve_host_memory_used(
    preferred_used_bytes: Option<u64>,
    total_bytes: u64,
    available_bytes: u64,
) -> u64 {
    preferred_used_bytes
        .unwrap_or_else(|| total_bytes.saturating_sub(available_bytes))
        .min(total_bytes)
}

/// btop macOS used: `(active_count + wire_count) * page_size`.
///
/// `page_size <= 0` or arithmetic overflow returns `None`.
fn mach_active_wired_used_bytes(active_count: u64, wire_count: u64, page_size: i64) -> Option<u64> {
    if page_size <= 0 {
        return None;
    }
    let page_size = u64::try_from(page_size).ok()?;
    active_count.checked_add(wire_count)?.checked_mul(page_size)
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
    fn mach_active_wired_used_bytes_matches_btop_about_13_gib() {
        const GIB: u64 = 1024 * 1024 * 1024;
        const PAGE_SIZE: i64 = 16_384; // Apple Silicon
                                       // Screenshot / current-level active+wired ≈ 13 GiB, not live Mach.
        let active_count = 700_000;
        let wire_count = 151_968;
        assert_eq!(
            mach_active_wired_used_bytes(active_count, wire_count, PAGE_SIZE),
            Some(13 * GIB)
        );
    }

    #[test]
    fn mach_active_wired_used_bytes_rejects_non_positive_page_size() {
        assert_eq!(mach_active_wired_used_bytes(1, 1, 0), None);
        assert_eq!(mach_active_wired_used_bytes(1, 1, -4_096), None);
    }

    #[test]
    fn mach_active_wired_used_bytes_rejects_overflow() {
        assert_eq!(mach_active_wired_used_bytes(u64::MAX, 1, 4_096), None);
        assert_eq!(mach_active_wired_used_bytes(u64::MAX / 2 + 1, 0, 3), None);
    }

    #[test]
    fn resolve_host_memory_used_falls_back_to_total_minus_available() {
        const GIB: u64 = 1024 * 1024 * 1024;
        assert_eq!(
            resolve_host_memory_used(None, 32 * GIB, (197 * GIB) / 10),
            13_207_024_436
        );
        assert_eq!(resolve_host_memory_used(None, 8, 16), 0);
        assert_eq!(resolve_host_memory_used(None, 32 * GIB, 0), 32 * GIB);
    }

    #[test]
    fn resolve_host_memory_used_prefers_mach_and_clamps_to_total() {
        const GIB: u64 = 1024 * 1024 * 1024;
        assert_eq!(
            resolve_host_memory_used(Some(13 * GIB), 32 * GIB, 1),
            13 * GIB
        );
        assert_eq!(
            resolve_host_memory_used(Some(40 * GIB), 32 * GIB, 0),
            32 * GIB
        );
    }

    #[test]
    fn collect_sample_host_memory_stays_within_total_and_keeps_rss() {
        let mut system = System::new();
        refresh_system(&mut system);
        let sample = collect_sample(&system);
        assert_eq!(sample.host.memory_total_bytes, system.total_memory());
        assert!(sample.host.memory_used_bytes <= sample.host.memory_total_bytes);

        let self_pid = std::process::id();
        if let Some(sample_process) = sample
            .processes
            .iter()
            .find(|process| process.pid == self_pid)
        {
            if let Some(sys_process) = system.process(sysinfo::Pid::from_u32(self_pid)) {
                assert_eq!(sample_process.memory_rss_bytes, sys_process.memory());
            }
        }
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
