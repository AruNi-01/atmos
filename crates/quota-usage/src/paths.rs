//! On-disk layout for quota-usage local state: `~/.atmos/data/quota-usage`.
//!
//! Override with `ATMOS_QUOTA_USAGE_DIR` (absolute path) for tests or custom installs.

use std::path::PathBuf;

const DATA_DIR: &str = "quota-usage";

/// Data directory (`~/.atmos/quota-usage`). Callers should create it if needed.
pub(crate) fn data_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("ATMOS_QUOTA_USAGE_DIR") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }
    dirs::home_dir().map(|home| home.join(".atmos").join("data").join(DATA_DIR))
}

/// Path to a file under the data dir (may not exist yet).
pub(crate) fn data_path(relative: &str) -> Option<PathBuf> {
    data_dir().map(|dir| dir.join(relative))
}

/// Same as [`data_path`] — kept as a named helper for call sites that read files.
pub(crate) fn resolve_data_file(file_name: &str) -> Option<PathBuf> {
    data_path(file_name)
}
