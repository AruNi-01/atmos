use serde_json::{json, Value};
use tracing::{debug, warn};

use super::{home_dir, AgentHookToolStatus};

fn hooks_json_path() -> Option<std::path::PathBuf> {
    home_dir().ok().map(|h| h.join(".codex").join("hooks.json"))
}

fn config_toml_path() -> Option<std::path::PathBuf> {
    home_dir().ok().map(|h| h.join(".codex").join("config.toml"))
}

fn hook_url(port: u16) -> String {
    format!("http://localhost:{}/hooks/codex", port)
}

fn is_atmos_hook(hook_entry: &Value, port: u16) -> bool {
    let url = hook_url(port);
    hook_entry
        .get("hooks")
        .and_then(|h| h.as_array())
        .map(|arr| {
            arr.iter().any(|h| {
                if h.get("url").and_then(|u| u.as_str()) == Some(&url) {
                    return true;
                }
                if let Some(cmd) = h.get("command").and_then(|c| c.as_str()) {
                    return cmd.contains(&url);
                }
                false
            })
        })
        .unwrap_or(false)
}

fn build_hook_entries(port: u16) -> Value {
    let url = hook_url(port);
    let cmd = format!(
        r#"[ "$ATMOS_MANAGED" = "1" ] && curl -sf -X POST -H 'Content-Type: application/json' -H "X-Atmos-Workspace: $ATMOS_WORKSPACE_ID" -H "X-Atmos-Pane: $ATMOS_PANE_ID" -d @- '{url}' >/dev/null 2>&1 || true"#,
        url = url,
    );
    json!({
        "SessionStart": [{
            "hooks": [{ "type": "command", "command": &cmd, "timeout": 5 }]
        }],
        "UserPromptSubmit": [{
            "hooks": [{ "type": "command", "command": &cmd, "timeout": 5 }]
        }],
        "PreToolUse": [{
            "matcher": "Bash",
            "hooks": [{ "type": "command", "command": &cmd, "async": true }]
        }],
        "Stop": [{
            "hooks": [{ "type": "command", "command": &cmd, "async": true }]
        }]
    })
}

pub(super) fn install(port: u16) -> AgentHookToolStatus {
    let hooks_path = match hooks_json_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let codex_dir = hooks_path.parent().unwrap();

    let detected = codex_dir.exists()
        || which_exists("codex");

    if !detected {
        debug!("Codex CLI not detected, skipping");
        return AgentHookToolStatus::not_detected();
    }

    if !codex_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(codex_dir) {
            return AgentHookToolStatus::failed(hooks_path.display().to_string(), e.to_string());
        }
    }

    let path_str = hooks_path.display().to_string();

    let mut settings: Value = if hooks_path.exists() {
        match std::fs::read_to_string(&hooks_path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| json!({})),
            Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
        }
    } else {
        json!({})
    };

    let new_hooks = build_hook_entries(port);
    let hooks_obj = settings
        .as_object_mut()
        .unwrap()
        .entry("hooks")
        .or_insert_with(|| json!({}));

    if let Some(hooks_map) = hooks_obj.as_object_mut() {
        if let Some(new_map) = new_hooks.as_object() {
            for (event_name, new_entries) in new_map {
                let event_arr = hooks_map.entry(event_name).or_insert_with(|| json!([]));

                if let Some(arr) = event_arr.as_array_mut() {
                    let already = arr.iter().any(|entry| is_atmos_hook(entry, port));
                    if !already {
                        if let Some(new_arr) = new_entries.as_array() {
                            arr.extend(new_arr.iter().cloned());
                        }
                    }
                }
            }
        }
    }

    if let Err(e) = write_json(&hooks_path, &settings) {
        return AgentHookToolStatus::failed(&path_str, e);
    }

    ensure_hooks_feature_flag();

    AgentHookToolStatus::success(&path_str)
}

pub(super) fn uninstall(port: u16) -> AgentHookToolStatus {
    let hooks_path = match hooks_json_path() {
        Some(p) if p.exists() => p,
        _ => return AgentHookToolStatus::not_detected(),
    };

    let path_str = hooks_path.display().to_string();

    let mut settings: Value = match std::fs::read_to_string(&hooks_path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| json!({})),
        Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
    };

    if let Some(hooks_map) = settings.get_mut("hooks").and_then(|h| h.as_object_mut()) {
        let event_names: Vec<String> = hooks_map.keys().cloned().collect();
        for event_name in event_names {
            if let Some(arr) = hooks_map.get_mut(&event_name).and_then(|v| v.as_array_mut()) {
                arr.retain(|entry| !is_atmos_hook(entry, port));
                if arr.is_empty() {
                    hooks_map.remove(&event_name);
                }
            }
        }
    }

    match write_json(&hooks_path, &settings) {
        Ok(()) => {
            let mut status = AgentHookToolStatus::success(&path_str);
            status.installed = false;
            status
        }
        Err(e) => AgentHookToolStatus::failed(&path_str, e),
    }
}

pub(super) fn check(port: u16) -> AgentHookToolStatus {
    let hooks_path = match hooks_json_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let codex_dir = hooks_path.parent().unwrap();
    let detected = codex_dir.exists() || which_exists("codex");
    if !detected {
        return AgentHookToolStatus::not_detected();
    }

    let path_str = hooks_path.display().to_string();

    if !hooks_path.exists() {
        return AgentHookToolStatus { detected: true, installed: false, config_path: Some(path_str), error: None };
    }

    let settings: Value = match std::fs::read_to_string(&hooks_path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| json!({})),
        Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
    };

    let installed = settings
        .get("hooks")
        .and_then(|h| h.get("Stop"))
        .and_then(|arr| arr.as_array())
        .map(|arr| arr.iter().any(|entry| is_atmos_hook(entry, port)))
        .unwrap_or(false);

    AgentHookToolStatus { detected: true, installed, config_path: Some(path_str), error: None }
}

fn ensure_hooks_feature_flag() {
    let path = match config_toml_path() {
        Some(p) => p,
        None => return,
    };

    let content = if path.exists() {
        std::fs::read_to_string(&path).unwrap_or_default()
    } else {
        String::new()
    };

    if content.contains("hooks = true") || content.contains("hooks=true") {
        return;
    }

    let new_content = if content.contains("[features]") {
        content.replace("[features]", "[features]\nhooks = true")
    } else {
        format!("{}\n[features]\nhooks = true\n", content.trim_end())
    };

    if let Err(e) = std::fs::write(&path, new_content) {
        warn!("Failed to enable Codex hooks feature flag at {:?}: {}", path, e);
    }
}

fn write_json(path: &std::path::Path, value: &Value) -> std::result::Result<(), String> {
    let content = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}

fn which_exists(cmd: &str) -> bool {
    std::process::Command::new("which")
        .arg(cmd)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}
