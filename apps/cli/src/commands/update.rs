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
const ATMOS_DOWNLOAD_BASE_URL: &str = "https://install.atmos.land";
const UPDATE_MANIFEST_ENV: &str = "ATMOS_CLI_UPDATE_MANIFEST_URL";
const CLI_RELEASE_TAG_PREFIX: &str = "cli-v";
const ALT_CLI_RELEASE_TAG_PREFIX: &str = "atmos-cli-v";
const CHECK_INTERVAL_HOURS: i64 = 24;
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Args)]
pub struct UpdateArgs {
    /// Check for updates without installing.
    #[arg(long, default_value_t = false)]
    pub check: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    draft: bool,
    prerelease: bool,
    #[serde(default)]
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Clone, Deserialize)]
struct CliUpdateManifest {
    version: Option<String>,
    tag: String,
    #[serde(default)]
    release_url: Option<String>,
    #[serde(default)]
    assets: Vec<CliUpdateManifestAsset>,
}

#[derive(Debug, Clone, Deserialize)]
struct CliUpdateManifestAsset {
    name: String,
    #[serde(default)]
    target: Option<String>,
    #[serde(default)]
    url: Option<String>,
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
    let latest = fetch_latest_cli_release().await?;
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
            let latest = tokio::time::timeout(Duration::from_secs(2), fetch_latest_cli_release())
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

async fn fetch_latest_cli_release() -> Result<LatestRelease, String> {
    match fetch_latest_cli_release_from_manifest().await {
        Ok(release) => Ok(release),
        Err(manifest_error) => match fetch_latest_cli_release_from_api().await {
            Ok(release) => Ok(release),
            Err(api_error) => match fetch_latest_cli_release_from_atom(GITHUB_RELEASES_ATOM_URL)
                .await
            {
                Ok(release) => Ok(release),
                Err(releases_atom_error) => fetch_latest_cli_release_from_atom(GITHUB_TAGS_ATOM_URL)
                    .await
                    .map_err(|tags_atom_error| {
                        format!(
                            "{}; GitHub API fallback failed: {}; releases feed fallback failed: {}; tags feed fallback failed: {}",
                            manifest_error, api_error, releases_atom_error, tags_atom_error
                        )
                    }),
            },
        },
    }
}

async fn fetch_latest_cli_release_from_manifest() -> Result<LatestRelease, String> {
    let manifest_url = update_manifest_url();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("atmos-cli")
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {}", error))?;
    let manifest = client
        .get(&manifest_url)
        .send()
        .await
        .map_err(|error| format!("Failed to check Atmos update manifest: {}", error))?
        .error_for_status()
        .map_err(|error| format!("Failed to check Atmos update manifest: {}", error))?
        .json::<CliUpdateManifest>()
        .await
        .map_err(|error| format!("Failed to parse Atmos update manifest: {}", error))?;

    latest_release_from_manifest(manifest)
}

async fn fetch_latest_cli_release_from_api() -> Result<LatestRelease, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("atmos-cli")
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {}", error))?;
    let releases = client
        .get(format!("{}?per_page=100", GITHUB_RELEASES_URL))
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
            !release.draft && !release.prerelease && is_cli_release_tag(&release.tag_name)
        })
        .map(|release| {
            let asset_url = target.as_ref().and_then(|target| {
                release
                    .assets
                    .iter()
                    .find(|asset| is_cli_asset_for_target(&asset.name, target))
                    .map(|asset| asset.browser_download_url.clone())
            });
            LatestRelease {
                version: release_version(&release.tag_name),
                tag: release.tag_name,
                url: release.html_url,
                asset_url,
            }
        })
        .ok_or_else(|| "No published Atmos CLI release was found".to_string())
}

async fn fetch_latest_cli_release_from_atom(feed_url: &str) -> Result<LatestRelease, String> {
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
    let tag = find_latest_cli_tag_in_atom(&feed)
        .ok_or_else(|| "No cli-v release was found in Atmos releases feed".to_string())?;
    Ok(LatestRelease {
        version: release_version(&tag),
        url: format!("https://github.com/AruNi-01/atmos/releases/tag/{}", tag),
        tag,
        asset_url: None,
    })
}

