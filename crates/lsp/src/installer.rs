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

/// Total reqwest request timeout (covers connect + headers + body). Downloads
/// for language-server release assets can be tens of MB, so the ceiling is
/// generous; the connect-only timeout below keeps lookup failures fast.
const HTTP_TOTAL_TIMEOUT: Duration = Duration::from_secs(600);
/// Connect-phase timeout for reqwest — guards against DNS or TCP stalls.
const HTTP_CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
/// Upper bound on a single external package-manager install invocation
/// (`npm install`, `pip install`, `go install`). Installs with large
/// dependency trees on cold caches can easily take several minutes, so the
/// ceiling is intentionally loose; the point is only to prevent an
/// indefinitely hanging child from wedging the LSP manager.
const INSTALL_COMMAND_TIMEOUT: Duration = Duration::from_secs(15 * 60);

#[derive(Clone)]
pub struct Installer {
    client: reqwest::Client,
    home: PathBuf,
    /// Serializes writes to the shared `~/.atmos/lsp/registry.json` cache so
    /// concurrent `ensure_installed` calls for different definitions cannot
    /// lose updates via a read-modify-write race.
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
        let marker = target_dir.join(".installed");

        // The marker is version-aware: its content must match `definition.version`.
        // If the marker is missing, unreadable, or pinned to a different version,
        // we treat the target as not installed and fall through to a fresh install.
        // This prevents stale binaries from being reused after a version bump.
        if marker.exists() && marker_matches_version(&marker, definition.version).await {
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
                write_version_marker(&marker, definition.version)
                    .await
                    .context("failed to persist system-binary marker")?;
                self.update_registry_cache(definition, &binary).await?;
                return Ok(binary);
            }
        }

        if let Some(path) = self.resolve_executable(definition, &target_dir) {
            write_version_marker(&marker, definition.version)
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

        // `extract_archive` does synchronous decompression + `std::fs` writes,
        // which would otherwise block a tokio worker thread for the duration
        // of the extraction. Offload it to the blocking thread pool.
        let asset_name = asset.name.clone();
        let bytes = bytes.to_vec();
        let destination_owned = destination.to_path_buf();
        tokio::task::spawn_blocking(move || {
            extract_archive(&asset_name, &bytes, &destination_owned)
        })
        .await
        .context("extract task panicked or was cancelled")?
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

        run_install_command_with_timeout(command, "npm", package).await
    }

    async fn install_via_pip(
        &self,
        package: &str,
        version: &str,
        destination: &Path,
    ) -> anyhow::Result<()> {
        let mut command = Command::new("python3");
        command
            .args([
                "-m",
                "pip",
                "install",
                &format!("{package}=={version}"),
                "--prefix",
            ])
            .arg(destination);

        run_install_command_with_timeout(command, "python3", package).await
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

        run_install_command_with_timeout(command, "go install", package).await
    }

    async fn update_registry_cache(
        &self,
        definition: &LspDefinition,
        binary_path: &Path,
    ) -> anyhow::Result<()> {
        // Serialize concurrent writers against a shared async mutex so the
        // read-modify-write on `registry.json` cannot lose updates, and
        // perform the actual file replacement atomically via rename so a
        // crash mid-write cannot leave the cache truncated.
        let _guard = self.registry_lock.lock().await;

        fs::create_dir_all(&self.home).await?;
        let cache_path = self.home.join("registry.json");
        let tmp_path = self.home.join("registry.json.tmp");

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

        let serialized = serde_json::to_string_pretty(&entries)?;
        fs::write(&tmp_path, serialized)
            .await
            .with_context(|| format!("failed to write {}", tmp_path.display()))?;
        fs::rename(&tmp_path, &cache_path).await.with_context(|| {
            format!(
                "failed to atomically replace {} with {}",
                cache_path.display(),
                tmp_path.display()
            )
        })?;
        Ok(())
    }
}

/// Spawns an installer subprocess and waits for it with a bounded timeout.
/// On timeout, the child is explicitly SIGKILL-ed and reaped so the install
/// process cannot keep running in the background after this function returns.
/// On spawn failure, non-zero exit, or I/O error while waiting, a descriptive
/// `anyhow::Error` is returned.
async fn run_install_command_with_timeout(
    mut command: Command,
    tool: &str,
    package: &str,
) -> anyhow::Result<()> {
    let mut child = command
        .spawn()
        .with_context(|| format!("failed to spawn {tool}"))?;

    match timeout(INSTALL_COMMAND_TIMEOUT, child.wait()).await {
        Ok(Ok(status)) => {
            if !status.success() {
                return Err(anyhow!("{tool} install failed for package {package}"));
            }
            Ok(())
        }
        Ok(Err(error)) => Err(anyhow::Error::new(error)
            .context(format!("failed to wait on {tool} install for {package}"))),
        Err(_) => {
            // Timeout: kill the child so it does not continue running in the
            // background. `kill()` sends SIGKILL and `wait()` reaps it; both
            // are awaited so we do not leave a zombie behind on Unix.
            let _ = child.kill().await;
            let _ = child.wait().await;
            Err(anyhow!(
                "{tool} install for {package} timed out after {:?}",
                INSTALL_COMMAND_TIMEOUT
            ))
        }
    }
}

async fn marker_matches_version(marker: &Path, expected_version: &str) -> bool {
    match fs::read_to_string(marker).await {
        Ok(contents) => contents.trim() == expected_version,
        Err(_) => false,
    }
}

async fn write_version_marker(marker: &Path, version: &str) -> anyhow::Result<()> {
    fs::write(marker, version.as_bytes()).await?;
    Ok(())
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
        // Bound both the connect phase and the overall request so a hung
        // GitHub API call or stalled release-asset download cannot wedge an
        // installer task indefinitely.
        .connect_timeout(HTTP_CONNECT_TIMEOUT)
        .timeout(HTTP_TOTAL_TIMEOUT)
        .build()
        .expect("failed to build reqwest client")
}

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
