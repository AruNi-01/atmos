use std::path::PathBuf;

use crate::strings::USER_DATA_DIR_NAME;

/// Root directory for managed Desktop Use data (`~/.atmos/desktop-use`).
pub fn desktop_use_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".atmos")
        .join(USER_DATA_DIR_NAME)
}

pub fn bin_dir() -> PathBuf {
    desktop_use_dir().join("bin")
}

pub fn logs_dir() -> PathBuf {
    desktop_use_dir().join("logs")
}

pub fn state_path() -> PathBuf {
    desktop_use_dir().join("state.json")
}

pub fn manifest_path() -> PathBuf {
    desktop_use_dir().join("manifest.json")
}

/// Path to the optional control-engine binary (Atmos-managed name).
pub fn engine_bin_path() -> PathBuf {
    let name = if cfg!(windows) {
        "atmos-desktop-control.exe"
    } else {
        "atmos-desktop-control"
    };
    bin_dir().join(name)
}

pub fn ensure_dirs() -> std::io::Result<()> {
    std::fs::create_dir_all(bin_dir())?;
    std::fs::create_dir_all(logs_dir())?;
    Ok(())
}

/// Override root for tests (`ATMOS_DESKTOP_USE_HOME`).
pub fn resolve_data_dir() -> PathBuf {
    if let Ok(p) = std::env::var("ATMOS_DESKTOP_USE_HOME") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    desktop_use_dir()
}

pub fn resolve_engine_bin() -> PathBuf {
    if let Ok(p) = std::env::var("ATMOS_DESKTOP_USE_ENGINE") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    resolve_data_dir().join("bin").join(if cfg!(windows) {
        "atmos-desktop-control.exe"
    } else {
        "atmos-desktop-control"
    })
}

pub fn resolve_state_path() -> PathBuf {
    resolve_data_dir().join("state.json")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_dir_name_is_desktop_use() {
        let dir = desktop_use_dir();
        assert!(dir.ends_with("desktop-use") || dir.to_string_lossy().contains("desktop-use"));
    }
}