async fn download_and_install_cli(
    asset_url: &str,
    target: &str,
    installed_path: &Path,
) -> Result<(), String> {
    ensure_https_download_url(asset_url)?;
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

    let source = find_extracted_cli_binary(&temp_root, target)
        .ok_or_else(|| format!("Update archive did not contain {}", binary_name()))?;
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
    Err(
        "The latest CLI release does not include a compatible binary asset for this platform."
            .to_string(),
    )
}

fn current_target_triple() -> Result<String, String> {
    target_triple_for(std::env::consts::OS, std::env::consts::ARCH).map(str::to_string)
}

fn target_triple_for(os: &str, arch: &str) -> Result<&'static str, String> {
    Ok(match (os, arch) {
        ("macos", "aarch64") => "aarch64-apple-darwin",
        ("macos", "x86_64") => "x86_64-apple-darwin",
        ("linux", "aarch64") => "aarch64-unknown-linux-gnu",
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
        ("windows", "x86_64") => "x86_64-pc-windows-msvc",
        (os, arch) => {
            return Err(format!(
                "Atmos updates are not available for {}-{}",
                os, arch
            ))
        }
    })
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

fn is_cli_asset_for_target(name: &str, target: &str) -> bool {
    let normalized = name.to_ascii_lowercase();
    normalized.contains("atmos")
        && normalized.contains("cli")
        && normalized.contains(&target.to_ascii_lowercase())
        && (normalized.ends_with(".tar.gz") || normalized.ends_with(".tgz"))
}

fn latest_release_from_manifest(manifest: CliUpdateManifest) -> Result<LatestRelease, String> {
    if !is_stable_cli_release_tag(&manifest.tag) {
        return Err(format!(
            "Atmos update manifest does not describe a stable CLI release: {}",
            manifest.tag
        ));
    }

    let target = current_target_triple().ok();
    let asset_url = if let Some(target) = target.as_ref() {
        manifest
            .assets
            .iter()
            .find(|asset| {
                asset.target.as_deref() == Some(target)
                    || is_cli_asset_for_target(&asset.name, target)
            })
            .map(|asset| manifest_asset_url(asset, &manifest.tag))
            .transpose()?
    } else {
        None
    };

    Ok(LatestRelease {
        version: manifest
            .version
            .unwrap_or_else(|| release_version(&manifest.tag)),
        tag: manifest.tag.clone(),
        url: manifest.release_url.unwrap_or_else(|| {
            format!(
                "https://github.com/AruNi-01/atmos/releases/tag/{}",
                manifest.tag
            )
        }),
        asset_url,
    })
}

fn manifest_asset_url(asset: &CliUpdateManifestAsset, tag: &str) -> Result<String, String> {
    manifest_asset_url_with_base(asset, tag, &download_base_url())
}

fn manifest_asset_url_with_base(
    asset: &CliUpdateManifestAsset,
    tag: &str,
    base: &str,
) -> Result<String, String> {
    if let Some(url) = asset
        .url
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        if is_absolute_url(url) {
            ensure_https_download_url(url)?;
            return Ok(url.to_string());
        }
        let resolved = if url.starts_with('/') {
            format!("{}{}", base.trim_end_matches('/'), url)
        } else {
            format!("{}/{}", base.trim_end_matches('/'), url)
        };
        ensure_https_download_url(&resolved)?;
        return Ok(resolved);
    }
    let resolved = format!("{}/cli/{}/{}", base.trim_end_matches('/'), tag, asset.name);
    ensure_https_download_url(&resolved)?;
    Ok(resolved)
}

fn update_manifest_url() -> String {
    std::env::var(UPDATE_MANIFEST_ENV)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| format!("{}/cli/latest.json", download_base_url()))
}

fn download_base_url() -> String {
    std::env::var("ATMOS_DOWNLOAD_BASE_URL")
        .ok()
        .map(|value| value.trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| ATMOS_DOWNLOAD_BASE_URL.to_string())
}

fn is_absolute_url(value: &str) -> bool {
    value.contains("://")
}

fn ensure_https_download_url(url: &str) -> Result<(), String> {
    if url
        .get(..8)
        .is_some_and(|scheme| scheme.eq_ignore_ascii_case("https://"))
    {
        return Ok(());
    }
    Err(format!("Atmos CLI asset downloads must use HTTPS: {}", url))
}

