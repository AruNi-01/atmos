use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Context};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};
use tokio::fs;
use tokio::process::Command;
use tokio::sync::Mutex;
use tokio::time::timeout;

use crate::registry::{InstallMethod, LspDefinition};

#[derive(Clone)]
pub struct Installer {
    client: reqwest::Client,
    home: PathBuf,
    registry_lock: Arc<Mutex<()>>,
}

impl Default for Installer {
    fn default() -> Self {
        Self::new(lsp_home())
    }
}

impl Installer {
    pub fn new(home: PathBuf) -> Self {
        Self {
            client: build_client(),
            home,
            registry_lock: Arc::new(Mutex::new(())),
        }
    }

    pub async fn ensure_installed(&self, definition: &LspDefinition) -> anyhow::Result<PathBuf> {
        let target_dir = self.home.join(definition.id);
        let marker = marker_path(definition.version, &target_dir);

        if marker.exists() {
            if let Some(existing) = self.resolve_executable(definition, &target_dir) {
                self.update_registry_cache(definition, &existing).await?;
                return Ok(existing);
            }
        }

        fs::create_dir_all(&target_dir)
            .await
            .with_context(|| format!("failed to create lsp dir at {}", target_dir.display()))?;

        match &definition.install {
            InstallMethod::GitHubRelease {
                repo,
                asset_pattern,
            } => {
                self.install_from_github(definition.version, repo, asset_pattern, &target_dir)
                    .await?;
            }
            InstallMethod::Npm { package, .. } => {
                self.install_via_npm(package, definition.version, &target_dir)
                    .await?;
            }
            InstallMethod::Pip { package, .. } => {
                self.install_via_pip(package, definition.version, &target_dir)
                    .await?;
            }
            InstallMethod::GoInstall { package, .. } => {
                self.install_via_go(package, definition.version, &target_dir)
                    .await?;
            }
            InstallMethod::SystemBinary { bin } => {
                let binary = self.find_in_path(bin)?;
                fs::write(&marker, binary.to_string_lossy().as_bytes())
                    .await
                    .context("failed to persist system-binary marker")?;
                self.update_registry_cache(definition, &binary).await?;
                return Ok(binary);
            }
        }

        if let Some(path) = self.resolve_executable(definition, &target_dir) {
            fs::write(&marker, path.to_string_lossy().as_bytes())
                .await
                .context("failed to persist installation marker")?;
            self.update_registry_cache(definition, &path).await?;
            return Ok(path);
        }

        Err(anyhow!(
            "installed {}, but failed to resolve executable",
            definition.id
        ))
    }

    fn resolve_executable(&self, definition: &LspDefinition, target_dir: &Path) -> Option<PathBuf> {
        if let InstallMethod::SystemBinary { bin } = definition.install {
            return self.find_in_path(bin).ok();
        }

        match &definition.install {
            InstallMethod::Npm { bin, .. }
            | InstallMethod::Pip { bin, .. }
            | InstallMethod::GoInstall { bin, .. } => {
                let candidate = target_dir.join("bin").join(bin);
                if candidate.exists() {
                    return Some(candidate);
                }
            }
            _ => {}
        }

        let known_candidates = [
            target_dir.join(definition.id),
            target_dir.join("bin").join(definition.id),
            target_dir.join("rust-analyzer"),
            target_dir.join("gopls"),
            target_dir.join("clangd"),
            target_dir.join("taplo"),
            target_dir.join("bin").join("lua-language-server"),
        ];

        known_candidates
            .into_iter()
            .find(|candidate| candidate.exists())
    }

