pub mod types;

use reqwest::Client;
use tracing::debug;

use crate::error::Result;
pub use types::{BinaryEntry, ModelEntry, ModelManifest};

/// Default URL of the official Atmos model manifest from GitHub Releases.
pub const DEFAULT_MANIFEST_URL: &str =
    "https://github.com/AruNi-01/atmos/releases/download/local-model-runtime-v0.1.0/manifest.json";

/// Environment variable to override the manifest URL.
pub const MANIFEST_URL_ENV: &str = "ATMOS_LOCAL_MODEL_MANIFEST_URL";

/// Fetch the manifest with fallback chain:
/// 1. Environment variable override (ATMOS_LOCAL_MODEL_MANIFEST_URL)
/// 2. GitHub Release URL
/// 3. Bundled fallback manifest
pub async fn fetch_manifest(client: &Client) -> Result<ModelManifest> {
    // Try environment override first
    if let Ok(url) = std::env::var(MANIFEST_URL_ENV) {
        debug!("Fetching local model manifest from env override: {}", url);
        if let Ok(manifest) = fetch_from_url(client, &url).await {
            return Ok(manifest);
        }
        debug!("Env override failed, falling back to default");
    }

    // Try GitHub Release URL
    debug!("Fetching local model manifest from GitHub Release: {}", DEFAULT_MANIFEST_URL);
    if let Ok(manifest) = fetch_from_url(client, DEFAULT_MANIFEST_URL).await {
        return Ok(manifest);
    }
    debug!("GitHub Release fetch failed, falling back to bundled manifest");

    // Fallback to bundled manifest
    debug!("Using bundled local model manifest");
    Ok(fetch_bundled_manifest()?)
}

/// Fetch manifest from a specific URL.
async fn fetch_from_url(client: &Client, url: &str) -> Result<ModelManifest> {
    let response = client.get(url).send().await?.error_for_status()?;
    let manifest: ModelManifest = response.json().await?;
    Ok(manifest)
}

/// Load the bundled fallback manifest.
fn fetch_bundled_manifest() -> Result<ModelManifest> {
    let manifest_json = include_str!("../../manifest/default.json");
    let manifest: ModelManifest = serde_json::from_str(manifest_json)
        .map_err(|e| crate::error::LocalModelError::Runtime(format!("Failed to parse bundled manifest: {}", e)))?;
    Ok(manifest)
}

/// Return the current platform string used to look up the binary entry.
pub fn current_platform() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    return "macos-arm64";

    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    return "macos-x86_64";

    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    return "linux-x86_64";

    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    return "linux-arm64";

    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    return "windows-x86_64";

    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
        all(target_os = "windows", target_arch = "x86_64"),
    )))]
    return "unknown";
}

/// Find the binary entry for the current platform.
pub fn find_binary_for_platform<'a>(manifest: &'a ModelManifest) -> Option<&'a BinaryEntry> {
    let platform = current_platform();
    manifest.binaries.iter().find(|b| b.platform == platform)
}

/// Find a model entry by id.
pub fn find_model<'a>(manifest: &'a ModelManifest, model_id: &str) -> Option<&'a ModelEntry> {
    manifest.models.iter().find(|m| m.id == model_id)
}
