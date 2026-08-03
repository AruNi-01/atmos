//! Pinned control-engine package manifest (Atmos white-label over upstream releases).

use serde::{Deserialize, Serialize};

/// Embedded pin — bump with intentional release review (APP-052).
pub const EMBEDDED_MANIFEST_JSON: &str = include_str!("../manifest/default.json");

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EngineManifest {
    pub schema_version: u32,
    pub engine_version: String,
    pub upstream_tag: String,
    pub display_name: String,
    pub host_app_name: String,
    pub host_bundle_id: String,
    pub binaries: Vec<BinaryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BinaryEntry {
    pub platform: String,
    pub url: String,
    pub sha256: String,
    pub archive_kind: String,
    pub engine_inner_path: String,
    #[serde(default)]
    pub host_app_inner_path: Option<String>,
}

impl EngineManifest {
    pub fn parse(json: &str) -> Result<Self, String> {
        serde_json::from_str(json).map_err(|e| format!("invalid engine manifest: {e}"))
    }

    pub fn embedded() -> Result<Self, String> {
        Self::parse(EMBEDDED_MANIFEST_JSON)
    }

    pub fn find_for_platform(&self, platform: &str) -> Option<&BinaryEntry> {
        self.binaries.iter().find(|b| b.platform == platform)
    }
}

/// Rustc target triple for this build.
pub fn current_platform() -> &'static str {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "x86_64-apple-darwin"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "aarch64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "x86_64-pc-windows-msvc"
    } else {
        "unknown"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_manifest_parses_and_has_pin() {
        let m = EngineManifest::embedded().expect("embedded");
        assert_eq!(m.schema_version, 1);
        assert_eq!(m.engine_version, "0.17.0");
        assert!(m.upstream_tag.contains("0.17.0"));
        assert_eq!(m.host_app_name, "Atmos Desktop Use");
        assert_eq!(m.host_bundle_id, "com.atmos.desktop.use");
        assert!(!m.binaries.is_empty());
        // User-facing fields must not be vendor tokens
        assert!(!crate::strings::contains_vendor_brand(&m.display_name));
        assert!(!crate::strings::contains_vendor_brand(&m.host_app_name));
    }

    #[test]
    fn platform_lookup() {
        let m = EngineManifest::embedded().unwrap();
        let entry = m
            .find_for_platform("aarch64-apple-darwin")
            .expect("darwin arm");
        assert!(entry.url.contains("darwin-arm64"));
        assert_eq!(entry.sha256.len(), 64);
    }
}