    async fn install_from_github(
        &self,
        version: &str,
        repo: &str,
        asset_pattern: &str,
        destination: &Path,
    ) -> anyhow::Result<()> {
        let release = self.fetch_release(repo, version).await?;
        let os = current_os_for_repo(repo);
        let arch = current_arch_for_repo(repo);

        let pattern = asset_pattern
            .replace("{os}", &os)
            .replace("{arch}", &arch)
            .replace("{version}", release.tag_name.trim_start_matches('v'));

        let os_aliases = os_aliases();
        let arch_aliases = arch_aliases();

        let asset = release
            .assets
            .iter()
            .find(|asset| asset.name.contains(&pattern))
            .or_else(|| {
                release.assets.iter().find(|asset| {
                    os_aliases.iter().any(|os| asset.name.contains(os))
                        && arch_aliases.iter().any(|arch| asset.name.contains(arch))
                })
            })
            .ok_or_else(|| anyhow!("no release asset matched pattern {pattern} in {repo}"))?;

        let bytes = self
            .client
            .get(&asset.browser_download_url)
            .send()
            .await
            .with_context(|| format!("failed to download {}", asset.browser_download_url))?
            .error_for_status()
            .context("release asset request failed")?
            .bytes()
            .await
            .context("failed to read release asset bytes")?;

        let asset_name = asset.name.clone();
        let destination = destination.to_path_buf();
        let bytes = bytes.to_vec();
        tokio::task::spawn_blocking(move || extract_archive(&asset_name, &bytes, &destination))
            .await
            .map_err(anyhow::Error::from)
            .and_then(|result| result)
            .with_context(|| format!("failed to extract {}", asset.name))?;

        Ok(())
    }

    async fn install_via_npm(
        &self,
        package: &str,
        version: &str,
        destination: &Path,
    ) -> anyhow::Result<()> {
        let mut command = Command::new("npm");
        command
            .args(["install", "-g", &format!("{package}@{version}"), "--prefix"])
            .arg(destination);
        let status = timeout(EXTERNAL_INSTALL_TIMEOUT, command.status())
            .await
            .map_err(|_| anyhow!("npm install timed out for package {package}"))?
            .context("failed to spawn npm")?;

        if !status.success() {
            return Err(anyhow!("npm install failed for package {package}"));
        }
        Ok(())
    }

    async fn install_via_pip(
        &self,
        package: &str,
        version: &str,
        destination: &Path,
    ) -> anyhow::Result<()> {
        let mut command = Command::new("python3");
        command.args([
            "-m",
            "pip",
            "install",
            &format!("{package}=={version}"),
            "--prefix",
        ]);
        command.arg(destination);
        let status = timeout(EXTERNAL_INSTALL_TIMEOUT, command.status())
            .await
            .map_err(|_| anyhow!("pip install timed out for package {package}"))?
            .context("failed to spawn python3")?;

        if !status.success() {
            return Err(anyhow!("pip install failed for package {package}"));
        }
        Ok(())
    }

    fn find_in_path(&self, bin: &str) -> anyhow::Result<PathBuf> {
        let path_var = std::env::var_os("PATH").ok_or_else(|| anyhow!("PATH is not configured"))?;
        for segment in std::env::split_paths(&path_var) {
            let candidate = segment.join(bin);
            if candidate.exists() {
                return Ok(candidate);
            }
        }
        Err(anyhow!("binary {bin} is not available in PATH"))
    }

    async fn fetch_release(&self, repo: &str, version: &str) -> anyhow::Result<GitHubRelease> {
        let url = format!("https://api.github.com/repos/{repo}/releases/tags/{version}");
        let response = self
            .client
            .get(url)
            .send()
            .await
            .context("failed to query GitHub release")?
            .error_for_status()
            .context("GitHub release query failed")?;

        response
            .json::<GitHubRelease>()
            .await
            .context("failed to deserialize GitHub release payload")
    }

    async fn install_via_go(
        &self,
        package: &str,
        version: &str,
        destination: &Path,
    ) -> anyhow::Result<()> {
        let go_bin = destination.join("bin");
        fs::create_dir_all(&go_bin).await?;
        let mut command = Command::new("go");
        command
            .env("GOBIN", &go_bin)
            .args(["install", &format!("{package}@{version}")]);
        let status = timeout(EXTERNAL_INSTALL_TIMEOUT, command.status())
            .await
            .map_err(|_| anyhow!("go install timed out for package {package}"))?
            .context("failed to spawn go install")?;

        if !status.success() {
            return Err(anyhow!("go install failed for package {package}"));
        }
        Ok(())
    }

