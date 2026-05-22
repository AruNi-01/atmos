use axum::Json;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tracing::{info, warn};

use crate::api::dto::ApiResponse;
use crate::error::{ApiError, ApiResult};

const CLI_RELEASES_API_URL: &str = "https://api.github.com/repos/AruNi-01/atmos/releases";
const CLI_TAGS_ATOM_URL: &str = "https://github.com/AruNi-01/atmos/tags.atom";
const CLI_RELEASE_TAG_PREFIX: &str = "cli-v";
const ALT_CLI_RELEASE_TAG_PREFIX: &str = "atmos-cli-v";
const GITHUB_RELEASES_BASE_URL: &str = "https://github.com/AruNi-01/atmos/releases";

#[derive(Debug, Serialize)]
pub struct CliVersionCheckResponse {
    installed: bool,
    current_version: Option<String>,
    latest_version: Option<String>,
    latest_tag: Option<String>,
    release_url: Option<String>,
    update_available: bool,
    install_path: Option<String>,
}

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

/// GET /api/system/cli-version-check
pub async fn check_cli_version() -> ApiResult<Json<ApiResponse<CliVersionCheckResponse>>> {
    let cli_path = infra::utils::atmos_cli::installed_cli_path();
    let current_version = cli_path.as_deref().and_then(read_cli_version);
    let latest = fetch_latest_cli_release().await.ok();
    let latest_version = latest.as_ref().map(|release| release.version.clone());
    let update_available = current_version
        .as_deref()
        .zip(latest_version.as_deref())
        .map(|(current, latest)| version_gt(latest, current))
        .unwrap_or(false);

    Ok(Json(ApiResponse::success(CliVersionCheckResponse {
        installed: current_version.is_some(),
        current_version,
        latest_version,
        latest_tag: latest.as_ref().map(|release| release.tag.clone()),
        release_url: latest.as_ref().map(|release| release.url.clone()),
        update_available,
        install_path: cli_path.map(|path| path.to_string_lossy().to_string()),
    })))
}

#[derive(Debug, Deserialize)]
pub struct InstallCliRequest {
    #[serde(default)]
    modify_path: bool,
}

#[derive(Debug, Serialize)]
pub struct CliInstallResponse {
    success: bool,
    version: Option<String>,
    message: String,
    path_modified: Option<bool>,
    path_modified_file: Option<String>,
}

