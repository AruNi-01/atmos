//! Standalone Atmos CLI release discovery and installation.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use chrono::Utc;
use serde::Deserialize;
use tracing::{info, warn};

use crate::atmos_home_dir;

const CLI_RELEASES_API_URL: &str = "https://api.github.com/repos/AruNi-01/atmos/releases";
const CLI_TAGS_ATOM_URL: &str = "https://github.com/AruNi-01/atmos/tags.atom";
const CLI_UPDATE_MANIFEST_ENV: &str = "ATMOS_CLI_UPDATE_MANIFEST_URL";
const ATMOS_DOWNLOAD_BASE_URL: &str = "https://install.atmos.land";
const CLI_RELEASE_TAG_PREFIX: &str = "cli-v";
const ALT_CLI_RELEASE_TAG_PREFIX: &str = "atmos-cli-v";
const GITHUB_RELEASES_BASE_URL: &str = "https://github.com/AruNi-01/atmos/releases";

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct CliUpdateManifest {
    version: Option<String>,
    tag: String,
    #[serde(default)]
    release_url: Option<String>,
    #[serde(default)]
    assets: Vec<CliUpdateManifestAsset>,
}

#[derive(Debug, Deserialize)]
struct CliUpdateManifestAsset {
    name: String,
    #[serde(default)]
    target: Option<String>,
    #[serde(default)]
    url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct LatestCliRelease {
    pub version: String,
    pub tag: String,
    pub url: String,
    pub asset_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CliInstallResult {
    pub version: String,
    pub install_path: PathBuf,
    pub install_method: &'static str,
}

pub struct ShellConfigResult {
    pub modified: bool,
    pub config_file: Option<String>,
}

pub fn installed_cli_path() -> Option<PathBuf> {
    Some(atmos_home_dir().ok()?.join("bin").join(binary_name()))
}

pub async fn install_latest_cli() -> Result<CliInstallResult, String> {
    let release = fetch_latest_cli_release().await?;
    install_cli_release(&release).await
}

pub async fn install_cli_release(release: &LatestCliRelease) -> Result<CliInstallResult, String> {
    let cli_path =
        installed_cli_path().ok_or_else(|| "Cannot determine CLI install path".to_string())?;
    if let Some(bin_dir) = cli_path.parent() {
        fs::create_dir_all(bin_dir)
            .map_err(|error| format!("Failed to create {}: {}", bin_dir.display(), error))?;
    }

    let Some(asset_url) = release.asset_url.as_deref() else {
        return Err(
            "The latest CLI release does not include a compatible binary asset for this platform."
                .to_string(),
        );
    };

    info!("Downloading CLI from: {}", asset_url);
    download_and_install_cli(asset_url, &cli_path).await?;
    let version = read_cli_version(&cli_path).ok_or_else(|| {
        format!(
            "Failed to determine installed CLI version at {}",
            cli_path.display()
        )
    })?;

    Ok(CliInstallResult {
        version,
        install_path: cli_path,
        install_method: "release_asset",
    })
}

/// Ensure the canonical standalone CLI exists under `~/.atmos/bin`.
///
/// Desktop and local runtime both launch the same API. Keeping this startup path tied to the
/// standalone install location prevents bundled runtime resources from becoming another CLI source.
pub async fn ensure_standalone_cli_on_startup() -> Result<Option<String>, String> {
    let cli_path =
        installed_cli_path().ok_or_else(|| "Cannot determine CLI install path".to_string())?;

    if let Some(bin_dir) = cli_path.parent() {
        fs::create_dir_all(bin_dir)
            .map_err(|error| format!("Failed to create {}: {}", bin_dir.display(), error))?;
        let _ = modify_shell_config(bin_dir);
    }

    let release = fetch_latest_cli_release().await?;
    let current_version = read_cli_version(&cli_path);
    if let Some(current) = current_version.as_deref() {
        if !version_gt(&release.version, current) {
            return Ok(Some(current.to_string()));
        }
    }

    let asset_url = release
        .asset_url
        .as_deref()
        .ok_or_else(|| "No compatible CLI asset found for this platform".to_string())?;

    info!(
        "Installing standalone Atmos CLI {} to {}",
        release.version,
        cli_path.display()
    );
    download_and_install_cli(asset_url, &cli_path).await?;
    Ok(read_cli_version(&cli_path))
}

async fn download_and_install_cli(asset_url: &str, cli_path: &Path) -> Result<(), String> {
    ensure_https_download_url(asset_url)?;
    let target = current_target_triple()?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .user_agent("atmos-api")
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {}", error))?;

    let response = client
        .get(asset_url)
        .send()
        .await
        .map_err(|error| format!("Failed to download CLI: {}", error))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download CLI: HTTP {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Failed to read CLI bytes: {}", error))?;

    let temp_root = std::env::temp_dir().join(format!(
        "atmos-cli-install-{}-{}",
        std::process::id(),
        Utc::now().timestamp_millis()
    ));
    fs::create_dir_all(&temp_root)
        .map_err(|error| format!("Failed to create {}: {}", temp_root.display(), error))?;

    let result = install_cli_archive(bytes.as_ref(), &temp_root, &target, cli_path).await;
    let _ = fs::remove_dir_all(&temp_root);
    result
}

async fn install_cli_archive(
    bytes: &[u8],
    temp_root: &Path,
    target: &str,
    cli_path: &Path,
) -> Result<(), String> {
    let archive_path = temp_root.join("atmos-cli.tar.gz");
    tokio::fs::write(&archive_path, bytes)
        .await
        .map_err(|error| format!("Failed to write CLI archive: {}", error))?;

    let status = Command::new("tar")
        .args(["-xzf"])
        .arg(&archive_path)
        .arg("-C")
        .arg(temp_root)
        .status()
        .map_err(|error| format!("Failed to run tar: {}", error))?;
    if !status.success() {
        return Err("Failed to extract CLI archive".to_string());
    }

    let source = find_extracted_cli_binary(temp_root, target)
        .ok_or_else(|| format!("CLI archive did not contain {}", binary_name()))?;
    if !source.is_file() {
        return Err(format!("CLI archive did not contain {}", source.display()));
    }

    let staged_path = cli_path.with_extension("tmp");
    fs::copy(&source, &staged_path).map_err(|error| {
        format!(
            "Failed to copy {} to {}: {}",
            source.display(),
            staged_path.display(),
            error
        )
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = fs::metadata(&staged_path)
            .map_err(|error| format!("Failed to stat temp file: {}", error))?;
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&staged_path, permissions)
            .map_err(|error| format!("Failed to set executable permissions: {}", error))?;
    }

    tokio::fs::rename(&staged_path, cli_path)
        .await
        .map_err(|error| format!("Failed to replace CLI: {}", error))?;
    Ok(())
}

fn get_platform_asset_url(assets: &[GithubAsset]) -> Option<String> {
    let target_aliases = current_target_aliases().ok()?;
    assets
        .iter()
        .find(|asset| is_cli_asset_for_target_aliases(&asset.name, &target_aliases))
        .map(|asset| asset.browser_download_url.clone())
}

pub fn read_cli_version(path: &Path) -> Option<String> {
    if !path.is_file() {
        return None;
    }
    let output = Command::new(path).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .split_whitespace()
        .last()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub async fn fetch_latest_cli_release() -> Result<LatestCliRelease, String> {
    match fetch_latest_cli_release_from_manifest().await {
        Ok(release) => Ok(release),
        Err(_) => match fetch_latest_cli_release_from_api().await {
            Ok(release) => Ok(release),
            Err(_) => fetch_latest_cli_release_from_tags_feed().await,
        },
    }
}

async fn fetch_latest_cli_release_from_manifest() -> Result<LatestCliRelease, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("atmos-api")
        .build()
        .map_err(|error| error.to_string())?;
    let manifest = client
        .get(update_manifest_url())
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<CliUpdateManifest>()
        .await
        .map_err(|error| error.to_string())?;

    latest_release_from_manifest(manifest)
}

async fn fetch_latest_cli_release_from_api() -> Result<LatestCliRelease, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("atmos-api")
        .build()
        .map_err(|error| error.to_string())?;
    let releases = client
        .get(format!("{}?per_page=100", CLI_RELEASES_API_URL))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<Vec<GithubRelease>>()
        .await
        .map_err(|error| error.to_string())?;

    releases
        .into_iter()
        .find(|release| {
            !release.draft && !release.prerelease && is_cli_release_tag(&release.tag_name)
        })
        .map(|release| LatestCliRelease {
            asset_url: get_platform_asset_url(&release.assets),
            version: release_version(&release.tag_name),
            tag: release.tag_name,
            url: release.html_url,
        })
        .ok_or_else(|| "No published Atmos CLI release was found".to_string())
}

async fn fetch_latest_cli_release_from_tags_feed() -> Result<LatestCliRelease, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("atmos-api")
        .build()
        .map_err(|error| error.to_string())?;
    let feed = client
        .get(CLI_TAGS_ATOM_URL)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;
    let tag = find_latest_cli_tag_in_atom(&feed)
        .ok_or_else(|| "No cli-v tag was found in Atmos tags feed".to_string())?;
    Ok(LatestCliRelease {
        version: release_version(&tag),
        url: format!("{}/tag/{}", GITHUB_RELEASES_BASE_URL, tag),
        tag,
        asset_url: None,
    })
}

fn latest_release_from_manifest(manifest: CliUpdateManifest) -> Result<LatestCliRelease, String> {
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

    Ok(LatestCliRelease {
        version: manifest
            .version
            .unwrap_or_else(|| release_version(&manifest.tag)),
        tag: manifest.tag.clone(),
        url: manifest
            .release_url
            .unwrap_or_else(|| format!("{}/tag/{}", GITHUB_RELEASES_BASE_URL, manifest.tag)),
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
    std::env::var(CLI_UPDATE_MANIFEST_ENV)
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

fn is_cli_asset_for_target(name: &str, target: &str) -> bool {
    is_cli_asset_for_target_aliases(name, &[target])
}

fn is_cli_asset_for_target_aliases(name: &str, targets: &[&str]) -> bool {
    let normalized = name.to_ascii_lowercase();
    normalized.contains("atmos")
        && normalized.contains("cli")
        && targets
            .iter()
            .any(|target| normalized.contains(&target.to_ascii_lowercase()))
        && (normalized.ends_with(".tar.gz") || normalized.ends_with(".tgz"))
}

fn current_target_triple() -> Result<String, String> {
    target_triple_for(std::env::consts::OS, std::env::consts::ARCH).map(str::to_string)
}

fn current_target_aliases() -> Result<Vec<&'static str>, String> {
    target_aliases_for(std::env::consts::OS, std::env::consts::ARCH)
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
                "Atmos CLI updates are not available for {}-{}",
                os, arch
            ))
        }
    })
}