    async fn update_registry_cache(
        &self,
        definition: &LspDefinition,
        binary_path: &Path,
    ) -> anyhow::Result<()> {
        let _guard = self.registry_lock.lock().await;
        let cache_path = self.home.join("registry.json");
        fs::create_dir_all(&self.home).await?;
        let mut entries = if cache_path.exists() {
            let existing = fs::read_to_string(&cache_path).await.unwrap_or_default();
            serde_json::from_str::<Vec<LocalRegistryEntry>>(&existing).unwrap_or_default()
        } else {
            Vec::new()
        };

        entries.retain(|entry| entry.id != definition.id);
        entries.push(LocalRegistryEntry {
            id: definition.id.to_string(),
            version: definition.version.to_string(),
            install_path: binary_path.to_string_lossy().to_string(),
            updated_at_unix_ms: chrono::Utc::now().timestamp_millis(),
        });

        let temp_path = cache_path.with_extension("tmp");
        fs::write(&temp_path, serde_json::to_string_pretty(&entries)?).await?;
        fs::rename(&temp_path, &cache_path).await?;
        Ok(())
    }
}

pub async fn ensure_installed(definition: &LspDefinition) -> anyhow::Result<PathBuf> {
    Installer::default().ensure_installed(definition).await
}

pub fn lsp_home() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".atmos")
        .join("lsp")
}

fn build_client() -> reqwest::Client {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static("atmos-lsp-installer"));
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("application/vnd.github+json"),
    );

    if let Ok(token) = std::env::var("GITHUB_TOKEN") {
        let value = format!("Bearer {token}");
        if let Ok(header) = HeaderValue::from_str(&value) {
            headers.insert(AUTHORIZATION, header);
        }
    }

    reqwest::Client::builder()
        .default_headers(headers)
        .timeout(HTTP_REQUEST_TIMEOUT)
        .build()
        .expect("failed to build reqwest client")
}

const HTTP_REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
const EXTERNAL_INSTALL_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct LocalRegistryEntry {
    id: String,
    version: String,
    install_path: String,
    updated_at_unix_ms: i64,
}

fn marker_path(version: &str, target_dir: &Path) -> PathBuf {
    let sanitized = version
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    target_dir.join(format!(".installed-{sanitized}"))
}

fn extract_archive(file_name: &str, bytes: &[u8], destination: &Path) -> anyhow::Result<()> {
    if file_name.ends_with(".tar.gz") {
        let decoder = flate2::read::GzDecoder::new(Cursor::new(bytes));
        let mut archive = tar::Archive::new(decoder);
        for entry in archive.entries()? {
            let mut entry = entry?;
            let entry_path = entry.path()?.into_owned();
            let output = safe_join(destination, entry_path.as_path())?;
            if let Some(parent) = output.parent() {
                std::fs::create_dir_all(parent)?;
            }
            entry.unpack(&output)?;
        }
        return Ok(());
    }

    if file_name.ends_with(".gz") {
        let mut decoder = flate2::read::GzDecoder::new(Cursor::new(bytes));
        let output_name = canonical_binary_name_from_asset(file_name);
        let output = destination.join(output_name);
        let mut writer = std::fs::File::create(&output)?;
        std::io::copy(&mut decoder, &mut writer)?;
        set_executable(&output)?;
        return Ok(());
    }

    if file_name.ends_with(".zip") {
        let reader = Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(reader)?;
        for idx in 0..archive.len() {
            let mut file = archive.by_index(idx)?;
            let output = safe_join(destination, Path::new(file.name()))?;
            if file.is_dir() {
                std::fs::create_dir_all(&output)?;
                continue;
            }

            if let Some(parent) = output.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut writer = std::fs::File::create(&output)?;
            std::io::copy(&mut file, &mut writer)?;
            if is_likely_executable(&output) {
                set_executable(&output)?;
            }
        }
        return Ok(());
    }

    Err(anyhow!("unsupported archive extension for {file_name}"))
}

