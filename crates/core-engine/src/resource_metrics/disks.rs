//! Storage-only local disk capacity sampling.
//!
//! Refresh is [`sysinfo::DiskRefreshKind::storage`] only. Network/tmpfs sysinfo
//! features stay off. Device path, filesystem type, UUID, kind, and I/O never
//! appear on [`ResourceDiskSample`].

use std::collections::HashSet;
use std::time::{Duration, Instant};

use sysinfo::{DiskRefreshKind, Disks};

/// Interactive disk-capacity cache. Matches the Resource Monitor sample interval.
pub const DISK_CACHE_TTL: Duration = Duration::from_millis(2500);

/// One filtered local volume. Bytes and 0–100 pressure only.
#[derive(Debug, Clone, PartialEq)]
pub struct ResourceDiskSample {
    pub name: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub usage_percent: f32,
    pub removable: bool,
}

/// Raw sysinfo row used by the pure filter. Not serialized.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DiskCandidate {
    pub name: String,
    pub mount_point: String,
    pub file_system: String,
    pub total: u64,
    pub available: u64,
    pub removable: bool,
}

pub(crate) struct DiskState {
    disks: Disks,
    cache: DiskSampleCache,
    #[cfg(test)]
    refresh_count: u32,
}

impl DiskState {
    pub(crate) fn new() -> Self {
        Self {
            disks: Disks::new(),
            cache: DiskSampleCache::new(),
            #[cfg(test)]
            refresh_count: 0,
        }
    }

    pub(crate) fn sample_cached(&mut self) -> Vec<ResourceDiskSample> {
        if let Some(cached) = self.cache.get_if_fresh() {
            return cached.to_vec();
        }
        let samples = refresh_and_collect(&mut self.disks);
        #[cfg(test)]
        {
            self.refresh_count = self.refresh_count.saturating_add(1);
        }
        self.cache.store(samples.clone());
        samples
    }

    #[cfg(test)]
    pub(crate) fn refresh_count(&self) -> u32 {
        self.refresh_count
    }
}

pub(crate) struct DiskSampleCache {
    slot: Option<(Instant, Vec<ResourceDiskSample>)>,
}

impl DiskSampleCache {
    pub(crate) fn new() -> Self {
        Self { slot: None }
    }

    pub(crate) fn get_if_fresh(&self) -> Option<&[ResourceDiskSample]> {
        self.get_if_fresh_at(Instant::now())
    }

    pub(crate) fn get_if_fresh_at(&self, now: Instant) -> Option<&[ResourceDiskSample]> {
        let (collected_at, samples) = self.slot.as_ref()?;
        if disk_cache_is_fresh(*collected_at, now) {
            Some(samples.as_slice())
        } else {
            None
        }
    }

    pub(crate) fn store(&mut self, samples: Vec<ResourceDiskSample>) {
        self.store_at(Instant::now(), samples);
    }

    pub(crate) fn store_at(&mut self, now: Instant, samples: Vec<ResourceDiskSample>) {
        self.slot = Some((now, samples));
    }
}

/// Fresh when elapsed time since `collected_at` is strictly below 2.5s.
fn disk_cache_is_fresh(collected_at: Instant, now: Instant) -> bool {
    now.saturating_duration_since(collected_at) < DISK_CACHE_TTL
}

fn disk_refresh_kind() -> DiskRefreshKind {
    DiskRefreshKind::nothing().with_storage()
}

fn refresh_and_collect(disks: &mut Disks) -> Vec<ResourceDiskSample> {
    disks.refresh_specifics(true, disk_refresh_kind());
    finalize_disks_with_preferred(
        disks.list().iter().map(candidate_from_sysinfo).collect(),
        production_preferred_mount().as_deref(),
    )
}

fn production_preferred_mount() -> Option<String> {
    #[cfg(windows)]
    {
        std::env::var("SystemDrive")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    }
    #[cfg(not(windows))]
    {
        None
    }
}

fn candidate_from_sysinfo(disk: &sysinfo::Disk) -> DiskCandidate {
    DiskCandidate {
        name: disk.name().to_string_lossy().into_owned(),
        mount_point: disk.mount_point().to_string_lossy().into_owned(),
        file_system: disk.file_system().to_string_lossy().into_owned(),
        total: disk.total_space(),
        available: disk.available_space(),
        removable: disk.is_removable(),
    }
}

