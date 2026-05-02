use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use chrono::{DateTime, Utc};
use clap::Args;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const GITHUB_RELEASES_URL: &str = "https://api.github.com/repos/AruNi-01/atmos/releases";
const GITHUB_RELEASES_ATOM_URL: &str = "https://github.com/AruNi-01/atmos/releases.atom";
const GITHUB_TAGS_ATOM_URL: &str = "https://github.com/AruNi-01/atmos/tags.atom";
const GITHUB_RELEASE_DOWNLOAD_BASE: &str = "https://github.com/AruNi-01/atmos/releases/download";
const CLI_CARGO_TOML_URL: &str =
    "https://raw.githubusercontent.com/AruNi-01/atmos/main/apps/cli/Cargo.toml";
const GITHUB_REPO_URL: &str = "https://github.com/AruNi-01/atmos";
const CHECK_INTERVAL_HOURS: i64 = 24;
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Args)]
pub struct UpdateArgs {
    #[arg(long, default_value_t = false)]
    pub check: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    draft: bool,
    prerelease: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UpdateCheckCache {
    checked_at: String,
    latest_version: String,
    latest_tag: String,
    release_url: String,
}

#[derive(Debug, Clone)]
struct LatestRelease {
    version: String,
    tag: String,
    url: String,
    asset_url: Option<String>,
}

pub async fn execute(args: UpdateArgs) -> Result<Value, String> {
    let latest = fetch_latest_local_release().await?;
    write_update_cache(&latest);
    let update_available = version_gt(&latest.version, CURRENT_VERSION);

    if args.check {
        return Ok(json!({
            "ok": true,
            "current_version": CURRENT_VERSION,
            "latest_version": latest.version,
            "latest_tag": latest.tag,
            "release_url": latest.url,
            "update_available": update_available,
        }));
    }

    if !update_available {
        return Ok(json!({
            "ok": true,
            "action": "already_up_to_date",
            "current_version": CURRENT_VERSION,
            "latest_version": latest.version,
            "latest_tag": latest.tag,
            "release_url": latest.url,
        }));
    }

    let installed_path = installed_cli_path()?;
    let install_method = if let Some(asset_url) = latest.asset_url {
        let target = current_target_triple()?;
        download_and_install_cli(&asset_url, &target, &installed_path).await?;
        "release_asset"
    } else {
        install_from_git().await?;
        "cargo_install_git"
    };

    Ok(json!({
        "ok": true,
        "action": "updated",
        "from_version": CURRENT_VERSION,
        "to_version": latest.version,
        "latest_tag": latest.tag,
        "installed_path": installed_path.to_string_lossy(),
        "install_method": install_method,
    }))
}

pub async fn update_hint_if_needed() -> Option<String> {
    if std::env::var_os("ATMOS_NO_UPDATE_CHECK").is_some() {
        return None;
    }

    let latest = match read_fresh_update_cache() {
        Some(cache) => LatestRelease {
            version: cache.latest_version,
            tag: cache.latest_tag,
            url: cache.release_url,
            asset_url: None,
        },
        None => {
            let latest = tokio::time::timeout(Duration::from_secs(2), fetch_latest_local_release())
                .await
                .ok()?
                .ok()?;
            write_update_cache(&latest);
            latest
        }
    };

    if !version_gt(&latest.version, CURRENT_VERSION) {
        return None;
    }

    Some(format!(
        "\x1b[32mA new Atmos CLI version is available: {} -> {}. Run `atmos update` to update.\x1b[0m",
        CURRENT_VERSION, latest.version
    ))
}

async fn fetch_latest_local_release() -> Result<LatestRelease, String> {
    match fetch_latest_local_release_from_api().await {
        Ok(release) => Ok(release),
        Err(api_error) => {
            match fetch_latest_local_release_from_atom(GITHUB_RELEASES_ATOM_URL).await {
                Ok(release) => Ok(release),
                Err(releases_atom_error) => match fetch_latest_local_release_from_atom(
                    GITHUB_TAGS_ATOM_URL,
                )
                .await
                {
                    Ok(release) => Ok(release),
                    Err(tags_atom_error) => fetch_latest_cli_version_from_main()
                        .await
                        .map_err(|main_error| {
                            format!(
                                "{}; releases feed fallback failed: {}; tags feed fallback failed: {}; main fallback failed: {}",
                                api_error, releases_atom_error, tags_atom_error, main_error
                            )
                        }),
                },
            }
        }
    }
}

async fn fetch_latest_local_release_from_api() -> Result<LatestRelease, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("atmos-cli")
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {}", error))?;
    let releases = client
        .get(format!("{}?per_page=20", GITHUB_RELEASES_URL))
        .send()
        .await
        .map_err(|error| format!("Failed to check Atmos releases: {}", error))?
        .error_for_status()
        .map_err(|error| format!("Failed to check Atmos releases: {}", error))?
        .json::<Vec<GithubRelease>>()
        .await
        .map_err(|error| format!("Failed to parse Atmos releases: {}", error))?;