fn target_aliases_for(os: &str, arch: &str) -> Result<Vec<&'static str>, String> {
    Ok(match (os, arch) {
        ("macos", "aarch64") => vec![
            "aarch64-apple-darwin",
            "arm64-apple-darwin",
            "darwin-arm64",
            "macos-arm64",
        ],
        ("macos", "x86_64") => vec![
            "x86_64-apple-darwin",
            "darwin-amd64",
            "macos-amd64",
            "macos-x86_64",
        ],
        ("linux", "aarch64") => vec![
            "aarch64-unknown-linux-gnu",
            "aarch64-unknown-linux",
            "arm64-unknown-linux",
            "linux-arm64",
        ],
        ("linux", "x86_64") => vec![
            "x86_64-unknown-linux-gnu",
            "x86_64-unknown-linux",
            "amd64-unknown-linux",
            "linux-amd64",
            "linux-x86_64",
        ],
        ("windows", "x86_64") => vec![
            "x86_64-pc-windows-msvc",
            "x86_64-pc-windows",
            "windows-amd64",
            "windows-x86_64",
        ],
        (os, arch) => {
            return Err(format!(
                "Atmos CLI updates are not available for {}-{}",
                os, arch
            ))
        }
    })
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

fn find_latest_cli_tag_in_atom(feed: &str) -> Option<String> {
    for entry in feed.split("<entry").skip(1) {
        if let Some(tag) = extract_between(entry, "/releases/tag/", "\"")
            .or_else(|| extract_between(entry, "/releases/tag/", "<"))
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

pub fn version_gt(candidate: &str, current: &str) -> bool {
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

pub fn modify_shell_config(bin_dir: &Path) -> ShellConfigResult {
    let home_dir = dirs::home_dir();
    if home_dir.is_none() {
        warn!("Cannot determine home directory for shell config modification");
        return ShellConfigResult {
            modified: false,
            config_file: None,
        };
    }

    let home = home_dir.unwrap();
    let shell = std::env::var("SHELL").unwrap_or_default();
    let shell_name = Path::new(&shell)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("bash");

    let config_files = get_shell_config_files(&home, shell_name);
    let bin_dir_str = bin_dir.to_string_lossy().to_string();
    let path_command = format!("export PATH=\"{}:$PATH\"", bin_dir_str);

    for config_file in &config_files {
        if config_file.exists() {
            if let Ok(content) = fs::read_to_string(config_file) {
                if content.contains(&path_command) || content.contains(&bin_dir_str) {
                    info!("PATH already configured in {}", config_file.display());
                    return ShellConfigResult {
                        modified: false,
                        config_file: Some(config_file.display().to_string()),
                    };
                }
            }

            if let Ok(mut file) = fs::OpenOptions::new().append(true).open(config_file) {
                use std::io::Write;
                if writeln!(file, "\n# Atmos CLI").is_ok()
                    && writeln!(file, "{}", path_command).is_ok()
                {
                    info!(
                        "Successfully added Atmos CLI to PATH in {}",
                        config_file.display()
                    );
                    return ShellConfigResult {
                        modified: true,
                        config_file: Some(config_file.display().to_string()),
                    };
                }
            }
        }
    }

    warn!(
        "No writable shell config file found. Tried: {:?}",
        config_files
    );
    ShellConfigResult {
        modified: false,
        config_file: None,
    }
}

fn get_shell_config_files(home: &Path, shell_name: &str) -> Vec<PathBuf> {
    let xdg_config_home = std::env::var("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home.join(".config"));

    match shell_name {
        "fish" => vec![home.join(".config/fish/config.fish")],
        "zsh" => vec![
            std::env::var("ZDOTDIR")
                .map(|path| PathBuf::from(path).join(".zshrc"))
                .unwrap_or_else(|_| home.join(".zshrc")),
            std::env::var("ZDOTDIR")
                .map(|path| PathBuf::from(path).join(".zshenv"))
                .unwrap_or_else(|_| home.join(".zshenv")),
            xdg_config_home.join("zsh/.zshrc"),
            xdg_config_home.join("zsh/.zshenv"),
        ],
        "bash" => vec![
            home.join(".bashrc"),
            home.join(".bash_profile"),
            home.join(".profile"),
            xdg_config_home.join("bash/.bashrc"),
            xdg_config_home.join("bash/.bash_profile"),
        ],
        "ash" | "sh" => vec![
            home.join(".ashrc"),
            home.join(".profile"),
            PathBuf::from("/etc/profile"),
        ],
        _ => vec![
            home.join(".bashrc"),
            home.join(".bash_profile"),
            xdg_config_home.join("bash/.bashrc"),
            xdg_config_home.join("bash/.bash_profile"),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn github_release_asset_matching_requires_cli_archive() {
        let aliases = ["x86_64-unknown-linux-gnu", "x86_64-unknown-linux"];

        assert!(is_cli_asset_for_target_aliases(
            "atmos-cli-x86_64-unknown-linux-gnu.tar.gz",
            &aliases
        ));
        assert!(!is_cli_asset_for_target_aliases(
            "atmos-desktop-x86_64-unknown-linux-gnu.tar.gz",
            &aliases
        ));
        assert!(!is_cli_asset_for_target_aliases(
            "atmos-cli-x86_64-unknown-linux-gnu.zip",
            &aliases
        ));
    }

    #[test]
    fn manifest_asset_url_rejects_insecure_http_urls() {
        let asset = CliUpdateManifestAsset {
            name: "atmos-cli-x86_64-unknown-linux-gnu.tar.gz".to_string(),
            target: Some("x86_64-unknown-linux-gnu".to_string()),
            url: Some("http://example.com/atmos-cli-x86_64-unknown-linux-gnu.tar.gz".to_string()),
        };

        assert!(
            manifest_asset_url_with_base(&asset, "cli-v0.2.2", "https://install.atmos.land")
                .is_err()
        );
    }

    #[test]
    fn manifest_asset_url_rejects_insecure_relative_base() {
        let asset = CliUpdateManifestAsset {
            name: "atmos-cli-x86_64-unknown-linux-gnu.tar.gz".to_string(),
            target: Some("x86_64-unknown-linux-gnu".to_string()),
            url: Some("cli/cli-v0.2.2/atmos-cli-x86_64-unknown-linux-gnu.tar.gz".to_string()),
        };

        assert!(
            manifest_asset_url_with_base(&asset, "cli-v0.2.2", "http://install.atmos.land")
                .is_err()
        );
    }

    #[test]
    fn manifest_asset_url_accepts_https_relative_paths() {
        let asset = CliUpdateManifestAsset {
            name: "atmos-cli-x86_64-unknown-linux-gnu.tar.gz".to_string(),
            target: Some("x86_64-unknown-linux-gnu".to_string()),
            url: Some("cli/cli-v0.2.2/atmos-cli-x86_64-unknown-linux-gnu.tar.gz".to_string()),
        };

        assert_eq!(
            manifest_asset_url_with_base(&asset, "cli-v0.2.2", "https://install.atmos.land")
                .unwrap(),
            "https://install.atmos.land/cli/cli-v0.2.2/atmos-cli-x86_64-unknown-linux-gnu.tar.gz"
        );
    }

    #[test]
    fn linux_aarch64_target_is_supported_consistently() {
        assert_eq!(
            target_triple_for("linux", "aarch64").unwrap(),
            "aarch64-unknown-linux-gnu"
        );
        assert!(target_aliases_for("linux", "aarch64")
            .unwrap()
            .contains(&"aarch64-unknown-linux-gnu"));
    }
}