/// POST /api/system/cli-install
///
/// Download and install the latest Atmos CLI from GitHub releases.
pub async fn install_cli(
    Json(payload): Json<InstallCliRequest>,
) -> ApiResult<Json<ApiResponse<CliInstallResponse>>> {
    let cli_path = infra::utils::atmos_cli::installed_cli_path()
        .ok_or_else(|| ApiError::InternalError("Cannot determine CLI install path".to_string()))?;

    if let Some(bin_dir) = cli_path.parent() {
        std::fs::create_dir_all(bin_dir).map_err(|e| {
            ApiError::InternalError(format!("Failed to create bin directory: {}", e))
        })?;
    }

    let release = fetch_latest_cli_release_with_assets()
        .await
        .map_err(|e| ApiError::InternalError(format!("Failed to fetch CLI release: {}", e)))?;

    let asset_url = get_platform_asset_url(&release.assets).ok_or_else(|| {
        ApiError::InternalError("No compatible CLI asset found for this platform".to_string())
    })?;

    info!("Downloading CLI from: {}", asset_url);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .user_agent("atmos-api")
        .build()
        .map_err(|e| ApiError::InternalError(format!("Failed to create HTTP client: {}", e)))?;

    let response = client
        .get(&asset_url)
        .send()
        .await
        .map_err(|e| ApiError::InternalError(format!("Failed to download CLI: {}", e)))?;

    if !response.status().is_success() {
        return Err(ApiError::InternalError(format!(
            "Failed to download CLI: HTTP {}",
            response.status()
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| ApiError::InternalError(format!("Failed to read CLI bytes: {}", e)))?;

    let temp_path = cli_path.with_extension("tmp");
    tokio::fs::write(&temp_path, bytes)
        .await
        .map_err(|e| ApiError::InternalError(format!("Failed to write CLI to temp file: {}", e)))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = std::fs::metadata(&temp_path)
            .map_err(|e| ApiError::InternalError(format!("Failed to stat temp file: {}", e)))?;
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&temp_path, permissions).map_err(|e| {
            ApiError::InternalError(format!("Failed to set executable permissions: {}", e))
        })?;
    }

    tokio::fs::rename(&temp_path, &cli_path)
        .await
        .map_err(|e| ApiError::InternalError(format!("Failed to replace CLI: {}", e)))?;

    let new_version = read_cli_version(&cli_path);

    info!(
        "Successfully installed Atmos CLI version: {:?}",
        new_version
    );

    let mut path_modified = false;
    let mut path_modified_file = None::<String>;

    if payload.modify_path {
        if let Some(bin_dir) = cli_path.parent() {
            let result = modify_shell_config(bin_dir);
            path_modified = result.modified;
            path_modified_file = result.config_file;
        }
    }

    let mut message = format!("CLI installed successfully to {}", cli_path.display());
    if path_modified {
        if let Some(file) = &path_modified_file {
            message.push_str(&format!(". Added to PATH in {}", file));
        }
    }

    Ok(Json(ApiResponse::success(CliInstallResponse {
        success: true,
        version: new_version,
        message,
        path_modified: Some(path_modified),
        path_modified_file,
    })))
}

async fn fetch_latest_cli_release_with_assets() -> Result<GithubRelease, String> {
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
        .ok_or_else(|| "No published Atmos CLI release was found".to_string())
}

fn get_platform_asset_url(assets: &[GithubAsset]) -> Option<String> {
    let (os, arch) = detect_platform();

    let patterns = match (os.as_str(), arch.as_str()) {
        ("darwin", "aarch64") => vec![
            "aarch64-apple-darwin",
            "arm64-apple-darwin",
            "darwin-arm64",
            "macos-arm64",
        ],
        ("darwin", "x86_64") => vec![
            "x86_64-apple-darwin",
            "darwin-amd64",
            "macos-amd64",
            "macos-x86_64",
        ],
        ("linux", "aarch64") => vec![
            "aarch64-unknown-linux",
            "arm64-unknown-linux",
            "linux-arm64",
        ],
        ("linux", "x86_64") => vec![
            "x86_64-unknown-linux",
            "amd64-unknown-linux",
            "linux-amd64",
            "linux-x86_64",
        ],
        ("windows", "x86_64") => vec!["x86_64-pc-windows", "windows-amd64", "windows-x86_64"],
        _ => return None,
    };

    for pattern in patterns {
        if let Some(asset) = assets.iter().find(|asset| asset.name.contains(pattern)) {
            return Some(asset.browser_download_url.clone());
        }
    }

    None
}

fn detect_platform() -> (String, String) {
    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();
    (os, arch)
}

#[derive(Debug)]
struct LatestCliRelease {
    version: String,
    tag: String,
    url: String,
}

fn read_cli_version(path: &Path) -> Option<String> {
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

async fn fetch_latest_cli_release() -> Result<LatestCliRelease, String> {
    match fetch_latest_cli_release_from_api().await {
        Ok(release) => Ok(release),
        Err(_) => fetch_latest_cli_release_from_tags_feed().await,
    }
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
    })
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

struct ShellConfigResult {
    modified: bool,
    config_file: Option<String>,
}

fn modify_shell_config(bin_dir: &Path) -> ShellConfigResult {
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
            if let Ok(content) = std::fs::read_to_string(config_file) {
                if content.contains(&path_command) || content.contains(&bin_dir_str) {
                    info!("PATH already configured in {}", config_file.display());
                    return ShellConfigResult {
                        modified: false,
                        config_file: Some(config_file.display().to_string()),
                    };
                }
            }

            if let Ok(mut file) = std::fs::OpenOptions::new().append(true).open(config_file) {
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