    let target = current_target_triple().ok();
    releases
        .into_iter()
        .find(|release| {
            !release.draft && !release.prerelease && release.tag_name.starts_with("local-v")
        })
        .map(|release| {
            let asset_url = target
                .as_ref()
                .map(|target| local_runtime_asset_url(&release.tag_name, target));
            LatestRelease {
                version: release_version(&release.tag_name),
                tag: release.tag_name,
                url: release.html_url,
                asset_url,
            }
        })
        .ok_or_else(|| "No published Atmos local runtime release was found".to_string())
}

async fn fetch_latest_local_release_from_atom(feed_url: &str) -> Result<LatestRelease, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("atmos-cli")
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {}", error))?;
    let feed = client
        .get(feed_url)
        .send()
        .await
        .map_err(|error| format!("Failed to check Atmos releases feed: {}", error))?
        .error_for_status()
        .map_err(|error| format!("Failed to check Atmos releases feed: {}", error))?
        .text()
        .await
        .map_err(|error| format!("Failed to read Atmos releases feed: {}", error))?;
    let tag = find_latest_local_tag_in_atom(&feed)
        .ok_or_else(|| "No local-v release was found in Atmos releases feed".to_string())?;
    let target = current_target_triple().ok();
    let asset_url = target
        .as_ref()
        .map(|target| local_runtime_asset_url(&tag, target));
    Ok(LatestRelease {
        version: release_version(&tag),
        url: format!("https://github.com/AruNi-01/atmos/releases/tag/{}", tag),
        tag,
        asset_url,
    })
}

async fn fetch_latest_cli_version_from_main() -> Result<LatestRelease, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("atmos-cli")
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {}", error))?;
    let cargo_toml = client
        .get(CLI_CARGO_TOML_URL)
        .send()
        .await
        .map_err(|error| format!("Failed to check Atmos CLI version: {}", error))?
        .error_for_status()
        .map_err(|error| format!("Failed to check Atmos CLI version: {}", error))?
        .text()
        .await
        .map_err(|error| format!("Failed to read Atmos CLI version: {}", error))?;
    let version = parse_cargo_package_version(&cargo_toml)
        .ok_or_else(|| "Could not find package version in apps/cli/Cargo.toml".to_string())?;
    Ok(LatestRelease {
        version,
        tag: "main".to_string(),
        url: GITHUB_REPO_URL.to_string(),
        asset_url: None,
    })
}

async fn download_and_install_cli(
    asset_url: &str,
    target: &str,
    installed_path: &Path,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .user_agent("atmos-cli")
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {}", error))?;
    let bytes = client
        .get(asset_url)
        .send()
        .await
        .map_err(|error| format!("Failed to download Atmos update: {}", error))?
        .error_for_status()
        .map_err(|error| format!("Failed to download Atmos update: {}", error))?
        .bytes()
        .await
        .map_err(|error| format!("Failed to read Atmos update: {}", error))?;

    let temp_root = std::env::temp_dir().join(format!(
        "atmos-update-{}-{}",
        std::process::id(),
        Utc::now().timestamp_millis()
    ));
    fs::create_dir_all(&temp_root)
        .map_err(|error| format!("Failed to create {}: {}", temp_root.display(), error))?;
    let archive_path = temp_root.join("runtime.tar.gz");
    fs::write(&archive_path, &bytes)
        .map_err(|error| format!("Failed to write {}: {}", archive_path.display(), error))?;

    let status = Command::new("tar")
        .args(["-xzf"])
        .arg(&archive_path)
        .arg("-C")
        .arg(&temp_root)
        .status()
        .map_err(|error| format!("Failed to run tar: {}", error))?;
    if !status.success() {
        return Err("Failed to extract Atmos update archive".to_string());
    }

    let source = temp_root
        .join(format!("atmos-local-runtime-{}", target))
        .join("atmos-runtime")
        .join("bin")
        .join(binary_name());
    if !source.is_file() {
        return Err(format!(
            "Update archive did not contain {}",
            source.display()
        ));
    }

    let parent = installed_path.parent().ok_or_else(|| {
        format!(
            "Cannot determine install directory for {}",
            installed_path.display()
        )
    })?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create {}: {}", parent.display(), error))?;
    let staged_path = installed_path.with_extension("new");
    fs::copy(&source, &staged_path).map_err(|error| {
        format!(
            "Failed to copy {} to {}: {}",
            source.display(),
            staged_path.display(),
            error
        )
    })?;
    set_executable_if_needed(&staged_path)?;
    fs::rename(&staged_path, installed_path).map_err(|error| {
        format!(
            "Failed to replace {} with {}: {}",
            installed_path.display(),
            staged_path.display(),
            error
        )
    })?;
    let _ = fs::remove_dir_all(&temp_root);
    Ok(())
}

async fn install_from_git() -> Result<(), String> {
    let status = Command::new("cargo")
        .args([
            "install",
            "--git",
            GITHUB_REPO_URL,
            "--package",
            "atmos",
            "--bin",
            "atmos",
            "--locked",
        ])
        .status()
        .map_err(|error| format!("Failed to run cargo install: {}", error))?;
    if !status.success() {
        return Err("cargo install failed while updating Atmos CLI".to_string());
    }
    Ok(())
}

