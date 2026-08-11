//! Smart upgrade of user `terminal_code_agent.json` when built-in agent
//! defaults change.
//!
//! Rules:
//! - Bump is driven by `builtin_agents.meta.json` → `version`.
//! - Entries the user **customized** (cmd/flags/interactiveFlags not equal to
//!   any built-in default variant) are left untouched.
//! - Global **YOLO mode** is not a per-agent command edit; flags that merely
//!   match YOLO-on or YOLO-off built-in defaults are treated as non-custom and
//!   may be stripped so the new manifest applies under the current YOLO toggle.

use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

use super::agents::{
    definition_launch_flags_for_upgrade, load_builtin_terminal_agents_for_upgrade,
    TerminalAgentDefinitionPublic,
};
use super::terminal_agent_manifest::builtin_terminal_agents_manifest_version;
use crate::error::{Result, ServiceError};

fn function_settings_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".atmos")
        .join("config")
        .join("function_settings.json")
}

fn terminal_code_agent_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".atmos")
        .join("config")
        .join("agent")
        .join("terminal_code_agent.json")
}

fn read_json_object(path: &PathBuf) -> Value {
    if !path.exists() {
        return json!({});
    }
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_else(|| json!({}))
}

fn write_json_pretty(path: &PathBuf, value: &Value) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            ServiceError::Validation(format!("Failed to create {}: {e}", parent.display()))
        })?;
    }
    let pretty = serde_json::to_string_pretty(value).map_err(|e| {
        ServiceError::Validation(format!("Failed to serialize {}: {e}", path.display()))
    })?;
    fs::write(path, pretty).map_err(|e| {
        ServiceError::Validation(format!("Failed to write {}: {e}", path.display()))
    })?;
    Ok(())
}

