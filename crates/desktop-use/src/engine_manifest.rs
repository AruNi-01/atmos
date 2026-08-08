//! Pinned control-engine package manifest (Atmos white-label over upstream releases).
//!
//! **Authority order (optimal product design):**
//! 1. `ATMOS_DESKTOP_USE_MANIFEST` path (Desktop App Resources inject this)
//! 2. Embedded `default.json` (CLI-only / tests / fallback when env unset)

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

/// Embedded pin — bumped with intentional release review (APP-052).
/// Desktop production should prefer [`EngineManifest::load`] with App Resources.
pub const EMBEDDED_MANIFEST_JSON: &str = include_str!("../manifest/default.json");

/// Env var: absolute path to authoritative `engine-manifest.json` (Desktop App Resources).
pub const MANIFEST_ENV: &str = "ATMOS_DESKTOP_USE_MANIFEST";

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

    /// Load from file path.
    pub fn from_path(path: impl AsRef<Path>) -> Result<Self, String> {
        let path = path.as_ref();
        let bytes = fs::read(path)
            .map_err(|e| format!("failed to read engine manifest {}: {e}", path.display()))?;
        let text = String::from_utf8(bytes)
            .map_err(|e| format!("engine manifest {} is not utf-8: {e}", path.display()))?;
        Self::parse(&text)
    }

    /// Product authority: env path first, else embedded pin.
    pub fn load() -> Result<Self, String> {
        if let Ok(raw) = std::env::var(MANIFEST_ENV) {
            let p = raw.trim();
            if !p.is_empty() {
                let path = Path::new(p);
                if path.is_file() {
                    return Self::from_path(path);
                }
                // Explicit env set but missing file: fail closed so we never
                // silently fall back to a stale embedded pin in Desktop.
                return Err(format!("{MANIFEST_ENV} points to missing file: {p}"));
            }
        }
        Self::embedded()
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
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn embedded_manifest_parses_and_has_pin() {
        let m = EngineManifest::embedded().expect("embedded");
        assert_eq!(m.schema_version, 1);
        assert_eq!(m.engine_version, "0.19.2");
        assert!(m.upstream_tag.contains("0.19.2"));
        assert_eq!(m.host_app_name, "Atmos Desktop Use");
        assert_eq!(m.host_bundle_id, "com.atmos.desktop.use");
        assert!(!m.binaries.is_empty());
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

    #[test]
    fn load_from_env_path_overrides_embedded() {
        let mut f = NamedTempFile::new().unwrap();
        let mut m = EngineManifest::embedded().unwrap();
        m.engine_version = "9.9.9-test".into();
        m.upstream_tag = "test-v9.9.9".into();
        let json = serde_json::to_string_pretty(&m).unwrap();
        f.write_all(json.as_bytes()).unwrap();
        // SAFETY: test isolation
        unsafe {
            std::env::set_var(MANIFEST_ENV, f.path());
        }
        let loaded = EngineManifest::load().expect("load env");
        assert_eq!(loaded.engine_version, "9.9.9-test");
        unsafe {
            std::env::remove_var(MANIFEST_ENV);
        }
    }

    #[test]
    fn load_without_env_uses_embedded() {
        unsafe {
            std::env::remove_var(MANIFEST_ENV);
        }
        let m = EngineManifest::load().unwrap();
        assert_eq!(m.engine_version, "0.19.2");
    }
}