fn is_likely_executable(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| {
            matches!(
                name,
                "rust-analyzer"
                    | "gopls"
                    | "clangd"
                    | "taplo"
                    | "pyright-langserver"
                    | "typescript-language-server"
                    | "yaml-language-server"
                    | "lua-language-server"
            )
        })
        .unwrap_or(false)
}

fn safe_join(destination: &Path, entry_path: &Path) -> anyhow::Result<PathBuf> {
    let mut output = destination.to_path_buf();
    for part in entry_path.components() {
        match part {
            std::path::Component::Normal(segment) => output.push(segment),
            std::path::Component::CurDir => {}
            _ => {
                return Err(anyhow!(
                    "archive entry contains unsafe path traversal segment: {}",
                    entry_path.display()
                ));
            }
        }
    }
    Ok(output)
}

fn canonical_binary_name_from_asset(file_name: &str) -> String {
    let raw = file_name.trim_end_matches(".gz");
    if raw.starts_with("rust-analyzer") {
        return "rust-analyzer".to_string();
    }
    if raw.starts_with("taplo") {
        return "taplo".to_string();
    }
    raw.to_string()
}

#[cfg(unix)]
fn set_executable(path: &Path) -> anyhow::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(path, perms)?;
    Ok(())
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> anyhow::Result<()> {
    Ok(())
}

fn current_arch_for_repo(repo: &str) -> String {
    match repo {
        "LuaLS/lua-language-server" => {
            if cfg!(target_arch = "aarch64") {
                "arm64".to_string()
            } else if cfg!(target_arch = "x86_64") {
                "x64".to_string()
            } else {
                std::env::consts::ARCH.to_string()
            }
        }
        _ => {
            if cfg!(target_arch = "aarch64") {
                "aarch64".to_string()
            } else if cfg!(target_arch = "x86_64") {
                "x86_64".to_string()
            } else {
                std::env::consts::ARCH.to_string()
            }
        }
    }
}

fn current_os_for_repo(repo: &str) -> String {
    match repo {
        "clangd/clangd" => {
            if cfg!(target_os = "macos") {
                "mac".to_string()
            } else if cfg!(target_os = "linux") {
                "linux".to_string()
            } else if cfg!(target_os = "windows") {
                "windows".to_string()
            } else {
                std::env::consts::OS.to_string()
            }
        }
        "LuaLS/lua-language-server" => {
            if cfg!(target_os = "macos") {
                "darwin".to_string()
            } else if cfg!(target_os = "linux") {
                "linux".to_string()
            } else if cfg!(target_os = "windows") {
                "win32".to_string()
            } else {
                std::env::consts::OS.to_string()
            }
        }
        _ => {
            if cfg!(target_os = "macos") {
                "apple-darwin".to_string()
            } else if cfg!(target_os = "linux") {
                "unknown-linux-gnu".to_string()
            } else if cfg!(target_os = "windows") {
                "pc-windows-msvc".to_string()
            } else {
                std::env::consts::OS.to_string()
            }
        }
    }
}

fn os_aliases() -> Vec<&'static str> {
    if cfg!(target_os = "macos") {
        vec!["mac", "darwin", "apple-darwin", "osx"]
    } else if cfg!(target_os = "linux") {
        vec!["linux", "unknown-linux-gnu"]
    } else if cfg!(target_os = "windows") {
        vec!["windows", "win32", "pc-windows-msvc"]
    } else {
        vec![std::env::consts::OS]
    }
}

fn arch_aliases() -> Vec<&'static str> {
    if cfg!(target_arch = "aarch64") {
        vec!["aarch64", "arm64"]
    } else if cfg!(target_arch = "x86_64") {
        vec!["x86_64", "x64", "amd64"]
    } else {
        vec![std::env::consts::ARCH]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smoke_home_dir() {
        let home = lsp_home();
        assert!(home.ends_with(".atmos/lsp"));
    }

    #[test]
    fn pattern_matches_arch_os() {
        let os = current_os_for_repo("rust-lang/rust-analyzer");
        let arch = current_arch_for_repo("rust-lang/rust-analyzer");
        assert!(!os.is_empty());
        assert!(!arch.is_empty());
    }
}
