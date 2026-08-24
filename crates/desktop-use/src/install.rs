//! Download + install pinned control-engine packages into Atmos-managed paths.

use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

use flate2::read::GzDecoder;
use sha2::{Digest, Sha256};
use tar::Archive;

use crate::engine_manifest::{current_platform, BinaryEntry, EngineManifest};
use crate::strings::scrub_vendor;

/// Atmos product icon for the rebranded host app (replaces vendor AppIcon).
const HOST_APP_ICON_ICNS: &[u8] = include_bytes!("../assets/host-app-icon.icns");

/// Upstream host executable filename inside the extracted `.app` (never user-facing).
pub(crate) const VENDOR_HOST_EXECUTABLE: &str = if cfg!(windows) {
    "cua-driver.exe"
} else {
    "cua-driver"
};

const DEFAULT_HOST_SERVE_NAME: &str = "Atmos Desktop Use";

pub struct InstallLayout {
    pub engine_bin: PathBuf,
    pub host_app: Option<PathBuf>,
    pub runtime_dir: PathBuf,
    pub version: String,
}

/// Install control engine from a local archive file (tests / offline).
pub fn install_from_archive(
    archive_path: &Path,
    entry: &BinaryEntry,
    data_dir: &Path,
    engine_bin: &Path,
    manifest: &EngineManifest,
) -> Result<InstallLayout, String> {
    let runtime_dir = data_dir.join("runtime").join(&manifest.engine_version);
    let _ = fs::remove_dir_all(&runtime_dir);
    fs::create_dir_all(&runtime_dir).map_err(|e| scrub_vendor(&e.to_string()))?;

    extract_archive(archive_path, &entry.archive_kind, &runtime_dir)?;

    let engine_src = runtime_dir.join(&entry.engine_inner_path);
    if !engine_src.is_file() {
        // Some archives flatten paths — search for engine binary name.
        let fallback = find_named_file(&runtime_dir, VENDOR_HOST_EXECUTABLE);
        let src = fallback.ok_or_else(|| {
            scrub_vendor(&format!(
                "engine binary missing in package at {}",
                entry.engine_inner_path
            ))
        })?;
        copy_engine(&src, engine_bin)?;
    } else {
        copy_engine(&engine_src, engine_bin)?;
    }

    let host_app = if let Some(rel) = &entry.host_app_inner_path {
        let src = runtime_dir.join(rel);
        if src.is_dir() {
            let dest = data_dir
                .join("host")
                .join(format!("{}.app", manifest.host_app_name));
            install_host_app(&src, &dest, manifest)?;
            Some(dest)
        } else {
            None
        }
    } else {
        None
    };

    // Persist installed pin meta (no vendor product marketing).
    let meta = serde_json::json!({
        "engine_version": manifest.engine_version,
        "host_app_name": manifest.host_app_name,
        "host_bundle_id": manifest.host_bundle_id,
        "installed_at": chrono_lite_now(),
    });
    let _ = fs::create_dir_all(data_dir);
    let _ = fs::write(
        data_dir.join("installed.json"),
        serde_json::to_vec_pretty(&meta).unwrap_or_default(),
    );

    Ok(InstallLayout {
        engine_bin: engine_bin.to_path_buf(),
        host_app,
        runtime_dir,
        version: manifest.engine_version.clone(),
    })
}

