use serde_json::{json, Value};
use tracing::debug;

use super::{
    atmos_context_curl_headers, atmos_managed_guard, home_dir, hook_version_assignment,
    hook_version_header_shell, installed_status_from_versions, parse_hook_version_from_json,
    AgentHookToolStatus,
};

fn settings_path() -> Option<std::path::PathBuf> {
    home_dir()
        .ok()
        .map(|h| h.join(".claude").join("settings.json"))
}

fn hook_url(port: u16) -> String {
    format!("http://localhost:{}/hooks/claude-code", port)
}

fn hook_path_marker() -> &'static str {
    "ATMOS_MANAGED"
}

fn is_atmos_hook(hook_entry: &Value) -> bool {
    let marker = hook_path_marker();
    hook_entry
        .get("hooks")
        .and_then(|h| h.as_array())
        .map(|arr| {
            arr.iter().any(|h| {
                if let Some(cmd) = h.get("command").and_then(|c| c.as_str()) {
                    return cmd.contains(marker);
                }
                if let Some(url) = h.get("url").and_then(|u| u.as_str()) {
                    return url.contains(marker);
                }
                false
            })
        })
        .unwrap_or(false)
}

fn build_cmd(port: u16, json_body: &str) -> String {
    let url = hook_url(port);
    let hook_version = hook_version_assignment();
    let hook_version_header = hook_version_header_shell();
    format!(
        r#"{guard} && {hook_version} && curl -sf -X POST -H 'Content-Type: application/json' {context_headers} {hook_version_header} -d '{json_body}' '{url}' >/dev/null 2>&1 || true"#,
        guard = atmos_managed_guard(),
        hook_version = hook_version,
        context_headers = atmos_context_curl_headers(),
        hook_version_header = hook_version_header,
        json_body = json_body,
        url = url,
    )
}

fn build_hook_entries(port: u16) -> Value {
    let session_start = build_cmd(port, r#"{"hook_event_name":"SessionStart"}"#);
    let user_prompt = build_cmd(port, r#"{"hook_event_name":"UserPromptSubmit"}"#);
    let pre_tool = build_cmd(port, r#"{"hook_event_name":"PreToolUse"}"#);
    let post_tool = build_cmd(port, r#"{"hook_event_name":"PostToolUse"}"#);
    let post_tool_fail = build_cmd(port, r#"{"hook_event_name":"PostToolUseFailure"}"#);
    let perm_request = build_cmd(port, r#"{"hook_event_name":"PermissionRequest"}"#);
    let notification = build_cmd(
        port,
        r#"{"hook_event_name":"Notification","notification_type":"permission_prompt"}"#,
    );
    let stop = build_cmd(port, r#"{"hook_event_name":"Stop"}"#);
    json!({
        "SessionStart": [{
            "hooks": [{ "type": "command", "command": session_start, "timeout": 5 }]
        }],
        "UserPromptSubmit": [{
            "hooks": [{ "type": "command", "command": user_prompt, "timeout": 5 }]
        }],
        "PreToolUse": [{
            "hooks": [{ "type": "command", "command": pre_tool, "async": true }]
        }],
        "PostToolUse": [{
            "hooks": [{ "type": "command", "command": post_tool, "async": true }]
        }],
        "PostToolUseFailure": [{
            "hooks": [{ "type": "command", "command": post_tool_fail, "async": true }]
        }],
        "PermissionRequest": [{
            "hooks": [{ "type": "command", "command": perm_request, "async": true }]
        }],
        "Notification": [{
            "matcher": "permission_prompt",
            "hooks": [{ "type": "command", "command": notification, "async": true }]
        }],
        "Stop": [{
            "hooks": [{ "type": "command", "command": stop, "async": true }]
        }]
    })
}

pub(super) fn install(port: u16) -> AgentHookToolStatus {
    let path = match settings_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let parent = path.parent().unwrap();
    if !parent.exists() {
        debug!("Claude Code config dir not found at {:?}, skipping", parent);
        return AgentHookToolStatus::not_detected();
    }

    let path_str = path.display().to_string();

    let mut settings: Value = if path.exists() {
        match std::fs::read_to_string(&path) {
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
                    // Remove any existing atmos hooks (old format or current)
                    arr.retain(|entry| !is_atmos_hook(entry));
                    // Add new format hooks
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
    let path = match settings_path() {
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
        Ok(()) => AgentHookToolStatus::detected_uninstalled(&path_str),
        Err(e) => AgentHookToolStatus::failed(&path_str, e),
    }
}

pub(super) fn check() -> AgentHookToolStatus {
    let path = match settings_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let parent = path.parent().unwrap();
    if !parent.exists() {
        return AgentHookToolStatus::not_detected();
    }

    let path_str = path.display().to_string();

    if !path.exists() {
        return AgentHookToolStatus::detected_uninstalled(path_str);
    }

    let settings: Value = match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| json!({})),
        Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
    };

    let installed_versions = settings
        .get("hooks")
        .and_then(|h| h.get("Stop"))
        .and_then(|arr| arr.as_array())
        .map(|arr| {
            arr.iter()
                .filter(|entry| is_atmos_hook(entry))
                .map(parse_hook_version_from_json)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    installed_status_from_versions(path_str, installed_versions)
}

fn write_json(path: &std::path::Path, value: &Value) -> std::result::Result<(), String> {
    let content = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}