fn current_target_triple() -> Result<String, String> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Ok("aarch64-apple-darwin".to_string()),
        ("macos", "x86_64") => Ok("x86_64-apple-darwin".to_string()),
        ("linux", "x86_64") => Ok("x86_64-unknown-linux-gnu".to_string()),
        (os, arch) => Err(format!(
            "Atmos updates are not available for {}-{}",
            os, arch
        )),
    }
}

fn installed_cli_path() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|home| home.join(".atmos").join("bin").join(binary_name()))
        .ok_or_else(|| "Cannot determine home directory".to_string())
}

fn binary_name() -> &'static str {
    #[cfg(windows)]
    {
        "atmos.exe"
    }
    #[cfg(not(windows))]
    {
        "atmos"
    }
}

fn set_executable_if_needed(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let metadata = fs::metadata(path)
            .map_err(|error| format!("Failed to stat {}: {}", path.display(), error))?;
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions)
            .map_err(|error| format!("Failed to chmod {}: {}", path.display(), error))?;
    }

    Ok(())
}

fn cache_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".atmos").join("cli").join("update-check.json"))
}

fn read_fresh_update_cache() -> Option<UpdateCheckCache> {
    let path = cache_path()?;
    let content = fs::read_to_string(path).ok()?;
    let cache = serde_json::from_str::<UpdateCheckCache>(&content).ok()?;
    let checked_at = DateTime::parse_from_rfc3339(&cache.checked_at)
        .ok()?
        .with_timezone(&Utc);
    if Utc::now().signed_duration_since(checked_at).num_hours() < CHECK_INTERVAL_HOURS {
        return Some(cache);
    }
    None
}

fn write_update_cache(latest: &LatestRelease) {
    let Some(path) = cache_path() else {
        return;
    };
    let Some(parent) = path.parent() else {
        return;
    };
    if fs::create_dir_all(parent).is_err() {
        return;
    }
    let cache = UpdateCheckCache {
        checked_at: Utc::now().to_rfc3339(),
        latest_version: latest.version.clone(),
        latest_tag: latest.tag.clone(),
        release_url: latest.url.clone(),
    };
    let Ok(content) = serde_json::to_string_pretty(&cache) else {
        return;
    };
    let _ = fs::write(path, content);
}

fn release_version(tag: &str) -> String {
    tag.strip_prefix("local-v")
        .or_else(|| tag.strip_prefix("desktop-v"))
        .or_else(|| tag.strip_prefix('v'))
        .unwrap_or(tag)
        .to_string()
}

fn local_runtime_asset_url(tag: &str, target: &str) -> String {
    format!(
        "{}/{}/atmos-local-runtime-{}.tar.gz",
        GITHUB_RELEASE_DOWNLOAD_BASE, tag, target
    )
}

fn find_latest_local_tag_in_atom(feed: &str) -> Option<String> {
    for entry in feed.split("<entry").skip(1) {
        if let Some(tag) = extract_between(entry, "/releases/tag/", "\"")
            .or_else(|| extract_between(entry, "<title>", "</title>"))
        {
            let tag = tag.trim().to_string();
            if tag.starts_with("local-v") {
                return Some(tag);
            }
        }
    }
    None
}

fn extract_between(value: &str, start: &str, end: &str) -> Option<String> {
    let start_index = value.find(start)? + start.len();
    let rest = &value[start_index..];
    let end_index = rest.find(end)?;
    Some(rest[..end_index].to_string())
}

fn parse_cargo_package_version(cargo_toml: &str) -> Option<String> {
    let mut in_package = false;
    for line in cargo_toml.lines() {
        let trimmed = line.trim();
        if trimmed == "[package]" {
            in_package = true;
            continue;
        }
        if in_package && trimmed.starts_with('[') {
            return None;
        }
        if in_package {
            let Some(value) = trimmed.strip_prefix("version") else {
                continue;
            };
            let Some(value) = value.trim_start().strip_prefix('=') else {
                continue;
            };
            let version = value.trim().trim_matches('"').trim_matches('\'');
            if !version.is_empty() {
                return Some(version.to_string());
            }
        }
    }
    None
}

fn version_gt(candidate: &str, current: &str) -> bool {
    let candidate_parts = version_parts(candidate);
    let current_parts = version_parts(current);
    for index in 0..candidate_parts.len().max(current_parts.len()) {
        let candidate_part = *candidate_parts.get(index).unwrap_or(&0);
        let current_part = *current_parts.get(index).unwrap_or(&0);
        if candidate_part != current_part {
            return candidate_part > current_part;
        }
    }
    false
}

fn version_parts(version: &str) -> Vec<u64> {
    version
        .split(['+', '-'])
        .next()
        .unwrap_or(version)
        .split('.')
        .map(|part| part.parse::<u64>().unwrap_or(0))
        .collect()
}
