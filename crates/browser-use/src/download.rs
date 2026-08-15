//! Browser downloads always land in the system Downloads folder.
//!
//! `--dir` may name that folder or a subdirectory. Paths outside it are denied.

use std::env;
use std::path::{Component, Path, PathBuf};

/// Override for tests. Production code should leave this unset.
pub const DOWNLOAD_ROOT_ENV: &str = "ATMOS_BROWSER_USE_DOWNLOADS";

pub fn default_download_root() -> PathBuf {
    if let Ok(raw) = env::var(DOWNLOAD_ROOT_ENV) {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    dirs::download_dir()
        .or_else(|| dirs::home_dir().map(|home| home.join("Downloads")))
        .unwrap_or_else(|| PathBuf::from("Downloads"))
}

/// Resolve `--dir` to an allowed destination under the system Downloads folder.
pub fn resolve_download_dir(requested: Option<&str>) -> Result<String, String> {
    let root = default_download_root();
    let Some(raw) = requested.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(root.to_string_lossy().into_owned());
    };
    let candidate = expand_user(raw);
    let candidate = if candidate.is_absolute() {
        candidate
    } else {
        root.join(candidate)
    };
    let root_norm = normalize_path(&root);
    let candidate_norm = normalize_path(&candidate);
    if !is_path_inside(&root_norm, &candidate_norm) {
        return Err(format!(
            "Downloads must stay under the system Downloads folder ({})",
            root.display()
        ));
    }
    Ok(candidate_norm.to_string_lossy().into_owned())
}

fn expand_user(raw: &str) -> PathBuf {
    if raw == "~" {
        return dirs::home_dir().unwrap_or_else(|| PathBuf::from("~"));
    }
    if let Some(rest) = raw.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    #[cfg(windows)]
    if let Some(rest) = raw.strip_prefix("~\\") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(raw)
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => out.push(prefix.as_os_str()),
            Component::RootDir => out.push(component.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            Component::Normal(segment) => out.push(segment),
        }
    }
    out
}

fn is_path_inside(root: &Path, candidate: &Path) -> bool {
    #[cfg(windows)]
    {
        let root = root.to_string_lossy().to_ascii_lowercase();
        let candidate = candidate.to_string_lossy().to_ascii_lowercase();
        Path::new(&candidate) == Path::new(&root) || Path::new(&candidate).starts_with(&root)
    }
    #[cfg(not(windows))]
    {
        candidate == root || candidate.starts_with(root)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::binding::TEST_HOME_LOCK;
    use std::sync::MutexGuard;

    fn lock_env() -> MutexGuard<'static, ()> {
        TEST_HOME_LOCK.lock().expect("test home lock")
    }

    fn set_root(path: &Path) {
        // SAFETY: tests hold TEST_HOME_LOCK while mutating this process-wide env var.
        unsafe {
            env::set_var(DOWNLOAD_ROOT_ENV, path);
        }
    }

    fn clear_root() {
        unsafe {
            env::remove_var(DOWNLOAD_ROOT_ENV);
        }
    }

    #[test]
    fn omitted_dir_uses_system_downloads_override() {
        let _guard = lock_env();
        let tmp = tempfile::tempdir().unwrap();
        set_root(tmp.path());
        let resolved = resolve_download_dir(None).unwrap();
        assert_eq!(Path::new(&resolved), normalize_path(tmp.path()));
        clear_root();
    }

    #[test]
    fn relative_dir_stays_under_downloads() {
        let _guard = lock_env();
        let tmp = tempfile::tempdir().unwrap();
        set_root(tmp.path());
        let resolved = resolve_download_dir(Some("invoices")).unwrap();
        assert_eq!(
            Path::new(&resolved),
            normalize_path(&tmp.path().join("invoices"))
        );
        clear_root();
    }

    #[test]
    fn nested_absolute_dir_is_allowed() {
        let _guard = lock_env();
        let tmp = tempfile::tempdir().unwrap();
        set_root(tmp.path());
        let nested = tmp.path().join("a").join("b");
        let resolved = resolve_download_dir(Some(nested.to_str().unwrap())).unwrap();
        assert_eq!(Path::new(&resolved), normalize_path(&nested));
        clear_root();
    }

    #[test]
    fn parent_escape_is_denied() {
        let _guard = lock_env();
        let tmp = tempfile::tempdir().unwrap();
        set_root(tmp.path());
        let err = resolve_download_dir(Some("../outside")).unwrap_err();
        assert!(err.contains("system Downloads"));
        clear_root();
    }

    #[test]
    fn path_outside_downloads_is_denied() {
        let _guard = lock_env();
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        set_root(root.path());
        let err = resolve_download_dir(Some(outside.path().to_str().unwrap())).unwrap_err();
        assert!(err.contains("system Downloads"));
        clear_root();
    }
}