/// Filter, dedup, then select a single system disk. Pure. No preferred mount.
#[cfg(test)]
fn finalize_disks(candidates: Vec<DiskCandidate>) -> Vec<ResourceDiskSample> {
    finalize_disks_with_preferred(candidates, None)
}

fn finalize_disks_with_preferred(
    candidates: Vec<DiskCandidate>,
    preferred_mount: Option<&str>,
) -> Vec<ResourceDiskSample> {
    let filtered = filter_disk_candidates(candidates);
    select_primary_candidate(&filtered, preferred_mount)
        .map(disk_sample_from_candidate)
        .into_iter()
        .collect()
}

/// Keep useful non-removable local volumes. May return several candidates.
fn filter_disk_candidates(candidates: Vec<DiskCandidate>) -> Vec<DiskCandidate> {
    let mut seen_mounts = HashSet::new();
    candidates
        .into_iter()
        .filter(keep_disk_candidate)
        .filter(|candidate| seen_mounts.insert(candidate.mount_point.clone()))
        .collect()
}

fn keep_disk_candidate(candidate: &DiskCandidate) -> bool {
    if candidate.removable || candidate.total == 0 || candidate.mount_point.trim().is_empty() {
        return false;
    }
    if is_ignored_file_system(&candidate.file_system) {
        return false;
    }
    if is_ignored_mount(&candidate.mount_point) {
        return false;
    }
    true
}

fn select_primary_candidate(
    filtered: &[DiskCandidate],
    preferred_mount: Option<&str>,
) -> Option<DiskCandidate> {
    if filtered.is_empty() {
        return None;
    }
    let has_unix_root = filtered
        .iter()
        .any(|candidate| is_unix_root(&candidate.mount_point));
    let eligible: Vec<&DiskCandidate> = filtered
        .iter()
        .filter(|candidate| !(has_unix_root && is_macos_shadow_volume(&candidate.mount_point)))
        .collect();
    if eligible.is_empty() {
        return None;
    }
    if let Some(preferred) = preferred_mount
        .map(str::trim)
        .filter(|mount| !mount.is_empty())
    {
        if let Some(hit) = eligible
            .iter()
            .find(|candidate| mounts_equivalent(&candidate.mount_point, preferred))
        {
            return Some((*hit).clone());
        }
    }
    if let Some(root) = eligible
        .iter()
        .find(|candidate| is_unix_root(&candidate.mount_point))
    {
        return Some((*root).clone());
    }
    if let Some(drive) = pick_largest(
        eligible
            .iter()
            .copied()
            .filter(|candidate| is_root_or_drive(&candidate.mount_point)),
    ) {
        return Some(drive.clone());
    }
    pick_largest(eligible.iter().copied()).cloned()
}

fn pick_largest<'a>(
    candidates: impl Iterator<Item = &'a DiskCandidate>,
) -> Option<&'a DiskCandidate> {
    candidates.max_by(|left, right| {
        left.total
            .cmp(&right.total)
            .then_with(|| {
                left.name
                    .to_ascii_lowercase()
                    .cmp(&right.name.to_ascii_lowercase())
            })
            .then_with(|| {
                left.mount_point
                    .to_ascii_lowercase()
                    .cmp(&right.mount_point.to_ascii_lowercase())
            })
    })
}

fn mounts_equivalent(left: &str, right: &str) -> bool {
    normalize_mount_for_match(left).eq_ignore_ascii_case(&normalize_mount_for_match(right))
}

fn normalize_mount_for_match(mount: &str) -> String {
    normalize_mount_slashes(mount.trim())
        .trim_end_matches('/')
        .to_string()
}

fn is_macos_shadow_volume(mount: &str) -> bool {
    mount_is_or_under(mount, "/System/Volumes/Data")
        || mount_is_or_under(mount, "/Volumes/Atmos")
        || mount_is_or_under(mount, "/Volumes/Dray")
}