fn find_extracted_cli_binary(root: &Path, target: &str) -> Option<PathBuf> {
    let direct_candidates = [
        root.join(binary_name()),
        root.join("bin").join(binary_name()),
        root.join(format!("atmos-cli-{}", target))
            .join(binary_name()),
        root.join(format!("atmos-cli-{}", target))
            .join("bin")
            .join(binary_name()),
    ];
    for candidate in direct_candidates {
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    find_file_named(root, binary_name(), 4)
}

fn find_file_named(dir: &Path, file_name: &str, depth: usize) -> Option<PathBuf> {
    if depth == 0 {
        return None;
    }
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.file_name().and_then(|name| name.to_str()) == Some(file_name) {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_file_named(&path, file_name, depth - 1) {
                return Some(found);
            }
        }
    }
    None
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
    tag.strip_prefix(CLI_RELEASE_TAG_PREFIX)
        .or_else(|| tag.strip_prefix(ALT_CLI_RELEASE_TAG_PREFIX))
        .or_else(|| tag.strip_prefix('v'))
        .unwrap_or(tag)
        .to_string()
}

fn is_cli_release_tag(tag: &str) -> bool {
    tag.starts_with(CLI_RELEASE_TAG_PREFIX) || tag.starts_with(ALT_CLI_RELEASE_TAG_PREFIX)
}

fn is_stable_cli_release_tag(tag: &str) -> bool {
    if !is_cli_release_tag(tag) {
        return false;
    }
    let version = release_version(tag);
    !version.contains('-')
}

fn find_latest_cli_tag_in_atom(feed: &str) -> Option<String> {
    for entry in feed.split("<entry").skip(1) {
        if let Some(tag) = extract_between(entry, "/releases/tag/", "\"")
            .or_else(|| extract_between(entry, "<title>", "</title>"))
        {
            let tag = tag.trim().to_string();
            if is_stable_cli_release_tag(&tag) {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_asset_url_resolves_relative_paths() {
        let asset = CliUpdateManifestAsset {
            name: "atmos-cli-aarch64-apple-darwin.tar.gz".to_string(),
            target: Some("aarch64-apple-darwin".to_string()),
            url: Some("cli/cli-v0.2.1/atmos-cli-aarch64-apple-darwin.tar.gz".to_string()),
        };

        assert_eq!(
            manifest_asset_url_with_base(&asset, "cli-v0.2.1", "https://install.atmos.land")
                .unwrap(),
            "https://install.atmos.land/cli/cli-v0.2.1/atmos-cli-aarch64-apple-darwin.tar.gz"
        );
    }

    #[test]
    fn manifest_without_asset_url_uses_tag_path() {
        let asset = CliUpdateManifestAsset {
            name: "atmos-cli-x86_64-unknown-linux-gnu.tar.gz".to_string(),
            target: Some("x86_64-unknown-linux-gnu".to_string()),
            url: None,
        };

        assert_eq!(
            manifest_asset_url_with_base(&asset, "cli-v0.2.1", "https://install.atmos.land")
                .unwrap(),
            "https://install.atmos.land/cli/cli-v0.2.1/atmos-cli-x86_64-unknown-linux-gnu.tar.gz"
        );
    }

    #[test]
    fn manifest_asset_url_rejects_insecure_http_urls() {
        let asset = CliUpdateManifestAsset {
            name: "atmos-cli-x86_64-unknown-linux-gnu.tar.gz".to_string(),
            target: Some("x86_64-unknown-linux-gnu".to_string()),
            url: Some("http://example.com/atmos-cli-x86_64-unknown-linux-gnu.tar.gz".to_string()),
        };

        assert!(
            manifest_asset_url_with_base(&asset, "cli-v0.2.1", "https://install.atmos.land")
                .is_err()
        );
    }

    #[test]
    fn manifest_asset_url_rejects_insecure_relative_base() {
        let asset = CliUpdateManifestAsset {
            name: "atmos-cli-x86_64-unknown-linux-gnu.tar.gz".to_string(),
            target: Some("x86_64-unknown-linux-gnu".to_string()),
            url: Some("cli/cli-v0.2.1/atmos-cli-x86_64-unknown-linux-gnu.tar.gz".to_string()),
        };

        assert!(
            manifest_asset_url_with_base(&asset, "cli-v0.2.1", "http://install.atmos.land")
                .is_err()
        );
    }

    #[test]
    fn linux_aarch64_target_is_supported() {
        assert_eq!(
            target_triple_for("linux", "aarch64").unwrap(),
            "aarch64-unknown-linux-gnu"
        );
    }
}