/// Download package for current platform (or fixture via ATMOS_DESKTOP_USE_ENGINE_ARCHIVE).
///
/// `on_progress` receives a fraction in `0.0..=1.0` (download ≈ 0–0.9, extract/install ≈ 0.9–1.0).
pub fn download_and_install(
    data_dir: &Path,
    engine_bin: &Path,
    force: bool,
    mut on_progress: impl FnMut(f32),
) -> Result<InstallLayout, String> {
    let manifest = EngineManifest::load()?;
    let platform = current_platform();
    if platform == "unknown" {
        return Err(scrub_vendor(
            "Control engine is not available for this platform yet.",
        ));
    }
    let entry = manifest
        .find_for_platform(platform)
        .ok_or_else(|| {
            scrub_vendor(&format!(
                "No control engine package is pinned for platform {platform}."
            ))
        })?
        .clone();

    if engine_bin.is_file() && !force {
        // Refresh branding on already-installed hosts (icon / plist) without re-download.
        if let Some(host) = host_app_path(data_dir, &manifest) {
            let _ = rebrand_existing_host_app(&host, &manifest);
        }
        on_progress(1.0);
        return Ok(InstallLayout {
            engine_bin: engine_bin.to_path_buf(),
            host_app: host_app_path(data_dir, &manifest),
            runtime_dir: data_dir.join("runtime").join(&manifest.engine_version),
            version: manifest.engine_version.clone(),
        });
    }

    let cache_dir = data_dir.join("cache");
    fs::create_dir_all(&cache_dir).map_err(|e| scrub_vendor(&e.to_string()))?;
    let archive_name = entry.url.rsplit('/').next().unwrap_or("engine-package.bin");
    let archive_path = cache_dir.join(archive_name);

    if let Ok(fixture) = std::env::var("ATMOS_DESKTOP_USE_ENGINE_ARCHIVE") {
        let fixture = PathBuf::from(fixture);
        if fixture.is_file() {
            on_progress(0.2);
            fs::copy(&fixture, &archive_path).map_err(|e| scrub_vendor(&e.to_string()))?;
            on_progress(0.5);
            verify_sha256(&archive_path, &entry.sha256)?;
            on_progress(0.7);
            let layout =
                install_from_archive(&archive_path, &entry, data_dir, engine_bin, &manifest)?;
            on_progress(1.0);
            return Ok(layout);
        }
        return Err(scrub_vendor(
            "ATMOS_DESKTOP_USE_ENGINE_ARCHIVE is set but the archive file was not found.",
        ));
    }

    if std::env::var("ATMOS_DESKTOP_USE_SKIP_DOWNLOAD")
        .map(|v| matches!(v.as_str(), "1" | "true" | "yes"))
        .unwrap_or(false)
    {
        return Err(scrub_vendor(
            "Control engine download is disabled (ATMOS_DESKTOP_USE_SKIP_DOWNLOAD).",
        ));
    }

    download_file(&entry.url, &archive_path, |p| {
        // Reserve the last 10% for checksum + extract.
        on_progress((p * 0.9).clamp(0.0, 0.9));
    })?;
    on_progress(0.91);
    verify_sha256(&archive_path, &entry.sha256)?;
    on_progress(0.94);
    let layout = install_from_archive(&archive_path, &entry, data_dir, engine_bin, &manifest)?;
    on_progress(1.0);
    Ok(layout)
}

pub fn host_app_path(data_dir: &Path, manifest: &EngineManifest) -> Option<PathBuf> {
    let p = data_dir
        .join("host")
        .join(format!("{}.app", manifest.host_app_name));
    p.is_dir().then_some(p)
}

fn copy_engine(src: &Path, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| scrub_vendor(&e.to_string()))?;
    }
    fs::copy(src, dest).map_err(|e| scrub_vendor(&e.to_string()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(dest, fs::Permissions::from_mode(0o755));
    }
    Ok(())
}

fn extract_archive(archive: &Path, kind: &str, dest: &Path) -> Result<(), String> {
    match kind {
        "tar_gz" => {
            let file = File::open(archive).map_err(|e| scrub_vendor(&e.to_string()))?;
            let dec = GzDecoder::new(file);
            let mut ar = Archive::new(dec);
            ar.unpack(dest).map_err(|e| scrub_vendor(&e.to_string()))?;
            Ok(())
        }
        "zip" => {
            // Prefer system unzip for windows zips in M1 to avoid heavy zip feature matrix.
            let status = Command::new("unzip")
                .args(["-q", "-o"])
                .arg(archive)
                .arg("-d")
                .arg(dest)
                .status()
                .map_err(|e| scrub_vendor(&format!("unzip failed: {e}")))?;
            if !status.success() {
                return Err(scrub_vendor("failed to extract engine package (zip)"));
            }
            Ok(())
        }
        other => Err(scrub_vendor(&format!("unsupported archive kind: {other}"))),
    }
}

fn verify_sha256(path: &Path, expected_hex: &str) -> Result<(), String> {
    let mut file = File::open(path).map_err(|e| scrub_vendor(&e.to_string()))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| scrub_vendor(&e.to_string()))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let got = hex::encode(hasher.finalize());
    if !got.eq_ignore_ascii_case(expected_hex) {
        return Err(scrub_vendor(&format!(
            "package checksum mismatch (expected {expected_hex}, got {got})"
        )));
    }
    Ok(())
}