fn disk_sample_from_candidate(candidate: DiskCandidate) -> ResourceDiskSample {
    let available = candidate.available.min(candidate.total);
    let used = candidate.total.saturating_sub(available);
    ResourceDiskSample {
        name: disk_display_name(&candidate.name, &candidate.mount_point),
        mount_point: candidate.mount_point,
        total_bytes: candidate.total,
        used_bytes: used,
        available_bytes: available,
        usage_percent: usage_percent(used, candidate.total),
        removable: candidate.removable,
    }
}

fn usage_percent(used: u64, total: u64) -> f32 {
    if total == 0 {
        return 0.0;
    }
    let percent = (used as f64 / total as f64) * 100.0;
    if !percent.is_finite() {
        return 0.0;
    }
    percent.clamp(0.0, 100.0) as f32
}

fn disk_display_name(name: &str, mount: &str) -> String {
    let name = name.trim();
    if !name.is_empty() && !is_opaque_device_name(name) {
        return name.to_string();
    }
    if is_unix_root(mount) {
        return "root".to_string();
    }
    mount_basename(mount).unwrap_or_else(|| mount.to_string())
}

fn is_opaque_device_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.starts_with("/dev/") || lower.starts_with("\\\\.\\") || is_uuid_like(name)
}

fn is_uuid_like(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    for (index, byte) in bytes.iter().copied().enumerate() {
        let ok = match index {
            8 | 13 | 18 | 23 => byte == b'-',
            _ => byte.is_ascii_hexdigit(),
        };
        if !ok {
            return false;
        }
    }
    true
}

fn mount_basename(mount: &str) -> Option<String> {
    let unix = normalize_mount_slashes(mount);
    let trimmed = unix.trim_end_matches('/');
    if trimmed.is_empty() {
        return None;
    }
    trimmed
        .rsplit('/')
        .next()
        .filter(|part| !part.is_empty())
        .map(str::to_string)
}

fn is_allowed_local_fuse(file_system: &str) -> bool {
    matches!(
        file_system,
        "fuseblk" | "fuse.ntfs" | "fuse.ntfs-3g" | "ntfs-3g" | "fuse.exfat"
    )
}

fn is_ignored_file_system(file_system: &str) -> bool {
    let fs = file_system.trim().to_ascii_lowercase();
    if fs.is_empty() {
        return false;
    }
    if is_allowed_local_fuse(&fs) {
        return false;
    }
    if fs == "fuse" || fs.starts_with("fuse.") || fs == "fusectl" {
        return true;
    }
    matches!(
        fs.as_str(),
        "tmpfs"
            | "overlay"
            | "overlayfs"
            | "overlay2"
            | "aufs"
            | "nfs"
            | "nfs4"
            | "cifs"
            | "smb"
            | "smbfs"
            | "autofs"
            | "9p"
            | "afp"
            | "afpfs"
            | "webdav"
            | "proc"
            | "procfs"
            | "sysfs"
            | "devtmpfs"
            | "devpts"
            | "devfs"
            | "cgroup"
            | "cgroup2"
            | "squashfs"
            | "ramfs"
            | "rootfs"
            | "iso9660"
            | "hugetlbfs"
            | "mqueue"
            | "pstore"
            | "rpc_pipefs"
            | "nsfs"
            | "bpf"
            | "tracefs"
            | "debugfs"
            | "securityfs"
            | "configfs"
            | "fusectl"
            | "none"
    )
}

fn is_ignored_mount(mount: &str) -> bool {
    if mount_is_or_under(mount, "/proc") || mount_is_or_under(mount, "/sys") {
        return true;
    }
    if mount_is_or_under(mount, "/run") && !mount_is_or_under(mount, "/run/media") {
        return true;
    }
    is_macos_hidden_volume(mount)
}

fn is_macos_hidden_volume(mount: &str) -> bool {
    mount_is_or_under(mount, "/System/Volumes/Preboot")
        || mount_is_or_under(mount, "/System/Volumes/VM")
        || mount_is_or_under(mount, "/System/Volumes/Update")
        || mount_is_or_under(mount, "/private/var/vm")
}

fn mount_is_or_under(mount: &str, prefix: &str) -> bool {
    let mount = normalize_mount_slashes(mount);
    let prefix = normalize_mount_slashes(prefix);
    mount == prefix || mount.starts_with(&format!("{prefix}/"))
}

