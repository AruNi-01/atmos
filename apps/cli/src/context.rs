//! Sticky project/workspace context for CLI (`~/.atmos/cli-context.json`).

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CliContext {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
}

pub fn context_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".atmos")
        .join("cli-context.json")
}

pub fn load() -> CliContext {
    let path = context_path();
    let Ok(raw) = fs::read_to_string(&path) else {
        return CliContext::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn save(ctx: &CliContext) -> Result<(), String> {
    let path = context_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create ~/.atmos: {e}"))?;
    }
    let raw = serde_json::to_string_pretty(ctx).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| format!("write cli-context: {e}"))
}

pub fn clear() -> Result<(), String> {
    save(&CliContext::default())
}

/// Resolution order: explicit flag → env → context file.
pub fn resolve_project(flag: Option<&str>) -> Option<String> {
    flag.map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| {
            std::env::var("ATMOS_PROJECT")
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        })
        .or_else(|| load().project_id.filter(|s| !s.trim().is_empty()))
}

pub fn resolve_workspace(flag: Option<&str>) -> Option<String> {
    flag.map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| {
            std::env::var("ATMOS_WORKSPACE")
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        })
        .or_else(|| load().workspace_id.filter(|s| !s.trim().is_empty()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_prefers_flag_over_env() {
        // Cannot safely mutate env in parallel tests; pure unit of flag path:
        assert_eq!(
            resolve_project(Some("from-flag")).as_deref(),
            Some("from-flag")
        );
    }
}
