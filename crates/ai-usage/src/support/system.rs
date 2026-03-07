use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::models::ProviderError;

pub(crate) fn run_command(binary: &str, args: &[&str]) -> Result<String, ProviderError> {
    let output = Command::new(binary)
        .args(args)
        .output()
        .map_err(|error| ProviderError::Fetch(format!("{binary}: {error}")))?;
    if !output.status.success() {
        return Err(ProviderError::Fetch(format!(
            "{binary} exited with {}",
            output.status
        )));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub(crate) fn run_sqlite_query(path: &Path, query: &str) -> Result<String, ProviderError> {
    let sqlite3 = [
        "/usr/bin/sqlite3",
        "/opt/homebrew/bin/sqlite3",
        "/usr/local/bin/sqlite3",
    ]
    .into_iter()
    .find(|candidate| Path::new(candidate).exists())
    .ok_or_else(|| {
        ProviderError::Fetch("sqlite3 is required for local state discovery".to_string())
    })?;

    let output = Command::new(sqlite3)
        .arg(path)
        .arg(".timeout 250")
        .arg(query)
        .output()
        .map_err(|error| ProviderError::Fetch(format!("{sqlite3}: {error}")))?;

    if !output.status.success() {
        return Err(ProviderError::Fetch(format!(
            "sqlite3 query failed for {}",
            path.display()
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub(crate) fn expand_home(raw_path: &str) -> Option<PathBuf> {
    if raw_path == "~" {
        return dirs::home_dir();
    }
    if let Some(rest) = raw_path.strip_prefix("~/") {
        return dirs::home_dir().map(|home| home.join(rest));
    }
    Some(PathBuf::from(raw_path))
}

pub(crate) fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
