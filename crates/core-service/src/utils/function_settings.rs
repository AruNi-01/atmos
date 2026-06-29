use serde_json::Value;
use std::path::PathBuf;

pub const SETTINGS_FUNCTION_KEY: &str = "workspace_settings";
const DEFAULT_BRANCH_PREFIX: &str = "atmos";

pub fn function_settings_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| {
        tracing::warn!(
            "Unable to determine home directory; falling back to current working directory for function_settings.json"
        );
        PathBuf::from(".")
    });

    home.join(".atmos").join("function_settings.json")
}

pub fn read_workspace_branch_prefix() -> String {
    let path = function_settings_path();
    if !path.exists() {
        return DEFAULT_BRANCH_PREFIX.to_string();
    }

    std::fs::read_to_string(&path)
        .ok()
        .and_then(|content| serde_json::from_str::<Value>(&content).ok())
        .and_then(|value| {
            value
                .get(SETTINGS_FUNCTION_KEY)?
                .get("branch_prefix")?
                .as_str()
                .map(String::from)
        })
        .unwrap_or_else(|| DEFAULT_BRANCH_PREFIX.to_string())
}
