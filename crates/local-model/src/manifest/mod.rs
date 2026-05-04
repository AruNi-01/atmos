pub mod types;

use reqwest::Client;
use tracing::debug;

use crate::error::Result;
pub use types::{BinaryEntry, ModelEntry, ModelManifest};

/// URL of the official Atmos model manifest.
/// In production this would be a signed CDN URL; for now we use a placeholder.
pub const MANIFEST_URL: &str = "https://cdn.atmos.dev/local-model/manifest/v1/manifest.json";

/// Fetch the manifest from the CDN.
pub async fn fetch_manifest(client: &Client) -> Result<ModelManifest> {
    debug!("Fetching local model manifest from {}", MANIFEST_URL);
    let response = client.get(MANIFEST_URL).send().await?.error_for_status()?;
    let manifest: ModelManifest = response.json().await?;
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
