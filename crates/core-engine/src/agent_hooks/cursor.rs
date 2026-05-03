use serde_json::{json, Value};
use tracing::debug;

use super::{home_dir, AgentHookToolStatus};

fn hooks_json_path() -> Option<std::path::PathBuf> {
    home_dir()
        .ok()
        .map(|h| h.join(".cursor").join("hooks.json"))
}

fn hook_url(port: u16) -> String {
    format!("http://localhost:{}/hooks/cursor", port)
}

fn hook_path_marker() -> &'static str {
    "ATMOS_MANAGED"
}

fn is_atmos_hook(hook_entry: &Value) -> bool {
    let marker = hook_path_marker();
    if let Some(cmd) = hook_entry.get("command").and_then(|c| c.as_str()) {
        return cmd.contains(marker);
    }
    false
}

fn hook_path_pattern() -> &'static str {
    "localhost:/hooks/cursor"
}

fn build_cmd(port: u16, event_name: &str) -> String {
    let url = hook_url(port);
    format!(
        r#"[ "$ATMOS_MANAGED" = "1" ] && curl -sf -X POST -H 'Content-Type: application/json' -H "X-Atmos-Context: $ATMOS_CONTEXT_ID" -H "X-Atmos-Pane: $ATMOS_PANE_ID" -d '{{"hook_event_name":"{event_name}"}}' '{url}' >/dev/null 2>&1 || true"#,
        event_name = event_name,
        url = url,
    )
}

fn build_stdin_cmd(port: u16, event_name: &str) -> String {
    let url = hook_url(port);
    format!(
        r#"[ "$ATMOS_MANAGED" = "1" ] && cat | curl -sf -X POST -H 'Content-Type: application/json' -H "X-Atmos-Context: $ATMOS_CONTEXT_ID" -H "X-Atmos-Pane: $ATMOS_PANE_ID" -d @- '{url}' >/dev/null 2>&1 || true"#,
        url = url,
    )
}

fn build_hook_entries(port: u16) -> Value {
    json!({
        "sessionStart": [{
            "command": build_cmd(port, "sessionStart")
        }],
        "beforeSubmitPrompt": [{
            "command": build_stdin_cmd(port, "beforeSubmitPrompt")
        }],
        "preToolUse": [{
            "command": build_stdin_cmd(port, "preToolUse"),
            "matcher": "*"
        }],
        "postToolUse": [{
            "command": build_stdin_cmd(port, "postToolUse"),
            "matcher": "*"
        }],
        "postToolUseFailure": [{
            "command": build_stdin_cmd(port, "postToolUseFailure"),
            "matcher": "*"
        }],
        "stop": [{
            "command": build_stdin_cmd(port, "stop"),
            "loop_limit": 5
        }],
        "sessionEnd": [{
            "command": build_cmd(port, "sessionEnd")
        }]
    })
}

pub(super) fn install(port: u16) -> AgentHookToolStatus {
    let path = match hooks_json_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let cursor_dir = path.parent().unwrap();

    let detected = cursor_dir.exists() || which_exists("cursor");
    if !detected {
        debug!("Cursor not detected (no config dir, not in PATH), skipping");
        return AgentHookToolStatus::not_detected();
    }

    if !cursor_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(cursor_dir) {
            return AgentHookToolStatus::failed(path.display().to_string(), e.to_string());
        }
    }

    let path_str = path.display().to_string();

    let mut settings: Value = if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| json!({})),
            Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
        }
    } else {
        json!({"version": 1})
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
                    arr.retain(|entry| !is_atmos_hook(entry));
                    if let Some(new_arr) = new_entries.as_array() {
                        arr.extend(new_arr.iter().cloned());
                    }
                }
            }
        }
    }

    match write_json(&path, &settings) {
        Ok(()) => AgentHookToolStatus::success(&path_str),
        Err(e) => AgentHookToolStatus::failed(&path_str, e),
    }
}

pub(super) fn uninstall() -> AgentHookToolStatus {
    let path = match hooks_json_path() {
        Some(p) if p.exists() => p,
        _ => return AgentHookToolStatus::not_detected(),
    };

    let path_str = path.display().to_string();

    let mut settings: Value = match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| json!({})),
        Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
    };

    if let Some(hooks_map) = settings.get_mut("hooks").and_then(|h| h.as_object_mut()) {
        let event_names: Vec<String> = hooks_map.keys().cloned().collect();
        for event_name in event_names {
            if let Some(arr) = hooks_map
                .get_mut(&event_name)
                .and_then(|v| v.as_array_mut())
            {
                arr.retain(|entry| !is_atmos_hook(entry));
                if arr.is_empty() {
                    hooks_map.remove(&event_name);
                }
            }
        }
        if hooks_map.is_empty() {
            settings.as_object_mut().unwrap().remove("hooks");
        }
    }

    match write_json(&path, &settings) {
        Ok(()) => {
            let mut status = AgentHookToolStatus::success(&path_str);
            status.installed = false;
            status
        }
        Err(e) => AgentHookToolStatus::failed(&path_str, e),
    }
}

pub(super) fn check() -> AgentHookToolStatus {
    let path = match hooks_json_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let cursor_dir = path.parent().unwrap();
    let detected = cursor_dir.exists() || which_exists("cursor");
    if !detected {
        return AgentHookToolStatus::not_detected();
    }

    let path_str = path.display().to_string();

    if !path.exists() {
        return AgentHookToolStatus {
            detected: true,
            installed: false,
            config_path: Some(path_str),
            error: None,
        };
    }

    let settings: Value = match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| json!({})),
        Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
    };

    let installed = settings
        .get("hooks")
        .and_then(|h| h.get("stop"))
        .and_then(|arr| arr.as_array())
        .map(|arr| arr.iter().any(|entry| is_atmos_hook(entry)))
        .unwrap_or(false);

    AgentHookToolStatus {
        detected: true,
        installed,
        config_path: Some(path_str),
        error: None,
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