fn content_length(url: &str) -> Option<u64> {
    let output = Command::new("curl")
        .args(["-sI", "-L", "--max-time", "20", "--retry", "2"])
        .arg(url)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let headers = String::from_utf8_lossy(&output.stdout);
    let mut last: Option<u64> = None;
    for line in headers.lines() {
        let lower = line.to_ascii_lowercase();
        if let Some(rest) = lower.strip_prefix("content-length:") {
            if let Ok(n) = rest.trim().parse::<u64>() {
                last = Some(n);
            }
        }
    }
    last.filter(|n| *n > 0)
}

/// Download with optional byte-progress via destination file growth (curl).
fn download_file(url: &str, dest: &Path, mut on_progress: impl FnMut(f32)) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| scrub_vendor(&e.to_string()))?;
    }
    let _ = fs::remove_file(dest);

    let total = content_length(url);
    on_progress(0.0);

    let mut child = Command::new("curl")
        .args(["-fL", "--retry", "3", "--connect-timeout", "30", "-o"])
        .arg(dest)
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| scrub_vendor(&format!("download failed: {e}")))?;

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    let _ = fs::remove_file(dest);
                    return Err(scrub_vendor(
                        "Failed to download control engine package. Check network and retry ensure.",
                    ));
                }
                on_progress(1.0);
                return Ok(());
            }
            Ok(None) => {
                if let (Some(total_bytes), Ok(meta)) = (total, fs::metadata(dest)) {
                    let p = (meta.len() as f64 / total_bytes as f64).clamp(0.0, 0.99) as f32;
                    on_progress(p);
                }
                thread::sleep(Duration::from_millis(250));
            }
            Err(e) => {
                let _ = child.kill();
                let _ = fs::remove_file(dest);
                return Err(scrub_vendor(&format!("download failed: {e}")));
            }
        }
    }
}

fn find_named_file(root: &Path, name: &str) -> Option<PathBuf> {
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        // Skip unreadable dirs instead of aborting the whole search.
        let Ok(rd) = fs::read_dir(&dir) else {
            continue;
        };
        for ent in rd.flatten() {
            let p = ent.path();
            if p.is_dir() {
                stack.push(p);
            } else if p.file_name().and_then(|s| s.to_str()) == Some(name) {
                return Some(p);
            }
        }
    }
    None
}

pub(crate) fn host_macos_dir(app: &Path) -> PathBuf {
    app.join("Contents").join("MacOS")
}

pub(crate) fn host_serve_executable_name(app: &Path) -> String {
    app.file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_HOST_SERVE_NAME)
        .to_string()
}

/// Preferred serve binary inside the host `.app` (product name, then vendor fallback).
pub fn resolve_host_serve_bin(app: &Path) -> Option<PathBuf> {
    let macos = host_macos_dir(app);
    let branded = macos.join(host_serve_executable_name(app));
    if branded.is_file() {
        return Some(branded);
    }
    let vendor = macos.join(VENDOR_HOST_EXECUTABLE);
    vendor.is_file().then_some(vendor)
}

/// True when a live `serve` process is still exec'd under the vendor filename.
#[cfg(any(test, target_os = "macos"))]
pub(crate) fn vendor_host_serve_pgrep_pattern(app: &Path) -> String {
    format!(
        "{}/Contents/MacOS/{} serve",
        app.display(),
        VENDOR_HOST_EXECUTABLE
    )
}

/// Engine binaries are tens of MB; a trampoline/`#!` shim is tiny.
fn is_engine_mach_o(path: &Path) -> bool {
    fs::metadata(path)
        .map(|m| m.len() > 64 * 1024)
        .unwrap_or(false)
}

fn write_host_serve_trampoline(vendor: &Path, branded_name: &str) -> Result<(), String> {
    let script = format!("#!/bin/sh\nexec \"$(dirname \"$0\")/{branded_name}\" \"$@\"\n");
    let tmp = vendor.with_extension("trampoline-tmp");
    fs::write(&tmp, script)
        .map_err(|e| scrub_vendor(&format!("failed to write host serve trampoline: {e}")))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o755));
    }
    fs::rename(&tmp, vendor)
        .map_err(|e| scrub_vendor(&format!("failed to install host serve trampoline: {e}")))?;
    Ok(())
}

