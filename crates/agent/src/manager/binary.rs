use std::fs;
use std::io::{Cursor, Read as _};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use super::manifest::{load_install_manifest, upsert_manifest_entry, with_manifest, ManifestEntry};
use super::registry::{RegistryDistribution, RegistryEntry};
use super::{AgentError, Result};
use crate::models::RegistryInstallResult;

#[derive(Debug, Clone)]
struct BinaryAsset {
    url: String,
    cmd: Option<String>,
    args: Option<Vec<String>>,
}

pub(crate) fn user_bin_dir() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AgentError::Command("cannot resolve home directory".to_string()))?;
    Ok(home.join(".local").join("bin"))
}

pub(crate) async fn install_registry_binary_agent(
    entry: RegistryEntry,
    registry_id: &str,
    force_overwrite: bool,
) -> Result<RegistryInstallResult> {
    let asset = resolve_binary_asset(&entry.distribution.binary).ok_or_else(|| {
        AgentError::Command(format!(
            "registry agent '{}' binary distribution is not yet supported for this platform",
            registry_id
        ))
    })?;

    let bin_dir = user_bin_dir()?;
    let file_name = asset
        .cmd
        .as_ref()
        .and_then(|s| s.strip_prefix("./").map(String::from))
        .unwrap_or_else(|| sanitize_registry_id(registry_id));
    let target_path = bin_dir.join(&file_name);

    if !force_overwrite && target_path.exists() {
        return Ok(RegistryInstallResult {
            registry_id: registry_id.to_string(),
            installed: false,
            install_method: "binary".to_string(),
            message: String::new(),
            needs_confirmation: Some(true),
            overwrite_message: Some(format!(
                "{} already exists at {}. Install will overwrite. Continue?",
                entry.name,
                target_path.to_string_lossy()
            )),
        });
    }

    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| AgentError::Command(format!("failed to create http client: {}", e)))?
        .get(&asset.url)
        .send()
        .await
        .map_err(|e| AgentError::Command(format!("failed to download binary: {}", e)))?;
    if !response.status().is_success() {
        return Err(AgentError::Command(format!(
            "binary download failed for {} with status {}",
            entry.name,
            response.status()
        )));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| AgentError::Command(format!("failed to read binary bytes: {}", e)))?;

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AgentError::Command(format!("failed to create bin dir: {}", e)))?;
    }

    if looks_like_archive_url(&asset.url) {
        extract_archive(&asset.url, &bytes, &bin_dir, &file_name)?;
    } else {
        fs::write(&target_path, &bytes)
            .map_err(|e| AgentError::Command(format!("failed to write binary: {}", e)))?;
    }

    #[cfg(unix)]
    {
        let mut perms = fs::metadata(&target_path)
            .map_err(|e| AgentError::Command(format!("failed to read binary metadata: {}", e)))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&target_path, perms)
            .map_err(|e| AgentError::Command(format!("failed to set binary permissions: {}", e)))?;
    }

    let installed_version = detect_binary_version(&target_path).await;

    let reg_id = registry_id.to_string();
    let bin_path_str = target_path.to_string_lossy().to_string();
    let ver = installed_version.clone();
    with_manifest(|manifest| {
        let existing_default = manifest
            .registry
            .iter()
            .find(|e| e.registry_id == reg_id && e.install_method == "binary")
            .and_then(|e| e.default_config.clone());

        upsert_manifest_entry(
            manifest,
            ManifestEntry {
                registry_id: reg_id,
                install_method: "binary".to_string(),
                binary_path: Some(bin_path_str),
                npm_package: None,
                installed_version: ver,
                default_config: existing_default,
            },
        );
        Ok(())
    })?;

    Ok(RegistryInstallResult {
        registry_id: registry_id.to_string(),
        installed: true,
        install_method: "binary".to_string(),
        message: format!(
            "Installed {} binary to {}",
            entry.name,
            target_path.to_string_lossy()
        ),
        needs_confirmation: None,
        overwrite_message: None,
    })
}