fn normalize_mount_slashes(mount: &str) -> String {
    mount.replace('\\', "/")
}

fn is_unix_root(mount: &str) -> bool {
    let unix = normalize_mount_slashes(mount);
    unix == "/" || unix.is_empty() || unix.chars().all(|ch| ch == '/')
}

fn is_root_or_drive(mount: &str) -> bool {
    if is_unix_root(mount) {
        return true;
    }
    let unix = normalize_mount_slashes(mount);
    let trimmed = unix.trim_end_matches('/');
    let bytes = trimmed.as_bytes();
    bytes.len() == 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(
        name: &str,
        mount: &str,
        file_system: &str,
        total: u64,
        available: u64,
        removable: bool,
    ) -> DiskCandidate {
        DiskCandidate {
            name: name.to_string(),
            mount_point: mount.to_string(),
            file_system: file_system.to_string(),
            total,
            available,
            removable,
        }
    }

    fn assert_disk_invariants(disks: &[ResourceDiskSample]) {
        assert!(disks.len() <= 1);
        for disk in disks {
            assert!(!disk.name.is_empty(), "name must be displayable");
            assert!(!disk.mount_point.is_empty());
            assert!(!disk.removable);
            assert!(disk.total_bytes > 0);
            assert!(disk.used_bytes <= disk.total_bytes);
            assert_eq!(
                disk.used_bytes,
                disk.total_bytes.saturating_sub(disk.available_bytes)
            );
            assert_eq!(disk.used_bytes + disk.available_bytes, disk.total_bytes);
            assert!(
                disk.usage_percent >= 0.0 && disk.usage_percent <= 100.0,
                "percent {}",
                disk.usage_percent
            );
            assert!(
                !is_ignored_mount(&disk.mount_point),
                "hidden mount leaked {}",
                disk.mount_point
            );
        }
    }

    fn filtered_mounts(candidates: Vec<DiskCandidate>) -> Vec<String> {
        filter_disk_candidates(candidates)
            .into_iter()
            .map(|candidate| candidate.mount_point)
            .collect()
    }

    #[test]
    fn drops_zero_capacity_pseudo_network_hidden_and_removable() {
        let candidates = vec![
            candidate("root", "/", "apfs", 100, 40, false),
            candidate("zero", "/mnt/empty", "apfs", 0, 0, false),
            candidate("tmp", "/tmp", "tmpfs", 80, 20, false),
            candidate("docker", "/var/lib/docker", "overlay", 80, 20, false),
            candidate("ssh", "/mnt/ssh", "fuse.sshfs", 80, 20, false),
            candidate("share", "/mnt/share", "nfs4", 80, 20, false),
            candidate("smb", "/mnt/smb", "cifs", 80, 20, false),
            candidate("proc", "/proc", "proc", 80, 20, false),
            candidate("sys", "/sys", "sysfs", 80, 20, false),
            candidate("run", "/run", "tmpfs", 80, 20, false),
            candidate("run-lock", "/run/lock", "tmpfs", 80, 20, false),
            candidate("usb", "/run/media/user/USB", "exfat", 80, 20, true),
            candidate("preboot", "/System/Volumes/Preboot", "apfs", 80, 20, false),
            candidate("vm", "/System/Volumes/VM", "apfs", 80, 20, false),
            candidate("update", "/System/Volumes/Update", "apfs", 80, 20, false),
            candidate("swap", "/private/var/vm", "apfs", 80, 20, false),
        ];
        assert_eq!(filtered_mounts(candidates.clone()), vec!["/"]);
        let disks = finalize_disks(candidates);
        assert_eq!(
            disks
                .iter()
                .map(|disk| disk.mount_point.as_str())
                .collect::<Vec<_>>(),
            vec!["/"]
        );
        assert_disk_invariants(&disks);
    }

    #[test]
    fn filter_keeps_local_physical_fuse_and_drops_network_virtual_fuse() {
        let candidates = vec![
            candidate("ntfs-blk", "/mnt/ntfs-blk", "fuseblk", 80, 20, false),
            candidate("ntfs", "/mnt/ntfs", "fuse.ntfs", 120, 20, false),
            candidate("ntfs3g", "/mnt/ntfs3g", "fuse.ntfs-3g", 80, 20, false),
            candidate("ntfs3g-alt", "/mnt/ntfs3g-alt", "ntfs-3g", 80, 20, false),
            candidate("exfat", "/mnt/exfat", "fuse.exfat", 80, 20, true),
            candidate("ssh", "/mnt/ssh", "fuse.sshfs", 80, 20, false),
            candidate("portal", "/mnt/portal", "fuse.portal", 80, 20, false),
            candidate("ctl", "/mnt/fusectl", "fusectl", 80, 20, false),
            candidate("rclone", "/mnt/cloud", "fuse.rclone", 80, 20, false),
        ];
        assert_eq!(
            filtered_mounts(candidates.clone()),
            vec![
                "/mnt/ntfs-blk",
                "/mnt/ntfs",
                "/mnt/ntfs3g",
                "/mnt/ntfs3g-alt",
            ]
        );
        let disks = finalize_disks(candidates);
        assert_eq!(disks.len(), 1);
        assert_eq!(disks[0].mount_point, "/mnt/ntfs");
        assert_disk_invariants(&disks);
    }

    #[test]
    fn root_plus_data_atmos_dray_selects_only_slash() {
        let candidates = vec![
            candidate("Macintosh HD", "/", "apfs", 500, 200, false),
            candidate("Data", "/System/Volumes/Data", "apfs", 800, 100, false),
            candidate("Atmos", "/Volumes/Atmos", "apfs", 900, 10, false),
            candidate("Dray", "/Volumes/Dray", "apfs", 900, 10, false),
            candidate("Macintosh HD", "/", "apfs", 500, 180, false),
        ];
        let filtered = filter_disk_candidates(candidates.clone());
        assert!(filtered.iter().any(|disk| disk.mount_point == "/"));
        assert!(filtered
            .iter()
            .any(|disk| disk.mount_point == "/System/Volumes/Data"));
        assert!(filtered
            .iter()
            .any(|disk| disk.mount_point == "/Volumes/Atmos"));
        assert!(filtered
            .iter()
            .any(|disk| disk.mount_point == "/Volumes/Dray"));
        let disks = finalize_disks(candidates);
        assert_eq!(disks.len(), 1);
        assert_eq!(disks[0].mount_point, "/");
        assert_eq!(disks[0].name, "Macintosh HD");
        assert_disk_invariants(&disks);
    }

    #[test]
    fn windows_preferred_drive_beats_other_system_drive() {
        let candidates = vec![
            candidate("System", "C:\\", "ntfs", 200, 80, false),
            candidate("Data", "D:\\", "ntfs", 100, 40, false),
        ];
        let disks = finalize_disks_with_preferred(candidates, Some("D:"));
        assert_eq!(disks.len(), 1);
        assert_eq!(disks[0].mount_point, "D:\\");
        assert_eq!(disks[0].name, "Data");
        assert_disk_invariants(&disks);
    }

    #[test]
    fn no_root_selects_largest_local_non_removable() {
        let disks = finalize_disks(vec![
            candidate("home", "/home", "ext4", 80, 20, false),
            candidate("data", "/data", "ext4", 200, 50, false),
            candidate("usb", "/mnt/usb", "exfat", 400, 10, true),
        ]);
        assert_eq!(disks.len(), 1);
        assert_eq!(disks[0].mount_point, "/data");
        assert_eq!(disks[0].name, "data");
        assert_disk_invariants(&disks);
    }

    #[test]
    fn removable_only_selects_empty() {
        let disks = finalize_disks(vec![
            candidate("USB", "/Volumes/USB", "exfat", 30, 10, true),
            candidate("SD", "/run/media/user/SD", "exfat", 20, 5, true),
        ]);
        assert!(disks.is_empty());
        assert_disk_invariants(&disks);
    }

    #[test]
    fn exact_mount_duplicate_keeps_first_in_filter_then_selects_root() {
        let candidates = vec![
            candidate("home-a", "/home", "ext4", 100, 40, false),
            candidate("home-b", "/home", "ext4", 90, 10, false),
            candidate("Data", "/System/Volumes/Data", "apfs", 100, 40, false),
            candidate("root", "/", "apfs", 100, 40, false),
        ];
        let filtered = filter_disk_candidates(candidates.clone());
        assert_eq!(
            filtered
                .iter()
                .find(|disk| disk.mount_point == "/home")
                .map(|disk| disk.name.as_str()),
            Some("home-a")
        );
        let disks = finalize_disks(candidates);
        assert_eq!(disks.len(), 1);
        assert_eq!(disks[0].mount_point, "/");
        assert_disk_invariants(&disks);
    }

    #[test]
    fn empty_or_device_name_falls_back_to_root_basename_or_mount() {
        let root = finalize_disks(vec![candidate("", "/", "apfs", 100, 40, false)]);
        assert_eq!(root[0].name, "root");
        assert_eq!(root[0].mount_point, "/");
        let home = finalize_disks(vec![candidate(
            "/dev/nvme0n1p2",
            "/home",
            "ext4",
            80,
            20,
            false,
        )]);
        assert_eq!(home[0].name, "home");
        let unusual = finalize_disks(vec![candidate("   ", "\\\\unusual", "ntfs", 40, 10, false)]);
        assert_eq!(unusual[0].name, "unusual");
        assert_disk_invariants(&root);
        assert_disk_invariants(&home);
        assert_disk_invariants(&unusual);
    }

    #[test]
    fn used_is_saturating_total_minus_available_and_percent_clamps() {
        let full =
            disk_sample_from_candidate(candidate("full", "/mnt/full", "ext4", 100, 0, false));
        assert_eq!(full.used_bytes, 100);
        assert_eq!(full.available_bytes, 0);
        assert_eq!(full.used_bytes + full.available_bytes, full.total_bytes);
        assert_eq!(full.usage_percent, 100.0);
        let over =
            disk_sample_from_candidate(candidate("over", "/mnt/over", "ext4", 100, 140, false));
        assert_eq!(over.used_bytes, 0);
        assert_eq!(over.available_bytes, 100);
        assert_eq!(over.used_bytes + over.available_bytes, over.total_bytes);
        assert_eq!(over.usage_percent, 0.0);
        let half =
            disk_sample_from_candidate(candidate("half", "/mnt/half", "ext4", 50, 25, false));
        assert_eq!(half.used_bytes, 25);
        assert_eq!(half.available_bytes, 25);
        assert_eq!(half.used_bytes + half.available_bytes, half.total_bytes);
        assert_eq!(half.usage_percent, 50.0);
        assert_disk_invariants(std::slice::from_ref(&full));
        assert_disk_invariants(std::slice::from_ref(&over));
        assert_disk_invariants(std::slice::from_ref(&half));
    }

    #[test]
    fn disk_cache_freshness_uses_injected_instant_boundaries() {
        let origin = Instant::now();
        assert!(disk_cache_is_fresh(origin, origin));
        assert!(disk_cache_is_fresh(
            origin,
            origin + DISK_CACHE_TTL - Duration::from_nanos(1)
        ));
        assert!(!disk_cache_is_fresh(origin, origin + DISK_CACHE_TTL));
        assert!(!disk_cache_is_fresh(
            origin,
            origin + DISK_CACHE_TTL + Duration::from_millis(1)
        ));

        let mut cache = DiskSampleCache::new();
        let fixture = vec![ResourceDiskSample {
            name: "root".into(),
            mount_point: "/".into(),
            total_bytes: 100,
            used_bytes: 40,
            available_bytes: 60,
            usage_percent: 40.0,
            removable: false,
        }];
        cache.store_at(origin, fixture.clone());
        let fresh = cache
            .get_if_fresh_at(origin + Duration::from_millis(2499))
            .expect("fresh below 2.5s");
        assert_eq!(fresh, fixture.as_slice());
        assert!(cache.get_if_fresh_at(origin + DISK_CACHE_TTL).is_none());
    }

    #[test]
    fn disk_refresh_kind_is_storage_only() {
        let kind = disk_refresh_kind();
        assert!(kind.storage());
        assert!(!kind.kind());
        assert!(!kind.io_usage());
    }
}