fn same_file(a: &Path, b: &Path) -> bool {
    let Ok(ma) = fs::metadata(a) else {
        return false;
    };
    let Ok(mb) = fs::metadata(b) else {
        return false;
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        ma.dev() == mb.dev() && ma.ino() == mb.ino()
    }
    #[cfg(not(unix))]
    {
        ma.len() == mb.len()
    }
}

/// Move the real engine binary to `Contents/MacOS/<product name>` and leave a
/// tiny `exec` shim at the upstream filename.
///
/// Installed CLIs that still exec the upstream name then land on the product
/// process name. Does **not** rewrite Info.plist or codesign — the Mach-O inode
/// (and TCC cdhash) is unchanged.
pub fn ensure_host_serve_alias(app: &Path) -> Result<bool, String> {
    let macos = host_macos_dir(app);
    if !macos.is_dir() {
        return Ok(false);
    }
    let branded_name = host_serve_executable_name(app);
    let branded = macos.join(&branded_name);
    let vendor = macos.join(VENDOR_HOST_EXECUTABLE);

    if !branded.exists() {
        if !vendor.is_file() {
            return Ok(false);
        }
        if is_engine_mach_o(&vendor) {
            fs::rename(&vendor, &branded)
                .map_err(|e| scrub_vendor(&format!("failed to rename host executable: {e}")))?;
            write_host_serve_trampoline(&vendor, &branded_name)?;
            return Ok(true);
        }
        #[cfg(unix)]
        {
            if fs::hard_link(&vendor, &branded).is_ok() {
                return Ok(true);
            }
            std::os::unix::fs::symlink(VENDOR_HOST_EXECUTABLE, &branded)
                .map_err(|e| scrub_vendor(&format!("failed to create host serve alias: {e}")))?;
            return Ok(true);
        }
        #[cfg(not(unix))]
        {
            return Ok(false);
        }
    }

    if vendor.is_file() && is_engine_mach_o(&vendor) {
        if same_file(&vendor, &branded) {
            let tmp = macos.join(format!("{branded_name}.mach-o-tmp"));
            fs::copy(&vendor, &tmp)
                .map_err(|e| scrub_vendor(&format!("failed to split host executable: {e}")))?;
            let _ = fs::remove_file(&branded);
            fs::rename(&tmp, &branded)
                .map_err(|e| scrub_vendor(&format!("failed to split host executable: {e}")))?;
        }
        write_host_serve_trampoline(&vendor, &branded_name)?;
        return Ok(true);
    }

    Ok(false)
}

/// Fresh-install rename of the vendor filename. Call only when the bundle will
/// be codesigned anyway (copy from upstream archive).
fn rename_vendor_host_executable(app: &Path, manifest: &EngineManifest) -> Result<bool, String> {
    let macos = host_macos_dir(app);
    let vendor = macos.join(VENDOR_HOST_EXECUTABLE);
    let branded = macos.join(&manifest.host_app_name);
    if !vendor.is_file() || branded.exists() {
        return Ok(false);
    }
    fs::rename(&vendor, &branded)
        .map_err(|e| scrub_vendor(&format!("failed to rename host executable: {e}")))?;
    Ok(true)
}

fn install_host_app(src: &Path, dest: &Path, manifest: &EngineManifest) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| scrub_vendor(&e.to_string()))?;
    }
    if dest.exists() {
        let _ = fs::remove_dir_all(dest);
    }
    copy_dir_recursive(src, dest).map_err(|e| scrub_vendor(&e.to_string()))?;
    // Fresh tree will be codesigned below — rename the vendor filename now so
    // Activity Monitor / `ps` never show it. Existing installs use an alias
    // instead (see `ensure_host_serve_alias`) so we do not rotate TCC.
    let _ = rename_vendor_host_executable(dest, manifest);
    rebrand_existing_host_app(dest, manifest)
}