fn applied_manifest_version(function_settings: &Value) -> u64 {
    function_settings
        .get("agent_cli")
        .and_then(|v| v.get("builtin_manifest_version"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0)
}

fn set_applied_manifest_version(function_settings: &mut Value, version: u64) {
    let obj = function_settings.as_object_mut().expect("object");
    let agent_cli = obj.entry("agent_cli").or_insert_with(|| json!({}));
    if let Some(section) = agent_cli.as_object_mut() {
        section.insert("builtin_manifest_version".to_string(), json!(version));
    }
}

fn trim_str(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// True when the user entry is a real customization (not just YOLO on/off defaults).
fn is_user_customized_command(entry: &Value, definition: &TerminalAgentDefinitionPublic) -> bool {
    let (yolo_params, yolo_interactive) = definition_launch_flags_for_upgrade(definition, true);
    let (safe_params, safe_interactive) = definition_launch_flags_for_upgrade(definition, false);

    if let Some(cmd) = trim_str(entry.get("cmd").and_then(|v| v.as_str())) {
        if cmd != definition.cmd {
            return true;
        }
    }

    if let Some(flags) = trim_str(entry.get("flags").and_then(|v| v.as_str())) {
        if flags != yolo_params && flags != safe_params {
            return true;
        }
    }

    if let Some(interactive) = trim_str(entry.get("interactiveFlags").and_then(|v| v.as_str())) {
        if interactive != yolo_interactive && interactive != safe_interactive {
            return true;
        }
    }

    false
}

/// Strip non-custom flag overrides so runtime falls through to the new manifest
/// (+ current global YOLO mode). Keep `enabled: false` and truly custom `cmd`.
fn strip_non_custom_overrides(
    entry: &mut Value,
    definition: &TerminalAgentDefinitionPublic,
) -> bool {
    if is_user_customized_command(entry, definition) {
        return false;
    }

    let mut changed = false;
    if let Some(obj) = entry.as_object_mut() {
        if obj.contains_key("flags") {
            obj.remove("flags");
            changed = true;
        }
        if obj.contains_key("interactiveFlags") {
            obj.remove("interactiveFlags");
            changed = true;
        }
        // Drop default cmd so the built-in cmd tracks future renames.
        if let Some(cmd) = trim_str(obj.get("cmd").and_then(|v| v.as_str())) {
            if cmd == definition.cmd {
                obj.remove("cmd");
                changed = true;
            }
        }
        // Drop label if it only mirrors built-in.
        if let Some(label) = trim_str(obj.get("label").and_then(|v| v.as_str())) {
            if label == definition.label {
                obj.remove("label");
                changed = true;
            }
        }
        // If nothing meaningful remains besides id (+ optional enabled:true), drop later.
        let enabled_false = obj.get("enabled").and_then(|v| v.as_bool()) == Some(false);
        let has_cmd = trim_str(obj.get("cmd").and_then(|v| v.as_str())).is_some();
        if !enabled_false && !has_cmd {
            // Mark for removal by clearing id-only shell — caller filters.
            obj.insert("__drop__".to_string(), json!(true));
            changed = true;
        }
    }
    changed
}

/// Apply smart upgrade if the shipped builtin agents manifest is newer than
/// the version last applied on this machine.
///
/// Safe to call on every settings bootstrap / code-agent read.
pub fn ensure_builtin_terminal_agents_upgraded() -> Result<bool> {
    let current = builtin_terminal_agents_manifest_version();
    if current == 0 {
        return Ok(false);
    }

    let settings_path = function_settings_path();
    let mut function_settings = read_json_object(&settings_path);
    let applied = applied_manifest_version(&function_settings);
    if applied >= current {
        return Ok(false);
    }

    let built_ins = load_builtin_terminal_agents_for_upgrade().map_err(|e| {
        ServiceError::Validation(format!("Failed to load builtin terminal agents: {e}"))
    })?;
    let by_id: std::collections::HashMap<String, TerminalAgentDefinitionPublic> = built_ins
        .into_iter()
        .map(|agent| (agent.id.clone(), agent))
        .collect();

    let agents_path = terminal_code_agent_path();
    let mut agents_file = read_json_object(&agents_path);
    if !agents_file.is_object() {
        agents_file = json!({ "agents": [] });
    }

    let mut agents_changed = false;
    if let Some(agents) = agents_file.get_mut("agents").and_then(|v| v.as_array_mut()) {
        let mut next = Vec::with_capacity(agents.len());
        for entry in agents.drain(..) {
            let id = entry
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if id.is_empty() {
                continue;
            }

            // Custom (non-built-in) agents are never touched.
            let Some(definition) = by_id.get(&id) else {
                next.push(entry);
                continue;
            };

            let mut entry = entry;
            if strip_non_custom_overrides(&mut entry, definition) {
                agents_changed = true;
            }
            if entry
                .get("__drop__")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                agents_changed = true;
                continue;
            }
            if let Some(obj) = entry.as_object_mut() {
                obj.remove("__drop__");
            }
            next.push(entry);
        }
        *agents = next;
    }

    if agents_changed {
        write_json_pretty(&agents_path, &agents_file)?;
    }

    set_applied_manifest_version(&mut function_settings, current);
    write_json_pretty(&settings_path, &function_settings)?;

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::super::agents::definition_launch_flags_for_upgrade;
    use super::*;

    #[test]
    fn yolo_matching_flags_are_not_customized() {
        let def = TerminalAgentDefinitionPublic {
            id: "claude".to_string(),
            label: "Claude Code".to_string(),
            cmd: "claude".to_string(),
            params: "--print".to_string(),
            interactive_params: Some("".to_string()),
            yolo_params: Some("--dangerously-skip-permissions --print".to_string()),
            yolo_interactive_params: Some("--dangerously-skip-permissions".to_string()),
        };
        let (yolo_p, yolo_i) = definition_launch_flags_for_upgrade(&def, true);
        let entry = json!({
            "id": "claude",
            "cmd": "claude",
            "flags": yolo_p,
            "interactiveFlags": yolo_i,
            "enabled": true,
        });
        assert!(!is_user_customized_command(&entry, &def));
    }

    #[test]
    fn custom_flags_are_detected() {
        let def = TerminalAgentDefinitionPublic {
            id: "claude".to_string(),
            label: "Claude Code".to_string(),
            cmd: "claude".to_string(),
            params: "--print".to_string(),
            interactive_params: Some("".to_string()),
            yolo_params: Some("--dangerously-skip-permissions --print".to_string()),
            yolo_interactive_params: Some("--dangerously-skip-permissions".to_string()),
        };
        let entry = json!({
            "id": "claude",
            "flags": "--my-custom-flag",
        });
        assert!(is_user_customized_command(&entry, &def));
    }
}
