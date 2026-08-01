//! On-disk layout for quota-usage local state: `~/.atmos/quota-usage`.

use std::path::PathBuf;

const DATA_DIR: &str = "quota-usage";

/// Data directory (`~/.atmos/quota-usage`). Callers should create it if needed.
pub(crate) fn data_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".atmos").join(DATA_DIR))
}

/// Path to a file under the data dir (may not exist yet).
pub(crate) fn data_path(relative: &str) -> Option<PathBuf> {
    data_dir().map(|dir| dir.join(relative))
}

/// Same as [`data_path`] — kept as a named helper for call sites that read files.
pub(crate) fn resolve_data_file(file_name: &str) -> Option<PathBuf> {
    data_path(file_name)
}