pub(crate) fn remove_registry_binary_agent(
    _entry: Option<&RegistryEntry>,
    registry_id: &str,
) -> Result<RegistryInstallResult> {
    let manifest = load_install_manifest().unwrap_or_default();
    let pos = manifest
        .registry
        .iter()
        .position(|e| e.registry_id == registry_id && e.install_method == "binary")
        .ok_or_else(|| {
            AgentError::Command(format!(
                "no managed binary install found for '{}'",
                registry_id
            ))
        })?;

    let entry = &manifest.registry[pos];
    let path = entry
        .binary_path
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| AgentError::Command("binary entry missing binary_path".to_string()))?;
    let bin_dir = user_bin_dir()?;
    if path.exists() {
        if !path.starts_with(&bin_dir) {
            return Err(AgentError::Command(format!(
                "refusing to delete path outside install dir: {}",
                path.to_string_lossy()
            )));
        }
        let relative = path.strip_prefix(&bin_dir).unwrap_or(&path);
        if let Some(top_dir) = relative.iter().next() {
            let sub_dir = bin_dir.join(top_dir);
            if sub_dir != bin_dir && sub_dir.is_dir() && relative.components().count() > 1 {
                fs::remove_dir_all(&sub_dir).map_err(|e| {
                    AgentError::Command(format!("failed to remove binary directory: {}", e))
                })?;
            } else {
                fs::remove_file(&path).map_err(|e| {
                    AgentError::Command(format!("failed to remove binary file: {}", e))
                })?;
            }
        } else {
            fs::remove_file(&path)
                .map_err(|e| AgentError::Command(format!("failed to remove binary file: {}", e)))?;
        }
    }

    let reg_id = registry_id.to_string();
    with_manifest(|manifest| {
        manifest
            .registry
            .retain(|e| !(e.registry_id == reg_id && e.install_method == "binary"));
        Ok(())
    })?;

    Ok(RegistryInstallResult {
        registry_id: registry_id.to_string(),
        installed: false,
        install_method: "binary".to_string(),
        message: format!("Removed managed binary for '{}'", registry_id),
        needs_confirmation: None,
        overwrite_message: None,
    })
}

pub(crate) fn resolve_binary_args(distribution: &RegistryDistribution) -> Option<Vec<String>> {
    resolve_binary_asset(&distribution.binary).and_then(|a| a.args)
}

fn resolve_binary_asset(binary: &Option<serde_json::Value>) -> Option<BinaryAsset> {
    let root = binary.as_ref()?;

    let platform = current_platform_key();
    if let Some(platform_val) = root.get(&platform) {
        if let Some(url) = extract_url_recursive(platform_val) {
            let cmd = platform_val
                .get("cmd")
                .and_then(|v| v.as_str())
                .map(String::from);
            let args = platform_val
                .get("args")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                });
            return Some(BinaryAsset { url, cmd, args });
        }
    }

    let current_os_keys: &[&str] = match std::env::consts::OS {
        "macos" => &["macos", "darwin", "apple-darwin"],
        "linux" => &["linux", "gnu-linux", "unknown-linux-gnu"],
        "windows" => &["windows", "win32", "pc-windows-msvc"],
        _ => &[],
    };
    for os_key in current_os_keys {
        if let Some(candidate) = root.get(*os_key) {
            if let Some(url) = extract_url_recursive(candidate) {
                let cmd = candidate
                    .get("cmd")
                    .and_then(|v| v.as_str())
                    .map(String::from);
                return Some(BinaryAsset {
                    url,
                    cmd,
                    args: None,
                });
            }
        }
    }
    extract_url_recursive(root).map(|url| BinaryAsset {
        url,
        cmd: None,
        args: None,
    })
}

fn current_platform_key() -> String {
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        o => o,
    };
    let arch = std::env::consts::ARCH;
    format!("{}-{}", os, arch)
}

fn extract_url_recursive(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(url) = map
                .get("archive")
                .or_else(|| map.get("url"))
                .and_then(|v| v.as_str())
            {
                return Some(url.to_string());
            }
            for v in map.values() {
                if let Some(url) = extract_url_recursive(v) {
                    return Some(url);
                }
            }
            None
        }
        serde_json::Value::Array(arr) => {
            for v in arr {
                if let Some(url) = extract_url_recursive(v) {
                    return Some(url);
                }
            }
            None
        }
        _ => None,
    }
}

