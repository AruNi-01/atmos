//! On-disk layout for token-usage local state: `~/.atmos/data/token-usage`.
//!
//! Intentionally **does not** nest under `ATMOS_DATA_DIR` (Desktop sets that to
//! `~/.atmos/data/desktop` for shell-specific data only). Product feature dirs
//! stay siblings under `data/`.
//!
//! Override with `ATMOS_TOKEN_USAGE_DIR` (absolute path) for tests or custom installs.

use std::fs;
use std::path::PathBuf;

const DATA_DIR: &str = "token-usage";

/// Canonical data directory. Callers should create it if needed.
pub(crate) fn data_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("ATMOS_TOKEN_USAGE_DIR") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }

    let home = dirs::home_dir()?;
    let canonical = home.join(".atmos").join("data").join(DATA_DIR);
    migrate_legacy_desktop_nesting(&home, &canonical);
    Some(canonical)
}

/// Path to a file under the data dir (may not exist yet).
pub(crate) fn data_path(relative: &str) -> Option<PathBuf> {
    data_dir().map(|dir| dir.join(relative))
}

/// Older Desktop runs nested under `ATMOS_DATA_DIR` → `data/desktop/token-usage`.
/// Best-effort one-shot move into the canonical location.
fn migrate_legacy_desktop_nesting(home: &std::path::Path, canonical: &std::path::Path) {
    let legacy = home
        .join(".atmos")
        .join("data")
        .join("desktop")
        .join(DATA_DIR);

    if !legacy.exists() || legacy == canonical {
        return;
    }
    // Prefer keeping an already-populated canonical tree.
    if canonical.exists() {
        let canonical_empty = fs::read_dir(canonical)
            .map(|mut d| d.next().is_none())
            .unwrap_or(false);
        if !canonical_empty {
            return;
        }
        let _ = fs::remove_dir_all(canonical);
    }
    if let Some(parent) = canonical.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if fs::rename(&legacy, canonical).is_err() {
        // Cross-device rename can fail; fall back to copy+remove best-effort.
        if copy_dir_recursive(&legacy, canonical).is_ok() {
            let _ = fs::remove_dir_all(&legacy);
        }
    }
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Serialize env mutation in tests.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn data_dir_honors_override() {
        let _guard = ENV_LOCK.lock().unwrap();
        let prev = std::env::var_os("ATMOS_TOKEN_USAGE_DIR");
        let dir = std::env::temp_dir().join(format!(
            "atmos-token-usage-override-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        std::env::set_var("ATMOS_TOKEN_USAGE_DIR", &dir);
        assert_eq!(data_dir().as_ref(), Some(&dir));
        match prev {
            Some(v) => std::env::set_var("ATMOS_TOKEN_USAGE_DIR", v),
            None => std::env::remove_var("ATMOS_TOKEN_USAGE_DIR"),
        }
    }

    #[test]
    fn migrate_moves_legacy_desktop_nesting() {
        let home = std::env::temp_dir().join(format!(
            "atmos-home-tu-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let legacy = home
            .join(".atmos")
            .join("data")
            .join("desktop")
            .join(DATA_DIR);
        let canonical = home.join(".atmos").join("data").join(DATA_DIR);
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join("overview-cache.json"), b"{}").unwrap();

        migrate_legacy_desktop_nesting(&home, &canonical);

        assert!(canonical.join("overview-cache.json").exists());
        assert!(!legacy.exists());
        let _ = fs::remove_dir_all(&home);
    }
}
