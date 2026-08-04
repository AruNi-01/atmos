//! Download + install pinned control-engine packages into Atmos-managed paths.

use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::Command;

use flate2::read::GzDecoder;
use sha2::{Digest, Sha256};
use tar::Archive;

use crate::engine_manifest::{current_platform, BinaryEntry, EngineManifest};
use crate::strings::scrub_vendor;

/// Atmos product icon for the rebranded host app (replaces vendor AppIcon).
const HOST_APP_ICON_ICNS: &[u8] = include_bytes!("../assets/host-app-icon.icns");

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
        let fallback = find_named_file(
            &runtime_dir,
            if cfg!(windows) {
                "cua-driver.exe"
            } else {
                "cua-driver"
            },
        );
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
pub fn download_and_install(
    data_dir: &Path,
    engine_bin: &Path,
    force: bool,
) -> Result<InstallLayout, String> {
    let manifest = EngineManifest::embedded()?;
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
            fs::copy(&fixture, &archive_path).map_err(|e| scrub_vendor(&e.to_string()))?;
            verify_sha256(&archive_path, &entry.sha256)?;
            return install_from_archive(&archive_path, &entry, data_dir, engine_bin, &manifest);
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

    download_file(&entry.url, &archive_path)?;
    verify_sha256(&archive_path, &entry.sha256)?;
    install_from_archive(&archive_path, &entry, data_dir, engine_bin, &manifest)
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

fn download_file(url: &str, dest: &Path) -> Result<(), String> {
    // Prefer reqwest blocking when available; fall back to curl for simpler link.
    let status = Command::new("curl")
        .args(["-fsSL", "--retry", "3", "-o"])
        .arg(dest)
        .arg(url)
        .status()
        .map_err(|e| scrub_vendor(&format!("download failed: {e}")))?;
    if !status.success() {
        return Err(scrub_vendor(
            "Failed to download control engine package. Check network and retry ensure.",
        ));
    }
    Ok(())
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

fn install_host_app(src: &Path, dest: &Path, manifest: &EngineManifest) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| scrub_vendor(&e.to_string()))?;
    }
    if dest.exists() {
        let _ = fs::remove_dir_all(dest);
    }
    copy_dir_recursive(src, dest).map_err(|e| scrub_vendor(&e.to_string()))?;
    rebrand_existing_host_app(dest, manifest)
}

/// Rebrand an already-extracted host app: Atmos name/bundle id + product icon.
///
/// **Idempotent:** skips rewrite + codesign when branding is already correct so we
/// do not rotate the ad-hoc signature (macOS TCC is keyed to code identity and
/// re-signing would drop Accessibility / Screen Recording grants).
pub fn rebrand_existing_host_app(dest: &Path, manifest: &EngineManifest) -> Result<(), String> {
    if !dest.is_dir() {
        return Err(scrub_vendor("host app path is not a directory"));
    }

    let mut dirty = false;
    let plist = dest.join("Contents").join("Info.plist");
    if plist.is_file() && host_plist_needs_rebrand(&plist, manifest) {
        rewrite_host_plist(&plist, manifest)?;
        dirty = true;
    }
    if host_icon_needs_replace(dest) {
        apply_host_app_icon(dest)?;
        dirty = true;
    }

    if !dirty {
        return Ok(());
    }

    // Ad-hoc sign only when branding bits changed.
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("codesign")
            .args(["--force", "--deep", "-s", "-"])
            .arg(dest)
            .status();
        // Refresh LaunchServices name + icon (best-effort).
        let _ = Command::new("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
            .args(["-f"])
            .arg(dest)
            .status();
        // Touch bundle so Finder/Dock icon cache notices the change.
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
        ("CFBundleIdentifier", manifest.host_bundle_id.as_str()),
        ("CFBundleIconFile", "AppIcon"),
        ("CFBundleIconName", "AppIcon"),
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
    fn install_from_local_tarball_fixture() {
        let dir = tempdir().unwrap();
        let data = dir.path().join("data");
        let engine_bin = data.join("bin").join("atmos-desktop-control");

        // Build a tiny tar.gz with fake engine binary.
        let staging = dir.path().join("stage/cua-driver-rs-0.17.0-darwin-arm64");
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
            .arg("cua-driver-rs-0.17.0-darwin-arm64")
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
            engine_inner_path: "cua-driver-rs-0.17.0-darwin-arm64/cua-driver".into(),
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
