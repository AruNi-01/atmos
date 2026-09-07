use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::types::{DeviceClaim, LastDevicePref};

pub fn claims_path(state_dir: &Path) -> PathBuf {
    state_dir.join("claims.json")
}

pub fn prefs_path(state_dir: &Path) -> PathBuf {
    state_dir.join("prefs.json")
}

pub fn persist_claims(state_dir: &Path, claims: &[DeviceClaim]) -> Result<(), String> {
    std::fs::create_dir_all(state_dir).map_err(|e| e.to_string())?;
    let path = claims_path(state_dir);
    if claims.is_empty() {
        let _ = std::fs::remove_file(path);
        return Ok(());
    }
    let json = serde_json::to_string_pretty(claims).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

pub fn load_claims(state_dir: &Path) -> Vec<DeviceClaim> {
    let Ok(text) = std::fs::read_to_string(claims_path(state_dir)) else {
        return Vec::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

pub fn load_prefs(state_dir: &Path) -> HashMap<String, LastDevicePref> {
    let Ok(text) = std::fs::read_to_string(prefs_path(state_dir)) else {
        return HashMap::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

pub fn persist_prefs(
    state_dir: &Path,
    prefs: &HashMap<String, LastDevicePref>,
) -> Result<(), String> {
    std::fs::create_dir_all(state_dir).map_err(|e| e.to_string())?;
    let path = prefs_path(state_dir);
    if prefs.is_empty() {
        let _ = std::fs::remove_file(&path);
        return Ok(());
    }
    let json = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}
