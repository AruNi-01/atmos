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
/// Headline `memory_*` fields match [`ResourceHostMemorySample`] used/total.
/// `memory_used_bytes` is platform host-used, not process RSS sum and not
/// sysinfo `used_memory()` (macOS committed / app+wired+compressed):
/// - macOS Mach success: btop `(active + wired) * page_size` plus cached/free
///   from the same `host_statistics64(HOST_VM_INFO64)` sample.
/// - Linux: `total − available` (`MemAvailable`), free from sysinfo, cached
///   from `/proc/meminfo` `Cached`.
/// - Windows: `total − available` physical; available and free share that
///   value; cached is unavailable.
/// - Any Mach key-field failure or other OS: `total − available` fallback.
#[derive(Debug, Clone, PartialEq)]
pub struct ResourceHostSample {
    pub collected_at_ms: u64,
    pub cpu_percent: f32,
    /// Platform host-used memory. See [`ResourceHostSample`].
    pub memory_used_bytes: u64,
    pub memory_total_bytes: u64,
    pub logical_cpu_count: u32,
    /// One sample per `system.cpus()` entry. Empty when that list is empty;
    /// [`Self::logical_cpu_count`] may still use an `available_parallelism`
    /// fallback in that unsupported edge.
    pub cores: Vec<ResourceHostCpuCoreSample>,
    pub memory: ResourceHostMemorySample,
}

/// One logical core. `cpu_percent` is already 0–100 for that core.
#[derive(Debug, Clone, PartialEq)]
pub struct ResourceHostCpuCoreSample {
    pub index: u32,
    pub cpu_percent: f32,
}

/// Nested host memory breakdown. Values are bytes.
///
/// Invariants: `used + available == total`, `swap_used + swap_free == swap_total`,
/// `used <= total`. Cached and free are informational and are never added to used.
#[derive(Debug, Clone, PartialEq)]
pub struct ResourceHostMemorySample {
    pub total: u64,
    pub used: u64,
    pub available: u64,
    pub free: u64,
    pub cached: Option<u64>,
    pub swap_total: u64,
    pub swap_used: u64,
    pub swap_free: u64,
    pub accounting: ResourceMemoryAccounting,
}

