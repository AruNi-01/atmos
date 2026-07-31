//! On-disk layout for quota-usage local state.
//!
//! Primary dir: `~/.atmos/quota-usage`
//! Legacy dir (pre-rename): `~/.atmos/ai-usage` — still read when present.

use std::path::PathBuf;

const PRIMARY_DIR: &str = "quota-usage";
const LEGACY_DIR: &str = "ai-usage";

/// Writable data directory (`~/.atmos/quota-usage`). Callers should create it if needed.
pub(crate) fn data_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".atmos").join(PRIMARY_DIR))
}

/// Resolve an existing file under the primary dir, falling back to the legacy `ai-usage` dir.
pub(crate) fn resolve_data_file(file_name: &str) -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let primary = home.join(".atmos").join(PRIMARY_DIR).join(file_name);
    if primary.is_file() {
        return Some(primary);
    }
    let legacy = home.join(".atmos").join(LEGACY_DIR).join(file_name);
    if legacy.is_file() {
        return Some(legacy);
    }
    // Prefer primary path for first-time writes (even if missing).
    Some(primary)
}

/// Join `relative` under the primary data dir (for new writes / defaults).
pub(crate) fn data_path(relative: &str) -> Option<PathBuf> {
    data_dir().map(|dir| dir.join(relative))
}