fn sanitize_registry_id(id: &str) -> String {
    id.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect()
}

fn looks_like_archive_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.ends_with(".zip")
        || lower.ends_with(".tar.gz")
        || lower.ends_with(".tgz")
        || lower.ends_with(".tar.xz")
}

fn extract_archive(url: &str, data: &[u8], dest_dir: &Path, binary_name: &str) -> Result<()> {
    let lower = url.to_ascii_lowercase();
    let multi_file = binary_name.contains('/') || binary_name.contains('\\');

    if lower.ends_with(".zip") {
        if multi_file {
            extract_zip_all(data, dest_dir)
        } else {
            extract_zip(data, dest_dir, binary_name)
        }
    } else if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") {
        if multi_file {
            extract_tar_gz_all(data, dest_dir)
        } else {
            extract_tar_gz(data, dest_dir, binary_name)
        }
    } else {
        Err(AgentError::Command(format!(
            "unsupported archive format for url: {}",
            url
        )))
    }
}

fn is_target_binary(entry_name: &str, binary_name: &str) -> bool {
    let base = Path::new(entry_name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    base == binary_name
        || base == format!("{}.exe", binary_name)
        || base.strip_suffix(".exe").unwrap_or(base)
            == binary_name.strip_suffix(".exe").unwrap_or(binary_name)
}

fn extract_zip(data: &[u8], dest_dir: &Path, binary_name: &str) -> Result<()> {
    let reader = Cursor::new(data);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| AgentError::Command(format!("failed to open zip archive: {}", e)))?;

    let mut target_index: Option<usize> = None;
    let mut fallback_index: Option<usize> = None;

    for i in 0..archive.len() {
        let file = archive
            .by_index(i)
            .map_err(|e| AgentError::Command(format!("failed to read zip entry: {}", e)))?;
        let name = file.name().to_string();
        if file.is_dir() {
            continue;
        }
        if is_target_binary(&name, binary_name) {
            target_index = Some(i);
            break;
        }
        if fallback_index.is_none()
            && !name.ends_with('/')
            && !name.starts_with("._")
            && !name.contains("__MACOSX")
        {
            fallback_index = Some(i);
        }
    }

    let idx = target_index.or(fallback_index).ok_or_else(|| {
        AgentError::Command("zip archive contains no extractable files".to_string())
    })?;

    let mut file = archive
        .by_index(idx)
        .map_err(|e| AgentError::Command(format!("failed to read zip entry: {}", e)))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)
        .map_err(|e| AgentError::Command(format!("failed to extract zip entry: {}", e)))?;

    let out_path = dest_dir.join(binary_name);
    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            AgentError::Command(format!(
                "failed to create directory for extracted binary: {}",
                e
            ))
        })?;
    }
    fs::write(&out_path, &buf)
        .map_err(|e| AgentError::Command(format!("failed to write extracted binary: {}", e)))?;

    Ok(())
}

fn extract_tar_gz(data: &[u8], dest_dir: &Path, binary_name: &str) -> Result<()> {
    let gz = flate2::read::GzDecoder::new(Cursor::new(data));
    let mut archive = tar::Archive::new(gz);

    let entries = archive
        .entries()
        .map_err(|e| AgentError::Command(format!("failed to read tar.gz archive: {}", e)))?;

    let mut target_bytes: Option<Vec<u8>> = None;
    let mut fallback_bytes: Option<Vec<u8>> = None;

    for entry_result in entries {
        let mut entry = entry_result
            .map_err(|e| AgentError::Command(format!("failed to read tar entry: {}", e)))?;
        let path_str = entry
            .path()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        if entry.header().entry_type().is_dir() {
            continue;
        }

        let mut buf = Vec::new();
        entry
            .read_to_end(&mut buf)
            .map_err(|e| AgentError::Command(format!("failed to extract tar entry: {}", e)))?;

        if is_target_binary(&path_str, binary_name) {
            target_bytes = Some(buf);
            break;
        }

        if fallback_bytes.is_none() && !path_str.ends_with('/') {
            fallback_bytes = Some(buf);
        }
    }

    let content = target_bytes.or(fallback_bytes).ok_or_else(|| {
        AgentError::Command("tar.gz archive contains no extractable files".to_string())
    })?;

    let out_path = dest_dir.join(binary_name);
    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            AgentError::Command(format!(
                "failed to create directory for extracted binary: {}",
                e
            ))
        })?;
    }
    fs::write(&out_path, &content)
        .map_err(|e| AgentError::Command(format!("failed to write extracted binary: {}", e)))?;

    Ok(())
}