/// Formula that produced [`ResourceHostMemorySample::used`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResourceMemoryAccounting {
    BtopMach,
    LinuxMemavailable,
    WindowsAvailPhys,
    FallbackTotalMinusAvailable,
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
    let memory = collect_host_memory(system);
    let host = ResourceHostSample {
        collected_at_ms,
        cpu_percent: normalize_host_cpu(system.global_cpu_usage()),
        memory_used_bytes: memory.used,
        memory_total_bytes: memory.total,
        logical_cpu_count,
        cores: collect_host_cores(system),
        memory,
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

/// Per-logical-core samples from `system.cpus()`. Each core is already 0–100
/// and is not divided by N. An empty `cpus()` list yields an empty `cores`
/// vec; [`logical_cpu_count`] may still fall back independently.
fn collect_host_cores(system: &System) -> Vec<ResourceHostCpuCoreSample> {
    system
        .cpus()
        .iter()
        .enumerate()
        .map(|(index, cpu)| host_core_sample(index, cpu.cpu_usage()))
        .collect()
}

fn host_core_sample(index: usize, raw_percent: f32) -> ResourceHostCpuCoreSample {
    ResourceHostCpuCoreSample {
        index: index as u32,
        cpu_percent: normalize_host_cpu(raw_percent),
    }
}

fn collect_swap(system: &System) -> (u64, u64) {
    let swap_total = system.total_swap();
    let swap_used = system.used_swap().min(swap_total);
    (swap_total, swap_used)
}

impl ResourceHostMemorySample {
    fn from_parts(
        total: u64,
        used: u64,
        free: u64,
        cached: Option<u64>,
        swap_total: u64,
        swap_used: u64,
        accounting: ResourceMemoryAccounting,
    ) -> Self {
        let used = used.min(total);
        let swap_used = swap_used.min(swap_total);
        Self {
            total,
            used,
            available: total.saturating_sub(used),
            free,
            cached,
            swap_total,
            swap_used,
            swap_free: swap_total.saturating_sub(swap_used),
            accounting,
        }
    }
}

fn collect_host_memory(system: &System) -> ResourceHostMemorySample {
    let total = system.total_memory();
    let (swap_total, swap_used) = collect_swap(system);

    #[cfg(target_os = "macos")]
    if let Some(mach) = macos::btop_mach_memory() {
        return ResourceHostMemorySample::from_parts(
            total,
            mach.used,
            mach.free,
            Some(mach.cached),
            swap_total,
            swap_used,
            ResourceMemoryAccounting::BtopMach,
        );
    }

    #[cfg(target_os = "linux")]
    {
        let used = resolve_host_memory_used(None, total, system.available_memory());
        return ResourceHostMemorySample::from_parts(
            total,
            used,
            system.free_memory(),
            read_linux_cached_bytes(),
            swap_total,
            swap_used,
            ResourceMemoryAccounting::LinuxMemavailable,
        );
    }

    #[cfg(target_os = "windows")]
    {
        let used = resolve_host_memory_used(None, total, system.available_memory());
        let available = total.saturating_sub(used);
        return ResourceHostMemorySample::from_parts(
            total,
            used,
            available,
            None,
            swap_total,
            swap_used,
            ResourceMemoryAccounting::WindowsAvailPhys,
        );
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let used = resolve_host_memory_used(None, total, system.available_memory());
        ResourceHostMemorySample::from_parts(
            total,
            used,
            system.free_memory(),
            None,
            swap_total,
            swap_used,
            ResourceMemoryAccounting::FallbackTotalMinusAvailable,
        )
    }
}

#[cfg(target_os = "linux")]
fn read_linux_cached_bytes() -> Option<u64> {
    let contents = std::fs::read_to_string("/proc/meminfo").ok()?;
    parse_meminfo_cached_bytes(&contents)
}

/// Parse only the `/proc/meminfo` `Cached:` kB line. Ignores `SwapCached`.
#[cfg(any(target_os = "linux", test))]
fn parse_meminfo_cached_bytes(meminfo: &str) -> Option<u64> {
    for line in meminfo.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        if key.trim() != "Cached" {
            continue;
        }
        let kb: u64 = value.split_whitespace().next()?.parse().ok()?;
        return kb.checked_mul(1024);
    }
    None
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

/// One Mach VM page breakdown. Any overflow or invalid page size is `None`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg(any(target_os = "macos", test))]
struct MachPageMemory {
    used: u64,
    cached: u64,
    free: u64,
}

/// btop macOS pages: used `(active + wired)`, cached `external`, free `free`.
///
/// `page_size <= 0` or overflow in any key field returns `None`.
#[cfg(any(target_os = "macos", test))]
fn mach_page_memory(
    active_count: u64,
    wire_count: u64,
    external_count: u64,
    free_count: u64,
    page_size: i64,
) -> Option<MachPageMemory> {
    if page_size <= 0 {
        return None;
    }
    let page_size = u64::try_from(page_size).ok()?;
    let pages_to_bytes = |count: u64| count.checked_mul(page_size);
    Some(MachPageMemory {
        used: active_count
            .checked_add(wire_count)
            .and_then(pages_to_bytes)?,
        cached: pages_to_bytes(external_count)?,
        free: pages_to_bytes(free_count)?,
    })
}

/// btop macOS used: `(active_count + wire_count) * page_size`.
#[cfg(test)]
fn mach_active_wired_used_bytes(active_count: u64, wire_count: u64, page_size: i64) -> Option<u64> {
    mach_page_memory(active_count, wire_count, 0, 0, page_size).map(|memory| memory.used)
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
    fn mach_page_memory_formula_includes_cached_and_free() {
        const PAGE_SIZE: i64 = 16_384;
        let memory = mach_page_memory(10, 6, 4, 3, PAGE_SIZE).expect("valid pages");
        assert_eq!(memory.used, 16 * 16_384);
        assert_eq!(memory.cached, 4 * 16_384);
        assert_eq!(memory.free, 3 * 16_384);
    }

    #[test]
    fn mach_page_memory_rejects_any_key_field_overflow() {
        assert_eq!(mach_page_memory(1, 1, u64::MAX, 0, 4_096), None);
        assert_eq!(mach_page_memory(1, 1, 0, u64::MAX, 4_096), None);
        assert_eq!(mach_page_memory(u64::MAX, 1, 0, 0, 4_096), None);
        assert_eq!(mach_page_memory(1, 1, 1, 1, 0), None);
    }

    #[test]
    fn parse_meminfo_cached_bytes_reads_only_cached_kb() {
        let meminfo = "\
MemTotal:       16384000 kB
MemFree:         2048000 kB
MemAvailable:    8192000 kB
Cached:          4096 kB
SwapCached:      512 kB
Buffers:          256 kB
";
        assert_eq!(parse_meminfo_cached_bytes(meminfo), Some(4096 * 1024));
    }

    #[test]
    fn parse_meminfo_cached_bytes_ignores_missing_or_invalid() {
        assert_eq!(parse_meminfo_cached_bytes("SwapCached: 512 kB\n"), None);
        assert_eq!(
            parse_meminfo_cached_bytes("Cached: not-a-number kB\n"),
            None
        );
        assert_eq!(parse_meminfo_cached_bytes(""), None);
    }

    #[test]
    fn host_core_sample_clamps_and_keeps_enumerate_index() {
        let cores = [f32::NAN, -4.0, 40.0, 250.0]
            .into_iter()
            .enumerate()
            .map(|(index, raw)| host_core_sample(index, raw))
            .collect::<Vec<_>>();
        assert_eq!(cores[0].index, 0);
        assert_eq!(cores[1].index, 1);
        assert_eq!(cores[2].index, 2);
        assert_eq!(cores[3].index, 3);
        assert_eq!(cores[0].cpu_percent, 0.0);
        assert_eq!(cores[1].cpu_percent, 0.0);
        assert_eq!(cores[2].cpu_percent, 40.0);
        assert_eq!(cores[3].cpu_percent, 100.0);
    }

    #[test]
    fn memory_sample_enforces_used_available_and_swap_invariants() {
        let memory = ResourceHostMemorySample::from_parts(
            100,
            140,
            7,
            Some(3),
            20,
            25,
            ResourceMemoryAccounting::FallbackTotalMinusAvailable,
        );
        assert_eq!(memory.used, 100);
        assert_eq!(memory.available, 0);
        assert_eq!(memory.used + memory.available, memory.total);
        assert_eq!(memory.swap_used, 20);
        assert_eq!(memory.swap_free, 0);
        assert_eq!(memory.swap_used + memory.swap_free, memory.swap_total);
        assert_eq!(memory.free, 7);
        assert_eq!(memory.cached, Some(3));
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
        assert_eq!(sample.host.memory_used_bytes, sample.host.memory.used);
        assert_eq!(sample.host.memory_total_bytes, sample.host.memory.total);
        assert!(sample.host.memory_used_bytes <= sample.host.memory_total_bytes);
        assert_eq!(
            sample.host.memory.used + sample.host.memory.available,
            sample.host.memory.total
        );
        assert_eq!(
            sample.host.memory.swap_used + sample.host.memory.swap_free,
            sample.host.memory.swap_total
        );
        assert_host_cores(&sample.host);

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
        assert_eq!(sample.host.memory_used_bytes, sample.host.memory.used);
        assert_eq!(sample.host.memory_total_bytes, sample.host.memory.total);
        assert!(sample.host.memory_used_bytes <= sample.host.memory_total_bytes);
        assert_eq!(
            sample.host.memory.used + sample.host.memory.available,
            sample.host.memory.total
        );
        assert_eq!(
            sample.host.memory.swap_used + sample.host.memory.swap_free,
            sample.host.memory.swap_total
        );
        assert!(sample.host.cpu_percent >= 0.0 && sample.host.cpu_percent <= 100.0);
        assert_host_cores(&sample.host);
        assert_platform_accounting(sample.host.memory.accounting);
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
        assert_host_cores(&second.host);
        assert_eq!(second.host.memory_used_bytes, second.host.memory.used);
        assert_eq!(second.host.memory_total_bytes, second.host.memory.total);
    }

    fn assert_host_cores(host: &ResourceHostSample) {
        if host.cores.is_empty() {
            // Unsupported edge: empty `system.cpus()` keeps cores empty while
            // logical_cpu_count may still fall back to available_parallelism.
            return;
        }
        assert_eq!(host.cores.len(), host.logical_cpu_count as usize);
        for (index, core) in host.cores.iter().enumerate() {
            assert_eq!(core.index as usize, index);
            assert!(core.cpu_percent >= 0.0 && core.cpu_percent <= 100.0);
        }
    }

    fn assert_platform_accounting(accounting: ResourceMemoryAccounting) {
        #[cfg(target_os = "macos")]
        assert!(matches!(
            accounting,
            ResourceMemoryAccounting::BtopMach
                | ResourceMemoryAccounting::FallbackTotalMinusAvailable
        ));
        #[cfg(target_os = "linux")]
        assert_eq!(accounting, ResourceMemoryAccounting::LinuxMemavailable);
        #[cfg(target_os = "windows")]
        assert_eq!(accounting, ResourceMemoryAccounting::WindowsAvailPhys);
        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        assert_eq!(
            accounting,
            ResourceMemoryAccounting::FallbackTotalMinusAvailable
        );
    }
}
