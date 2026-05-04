use serde::{Deserialize, Serialize};

/// Top-level manifest served from the Atmos CDN.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelManifest {
    /// Manifest schema version, currently 1.
    pub version: u32,

    /// Recommended models available for download.
    pub models: Vec<ModelEntry>,

    /// Platform-specific llama-server binary entries.
    pub binaries: Vec<BinaryEntry>,
}

/// A single downloadable model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelEntry {
    /// Stable identifier, e.g. "qwen2.5-0.5b-instruct".
    pub id: String,

    /// Human-readable display name.
    pub display_name: String,

    /// Short description shown in the UI.
    pub description: String,

    /// SPDX license identifier, e.g. "Apache-2.0".
    pub license: String,

    /// Full license text URL (shown before download).
    pub license_url: String,

    /// Approximate RAM footprint in MB when loaded.
    pub ram_footprint_mb: u64,

    /// Recommended context window size (tokens).
    pub recommended_context_size: u32,

    /// Primary download URL (GGUF format).
    pub gguf_url: String,

    /// Alternate mirror URLs (e.g. for mainland China).
    #[serde(default)]
    pub mirror_urls: Vec<String>,

    /// SHA-256 hex digest of the GGUF file.
    pub sha256: String,

    /// File size in bytes (used for progress reporting).
    pub size_bytes: u64,
}

/// A platform-specific llama-server binary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryEntry {
    /// Platform string, e.g. "macos-arm64", "macos-x86_64", "linux-x86_64", "windows-x86_64".
    pub platform: String,

    /// Download URL for the binary (or zip containing it).
    pub url: String,

    /// SHA-256 hex digest of the downloaded file.
    pub sha256: String,

    /// File size in bytes.
    pub size_bytes: u64,

    /// Whether the downloaded file is a zip that needs extraction.
    #[serde(default)]
    pub is_zip: bool,

    /// Path inside the zip where the binary lives (only used when is_zip=true).
    #[serde(default)]
    pub zip_inner_path: Option<String>,
}