/// Rebrand an already-extracted host app: Atmos name/bundle id + product icon.
///
/// **Idempotent:** skips rewrite when branding is already correct.
/// Ad-hoc **codesign** only when Info.plist identity changed — icon-only
/// updates must not rotate cdhash (macOS TCC is keyed to code identity).
pub fn rebrand_existing_host_app(dest: &Path, manifest: &EngineManifest) -> Result<(), String> {
    if !dest.is_dir() {
        return Err(scrub_vendor("host app path is not a directory"));
    }

    // Product-named spawn alias (no codesign). Safe on already-granted hosts.
    let _ = ensure_host_serve_alias(dest);

    let mut plist_dirty = false;
    let mut icon_dirty = false;
    let plist = dest.join("Contents").join("Info.plist");
    if plist.is_file() && host_plist_needs_rebrand(&plist, manifest) {
        rewrite_host_plist(&plist, manifest)?;
        plist_dirty = true;
    }
    if host_icon_needs_replace(dest) {
        apply_host_app_icon(dest)?;
        icon_dirty = true;
    }
    if clear_host_icon_catalog_name(dest) {
        icon_dirty = true;
    }

    if !plist_dirty && !icon_dirty {
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        // Re-signing drops Accessibility / Screen Recording. Only do it when
        // the bundle identity (plist) changed, never for an icon swap.
        if plist_dirty {
            let _ = Command::new("codesign")
                .args(["--force", "--deep", "-s", "-"])
                .arg(dest)
                .status();
        }
        let _ = Command::new("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
            .args(["-f"])
            .arg(dest)
            .status();
        let _ = Command::new("touch").arg(dest).status();
    }

    Ok(())
}

fn host_icon_needs_replace(dest: &Path) -> bool {
    let icon_path = dest.join("Contents").join("Resources").join("AppIcon.icns");
    match fs::read(&icon_path) {
        Ok(bytes) => bytes.as_slice() != HOST_APP_ICON_ICNS,
        Err(_) => true,
    }
}

fn host_plist_needs_rebrand(plist: &Path, manifest: &EngineManifest) -> bool {
    // plutil -extract returns the string value; treat any mismatch/missing as dirty.
    let checks = [
        ("CFBundleIdentifier", manifest.host_bundle_id.as_str()),
        ("CFBundleDisplayName", manifest.host_app_name.as_str()),
        ("CFBundleName", manifest.host_app_name.as_str()),
    ];
    for (key, expected) in checks {
        let output = Command::new("plutil")
            .args(["-extract", key, "raw", "-o", "-"])
            .arg(plist)
            .output();
        match output {
            Ok(o) if o.status.success() => {
                let got = String::from_utf8_lossy(&o.stdout).trim().to_string();
                if got != expected {
                    return true;
                }
            }
            _ => return true,
        }
    }
    false
}

/// Drop `CFBundleIconName` when the host has no Assets.car.
///
/// Existing installs kept IconName=AppIcon from the vendor plist. LaunchServices
/// then served the pre-planet concentric plate from its catalog cache even after
/// AppIcon.icns was replaced. Not an identity change — do not codesign.
fn clear_host_icon_catalog_name(dest: &Path) -> bool {
    let assets = dest.join("Contents").join("Resources").join("Assets.car");
    if assets.exists() {
        return false;
    }
    let plist = dest.join("Contents").join("Info.plist");
    if !plist.is_file() {
        return false;
    }
    let present = Command::new("plutil")
        .args(["-extract", "CFBundleIconName", "raw", "-o", "-"])
        .arg(&plist)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if !present {
        return false;
    }
    Command::new("plutil")
        .args(["-remove", "CFBundleIconName"])
        .arg(&plist)
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn apply_host_app_icon(dest: &Path) -> Result<(), String> {
    let resources = dest.join("Contents").join("Resources");
    fs::create_dir_all(&resources).map_err(|e| scrub_vendor(&e.to_string()))?;
    // Vendor package uses CFBundleIconFile = AppIcon → AppIcon.icns
    let icon_path = resources.join("AppIcon.icns");
    fs::write(&icon_path, HOST_APP_ICON_ICNS).map_err(|e| scrub_vendor(&e.to_string()))?;
    Ok(())
}

fn rewrite_host_plist(plist: &Path, manifest: &EngineManifest) -> Result<(), String> {
    // Prefer plutil for binary/xml plist; fall back to text replace.
    let sets = [
        (
            "CFBundleDisplayName",
            manifest.host_app_name.as_str(),
        ),
        ("CFBundleName", manifest.host_app_name.as_str()),
        ("CFBundleExecutable", manifest.host_app_name.as_str()),
        ("CFBundleIdentifier", manifest.host_bundle_id.as_str()),
        ("CFBundleIconFile", "AppIcon"),
        (
            "NSScreenCaptureUsageDescription",
            "Atmos Desktop Use captures the screen so agents can see and help with the interface you ask them to control.",
        ),
        (
            "NSAppleEventsUsageDescription",
            "Atmos Desktop Use uses Automation only when a requested action needs to communicate with another app.",
        ),
    ];
    for (key, value) in sets {
        let status = Command::new("plutil")
            .args(["-replace", key, "-string", value])
            .arg(plist)
            .status();
        if status.map(|s| !s.success()).unwrap_or(true) {
            // Key may be missing on some plists — try -insert then.
            let _ = Command::new("plutil")
                .args(["-insert", key, "-string", value])
                .arg(plist)
                .status();
        }
    }
    // No Assets.car in the rebranded host — IconName would keep a stale
    // vendor catalog icon in Activity Monitor / System Settings.
    let _ = Command::new("plutil")
        .args(["-remove", "CFBundleIconName"])
        .arg(plist)
        .status();
    Ok(())
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> io::Result<()> {
    fs::create_dir_all(dest)?;
    for ent in fs::read_dir(src)? {
        let ent = ent?;
        let ty = ent.file_type()?;
        let from = ent.path();
        let to = dest.join(ent.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else if ty.is_file() {
            fs::copy(&from, &to)?;
            #[cfg(unix)]
            {
                let meta = fs::metadata(&from)?;
                fs::set_permissions(&to, meta.permissions())?;
            }
        }
    }
    Ok(())
}

fn chrono_lite_now() -> String {
    // Avoid chrono dep; RFC3339-ish UTC via system date if available.
    // `-u` is required so the trailing `Z` is truthful (not local wall time).
    Command::new("date")
        .args(["-u", "+%Y-%m-%dT%H:%M:%SZ"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "unknown".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine_manifest::EngineManifest;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn host_app_icon_asset_is_nonempty_icns() {
        assert!(HOST_APP_ICON_ICNS.len() > 1000);
        // icns magic
        assert_eq!(&HOST_APP_ICON_ICNS[0..4], b"icns");
    }

    #[test]
    fn host_serve_alias_uses_product_name() {
        let dir = tempdir().unwrap();
        let app = dir.path().join("Atmos Desktop Use.app");
        let macos = app.join("Contents").join("MacOS");
        fs::create_dir_all(&macos).unwrap();
        fs::write(macos.join(VENDOR_HOST_EXECUTABLE), b"#!/bin/sh\n").unwrap();

        assert!(ensure_host_serve_alias(&app).unwrap());
        let branded = macos.join("Atmos Desktop Use");
        assert!(branded.is_file());
        let resolved = resolve_host_serve_bin(&app).expect("resolved");
        assert_eq!(
            resolved.file_name().and_then(|s| s.to_str()),
            Some("Atmos Desktop Use")
        );
        assert!(!ensure_host_serve_alias(&app).unwrap());
        assert!(!crate::strings::contains_vendor_brand(
            resolved.file_name().and_then(|s| s.to_str()).unwrap_or(""),
        ));
    }

    #[test]
    fn host_serve_alias_shims_large_vendor_binary() {
        let dir = tempdir().unwrap();
        let app = dir.path().join("Atmos Desktop Use.app");
        let macos = app.join("Contents").join("MacOS");
        fs::create_dir_all(&macos).unwrap();
        fs::write(macos.join(VENDOR_HOST_EXECUTABLE), vec![0u8; 80 * 1024]).unwrap();

        assert!(ensure_host_serve_alias(&app).unwrap());
        let branded = macos.join("Atmos Desktop Use");
        assert_eq!(fs::metadata(&branded).unwrap().len(), 80 * 1024);
        let shim = fs::read_to_string(macos.join(VENDOR_HOST_EXECUTABLE)).unwrap();
        assert!(shim.starts_with("#!/bin/sh"));
        assert!(shim.contains("Atmos Desktop Use"));
        assert!(!crate::strings::contains_vendor_brand(&shim));
        assert!(!ensure_host_serve_alias(&app).unwrap());
    }

    #[test]
    fn rename_vendor_host_executable_on_fresh_copy() {
        let dir = tempdir().unwrap();
        let app = dir.path().join("Atmos Desktop Use.app");
        let macos = app.join("Contents").join("MacOS");
        fs::create_dir_all(&macos).unwrap();
        fs::write(macos.join(VENDOR_HOST_EXECUTABLE), b"bin").unwrap();
        let manifest = EngineManifest::embedded().unwrap();
        assert!(rename_vendor_host_executable(&app, &manifest).unwrap());
        assert!(!macos.join(VENDOR_HOST_EXECUTABLE).exists());
        assert!(macos.join(&manifest.host_app_name).is_file());
        assert!(!rename_vendor_host_executable(&app, &manifest).unwrap());
    }

    #[test]
    fn vendor_pgrep_pattern_points_at_host_macos() {
        let app = PathBuf::from("/tmp/Atmos Desktop Use.app");
        let pat = vendor_host_serve_pgrep_pattern(&app);
        assert!(pat.contains("Atmos Desktop Use.app/Contents/MacOS/"));
        assert!(pat.ends_with(" serve"));
    }

    #[test]
    fn apply_host_app_icon_writes_appicon() {
        let dir = tempdir().unwrap();
        let app = dir.path().join("Atmos Desktop Use.app");
        let resources = app.join("Contents").join("Resources");
        fs::create_dir_all(&resources).unwrap();
        // Pretend vendor icon existed
        fs::write(resources.join("AppIcon.icns"), b"vendor-icon").unwrap();
        assert!(host_icon_needs_replace(&app));
        apply_host_app_icon(&app).unwrap();
        let written = fs::read(resources.join("AppIcon.icns")).unwrap();
        assert_eq!(written, HOST_APP_ICON_ICNS);
        assert!(!host_icon_needs_replace(&app));
    }

    #[test]
    fn clear_host_icon_catalog_name_strips_stale_iconname() {
        if !cfg!(target_os = "macos") {
            return;
        }
        let dir = tempdir().unwrap();
        let app = dir.path().join("Atmos Desktop Use.app");
        let contents = app.join("Contents");
        fs::create_dir_all(contents.join("Resources")).unwrap();
        let plist = contents.join("Info.plist");
        fs::write(
            &plist,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleIconName</key><string>AppIcon</string>
</dict></plist>
"#,
        )
        .unwrap();
        assert!(clear_host_icon_catalog_name(&app));
        let xml = fs::read_to_string(&plist).unwrap();
        assert!(!xml.contains("CFBundleIconName"));
        assert!(xml.contains("CFBundleIconFile"));
        assert!(!clear_host_icon_catalog_name(&app));
    }

    #[test]
    fn install_from_local_tarball_fixture() {
        let dir = tempdir().unwrap();
        let data = dir.path().join("data");
        let engine_bin = data.join("bin").join("atmos-desktop-control");

        // Build a tiny tar.gz with fake engine binary.
        let staging = dir.path().join("stage/cua-driver-rs-0.19.2-darwin-arm64");
        fs::create_dir_all(&staging).unwrap();
        let mut f = File::create(staging.join("cua-driver")).unwrap();
        f.write_all(b"#!/bin/sh\necho fixture-engine\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(
                staging.join("cua-driver"),
                fs::Permissions::from_mode(0o755),
            )
            .unwrap();
        }

        let tar_path = dir.path().join("pkg.tar.gz");
        // tar czf
        let status = Command::new("tar")
            .args(["-czf"])
            .arg(&tar_path)
            .arg("-C")
            .arg(dir.path().join("stage"))
            .arg("cua-driver-rs-0.19.2-darwin-arm64")
            .status()
            .unwrap();
        assert!(status.success());

        let mut hasher = Sha256::new();
        let bytes = fs::read(&tar_path).unwrap();
        hasher.update(&bytes);
        let sha = hex::encode(hasher.finalize());

        let manifest = EngineManifest::embedded().unwrap();
        let entry = BinaryEntry {
            platform: "test".into(),
            url: "file://fixture".into(),
            sha256: sha,
            archive_kind: "tar_gz".into(),
            engine_inner_path: "cua-driver-rs-0.19.2-darwin-arm64/cua-driver".into(),
            host_app_inner_path: None,
        };

        let layout = install_from_archive(&tar_path, &entry, &data, &engine_bin, &manifest)
            .expect("install");
        assert!(layout.engine_bin.is_file());
        assert_eq!(
            fs::read(&layout.engine_bin).unwrap(),
            b"#!/bin/sh\necho fixture-engine\n"
        );
    }
}
