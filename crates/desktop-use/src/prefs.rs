//! User preferences for Desktop Use chrome (operation border, idle clear).

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::config::resolve_data_dir;

/// Default: clear highlight ~8s after last show (operation idle).
pub const DEFAULT_HIGHLIGHT_IDLE_MS: u64 = 8_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DesktopUsePrefs {
    /// When false, drive actions do not draw the operation border / status pill.
    #[serde(default = "default_true")]
    pub operation_border_enabled: bool,
    /// Auto-clear overlay after this many ms without a new show (0 = no auto-clear).
    #[serde(default = "default_idle_ms")]
    pub highlight_idle_ms: u64,
}

fn default_true() -> bool {
    true
}

fn default_idle_ms() -> u64 {
    DEFAULT_HIGHLIGHT_IDLE_MS
}

impl Default for DesktopUsePrefs {
    fn default() -> Self {
        Self {
            operation_border_enabled: true,
            highlight_idle_ms: DEFAULT_HIGHLIGHT_IDLE_MS,
        }
    }
}

pub fn prefs_path() -> PathBuf {
    resolve_data_dir().join("prefs.json")
}

pub fn load_prefs() -> DesktopUsePrefs {
    let path = prefs_path();
    let Ok(bytes) = fs::read(&path) else {
        return DesktopUsePrefs::default();
    };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

pub fn save_prefs(prefs: &DesktopUsePrefs) -> Result<(), String> {
    let path = prefs_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create prefs dir failed: {e}"))?;
    }
    let json = serde_json::to_vec_pretty(prefs).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("write prefs failed: {e}"))
}

pub fn update_prefs(
    operation_border_enabled: Option<bool>,
    highlight_idle_ms: Option<u64>,
) -> Result<DesktopUsePrefs, String> {
    let mut p = load_prefs();
    if let Some(v) = operation_border_enabled {
        p.operation_border_enabled = v;
    }
    if let Some(v) = highlight_idle_ms {
        p.highlight_idle_ms = v;
    }
    save_prefs(&p)?;
    Ok(p)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use tempfile::tempdir;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn default_prefs() {
        let p = DesktopUsePrefs::default();
        assert!(p.operation_border_enabled);
        assert_eq!(p.highlight_idle_ms, DEFAULT_HIGHLIGHT_IDLE_MS);
    }

    #[test]
    fn roundtrip_prefs_file() {
        let _g = ENV_LOCK.lock().unwrap();
        let dir = tempdir().unwrap();
        // SAFETY: single-threaded test under mutex
        unsafe {
            std::env::set_var("ATMOS_DESKTOP_USE_HOME", dir.path());
        }
        let p = DesktopUsePrefs {
            operation_border_enabled: false,
            highlight_idle_ms: 12_000,
        };
        save_prefs(&p).unwrap();
        let loaded = load_prefs();
        assert_eq!(loaded, p);
        unsafe {
            std::env::remove_var("ATMOS_DESKTOP_USE_HOME");
        }
    }
}
