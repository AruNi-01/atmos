pub mod types;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tracing::debug;

use crate::config::local_model_runtime_dir;
use crate::error::Result;
pub use types::{BinaryEntry, ModelEntry, ModelManifest};

/// Default URL of the official Atmos model manifest from GitHub Releases.
pub const DEFAULT_MANIFEST_URL: &str =
    "https://github.com/AruNi-01/atmos/releases/download/local-model-runtime-v0.1.0/manifest.json";

/// Environment variable to override the manifest URL.
pub const MANIFEST_URL_ENV: &str = "ATMOS_LOCAL_MODEL_MANIFEST_URL";

/// Cache duration: 12 hours in seconds
const CACHE_DURATION_SECONDS: u64 = 12 * 60 * 60;

/// Cached manifest with timestamp
#[derive(Debug, Serialize, Deserialize)]
struct CachedManifest {
    manifest: ModelManifest,
    cached_at: i64,
}

/// Get the cache file path
fn cache_file_path() -> Result<PathBuf> {
    let dir = local_model_runtime_dir()?;
    Ok(dir.join("manifest-cache.json"))
}

/// Load cached manifest if it exists and is not expired
fn load_cached_manifest() -> Option<ModelManifest> {
    let cache_path = cache_file_path().ok()?;
    if !cache_path.exists() {
        return None;
    }

    let cached_json = std::fs::read_to_string(cache_path).ok()?;
    let cached: CachedManifest = serde_json::from_str(&cached_json).ok()?;

    let now = chrono::Utc::now().timestamp();
    let age = now - cached.cached_at;

    if age < CACHE_DURATION_SECONDS as i64 {
        debug!("Using cached manifest (age: {}s)", age);
        Some(cached.manifest)
    } else {
        debug!("Cache expired (age: {}s), fetching fresh", age);
        None
    }
}

/// Save manifest to cache
fn save_cached_manifest(manifest: &ModelManifest) -> Result<()> {
    let cache_path = cache_file_path()?;
    let cached = CachedManifest {
        manifest: manifest.clone(),
        cached_at: chrono::Utc::now().timestamp(),
    };

    let cached_json = serde_json::to_string_pretty(&cached).map_err(|e| {
        crate::error::LocalModelError::Runtime(format!("Failed to serialize cache: {}", e))
    })?;

    std::fs::write(&cache_path, cached_json).map_err(|e| {
        crate::error::LocalModelError::Runtime(format!("Failed to write cache: {}", e))
    })?;

    debug!("Saved manifest to cache");
    Ok(())
}

/// Fetch the manifest with fallback chain and caching:
/// 1. Try cache (if not expired and not force_refresh)
/// 2. Environment variable override (ATMOS_LOCAL_MODEL_MANIFEST_URL)
/// 3. GitHub Release URL
/// 4. Bundled fallback manifest
pub async fn fetch_manifest(client: &Client, force_refresh: bool) -> Result<ModelManifest> {
    // Try cache first (unless force_refresh)
    if !force_refresh {
        if let Some(cached) = load_cached_manifest() {
            return Ok(cached);
        }
    } else {
        debug!("Force refresh requested, skipping cache");
    }

    // Try environment override first
    if let Ok(url) = std::env::var(MANIFEST_URL_ENV) {
        debug!("Fetching local model manifest from env override: {}", url);
        if let Ok(manifest) = fetch_from_url(client, &url).await {
            let _ = save_cached_manifest(&manifest);
            return Ok(manifest);
        }
        debug!("Env override failed, falling back to default");
    }

    // Try GitHub Release URL
    debug!(
        "Fetching local model manifest from GitHub Release: {}",
        DEFAULT_MANIFEST_URL
    );
    if let Ok(manifest) = fetch_from_url(client, DEFAULT_MANIFEST_URL).await {
        let _ = save_cached_manifest(&manifest);
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
    let manifest: ModelManifest = serde_json::from_str(manifest_json).map_err(|e| {
        crate::error::LocalModelError::Runtime(format!("Failed to parse bundled manifest: {}", e))
    })?;
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
