//! macOS host memory via Mach, matching btop's OSX collector.
//!
//! btop `src/osx/btop_collect.cpp`:
//! `used = (active_count + wire_count) * page_size`
//! from `host_statistics64(HOST_VM_INFO64)`.

use super::mach_active_wired_used_bytes;

/// btop-aligned used bytes, or `None` if Mach/`sysconf` fails.
pub(super) fn btop_used_memory() -> Option<u64> {
    let stats = host_vm_info64()?;
    let page_size = sysconf_page_size()?;
    mach_active_wired_used_bytes(
        u64::from(stats.active_count),
        u64::from(stats.wire_count),
        page_size,
    )
}

fn sysconf_page_size() -> Option<i64> {
    // SAFETY: `sysconf(_SC_PAGESIZE)` is a documented query with no pointer args.
    let page_size = unsafe { libc::sysconf(libc::_SC_PAGESIZE) };
    (page_size > 0).then_some(page_size)
}

fn host_vm_info64() -> Option<libc::vm_statistics64> {
    // SAFETY: `vm_statistics64` is a C POD Mach struct; zeroed input is
    // valid for `host_statistics64` to overwrite.
    let mut stats = unsafe { std::mem::zeroed::<libc::vm_statistics64>() };
    let mut count = libc::HOST_VM_INFO64_COUNT;
    // SAFETY: `stats` and `count` are valid, correctly sized out-params for
    // `HOST_VM_INFO64`. `mach_host_self()` returns a well-known host port.
    // libc 0.2.189 deprecates `mach_host_self` in favor of `mach2`; this
    // crate stays on the requested macos `libc` target dep.
    #[allow(deprecated)]
    let kr = unsafe {
        libc::host_statistics64(
            libc::mach_host_self(),
            libc::HOST_VM_INFO64,
            (&raw mut stats).cast(),
            &raw mut count,
        )
    };
    (kr == libc::KERN_SUCCESS).then_some(stats)
}