fn extract_tar_gz_all(data: &[u8], dest_dir: &Path) -> Result<()> {
    let gz = flate2::read::GzDecoder::new(Cursor::new(data));
    let mut archive = tar::Archive::new(gz);

    let entries = archive
        .entries()
        .map_err(|e| AgentError::Command(format!("failed to read tar.gz archive: {}", e)))?;

    for entry_result in entries {
        let mut entry = entry_result
            .map_err(|e| AgentError::Command(format!("failed to read tar entry: {}", e)))?;
        let path = entry
            .path()
            .map(|p| p.to_path_buf())
            .map_err(|e| AgentError::Command(format!("failed to read tar entry path: {}", e)))?;

        let out_path = dest_dir.join(&path);

        if entry.header().entry_type().is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|e| AgentError::Command(format!("failed to create directory: {}", e)))?;
            continue;
        }

        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| AgentError::Command(format!("failed to create directory: {}", e)))?;
        }

        let mut buf = Vec::new();
        entry
            .read_to_end(&mut buf)
            .map_err(|e| AgentError::Command(format!("failed to extract tar entry: {}", e)))?;

        fs::write(&out_path, &buf)
            .map_err(|e| AgentError::Command(format!("failed to write extracted file: {}", e)))?;

        #[cfg(unix)]
        {
            if let Ok(mode) = entry.header().mode() {
                let _ = fs::set_permissions(&out_path, fs::Permissions::from_mode(mode));
            }
        }
    }

    Ok(())
}

fn extract_zip_all(data: &[u8], dest_dir: &Path) -> Result<()> {
    let reader = Cursor::new(data);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| AgentError::Command(format!("failed to open zip archive: {}", e)))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| AgentError::Command(format!("failed to read zip entry: {}", e)))?;
        let name = file.name().to_string();

        if name.starts_with("._") || name.contains("__MACOSX") {
            continue;
        }

        let out_path = dest_dir.join(&name);

        if file.is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|e| AgentError::Command(format!("failed to create directory: {}", e)))?;
            continue;
        }

        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| AgentError::Command(format!("failed to create directory: {}", e)))?;
        }

        let mut buf = Vec::new();
        file.read_to_end(&mut buf)
            .map_err(|e| AgentError::Command(format!("failed to extract zip entry: {}", e)))?;

        fs::write(&out_path, &buf)
            .map_err(|e| AgentError::Command(format!("failed to write extracted file: {}", e)))?;

        #[cfg(unix)]
        {
            if let Some(mode) = file.unix_mode() {
                let _ = fs::set_permissions(&out_path, fs::Permissions::from_mode(mode));
            }
        }
    }

    Ok(())
}

/// Attempt to detect the version of an installed binary agent.
/// Tries common version flags with a per-attempt timeout to prevent hangs.
pub(crate) async fn detect_binary_version(binary_path: &Path) -> Option<String> {
    let common_flags = ["--version", "-v", "version", "-V"];
    let version_re = regex::Regex::new(r"(?i)v?(\d+\.\d+[\d.]*)").ok()?;

    for flag in common_flags {
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            tokio::process::Command::new(binary_path).arg(flag).output(),
        )
        .await;

        match result {
            Ok(Ok(output)) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let combined = format!("{} {}", stdout, stderr).trim().to_string();

                if let Some(captures) = version_re.captures(&combined) {
                    if let Some(version) = captures.get(1) {
                        return Some(version.as_str().to_string());
                    }
                }

                let first_line = combined.lines().next();
                if let Some(line) = first_line {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() && trimmed.len() < 50 {
                        return Some(trimmed.to_string());
                    }
                }
            }
            _ => continue,
        }
    }

    None
}
